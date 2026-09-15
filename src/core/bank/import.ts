import { createHash } from "node:crypto";
import type { ImportedFile, Mapping, Transaction } from "../contract.ts";
import { parseAmount } from "../money.ts";
import { columnNames, decodeText, type Encoding, findHeaderRow, parseRows, sniffDelimiter, sniffEncoding } from "./csv.ts";
import { extractAccounts, normalizeAccount, normalizeDate } from "./normalize.ts";
import { detectPreset, guessMapping, presetById } from "./presets.ts";

// From a file's bytes to transactions, in two steps the owner can see between: inspect (what is this file, which
// columns, which mapping do we propose) and build (the mapping applied, one transaction per usable row).

export interface Inspection {
    readonly file: ImportedFile;
    readonly mapping: Mapping | undefined;
    readonly preview: readonly (readonly string[])[];
    readonly rows: readonly (readonly string[])[];
}

const PREVIEW_ROWS = 8;

// The rows after the header up to the first one that cannot be a transaction (a blank line, mBank's `#Saldo końcowe`
// footer): a transaction needs at least a date and an amount, so two filled cells.
const bodyRows = (rows: readonly (readonly string[])[]): (readonly string[])[] => {
    const body: (readonly string[])[] = [];
    for (const row of rows) {
        const filled = row.filter((cell) => cell !== "").length;
        if (filled < 2) {
            if (body.length > 0) {
                break;
            }
            continue;
        }
        body.push(row);
    }
    return body;
};

export const inspectFile = (bytes: Uint8Array, name: string): Inspection => {
    const encoding: Encoding = sniffEncoding(bytes);
    const text = decodeText(bytes, encoding);
    const delimiter = sniffDelimiter(text);
    const all = parseRows(text, delimiter);
    const headerRow = findHeaderRow(all);
    const columns = columnNames(all[headerRow] ?? []);
    const preset = detectPreset(columns);
    const body = bodyRows(all.slice(headerRow + 1));
    const mapping = preset?.mapping(columns) ?? guessMapping(columns);
    return {
        file: {
            name,
            bytes: bytes.length,
            encoding,
            delimiter,
            headerRow,
            columns,
            ...(preset === undefined ? {} : { preset: preset.id }),
            rows: body.length,
        },
        mapping,
        preview: body.slice(0, PREVIEW_ROWS),
        rows: body,
    };
};

const cellsOf = (columns: readonly string[], row: readonly string[]): Record<string, string> => {
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
        record[column] = row[index] ?? "";
    });
    return record;
};

export interface BuildResult {
    readonly transactions: readonly Transaction[];
    // Rows the mapping could not read as a transaction, with why, for the owner to see rather than lose.
    readonly skipped: readonly { readonly row: number; readonly reason: string }[];
}

// Applies a mapping over the body rows. `row` numbers are 1-based positions in the file's body, stable across re-runs;
// the id also hashes the row's content so a re-import of an edited file does not carry old decisions onto new rows.
export const buildTransactions = (file: ImportedFile, rows: readonly (readonly string[])[], mapping: Mapping): BuildResult => {
    const preset = presetById(file.preset);
    const transactions: Transaction[] = [];
    const skipped: { row: number; reason: string }[] = [];
    rows.forEach((row, index) => {
        const number = index + 1;
        const cells = cellsOf(file.columns, row);
        const date = normalizeDate(cells[mapping.date]);
        if (date === undefined) {
            skipped.push({ row: number, reason: `no date in "${mapping.date}"` });
            return;
        }
        let amount: number | undefined;
        if (mapping.amount !== undefined) {
            amount = parseAmount(cells[mapping.amount]);
        } else if (mapping.credit !== undefined && mapping.debit !== undefined) {
            const credit = parseAmount(cells[mapping.credit]) ?? 0;
            const debit = parseAmount(cells[mapping.debit]) ?? 0;
            amount = Math.abs(credit) - Math.abs(debit);
        }
        if (amount === undefined || amount === 0) {
            skipped.push({ row: number, reason: amount === 0 ? "zero amount" : "no readable amount" });
            return;
        }
        const refined = preset?.refine?.(cells) ?? {};
        const title = (refined.title ?? cells[mapping.title] ?? "").replace(/\s+/g, " ").trim();
        const counterparty = (refined.counterparty ?? (mapping.counterparty === undefined ? undefined : cells[mapping.counterparty]))?.replace(/\s+/g, " ").trim();
        const accountRaw = refined.account ?? (mapping.account === undefined ? undefined : cells[mapping.account]);
        const counterpartyAccount = normalizeAccount(accountRaw) ?? extractAccounts(accountRaw ?? "")[0] ?? extractAccounts(title)[0];
        const currency = (mapping.currency === undefined ? undefined : cells[mapping.currency]?.trim().toUpperCase()) || mapping.defaultCurrency;
        const id = `t${number}-${createHash("sha1").update(`${date}|${amount}|${title}|${counterparty ?? ""}`).digest("hex").slice(0, 8)}`;
        transactions.push({
            id,
            row: number,
            date,
            amount,
            currency,
            ...(counterparty === undefined || counterparty === "" ? {} : { counterparty }),
            ...(counterpartyAccount === undefined ? {} : { counterpartyAccount }),
            title,
        });
    });
    return { transactions, skipped };
};
