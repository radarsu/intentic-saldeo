import type { Allocation, Direction, OpenInvoice, Proposal, SessionItem, Transaction, Verdict } from "../contract.ts";
import { daysBetween, extractAccounts, extractNips, fold, nameTokens, tokenOverlap } from "../bank/normalize.ts";

// The deterministic matcher: for one bank transaction, which open invoices could it have paid, how sure, and why.
// Scores add evidence the owner can read back as reasons; verdicts are thresholds over the scores. Nothing here
// decides: a proposal is a proposal until the owner confirms it.

export interface MatchOptions {
    // Largest set of one contractor's invoices tried as a group payment.
    readonly maxGroup?: number;
}

const SCORE_NUMBER = 60;
const SCORE_NUMBER_CORE = 40;
const SCORE_AMOUNT_REMAINING = 30;
const SCORE_AMOUNT_TOTAL = 25;
const SCORE_AMOUNT_NEAR = 10;
const SCORE_NIP = 25;
const SCORE_ACCOUNT = 25;
const SCORE_NAME = 20;
const SCORE_DATE_PLAUSIBLE = 5;
const PENALTY_BEFORE_ISSUE = -30;
const PENALTY_STALE = -5;
const CONFIDENT = 80;
const CONFIDENT_GAP = 20;
const AMBIGUOUS = 50;
const KEEP = 30;
const MAX_PROPOSALS = 5;

// Words that mark a bank's own charges, tax and internal moves; such a row is proposed as ignorable unless an invoice
// number says otherwise.
const NOT_AN_INVOICE = /prowizj|op[łl]ata (za|miesi)|odsetk|\bzus\b|urz[ąa]d skarbowy|podatek|\bpit\b|\bvat-7|\bcit\b|kapitalizacj|przelew w[łl]asny|w[łl]asne konto|sp[łl]ata karty|wyp[łl]ata got|bankomat|blik p2p/i;

interface NumberForms {
    readonly full: string;
    readonly fullFlat: string;
    readonly core: string;
    readonly coreFlat: string;
}

const SEPARATORS = /[\/\-_.\\]/g;

// "FV/12/2026" → full "fv/12/2026", flat "fv122026", core "12/2026", core flat "122026": what a payer types, in
// whichever of those shapes, with letters and separators dropped as they usually are.
export const numberForms = (number: string): NumberForms => {
    const full = fold(number).replace(/\s+/g, "");
    const core = full.replace(/^[a-z]+[\/\-_.\\]*/, "");
    return { full, fullFlat: full.replace(SEPARATORS, ""), core, coreFlat: core.replace(SEPARATORS, "") };
};

// `needle` inside `hay` with no digit touching it on either side, so "12/2026" is not found inside "112/2026".
const containsBounded = (hay: string, needle: string): boolean => {
    if (needle === "") {
        return false;
    }
    let from = 0;
    for (;;) {
        const index = hay.indexOf(needle, from);
        if (index < 0) {
            return false;
        }
        const before = hay[index - 1];
        const after = hay[index + needle.length];
        if (!(before !== undefined && /\d/.test(before)) && !(after !== undefined && /\d/.test(after))) {
            return true;
        }
        from = index + 1;
    }
};

interface TitleForms {
    readonly compact: string;
    readonly flat: string;
}

const titleForms = (title: string): TitleForms => {
    const compact = fold(title).replace(/\s+/g, "");
    return { compact, flat: compact.replace(SEPARATORS, "") };
};

// How an invoice number shows in a title: the whole number (letters included) is strong; the digits-and-separators
// core alone is weaker, and too short a core (one group of digits) is no evidence at all.
const numberEvidence = (title: TitleForms, number: string): { score: number; reason: string } | undefined => {
    const forms = numberForms(number);
    if (forms.full.length >= 3 && (containsBounded(title.compact, forms.full) || (forms.fullFlat.length >= 5 && containsBounded(title.flat, forms.fullFlat)))) {
        return { score: SCORE_NUMBER, reason: `invoice number ${number} is in the title` };
    }
    const groups = forms.core.split(SEPARATORS).filter((group) => group !== "");
    if (forms.core !== forms.full && groups.length >= 2 && (containsBounded(title.compact, forms.core) || (forms.coreFlat.length >= 5 && containsBounded(title.flat, forms.coreFlat)))) {
        return { score: SCORE_NUMBER_CORE, reason: `the number's digits ${forms.core} are in the title` };
    }
    return undefined;
};

const directionOf = (transaction: Transaction): Direction => (transaction.amount >= 0 ? "in" : "out");

interface Evidence {
    readonly invoice: OpenInvoice;
    readonly score: number;
    readonly reasons: string[];
    readonly number: boolean;
    readonly amountExact: boolean;
    readonly contractor: boolean;
    // Identified by NIP or account, not merely a similar name.
    readonly contractorStrong: boolean;
}

