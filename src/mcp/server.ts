import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { OpenInvoice, Session, SessionItem, Transaction } from "../core/contract.ts";
import { accountsFromEnv, pickAccount, workspaceRootFrom } from "../core/env.ts";
import { formatAmount } from "../core/money.ts";
import { type AccountConnection, createService, type SaldeoService } from "../core/service.ts";

// The agent's SaldeoSMART tools, over stdio, spawned by the plugin's .mcp.json each turn. Which tools exist follows
// the card's switches, so a card that says "no proposing" yields an agent that has no way to propose; with no card in
// the environment at all (none connected, or withheld from this persona) only `saldeo_status` remains, and says so.

const service = (root: string, accounts: readonly AccountConnection[]): SaldeoService =>
    createService({
        workspaceRoot: root,
        connection: (account) => Promise.resolve(pickAccount(accounts, account)),
    });

const invoiceLine = (invoice: OpenInvoice) => ({
    id: invoice.id,
    number: invoice.number,
    kind: invoice.kind,
    direction: invoice.direction,
    currency: invoice.currency,
    total: invoice.total,
    remaining: invoice.remaining,
    totalFormatted: formatAmount(invoice.total, invoice.currency),
    remainingFormatted: formatAmount(invoice.remaining, invoice.currency),
    isPaid: invoice.isPaid,
    issueDate: invoice.issueDate,
    ...(invoice.dueDate === undefined ? {} : { dueDate: invoice.dueDate }),
    ...(invoice.contractor === undefined ? {} : { contractor: { ...(invoice.contractor.name === undefined ? {} : { name: invoice.contractor.name }), ...(invoice.contractor.nip === undefined ? {} : { nip: invoice.contractor.nip }) } }),
});

const transactionLine = (transaction: Transaction) => ({
    id: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    amountFormatted: formatAmount(transaction.amount, transaction.currency),
    currency: transaction.currency,
    ...(transaction.counterparty === undefined ? {} : { counterparty: transaction.counterparty }),
    ...(transaction.counterpartyAccount === undefined ? {} : { counterpartyAccount: transaction.counterpartyAccount }),
    title: transaction.title,
});

const itemLine = (session: Session, item: SessionItem) => {
    const transaction = session.transactions.find((entry) => entry.id === item.transactionId);
    return {
        transaction: transaction === undefined ? { id: item.transactionId } : transactionLine(transaction),
        verdict: item.verdict,
        ...(item.decision === undefined ? {} : { decision: item.decision }),
        proposals: item.proposals.map((proposal) => ({
            by: proposal.by,
            score: proposal.score,
            invoices: proposal.invoices.map((allocation) => {
                const invoice = session.invoices.find((entry) => entry.id === allocation.invoiceId);
                return { invoiceId: allocation.invoiceId, number: invoice?.number, amount: allocation.amount };
            }),
            reasons: proposal.reasons,
            ...(proposal.note === undefined ? {} : { note: proposal.note }),
        })),
    };
};

const POOL_LIMIT = 300;

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, undefined, 2) }] });
const failure = (error: unknown) => ({ content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true });

