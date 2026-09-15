# intentic-saldeo

[SaldeoSMART](https://www.saldeosmart.pl) for an intentic sandbox: the agent reads a company's open invoices, cost
documents, contractors and bank statements over the API, and the owner gets a **Saldeo** rail view that matches a bank
export (CSV) to what is owed, lets the agent resolve the leftovers, and, once the owner has confirmed, sends the agent
to mark the invoices paid in SaldeoSMART's web app.

Installs as **`intentic.saldeo`**.

## The one fact that shapes it

SaldeoSMART's Rest API-XML (specification 4.0.0, and every versioned operation index from 1.0 to 3.2) **reads** a
company's books and **writes** document metadata, dictionaries and new documents. It has no operation that records a
payment or marks an invoice paid. Paid state comes back read-only (`IS_INVOICE_PAID`, `PAID_SUM`, `IS_DOCUMENT_PAID`,
`DOCUMENT_PAYMENTS`), and the settlements SaldeoSMART makes itself show in `bank_statement.list`.

So this extension is built in two halves:

- **Reads and matching over the API**, deterministic first, the agent for what the matcher cannot settle, and every
  match confirmed by the owner. Confirmed settlements go into the extension's own **ledger**.
- **Writes through a browser account.** A second capability card, *SaldeoSMART (web)*, is a signed-in browser
  profile. "Mark as paid" starts an agent turn on that account with the confirmed list; the agent does in the web app
  what the owner would, records the outcome per invoice, and the view re-reads the API to verify.

## What it contributes

| Contribution | What it adds |
| --- | --- |
| `capabilities[0]` **SaldeoSMART** (`cli`) | The API login and token, an optional pinned company, and the permission switches: *read the document archive*, *read invoices issued in Saldeo*, *read bank statements*, *let the agent propose matches*. Each becomes an env var and decides which MCP tools exist. |
| `capabilities[1]` **SaldeoSMART (web)** (`browser`) | The signed-in profile the marking run acts through. Connect it only if the agent should be able to mark things paid; personas can withhold it. |
| `views` **Saldeo** (rail) | One tile per connected API card. Tabs: Reconcile, Invoices, Bank statements, Ledger. Badged with the decisions the owner still owes. |
| `files` | `.intentic/records/saldeo/` — the sessions and the ledger; a write there (by the backend, the agent's MCP server or the CLI) refreshes the open view. |
| `server` | The backend: Saldeo client, CSV import, matcher, sessions; reaches the daemon for `GET /capabilities/*/connection` (the card's credential) and `POST /agent` (the two runs). |
| `bin` | `saldeo` (CLI) and `saldeo-mcp` (stdio MCP server), self-contained node bundles. |
| `agent` | A Claude Code plugin: the `saldeo` MCP server (`.mcp.json`) and the `saldeo-reconcile` skill. |

## How a statement gets reconciled

1. **Import** a CSV as the bank exported it. The backend sniffs the encoding (mBank and ING still write
   windows-1250), the delimiter and the header row, recognises mBank, PKO BP, ING, Pekao and Santander by their
   headers, and proposes a column mapping; for any other bank the owner maps the columns once.
2. **Match.** Each row becomes a transaction; the open invoices of the months before it are read from Saldeo (sales
   invoices issued there for money arriving, cost documents from the archive for money leaving) and scored: invoice
   number in the title (letters and separators mangled the way payers mangle them), amount equal to what is owed,
   the contractor's NIP or bank account, a name match, a plausible date. A group of one contractor's invoices that add
   up to the amount is proposed as one; a partial payment is allocated as such. Verdicts: **confident**, **needs a
   look**, **no match**, **not an invoice** (fees, tax, internal transfers).
3. **Resolve.** *Ask the agent* starts an isolated turn with the `saldeo` tools; the agent reads the unresolved rows
   and the pool, looks further back or up by number/NIP, and writes **proposals** with reasons. It cannot confirm.
4. **Confirm.** The owner confirms rows one by one, all confident ones at once, picks another invoice by hand, rejects
   or skips. Every confirmation lands in the ledger.
5. **Mark.** *Mark as paid in SaldeoSMART* starts a turn on the browser account with the confirmed, not-yet-marked
   settlements. The agent records `ok` / `failed` per row. *Verify with Saldeo* re-reads the API and shows which
   invoices SaldeoSMART now reports paid.

The state of all this is JSON under `.intentic/records/saldeo/<card id>/`, shared live across worktrees and versioned
so the backend and an agent's tool cannot overwrite each other.

## Permissions, granularly

- **What the agent may read** is the four switches on the API card; an off switch removes the tool and refuses the
  CLI verb with a sentence naming the switch.
- **Whether the agent may propose** is the fourth switch; off means read-only tools.
- **Whether the agent may write to SaldeoSMART** is whether the browser account is connected at all, and a
  persona's per-account grant on top. The API card alone can never change anything in Saldeo.
- **Nothing the agent can call decides.** Confirming is a click in the view; marking is a run the owner starts.

## Building it

```sh
pnpm install     # pnpm, not npm — see pnpm-workspace.yaml for the build approvals it needs
pnpm build       # dist/extension.js, dist/server.js, dist/bin/saldeo, dist/bin/saldeo-mcp
pnpm test        # node --test: the core against SaldeoSMART's own example documents, the backend against a
                 # fake Saldeo, the BUILT MCP server and CLI over a real port, the manifest, the BUILT UI bundle
pnpm typecheck
```

`dist/` **must be committed**: there is no build step at install time, so the sha you publish is literally the code
that runs. The two `dist/bin/*` files must be committed executable (`git update-index --chmod=+x`); the daemon only
puts the directory on PATH.

Dependencies are the published packages only (`@intentic/extension-api`, `@intentic/extension-ui`,
`@intentic/extension-manifest` for the tests, `@modelcontextprotocol/sdk` bundled into the MCP binary). Node 24: the
tests import the TypeScript sources directly.

## What is verified, and what is not

- The request signature reproduces the worked example in SaldeoSMART's own specification; the parsers run against
  SaldeoSMART's published example answers, byte for byte; the CSV readers against byte-faithful fixtures of each
  bank's export shape; the matcher against a table of cases; the whole backend against a fake Saldeo; the built MCP
  server and CLI spawned for real.
- **Nobody here has called a live SaldeoSMART.** The API is offered to office-side logins on request
  (api@saldeosmart.pl); until one is connected, the exact shape of a real `invoice/getidlist` answer, whether
  `listbyid` lists every invoice or only export-flagged ones, and the rate limit's real behaviour are taken from the
  documentation. The older `policy=SALDEO` lists are wired as fallbacks (`listIssuedInvoicesFlagged`,
  `listDocumentsFlagged`).
- **The browser skill describes SaldeoSMART's web app from its help-centre articles**, not from driving it. The first
  marking run is the test of it; the agent reads the page and adapts, and records `failed` with a note where it cannot.
- Plugin `.mcp.json` loading is checked by the manifest test, not by an install.

MIT licensed. No warranty, and nobody has audited it but its author.
