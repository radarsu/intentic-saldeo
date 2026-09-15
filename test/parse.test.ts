import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
    parseBankStatements,
    parseCompanies,
    parseContractors,
    parseDocumentIdList,
    parseDocuments,
    parseIssuedIdList,
    parseIssuedInvoices,
} from "../src/core/saldeo/parse.ts";
import { parseXml } from "../src/core/saldeo/xml.ts";

/* SaldeoSMART's own published example answers, byte for byte, are the fixtures; nothing here was invented. */
const fixture = async (name: string) => parseXml(await readFile(new URL(`./fixtures/saldeo/${name}`, import.meta.url), "utf8"));

test("invoice.list 2.17: issued invoices and their paid state", async () => {
    const invoices = parseIssuedInvoices(await fixture("invoice_list_response_example.xml"));
    const ids = invoices.map((invoice) => `${invoice.kind} ${invoice.number}`);
    assert.ok(ids.some((id) => id.startsWith("CORRECTIVE_INVOICE 1/12/2023/KOR")), ids.join(", "));
    const corrective = invoices.find((invoice) => invoice.number === "1/12/2023/KOR");
    assert.ok(corrective);
    assert.equal(corrective.source, "invoice");
    assert.equal(corrective.currency, "PLN");
    assert.equal(corrective.total, 246_000);
    assert.equal(corrective.paid, 100_000);
    assert.equal(corrective.remaining, 146_000);
    assert.equal(corrective.isPaid, false);
    assert.equal(corrective.corrective, true);
    assert.equal(corrective.direction, "in");
    assert.equal(corrective.contractor?.nip, "43256234643");
    // The dictionary at the top of the answer names the contractor the invoice only references by id.
    assert.equal(corrective.contractor?.name, "BrainSHARE s.c.");
    assert.deepEqual(corrective.bankAccounts, ["PL63249000050000400030900682"]);
    assert.deepEqual(corrective.folder, { year: 2023, month: 12 });
});

test("invoice.listbyid 3.0: the example holds only corrective and pre-invoices; pre-invoices are left out", async () => {
    const invoices = parseIssuedInvoices(await fixture("invoice_list_by_id_response_example.xml"));
    assert.deepEqual(
        invoices.map((invoice) => [invoice.kind, invoice.saldeoId]),
        [["CORRECTIVE_INVOICE", "k101"]],
    );
    const [corrective] = invoices;
    assert.ok(corrective);
    assert.equal(corrective.total, 246_000);
    // PAID_SUM and the INVOICE_PAYMENTS list agree here (1000.00); the larger of the two is what counts as paid.
    assert.equal(corrective.paid, 100_000);
    assert.equal(corrective.remaining, 146_000);
    assert.equal(corrective.isPaid, false);
});

test("document.list 3.1: an unpaid cost invoice is money going out", async () => {
    const documents = parseDocuments(await fixture("document_list_response_example.xml"));
    assert.equal(documents.length, 1);
    const [document] = documents;
    assert.ok(document);
    assert.equal(document.id, "document:65");
    assert.equal(document.number, "FV/101/2016");
    assert.equal(document.kind, "INVOICE_COST");
    assert.equal(document.direction, "out");
    assert.equal(document.total, 49_200);
    assert.equal(document.remaining, 49_200);
    assert.equal(document.isPaid, false);
    assert.equal(document.dueDate, "2015-11-06");
    assert.equal(document.contractor?.name, "BORACLE POLSKA Sp. z o.o.");
    assert.equal(document.contractor?.nip, "5270201490");
    assert.deepEqual(document.contractor?.bankAccounts, ["GB11616708745332741277"]);
});

test("bank_statement.list 2.16: operations carry direction, amount and what Saldeo settled them against", async () => {
    const statements = parseBankStatements(await fixture("bank_statement_list_response_example.xml"));
    assert.equal(statements.length, 1);
    const [statement] = statements;
    assert.ok(statement);
    assert.equal(statement.account, "PL54249000050000400017826214");
    assert.equal(statement.status, "ANALYZED");
    const [operation] = statement.operations;
    assert.ok(operation);
    assert.equal(operation.type, "TRANSFER_OUTGOING");
    assert.equal(operation.amount, -8_550);
    assert.equal(operation.currency, "EUR");
    assert.equal(operation.contractorNip, "4852379156");
    assert.equal(operation.remainingToSettle, 0);
    assert.deepEqual(
        operation.settled.map((ref) => [ref.number, ref.amountSettled]),
        [
            ["11111/04/2016", 2_000],
            ["12675315375761253/ONO/2016", 2_000],
            ["122/AAA/2016", 4_550],
        ],
    );
});

test("the 3.0 id lists", async () => {
    const issued = parseIssuedIdList(await fixture("invoice_get_id_list_response_example.xml"));
    assert.ok(issued.invoices.includes("65"));
    assert.deepEqual(issued.corrective, ["8", "7", "6", "5"]);
    const documents = parseDocumentIdList(await fixture("document_get_id_list_response_example.xml"));
    assert.deepEqual(documents, { INVOICES_COST: ["3", "4"], INVOICES_MATERIAL: ["7", "8"], INVOICES_SALE: ["9", "10"] });
});

test("company.list and contractor.list", () => {
    const companies = parseCompanies(
        parseXml(`<RESPONSE><STATUS>OK</STATUS><COMPANIES><COMPANY><COMPANY_PROGRAM_ID>abc.1</COMPANY_PROGRAM_ID><COMPANY_ID>5</COMPANY_ID><FULL_NAME>Firma Sp. z o.o.</FULL_NAME><VAT_NUMBER>1234563218</VAT_NUMBER></COMPANY><COMPANY><COMPANY_ID>6</COMPANY_ID><SHORT_NAME>Druga</SHORT_NAME></COMPANY></COMPANIES></RESPONSE>`),
    );
    assert.deepEqual(companies, [
        { programId: "abc.1", name: "Firma Sp. z o.o.", nip: "1234563218" },
        { programId: "6", name: "Druga" },
    ]);
    const contractors = parseContractors(
        parseXml(
            `<RESPONSE><CONTRACTORS><CONTRACTOR><CONTRACTOR_ID>9</CONTRACTOR_ID><SHORT_NAME>ACME</SHORT_NAME><FULL_NAME>ACME S.A.</FULL_NAME><VAT_NUMBER>5261040828</VAT_NUMBER><SUPPLIER>true</SUPPLIER><CUSTOMER>false</CUSTOMER><BANK_ACCOUNTS><BANK_ACCOUNT><NUMBER>PL61109010140000071219812874</NUMBER></BANK_ACCOUNT></BANK_ACCOUNTS></CONTRACTOR></CONTRACTORS></RESPONSE>`,
        ),
    );
    assert.deepEqual(contractors, [
        { id: "9", name: "ACME S.A.", shortName: "ACME", nip: "5261040828", bankAccounts: ["PL61109010140000071219812874"], customer: false, supplier: true },
    ]);
});
