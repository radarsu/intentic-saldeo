import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { ExtensionServerApi } from "@intentic/extension-api";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Session } from "../src/core/contract.ts";
import { createService } from "../src/core/service.ts";
import { activateServer } from "../src/server/server.ts";
import { fakeFetch, type FakeState } from "./helpers/fake-saldeo.ts";

/* The MCP tools as the daemon reaches them: Streamable HTTP into the backend's `mcp/<card>` route, the card read
   through a fake daemon, against a fake SaldeoSMART. */

const BASE = "https://saldeo.test";

let root = "";
let handler: (request: Request) => Promise<Response | undefined>;
const state: FakeState = { paid65: false, calls: [] };

const card = (id: string, switches: Record<string, string> = {}) => ({
    id,
    kind: "cli",
    config: { provider: "saldeosmart", username: "user", apiToken: "token", baseUrl: BASE, company: "abc.1", documents: "on", invoices: "on", bankStatements: "on", propose: "on", ...switches },
});

before(async () => {
    root = await mkdtemp(join(tmpdir(), "saldeo-mcp-"));
    const connections: Record<string, unknown> = {
        saldeosmart: card("saldeosmart"),
        narrow: card("narrow", { propose: "off", bankStatements: "off" }),
    };
    const api: ExtensionServerApi = {
        apiVersion: "2.14.0",
        workspaceRoot: root,
        extensionDir: root,
        log: () => {},
        routes: {
            mount: (mounted) => {
                handler = mounted;
            },
        },
        daemon: {
            request: () => Promise.reject(new Error("unused")),
            json: async <T>(path: string): Promise<T> => {
                const id = /^\/capabilities\/([^/]+)\/connection$/.exec(path)?.[1];
                const connection = id === undefined ? undefined : connections[decodeURIComponent(id)];
                if (connection === undefined) {
                    throw new Error(`daemon answered 404 for GET ${path}`);
                }
                return connection as T;
            },
        },
    };
    activateServer(api, { extensionId: "intentic.saldeo" }, { clientOptions: { fetch: fakeFetch(state), perMinute: 10_000 } });
});
after(async () => {
    await rm(root, { recursive: true, force: true });
});

// Straight into the mounted handler, the way the backend host hands it a request the daemon forwarded.
const inProcess: typeof fetch = async (input, init) => (await handler(new Request(input, init))) ?? new Response("not found", { status: 404 });

const connect = async (account: string): Promise<Client> => {
    const client = new Client({ name: "test", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://extension.internal/mcp/${account}`), { fetch: inProcess });
    // The SDK's own classes disagree under exactOptionalPropertyTypes (`sessionId?: string` vs `string | undefined`).
    await client.connect(transport as Parameters<Client["connect"]>[0]);
    return client;
};

const textOf = (result: Awaited<ReturnType<Client["callTool"]>>): string => {
    const content = result.content as { type: string; text?: string }[];
    return content.map((entry) => entry.text ?? "").join("");
};

test("a card that is not connected has no MCP endpoint", async () => {
    await assert.rejects(connect("missing"));
});

test("the card's switches decide which tools exist", async () => {
    const client = await connect("narrow");
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.deepEqual(tools, ["saldeo_status", "saldeo_companies", "saldeo_contractors", "saldeo_invoices", "saldeo_documents"]);
    await client.close();
});

test("reads reach SaldeoSMART over the URL the card holds, and proposals land in the shared session file", async () => {
    // A session created by the view's half, as the owner would have: the tools must find it in the same records.
    const service = createService({
        workspaceRoot: root,
        connection: () => Promise.resolve({ account: "saldeosmart", credentials: { username: "user", apiToken: "token", baseUrl: BASE }, scopes: { documents: true, invoices: true, bankStatements: true, propose: true } }),
        clientOptions: { fetch: fakeFetch(state), perMinute: 10_000 },
    });
    const imported = await service.importFile("saldeosmart", "abc.1", "w.csv", new TextEncoder().encode(`Data;Kwota;Tytuł;Nadawca\n2026-08-03;1 230,00;zaplata;ACME SP. Z O.O.\n`));
    const mapping = imported.mapping;
    assert.ok(mapping);
    const { session } = await service.applyMapping("saldeosmart", imported.id, mapping);
    assert.equal(session.items[0]?.verdict, "ambiguous");

    const client = await connect("saldeosmart");
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(tools.includes("saldeo_propose") && tools.includes("saldeo_record_marking") && tools.includes("saldeo_bank_statements"));

    const status = JSON.parse(textOf(await client.callTool({ name: "saldeo_status", arguments: {} }))) as { reachable: boolean; company: string };
    assert.equal(status.reachable, true);
    assert.equal(status.company, "abc.1");

    const invoices = JSON.parse(textOf(await client.callTool({ name: "saldeo_invoices", arguments: { months: 2 } }))) as { id: string; remainingFormatted: string }[];
    assert.deepEqual(
        invoices.map((invoice) => invoice.id).sort(),
        ["document:65", "invoice:112", "invoice:12", "invoice:13"],
    );
    assert.equal(invoices.find((invoice) => invoice.id === "document:65")?.remainingFormatted, "492,00 PLN");

    const found = JSON.parse(textOf(await client.callTool({ name: "saldeo_documents", arguments: { number: "FV/101/2016" } }))) as { number: string }[];
    assert.deepEqual(found.map((document) => document.number), ["FV/101/2016"]);

    const view = JSON.parse(textOf(await client.callTool({ name: "saldeo_session", arguments: { session: session.id } }))) as { items: { transaction: { id: string }; proposals: unknown[] }[]; pool: unknown[] };
    assert.equal(view.items.length, 1);
    assert.equal(view.items[0]?.proposals.length, 2);
    assert.equal(view.pool.length, 4);

    const transactionId = view.items[0]?.transaction.id ?? "";
    const proposed = await client.callTool({
        name: "saldeo_propose",
        arguments: { session: session.id, transactionId, invoices: [{ invoiceId: "invoice:12", amount: 123_000 }], reasons: ["the customer's e-mail names FV/12/2026"], confidence: 90 },
    });
    assert.notEqual(proposed.isError, true, textOf(proposed));
    const stored = JSON.parse(await readFile(join(root, ".intentic", "records", "saldeo", "saldeosmart", "sessions", `${session.id}.json`), "utf8")) as Session;
    assert.equal(stored.items[0]?.proposals[0]?.by, "agent");
    assert.equal(stored.items[0]?.proposals[0]?.score, 90);
    assert.equal(stored.items[0]?.decision, undefined, "a proposal is not a decision");

    // Recording a marking needs a confirmed item; the tool says so rather than inventing one.
    const refused = await client.callTool({ name: "saldeo_record_marking", arguments: { session: session.id, transactionId, status: "ok" } });
    assert.equal(refused.isError, true);
    assert.match(textOf(refused), /not confirmed/);

    const bad = await client.callTool({ name: "saldeo_propose", arguments: { session: session.id, transactionId, invoices: [{ invoiceId: "invoice:999", amount: 1 }], reasons: ["x"] } });
    assert.equal(bad.isError, true);
    assert.match(textOf(bad), /not in this session's pool/);
    await client.close();
});
