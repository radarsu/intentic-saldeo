// The shapes every half of this extension speaks: the UI, the backend, the MCP server and the CLI import these and
// nothing else from each other. Money is always integer minor units (grosze); dates are ISO `YYYY-MM-DD`.

// `in`: money arriving (a customer paying a sales invoice). `out`: money leaving (paying a cost document).
export type Direction = "in" | "out";

// `invoice`: issued in SaldeoSMART (invoice.list). `document`: the archive (document.list), where cost documents live.
export type InvoiceSource = "invoice" | "document";

export interface Company {
    readonly programId: string;
    readonly name: string;
    readonly nip?: string;
}

export interface Contractor {
    readonly id: string;
    readonly name: string;
    readonly shortName?: string;
    readonly nip?: string;
    readonly bankAccounts: readonly string[];
    readonly customer: boolean;
    readonly supplier: boolean;
}

export interface InvoiceContractor {
    readonly id?: string;
    readonly name?: string;
    readonly nip?: string;
    readonly bankAccounts: readonly string[];
}

// One thing that can be paid, whichever list it came from. `id` is `${source}:${saldeoId}`, unique across both lists.
export interface OpenInvoice {
    readonly id: string;
    readonly source: InvoiceSource;
    readonly saldeoId: string;
    readonly number: string;
    readonly direction: Direction;
    // Saldeo's own type word (INVOICE_SALES, INVOICE_COST, INVOICE, CORRECTIVE_INVOICE …), for display.
    readonly kind: string;
    readonly corrective: boolean;
    readonly issueDate: string;
    readonly dueDate?: string;
    readonly currency: string;
    readonly total: number;
    readonly paid: number;
    readonly remaining: number;
    readonly isPaid: boolean;
    readonly contractor?: InvoiceContractor;
    // The payee's own accounts as printed on the invoice.
    readonly bankAccounts: readonly string[];
    readonly folder: { readonly year: number; readonly month: number };
    readonly sourceUrl?: string;
}

export interface SettledRef {
    readonly id: string;
    readonly number: string;
    readonly type: string;
    readonly amountSettled: number;
}

export interface BankOperation {
    readonly date: string;
    readonly type: string;
    readonly description: string;
    readonly amount: number;
    readonly currency: string;
    readonly account?: string;
    readonly contractorId?: string;
    readonly contractorNip?: string;
    readonly approved: boolean;
    readonly remainingToSettle?: number;
    readonly settled: readonly SettledRef[];
}

export interface BankStatement {
    readonly account: string;
    readonly currency: string;
    readonly from: string;
    readonly to: string;
    readonly status: string;
    readonly filename?: string;
    readonly folder: { readonly year: number; readonly month: number };
    readonly operations: readonly BankOperation[];
}

// One bank transaction parsed out of an imported CSV. `amount` is signed: positive arrives, negative leaves.
export interface Transaction {
    readonly id: string;
    readonly row: number;
    readonly date: string;
    readonly amount: number;
    readonly currency: string;
    readonly counterparty?: string;
    readonly counterpartyAccount?: string;
    readonly title: string;
}

// Which CSV column plays which role; a column is named by its header (or `#<index>` when the file has none).
export interface Mapping {
    readonly date: string;
    // Either one signed amount column, or a credit and a debit column.
    readonly amount?: string;
    readonly credit?: string;
    readonly debit?: string;
    readonly title: string;
    readonly counterparty?: string;
    readonly account?: string;
    readonly currency?: string;
    readonly defaultCurrency: string;
}

export interface ImportedFile {
    readonly name: string;
    readonly bytes: number;
    readonly encoding: string;
    readonly delimiter: string;
    readonly headerRow: number;
    readonly columns: readonly string[];
    readonly preset?: string;
    readonly rows: number;
}

export type Verdict = "confident" | "ambiguous" | "unmatched" | "ignored";

export interface Allocation {
    readonly invoiceId: string;
    readonly amount: number;
}

// One way a transaction could settle invoices. The matcher writes many per transaction; the agent writes its own.
export interface Proposal {
    readonly invoices: readonly Allocation[];
    readonly score: number;
    readonly reasons: readonly string[];
    readonly by: "matcher" | "agent";
    readonly note?: string;
}

export type DecisionStatus = "confirmed" | "rejected" | "skipped";

// What a decide call may ask for: a decision, or `cleared`, which takes the decision (and its ledger entry) back.
export type DecideAsk = DecisionStatus | "cleared";

export interface Decision {
    readonly status: DecisionStatus;
    readonly invoices: readonly Allocation[];
    readonly at: string;
    readonly note?: string;
}

export type MarkingStatus = "pending" | "ok" | "failed";

// What happened when the agent went to SaldeoSMART's web UI with a confirmed settlement.
export interface Marking {
    readonly status: MarkingStatus;
    readonly at: string;
    readonly conversationId?: string;
    readonly note?: string;
}

export interface Verification {
    readonly paidInSaldeo: boolean;
    readonly at: string;
}

export interface SessionItem {
    readonly transactionId: string;
    readonly verdict: Verdict;
    readonly proposals: readonly Proposal[];
    readonly decision?: Decision;
    readonly marking?: Marking;
    readonly verification?: Verification;
}

export interface AgentRun {
    readonly conversationId: string;
    readonly kind: "resolve" | "mark";
    readonly startedAt: string;
}

// One imported statement and everything decided about it. `version` bumps on every write; a writer that read an older
// version loses, so two halves editing at once can't silently overwrite each other.
export interface Session {
    readonly id: string;
    readonly account: string;
    readonly company: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly version: number;
    readonly file: ImportedFile;
    // The body rows as read, kept so the mapping can be changed after the fact; a statement is a few hundred rows.
    readonly rows: readonly (readonly string[])[];
    readonly mapping?: Mapping;
    readonly transactions: readonly Transaction[];
    readonly invoices: readonly OpenInvoice[];
    readonly invoicesAt?: string;
    readonly items: readonly SessionItem[];
    readonly agentRuns: readonly AgentRun[];
}

export interface SessionSummary {
    readonly id: string;
    readonly account: string;
    readonly company: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly file: ImportedFile;
    readonly mapped: boolean;
    readonly counts: SessionCounts;
}

export interface SessionCounts {
    readonly transactions: number;
    readonly confident: number;
    readonly ambiguous: number;
    readonly unmatched: number;
    readonly ignored: number;
    readonly proposedByAgent: number;
    readonly confirmed: number;
    readonly rejected: number;
    readonly skipped: number;
    readonly marked: number;
    readonly markFailed: number;
    // Decisions the owner still owes: undecided items that have a proposal.
    readonly awaiting: number;
}

export interface LedgerEntry {
    readonly id: string;
    readonly sessionId: string;
    readonly company: string;
    readonly transaction: Transaction;
    readonly invoices: readonly (Allocation & { readonly number: string; readonly source: InvoiceSource; readonly saldeoId: string })[];
    readonly confirmedAt: string;
    readonly marking?: Marking;
    readonly verification?: Verification;
}

export interface Ledger {
    readonly version: number;
    readonly entries: readonly LedgerEntry[];
}

// The switches on the capability card, as the agent's env and the backend's connection read both see them.
export interface Scopes {
    readonly documents: boolean;
    readonly invoices: boolean;
    readonly bankStatements: boolean;
    readonly propose: boolean;
}

export interface AccountStatus {
    readonly account: string;
    readonly username: string;
    readonly company?: string;
    readonly scopes: Scopes;
    readonly reachable: boolean;
    readonly detail?: string;
}

export const DEFAULT_BASE_URL = "https://saldeo.brainshare.pl";
