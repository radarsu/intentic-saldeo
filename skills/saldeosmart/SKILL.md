---
name: saldeosmart
description: The owner's SaldeoSMART (Polish accounting SaaS) over its API — companies, contractors, invoices issued there, cost documents from the archive, bank statements and what Saldeo already settled — plus the reconciliation sessions in which bank payments are matched to open invoices. Use when the user asks what is unpaid, who paid, whether an invoice is settled, or to help match a bank statement to invoices.
---

# ${id}: SaldeoSMART (API)

The `${id}` capability is a SaldeoSMART API login. Its fields are in your environment already
(`$SALDEO_USERNAME`, `$SALDEO_API_TOKEN`, `$SALDEO_URL`, `$SALDEO_COMPANY`, `$SALDEO_SCOPE_DOCUMENTS`,
`$SALDEO_SCOPE_INVOICES`, `$SALDEO_SCOPE_BANK`, `$SALDEO_SCOPE_PROPOSE`); the tools read them themselves. Never pass
the token on a command line and never print it.

Two ways in, same operations:

- **MCP tools** `saldeo_status`, `saldeo_companies`, `saldeo_contractors`, `saldeo_invoices`, `saldeo_documents`,
  `saldeo_bank_statements`, `saldeo_sessions`, `saldeo_session`, `saldeo_propose`, `saldeo_skip`,
  `saldeo_record_marking` (the `saldeo` server; the `saldeo-reconcile` skill explains the reconciliation ones).
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
