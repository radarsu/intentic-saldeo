// Money as integer grosze, the one representation every half agrees on; a float never reaches a comparison.

// "2460.00", "-1 234,56", "1.234,56", "1,234.56" → grosze. Undefined for anything that is not a number.
export const parseAmount = (raw: string | undefined): number | undefined => {
    if (raw === undefined) {
        return undefined;
    }
    let value = raw.replace(/[\s  ]/g, "").replace(/(PLN|EUR|USD|GBP|CHF|zł)$/i, "");
    if (value === "" || value === "-") {
        return undefined;
    }
    const negative = value.startsWith("-") || (value.startsWith("(") && value.endsWith(")"));
    value = value.replace(/^[-+(]|\)$/g, "");
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    // The rightmost separator is the decimal one when it is followed by exactly two digits; every other separator groups.
    const decimalAt = Math.max(lastComma, lastDot);
    let whole = value;
    let fraction = "";
    if (decimalAt >= 0 && /^\d{1,2}$/.test(value.slice(decimalAt + 1))) {
        whole = value.slice(0, decimalAt);
        fraction = value.slice(decimalAt + 1).padEnd(2, "0");
    }
    whole = whole.replace(/[.,]/g, "");
    if (!/^\d*$/.test(whole) || !/^\d{0,2}$/.test(fraction) || (whole === "" && fraction === "")) {
        return undefined;
    }
    const grosze = Number.parseInt(`${whole === "" ? "0" : whole}${fraction === "" ? "00" : fraction}`, 10);
    return negative ? -grosze : grosze;
};

export const formatAmount = (grosze: number, currency?: string): string => {
    const sign = grosze < 0 ? "-" : "";
    const abs = Math.abs(grosze);
    // A no-break space between groups, so a figure never wraps in a table cell.
    const whole = Math.floor(abs / 100)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
    const text = `${sign}${whole},${(abs % 100).toString().padStart(2, "0")}`;
    return currency === undefined ? text : `${text} ${currency}`;
};

// Saldeo's own decimal ("2460.00"), which never carries a thousands separator.
export const saldeoAmount = (raw: string | undefined): number => {
    const value = parseAmount(raw);
    return value ?? 0;
};
