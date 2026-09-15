import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Session } from "../src/core/contract.ts";
import {
    countsOf,
    deleteSession,
    ledgerEntryId,
    listSessions,
    newSessionId,
    readLedger,
    readSession,
    sessionPath,
    StoreConflict,
    updateLedger,
    updateSession,
    upsertLedgerEntries,
    writeSession,
} from "../src/core/store/store.ts";

let root = "";
before(async () => {
    root = await mkdtemp(join(tmpdir(), "saldeo-store-"));
});
after(async () => {
    await rm(root, { recursive: true, force: true });
});

const session = (id: string, over: Partial<Session> = {}): Session => ({
    id,
    account: "saldeosmart",
    company: "abc.1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    version: 0,
    file: { name: "x.csv", bytes: 1, encoding: "utf-8", delimiter: ";", headerRow: 0, columns: ["a"], rows: 1 },
    rows: [],
    transactions: [],
    invoices: [],
    items: [],
    agentRuns: [],
    ...over,
});

test("a session id is a date and a random tail, and only safe segments reach the disk", () => {
    assert.match(newSessionId(new Date("2026-08-03T00:00:00Z")), /^20260803-[0-9a-f]{6}$/);
    assert.throws(() => sessionPath(root, "../x", "a"), /not a safe path segment/);
    assert.throws(() => sessionPath(root, "ok", "a/../b"), /not a safe path segment/);
});

test("write, read back, list newest first, delete", async () => {
    const first = await writeSession(root, session("20260801-aaaaaa"), new Date("2026-08-01T11:00:00Z"));
    assert.equal(first.version, 1);
    assert.equal(first.updatedAt, "2026-08-01T11:00:00.000Z");
    await writeSession(root, session("20260802-bbbbbb", { createdAt: "2026-08-02T10:00:00.000Z" }));
    assert.deepEqual((await readSession(root, "saldeosmart", "20260801-aaaaaa"))?.version, 1);
    assert.deepEqual(
        (await listSessions(root, "saldeosmart")).map((summary) => summary.id),
        ["20260802-bbbbbb", "20260801-aaaaaa"],
    );
    assert.deepEqual(await listSessions(root, "nobody"), []);
    await deleteSession(root, "saldeosmart", "20260802-bbbbbb");
    assert.equal(await readSession(root, "saldeosmart", "20260802-bbbbbb"), undefined);
    // The file is pretty JSON with a trailing newline, readable by a person and by `git diff`.
    assert.match(await readFile(sessionPath(root, "saldeosmart", "20260801-aaaaaa"), "utf8"), /^\{\n {2}"id"/);
});

test("a stale writer is refused; updateSession re-reads and retries", async () => {
    const stored = await writeSession(root, session("20260803-cccccc"));
    await assert.rejects(writeSession(root, session("20260803-cccccc")), StoreConflict);
    const next = await writeSession(root, { ...stored, company: "abc.2" });
    assert.equal(next.version, 2);
    const edited = await updateSession(root, "saldeosmart", "20260803-cccccc", (current) => ({ ...current, company: `${current.company}!` }));
    assert.equal(edited.company, "abc.2!");
    assert.equal(edited.version, 3);
    await assert.rejects(updateSession(root, "saldeosmart", "missing", (current) => current), /no session missing/);
});

test("counts: undecided items by verdict, decided ones by decision, awaiting = undecided with a proposal", () => {
    const counts = countsOf(
        session("x", {
            transactions: [1, 2, 3, 4, 5].map((n) => ({ id: `t${n}`, row: n, date: "2026-08-01", amount: 1, currency: "PLN", title: "" })),
            items: [
                { transactionId: "t1", verdict: "confident", proposals: [{ invoices: [], score: 90, reasons: [], by: "matcher" }] },
                { transactionId: "t2", verdict: "ambiguous", proposals: [{ invoices: [], score: 60, reasons: [], by: "agent" }] },
                { transactionId: "t3", verdict: "unmatched", proposals: [] },
                { transactionId: "t4", verdict: "ignored", proposals: [] },
                {
                    transactionId: "t5",
                    verdict: "confident",
                    proposals: [],
                    decision: { status: "confirmed", invoices: [], at: "2026-08-01T00:00:00Z" },
                    marking: { status: "ok", at: "2026-08-01T00:00:00Z" },
                },
            ],
        }),
    );
    assert.deepEqual(counts, {
        transactions: 5,
        confident: 1,
        ambiguous: 1,
        unmatched: 1,
        ignored: 1,
        proposedByAgent: 1,
        confirmed: 1,
        rejected: 0,
        skipped: 0,
        marked: 1,
        markFailed: 0,
        awaiting: 2,
    });
});

test("the ledger upserts by entry id and keeps the newest confirmation first", async () => {
    const entry = (id: string, confirmedAt: string) => ({
        id,
        sessionId: "s",
        company: "abc.1",
        transaction: { id: "t", row: 1, date: "2026-08-01", amount: 100, currency: "PLN", title: "x" },
        invoices: [{ invoiceId: "invoice:1", amount: 100, number: "1", source: "invoice" as const, saldeoId: "1" }],
        confirmedAt,
    });
    assert.equal(ledgerEntryId("s", "t"), "s:t");
    await updateLedger(root, "saldeosmart", (ledger) => upsertLedgerEntries(ledger, [entry("s:a", "2026-08-01T00:00:00Z")]));
    const ledger = await updateLedger(root, "saldeosmart", (current) =>
        upsertLedgerEntries(current, [entry("s:b", "2026-08-02T00:00:00Z"), { ...entry("s:a", "2026-08-01T00:00:00Z"), company: "changed" }]),
    );
    assert.equal(ledger.version, 2);
    assert.deepEqual(
        ledger.entries.map((item) => [item.id, item.company]),
        [
            ["s:b", "abc.1"],
            ["s:a", "changed"],
        ],
    );
    assert.deepEqual(await readLedger(root, "saldeosmart"), ledger);
    assert.deepEqual(await readLedger(root, "other"), { version: 0, entries: [] });
});
