import { accountsFromEnv, pickAccount, workspaceRootFrom } from "../core/env.ts";
import { formatAmount } from "../core/money.ts";
import { createService } from "../core/service.ts";

// `saldeo`: the same operations as the MCP server, for a runtime without MCP or a person in a terminal. Output is
// readable by default and JSON with --json; the credentials are in the environment already, never on the command line.

const USAGE = `usage: saldeo <verb> [options]

  status                                   connections, switches, reachability
  companies                                companies this login sees
  contractors [--company ID]               a company's contractors
  invoices [--company ID] [--months N] [--all]
                                           open invoices and cost documents (money owed), last N months
  documents (--number NUM | --nip NIP) [--company ID]
                                           search the document archive
  statements [--company ID]                bank statements Saldeo holds, with settlements
  sessions                                 reconciliation sessions
  session <id> [--all]                     one session's unresolved items and pool
  propose <session> <transaction> --invoice ID=GROSZE [--invoice …] --reason "…" [--reason …] [--confidence N] [--note "…"]
  skip <session> <transaction> --reason "…"
  record-marking <session> <transaction> ok|failed [--note "…"] [--conversation ID]

  --account ID    which SaldeoSMART connection, when more than one is connected
  --json          machine-readable output`;

interface Parsed {
    readonly positional: string[];
    readonly flags: Map<string, string[]>;
}

const parse = (argv: readonly string[]): Parsed => {
    const positional: string[] = [];
    const flags = new Map<string, string[]>();
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index] as string;
        if (arg.startsWith("--")) {
            const name = arg.slice(2);
            const next = argv[index + 1];
            if (name === "json" || name === "all" || next === undefined || next.startsWith("--")) {
                flags.set(name, [...(flags.get(name) ?? []), "true"]);
            } else {
                flags.set(name, [...(flags.get(name) ?? []), next]);
                index += 1;
            }
        } else {
            positional.push(arg);
        }
    }
    return { positional, flags };
};

