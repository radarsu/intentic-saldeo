---
name: saldeo-reconcile
description: Help match a bank statement's payments to open invoices in SaldeoSMART using the saldeo MCP tools (or the `saldeo` CLI). Use when a turn is asked to resolve a reconciliation session, when the user pastes bank transactions and asks which invoice they pay, or when asked to record the outcome of marking invoices paid.
---

# Reconciling bank payments with SaldeoSMART

The Saldeo view (rail tile **Saldeo**) is where the owner imports a bank CSV. A deterministic matcher pairs each
transaction with open invoices by invoice number, amount, NIP, bank account, name and date, and grades each as
**confident**, **ambiguous**, **unmatched** or **ignored**. Your part is the leftovers: the ambiguous and unmatched
ones, when the owner presses *Ask the agent*, or when they ask you directly.

## The loop

1. `saldeo_session` (account, session id) → the unresolved transactions, the matcher's candidates with reasons, and
   the pool of open invoices (direction `in` for money arriving = sales; `out` for money leaving = cost documents).
2. For each transaction, look for evidence, in this order of strength:
   - an invoice number in the title (payers drop the letters and mangle separators: `FV/12/2026`, `fv 12 2026`,
     `12/2026`);
   - the contractor's NIP or bank account (`saldeo_contractors` tells you whose account it is);
   - an amount equal to what is owed, or to a sum of several open invoices of one contractor;
   - a plausible date (after issue, near the due date).
   Look further back with `saldeo_invoices` (`months`) or up by number/NIP with `saldeo_documents` when the pool
   lacks the invoice.
3. `saldeo_propose` with the invoice(s) and amounts (integer grosze; a partial payment allocates what arrived, a
   group payment splits across invoices), your reasons as plain facts, and a confidence. `saldeo_skip` with the
   reason when a transaction pays no invoice (fee, tax, salary, internal transfer).
4. Stop when every unresolved transaction has a proposal or a skip, and summarise: what you proposed, what you left
   and why.

## The rules

- **You propose; the owner decides.** Nothing you call confirms a match or marks an invoice paid. If a proposal is
  wrong the owner rejects it in the view, so say what convinced you in `reasons`.
- **Do not guess.** Same amount and nothing else, with several candidates, is a thing to leave for the owner (say
  which candidates), not a coin to flip.
- **Currency and direction must match**: an incoming transfer never pays a cost document.
- **The API reads; marking paid is a separate run** through the `saldeosmart-web` browser account, started by the
  owner from the view. In that run, after each invoice is marked in the web app, call `saldeo_record_marking`
  (`ok` or `failed`, with a note) so the view and the ledger know.
- Reads cost API calls (twenty a minute): use the pool the session already holds before listing again.

## From a shell

`saldeo session <id>`, `saldeo propose <session> <transaction> --invoice invoice:12=123000 --reason "…"`,
`saldeo skip <session> <transaction> --reason "…"`, `saldeo record-marking <session> <transaction> ok --note "…"`;
`saldeo help` for the rest.
