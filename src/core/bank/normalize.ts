// Turning what a bank or a person typed into what the matcher compares: dates, account numbers, tax ids, and the
// text of a title stripped down to its tokens.

// DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD, and any of those inside a longer cell.
export const normalizeDate = (raw: string | undefined): string | undefined => {
    if (raw === undefined) {
        return undefined;
    }
    const value = raw.trim();
    let match = /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/.exec(value);
    if (match !== null) {
        return iso(match[1], match[2], match[3]);
    }
    match = /(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})/.exec(value);
    if (match !== null) {
        return iso(match[3], match[2], match[1]);
    }
    match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (match !== null) {
        return iso(match[1], match[2], match[3]);
    }
    return undefined;
};

const iso = (year: string | undefined, month: string | undefined, day: string | undefined): string | undefined => {
    const y = Number.parseInt(year ?? "", 10);
    const m = Number.parseInt(month ?? "", 10);
    const d = Number.parseInt(day ?? "", 10);
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) {
        return undefined;
    }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// Spaces out, upper-case, and a bare 26-digit Polish NRB gets its PL prefix, so the same account written three ways
// compares equal.
export const normalizeAccount = (raw: string | undefined): string | undefined => {
    if (raw === undefined) {
        return undefined;
    }
    // ING wraps account numbers in single quotes to stop spreadsheets reading them as numbers.
    const compact = raw.replace(/[\s'"-]/g, "").toUpperCase();
    if (/^\d{26}$/.test(compact)) {
        return `PL${compact}`;
    }
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) {
        return compact;
    }
    return undefined;
};

export const extractAccounts = (text: string): string[] => {
    const found: string[] = [];
    for (const match of text.matchAll(/\b(?:[A-Z]{2}\s?\d{2}|\d{2})(?:\s?\d{4}){6}\b/g)) {
        const account = normalizeAccount(match[0]);
        if (account !== undefined && !found.includes(account)) {
            found.push(account);
        }
    }
    return found;
};

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export const isNip = (digits: string): boolean => {
    if (!/^\d{10}$/.test(digits)) {
        return false;
    }
    const sum = NIP_WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
    return sum % 11 === Number(digits[9]);
};

export const normalizeNip = (raw: string | undefined): string | undefined => {
    if (raw === undefined) {
        return undefined;
    }
    const digits = raw.replace(/^PL/i, "").replace(/[\s-]/g, "");
    return isNip(digits) ? digits : undefined;
};

// Every checksum-valid ten-digit run in a text; a phone number or an amount fails the checksum ten times in eleven.
export const extractNips = (text: string): string[] => {
    const found: string[] = [];
    for (const match of text.matchAll(/(?<!\d)(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}|\d{3}[-\s]?\d{2}[-\s]?\d{2}[-\s]?\d{3}|\d{10})(?!\d)/g)) {
        const nip = normalizeNip(match[1]);
        if (nip !== undefined && !found.includes(nip)) {
            found.push(nip);
        }
    }
    return found;
};

const DIACRITICS: Readonly<Record<string, string>> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

export const fold = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[ąćęłńóśźż]/g, (char) => DIACRITICS[char] ?? char)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");

const NAME_NOISE = new Set(["sp", "z", "o", "oo", "s", "a", "sa", "spolka", "sc", "spj", "spk", "firma", "i", "the", "ltd", "gmbh", "przelew", "zoo"]);

// A company name as tokens that survive a bank's truncation and upper-casing: folded, legal-form words dropped.
export const nameTokens = (value: string | undefined): string[] =>
    value === undefined
        ? []
        : fold(value)
              .split(/[^a-z0-9]+/)
              .filter((token) => token.length >= 2 && !NAME_NOISE.has(token));

export const tokenOverlap = (left: readonly string[], right: readonly string[]): number => {
    if (left.length === 0 || right.length === 0) {
        return 0;
    }
    const set = new Set(right);
    const shared = left.filter((token) => set.has(token)).length;
    return shared / Math.min(left.length, right.length);
};
