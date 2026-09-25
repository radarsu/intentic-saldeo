---
name: saldeosmart
description: The owner's SaldeoSMART (Polish accounting SaaS) over its API — companies, contractors, invoices issued there, cost documents from the archive, bank statements and what Saldeo already settled — plus the reconciliation sessions in which bank payments are matched to open invoices. Use when the user asks what is unpaid, who paid, whether an invoice is settled, to help match a bank statement's payments to open invoices, when a turn is asked to resolve a reconciliation session, or to record the outcome of marking invoices paid.
---

# ${id}: SaldeoSMART (API)

The `${id}` capability is a SaldeoSMART API login. Its fields are in your environment already
(`$SALDEO_USERNAME`, `$SALDEO_API_TOKEN`, `$SALDEO_URL`, `$SALDEO_COMPANY`, `$SALDEO_SCOPE_DOCUMENTS`,
`$SALDEO_SCOPE_INVOICES`, `$SALDEO_SCOPE_BANK`, `$SALDEO_SCOPE_PROPOSE`); the CLI reads them itself, the MCP tools
are handed the card by the daemon. Never pass the token on a command line and never print it.

Two ways in, same operations:

- **MCP tools** `saldeo_status`, `saldeo_companies`, `saldeo_contractors`, `saldeo_invoices`, `saldeo_documents`,
  `saldeo_bank_statements`, `saldeo_sessions`, `saldeo_session`, `saldeo_propose`, `saldeo_skip`,
  `saldeo_record_marking` (the `${id}` server, one per connected card, so they need no account; the
  reconciliation ones are explained below).
- **The `saldeo` CLI** on your PATH, for a shell: `saldeo status`, `saldeo invoices --months 3`,
  `saldeo documents --number "FV/12/2026"`, `saldeo session <id>`, … (`saldeo help`). Add `--json` for data.

```sh
saldeo status          # is the API answering, which switches are on
saldeo companies       # company program ids — most calls need one; the card may pin it ($SALDEO_COMPANY)
```

## What the API is, and is not

- **Reads only.** Companies, contractors, invoices issued in Saldeo (`IS_INVOICE_PAID`, `PAID_SUM`), archive
  documents (`IS_DOCUMENT_PAID`, the payments recorded), bank statements Saldeo holds with the settlements it made.
- **It cannot mark anything paid.** There is no write for payments. If the owner wants invoices marked paid, that is
  the `saldeosmart-web` browser account and the Saldeo view's own confirm step, never something you improvise.
- **Amounts** come back as integer grosze (`123000` = 1 230,00) with a formatted twin. Quote the invoice number and
  the Saldeo id when you report one.
- **Rate limit:** twenty calls a minute, one at a time. A six-month invoice list is about a dozen calls; do not loop
  over months yourself, and prefer `saldeo_documents` (a search) over listing everything to check one number.
- **Switches** on the card decide what you may read (`documents`, `invoices`, `bankStatements`) and whether you may
  propose matches (`propose`). A refused call says which switch; tell the owner rather than working around it.

## Reading habits

- "Is FV/12/2026 paid?" → `saldeo_documents` with the number (archive) or `saldeo_invoices` (issued), then read
  `isPaid` / `remaining`. Say which list it came from: an issued invoice and an archive document are different
  records.
- "What is unpaid?" → `saldeo_invoices` (open by default; `all` to include paid). Direction `in` is money the company
  is owed, `out` is money it owes.
- "Who is this counterparty?" → `saldeo_contractors` (names, NIPs, bank accounts).
- These are somebody's books. Read what the question needs; do not dump whole lists into the conversation.

## Reconciling bank payments

The Saldeo view (rail tile **Saldeo**) is where the owner imports a bank CSV. A deterministic matcher pairs each
transaction with open invoices by invoice number, amount, NIP, bank account, name and date, and grades each as
**confident**, **ambiguous**, **unmatched** or **ignored**. Your part is the leftovers: the ambiguous and unmatched
ones, when the owner presses *Ask the agent*, or when they ask you directly.

1. `saldeo_session` (session id, on the `${id}` server) → the unresolved transactions, the matcher's candidates with
   reasons, and the pool of open invoices (direction `in` for money arriving = sales; `out` for money leaving = cost
   documents).
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

- **You propose; the owner decides.** Nothing you call confirms a match or marks an invoice paid. If a proposal is
  wrong the owner rejects it in the view, so say what convinced you in `reasons`.
- **Do not guess.** Same amount and nothing else, with several candidates, is a thing to leave for the owner (say
  which candidates), not a coin to flip.
- **Currency and direction must match**: an incoming transfer never pays a cost document.
- **Marking paid is a separate run** through the `saldeosmart-web` browser account, started by the owner from the
  view. In that run, after each invoice is marked in the web app, call `saldeo_record_marking` (`ok` or `failed`, with
  a note) so the view and the ledger know.
- Reads cost API calls (twenty a minute): use the pool the session already holds before listing again.

From a shell: `saldeo session <id>`, `saldeo propose <session> <transaction> --invoice invoice:12=123000 --reason "…"`,
`saldeo skip <session> <transaction> --reason "…"`, `saldeo record-marking <session> <transaction> ok --note "…"`.
