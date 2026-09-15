import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmount, parseAmount } from "../src/core/money.ts";

test("parseAmount reads every way a Polish bank or Saldeo writes money", () => {
    const cases: [string, number | undefined][] = [
        ["2460.00", 246_000],
        ["-1 234,56", -123_456],
        ["1.234,56", 123_456],
        ["1,234.56", 123_456],
        ["12 345 678,9", 1_234_567_890],
        ["0,5", 50],
        ["100", 10_000],
        ["-100", -10_000],
        ["(12,00)", -1_200],
        ["1 234,56 PLN", 123_456],
        ["", undefined],
        ["abc", undefined],
        ["12,345", 1_234_500],
    ];
    for (const [raw, expected] of cases) {
        assert.equal(parseAmount(raw), expected, raw);
    }
});

test("formatAmount groups thousands and keeps two decimals", () => {
    // Groups are joined with a no-break space, so a figure never wraps.
    assert.equal(formatAmount(123_456), "1 234,56");
    assert.equal(formatAmount(-5), "-0,05");
    assert.equal(formatAmount(100_000_000, "PLN"), "1 000 000,00 PLN");
});
