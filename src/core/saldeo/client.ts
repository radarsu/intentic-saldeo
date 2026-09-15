import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { at, parseXml, text, type XmlNode } from "./xml.ts";

// SaldeoSMART's Rest API-XML transport (spec 4.0.0): every request carries `username`, a unique `req_id` and `req_sig`,
// the MD5 of the URL-encoded, name-sorted parameters with the api token appended. Reads are GET; writes are POST with
// the request XML gzipped and base64'd into `command`. The server allows 20 requests a minute per user and one at a
// time, so every call goes through one queue.

export interface SaldeoCredentials {
    readonly username: string;
    readonly apiToken: string;
    readonly baseUrl: string;
}

export interface SaldeoClientOptions {
    readonly fetch?: typeof fetch;
    readonly now?: () => number;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly perMinute?: number;
    readonly requestId?: () => string;
}

export interface SaldeoClient {
    readonly get: (path: string, params?: Readonly<Record<string, string>>) => Promise<XmlNode>;
    readonly post: (path: string, params?: Readonly<Record<string, string>>, commandXml?: string) => Promise<XmlNode>;
}

export class SaldeoError extends Error {
    readonly code: string | undefined;
    readonly httpStatus: number | undefined;
    constructor(message: string, code?: string, httpStatus?: number) {
        super(message);
        this.name = "SaldeoError";
        this.code = code;
        this.httpStatus = httpStatus;
    }
}

// The spec's URL_ENCODING (appendix A): RFC 3986 except space → `+`, `*` kept, `~` → `%7E`, upper-case hex, UTF-8
// bytes. Both ends must agree byte for byte or every signature fails.
export const saldeoUrlEncode = (value: string): string =>
    encodeURIComponent(value)
        .replace(/[!'()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replaceAll("%20", "+")
        .replaceAll("%2A", "*")
        .replaceAll("~", "%7E");

// Sorted by parameter name, joined with no separator (`req_id=…username=…`), encoded whole, token appended, MD5 hex.
export const requestSignature = (params: Readonly<Record<string, string>>, apiToken: string): string => {
    const base = Object.keys(params)
        .toSorted()
        .map((key) => `${key}=${params[key] ?? ""}`)
        .join("");
    return createHash("md5")
        .update(saldeoUrlEncode(base) + apiToken)
        .digest("hex");
};

// Unique per user across every process that shares the token; the backend and an agent's MCP server may both be calling.
export const newRequestId = (): string => `${Date.now()}-${randomUUID().slice(0, 12)}`;

export const encodeCommand = (xml: string): string => gzipSync(Buffer.from(xml, "utf8")).toString("base64");

const DEFAULT_PER_MINUTE = 20;

export const createSaldeoClient = (credentials: SaldeoCredentials, options: SaldeoClientOptions = {}): SaldeoClient => {
    const fetchFn = options.fetch ?? fetch;
    const now = options.now ?? (() => Date.now());
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const perMinute = options.perMinute ?? DEFAULT_PER_MINUTE;
    const requestId = options.requestId ?? newRequestId;
    const base = credentials.baseUrl.replace(/\/+$/, "");
    const sent: number[] = [];
    let queue: Promise<unknown> = Promise.resolve();

    // One request at a time, and never more than `perMinute` in any sliding minute.
    const turn = async <T>(work: () => Promise<T>): Promise<T> => {
        const run = queue.then(async () => {
            while (sent.length >= perMinute) {
                const oldest = sent[0] ?? now();
                const wait = oldest + 60_000 - now();
                if (wait <= 0) {
                    sent.shift();
                    continue;
                }
                await sleep(wait);
            }
            sent.push(now());
            return work();
        });
        queue = run.catch(() => undefined);
        return run;
    };

    const answer = async (response: Response, operation: string): Promise<XmlNode> => {
        const body = await response.text();
        if (!response.ok) {
            throw new SaldeoError(`SaldeoSMART answered HTTP ${response.status} for ${operation}: ${body.slice(0, 300)}`, undefined, response.status);
        }
        let root: XmlNode;
        try {
            root = parseXml(body);
        } catch (error) {
            throw new SaldeoError(`SaldeoSMART's answer for ${operation} is not XML: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Some answers (the 3.0 id lists) carry no STATUS at all; only an explicit ERROR or an error code is a refusal.
        const status = text(root, "STATUS");
        const code = text(root, "ERROR_CODE");
        if ((status !== undefined && status !== "OK") || code !== undefined) {
            const message = text(root, "ERROR_MESSAGE") ?? `status ${status ?? "missing"}`;
            throw new SaldeoError(`SaldeoSMART refused ${operation}: ${message}${code === undefined ? "" : ` (code ${code})`}`, code, response.status);
        }
        return root;
    };

    const signed = (params: Readonly<Record<string, string>>): Record<string, string> => {
        const all = { ...params, username: credentials.username, req_id: requestId() };
        return { ...all, req_sig: requestSignature(all, credentials.apiToken) };
    };

    return {
        get: (path, params = {}) =>
            turn(async () => {
                const url = new URL(`${base}/${path.replace(/^\/+/, "")}`);
                for (const [key, value] of Object.entries(signed(params))) {
                    url.searchParams.set(key, value);
                }
                return answer(await fetchFn(url, { method: "GET", headers: { accept: "application/xml" } }), path);
            }),
        post: (path, params = {}, commandXml) =>
            turn(async () => {
                const url = `${base}/${path.replace(/^\/+/, "")}`;
                const form = new URLSearchParams(signed(commandXml === undefined ? params : { ...params, command: encodeCommand(commandXml) }));
                return answer(
                    await fetchFn(url, {
                        method: "POST",
                        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/xml" },
                        body: form.toString(),
                    }),
                    path,
                );
            }),
    };
};

// The metadata block every answer carries; handy for a status probe.
export const operationOf = (root: XmlNode): string | undefined => text(at(root, "METAINF"), "OPERATION");
