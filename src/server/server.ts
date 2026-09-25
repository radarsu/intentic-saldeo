import type { ExtensionServerApi, ExtensionServerContext } from "@intentic/extension-api";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { DEFAULT_BASE_URL, type Session } from "../core/contract.ts";
import { formatAmount } from "../core/money.ts";
import { SaldeoError, type SaldeoClientOptions } from "../core/saldeo/client.ts";
import { type AccountConnection, BadRequest, createService, NotFound, type SaldeoService, ScopeRefused, scopesOf } from "../core/service.ts";
import { StoreConflict, updateSession } from "../core/store/store.ts";
import type { AgentRunRequest, DecideAllRequest, DecideRequest, ImportRequest, MappingRequest, MarkRequest, RecordMarkingRequest } from "../core/wire.ts";
import { saldeoMcpServer } from "../mcp/tools.ts";

// Backend half: the Saldeo view's whole data plane, served from this extension's /x namespace. Credentials come from
// the daemon's connection read (a capability's stored config, secrets included, which only a declared backend may
// call); state lives in the workspace's records; the two agent turns it can start go through POST /agent.
// It also serves the agent's MCP tools at `mcp/<card>`, the manifest's `mcp`: the daemon mounts that into every turn
// granted the card, so every session shares this one process instead of spawning a stdio server of its own.

const CONNECTION_TTL_MS = 60_000;
const TITLE_MAX = 80;
const RUN_ROLE = "saldeo-reconcile";

interface ConnectionRead {
    readonly id: string;
    readonly kind: string;
    readonly config: Readonly<Record<string, string | undefined>>;
}

