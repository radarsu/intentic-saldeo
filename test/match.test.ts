import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpenInvoice, Transaction } from "../src/core/contract.ts";
import { matchSession, matchTransaction, numberForms } from "../src/core/match/engine.ts";

const invoice = (over: Partial<OpenInvoice> & { id: string; number: string; total: number }): OpenInvoice => ({
    source: "invoice",
    saldeoId: over.id,
    direction: "in",
    kind: "INVOICE",
    corrective: false,
    issueDate: "2026-07-20",
    dueDate: "2026-08-03",
    currency: "PLN",
    paid: 0,
    remaining: over.total,
    isPaid: false,
    bankAccounts: [],
    folder: { year: 2026, month: 7 },
    ...over,
});

const ACME = { id: "1", name: "ACME SP. Z O.O.", nip: "5270201490", bankAccounts: ["PL61109010140000071219812874"] };
const BORACLE = { id: "2", name: "BORACLE POLSKA Sp. z o.o.", nip: "5261040828", bankAccounts: ["PL11616708745332741277000000"] };

const A = invoice({ id: "invoice:12", number: "FV/12/2026", total: 123_000, contractor: ACME });
const B = invoice({ id: "invoice:13", number: "FV/13/2026", total: 50_000, contractor: ACME, issueDate: "2026-07-25" });
const D = invoice({ id: "invoice:112", number: "FV/112/2026", total: 123_000, contractor: ACME, issueDate: "2026-07-28" });
const C = invoice({ id: "document:65", number: "FV/101/2016", total: 49_200, source: "document", direction: "out", kind: "INVOICE_COST", contractor: BORACLE });
const PAID = invoice({ id: "invoice:9", number: "FV/9/2026", total: 123_000, contractor: ACME, paid: 123_000, remaining: 0, isPaid: true });
const POOL = [A, B, C, D, PAID];

const tx = (over: Partial<Transaction> & { id: string; amount: number; title: string }): Transaction => ({
    row: 1,
    date: "2026-08-03",
    currency: "PLN",
    ...over,
});

test("number forms: letters and separators dropped the way payers drop them", () => {
    assert.deepEqual(numberForms("FV/12/2026"), { full: "fv/12/2026", fullFlat: "fv122026", core: "12/2026", coreFlat: "122026" });
    assert.deepEqual(numberForms("FS 2026-08-0007"), { full: "fs2026-08-0007", fullFlat: "fs2026080007", core: "2026-08-0007", coreFlat: "2026080007" });
});

test("number in the title plus the exact amount plus the name: confident, and FV/112/2026 is not mistaken for FV/12/2026", () => {
    const result = matchTransaction(tx({ id: "t1", amount: 123_000, title: "FV/12/2026 zapłata", counterparty: "ACME SP. Z O.O." }), POOL);
    assert.equal(result.verdict, "confident");
    const [top, next] = result.proposals;
    assert.ok(top);
    assert.deepEqual(top.invoices, [{ invoiceId: "invoice:12", amount: 123_000 }]);
    assert.equal(top.score, 100);
    assert.ok(top.reasons.some((reason) => reason.includes("FV/12/2026")));
    // D matches only on amount and name; it stays as a weaker alternative the owner can still pick.
    assert.equal(next?.invoices[0]?.invoiceId, "invoice:112");
    assert.ok((next?.score ?? 0) < 60);
});

test("amount and name only, two invoices of the same size: ambiguous, both offered", () => {
    const result = matchTransaction(tx({ id: "t2", amount: 123_000, title: "zapłata", counterparty: "ACME SP. Z O.O." }), POOL);
    assert.equal(result.verdict, "ambiguous");
    assert.deepEqual(
        result.proposals.map((proposal) => proposal.invoices[0]?.invoiceId).sort(),
        ["invoice:112", "invoice:12"],
    );
    // The invoice Saldeo already reports paid is never a candidate.
    assert.ok(!result.proposals.some((proposal) => proposal.invoices[0]?.invoiceId === "invoice:9"));
});

