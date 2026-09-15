---
name: saldeosmart-web
description: Mark invoices and documents as paid, and link bank transactions to them, in the SaldeoSMART web app as the signed-in owner, through a real browser. Use only for settlements the owner has already confirmed in the Saldeo view (a "mark as paid" run), never on your own initiative.
---

# SaldeoSMART (connected browser)

App: https://saldeo.brainshare.pl/app/uruchamianie.html

${accounts}

This account exists for one job: after the owner confirms settlements in the Saldeo view, record them in SaldeoSMART,
which its API cannot do. You will have been told exactly which invoices, which amounts and which payment dates; touch
nothing else.

## Where it happens (from SaldeoSMART's own help articles; the screens may have moved, so read the page)

**An invoice issued in SaldeoSMART (module *Faktury*):**
open the invoice list, find it by number. Either open the invoice, choose *Edytuj*, tick *Zapłacono fakturę* (the
paid box) and save; or select one or more rows and use *Zmiany zbiorcze → Oznacz jako zapłacone*, which asks for a
payment date (defaults to today; set the transaction's date).

**A document in the archive (module *Archiwum dokumentów* / *Dokumenty*, a cost or sales invoice):**
open the document; its payment panel lets you add a payment (*Płatności* / *Zapłacono*) with a date and an amount, or
mark it paid outright. A partial amount is a partial payment: enter the amount you were given, not the total.

**Linking a bank transaction (office side, when the statement is already in Saldeo):**
*Wyciągi bankowe* → the transactions list → on the row use *Dodaj* (or *Zmień*) in the *Rozliczenie* column, pick the
invoice(s)/document(s) and the amounts. A document already marked *Dokument zapłacony* cannot be linked; that is
fine, the aim is the same.

## Care

- One settlement at a time: navigate, `browser_snapshot`, act, re-snapshot to confirm the paid state shows, then
  call `saldeo_record_marking` with `ok` (say where you did it) or `failed` (say what stopped you) before moving on.
- Payment date = the bank transaction's date, unless told otherwise.
- If the invoice is already paid in SaldeoSMART, record `ok` with a note saying it was already marked; do not unmark
  or re-mark.
- Do not edit amounts, numbers, contractors or anything beyond the payment. Do not delete. Do not issue documents.
- If the app asks for a login or a code, stop and hand it to the owner: this account's session is theirs.
${tools}
