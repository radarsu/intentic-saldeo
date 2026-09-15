import type { Mapping } from "../contract.ts";
import { fold } from "./normalize.ts";

// What each bank's export looks like, and how to read it. A preset is recognised by its header; without one the
// generic guess maps columns by their names and the owner corrects it once in the mapping editor.

export interface Preset {
    readonly id: string;
    readonly label: string;
    readonly detect: (columns: readonly string[]) => boolean;
    readonly mapping: (columns: readonly string[]) => Mapping | undefined;
    // Cells that need reading beyond the mapping: PKO spreads one description over nameless columns.
    readonly refine?: (row: Readonly<Record<string, string>>) => Partial<{ title: string; counterparty: string; account: string }>;
}

const has = (columns: readonly string[], ...needles: readonly string[]): boolean =>
    needles.every((needle) => columns.some((column) => fold(column).includes(fold(needle))));

// The column for a needle, in needle order so the preferred name wins; for each needle an exact name beats a name
// that starts with it, which beats one that merely contains it ("Waluta" over "Kwota transakcji (waluta rachunku)").
export const pickColumn = (columns: readonly string[], ...needles: readonly string[]): string | undefined => {
    const folded = columns.map((column) => fold(column).replace(/\s*\(\d+\)$/, ""));
    for (const needle of needles) {
        const wanted = fold(needle);
        for (const test of [(name: string) => name === wanted, (name: string) => name.startsWith(wanted), (name: string) => name.includes(wanted)]) {
            const index = folded.findIndex(test);
            if (index >= 0) {
                return columns[index];
            }
        }
    }
    return undefined;
};

const DATE = ["data operacji", "data transakcji", "data ksiegowania", "data waluty", "data", "date"];
const AMOUNT = ["kwota transakcji (waluta rachunku)", "kwota operacji", "kwota transakcji", "kwota", "amount", "value"];
const TITLE = ["tytul", "opis transakcji", "opis operacji", "szczegoly", "opis", "title", "description"];
const COUNTERPARTY = [
    "dane kontrahenta",
    "nadawca/odbiorca",
    "nadawca / odbiorca",
    "nadawca",
    "odbiorca",
    "kontrahent",
    "nazwa odbiorcy",
    "nazwa nadawcy",
    "counterparty",
    "beneficiary",
    "payee",
    "payer",
];
const ACCOUNT = ["nr rachunku", "numer rachunku", "rachunek kontrahenta", "rachunek nadawcy", "rachunek odbiorcy", "rachunek docelowy", "numer konta", "konto", "iban", "account"];
const CURRENCY = ["waluta", "currency"];

// The best guess for any header: every role by its usual names; undefined when the two roles a file cannot do without
// (a date and an amount) are missing.
export const guessMapping = (columns: readonly string[]): Mapping | undefined => {
    const date = pickColumn(columns, ...DATE);
    const credit = pickColumn(columns, "uznania", "wplyw", "credit");
    const debit = pickColumn(columns, "obciazenia", "wydatek", "debit");
    const amount = credit !== undefined && debit !== undefined ? undefined : pickColumn(columns, ...AMOUNT);
    if (date === undefined || (amount === undefined && (credit === undefined || debit === undefined))) {
        return undefined;
    }
    const title = pickColumn(columns, ...TITLE) ?? date;
    const counterparty = pickColumn(columns, ...COUNTERPARTY);
    const account = pickColumn(columns, ...ACCOUNT);
    const currency = pickColumn(columns, ...CURRENCY);
    return {
        date,
        ...(amount === undefined ? {} : { amount }),
        ...(credit === undefined || debit === undefined ? {} : { credit, debit }),
        title,
        ...(counterparty === undefined ? {} : { counterparty }),
        ...(account === undefined ? {} : { account }),
        ...(currency === undefined ? {} : { currency }),
        defaultCurrency: "PLN",
    };
};

// `Nazwa odbiorcy: …`, `Tytuł: …`, `Rachunek nadawcy: …` spread across PKO's nameless columns.
const labelled = (cells: readonly string[], ...labels: readonly string[]): string | undefined => {
    for (const cell of cells) {
        const colon = cell.indexOf(":");
        if (colon < 0) {
            continue;
        }
        const label = fold(cell.slice(0, colon)).trim();
        if (labels.some((wanted) => label === fold(wanted))) {
            const value = cell.slice(colon + 1).trim();
            if (value !== "") {
                return value;
            }
        }
    }
    return undefined;
};

