import type {
    AccountStatus,
    Allocation,
    BankStatement,
    Company,
    Contractor,
    DecideAsk,
    Decision,
    LedgerEntry,
    Mapping,
    Marking,
    OpenInvoice,
    Proposal,
    Scopes,
    Session,
    SessionItem,
    SessionSummary,
    Transaction,
} from "./contract.ts";
import { buildTransactions, inspectFile } from "./bank/import.ts";
import { matchSession } from "./match/engine.ts";
import { createSaldeoClient, type SaldeoClient, type SaldeoClientOptions, type SaldeoCredentials } from "./saldeo/client.ts";
import { dedupeInvoices, listBankStatements, listCompanies, listContractors, listPayablesForMonth, type Month, openOnly, searchDocuments } from "./saldeo/read.ts";
import {
    deleteSession,
    ledgerEntryId,
    listSessions,
    newSessionId,
    readLedger,
    readSession,
    updateLedger,
    updateSession,
    upsertLedgerEntries,
    writeSession,
} from "./store/store.ts";

// Everything the extension does, behind one object: the backend answers HTTP with it, the MCP server answers tools
// with it, the CLI answers verbs with it. Where credentials come from is the caller's business (`connection`).

export interface AccountConnection {
    readonly account: string;
    readonly credentials: SaldeoCredentials;
    readonly company?: string;
    readonly scopes: Scopes;
}

export interface ServiceDeps {
    readonly workspaceRoot: string;
    readonly connection: (account: string) => Promise<AccountConnection>;
    readonly clientOptions?: SaldeoClientOptions;
    readonly now?: () => Date;
}

// How long a month's invoice list is trusted before it is read again; the API allows twenty calls a minute and a
// six-month pool costs a dozen, so the view cannot afford to re-read on every click.
const POOL_TTL_MS = 5 * 60_000;

export class ScopeRefused extends Error {
    constructor(what: string) {
        super(`the SaldeoSMART card does not allow ${what}; turn it on in Capabilities`);
        this.name = "ScopeRefused";
    }
}

export class NotFound extends Error {
    constructor(what: string) {
        super(what);
        this.name = "NotFound";
    }
}

export class BadRequest extends Error {
    constructor(what: string) {
        super(what);
        this.name = "BadRequest";
    }
}

const on = (value: string | undefined): boolean => value === undefined || value === "" || value === "on" || value === "true";

// The card's switches as stored ("on"/"off"), or as the agent's env carries them; absent means on.
export const scopesOf = (config: Readonly<Record<string, string | undefined>>): Scopes => ({
    documents: on(config["documents"]),
    invoices: on(config["invoices"]),
    bankStatements: on(config["bankStatements"]),
    propose: on(config["propose"]),
});

export const DEFAULT_LOOKBACK_MONTHS = 6;
export const DEFAULT_LIST_MONTHS = 6;

const monthsBetween = (from: string, to: string): Month[] => {
    const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
    const months: Month[] = [];
    for (let cursor = start; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
        months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    }
    return months;
};

const shiftMonths = (date: string, by: number): string => {
    const base = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
    const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + by, 1));
    return shifted.toISOString().slice(0, 10);
};

// The months whose invoices a set of transactions could be paying: from `lookback` months before the earliest to the
// month of the latest.
export const monthsFor = (transactions: readonly Transaction[], lookback: number, now: Date): Month[] => {
    const dates = transactions.map((transaction) => transaction.date).sort();
    const first = dates[0] ?? now.toISOString().slice(0, 10);
    const last = dates[dates.length - 1] ?? first;
    return monthsBetween(shiftMonths(first, -lookback), last);
};

export const recentMonthsFrom = (count: number, now: Date): Month[] => monthsBetween(shiftMonths(now.toISOString().slice(0, 10), -(count - 1)), now.toISOString().slice(0, 10));

