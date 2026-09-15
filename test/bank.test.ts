import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { columnNames, findHeaderRow, parseRows, sniffDelimiter, sniffEncoding } from "../src/core/bank/csv.ts";
import { buildTransactions, inspectFile } from "../src/core/bank/import.ts";
import { extractAccounts, extractNips, isNip, nameTokens, normalizeAccount, normalizeDate, tokenOverlap } from "../src/core/bank/normalize.ts";
import { detectPreset, guessMapping } from "../src/core/bank/presets.ts";

/* The fixtures are byte-faithful to each bank's export shape: mBank and ING in windows-1250, PKO in UTF-8 with a BOM. */
const bytes = async (name: string) => new Uint8Array(await readFile(new URL(`./fixtures/bank/${name}`, import.meta.url)));

test("sniffing: encoding, delimiter, header row", async () => {
    assert.equal(sniffEncoding(await bytes("mbank.csv")), "windows-1250");
    assert.equal(sniffEncoding(await bytes("ing.csv")), "windows-1250");
    assert.equal(sniffEncoding(await bytes("pko.csv")), "utf-8");
    assert.equal(sniffEncoding(await bytes("generic.csv")), "utf-8");
    assert.equal(sniffEncoding(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x3b, 0x00])), "utf-16le");
    assert.equal(sniffDelimiter(`a;b;c\n1;2;3\n`), ";");
    assert.equal(sniffDelimiter(`"a, b","c","d"\n"1, 2","3","4"\n`), ",");
    assert.equal(sniffDelimiter(`a\tb\tc\n1\t2\t3\n`), "\t");
    const rows = parseRows(`x;\nLista;\n"Data";"Kwota";"Tytuł";\n2026-01-01;1;a;\n2026-01-02;2;b;\n`, ";");
    assert.equal(findHeaderRow(rows), 2);
    assert.deepEqual(columnNames(["#Data", "", "Waluta", "Waluta", "Waluta"]), ["Data", "#2", "Waluta", "Waluta (2)", "Waluta (3)"]);
});

test("parseRows keeps quoted delimiters, doubled quotes and newlines inside quotes", () => {
    assert.deepEqual(parseRows(`a,"b,c","say ""hi""","line\nbreak"\r\n1,2,3,4`, ","), [
        ["a", "b,c", `say "hi"`, "line\nbreak"],
        ["1", "2", "3", "4"],
    ]);
});

test("mBank: cp1250 preamble, the newer 'lista operacji' shape, counterparty and title split out of the description", async () => {
    const inspection = inspectFile(await bytes("mbank.csv"), "mbank.csv");
    assert.equal(inspection.file.preset, "mbank");
    assert.equal(inspection.file.delimiter, ";");
    assert.deepEqual(inspection.file.columns.slice(0, 6), ["Data operacji", "Opis operacji", "Rachunek", "Kategoria", "Kwota", "Saldo po operacji"]);
    assert.equal(inspection.file.rows, 3, "the #Saldo końcowe footer is not a row");
    assert.ok(inspection.mapping);
    assert.equal(inspection.mapping.date, "Data operacji");
    assert.equal(inspection.mapping.amount, "Kwota");
    const { transactions, skipped } = buildTransactions(inspection.file, inspection.rows, inspection.mapping);
    assert.deepEqual(skipped, []);
    assert.deepEqual(
        transactions.map((entry) => [entry.date, entry.amount, entry.counterparty, entry.title]),
        [
            ["2026-08-03", 123_000, "ACME SP. Z O.O.", "FV/12/2026 zapłata"],
            ["2026-08-05", -49_200, "BORACLE POLSKA SP Z OO", "FV/101/2016"],
            ["2026-08-07", -2_500, undefined, "OPŁATA ZA PROWADZENIE RACHUNKU"],
        ],
    );
    assert.equal(transactions[0]?.currency, "PLN");
    assert.match(transactions[0]?.id ?? "", /^t1-[0-9a-f]{8}$/);
});

test("PKO BP: quoted comma CSV with a BOM, description spread over nameless columns", async () => {
    const inspection = inspectFile(await bytes("pko.csv"), "pko.csv");
    assert.equal(inspection.file.preset, "pko");
    assert.equal(inspection.file.delimiter, ",");
    assert.equal(inspection.file.headerRow, 0);
    assert.ok(inspection.mapping);
    const { transactions, skipped } = buildTransactions(inspection.file, inspection.rows, inspection.mapping);
    assert.deepEqual(skipped, []);
    assert.deepEqual(
        transactions.map((entry) => [entry.amount, entry.counterparty, entry.counterpartyAccount, entry.title]),
        [
            [123_000, "ACME SP. Z O.O.", "PL61109010140000071219812874", "FV/12/2026 zapłata"],
            [-49_200, "BORACLE POLSKA SP Z OO", "PL11616708745332741277000000", "FV/101/2016"],
            [-990, undefined, undefined, "Opłata za przelew"],
        ],
    );
});