export const PRESETS: readonly Preset[] = [
    {
        id: "mbank",
        label: "mBank",
        detect: (columns) => has(columns, "data operacji", "opis operacji", "kwota") && has(columns, "saldo po operacji"),
        mapping: (columns) => {
            const guessed = guessMapping(columns);
            if (guessed === undefined) {
                return undefined;
            }
            // The eKonto export names the title and the counterparty; the newer "lista operacji" folds both into the
            // description, where the matcher's own extraction finds them.
            const title = pickColumn(columns, "tytul") ?? pickColumn(columns, "opis operacji") ?? guessed.title;
            const counterparty = pickColumn(columns, "nadawca/odbiorca");
            const account = pickColumn(columns, "numer konta");
            return {
                ...guessed,
                title,
                ...(counterparty === undefined ? {} : { counterparty }),
                ...(account === undefined ? {} : { account }),
            };
        },
        refine: (row) => {
            // "PRZELEW PRZYCHODZĄCY   ACME SP. Z O.O.   FV/12/2026" — runs of two or more spaces separate the parts.
            const description = row["Opis operacji"] ?? "";
            const parts = description
                .split(/\s{2,}/)
                .map((part) => part.trim())
                .filter((part) => part !== "");
            if (parts.length < 2 || row["Tytuł"] !== undefined) {
                return {};
            }
            const counterparty = parts[1];
            const title = parts.slice(2).join(" ");
            return { ...(counterparty === undefined ? {} : { counterparty }), ...(title === "" ? {} : { title }) };
        },
    },
    {
        id: "pko",
        label: "PKO BP",
        detect: (columns) => has(columns, "data operacji", "data waluty", "typ transakcji", "kwota", "opis transakcji"),
        mapping: (columns) => {
            const guessed = guessMapping(columns);
            return guessed === undefined ? undefined : { ...guessed, title: pickColumn(columns, "opis transakcji") ?? guessed.title };
        },
        refine: (row) => {
            const cells = Object.values(row);
            const counterparty = labelled(cells, "Nazwa odbiorcy", "Nazwa nadawcy", "Nazwa kontrahenta");
            const account = labelled(cells, "Rachunek odbiorcy", "Rachunek nadawcy", "Nr rachunku");
            const title = labelled(cells, "Tytuł", "Tytuł przelewu");
            return {
                ...(counterparty === undefined ? {} : { counterparty }),
                ...(account === undefined ? {} : { account }),
                ...(title === undefined ? {} : { title }),
            };
        },
    },
    {
        id: "ing",
        label: "ING",
        detect: (columns) => has(columns, "data transakcji", "dane kontrahenta", "tytul", "kwota transakcji"),
        mapping: (columns) => {
            const guessed = guessMapping(columns);
            if (guessed === undefined) {
                return undefined;
            }
            const currency = pickColumn(columns, "waluta");
            return {
                ...guessed,
                amount: pickColumn(columns, "kwota transakcji (waluta rachunku)") ?? guessed.amount ?? "",
                title: pickColumn(columns, "tytul") ?? guessed.title,
                ...(currency === undefined ? {} : { currency }),
            };
        },
    },
    {
        id: "pekao",
        label: "Bank Pekao",
        detect: (columns) => has(columns, "data ksiegowania", "tytulem", "kwota operacji"),
        mapping: (columns) => {
            const guessed = guessMapping(columns);
            if (guessed === undefined) {
                return undefined;
            }
            const account = pickColumn(columns, "rachunek zrodlowy") ?? pickColumn(columns, "rachunek docelowy");
            return { ...guessed, title: pickColumn(columns, "tytulem") ?? guessed.title, ...(account === undefined ? {} : { account }) };
        },
    },
    {
        id: "santander",
        label: "Santander",
        detect: (columns) => has(columns, "data operacji", "opis", "kwota") && has(columns, "nadawca") && !has(columns, "saldo po operacji"),
        mapping: guessMapping,
    },
];

export const detectPreset = (columns: readonly string[]): Preset | undefined => PRESETS.find((preset) => preset.detect(columns));

export const presetById = (id: string | undefined): Preset | undefined => (id === undefined ? undefined : PRESETS.find((preset) => preset.id === id));
