// Reading a bank's CSV export without being told anything about it: which encoding the bytes are in, which
// delimiter separates cells, and which row is the header (banks write a preamble first). Pure functions over bytes
// and text.

export type Encoding = "utf-8" | "windows-1250" | "utf-16le" | "utf-16be";

const utf8Strict = new TextDecoder("utf-8", { fatal: true });

// A BOM decides; UTF-16 shows as every other byte being zero; otherwise UTF-8 if it decodes, else windows-1250, the
// legacy code page every Polish bank still exports in.
export const sniffEncoding = (bytes: Uint8Array): Encoding => {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return "utf-16le";
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return "utf-16be";
    }
    const sample = bytes.subarray(0, 4096);
    let evenZeros = 0;
    let oddZeros = 0;
    for (let index = 0; index < sample.length; index += 1) {
        if (sample[index] === 0) {
            if (index % 2 === 0) {
                evenZeros += 1;
            } else {
                oddZeros += 1;
            }
        }
    }
    if (oddZeros > sample.length / 8) {
        return "utf-16le";
    }
    if (evenZeros > sample.length / 8) {
        return "utf-16be";
    }
    try {
        utf8Strict.decode(bytes);
        return "utf-8";
    } catch {
        return "windows-1250";
    }
};

export const decodeText = (bytes: Uint8Array, encoding: Encoding): string => new TextDecoder(encoding).decode(bytes).replace(/^﻿/, "");

const DELIMITERS = [";", ",", "\t", "|"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

// Counts each candidate outside quotes on the first lines; the winner is the one that appears on the most lines with
// the same count, so a description full of commas can't outvote the semicolons that structure the file.
export const sniffDelimiter = (text: string): Delimiter => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "").slice(0, 40);
    let best: { delimiter: Delimiter; score: number } = { delimiter: ";", score: -1 };
    for (const delimiter of DELIMITERS) {
        const counts = lines.map((line) => {
            let inQuotes = false;
            let count = 0;
            for (const char of line) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === delimiter && !inQuotes) {
                    count += 1;
                }
            }
            return count;
        });
        const tally = new Map<number, number>();
        for (const count of counts) {
            if (count > 0) {
                tally.set(count, (tally.get(count) ?? 0) + 1);
            }
        }
        let score = 0;
        for (const [count, lines] of tally) {
            score = Math.max(score, lines * Math.min(count, 12));
        }
        if (score > best.score) {
            best = { delimiter, score };
        }
    }
    return best.delimiter;
};

// RFC 4180 with the field-level tolerance banks need: quotes anywhere in a cell, doubled quotes, newlines inside
// quotes, CRLF or LF, a trailing delimiter producing an empty last cell.
export const parseRows = (text: string, delimiter: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index] as string;
        if (inQuotes) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    cell += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += char;
            }
            continue;
        }
        if (char === '"') {
            inQuotes = true;
        } else if (char === delimiter) {
            row.push(cell);
            cell = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[index + 1] === "\n") {
                index += 1;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += char;
        }
    }
    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows.map((cells) => cells.map((value) => value.trim()));
};

const HEADER_WORDS = /data|kwota|tytu|opis|kontrahent|rachun|saldo|waluta|nadawca|odbiorca|amount|date|title|description|account/i;

const filled = (row: readonly string[]): number => row.filter((cell) => cell !== "").length;

// The header is the first row with at least three named cells whose words look like column names and whose next two
// non-empty rows are about as wide; a bank's preamble ("Lista operacji", account number, period) never satisfies all
// three. Only the next two rows are judged so a short file's footer can't disqualify its header.
export const findHeaderRow = (rows: readonly (readonly string[])[]): number => {
    let widest = 0;
    for (let index = 0; index < Math.min(rows.length, 60); index += 1) {
        const row = rows[index] as readonly string[];
        if (filled(row) < 3) {
            continue;
        }
        if (widest === 0) {
            widest = index;
        }
        const words = row.filter((cell) => HEADER_WORDS.test(cell)).length;
        if (words < 2) {
            continue;
        }
        const following = rows
            .slice(index + 1)
            .filter((next) => filled(next) > 0)
            .slice(0, 2);
        if (following.length === 0 || following.some((next) => filled(next) < Math.min(3, filled(row) - 1))) {
            continue;
        }
        return index;
    }
    return widest;
};

// Column names as the mapping refers to them: the header's text with a bank's decoration stripped (mBank's `#`),
// de-duplicated (ING repeats "Waluta" four times), and `#<n>` for a nameless column.
export const columnNames = (header: readonly string[]): string[] => {
    const seen = new Map<string, number>();
    return header.map((raw, index) => {
        const base = raw.replace(/^#/, "").trim();
        const name = base === "" ? `#${index + 1}` : base;
        const count = seen.get(name) ?? 0;
        seen.set(name, count + 1);
        return count === 0 ? name : `${name} (${count + 1})`;
    });
};