export interface ProposeInput {
    readonly transactionId: string;
    readonly invoices: readonly Allocation[];
    readonly reasons: readonly string[];
    readonly note?: string;
    readonly confidence?: number;
}

export interface DecideInput {
    readonly transactionId: string;
    readonly status: DecideAsk;
    readonly invoices?: readonly Allocation[];
    readonly note?: string;
}

export interface MarkingInput {
    readonly transactionId: string;
    readonly status: Marking["status"];
    readonly note?: string;
    readonly conversationId?: string;
}

export interface SaldeoService {
    readonly status: (account: string) => Promise<AccountStatus>;
    readonly companies: (account: string) => Promise<Company[]>;
    readonly contractors: (account: string, company: string) => Promise<Contractor[]>;
    // The company to work on: the one asked for, the card's pinned one, or the only one the login can see.
    readonly resolveCompany: (account: string, wanted: string | undefined) => Promise<string>;
    readonly payables: (account: string, company: string, options?: { readonly months?: number; readonly open?: boolean }) => Promise<OpenInvoice[]>;
    readonly search: (account: string, company: string, search: { readonly number?: string; readonly nip?: string }) => Promise<OpenInvoice[]>;
    readonly statements: (account: string, company: string) => Promise<BankStatement[]>;
    readonly sessions: (account: string) => Promise<SessionSummary[]>;
    readonly session: (account: string, id: string) => Promise<Session>;
    readonly importFile: (account: string, company: string, name: string, bytes: Uint8Array) => Promise<Session>;
    readonly applyMapping: (account: string, id: string, mapping: Mapping, lookbackMonths?: number) => Promise<{ session: Session; skipped: readonly { row: number; reason: string }[] }>;
    readonly rematch: (account: string, id: string) => Promise<Session>;
    readonly decide: (account: string, id: string, input: DecideInput) => Promise<Session>;
    readonly confirmAll: (account: string, id: string) => Promise<Session>;
    readonly propose: (account: string, id: string, input: ProposeInput) => Promise<Session>;
    readonly skip: (account: string, id: string, transactionId: string, reason: string) => Promise<Session>;
    readonly recordMarking: (account: string, id: string, input: MarkingInput) => Promise<Session>;
    readonly verify: (account: string, id: string) => Promise<Session>;
    readonly ledger: (account: string) => ReturnType<typeof readLedger>;
    readonly deleteSession: (account: string, id: string) => Promise<void>;
    // Confirmed items that still need marking in SaldeoSMART, with the invoices they settle.
    readonly unmarked: (session: Session) => { item: SessionItem; transaction: Transaction; invoices: { allocation: Allocation; invoice: OpenInvoice | undefined }[] }[];
}

const AGENT_PROPOSAL_SCORE = 75;

