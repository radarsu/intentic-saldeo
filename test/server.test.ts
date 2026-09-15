import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { ExtensionServerApi } from "@intentic/extension-api";
import type { Session } from "../src/core/contract.ts";
import { activateServer, connectionReader } from "../src/server/server.ts";
import { NotFound } from "../src/core/service.ts";
import { fakeFetch, type FakeState } from "./helpers/fake-saldeo.ts";

/* The whole backend against a fake SaldeoSMART and a fake daemon: import → mapping → match → decide → agent → mark → verify. */

const CSV = `Data operacji;Kwota;Tytuł;Nadawca/Odbiorca;Numer konta
2026-08-03;1 230,00;zapłata;ACME SP. Z O.O.;
2026-08-05;-492,00;FV/101/2016;BORACLE POLSKA SP Z OO;11 6167 0874 5332 7412 7700 0000
2026-08-07;-25,00;OPŁATA ZA PROWADZENIE RACHUNKU;;
2026-08-09;99,00;cośtam;;
`;

let root = "";
let handler: (request: Request) => Promise<Response | undefined>;
const state: FakeState = { paid65: false, calls: [] };
const agentStarts: Record<string, unknown>[] = [];
const logs: string[] = [];

before(async () => {
    root = await mkdtemp(join(tmpdir(), "saldeo-server-"));
    const connections: Record<string, unknown> = {
        saldeosmart: {
            id: "saldeosmart",
            kind: "cli",
            config: { provider: "saldeosmart", username: "user", apiToken: "token", baseUrl: "https://saldeo.test", documents: "on", invoices: "on", bankStatements: "on", propose: "on" },
        },
        "saldeosmart-web": { id: "saldeosmart-web", kind: "browser", config: { platform: "saldeosmart-web" } },
        reddit: { id: "reddit", kind: "browser", config: { platform: "reddit" } },
    };
    const api: ExtensionServerApi = {
        apiVersion: "2.14.0",
        workspaceRoot: root,
        extensionDir: root,
        log: (message) => logs.push(message),
        routes: {
            mount: (mounted) => {
                handler = mounted;
            },
        },
        daemon: {
            request: () => Promise.reject(new Error("unused")),
            json: async <T>(path: string, init?: RequestInit): Promise<T> => {
                if (path === "/agent" && init?.method === "POST") {
                    agentStarts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
                    return {} as T;
                }
                const id = /^\/capabilities\/([^/]+)\/connection$/.exec(path)?.[1];
                const connection = id === undefined ? undefined : connections[decodeURIComponent(id)];
                if (connection === undefined) {
                    throw new Error(`daemon answered 404 for GET ${path}`);
                }
                return connection as T;
            },
        },
    };
    // The fake answers instantly; the real limiter (20 a minute) would make this file wait a minute per twenty calls.
    activateServer(api, { extensionId: "intentic.saldeo" }, { clientOptions: { fetch: fakeFetch(state), perMinute: 10_000 } });
});
after(async () => {
    await rm(root, { recursive: true, force: true });
});

const call = async <T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> => {
    const response = await handler(
        new Request(`http://extension.internal${path}`, {
            method,
            ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
        }),
    );
    assert.ok(response, `${method} ${path} is not a route`);
    return { status: response.status, body: (await response.json()) as T };
};

let sessionId = "";

test("status reads the card through the daemon and probes company.list", async () => {
    const { status, body } = await call<{ reachable: boolean; detail: string; scopes: { propose: boolean } }>("GET", "/accounts/saldeosmart/status");
    assert.equal(status, 200);
    assert.equal(body.reachable, true);
    assert.equal(body.detail, "1 company visible");
    assert.equal(body.scopes.propose, true);
    const missing = await call<{ error: string }>("GET", "/accounts/nobody/status");
    assert.equal(missing.status, 404);
    assert.match(missing.body.error, /no SaldeoSMART connection "nobody"/);
});