const main = async (): Promise<void> => {
    const accounts = accountsFromEnv();
    const root = workspaceRootFrom();
    const api = service(root, accounts);
    const any = (scope: keyof AccountConnection["scopes"]): boolean => accounts.some((account) => account.scopes[scope]);
    const server = new McpServer({ name: "saldeo", version: "1.0.0" });
    const accountArg = { account: z.string().optional().describe("Which SaldeoSMART connection, by its capability id; needed only when more than one is connected.") };
    const companyArg = { company: z.string().optional().describe("The company's program id (company_program_id). Leave it out when the card pins one or the login sees only one.") };

    server.registerTool(
        "saldeo_status",
        {
            description: "Which SaldeoSMART connections this turn has, what each may read, and whether the API answers. Call first when unsure.",
            inputSchema: accountArg,
        },
        async ({ account }) => {
            if (accounts.length === 0) {
                return text("No SaldeoSMART connection reaches this turn: no card is connected, or the persona withholds it. Nothing here can be read or proposed.");
            }
            try {
                const wanted = account === undefined && accounts.length > 1 ? undefined : pickAccount(accounts, account).account;
                const statuses = await Promise.all((wanted === undefined ? accounts : [pickAccount(accounts, wanted)]).map((entry) => api.status(entry.account)));
                return text(statuses);
            } catch (error) {
                return failure(error);
            }
        },
    );

    if (accounts.length > 0) {
        server.registerTool(
            "saldeo_companies",
            { description: "The companies (clients of the office) this login can see, with their program ids.", inputSchema: accountArg },
            async ({ account }) => {
                try {
                    return text(await api.companies(pickAccount(accounts, account).account));
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }

    if (any("invoices") || any("documents")) {
        server.registerTool(
            "saldeo_contractors",
            { description: "A company's contractors: names, NIPs, bank accounts. Useful to tell who a bank counterparty is.", inputSchema: { ...accountArg, ...companyArg } },
            async ({ account, company }) => {
                try {
                    const id = pickAccount(accounts, account).account;
                    return text(await api.contractors(id, await api.resolveCompany(id, company)));
                } catch (error) {
                    return failure(error);
                }
            },
        );
        server.registerTool(
            "saldeo_invoices",
            {
                description:
                    "Invoices and documents that carry an amount owed: sales invoices issued in Saldeo (money in) and cost documents from the archive (money out), with what is still open. Defaults to open ones from the last 6 months.",
                inputSchema: {
                    ...accountArg,
                    ...companyArg,
                    months: z.number().int().min(1).max(36).optional().describe("How many months back, counting the current one. Default 6."),
                    all: z.boolean().optional().describe("Include paid ones too."),
                },
            },
            async ({ account, company, months, all }) => {
                try {
                    const id = pickAccount(accounts, account).account;
                    const invoices = await api.payables(id, await api.resolveCompany(id, company), { ...(months === undefined ? {} : { months }), open: all !== true });
                    return text(invoices.map(invoiceLine));
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }

    if (any("documents")) {
        server.registerTool(
            "saldeo_documents",
            {
                description: "Search the document archive by document number or contractor NIP, any age. Answers documents with their paid state.",
                inputSchema: { ...accountArg, ...companyArg, number: z.string().optional().describe("The document number as printed."), nip: z.string().optional().describe("The contractor's NIP, digits only.") },
            },
            async ({ account, company, number, nip }) => {
                try {
                    const id = pickAccount(accounts, account).account;
                    const found = await api.search(id, await api.resolveCompany(id, company), { ...(number === undefined ? {} : { number }), ...(nip === undefined ? {} : { nip }) });
                    return text(found.map(invoiceLine));
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }

    if (any("bankStatements")) {
        server.registerTool(
            "saldeo_bank_statements",
            {
                description: "Bank statements SaldeoSMART already holds for a company, each operation with what Saldeo settled it against. Read-only; a way to see what is already reconciled there.",
                inputSchema: { ...accountArg, ...companyArg },
            },
            async ({ account, company }) => {
                try {
                    const id = pickAccount(accounts, account).account;
                    return text(await api.statements(id, await api.resolveCompany(id, company)));
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }

    if (any("propose")) {
        const sessionArg = { session: z.string().describe("The reconciliation session id, as the Saldeo view or the owner's message names it.") };
        server.registerTool(
            "saldeo_sessions",
            { description: "The reconciliation sessions (imported bank statements) of a connection, with how many items await a decision.", inputSchema: accountArg },
            async ({ account }) => {
                try {
                    return text(await api.sessions(pickAccount(accounts, account).account));
                } catch (error) {
                    return failure(error);
                }
            },
        );
        server.registerTool(
            "saldeo_session",
            {
                description:
                    "One session: the transactions still without a decision (by default only those the matcher could not settle confidently), each with the matcher's candidates and reasons, plus the pool of open invoices it was matched against. Propose with saldeo_propose; never decide.",
                inputSchema: { ...accountArg, ...sessionArg, all: z.boolean().optional().describe("Every item, decided ones included.") },
            },
            async ({ account, session, all }) => {
                try {
                    const current = await api.session(pickAccount(accounts, account).account, session);
                    const items = current.items.filter((item) => all === true || (item.decision === undefined && item.verdict !== "confident"));
                    const pool = current.invoices.filter((invoice) => !invoice.isPaid && invoice.remaining > 0);
                    return text({
                        session: current.id,
                        company: current.company,
                        file: current.file.name,
                        items: items.map((item) => itemLine(current, item)),
                        pool: pool.slice(0, POOL_LIMIT).map(invoiceLine),
                        ...(pool.length > POOL_LIMIT ? { poolTruncated: `${pool.length - POOL_LIMIT} more open invoices not shown; use saldeo_invoices or saldeo_documents to look one up` } : {}),
                    });
                } catch (error) {
                    return failure(error);
                }
            },
        );
        server.registerTool(
            "saldeo_propose",
            {
                description:
                    "Record which invoice(s) a transaction pays, with your reasons. A proposal, not a decision: the owner confirms it in the Saldeo view. Amounts are integer grosze and must add up to what the transaction can cover.",
                inputSchema: {
                    ...accountArg,
                    ...sessionArg,
                    transactionId: z.string(),
                    invoices: z.array(z.object({ invoiceId: z.string().describe("An id from the session's pool, e.g. invoice:12 or document:65."), amount: z.number().int().positive().describe("Grosze allocated to this invoice.") })).min(1),
                    reasons: z.array(z.string()).min(1).describe("What convinced you, one fact per entry."),
                    confidence: z.number().min(0).max(100).optional().describe("0–100; default 75."),
                    note: z.string().optional(),
                },
            },
            async ({ account, session, transactionId, invoices, reasons, confidence, note }) => {
                try {
                    const updated = await api.propose(pickAccount(accounts, account).account, session, {
                        transactionId,
                        invoices,
                        reasons,
                        ...(confidence === undefined ? {} : { confidence }),
                        ...(note === undefined ? {} : { note }),
                    });
                    const item = updated.items.find((entry) => entry.transactionId === transactionId);
                    return text({ recorded: true, item: item === undefined ? undefined : itemLine(updated, item) });
                } catch (error) {
                    return failure(error);
                }
            },
        );
        server.registerTool(
            "saldeo_skip",
            {
                description: "Record that a transaction pays no invoice at all (a bank fee, tax, an internal transfer, a salary), with the reason. The owner still sees it.",
                inputSchema: { ...accountArg, ...sessionArg, transactionId: z.string(), reason: z.string().min(1) },
            },
            async ({ account, session, transactionId, reason }) => {
                try {
                    await api.skip(pickAccount(accounts, account).account, session, transactionId, reason);
                    return text({ recorded: true });
                } catch (error) {
                    return failure(error);
                }
            },
        );
        server.registerTool(
            "saldeo_record_marking",
            {
                description:
                    "After marking a confirmed settlement paid in SaldeoSMART's web app (or failing to), record the outcome on the transaction so the view and the ledger know. Only for transactions the owner already confirmed.",
                inputSchema: {
                    ...accountArg,
                    ...sessionArg,
                    transactionId: z.string(),
                    status: z.enum(["ok", "failed"]),
                    note: z.string().optional().describe("Where it was marked, or what stopped you."),
                    conversationId: z.string().optional(),
                },
            },
            async ({ account, session, transactionId, status, note, conversationId }) => {
                try {
                    await api.recordMarking(pickAccount(accounts, account).account, session, {
                        transactionId,
                        status,
                        ...(note === undefined ? {} : { note }),
                        ...(conversationId === undefined ? {} : { conversationId }),
                    });
                    return text({ recorded: true });
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }

    await server.connect(new StdioServerTransport());
};

void main();
