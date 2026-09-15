import type { BankOperation, BankStatement, Company, Contractor, Direction, InvoiceContractor, OpenInvoice, SettledRef } from "../contract.ts";
import { saldeoAmount } from "../money.ts";
import { at, child, children, text, type XmlNode } from "./xml.ts";

// SaldeoSMART's answers (company.list 1.0, contractor.list 1.23, invoice.list 2.18 / listbyid 3.0, document.list 3.1 /
// listbyid 3.1, bank_statement.list 2.18) folded into this extension's own shapes. Pure: XML in, records out.

const flag = (node: XmlNode | undefined, name: string): boolean => text(node, name)?.toLowerCase() === "true";

// Every NUMBER (or bare BANK_ACCOUNT text) under a BANK_ACCOUNT(S) node: the schemas disagree on nesting across versions.
const bankAccountsOf = (node: XmlNode | undefined): string[] => {
    const found: string[] = [];
    const walk = (entry: XmlNode | undefined): void => {
        if (entry === undefined) {
            return;
        }
        for (const account of [...children(entry, "BANK_ACCOUNT"), ...(entry.name === "BANK_ACCOUNT" ? [entry] : [])]) {
            const number = text(account, "NUMBER") ?? (account.children.length === 0 ? account.text.trim() : "");
            if (number !== "" && !found.includes(number)) {
                found.push(number);
            }
        }
    };
    walk(child(node, "BANK_ACCOUNTS"));
    walk(child(node, "BANK_ACCOUNT"));
    const bare = text(node, "BANK_NUMBER");
    if (bare !== undefined && !found.includes(bare)) {
        found.push(bare);
    }
    return found;
};

const folderOf = (node: XmlNode | undefined): { year: number; month: number } => ({
    year: Number.parseInt(text(at(node, "FOLDER"), "YEAR") ?? "0", 10),
    month: Number.parseInt(text(at(node, "FOLDER"), "MONTH") ?? "0", 10),
});

export const parseCompanies = (root: XmlNode): Company[] =>
    children(child(root, "COMPANIES"), "COMPANY").flatMap((node) => {
        const programId = text(node, "COMPANY_PROGRAM_ID") ?? text(node, "COMPANY_ID");
        if (programId === undefined) {
            return [];
        }
        const nip = text(node, "VAT_NUMBER");
        return [
            {
                programId,
                name: text(node, "FULL_NAME") ?? text(node, "SHORT_NAME") ?? text(node, "USERNAME") ?? programId,
                ...(nip === undefined ? {} : { nip }),
            },
        ];
    });

export const parseContractors = (root: XmlNode): Contractor[] =>
    children(child(root, "CONTRACTORS"), "CONTRACTOR").flatMap((node) => {
        const id = text(node, "CONTRACTOR_ID");
        if (id === undefined) {
            return [];
        }
        const shortName = text(node, "SHORT_NAME");
        const nip = text(node, "VAT_NUMBER") ?? text(node, "NIP");
        return [
            {
                id,
                name: text(node, "FULL_NAME") ?? shortName ?? id,
                ...(shortName === undefined ? {} : { shortName }),
                ...(nip === undefined ? {} : { nip }),
                bankAccounts: bankAccountsOf(node),
                customer: flag(node, "CUSTOMER"),
                supplier: flag(node, "SUPPLIER"),
            },
        ];
    });

const contractorOf = (node: XmlNode | undefined, dictionary: ReadonlyMap<string, Contractor>): InvoiceContractor | undefined => {
    const ref = child(node, "CONTRACTOR");
    if (ref === undefined) {
        return undefined;
    }
    const id = text(ref, "CONTRACTOR_ID");
    const known = id === undefined ? undefined : dictionary.get(id);
    const nip = known?.nip ?? text(ref, "NIP");
    if (id === undefined && nip === undefined) {
        return undefined;
    }
    return {
        ...(id === undefined ? {} : { id }),
        ...(known === undefined ? {} : { name: known.name }),
        ...(nip === undefined ? {} : { nip }),
        bankAccounts: known?.bankAccounts ?? [],
    };
};

const paymentsSum = (node: XmlNode | undefined, list: string, entry: string): number =>
    children(child(node, list), entry).reduce((sum, payment) => sum + Math.abs(saldeoAmount(text(payment, "PAYMENT_AMOUNT"))), 0);

interface PayableInput {
    readonly source: OpenInvoice["source"];
    readonly saldeoId: string;
    readonly kind: string;
    readonly baseDirection: Direction;
    readonly node: XmlNode;
    readonly paidFlag: boolean;
    readonly paid: number;
    readonly dictionary: ReadonlyMap<string, Contractor>;
}