test("ING: cp1250 with a preamble, repeated 'Waluta' headers, quoted account numbers", async () => {
    const inspection = inspectFile(await bytes("ing.csv"), "ing.csv");
    assert.equal(inspection.file.preset, "ing");
    assert.equal(inspection.file.headerRow, 5);
    assert.ok(inspection.mapping);
    assert.equal(inspection.mapping.amount, "Kwota transakcji (waluta rachunku)");
    assert.equal(inspection.mapping.currency, "Waluta");
    assert.equal(inspection.mapping.account, "Nr rachunku");
    const { transactions } = buildTransactions(inspection.file, inspection.rows, inspection.mapping);
    assert.deepEqual(
        transactions.map((entry) => [entry.date, entry.amount, entry.currency, entry.counterparty, entry.counterpartyAccount, entry.title]),
        [
            ["2026-08-03", 123_000, "PLN", "ACME SP. Z O.O.", "PL61109010140000071219812874", "FV/12/2026 zapłata"],
            ["2026-08-05", -49_200, "PLN", "BORACLE POLSKA SP Z OO", "PL11616708745332741277000000", "FV/101/2016"],
        ],
    );
});

test("an unknown bank: columns guessed by name, English headers, thousands separators, DD/MM/YYYY", async () => {
    const inspection = inspectFile(await bytes("generic.csv"), "generic.csv");
    assert.equal(inspection.file.preset, undefined);
    assert.ok(inspection.mapping);
    assert.deepEqual(inspection.mapping, {
        date: "Date",
        amount: "Amount",
        title: "Description",
        counterparty: "Counterparty",
        account: "Account",
        currency: "Currency",
        defaultCurrency: "PLN",
    });
    const { transactions } = buildTransactions(inspection.file, inspection.rows, inspection.mapping);
    assert.deepEqual(
        transactions.map((entry) => [entry.date, entry.amount, entry.currency, entry.counterpartyAccount]),
        [
            ["2026-08-03", 123_000, "EUR", "GB29NWBK60161331926819"],
            ["2026-08-05", -49_200, "PLN", "PL11616708745332741277000000"],
        ],
    );
});

test("separate credit and debit columns become one signed amount; a row without a date is reported, not dropped silently", () => {
    const columns = ["Data", "Uznania", "Obciążenia", "Tytuł"];
    const mapping = guessMapping(columns);
    assert.ok(mapping);
    assert.equal(mapping.amount, undefined);
    assert.equal(mapping.credit, "Uznania");
    assert.equal(mapping.debit, "Obciążenia");
    const file = { name: "x.csv", bytes: 0, encoding: "utf-8", delimiter: ";", headerRow: 0, columns, rows: 3 };
    const { transactions, skipped } = buildTransactions(
        file,
        [
            ["01.02.2026", "100,00", "", "wpłata"],
            ["02.02.2026", "", "40,00", "wypłata"],
            ["", "1,00", "", "bez daty"],
        ],
        mapping,
    );
    assert.deepEqual(
        transactions.map((entry) => entry.amount),
        [10_000, -4_000],
    );
    assert.deepEqual(skipped, [{ row: 3, reason: `no date in "Data"` }]);
    assert.equal(detectPreset(columns), undefined);
});

test("normalize: dates, accounts, NIPs, name tokens", () => {
    assert.equal(normalizeDate("03.08.2026"), "2026-08-03");
    assert.equal(normalizeDate("2026-08-03 12:00"), "2026-08-03");
    assert.equal(normalizeDate("3/8/2026"), "2026-08-03");
    assert.equal(normalizeDate("20260803"), "2026-08-03");
    assert.equal(normalizeDate("not a date"), undefined);
    assert.equal(normalizeAccount("61 1090 1014 0000 0712 1981 2874"), "PL61109010140000071219812874");
    assert.equal(normalizeAccount("'PL61109010140000071219812874'"), "PL61109010140000071219812874");
    assert.equal(normalizeAccount("123"), undefined);
    assert.deepEqual(extractAccounts("Rachunek nadawcy: 61 1090 1014 0000 0712 1981 2874, tytuł: x"), ["PL61109010140000071219812874"]);
    // Checksum-valid ids from SaldeoSMART's own examples; the last digit changed fails, as does the obvious fake.
    assert.equal(isNip("5270201490"), true);
    assert.equal(isNip("5270201491"), false);
    assert.equal(isNip("1234567890"), false);
    assert.deepEqual(extractNips("NIP 527-020-14-90 tel 601234567 kwota 1234567890"), ["5270201490"]);
    assert.deepEqual(nameTokens("BORACLE POLSKA Sp. z o.o."), ["boracle", "polska"]);
    assert.deepEqual(nameTokens("ACME SP. Z O.O."), ["acme"]);
    assert.equal(tokenOverlap(["boracle", "polska"], ["boracle", "polska", "sp"]), 1);
    assert.equal(tokenOverlap(["x"], []), 0);
});
