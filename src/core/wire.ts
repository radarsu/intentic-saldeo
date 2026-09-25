import type {
    AccountStatus,
    Allocation,
    BankStatement,
    Company,
    DecideAsk,
    Ledger,
    Mapping,
    MarkingStatus,
    OpenInvoice,
    Session,
    SessionSummary,
} from "./contract.ts";

// The backend's HTTP surface in its own namespace (`api.backend` on the view side), as both halves spell it. Paths are relative to the namespace;
// every body and answer is JSON. `account` is the SaldeoSMART capability's id.

export const ROUTES = {
    status: (account: string) => `/accounts/${encodeURIComponent(account)}/status`,
    companies: (account: string) => `/accounts/${encodeURIComponent(account)}/companies`,
    invoices: (account: string, company: string, months: number, open: boolean) =>
        `/accounts/${encodeURIComponent(account)}/invoices?company=${encodeURIComponent(company)}&months=${months}&open=${open ? 1 : 0}`,
    statements: (account: string, company: string) => `/accounts/${encodeURIComponent(account)}/statements?company=${encodeURIComponent(company)}`,
    sessions: (account: string) => `/accounts/${encodeURIComponent(account)}/sessions`,
    session: (account: string, id: string) => `/accounts/${encodeURIComponent(account)}/sessions/${encodeURIComponent(id)}`,
    ledger: (account: string) => `/accounts/${encodeURIComponent(account)}/ledger`,
} as const;

export interface CompaniesResponse {
    readonly companies: readonly Company[];
}

export interface InvoicesResponse {
    readonly invoices: readonly OpenInvoice[];
    readonly fetchedAt: string;
}

export interface StatementsResponse {
    readonly statements: readonly BankStatement[];
}

export interface SessionsResponse {
    readonly sessions: readonly SessionSummary[];
}

export interface SessionResponse {
    readonly session: Session;
    // Rows the mapping could not read, after a mapping was applied.
    readonly skipped?: readonly { readonly row: number; readonly reason: string }[];
}

export interface ImportRequest {
    readonly company: string;
    readonly name: string;
    // The file's bytes, base64.
    readonly content: string;
}

export interface MappingRequest {
    readonly mapping: Mapping;
    // How many months before the earliest transaction to look for open invoices.
    readonly lookbackMonths?: number;
}

export interface DecideRequest {
    readonly transactionId: string;
    readonly status: DecideAsk;
    readonly invoices?: readonly Allocation[];
    readonly note?: string;
}

export interface DecideAllRequest {
    // Confirms every undecided item of this verdict on its top proposal.
    readonly verdict: "confident";
}

export interface AgentRunRequest {
    // The picker's choice, spread onto the turn as the contract spells it (agent, model, account, harness, effort, …).
    readonly pick?: Readonly<Record<string, unknown>>;
}

export interface MarkRequest extends AgentRunRequest {
    // The `saldeosmart-web` browser capability the agent should act through.
    readonly browserAccount: string;
    // Only these transactions; absent means every confirmed one not yet marked.
    readonly transactionIds?: readonly string[];
}

export interface AgentRunResponse {
    readonly conversationId: string;
    readonly items: number;
}

export interface RecordMarkingRequest {
    readonly transactionId: string;
    readonly status: MarkingStatus;
    readonly note?: string;
    readonly conversationId?: string;
}

export interface LedgerResponse {
    readonly ledger: Ledger;
}

export type StatusResponse = AccountStatus;

export interface ErrorResponse {
    readonly error: string;
}
