import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { ExtensionServerApi } from "@intentic/extension-api";
import type { Session } from "../src/core/contract.ts";
import { createService } from "../src/core/service.ts";
import { activateServer } from "../src/server/server.ts";
import type { ToolCard, ToolDefinition, ToolResult, ToolsApi } from "../src/server/tools-api.ts";
import { fakeFetch, type FakeState } from "./helpers/fake-saldeo.ts";

/* The agent's tools as the host reaches them: what `api.tools.serve` answers for the card the daemon handed, called the
   way the host calls them, against a fake SaldeoSMART. The host's own MCP transport is the daemon's to test. */

const BASE = "https://saldeo.test";

let root = "";
let served: Parameters<ToolsApi["serve"]>[0];
const state: FakeState = { paid65: false, calls: [] };

const card = (id: string, switches: Record<string, string> = {}) => ({
    id,
    kind: "cli",
    config: { provider: "saldeosmart", username: "user", apiToken: "token", baseUrl: BASE, company: "abc.1", documents: "on", invoices: "on", bankStatements: "on", propose: "on", ...switches },
});

before(async () => {
    root = await mkdtemp(join(tmpdir(), "saldeo-mcp-"));
    const api: ExtensionServerApi & { tools: ToolsApi } = {
        apiVersion: "2.14.0",
        workspaceRoot: root,
        extensionDir: root,
        log: () => {},
        routes: { mount: () => {} },
        tools: {
            serve: (tools) => {
                served = tools;
            },
        },
        // The tools never read the card back: the host hands it with every call.
        daemon: {
            request: () => Promise.reject(new Error("unused")),
            json: () => Promise.reject(new Error("the tools read the card the host handed, never the daemon")),
        },
    };
    activateServer(api, { extensionId: "intentic.saldeo" }, { clientOptions: { fetch: fakeFetch(state), perMinute: 10_000 } });
});
after(async () => {
    await rm(root, { recursive: true, force: true });
});

// What the host would list for a card, and a call as the host would make it.
const toolsFor = async (id: string, switches: Record<string, string> = {}): Promise<readonly ToolDefinition[]> =>
    served({ id, config: card(id, switches).config } satisfies ToolCard);

const call = async (tools: readonly ToolDefinition[], name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const tool = tools.find((entry) => entry.name === name);
    assert.ok(tool, `no tool ${name}`);
    return (await tool.call(args, { signal: new AbortController().signal })) as ToolResult;
};

const textOf = (result: ToolResult): string => result.content.map((entry) => (entry.type === "text" ? entry.text : "")).join("");

test("a card that is not a SaldeoSMART API card gets no tools", async () => {
    await assert.rejects(async () => served({ id: "github", config: { provider: "github", token: "x" } }));
    assert.deepEqual(await served(undefined), []);
});

test("the card's switches decide which tools exist", async () => {
    const tools = (await toolsFor("narrow", { propose: "off", bankStatements: "off" })).map((tool) => tool.name);
    assert.deepEqual(tools, ["saldeo_status", "saldeo_companies", "saldeo_contractors", "saldeo_invoices", "saldeo_documents"]);
    // Each is described to the model by a JSON Schema of its arguments.
    const invoices = (await toolsFor("narrow")).find((tool) => tool.name === "saldeo_invoices");
    assert.equal((invoices?.inputSchema as { type?: string }).type, "object");
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

    const client = await toolsFor("saldeosmart");
    const tools = client.map((tool) => tool.name);
    assert.ok(tools.includes("saldeo_propose") && tools.includes("saldeo_record_marking") && tools.includes("saldeo_bank_statements"));

    const status = JSON.parse(textOf(await call(client, "saldeo_status", {}))) as { reachable: boolean; company: string };
    assert.equal(status.reachable, true);
    assert.equal(status.company, "abc.1");

    const invoices = JSON.parse(textOf(await call(client, "saldeo_invoices", { months: 2 }))) as { id: string; remainingFormatted: string }[];
    assert.deepEqual(
        invoices.map((invoice) => invoice.id).sort(),
        ["document:65", "invoice:112", "invoice:12", "invoice:13"],
    );
    assert.equal(invoices.find((invoice) => invoice.id === "document:65")?.remainingFormatted, "492,00 PLN");

    const found = JSON.parse(textOf(await call(client, "saldeo_documents", { number: "FV/101/2016" }))) as { number: string }[];
    assert.deepEqual(found.map((document) => document.number), ["FV/101/2016"]);

    const view = JSON.parse(textOf(await call(client, "saldeo_session", { session: session.id }))) as { items: { transaction: { id: string }; proposals: unknown[] }[]; pool: unknown[] };
    assert.equal(view.items.length, 1);
    assert.equal(view.items[0]?.proposals.length, 2);
    assert.equal(view.pool.length, 4);

    const transactionId = view.items[0]?.transaction.id ?? "";
    const proposed = await call(client, "saldeo_propose", {
        session: session.id,
        transactionId,
        invoices: [{ invoiceId: "invoice:12", amount: 123_000 }],
        reasons: ["the customer's e-mail names FV/12/2026"],
        confidence: 90,
    });
    assert.notEqual(proposed.isError, true, textOf(proposed));
    const stored = JSON.parse(await readFile(join(root, ".intentic", "records", "saldeo", "saldeosmart", "sessions", `${session.id}.json`), "utf8")) as Session;
    assert.equal(stored.items[0]?.proposals[0]?.by, "agent");
    assert.equal(stored.items[0]?.proposals[0]?.score, 90);
    assert.equal(stored.items[0]?.decision, undefined, "a proposal is not a decision");

    // Recording a marking needs a confirmed item; the tool says so rather than inventing one.
    const refused = await call(client, "saldeo_record_marking", { session: session.id, transactionId, status: "ok" });
    assert.equal(refused.isError, true);
    assert.match(textOf(refused), /not confirmed/);

    const bad = await call(client, "saldeo_propose", { session: session.id, transactionId, invoices: [{ invoiceId: "invoice:999", amount: 1 }], reasons: ["x"] });
    assert.equal(bad.isError, true);
    assert.match(textOf(bad), /not in this session's pool/);
});
