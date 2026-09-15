import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Session } from "../src/core/contract.ts";
import { createService } from "../src/core/service.ts";
import { fakeFetch, fakeServer, type FakeState } from "./helpers/fake-saldeo.ts";

/* The BUILT MCP binary, spawned the way the plugin's .mcp.json spawns it, against a fake SaldeoSMART on a real port. */

const BINARY = new URL(`../dist/bin/saldeo-mcp`, import.meta.url).pathname;

let root = "";
let fake: { server: Server; url: string };
const state: FakeState = { paid65: false, calls: [] };

const envFor = (over: Record<string, string> = {}): Record<string, string> => ({
    PATH: process.env["PATH"] ?? "",
    SALDEO_USERNAME_SALDEOSMART: "user",
    SALDEO_API_TOKEN_SALDEOSMART: "token",
    SALDEO_URL_SALDEOSMART: fake.url,
    SALDEO_COMPANY_SALDEOSMART: "abc.1",
    ...over,
});

const connect = async (env: Record<string, string>): Promise<Client> => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: BINARY, args: [], env, cwd: root, stderr: "pipe" }));
    return client;
};

const textOf = (result: Awaited<ReturnType<Client["callTool"]>>): string => {
    const content = result.content as { type: string; text?: string }[];
    return content.map((entry) => entry.text ?? "").join("");
};

before(async () => {
    root = await mkdtemp(join(tmpdir(), "saldeo-mcp-"));
    await mkdir(join(root, ".intentic"), { recursive: true });
    fake = await fakeServer(state);
});
after(async () => {
    fake.server.close();
    await rm(root, { recursive: true, force: true });
});

test("with no card in the environment only saldeo_status exists, and it says so", async () => {
    const client = await connect({ PATH: process.env["PATH"] ?? "" });
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.deepEqual(tools, ["saldeo_status"]);
    assert.match(textOf(await client.callTool({ name: "saldeo_status", arguments: {} })), /no card is connected, or the persona withholds it/);
    await client.close();
});

test("the card's switches decide which tools exist", async () => {
    const client = await connect(envFor({ SALDEO_SCOPE_PROPOSE_SALDEOSMART: "off", SALDEO_SCOPE_BANK_SALDEOSMART: "off" }));
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.deepEqual(tools, ["saldeo_status", "saldeo_companies", "saldeo_contractors", "saldeo_invoices", "saldeo_documents"]);
    await client.close();
});

test("reads reach SaldeoSMART over the URL the card holds, and proposals land in the shared session file", async () => {
    // A session created by the backend's half, as the owner would have: the binary must find it in the same records.
    const service = createService({ workspaceRoot: root, connection: () => Promise.resolve({ account: "saldeosmart", credentials: { username: "user", apiToken: "token", baseUrl: fake.url }, scopes: { documents: true, invoices: true, bankStatements: true, propose: true } }), clientOptions: { fetch: fakeFetch(state), perMinute: 10_000 } });
    const imported = await service.importFile("saldeosmart", "abc.1", "w.csv", new TextEncoder().encode(`Data;Kwota;Tytuł;Nadawca\n2026-08-03;1 230,00;zaplata;ACME SP. Z O.O.\n`));
    const mapping = imported.mapping;
    assert.ok(mapping);
    const { session } = await service.applyMapping("saldeosmart", imported.id, mapping);
    assert.equal(session.items[0]?.verdict, "ambiguous");

    const client = await connect(envFor());
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(tools.includes("saldeo_propose") && tools.includes("saldeo_record_marking") && tools.includes("saldeo_bank_statements"));

    const status = JSON.parse(textOf(await client.callTool({ name: "saldeo_status", arguments: {} }))) as { reachable: boolean; company: string }[];
    assert.equal(status[0]?.reachable, true);
    assert.equal(status[0]?.company, "abc.1");

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