const main = async (): Promise<void> => {
    const { positional, flags } = parse(process.argv.slice(2));
    const [verb, ...rest] = positional;
    const flag = (name: string): string | undefined => flags.get(name)?.[0];
    const asJson = flags.has("json");
    if (verb === undefined || verb === "help" || verb === "--help") {
        console.log(USAGE);
        return;
    }
    const accounts = accountsFromEnv();
    const api = createService({ workspaceRoot: workspaceRootFrom(), connection: (account) => Promise.resolve(pickAccount(accounts, account)) });
    const account = (): string => pickAccount(accounts, flag("account")).account;
    const company = async (): Promise<string> => api.resolveCompany(account(), flag("company"));
    const print = (value: unknown, lines?: () => string[]): void => {
        if (asJson || lines === undefined) {
            console.log(JSON.stringify(value, undefined, 2));
        } else {
            console.log(lines().join("\n"));
        }
    };

    switch (verb) {
        case "status": {
            if (accounts.length === 0) {
                console.log("no SaldeoSMART connection reaches this shell: no card connected, or withheld from this persona");
                process.exitCode = 1;
                return;
            }
            const statuses = await Promise.all(accounts.map((entry) => api.status(entry.account)));
            print(statuses, () =>
                statuses.map(
                    (status) =>
                        `${status.account}: ${status.username}${status.company === undefined ? "" : ` · company ${status.company}`} · ${status.reachable ? "reachable" : "unreachable"}${status.detail === undefined ? "" : ` (${status.detail})`} · reads: ${Object.entries(status.scopes)
                            .filter(([, on]) => on)
                            .map(([name]) => name)
                            .join(", ")}`,
                ),
            );
            return;
        }
        case "companies": {
            const companies = await api.companies(account());
            print(companies, () => companies.map((entry) => `${entry.programId}\t${entry.name}${entry.nip === undefined ? "" : `\tNIP ${entry.nip}`}`));
            return;
        }
        case "contractors": {
            const contractors = await api.contractors(account(), await company());
            print(contractors, () => contractors.map((entry) => `${entry.id}\t${entry.name}\t${entry.nip ?? ""}\t${entry.bankAccounts.join(" ")}`));
            return;
        }
        case "invoices": {
            const months = Number.parseInt(flag("months") ?? "", 10);
            const invoices = await api.payables(account(), await company(), { ...(Number.isInteger(months) ? { months } : {}), open: !flags.has("all") });
            print(invoices, () =>
                invoices.map(
                    (invoice) =>
                        `${invoice.id}\t${invoice.direction === "in" ? "IN " : "OUT"}\t${invoice.number}\t${invoice.issueDate}\tdue ${invoice.dueDate ?? "?"}\t${formatAmount(invoice.remaining, invoice.currency)} of ${formatAmount(invoice.total)}\t${invoice.contractor?.name ?? ""}${invoice.isPaid ? "\tPAID" : ""}`,
                ),
            );
            return;
        }
        case "documents": {
            const number = flag("number");
            const nip = flag("nip");
            const found = await api.search(account(), await company(), { ...(number === undefined ? {} : { number }), ...(nip === undefined ? {} : { nip }) });
            print(found, () => found.map((invoice) => `${invoice.id}\t${invoice.number}\t${invoice.issueDate}\t${formatAmount(invoice.total, invoice.currency)}\t${invoice.isPaid ? "PAID" : `open ${formatAmount(invoice.remaining)}`}`));
            return;
        }
        case "statements": {
            const statements = await api.statements(account(), await company());
            print(statements, () =>
                statements.flatMap((statement) => [
                    `${statement.account} ${statement.from}..${statement.to} ${statement.status}`,
                    ...statement.operations.map(
                        (operation) =>
                            `  ${operation.date}\t${formatAmount(operation.amount, operation.currency)}\t${operation.description}\t${operation.settled.length === 0 ? "" : `settled: ${operation.settled.map((ref) => `${ref.number} (${formatAmount(ref.amountSettled)})`).join(", ")}`}`,
                    ),
                ]),
            );
            return;
        }
        case "sessions": {
            const sessions = await api.sessions(account());
            print(sessions, () => sessions.map((entry) => `${entry.id}\t${entry.file.name}\t${entry.counts.transactions} transactions\tawaiting ${entry.counts.awaiting}\tconfirmed ${entry.counts.confirmed}`));
            return;
        }
        case "session": {
            const id = rest[0];
            if (id === undefined) {
                throw new Error("session needs an id");
            }
            const session = await api.session(account(), id);
            const items = session.items.filter((item) => flags.has("all") || (item.decision === undefined && item.verdict !== "confident"));
            print(
                { session, items },
                () => [
                    `${session.id} · ${session.file.name} · company ${session.company} · ${session.transactions.length} transactions, ${session.invoices.length} invoices in the pool`,
                    ...items.flatMap((item) => {
                        const transaction = session.transactions.find((entry) => entry.id === item.transactionId);
                        return [
                            `${item.transactionId}\t${transaction?.date ?? ""}\t${transaction === undefined ? "" : formatAmount(transaction.amount, transaction.currency)}\t${transaction?.counterparty ?? ""}\t${transaction?.title ?? ""}\t[${item.verdict}${item.decision === undefined ? "" : `, ${item.decision.status}`}]`,
                            ...item.proposals.map(
                                (proposal) =>
                                    `    ${proposal.by} ${proposal.score}: ${proposal.invoices.map((allocation) => `${session.invoices.find((entry) => entry.id === allocation.invoiceId)?.number ?? allocation.invoiceId} ${formatAmount(allocation.amount)}`).join(" + ")} — ${proposal.reasons.join("; ")}`,
                            ),
                        ];
                    }),
                ],
            );
            return;
        }
        case "propose": {
            const [sessionId, transactionId] = rest;
            if (sessionId === undefined || transactionId === undefined) {
                throw new Error("propose needs <session> <transaction>");
            }
            const invoices = (flags.get("invoice") ?? []).map((entry) => {
                const [invoiceId, amount] = entry.split("=");
                if (invoiceId === undefined || amount === undefined || !/^\d+$/.test(amount)) {
                    throw new Error(`--invoice wants ID=GROSZE, got "${entry}"`);
                }
                return { invoiceId, amount: Number.parseInt(amount, 10) };
            });
            const reasons = flags.get("reason") ?? [];
            const confidence = Number.parseFloat(flag("confidence") ?? "");
            const note = flag("note");
            await api.propose(account(), sessionId, { transactionId, invoices, reasons, ...(Number.isFinite(confidence) ? { confidence } : {}), ...(note === undefined ? {} : { note }) });
            console.log(`proposed ${invoices.length} invoice(s) for ${transactionId} in ${sessionId}`);
            return;
        }
        case "skip": {
            const [sessionId, transactionId] = rest;
            const reason = flag("reason");
            if (sessionId === undefined || transactionId === undefined || reason === undefined) {
                throw new Error(`skip needs <session> <transaction> --reason "…"`);
            }
            await api.skip(account(), sessionId, transactionId, reason);
            console.log(`skipped ${transactionId} in ${sessionId}`);
            return;
        }
        case "record-marking": {
            const [sessionId, transactionId, status] = rest;
            if (sessionId === undefined || transactionId === undefined || (status !== "ok" && status !== "failed")) {
                throw new Error("record-marking needs <session> <transaction> ok|failed");
            }
            const note = flag("note");
            const conversationId = flag("conversation");
            await api.recordMarking(account(), sessionId, { transactionId, status, ...(note === undefined ? {} : { note }), ...(conversationId === undefined ? {} : { conversationId }) });
            console.log(`recorded ${status} for ${transactionId} in ${sessionId}`);
            return;
        }
        default:
            console.error(`unknown verb "${verb}"\n\n${USAGE}`);
            process.exitCode = 2;
    }
};

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