test("import proposes a mapping; applying it builds transactions and matches them against the open pool", async () => {
    const created = await call<{ session: Session }>("POST", "/accounts/saldeosmart/sessions", {
        company: "abc.1",
        name: "wyciag.csv",
        content: Buffer.from(CSV, "utf8").toString("base64"),
    });
    assert.equal(created.status, 201);
    sessionId = created.body.session.id;
    assert.deepEqual(created.body.session.mapping, {
        date: "Data operacji",
        amount: "Kwota",
        title: "Tytuł",
        counterparty: "Nadawca/Odbiorca",
        account: "Numer konta",
        defaultCurrency: "PLN",
    });
    const mapped = await call<{ session: Session; skipped: unknown[] }>("PUT", `/accounts/saldeosmart/sessions/${sessionId}/mapping`, { mapping: created.body.session.mapping });
    assert.equal(mapped.status, 200);
    assert.deepEqual(mapped.body.skipped, []);
    const { session } = mapped.body;
    assert.equal(session.transactions.length, 4);
    // The pool holds the three issued invoices and the cost document; the paid flag on none.
    assert.deepEqual(
        session.invoices.map((invoice) => invoice.id).sort(),
        ["document:65", "invoice:112", "invoice:12", "invoice:13"],
    );
    assert.deepEqual(
        session.items.map((item) => item.verdict),
        ["ambiguous", "confident", "ignored", "unmatched"],
    );
    assert.equal(session.items[1]?.proposals[0]?.invoices[0]?.invoiceId, "document:65");
    const summaries = await call<{ sessions: { id: string; counts: { awaiting: number } }[] }>("GET", "/accounts/saldeosmart/sessions");
    assert.equal(summaries.body.sessions[0]?.id, sessionId);
    assert.equal(summaries.body.sessions[0]?.counts.awaiting, 2);
});

test("asking the agent starts an isolated, unattended turn that names the session and the tools", async () => {
    const asked = await call<{ conversationId: string; items: number }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/ask-agent`, { pick: { agent: "anthropic", model: "claude-x" } });
    assert.equal(asked.status, 200);
    assert.equal(asked.body.items, 2);
    assert.match(asked.body.conversationId, /^saldeo-resolve-[a-z0-9-]+$/);
    const start = agentStarts[0];
    assert.ok(start);
    assert.equal(start["conversationId"], asked.body.conversationId);
    assert.equal(start["isolated"], true);
    assert.equal(start["unattended"], true);
    assert.equal(start["runRole"], "saldeo-reconcile");
    assert.equal(start["agent"], "anthropic");
    assert.equal(start["model"], "claude-x");
    assert.match(String(start["prompt"]), /saldeo_session/);
    assert.match(String(start["prompt"]), new RegExp(sessionId));
    assert.match(String(start["prompt"]), /never confirm/);
    const { body } = await call<{ session: Session }>("GET", `/accounts/saldeosmart/sessions/${sessionId}`);
    assert.deepEqual(body.session.agentRuns.map((run) => run.kind), ["resolve"]);
});

test("decisions: confirm-all takes the confident ones, an explicit pick settles the ambiguous one, the ledger mirrors both", async () => {
    const all = await call<{ session: Session }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/decide-all`, { verdict: "confident" });
    assert.equal(all.status, 200);
    assert.deepEqual(
        all.body.session.items.map((item) => item.decision?.status),
        [undefined, "confirmed", undefined, undefined],
    );
    const t1 = all.body.session.transactions[0]?.id ?? "";
    const picked = await call<{ session: Session }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/decide`, {
        transactionId: t1,
        status: "confirmed",
        invoices: [{ invoiceId: "invoice:12", amount: 123_000 }],
        note: "customer said so",
    });
    assert.equal(picked.status, 200);
    assert.equal(picked.body.session.items[0]?.decision?.note, "customer said so");
    const bad = await call<{ error: string }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/decide`, {
        transactionId: t1,
        status: "confirmed",
        invoices: [{ invoiceId: "invoice:999", amount: 1 }],
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /not in this session's pool/);
    const ledger = await call<{ ledger: { entries: { id: string; invoices: { number: string }[] }[] } }>("GET", "/accounts/saldeosmart/ledger");
    assert.deepEqual(
        ledger.body.ledger.entries.map((entry) => entry.invoices.map((invoice) => invoice.number)).sort(),
        [["FV/101/2016"], ["FV/12/2026"]],
    );
});

test("a decision can be taken back: cleared removes it and leaves the row undecided", async () => {
    const before = await call<{ session: Session }>("GET", `/accounts/saldeosmart/sessions/${sessionId}`);
    const t4 = before.body.session.transactions[3]?.id ?? "";
    const skipped = await call<{ session: Session }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/decide`, { transactionId: t4, status: "skipped" });
    assert.equal(skipped.body.session.items[3]?.decision?.status, "skipped");
    const cleared = await call<{ session: Session }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/decide`, { transactionId: t4, status: "cleared" });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.session.items[3]?.decision, undefined);
    assert.equal(cleared.body.session.items[3]?.verdict, "unmatched");
});