test("an outgoing transfer matches a cost document by number, amount and the payee's account", () => {
    const result = matchTransaction(tx({ id: "t3", amount: -49_200, title: "FV/101/2016", counterpartyAccount: "PL11616708745332741277000000" }), POOL);
    assert.equal(result.verdict, "confident");
    assert.equal(result.proposals[0]?.invoices[0]?.invoiceId, "document:65");
    assert.ok(result.proposals[0]?.reasons.some((reason) => reason.includes("belongs to the contractor")));
    // Sales invoices are the wrong direction for money leaving, whatever else fits.
    assert.equal(result.proposals.length, 1);
});

test("a group payment: two open invoices of the named contractor add up to the amount", () => {
    const result = matchTransaction(tx({ id: "t4", amount: 173_000, title: "faktury lipiec", counterparty: "ACME SP. Z O.O." }), POOL);
    assert.equal(result.verdict, "ambiguous");
    const group = result.proposals.find((proposal) => proposal.invoices.length === 2);
    assert.ok(group);
    assert.deepEqual(
        group.invoices.map((allocation) => allocation.invoiceId).sort(),
        ["invoice:12", "invoice:13"],
    );
    assert.equal(group.score, 70);
    // With the NIP on the row a group is near certain, but this pool holds two groups that fit (A+B and B+D), so the
    // verdict stays ambiguous with both offered at the same score; drop D and the one left is confident.
    const strong = matchTransaction(tx({ id: "t4b", amount: 173_000, title: "faktury lipiec NIP 5270201490", counterparty: "ACME SP. Z O.O." }), POOL);
    assert.equal(strong.verdict, "ambiguous");
    assert.deepEqual(
        strong.proposals.filter((proposal) => proposal.invoices.length === 2).map((proposal) => proposal.score),
        [80, 80],
    );
    const single = matchTransaction(tx({ id: "t4c", amount: 173_000, title: "faktury lipiec NIP 5270201490", counterparty: "ACME SP. Z O.O." }), [A, B, C, PAID]);
    assert.equal(single.verdict, "confident");
    assert.equal(single.proposals[0]?.invoices.length, 2);
    assert.equal(single.proposals[0]?.score, 80);
});

test("a partial payment keeps the invoice open for the rest and says so", () => {
    const result = matchTransaction(tx({ id: "t5", amount: 100_000, title: "FV/12/2026 część 1" }), POOL);
    assert.equal(result.verdict, "ambiguous");
    const [top] = result.proposals;
    assert.deepEqual(top?.invoices, [{ invoiceId: "invoice:12", amount: 100_000 }]);
    assert.ok(top?.reasons.some((reason) => reason.startsWith("partial payment")));
});

test("a bank fee is proposed as ignorable; a fee-like title with an invoice number is not", () => {
    assert.equal(matchTransaction(tx({ id: "t6", amount: -2_500, title: "OPŁATA ZA PROWADZENIE RACHUNKU" }), POOL).verdict, "ignored");
    assert.equal(matchTransaction(tx({ id: "t6b", amount: -49_200, title: "opłata za FV/101/2016" }), POOL).verdict, "confident");
});

test("money before the invoice existed is penalised; another currency finds nothing", () => {
    const early = matchTransaction(tx({ id: "t7", amount: 123_000, title: "FV/12/2026", date: "2026-07-01" }), POOL);
    assert.equal(early.verdict, "ambiguous");
    assert.ok(early.proposals[0]?.reasons.some((reason) => reason.includes("before the invoice was issued")));
    assert.deepEqual(matchTransaction(tx({ id: "t8", amount: 123_000, title: "FV/12/2026", currency: "EUR" }), POOL), { verdict: "unmatched", proposals: [] });
});

test("matchSession: two confident claims on one invoice cannot both stand", () => {
    const items = matchSession(
        [tx({ id: "a", amount: 123_000, title: "FV/12/2026", counterparty: "ACME SP. Z O.O." }), tx({ id: "b", amount: 123_000, title: "FV/12/2026", counterparty: "ACME SP. Z O.O." })],
        POOL,
    );
    assert.deepEqual(
        items.map((item) => [item.transactionId, item.verdict]),
        [
            ["a", "confident"],
            ["b", "ambiguous"],
        ],
    );
    assert.ok(items[1]?.proposals[0]?.reasons.some((reason) => reason.includes("another transaction already claims")));
});