const evidenceFor = (transaction: Transaction, invoice: OpenInvoice, facts: TransactionFacts): Evidence => {
    const reasons: string[] = [];
    let score = 0;
    let numberHit = false;
    let amountExact = false;
    let contractor = false;
    let contractorStrong = false;

    const number = numberEvidence(facts.title, invoice.number);
    if (number !== undefined) {
        score += number.score;
        reasons.push(number.reason);
        numberHit = true;
    }

    if (facts.magnitude === invoice.remaining) {
        score += SCORE_AMOUNT_REMAINING;
        reasons.push(invoice.paid > 0 ? "amount equals what is still owed" : "amount equals the invoice");
        amountExact = true;
    } else if (facts.magnitude === invoice.total) {
        score += SCORE_AMOUNT_TOTAL;
        reasons.push("amount equals the invoice total, though part was already paid");
        amountExact = true;
    } else if (Math.abs(facts.magnitude - invoice.remaining) <= Math.max(200, Math.round(invoice.remaining * 0.01))) {
        score += SCORE_AMOUNT_NEAR;
        reasons.push("amount is within rounding of what is owed");
    }

    const nip = invoice.contractor?.nip;
    if (nip !== undefined && facts.nips.includes(nip)) {
        score += SCORE_NIP;
        reasons.push(`the contractor's NIP ${nip} is in the title`);
        contractor = true;
        contractorStrong = true;
    }
    const accounts = new Set([...(invoice.contractor?.bankAccounts ?? []), ...invoice.bankAccounts].map((account) => account.replace(/\s/g, "").toUpperCase()));
    const paidFrom = facts.accounts.find((account) => accounts.has(account));
    if (paidFrom !== undefined) {
        score += SCORE_ACCOUNT;
        reasons.push(`the account ${paidFrom} belongs to the contractor`);
        contractor = true;
        contractorStrong = true;
    }
    if (!contractor) {
        const overlap = Math.max(tokenOverlap(facts.nameTokens, nameTokens(invoice.contractor?.name)), tokenOverlap(facts.titleTokens, nameTokens(invoice.contractor?.name)));
        if (overlap >= 0.5 && invoice.contractor?.name !== undefined) {
            score += Math.round(SCORE_NAME * overlap);
            reasons.push(`the name matches ${invoice.contractor.name}`);
            contractor = true;
        }
    }

    if (invoice.issueDate !== "" && transaction.date < invoice.issueDate) {
        score += PENALTY_BEFORE_ISSUE;
        reasons.push(`paid ${daysBetween(transaction.date, invoice.issueDate)} days before the invoice was issued`);
    } else if (invoice.dueDate !== undefined) {
        const late = daysBetween(invoice.dueDate, transaction.date);
        if (late >= -60 && late <= 90) {
            score += SCORE_DATE_PLAUSIBLE;
        } else if (late > 180) {
            score += PENALTY_STALE;
            reasons.push(`${late} days after the due date`);
        }
    }

    return { invoice, score: Math.max(0, Math.min(100, score)), reasons, number: numberHit, amountExact, contractor, contractorStrong };
};

interface TransactionFacts {
    readonly magnitude: number;
    readonly title: TitleForms;
    readonly titleTokens: readonly string[];
    readonly nameTokens: readonly string[];
    readonly nips: readonly string[];
    readonly accounts: readonly string[];
}

const factsOf = (transaction: Transaction): TransactionFacts => {
    const text = `${transaction.counterparty ?? ""} ${transaction.title}`;
    return {
        magnitude: Math.abs(transaction.amount),
        title: titleForms(transaction.title),
        titleTokens: nameTokens(transaction.title),
        nameTokens: nameTokens(transaction.counterparty),
        nips: extractNips(text),
        accounts: [...(transaction.counterpartyAccount === undefined ? [] : [transaction.counterpartyAccount]), ...extractAccounts(text)],
    };
};

const allocationFor = (evidence: Evidence, magnitude: number): { allocation: Allocation; reasons: string[] } => {
    const { invoice } = evidence;
    if (magnitude < invoice.remaining) {
        return { allocation: { invoiceId: invoice.id, amount: magnitude }, reasons: [`partial payment: ${invoice.remaining - magnitude} grosze would stay open`] };
    }
    if (magnitude > invoice.remaining) {
        return { allocation: { invoiceId: invoice.id, amount: invoice.remaining }, reasons: [`overpays by ${magnitude - invoice.remaining} grosze`] };
    }
    return { allocation: { invoiceId: invoice.id, amount: magnitude }, reasons: [] };
};

// Subsets of up to `maxGroup` invoices whose open amounts sum to the target; the first few found, smallest first.
const subsetsSummingTo = (invoices: readonly OpenInvoice[], target: number, maxGroup: number): OpenInvoice[][] => {
    const sorted = [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate)).slice(0, 24);
    const found: OpenInvoice[][] = [];
    const walk = (start: number, remaining: number, chosen: OpenInvoice[]): void => {
        if (found.length >= 3) {
            return;
        }
        if (remaining === 0 && chosen.length >= 2) {
            found.push([...chosen]);
            return;
        }
        if (chosen.length >= maxGroup) {
            return;
        }
        for (let index = start; index < sorted.length; index += 1) {
            const invoice = sorted[index] as OpenInvoice;
            if (invoice.remaining > remaining) {
                continue;
            }
            chosen.push(invoice);
            walk(index + 1, remaining - invoice.remaining, chosen);
            chosen.pop();
        }
    };
    walk(0, target, []);
    return found;
};