test("marking goes through a SaldeoSMART (web) browser account and nothing else; the agent records the outcome", async () => {
    const refused = await call<{ error: string }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/mark`, { browserAccount: "reddit" });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /not a connected SaldeoSMART \(web\) browser account/);
    const marked = await call<{ conversationId: string; items: number }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/mark`, { browserAccount: "saldeosmart-web" });
    assert.equal(marked.status, 200);
    assert.equal(marked.body.items, 2);
    const start = agentStarts[1];
    assert.ok(start);
    assert.match(String(start["prompt"]), /FV\/101\/2016/);
    assert.match(String(start["prompt"]), /saldeo_record_marking/);
    assert.match(String(start["prompt"]), /"saldeosmart-web"/);
    const pending = await call<{ session: Session }>("GET", `/accounts/saldeosmart/sessions/${sessionId}`);
    assert.deepEqual(
        pending.body.session.items.map((item) => item.marking?.status),
        ["pending", "pending", undefined, undefined],
    );
    const t2 = pending.body.session.transactions[1]?.id ?? "";
    const recorded = await call<{ session: Session }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/record-marking`, {
        transactionId: t2,
        status: "ok",
        note: "linked on the transactions list",
        conversationId: marked.body.conversationId,
    });
    assert.equal(recorded.body.session.items[1]?.marking?.status, "ok");
    const ledger = await call<{ ledger: { entries: { marking?: { status: string } }[] } }>("GET", "/accounts/saldeosmart/ledger");
    assert.ok(ledger.body.ledger.entries.some((entry) => entry.marking?.status === "ok"));
});

test("verify re-reads Saldeo: the cost document now paid there is verified, the sales invoice not yet", async () => {
    state.paid65 = true;
    const verified = await call<{ session: Session }>("POST", `/accounts/saldeosmart/sessions/${sessionId}/verify`);
    assert.equal(verified.status, 200);
    assert.deepEqual(
        verified.body.session.items.map((item) => item.verification?.paidInSaldeo),
        [false, true, undefined, undefined],
    );
});

test("statements and invoices routes answer from Saldeo; delete removes the session and its ledger entries", async () => {
    const statements = await call<{ statements: { operations: unknown[] }[] }>("GET", "/accounts/saldeosmart/statements?company=abc.1");
    assert.equal(statements.body.statements[0]?.operations.length, 1);
    const invoices = await call<{ invoices: { id: string }[] }>("GET", "/accounts/saldeosmart/invoices?company=abc.1&months=2");
    assert.deepEqual(
        invoices.body.invoices.map((invoice) => invoice.id).sort(),
        ["invoice:112", "invoice:12", "invoice:13"],
    );
    const deleted = await call<{ ok: boolean }>("DELETE", `/accounts/saldeosmart/sessions/${sessionId}`);
    assert.equal(deleted.body.ok, true);
    const ledger = await call<{ ledger: { entries: unknown[] } }>("GET", "/accounts/saldeosmart/ledger");
    assert.deepEqual(ledger.body.ledger.entries, []);
    assert.equal((await handler(new Request("http://extension.internal/nothing"))), undefined);
    assert.deepEqual(logs, []);
});

test("connectionReader caches for a minute and refuses a card that is not SaldeoSMART", async () => {
    let reads = 0;
    let clock = 0;
    const reader = connectionReader(
        async (id) => {
            reads += 1;
            return id === "other"
                ? { id, kind: "cli", config: { provider: "github", token: "x" } }
                : { id, kind: "cli", config: { provider: "saldeosmart", username: "u", apiToken: "t", documents: "off" } };
        },
        () => clock,
    );
    const first = await reader("saldeosmart");
    assert.equal(first.credentials.baseUrl, "https://saldeo.brainshare.pl");
    assert.equal(first.scopes.documents, false);
    await reader("saldeosmart");
    assert.equal(reads, 1);
    clock = 61_000;
    await reader("saldeosmart");
    assert.equal(reads, 2);
    await assert.rejects(reader("other"), NotFound);
});