interface AgentStart {
    readonly conversationId: string;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const statusOf = (error: unknown): number => {
    if (error instanceof NotFound) {
        return 404;
    }
    if (error instanceof BadRequest) {
        return 400;
    }
    if (error instanceof ScopeRefused) {
        return 403;
    }
    if (error instanceof StoreConflict) {
        return 409;
    }
    if (error instanceof SaldeoError) {
        return 502;
    }
    return 500;
};

let sequence = 0;
// Client-minted, and reused in branch names and paths, so only [a-z0-9-].
const mintConversationId = (kind: string, sessionId: string, now: number): string =>
    `saldeo-${kind}-${sessionId.replaceAll(/[^a-z0-9-]/g, "-").slice(0, 24)}-${now.toString(36)}${(sequence++).toString(36)}`;

// One place that turns a capability into a connection: reads the card's config through the daemon, once a minute.
export const connectionReader = (
    read: (id: string) => Promise<ConnectionRead>,
    now: () => number = Date.now,
): ((account: string) => Promise<AccountConnection>) => {
    const cache = new Map<string, { at: number; connection: AccountConnection }>();
    return async (account) => {
        const cached = cache.get(account);
        if (cached !== undefined && now() - cached.at < CONNECTION_TTL_MS) {
            return cached.connection;
        }
        let read_: ConnectionRead;
        try {
            read_ = await read(account);
        } catch (error) {
            throw new NotFound(`no SaldeoSMART connection "${account}": ${error instanceof Error ? error.message : String(error)}`);
        }
        const { provider, username, apiToken, baseUrl, company } = read_.config;
        if (read_.kind !== "cli" || provider !== "saldeosmart" || username === undefined || apiToken === undefined) {
            throw new NotFound(`"${account}" is not a connected SaldeoSMART API card`);
        }
        const connection: AccountConnection = {
            account,
            credentials: { username, apiToken, baseUrl: baseUrl === undefined || baseUrl === "" ? DEFAULT_BASE_URL : baseUrl },
            ...(company === undefined || company === "" ? {} : { company }),
            scopes: scopesOf(read_.config),
        };
        cache.set(account, { at: now(), connection });
        return connection;
    };
};

export const resolvePrompt = (session: Session, unresolved: number): string =>
    [
        `Reconciliation session ${session.id} for the SaldeoSMART connection "${session.account}" (company ${session.company}) has ${unresolved} bank transaction${unresolved === 1 ? "" : "s"} without a confident match to an open invoice.`,
        `Work through them with the saldeo tools of the "${session.account}" MCP server: \`saldeo_session\` (session "${session.id}") lists the unresolved transactions, the candidates the matcher found and the pool of open invoices; \`saldeo_invoices\` and \`saldeo_documents\` reach further back or look a number or NIP up; \`saldeo_propose\` records which invoice(s) a transaction pays, with your reasons; \`saldeo_skip\` records that a transaction is not an invoice payment at all (a fee, tax, an internal transfer).`,
        `Propose only what the evidence supports: an invoice number in the title, the contractor's NIP or account, an amount that equals what is owed or a sum of several invoices of one contractor. Say in each proposal what convinced you. Leave a transaction alone rather than guess.`,
        `You never confirm and never mark anything paid: the owner confirms each proposal in the Saldeo view, and marking happens in a separate step they start. When every unresolved transaction has a proposal or a skip, stop and summarise what you proposed and what you could not resolve.`,
    ].join("\n\n");

export const markPrompt = (session: Session, browserAccount: string, items: ReturnType<SaldeoService["unmarked"]>): string => {
    const lines = items.map(({ item, transaction, invoices }) =>
        [
            `- transaction ${transaction.id} (${transaction.date}, ${formatAmount(transaction.amount, transaction.currency)}, "${transaction.title}"${transaction.counterparty === undefined ? "" : `, from ${transaction.counterparty}`}) settles:`,
            ...invoices.map(({ allocation, invoice }) =>
                `    - ${invoice?.kind ?? "invoice"} ${invoice?.number ?? allocation.invoiceId} (Saldeo id ${invoice?.saldeoId ?? "?"}, ${invoice?.source === "document" ? "document archive" : "invoice issued in Saldeo"}), amount ${formatAmount(allocation.amount, transaction.currency)}${item.marking?.status === "failed" ? " — a previous attempt failed: " + (item.marking.note ?? "no note") : ""}`,
            ),
        ].join("\n"),
    );
    return [
        `The owner confirmed ${items.length} settlement${items.length === 1 ? "" : "s"} in reconciliation session ${session.id} (SaldeoSMART connection "${session.account}", company ${session.company}). Mark them as paid in SaldeoSMART through the connected browser account "${browserAccount}"; its skill explains where in the web app that happens.`,
        lines.join("\n"),
        `For each transaction, once SaldeoSMART shows the invoice as paid (or the transaction linked), call \`saldeo_record_marking\` on the "${session.account}" MCP server with session "${session.id}", the transaction id and status "ok"; if you cannot do it, record "failed" with a note saying what stopped you, and move on. Use the transaction's date as the payment date. Touch nothing else in SaldeoSMART: no other invoice, no edits beyond the payment. When done, summarise what was marked and what was not.`,
    ].join("\n\n");
};

export interface ServerOptions {
    readonly clientOptions?: SaldeoClientOptions;
}

export const activateServer = (api: ExtensionServerApi, _context: ExtensionServerContext, options: ServerOptions = {}): void => {
    const connection = connectionReader((id) => api.daemon.json<ConnectionRead>(`/capabilities/${encodeURIComponent(id)}/connection`));
    const service = createService({ workspaceRoot: api.workspaceRoot, connection, ...(options.clientOptions === undefined ? {} : { clientOptions: options.clientOptions }) });

    const browserAccountOf = async (id: string): Promise<string> => {
        const read = await api.daemon.json<ConnectionRead>(`/capabilities/${encodeURIComponent(id)}/connection`).catch(() => undefined);
        if (read === undefined || read.kind !== "browser" || read.config["platform"] !== "saldeosmart-web") {
            throw new BadRequest(`"${id}" is not a connected SaldeoSMART (web) browser account`);
        }
        return id;
    };

    const startAgent = async (prompt: string, title: string, conversationId: string, pick: Readonly<Record<string, unknown>> | undefined): Promise<AgentStart> => {
        await api.daemon.json(`/agent`, {
            method: "POST",
            body: JSON.stringify({
                prompt,
                conversationId,
                isolated: true,
                unattended: true,
                runRole: RUN_ROLE,
                ...(pick ?? {}),
                title: title.slice(0, TITLE_MAX),
            }),
        });
        return { conversationId };
    };

    // Stateless Streamable HTTP (no session id generator): a fresh server per request, built from the card as it reads now, so a switch flipped
    // on the card changes the tool list on the next call without anything to invalidate. SSE answers (not JSON) put
    // the headers out before the tool runs, so a slow SaldeoSMART read never trips the daemon proxy's header deadline.
    const serveMcp = async (request: Request, account: string): Promise<Response> => {
        const server = saldeoMcpServer(service, await connection(account));
        const transport = new WebStandardStreamableHTTPServerTransport({});
        await server.connect(transport);
        return transport.handleRequest(request);
    };

    const handle = async (request: Request): Promise<Response | undefined> => {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter((part) => part !== "");
        if (parts[0] === "mcp" && parts[1] !== undefined && parts.length === 2) {
            return serveMcp(request, decodeURIComponent(parts[1]));
        }
        if (parts[0] !== "accounts" || parts[1] === undefined) {
            return undefined;
        }
        const account = decodeURIComponent(parts[1]);
        const rest = parts.slice(2).map(decodeURIComponent);
        const body = async <T>(): Promise<T> => (await request.json()) as T;
        const company = url.searchParams.get("company") ?? "";

        if (rest.length === 1 && request.method === "GET") {
            switch (rest[0]) {
                case "status":
                    return json(await service.status(account));
                case "companies":
                    return json({ companies: await service.companies(account) });
                case "invoices": {
                    const months = Number.parseInt(url.searchParams.get("months") ?? "", 10);
                    const invoices = await service.payables(account, company, { ...(Number.isInteger(months) && months > 0 ? { months } : {}), open: url.searchParams.get("open") !== "0" });
                    return json({ invoices, fetchedAt: new Date().toISOString() });
                }
                case "statements":
                    return json({ statements: await service.statements(account, company) });
                case "sessions":
                    return json({ sessions: await service.sessions(account) });
                case "ledger":
                    return json({ ledger: await service.ledger(account) });
                default:
                    return undefined;
            }
        }
        if (rest[0] === "sessions" && rest.length === 1 && request.method === "POST") {
            const input = await body<ImportRequest>();
            if (typeof input.content !== "string" || typeof input.name !== "string" || typeof input.company !== "string") {
                throw new BadRequest("import needs company, name and base64 content");
            }
            const session = await service.importFile(account, input.company, input.name, new Uint8Array(Buffer.from(input.content, "base64")));
            return json({ session }, 201);
        }
        if (rest[0] !== "sessions" || rest[1] === undefined) {
            return undefined;
        }
        const id = rest[1];
        const action = rest[2];
        if (action === undefined) {
            if (request.method === "GET") {
                return json({ session: await service.session(account, id) });
            }
            if (request.method === "DELETE") {
                await service.deleteSession(account, id);
                return json({ ok: true });
            }
            return undefined;
        }
        if (request.method !== "PUT" && request.method !== "POST") {
            return undefined;
        }
        switch (action) {
            case "mapping": {
                const input = await body<MappingRequest>();
                const { session, skipped } = await service.applyMapping(account, id, input.mapping, input.lookbackMonths);
                return json({ session, skipped });
            }
            case "rematch":
                return json({ session: await service.rematch(account, id) });
            case "decide": {
                const input = await body<DecideRequest>();
                return json({ session: await service.decide(account, id, input) });
            }
            case "decide-all": {
                const input = await body<DecideAllRequest>();
                if (input.verdict !== "confident") {
                    throw new BadRequest(`decide-all only confirms "confident" items`);
                }
                return json({ session: await service.confirmAll(account, id) });
            }
            case "ask-agent": {
                const input = await body<AgentRunRequest>();
                const session = await service.session(account, id);
                const unresolved = session.items.filter((item) => item.decision === undefined && item.verdict !== "confident" && item.verdict !== "ignored");
                if (unresolved.length === 0) {
                    throw new BadRequest("nothing is unresolved in this session");
                }
                const conversationId = mintConversationId("resolve", session.id, Date.now());
                await startAgent(resolvePrompt(session, unresolved.length), `Saldeo: resolve ${unresolved.length} payments (${session.file.name})`, conversationId, input.pick);
                await recordRun(account, id, conversationId, "resolve");
                return json({ conversationId, items: unresolved.length });
            }
            case "mark": {
                const input = await body<MarkRequest>();
                const browserAccount = await browserAccountOf(input.browserAccount);
                const session = await service.session(account, id);
                const wanted = input.transactionIds === undefined ? undefined : new Set(input.transactionIds);
                const items = service.unmarked(session).filter((entry) => wanted === undefined || wanted.has(entry.item.transactionId));
                if (items.length === 0) {
                    throw new BadRequest("nothing confirmed is waiting to be marked");
                }
                const conversationId = mintConversationId("mark", session.id, Date.now());
                await startAgent(markPrompt(session, browserAccount, items), `Saldeo: mark ${items.length} paid (${session.file.name})`, conversationId, input.pick);
                for (const entry of items) {
                    await service.recordMarking(account, id, { transactionId: entry.item.transactionId, status: "pending", conversationId });
                }
                await recordRun(account, id, conversationId, "mark");
                return json({ conversationId, items: items.length });
            }
            case "record-marking": {
                const input = await body<RecordMarkingRequest>();
                return json({ session: await service.recordMarking(account, id, input) });
            }
            case "verify":
                return json({ session: await service.verify(account, id) });
            default:
                return undefined;
        }
    };

    const recordRun = async (account: string, id: string, conversationId: string, kind: "resolve" | "mark"): Promise<void> => {
        await updateSession(api.workspaceRoot, account, id, (current) => ({
            ...current,
            agentRuns: [...current.agentRuns, { conversationId, kind, startedAt: new Date().toISOString() }],
        }));
    };

    api.routes.mount(async (request) => {
        try {
            return await handle(request);
        } catch (error) {
            const status = statusOf(error);
            if (status === 500) {
                api.log(`unexpected: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
            }
            return json({ error: error instanceof Error ? error.message : String(error) }, status);
        }
    });
};