export interface MatchResult {
    readonly verdict: Verdict;
    readonly proposals: readonly Proposal[];
}

export const matchTransaction = (transaction: Transaction, pool: readonly OpenInvoice[], options: MatchOptions = {}): MatchResult => {
    const direction = directionOf(transaction);
    const facts = factsOf(transaction);
    const candidates = pool.filter((invoice) => invoice.direction === direction && invoice.currency === transaction.currency && !invoice.isPaid && invoice.remaining > 0);
    const evidence = candidates.map((invoice) => evidenceFor(transaction, invoice, facts)).filter((entry) => entry.score >= KEEP);

    const proposals: Proposal[] = evidence.map((entry) => {
        const { allocation, reasons } = allocationFor(entry, facts.magnitude);
        return { invoices: [allocation], score: entry.score, reasons: [...entry.reasons, ...reasons], by: "matcher" };
    });

    // A group payment: nothing matched the amount alone, but the contractor is known and some of their invoices add up.
    const exact = evidence.some((entry) => entry.amountExact);
    if (!exact) {
        const known = new Map<string, Evidence[]>();
        for (const entry of candidates.map((invoice) => evidenceFor(transaction, invoice, facts)).filter((entry) => entry.contractor || entry.number)) {
            const key = entry.invoice.contractor?.id ?? entry.invoice.contractor?.nip ?? entry.invoice.contractor?.name ?? "?";
            known.set(key, [...(known.get(key) ?? []), entry]);
        }
        for (const [, group] of known) {
            for (const subset of subsetsSummingTo(group.map((entry) => entry.invoice), facts.magnitude, options.maxGroup ?? 8)) {
                const members = group.filter((entry) => subset.includes(entry.invoice));
                const name = subset[0]?.contractor?.name ?? "the contractor";
                // The sum is the evidence; a number in the title or a NIP/account on the row makes it near certain.
                const score = Math.min(95, 70 + (members.some((entry) => entry.number) ? 15 : 0) + (members.some((entry) => entry.contractorStrong) ? 10 : 0));
                proposals.push({
                    invoices: subset.map((invoice) => ({ invoiceId: invoice.id, amount: invoice.remaining })),
                    score,
                    reasons: [`${subset.length} open invoices of ${name} (${subset.map((invoice) => invoice.number).join(", ")}) add up to the amount`],
                    by: "matcher",
                });
            }
        }
    }

    proposals.sort((a, b) => b.score - a.score);
    const kept = proposals.slice(0, MAX_PROPOSALS);
    const top = kept[0];
    const second = kept[1];
    let verdict: Verdict;
    if (top === undefined) {
        verdict = "unmatched";
    } else if (top.score >= CONFIDENT && (second === undefined || top.score - second.score >= CONFIDENT_GAP)) {
        verdict = "confident";
    } else if (top.score >= AMBIGUOUS) {
        verdict = "ambiguous";
    } else {
        verdict = "unmatched";
    }
    if (NOT_AN_INVOICE.test(transaction.title) && (top === undefined || top.score < SCORE_NUMBER)) {
        return { verdict: "ignored", proposals: kept };
    }
    return { verdict, proposals: kept };
};

// Every transaction against the pool, with one session-wide rule on top: two confident claims on the same invoice
// beyond what it has open cannot both stand, so the later one is downgraded to ambiguous and says why.
export const matchSession = (transactions: readonly Transaction[], pool: readonly OpenInvoice[], options: MatchOptions = {}): SessionItem[] => {
    const items: SessionItem[] = transactions.map((transaction) => ({ transactionId: transaction.id, ...matchTransaction(transaction, pool, options) }));
    const claimed = new Map<string, number>();
    const claimedBy = new Map<string, string>();
    const remaining = new Map(pool.map((invoice) => [invoice.id, invoice.remaining]));
    return items.map((item) => {
        if (item.verdict !== "confident") {
            return item;
        }
        const top = item.proposals[0];
        if (top === undefined) {
            return item;
        }
        const conflict = top.invoices.find((allocation) => (claimed.get(allocation.invoiceId) ?? 0) + allocation.amount > (remaining.get(allocation.invoiceId) ?? 0));
        if (conflict !== undefined) {
            const other = claimedBy.get(conflict.invoiceId) ?? "";
            return {
                ...item,
                verdict: "ambiguous",
                proposals: [{ ...top, reasons: [...top.reasons, `another transaction already claims ${conflict.invoiceId} for more than it has open (${other})`] }, ...item.proposals.slice(1)],
            };
        }
        for (const allocation of top.invoices) {
            claimed.set(allocation.invoiceId, (claimed.get(allocation.invoiceId) ?? 0) + allocation.amount);
            claimedBy.set(allocation.invoiceId, item.transactionId);
        }
        return item;
    });
};
