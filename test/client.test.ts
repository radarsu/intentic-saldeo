import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { createSaldeoClient, encodeCommand, requestSignature, SaldeoError, saldeoUrlEncode } from "../src/core/saldeo/client.ts";

/* The signature, against the worked example in the spec (Rest API-XML 4.0.0, "Przykłady"). */
test("req_sig reproduces the spec's worked example", () => {
    assert.equal(requestSignature({ username: "user", req_id: "request-id" }, "token"), "d73710fdff6acc96361f5b9cb3425cee");
});

test("URL_ENCODING follows appendix A: space is +, * survives, ~ is %7E, hex is upper-case UTF-8", () => {
    assert.equal(saldeoUrlEncode("a b*~=Ł"), "a+b*%7E%3D%C5%81");
});

test("the command parameter is the request XML gzipped and base64'd", () => {
    const xml = `<ROOT><COMPANIES><COMPANY>1</COMPANY></COMPANIES></ROOT>`;
    assert.equal(gunzipSync(Buffer.from(encodeCommand(xml), "base64")).toString("utf8"), xml);
});

const ok = (body: string): Response => new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

const capture = () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchFn = ((url: string | URL, init?: RequestInit) => {
        calls.push({ url: url.toString(), init });
        return Promise.resolve(ok(`<RESPONSE><STATUS>OK</STATUS><COMPANIES/></RESPONSE>`));
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
};

test("GET carries username, req_id and a signature over every parameter", async () => {
    const { calls, fetchFn } = capture();
    const client = createSaldeoClient({ username: "user", apiToken: "token", baseUrl: "https://saldeo.example/" }, { fetch: fetchFn, requestId: () => "request-id" });
    await client.get("api/xml/1.0/company/list");
    const url = new URL(calls[0]?.url ?? "");
    assert.equal(url.origin + url.pathname, "https://saldeo.example/api/xml/1.0/company/list");
    assert.equal(url.searchParams.get("username"), "user");
    assert.equal(url.searchParams.get("req_id"), "request-id");
    assert.equal(url.searchParams.get("req_sig"), "d73710fdff6acc96361f5b9cb3425cee");
});

test("POST signs the command too, and sends everything as a form body", async () => {
    const { calls, fetchFn } = capture();
    const client = createSaldeoClient({ username: "u", apiToken: "t", baseUrl: "https://saldeo.example" }, { fetch: fetchFn, requestId: () => "1" });
    await client.post("api/xml/3.0/invoice/getidlist", { company_program_id: "abc" }, `<ROOT/>`);
    const body = new URLSearchParams(String(calls[0]?.init?.body));
    const command = body.get("command") ?? "";
    assert.equal(gunzipSync(Buffer.from(command, "base64")).toString("utf8"), `<ROOT/>`);
    assert.equal(body.get("req_sig"), requestSignature({ company_program_id: "abc", command, username: "u", req_id: "1" }, "t"));
    assert.equal(calls[0]?.init?.method, "POST");
});

test("an ERROR answer becomes a SaldeoError carrying the code", async () => {
    const fetchFn = (() => Promise.resolve(ok(`<RESPONSE><STATUS>ERROR</STATUS><ERROR_CODE>4301</ERROR_CODE><ERROR_MESSAGE>Not unique 'req_id'</ERROR_MESSAGE></RESPONSE>`))) as unknown as typeof fetch;
    const client = createSaldeoClient({ username: "u", apiToken: "t", baseUrl: "https://x" }, { fetch: fetchFn });
    await assert.rejects(client.get("api/xml/1.0/company/list"), (error: unknown) => error instanceof SaldeoError && error.code === "4301" && /Not unique/.test(error.message));
});

test("an answer without STATUS (the 3.0 id lists) is accepted; an HTTP failure is not", async () => {
    let status = 200;
    const fetchFn = (() => Promise.resolve(new Response(status === 200 ? `<ROOT><INVOICES><INVOICE_ID>1</INVOICE_ID></INVOICES></ROOT>` : `nope`, { status }))) as unknown as typeof fetch;
    const client = createSaldeoClient({ username: "u", apiToken: "t", baseUrl: "https://x" }, { fetch: fetchFn });
    const root = await client.post("api/xml/3.0/invoice/getidlist", {}, `<ROOT/>`);
    assert.equal(root.name, "ROOT");
    status = 503;
    await assert.rejects(client.get("api/xml/1.0/company/list"), (error: unknown) => error instanceof SaldeoError && error.httpStatus === 503);
});

test("requests go one at a time and never more than the per-minute allowance", async () => {
    let clock = 0;
    const started: number[] = [];
    let inFlight = 0;
    let overlapped = false;
    const fetchFn = (async () => {
        inFlight += 1;
        overlapped = overlapped || inFlight > 1;
        started.push(clock);
        await Promise.resolve();
        inFlight -= 1;
        return ok(`<RESPONSE><STATUS>OK</STATUS></RESPONSE>`);
    }) as unknown as typeof fetch;
    const client = createSaldeoClient(
        { username: "u", apiToken: "t", baseUrl: "https://x" },
        {
            fetch: fetchFn,
            perMinute: 3,
            now: () => clock,
            sleep: (ms) => {
                clock += ms;
                return Promise.resolve();
            },
        },
    );
    await Promise.all([1, 2, 3, 4, 5].map(() => client.get("api/xml/1.0/company/list")));
    assert.equal(overlapped, false);
    // Three fit in the first minute; the fourth waits for the first to age out, the fifth for the second.
    assert.deepEqual(started, [0, 0, 0, 60_000, 60_000]);
});