export const createService = (deps: ServiceDeps): SaldeoService => {
    const now = deps.now ?? (() => new Date());
    const clients = new Map<string, { key: string; client: SaldeoClient }>();

    const clientFor = async (account: string): Promise<{ client: SaldeoClient; connection: AccountConnection }> => {
        const connection = await deps.connection(account);
        const key = `${connection.credentials.baseUrl}|${connection.credentials.username}|${connection.credentials.apiToken}`;
        const cached = clients.get(account);
        if (cached !== undefined && cached.key === key) {
            return { client: cached.client, connection };
        }
        const client = createSaldeoClient(connection.credentials, deps.clientOptions ?? {});
        clients.set(account, { key, client });
        return { client, connection };
    };

    const require = (scopes: Scopes, scope: keyof Scopes, what: string): void => {
        if (!scopes[scope]) {
            throw new ScopeRefused(what);
        }
    };

    const sessionOf = async (account: string, id: string): Promise<Session> => {
        const session = await readSession(deps.workspaceRoot, account, id);
        if (session === undefined) {
            throw new NotFound(`no session ${id} for ${account}`);
        }
        return session;
    };

    const pool = new Map<string, { at: number; invoices: OpenInvoice[] }>();

    // The months' invoices, each month from the cache while fresh; `fresh` forces a re-read (verify, rematch).
    const payablesFor = async (account: string, company: string, months: readonly Month[], fresh = false): Promise<OpenInvoice[]> => {
        const { client, connection } = await clientFor(account);
        if (!connection.scopes.invoices && !connection.scopes.documents) {
            throw new ScopeRefused("reading invoices or documents");
        }
        const scopeKey = `${connection.scopes.invoices ? "i" : ""}${connection.scopes.documents ? "d" : ""}`;
        const found: OpenInvoice[] = [];
        for (const month of months) {
            const key = `${account}|${company}|${month.year}-${month.month}|${scopeKey}`;
            const cached = pool.get(key);
            if (!fresh && cached !== undefined && now().getTime() - cached.at < POOL_TTL_MS) {
                found.push(...cached.invoices);
                continue;
            }
            const invoices = await listPayablesForMonth(client, company, month, connection.scopes);
            pool.set(key, { at: now().getTime(), invoices });
            found.push(...invoices);
        }
        return dedupeInvoices(found);
    };

    const transactionOf = (session: Session, transactionId: string): Transaction => {
        const transaction = session.transactions.find((entry) => entry.id === transactionId);
        if (transaction === undefined) {
            throw new NotFound(`no transaction ${transactionId} in session ${session.id}`);
        }
        return transaction;
    };

    const validAllocations = (session: Session, allocations: readonly Allocation[]): void => {
        for (const allocation of allocations) {
            if (!session.invoices.some((invoice) => invoice.id === allocation.invoiceId)) {
                throw new BadRequest(`invoice ${allocation.invoiceId} is not in this session's pool`);
            }
            if (!Number.isInteger(allocation.amount) || allocation.amount <= 0) {
                throw new BadRequest(`allocation for ${allocation.invoiceId} must be a positive amount in grosze`);
            }
        }
    };

    const withItem = (session: Session, transactionId: string, edit: (item: SessionItem) => SessionItem): Session => {
        transactionOf(session, transactionId);
        const items = session.items.some((item) => item.transactionId === transactionId)
            ? session.items.map((item) => (item.transactionId === transactionId ? edit(item) : item))
            : [...session.items, edit({ transactionId, verdict: "unmatched", proposals: [] })];
        return { ...session, items };
    };

    const ledgerEntryFor = (session: Session, item: SessionItem, decision: Decision): LedgerEntry => ({
        id: ledgerEntryId(session.id, item.transactionId),
        sessionId: session.id,
        company: session.company,
        transaction: transactionOf(session, item.transactionId),
        invoices: decision.invoices.map((allocation) => {
            const invoice = session.invoices.find((candidate) => candidate.id === allocation.invoiceId);
            return { ...allocation, number: invoice?.number ?? allocation.invoiceId, source: invoice?.source ?? "invoice", saldeoId: invoice?.saldeoId ?? allocation.invoiceId };
        }),
        confirmedAt: decision.at,
        ...(item.marking === undefined ? {} : { marking: item.marking }),
        ...(item.verification === undefined ? {} : { verification: item.verification }),
    });

    // The ledger mirrors every confirmed item; a decision withdrawn takes its entry with it.
    const syncLedger = async (session: Session, transactionIds: readonly string[]): Promise<void> => {
        await updateLedger(deps.workspaceRoot, session.account, (ledger) => {
            const removed = new Set(transactionIds.map((transactionId) => ledgerEntryId(session.id, transactionId)));
            const kept = ledger.entries.filter((entry) => !removed.has(entry.id));
            const added = session.items
                .filter((item) => transactionIds.includes(item.transactionId) && item.decision?.status === "confirmed")
                .map((item) => ledgerEntryFor(session, item, item.decision as Decision));
            return upsertLedgerEntries({ ...ledger, entries: kept }, added);
        });
    };

    const service: SaldeoService = {
        status: async (account) => {
            const connection = await deps.connection(account);
            const base: AccountStatus = {
                account,
                username: connection.credentials.username,
                ...(connection.company === undefined ? {} : { company: connection.company }),
                scopes: connection.scopes,
                reachable: false,
            };
            try {
                const { client } = await clientFor(account);
                const companies = await listCompanies(client);
                return { ...base, reachable: true, detail: `${companies.length} compan${companies.length === 1 ? "y" : "ies"} visible` };
            } catch (error) {
                return { ...base, detail: error instanceof Error ? error.message : String(error) };
            }
        },
        companies: async (account) => {
            const { client } = await clientFor(account);
            return listCompanies(client);
        },
        contractors: async (account, company) => {
            const { client, connection } = await clientFor(account);
            if (!connection.scopes.invoices && !connection.scopes.documents) {
                throw new ScopeRefused("reading invoices or documents");
            }
            return listContractors(client, company);
        },
        resolveCompany: async (account, wanted) => {
            if (wanted !== undefined && wanted !== "") {
                return wanted;
            }
            const connection = await deps.connection(account);
            if (connection.company !== undefined) {
                return connection.company;
            }
            const companies = await service.companies(account);
            const [only, second] = companies;
            if (only !== undefined && second === undefined) {
                return only.programId;
            }
            throw new BadRequest(
                companies.length === 0
                    ? "this login sees no companies in SaldeoSMART"
                    : `say which company: ${companies.map((company) => `${company.programId} (${company.name})`).join(", ")}`,
            );
        },
        payables: async (account, company, options = {}) => {
            const all = await payablesFor(account, company, recentMonthsFrom(options.months ?? DEFAULT_LIST_MONTHS, now()));
            return options.open === false ? all : openOnly(all);
        },
        search: async (account, company, search) => {
            const { client, connection } = await clientFor(account);
            require(connection.scopes, "documents", "reading the document archive");
            return searchDocuments(client, company, search);
        },
        statements: async (account, company) => {
            const { client, connection } = await clientFor(account);
            require(connection.scopes, "bankStatements", "reading bank statements");
            return listBankStatements(client, company);
        },
        sessions: (account) => listSessions(deps.workspaceRoot, account),
        session: sessionOf,
        importFile: async (account, company, name, bytes) => {
            await deps.connection(account);
            if (company === "") {
                throw new BadRequest("a company is required");
            }
            const inspection = inspectFile(bytes, name);
            const at = now().toISOString();
            const session: Session = {
                id: newSessionId(now()),
                account,
                company,
                createdAt: at,
                updatedAt: at,
                version: 0,
                file: inspection.file,
                rows: inspection.rows,
                ...(inspection.mapping === undefined ? {} : { mapping: inspection.mapping }),
                transactions: [],
                invoices: [],
                items: [],
                agentRuns: [],
            };
            return writeSession(deps.workspaceRoot, session, now());
        },
        applyMapping: async (account, id, mapping, lookbackMonths = DEFAULT_LOOKBACK_MONTHS) => {
            const current = await sessionOf(account, id);
            for (const role of ["date", "title"] as const) {
                if (!current.file.columns.includes(mapping[role])) {
                    throw new BadRequest(`mapping.${role} names "${mapping[role]}", which is not a column of this file`);
                }
            }
            if (mapping.amount === undefined && (mapping.credit === undefined || mapping.debit === undefined)) {
                throw new BadRequest("mapping needs an amount column, or a credit and a debit column");
            }
            const { transactions, skipped } = buildTransactions(current.file, current.rows, mapping);
            const invoices = await payablesFor(account, current.company, monthsFor(transactions, lookbackMonths, now()));
            const decided = new Map(current.items.filter((item) => item.decision !== undefined).map((item) => [item.transactionId, item]));
            const items = matchSession(transactions, openOnly(invoices)).map((item) => decided.get(item.transactionId) ?? item);
            const session = await writeSession(
                deps.workspaceRoot,
                { ...current, mapping, transactions, invoices, invoicesAt: now().toISOString(), items },
                now(),
            );
            return { session, skipped };
        },
        rematch: async (account, id) => {
            const current = await sessionOf(account, id);
            if (current.mapping === undefined) {
                throw new BadRequest("apply a mapping first");
            }
            const invoices = await payablesFor(account, current.company, monthsFor(current.transactions, DEFAULT_LOOKBACK_MONTHS, now()), true);
            const fresh = matchSession(current.transactions, openOnly(invoices));
            // Decisions and the agent's proposals survive a rematch; only the matcher's own proposals are replaced.
            const items = fresh.map((item) => {
                const previous = current.items.find((candidate) => candidate.transactionId === item.transactionId);
                if (previous?.decision !== undefined) {
                    return previous;
                }
                const agent = previous?.proposals.filter((proposal) => proposal.by === "agent") ?? [];
                return agent.length === 0 ? item : { ...item, proposals: [...agent, ...item.proposals] };
            });
            return writeSession(deps.workspaceRoot, { ...current, invoices, invoicesAt: now().toISOString(), items }, now());
        },
        decide: async (account, id, input) => {
            const session = await updateSession(deps.workspaceRoot, account, id, (current) => {
                const item = current.items.find((candidate) => candidate.transactionId === input.transactionId);
                if (input.status === "cleared") {
                    return withItem(current, input.transactionId, (existing) => {
                        const { decision, marking, verification, ...rest } = existing;
                        void decision;
                        void marking;
                        void verification;
                        return rest;
                    });
                }
                const invoices = input.invoices ?? (input.status === "confirmed" ? (item?.proposals[0]?.invoices ?? []) : []);
                if (input.status === "confirmed") {
                    if (invoices.length === 0) {
                        throw new BadRequest("confirming needs at least one invoice");
                    }
                    validAllocations(current, invoices);
                }
                const decision: Decision = { status: input.status, invoices, at: now().toISOString(), ...(input.note === undefined ? {} : { note: input.note }) };
                return withItem(current, input.transactionId, (existing) => {
                    const { marking, verification, ...rest } = existing;
                    void marking;
                    void verification;
                    return { ...rest, decision };
                });
            });
            await syncLedger(session, [input.transactionId]);
            return session;
        },
        confirmAll: async (account, id) => {
            const confirmed: string[] = [];
            const session = await updateSession(deps.workspaceRoot, account, id, (current) => ({
                ...current,
                items: current.items.map((item) => {
                    const top = item.proposals[0];
                    if (item.decision !== undefined || item.verdict !== "confident" || top === undefined || top.invoices.length === 0) {
                        return item;
                    }
                    confirmed.push(item.transactionId);
                    return { ...item, decision: { status: "confirmed", invoices: top.invoices, at: now().toISOString() } };
                }),
            }));
            await syncLedger(session, confirmed);
            return session;
        },
        propose: async (account, id, input) => {
            const connection = await deps.connection(account);
            require(connection.scopes, "propose", "the agent proposing matches");
            if (input.invoices.length === 0) {
                throw new BadRequest("a proposal needs at least one invoice; use skip for a transaction that pays none");
            }
            return updateSession(deps.workspaceRoot, account, id, (current) => {
                validAllocations(current, input.invoices);
                const proposal: Proposal = {
                    invoices: input.invoices,
                    score: Math.max(0, Math.min(100, Math.round(input.confidence ?? AGENT_PROPOSAL_SCORE))),
                    reasons: input.reasons,
                    by: "agent",
                    ...(input.note === undefined ? {} : { note: input.note }),
                };
                return withItem(current, input.transactionId, (item) => {
                    if (item.decision !== undefined) {
                        throw new BadRequest(`transaction ${input.transactionId} is already decided (${item.decision.status})`);
                    }
                    // The agent's proposal leads, the matcher's stay below it; the verdict says the owner has something to look at.
                    return { ...item, verdict: item.verdict === "ignored" ? "ambiguous" : item.verdict === "unmatched" ? "ambiguous" : item.verdict, proposals: [proposal, ...item.proposals.filter((existing) => existing.by !== "agent")] };
                });
            });
        },
        skip: async (account, id, transactionId, reason) => {
            const connection = await deps.connection(account);
            require(connection.scopes, "propose", "the agent proposing matches");
            return updateSession(deps.workspaceRoot, account, id, (current) =>
                withItem(current, transactionId, (item) => {
                    if (item.decision !== undefined) {
                        throw new BadRequest(`transaction ${transactionId} is already decided (${item.decision.status})`);
                    }
                    return { ...item, verdict: "ignored", proposals: [{ invoices: [], score: 0, reasons: [reason], by: "agent" }, ...item.proposals.filter((existing) => existing.by !== "agent")] };
                }),
            );
        },
        recordMarking: async (account, id, input) => {
            const session = await updateSession(deps.workspaceRoot, account, id, (current) =>
                withItem(current, input.transactionId, (item) => {
                    if (item.decision?.status !== "confirmed") {
                        throw new BadRequest(`transaction ${input.transactionId} is not confirmed, so there is nothing to mark`);
                    }
                    const marking: Marking = {
                        status: input.status,
                        at: now().toISOString(),
                        ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
                        ...(input.note === undefined ? {} : { note: input.note }),
                    };
                    return { ...item, marking };
                }),
            );
            await syncLedger(session, [input.transactionId]);
            return session;
        },
        verify: async (account, id) => {
            const current = await sessionOf(account, id);
            const confirmed = current.items.filter((item) => item.decision?.status === "confirmed");
            if (confirmed.length === 0) {
                return current;
            }
            const invoiceIds = new Set(confirmed.flatMap((item) => item.decision?.invoices.map((allocation) => allocation.invoiceId) ?? []));
            const months = new Map<string, Month>();
            for (const invoice of current.invoices.filter((candidate) => invoiceIds.has(candidate.id))) {
                months.set(`${invoice.folder.year}-${invoice.folder.month}`, invoice.folder);
            }
            const fresh = new Map((await payablesFor(account, current.company, [...months.values()], true)).map((invoice) => [invoice.id, invoice]));
            const at = now().toISOString();
            const items = current.items.map((item) => {
                if (item.decision?.status !== "confirmed") {
                    return item;
                }
                // Paid in Saldeo's eyes when every settled invoice is now paid, or has less open than the snapshot had.
                const paidInSaldeo = item.decision.invoices.every((allocation) => {
                    const before = current.invoices.find((candidate) => candidate.id === allocation.invoiceId);
                    const after = fresh.get(allocation.invoiceId);
                    return after !== undefined && (after.isPaid || (before !== undefined && after.remaining < before.remaining));
                });
                return { ...item, verification: { paidInSaldeo, at } };
            });
            const session = await writeSession(deps.workspaceRoot, { ...current, items }, now());
            await syncLedger(
                session,
                confirmed.map((item) => item.transactionId),
            );
            return session;
        },
        ledger: (account) => readLedger(deps.workspaceRoot, account),
        deleteSession: async (account, id) => {
            const session = await readSession(deps.workspaceRoot, account, id);
            if (session === undefined) {
                return;
            }
            await deleteSession(deps.workspaceRoot, account, id);
            await updateLedger(deps.workspaceRoot, account, (ledger) => ({ ...ledger, entries: ledger.entries.filter((entry) => entry.sessionId !== id) }));
        },
        unmarked: (session) =>
            session.items
                .filter((item) => item.decision?.status === "confirmed" && item.marking?.status !== "ok")
                .map((item) => ({
                    item,
                    transaction: transactionOf(session, item.transactionId),
                    invoices: (item.decision?.invoices ?? []).map((allocation) => ({ allocation, invoice: session.invoices.find((invoice) => invoice.id === allocation.invoiceId) })),
                })),
    };
    return service;
};
