import type { BankStatement, Company, Contractor, OpenInvoice, Scopes } from "../contract.ts";
import type { SaldeoClient } from "./client.ts";
import {
    DOCUMENT_ID_GROUPS,
    type DocumentIdGroup,
    parseBankStatements,
    parseCompanies,
    parseContractors,
    parseDocumentIdList,
    parseDocuments,
    parseIssuedIdList,
    parseIssuedInvoices,
} from "./parse.ts";
import { encodeXml } from "./xml.ts";

// The reads this extension makes, each pinned to the API version whose answer parse.ts understands. Listing goes
// month by month through the 3.0 id lists and then listbyid in batches, since the plain lists (`policy=SALDEO`) only
// return what somebody flagged for export in Saldeo.

export interface Month {
    readonly year: number;
    readonly month: number;
}

const ID_BATCH = 50;

const folderXml = (month: Month): string => `<ROOT><FOLDER><YEAR>${month.year}</YEAR><MONTH>${month.month}</MONTH></FOLDER></ROOT>`;

const batches = <T>(items: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        out.push(items.slice(index, index + size));
    }
    return out;
};

export const listCompanies = async (client: SaldeoClient): Promise<Company[]> => parseCompanies(await client.get("api/xml/1.0/company/list"));

export const listContractors = async (client: SaldeoClient, company: string): Promise<Contractor[]> =>
    parseContractors(await client.get("api/xml/1.23/contractor/list", { company_program_id: company }));

// Invoices issued in Saldeo in one month's folder, whether or not anyone flagged them for export.
export const listIssuedInvoicesForMonth = async (client: SaldeoClient, company: string, month: Month): Promise<OpenInvoice[]> => {
    const list = parseIssuedIdList(await client.post("api/xml/3.0/invoice/getidlist", { company_program_id: company }, folderXml(month)));
    const found: OpenInvoice[] = [];
    const requests = [
        ...batches([...new Set(list.invoices)], ID_BATCH).map((ids) => `<ROOT><INVOICES>${ids.map((id) => `<INVOICE_ID>${encodeXml(id)}</INVOICE_ID>`).join("")}</INVOICES></ROOT>`),
        ...batches([...new Set(list.corrective)], ID_BATCH).map(
            (ids) =>
                `<ROOT><CORRECTIVE_INVOICES>${ids.map((id) => `<CORRECTIVE_INVOICE_ID>${encodeXml(id)}</CORRECTIVE_INVOICE_ID>`).join("")}</CORRECTIVE_INVOICES></ROOT>`,
        ),
    ];
    for (const xml of requests) {
        found.push(...parseIssuedInvoices(await client.post("api/xml/3.0/invoice/listbyid", { company_program_id: company }, xml)));
    }
    return found;
};

// The invoices somebody flagged in Saldeo (`policy=SALDEO`): the older, one-call listing, kept as the fallback.
export const listIssuedInvoicesFlagged = async (client: SaldeoClient, company: string): Promise<OpenInvoice[]> =>
    parseIssuedInvoices(await client.get("api/xml/2.18/invoice/list", { company_program_id: company, policy: "SALDEO" }));

// Archive documents in one month's folder that carry an amount owed: cost, material and sales invoices.
export const listDocumentsForMonth = async (client: SaldeoClient, company: string, month: Month): Promise<OpenInvoice[]> => {
    const list = parseDocumentIdList(await client.post("api/xml/3.0/document/getidlist", { company_program_id: company }, folderXml(month)));
    const flat = (Object.keys(DOCUMENT_ID_GROUPS) as DocumentIdGroup[]).flatMap((group) => [...new Set(list[group])].map((id) => ({ group, id })));
    const found: OpenInvoice[] = [];
    for (const batch of batches(flat, ID_BATCH)) {
        const groups = (Object.keys(DOCUMENT_ID_GROUPS) as DocumentIdGroup[])
            .map((group) => {
                const members = batch.filter((entry) => entry.group === group);
                return members.length === 0
                    ? ""
                    : `<${group}>${members.map((entry) => `<${DOCUMENT_ID_GROUPS[group]}>${encodeXml(entry.id)}</${DOCUMENT_ID_GROUPS[group]}>`).join("")}</${group}>`;
            })
            .join("");
        found.push(...parseDocuments(await client.post("api/xml/3.1/document/listbyid", { company_program_id: company }, `<ROOT>${groups}</ROOT>`)));
    }
    return found;
};

export const listDocumentsFlagged = async (client: SaldeoClient, company: string): Promise<OpenInvoice[]> =>
    parseDocuments(await client.post("api/xml/3.1/document/list", { company_program_id: company, policy: "SALDEO" }));

export interface DocumentSearch {
    readonly number?: string;
    readonly nip?: string;
}

export const searchDocuments = async (client: SaldeoClient, company: string, search: DocumentSearch): Promise<OpenInvoice[]> => {
    const fields = [
        ...(search.number === undefined ? [] : [`<NUMBER>${encodeXml(search.number)}</NUMBER>`]),
        ...(search.nip === undefined ? [] : [`<NIP>${encodeXml(search.nip)}</NIP>`]),
    ];
    if (fields.length === 0) {
        return [];
    }
    return parseDocuments(
        await client.post(
            "api/xml/3.1/document/search",
            { company_program_id: company },
            `<ROOT><SEARCH_POLICY>BY_FIELDS</SEARCH_POLICY><FIELDS>${fields.join("")}</FIELDS></ROOT>`,
        ),
    );
};

export const listBankStatements = async (client: SaldeoClient, company: string): Promise<BankStatement[]> =>
    parseBankStatements(await client.get("api/xml/2.18/bank_statement/list", { company_program_id: company, policy: "SALDEO" }));

// Everything in one month's folders that can be owed, from whichever lists the card's switches allow. An invoice
// that appears in two months' folders is kept once.
export const listPayablesForMonth = async (client: SaldeoClient, company: string, month: Month, scopes: Scopes): Promise<OpenInvoice[]> => {
    const pools = [
        ...(scopes.invoices ? await listIssuedInvoicesForMonth(client, company, month) : []),
        ...(scopes.documents ? await listDocumentsForMonth(client, company, month) : []),
    ];
    return pools;
};

export const dedupeInvoices = (invoices: readonly OpenInvoice[]): OpenInvoice[] => {
    const seen = new Map<string, OpenInvoice>();
    for (const invoice of invoices) {
        seen.set(invoice.id, invoice);
    }
    return [...seen.values()];
};

// The pool a reconciliation session matches against: every month asked for, read one after the other.
export const listPayables = async (client: SaldeoClient, company: string, months: readonly Month[], scopes: Scopes): Promise<OpenInvoice[]> => {
    const found: OpenInvoice[] = [];
    for (const month of months) {
        found.push(...(await listPayablesForMonth(client, company, month, scopes)));
    }
    return dedupeInvoices(found);
};

export const openOnly = (invoices: readonly OpenInvoice[]): OpenInvoice[] => invoices.filter((invoice) => !invoice.isPaid && invoice.remaining > 0);