// A negative total flips the flow: a credit note on a sale is money going back out.
const payable = ({ source, saldeoId, kind, baseDirection, node, paidFlag, paid, dictionary }: PayableInput): OpenInvoice => {
    const signedTotal = saldeoAmount(text(node, "SUM"));
    const total = Math.abs(signedTotal);
    const direction: Direction = signedTotal < 0 ? (baseDirection === "in" ? "out" : "in") : baseDirection;
    const remaining = paidFlag ? 0 : Math.max(0, total - Math.min(paid, total));
    const dueDate = text(node, "PAYMENT_DATE");
    const contractor = contractorOf(node, dictionary);
    const sourceUrl = text(node, "SOURCE");
    return {
        id: `${source}:${saldeoId}`,
        source,
        saldeoId,
        number: text(node, "NUMBER") ?? saldeoId,
        direction,
        kind,
        corrective: flag(node, "IS_CORRECTIVE"),
        issueDate: text(node, "ISSUE_DATE") ?? "",
        ...(dueDate === undefined ? {} : { dueDate }),
        currency: text(node, "CURRENCY_ISO4217") ?? "PLN",
        total,
        paid: Math.min(paid, total),
        remaining,
        isPaid: paidFlag || remaining === 0,
        ...(contractor === undefined ? {} : { contractor }),
        bankAccounts: bankAccountsOf(node),
        folder: folderOf(node),
        ...(sourceUrl === undefined ? {} : { sourceUrl }),
    };
};

// Invoices issued in SaldeoSMART: sales, so the base flow is money in. Pre-invoices (zaliczkowe) are left out; their
// SUM is an order value, not an amount owed.
export const parseIssuedInvoices = (root: XmlNode): OpenInvoice[] => {
    const dictionary = new Map(parseContractors(root).map((contractor) => [contractor.id, contractor]));
    const invoices = children(child(root, "INVOICES"), "INVOICE").flatMap((node) => {
        const saldeoId = text(node, "INVOICE_ID");
        return saldeoId === undefined
            ? []
            : [
                  payable({
                      source: "invoice",
                      saldeoId,
                      kind: "INVOICE",
                      baseDirection: "in",
                      node,
                      paidFlag: flag(node, "IS_INVOICE_PAID"),
                      paid: Math.max(Math.abs(saldeoAmount(text(node, "PAID_SUM"))), paymentsSum(node, "INVOICE_PAYMENTS", "INVOICE_PAYMENT")),
                      dictionary,
                  }),
              ];
    });
    const corrective = children(child(root, "CORRECTIVE_INVOICES"), "CORRECTIVE_INVOICE").flatMap((node) => {
        const saldeoId = text(node, "CORRECTIVE_INVOICE_ID");
        return saldeoId === undefined
            ? []
            : [
                  payable({
                      source: "invoice",
                      saldeoId: `k${saldeoId}`,
                      kind: "CORRECTIVE_INVOICE",
                      baseDirection: "in",
                      node,
                      paidFlag: flag(node, "IS_INVOICE_PAID"),
                      paid: Math.max(Math.abs(saldeoAmount(text(node, "PAID_SUM"))), paymentsSum(node, "INVOICE_PAYMENTS", "INVOICE_PAYMENT")),
                      dictionary,
                  }),
              ];
    });
    return [...invoices, ...corrective];
};

// Which archive document types are money owed to or by the company; the rest (contracts, orders, letters) are not.
export const documentDirection = (type: string | undefined): Direction | undefined => {
    if (type === undefined) {
        return undefined;
    }
    if (/SALE/.test(type)) {
        return "in";
    }
    if (/COST|MATERIAL/.test(type)) {
        return "out";
    }
    return undefined;
};

export const parseDocuments = (root: XmlNode): OpenInvoice[] => {
    const dictionary = new Map(parseContractors(root).map((contractor) => [contractor.id, contractor]));
    return children(child(root, "DOCUMENTS"), "DOCUMENT").flatMap((node) => {
        const saldeoId = text(node, "DOCUMENT_ID");
        const type = text(at(node, "DOCUMENT_TYPE"), "TYPE");
        const baseDirection = documentDirection(type);
        if (saldeoId === undefined || baseDirection === undefined) {
            return [];
        }
        return [
            payable({
                source: "document",
                saldeoId,
                kind: type ?? "DOCUMENT",
                baseDirection,
                node,
                paidFlag: flag(node, "IS_DOCUMENT_PAID"),
                paid: paymentsSum(node, "DOCUMENT_PAYMENTS", "DOCUMENT_PAYMENT"),
                dictionary,
            }),
        ];
    });
};

