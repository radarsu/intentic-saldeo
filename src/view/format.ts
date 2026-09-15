import type { AgentRunChoice } from "@intentic/extension-ui";
import type { OpenInvoice, SessionItem, Verdict } from "../core/contract.ts";
import { formatAmount } from "../core/money.ts";

// Small view-side helpers: words and tones for verdicts and decisions, and the picker's choice as the turn spells it.

export const VERDICT_WORDS: Readonly<Record<Verdict, string>> = {
    confident: `confident`,
    ambiguous: `needs a look`,
    unmatched: `no match`,
    ignored: `not an invoice`,
};

export type Tone = `success` | `warning` | `neutral` | `info` | `danger` | `primary`;

export const verdictTone = (verdict: Verdict): Tone => (verdict === `confident` ? `success` : verdict === `ambiguous` ? `warning` : verdict === `unmatched` ? `danger` : `neutral`);

export const decisionTone = (status: string): Tone => (status === `confirmed` ? `success` : status === `rejected` ? `danger` : `neutral`);

export const invoiceLabel = (invoice: OpenInvoice | undefined, fallback: string): string => (invoice === undefined ? fallback : `${invoice.number}`);

export const money = (grosze: number, currency?: string): string => formatAmount(grosze, currency);

// What a row's state reads as, in one word, after the verdict and any decision, marking and verification.
export const itemState = (item: SessionItem): { label: string; tone: Tone } => {
    if (item.decision === undefined) {
        return { label: VERDICT_WORDS[item.verdict], tone: verdictTone(item.verdict) };
    }
    if (item.decision.status !== `confirmed`) {
        return { label: item.decision.status, tone: decisionTone(item.decision.status) };
    }
    if (item.verification?.paidInSaldeo === true) {
        return { label: `paid in Saldeo`, tone: `success` };
    }
    if (item.marking?.status === `ok`) {
        return { label: `marked`, tone: `success` };
    }
    if (item.marking?.status === `failed`) {
        return { label: `marking failed`, tone: `danger` };
    }
    if (item.marking?.status === `pending`) {
        return { label: `marking…`, tone: `info` };
    }
    return { label: `confirmed`, tone: `primary` };
};

// AgentRunChoice → the fields `POST /agent` takes (AgentRunPickSchema): the same act, in the wire's names.
export const pickOf = (choice: AgentRunChoice): Record<string, unknown> => ({
    agent: choice.provider,
    model: choice.model,
    ...(choice.account === undefined ? {} : { account: choice.account }),
    ...(choice.harness === undefined ? {} : { harness: choice.harness }),
    ...(choice.effort === undefined ? {} : { effort: choice.effort }),
    ...(choice.thinking === undefined ? {} : { thinking: choice.thinking }),
    ...(choice.fast === undefined ? {} : { fast: choice.fast }),
});

// A CSV of the ledger for whoever keeps the books elsewhere; semicolons and a decimal comma, as Polish spreadsheets expect.
export const ledgerCsv = (rows: readonly { date: string; amount: number; currency: string; counterparty: string; title: string; invoices: string; confirmedAt: string; marked: string; verified: string }[]): string =>
    [
        [`Data`, `Kwota`, `Waluta`, `Kontrahent`, `Tytuł`, `Faktury`, `Potwierdzono`, `Oznaczono w Saldeo`, `Zweryfikowano`].join(`;`),
        ...rows.map((row) =>
            [row.date, formatAmount(row.amount).replace(/ /g, ``), row.currency, row.counterparty, row.title, row.invoices, row.confirmedAt, row.marked, row.verified]
                .map((cell) => `"${String(cell).replaceAll(`"`, `""`)}"`)
                .join(`;`),
        ),
    ].join(`\r\n`);
