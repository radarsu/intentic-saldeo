import { z } from "zod";
import type { OpenInvoice, Session, SessionItem, Transaction } from "../core/contract.ts";
import { formatAmount } from "../core/money.ts";
import type { AccountConnection, SaldeoService } from "../core/service.ts";
import type { ToolDefinition, ToolResult } from "../server/tools-api.ts";

// The agent's SaldeoSMART tools for ONE connected card. The backend hands them to the host (`api.tools.serve`, server.ts)
// and the daemon mounts them into every turn granted the card, on every runtime, as a server named by the card's id;
// the host owns the MCP transport and each call's deadline. Which tools exist follows the card's switches, read fresh
// on every request, so a card that says "no proposing" yields an agent that has no way to propose.

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

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, undefined, 2) }] });
const failure = (error: unknown): ToolResult => ({ content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true });

// One tool from a zod shape: the host lists its JSON Schema, and a call's arguments are parsed by the same shape before
// the handler sees them, so a malformed call answers as the model-readable refusal zod writes.
const tool = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: Shape,
    run: (args: z.infer<z.ZodObject<Shape>>) => Promise<ToolResult>,
): ToolDefinition => {
    const schema = z.object(shape);
    return {
        name,
        description,
        inputSchema: z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>,
        call: async (args) => {
            const parsed = schema.safeParse(args);
            if (!parsed.success) {
                return failure(z.prettifyError(parsed.error));
            }
            try {
                return await run(parsed.data);
            } catch (error) {
                return failure(error);
            }
        },
    };
};

export const saldeoTools = (api: SaldeoService, connection: AccountConnection): ToolDefinition[] => {
    const { account, scopes } = connection;
    const tools: ToolDefinition[] = [];
    const companyArg = { company: z.string().optional().describe("The company's program id (company_program_id). Leave it out when the card pins one or the login sees only one.") };

    tools.push(tool("saldeo_status", "What this SaldeoSMART connection may read, and whether the API answers. Call first when unsure.", {}, async () => {
            try {
                return text(await api.status(account));
            } catch (error) {
                return failure(error);
            }
        }));

    tools.push(tool("saldeo_companies", "The companies (clients of the office) this login can see, with their program ids.", {}, async () => {
            try {
                return text(await api.companies(account));
            } catch (error) {
                return failure(error);
            }
        }));

    if (scopes.invoices || scopes.documents) {
        tools.push(tool("saldeo_contractors", "A company's contractors: names, NIPs, bank accounts. Useful to tell who a bank counterparty is.", companyArg, async ({ company }) => {
                try {
                    return text(await api.contractors(account, await api.resolveCompany(account, company)));
                } catch (error) {
                    return failure(error);
                }
            }));
        tools.push(tool("saldeo_invoices", "Invoices and documents that carry an amount owed: sales invoices issued in Saldeo (money in) and cost documents from the archive (money out), with what is still open. Defaults to open ones from the last 6 months.", {
                                        ...companyArg,
                    months: z.number().int().min(1).max(36).optional().describe("How many months back, counting the current one. Default 6."),
                    all: z.boolean().optional().describe("Include paid ones too."),
                }, async ({ company, months, all }) => {
                try {
                    const invoices = await api.payables(account, await api.resolveCompany(account, company), { ...(months === undefined ? {} : { months }), open: all !== true });
                    return text(invoices.map(invoiceLine));
                } catch (error) {
                    return failure(error);
                }
            }));
    }

    if (scopes.documents) {
        tools.push(tool("saldeo_documents", "Search the document archive by document number or contractor NIP, any age. Answers documents with their paid state.", { ...companyArg, number: z.string().optional().describe("The document number as printed."), nip: z.string().optional().describe("The contractor's NIP, digits only.") }, async ({ company, number, nip }) => {
                try {
                    const found = await api.search(account, await api.resolveCompany(account, company), { ...(number === undefined ? {} : { number }), ...(nip === undefined ? {} : { nip }) });
                    return text(found.map(invoiceLine));
                } catch (error) {
                    return failure(error);
                }
            }));
    }

    if (scopes.bankStatements) {
        tools.push(tool("saldeo_bank_statements", "Bank statements SaldeoSMART already holds for a company, each operation with what Saldeo settled it against. Read-only; a way to see what is already reconciled there.", companyArg, async ({ company }) => {
                try {
                    return text(await api.statements(account, await api.resolveCompany(account, company)));
                } catch (error) {
                    return failure(error);
                }
            }));
    }

    if (scopes.propose) {
        const sessionArg = { session: z.string().describe("The reconciliation session id, as the Saldeo view or the owner's message names it.") };
        tools.push(tool("saldeo_sessions", "The reconciliation sessions (imported bank statements) of a connection, with how many items await a decision.", {}, async () => {
                try {
                    return text(await api.sessions(account));
                } catch (error) {
                    return failure(error);
                }
            }));
        tools.push(tool("saldeo_session", "One session: the transactions still without a decision (by default only those the matcher could not settle confidently), each with the matcher's candidates and reasons, plus the pool of open invoices it was matched against. Propose with saldeo_propose; never decide.", { ...sessionArg, all: z.boolean().optional().describe("Every item, decided ones included.") }, async ({ session, all }) => {
                try {
                    const current = await api.session(account, session);
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
            }));
        tools.push(tool("saldeo_propose", "Record which invoice(s) a transaction pays, with your reasons. A proposal, not a decision: the owner confirms it in the Saldeo view. Amounts are integer grosze and must add up to what the transaction can cover.", {
                                        ...sessionArg,
                    transactionId: z.string(),
                    invoices: z.array(z.object({ invoiceId: z.string().describe("An id from the session's pool, e.g. invoice:12 or document:65."), amount: z.number().int().positive().describe("Grosze allocated to this invoice.") })).min(1),
                    reasons: z.array(z.string()).min(1).describe("What convinced you, one fact per entry."),
                    confidence: z.number().min(0).max(100).optional().describe("0–100; default 75."),
                    note: z.string().optional(),
                }, async ({ session, transactionId, invoices, reasons, confidence, note }) => {
                try {
                    const updated = await api.propose(account, session, {
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
            }));
        tools.push(tool("saldeo_skip", "Record that a transaction pays no invoice at all (a bank fee, tax, an internal transfer, a salary), with the reason. The owner still sees it.", { ...sessionArg, transactionId: z.string(), reason: z.string().min(1) }, async ({ session, transactionId, reason }) => {
                try {
                    await api.skip(account, session, transactionId, reason);
                    return text({ recorded: true });
                } catch (error) {
                    return failure(error);
                }
            }));
        tools.push(tool("saldeo_record_marking", "After marking a confirmed settlement paid in SaldeoSMART's web app (or failing to), record the outcome on the transaction so the view and the ledger know. Only for transactions the owner already confirmed.", {
                                        ...sessionArg,
                    transactionId: z.string(),
                    status: z.enum(["ok", "failed"]),
                    note: z.string().optional().describe("Where it was marked, or what stopped you."),
                    conversationId: z.string().optional(),
                }, async ({ session, transactionId, status, note, conversationId }) => {
                try {
                    await api.recordMarking(account, session, {
                        transactionId,
                        status,
                        ...(note === undefined ? {} : { note }),
                        ...(conversationId === undefined ? {} : { conversationId }),
                    });
                    return text({ recorded: true });
                } catch (error) {
                    return failure(error);
                }
            }));
    }

    return tools;
};