export interface IssuedIdList {
    readonly invoices: readonly string[];
    readonly corrective: readonly string[];
}

export const parseIssuedIdList = (root: XmlNode): IssuedIdList => ({
    invoices: children(child(root, "INVOICES"), "INVOICE_ID").map((node) => node.text.trim()),
    corrective: children(child(root, "CORRECTIVE_INVOICES"), "CORRECTIVE_INVOICE_ID").map((node) => node.text.trim()),
});

// The archive's id groups that can carry an amount owed; the request to listbyid mirrors these names.
export const DOCUMENT_ID_GROUPS = {
    INVOICES_COST: "INVOICE_COST",
    INVOICES_MATERIAL: "INVOICE_MATERIAL",
    INVOICES_SALE: "INVOICE_SALE",
} as const;
export type DocumentIdGroup = keyof typeof DOCUMENT_ID_GROUPS;

export const parseDocumentIdList = (root: XmlNode): Record<DocumentIdGroup, readonly string[]> => {
    const result = {} as Record<DocumentIdGroup, readonly string[]>;
    for (const [group, entry] of Object.entries(DOCUMENT_ID_GROUPS) as [DocumentIdGroup, string][]) {
        result[group] = children(child(root, group), entry).map((node) => node.text.trim());
    }
    return result;
};

const settledRefs = (node: XmlNode | undefined, list: string, entry: string, idName: string): SettledRef[] =>
    children(child(node, list), entry).map((ref) => ({
        id: text(ref, idName) ?? "",
        number: text(ref, "NUMBER") ?? "",
        type: text(ref, "TYPE") ?? "",
        amountSettled: Math.abs(saldeoAmount(text(ref, "AMOUNT_SETTLED"))),
    }));

const operationOf = (node: XmlNode): BankOperation => {
    const value = Math.abs(saldeoAmount(text(node, "VALUE")));
    const debit = text(node, "DEBIT_CREDIT") === "DEBIT";
    const matching = at(node, "SALDEOSMART_MATCHING", "CONTRACTOR");
    const settlement = child(node, "TRANSACTION_SETTLEMENT");
    const account = text(node, "BANK_OPERATION_ACCOUNT_NUMBER");
    const contractorId = text(matching, "CONTRACTOR_ID");
    const contractorNip = text(matching, "NIP");
    const remaining = text(settlement, "REMAIN_AMOUNT_TO_BE_SETTLED");
    return {
        date: text(node, "OPERATION_DATE") ?? text(node, "ACCOUNTING_DATE") ?? "",
        type: text(node, "BANK_OPERATION_TYPE") ?? "",
        description: text(node, "OPERATION_DESCRIPTION") ?? "",
        amount: debit ? -value : value,
        currency: text(node, "CURRENCY_ISO4217") ?? "PLN",
        ...(account === undefined ? {} : { account }),
        ...(contractorId === undefined ? {} : { contractorId }),
        ...(contractorNip === undefined ? {} : { contractorNip }),
        approved: flag(node, "IS_APPROVED"),
        ...(remaining === undefined ? {} : { remainingToSettle: Math.abs(saldeoAmount(remaining)) }),
        settled: [
            ...settledRefs(settlement, "SETTLED_INVOICES", "SETTLED_INVOICE", "INVOICE_ID"),
            ...settledRefs(settlement, "SETTLED_DOCUMENTS", "SETTLED_DOCUMENT", "DOCUMENT_ID"),
        ],
    };
};

export const parseBankStatements = (root: XmlNode): BankStatement[] =>
    children(child(root, "BANK_STATEMENTS"), "BANK_STATEMENT").map((node) => {
        const filename = text(node, "BANK_STATEMENT_FILENAME");
        return {
            account: text(node, "BANK_STATEMENT_ACCOUNT_NUMBER") ?? "",
            currency: text(node, "CURRENCY_ISO4217") ?? "PLN",
            from: text(node, "BANK_STATEMENT_PERIOD_FROM") ?? "",
            to: text(node, "BANK_STATEMENT_PERIOD_TO") ?? "",
            status: text(node, "STATUS") ?? "",
            ...(filename === undefined ? {} : { filename }),
            folder: folderOf(node),
            operations: children(child(node, "BANK_OPERATIONS"), "BANK_OPERATION").map(operationOf),
        };
    });
