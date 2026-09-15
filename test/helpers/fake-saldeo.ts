import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

/* A SaldeoSMART that answers every operation the extension makes, over fetch or over a real port. */

export const XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>`;

export interface FakeState {
    paid65: boolean;
    calls: string[];
}

const contractors = `<CONTRACTORS>
  <CONTRACTOR><CONTRACTOR_ID>1</CONTRACTOR_ID><SHORT_NAME>ACME</SHORT_NAME><FULL_NAME>ACME SP. Z O.O.</FULL_NAME><VAT_NUMBER>5270201490</VAT_NUMBER><CUSTOMER>true</CUSTOMER><SUPPLIER>false</SUPPLIER>
    <BANK_ACCOUNTS><BANK_ACCOUNT><NUMBER>PL61109010140000071219812874</NUMBER></BANK_ACCOUNT></BANK_ACCOUNTS></CONTRACTOR>
  <CONTRACTOR><CONTRACTOR_ID>2</CONTRACTOR_ID><SHORT_NAME>BORACLE</SHORT_NAME><FULL_NAME>BORACLE POLSKA Sp. z o.o.</FULL_NAME><VAT_NUMBER>5261040828</VAT_NUMBER><CUSTOMER>false</CUSTOMER><SUPPLIER>true</SUPPLIER>
    <BANK_ACCOUNTS><BANK_ACCOUNT><NUMBER>PL11616708745332741277000000</NUMBER></BANK_ACCOUNT></BANK_ACCOUNTS></CONTRACTOR>
</CONTRACTORS>`;

const issued = (id: string, number: string, sum: string, paid = "false") => `<INVOICE><INVOICE_ID>${id}</INVOICE_ID><NUMBER>${number}</NUMBER><ISSUE_DATE>2026-07-20</ISSUE_DATE><PAYMENT_DATE>2026-08-03</PAYMENT_DATE>
  <CONTRACTOR><CONTRACTOR_ID>1</CONTRACTOR_ID></CONTRACTOR><FOLDER><YEAR>2026</YEAR><MONTH>7</MONTH></FOLDER><SUM>${sum}</SUM><CURRENCY_ISO4217>PLN</CURRENCY_ISO4217><IS_INVOICE_PAID>${paid}</IS_INVOICE_PAID></INVOICE>`;

// The answer for one operation; `request` is the decoded command XML of a POST, "" for a GET.
export const fakeAnswer = async (pathname: string, request: string, state: FakeState): Promise<string> => {
    state.calls.push(pathname);
    if (pathname.endsWith("/company/list")) {
        return `${XML_HEAD}<RESPONSE><STATUS>OK</STATUS><COMPANIES><COMPANY><COMPANY_PROGRAM_ID>abc.1</COMPANY_PROGRAM_ID><FULL_NAME>Firma</FULL_NAME></COMPANY></COMPANIES></RESPONSE>`;
    }
    if (pathname.endsWith("/contractor/list")) {
        return `${XML_HEAD}<RESPONSE><STATUS>OK</STATUS>${contractors}</RESPONSE>`;
    }
    if (pathname.endsWith("/invoice/getidlist")) {
        return `${XML_HEAD}<ROOT><STATUS>OK</STATUS><INVOICES><INVOICE_ID>12</INVOICE_ID><INVOICE_ID>112</INVOICE_ID><INVOICE_ID>13</INVOICE_ID></INVOICES><CORRECTIVE_INVOICES/></ROOT>`;
    }
    if (pathname.endsWith("/invoice/listbyid")) {
        if (!/<INVOICE_ID>12<\/INVOICE_ID>/.test(request)) {
            throw new Error(`listbyid asked without invoice 12: ${request}`);
        }
        return `${XML_HEAD}<RESPONSE><STATUS>OK</STATUS>${contractors}<INVOICES>${issued("12", "FV/12/2026", "1230.00")}${issued("112", "FV/112/2026", "1230.00")}${issued("13", "FV/13/2026", "500.00")}</INVOICES></RESPONSE>`;
    }
    if (pathname.endsWith("/document/getidlist")) {
        return `${XML_HEAD}<ROOT><INVOICES_COST><INVOICE_COST>65</INVOICE_COST></INVOICES_COST></ROOT>`;
    }
    if (pathname.endsWith("/document/listbyid")) {
        if (!/<INVOICES_COST><INVOICE_COST>65<\/INVOICE_COST><\/INVOICES_COST>/.test(request)) {
            throw new Error(`document listbyid asked without document 65: ${request}`);
        }
        return `${XML_HEAD}<RESPONSE><STATUS>OK</STATUS>${contractors}<DOCUMENTS><DOCUMENT><DOCUMENT_ID>65</DOCUMENT_ID><NUMBER>FV/101/2016</NUMBER><ISSUE_DATE>2026-07-25</ISSUE_DATE><PAYMENT_DATE>2026-08-08</PAYMENT_DATE>
  <DOCUMENT_TYPE><TYPE>INVOICE_COST</TYPE></DOCUMENT_TYPE><CONTRACTOR><CONTRACTOR_ID>2</CONTRACTOR_ID></CONTRACTOR><FOLDER><MONTH>7</MONTH><YEAR>2026</YEAR></FOLDER><SUM>492.00</SUM><CURRENCY_ISO4217>PLN</CURRENCY_ISO4217><IS_DOCUMENT_PAID>${state.paid65}</IS_DOCUMENT_PAID></DOCUMENT></DOCUMENTS></RESPONSE>`;
    }
    if (pathname.endsWith("/document/search")) {
        const number = /<NUMBER>([^<]*)<\/NUMBER>/.exec(request)?.[1];
        return number === "FV/101/2016"
            ? fakeAnswer(pathname.replace("/search", "/listbyid"), `<ROOT><INVOICES_COST><INVOICE_COST>65</INVOICE_COST></INVOICES_COST></ROOT>`, state)
            : `${XML_HEAD}<RESPONSE><STATUS>OK</STATUS><DOCUMENTS/></RESPONSE>`;
    }
    if (pathname.endsWith("/bank_statement/list")) {
        return readFile(new URL(`../fixtures/saldeo/bank_statement_list_response_example.xml`, import.meta.url), "utf8");
    }
    return `${XML_HEAD}<RESPONSE><STATUS>ERROR</STATUS><ERROR_CODE>4404</ERROR_CODE><ERROR_MESSAGE>no such operation ${pathname}</ERROR_MESSAGE></RESPONSE>`;
};

const decodeCommand = (body: string): string => {
    const command = new URLSearchParams(body).get("command");
    return command === null ? "" : gunzipSync(Buffer.from(command, "base64")).toString("utf8");
};

export const fakeFetch = (state: FakeState): typeof fetch =>
    (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        return new Response(await fakeAnswer(url.pathname, decodeCommand(String(init?.body ?? "")), state), { status: 200 });
    }) as typeof fetch;

// The same fake on a loopback port, for a binary that talks to `SALDEO_URL` for real.
export const fakeServer = async (state: FakeState): Promise<{ server: Server; url: string }> => {
    const server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            void fakeAnswer(new URL(request.url ?? "/", "http://fake").pathname, decodeCommand(Buffer.concat(chunks).toString("utf8")), state).then((body) => {
                response.writeHead(200, { "content-type": "application/xml" });
                response.end(body);
            });
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};
