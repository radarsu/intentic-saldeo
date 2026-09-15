import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Ledger, LedgerEntry, Session, SessionCounts, SessionSummary } from "../contract.ts";

// Where reconciliation state lives and how it is written: JSON files under `.intentic/records/saldeo/<account>/`,
// which every worktree shares live and the daemon watches, so the backend, the MCP server and the CLI all see one
// truth. Writes are atomic (tmp + rename) and versioned: a writer that read version N may only replace version N.

const RECORDS = [".intentic", "records", "saldeo"] as const;

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

const safe = (segment: string, what: string): string => {
    if (!SAFE_SEGMENT.test(segment)) {
        throw new Error(`${what} "${segment}" is not a safe path segment`);
    }
    return segment;
};

export const saldeoRoot = (workspaceRoot: string): string => join(workspaceRoot, ...RECORDS);
export const accountDir = (workspaceRoot: string, account: string): string => join(saldeoRoot(workspaceRoot), safe(account, "account"));
export const sessionPath = (workspaceRoot: string, account: string, id: string): string => join(accountDir(workspaceRoot, account), "sessions", `${safe(id, "session id")}.json`);
export const ledgerPath = (workspaceRoot: string, account: string): string => join(accountDir(workspaceRoot, account), "ledger.json");

export class StoreConflict extends Error {
    constructor(what: string) {
        super(`${what} changed under you; read it again and retry`);
        this.name = "StoreConflict";
    }
}

export const readJson = async <T>(path: string): Promise<T | undefined> => {
    try {
        return JSON.parse(await readFile(path, "utf8")) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return undefined;
        }
        throw error;
    }
};

export const writeJsonAtomic = async (path: string, value: unknown): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, undefined, 2)}\n`);
    await rename(temp, path);
};

export const newSessionId = (now: Date = new Date()): string =>
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${randomBytes(3).toString("hex")}`;

export const countsOf = (session: Session): SessionCounts => {
    const counts = {
        transactions: session.transactions.length,
        confident: 0,
        ambiguous: 0,
        unmatched: 0,
        ignored: 0,
        proposedByAgent: 0,
        confirmed: 0,
        rejected: 0,
        skipped: 0,
        marked: 0,
        markFailed: 0,
        awaiting: 0,
    };
    for (const item of session.items) {
        if (item.decision === undefined) {
            counts[item.verdict] += 1;
            if (item.proposals.some((proposal) => proposal.by === "agent")) {
                counts.proposedByAgent += 1;
            }
            if (item.proposals.length > 0 && item.verdict !== "ignored") {
                counts.awaiting += 1;
            }
            continue;
        }
        counts[item.decision.status] += 1;
        if (item.marking?.status === "ok") {
            counts.marked += 1;
        } else if (item.marking?.status === "failed") {
            counts.markFailed += 1;
        }
    }
    return counts;
};

export const summaryOf = (session: Session): SessionSummary => ({
    id: session.id,
    account: session.account,
    company: session.company,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    file: session.file,
    mapped: session.mapping !== undefined,
    counts: countsOf(session),
});

export const readSession = async (workspaceRoot: string, account: string, id: string): Promise<Session | undefined> =>
    readJson<Session>(sessionPath(workspaceRoot, account, id));

export const listSessions = async (workspaceRoot: string, account: string): Promise<SessionSummary[]> => {
    let names: string[];
    try {
        names = await readdir(join(accountDir(workspaceRoot, account), "sessions"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const sessions = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<Session>(join(accountDir(workspaceRoot, account), "sessions", name))));
    return sessions
        .filter((session): session is Session => session !== undefined)
        .map(summaryOf)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

// Persists `session` as the next version of what is on disk; `session.version` must equal the stored one (or the file
// must be absent for version 0), otherwise the caller lost a race and gets a conflict instead of a silent overwrite.
export const writeSession = async (workspaceRoot: string, session: Session, now: Date = new Date()): Promise<Session> => {
    const path = sessionPath(workspaceRoot, session.account, session.id);
    const stored = await readJson<Session>(path);
    if ((stored?.version ?? 0) !== session.version) {
        throw new StoreConflict(`session ${session.id}`);
    }
    const next: Session = { ...session, version: session.version + 1, updatedAt: now.toISOString() };
    await writeJsonAtomic(path, next);
    return next;
};

// Read-modify-write with the conflict retried a few times, for edits that are small and commutative (a decision, a
// proposal) rather than whole-session replacements.
export const updateSession = async (workspaceRoot: string, account: string, id: string, edit: (session: Session) => Session): Promise<Session> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const current = await readSession(workspaceRoot, account, id);
        if (current === undefined) {
            throw new Error(`no session ${id} for ${account}`);
        }
        try {
            return await writeSession(workspaceRoot, edit(current));
        } catch (error) {
            if (!(error instanceof StoreConflict) || attempt === 4) {
                throw error;
            }
        }
    }
    throw new StoreConflict(`session ${id}`);
};

export const deleteSession = async (workspaceRoot: string, account: string, id: string): Promise<void> => {
    await rm(sessionPath(workspaceRoot, account, id), { force: true });
};

const EMPTY_LEDGER: Ledger = { version: 0, entries: [] };

export const readLedger = async (workspaceRoot: string, account: string): Promise<Ledger> => (await readJson<Ledger>(ledgerPath(workspaceRoot, account))) ?? EMPTY_LEDGER;

export const updateLedger = async (workspaceRoot: string, account: string, edit: (ledger: Ledger) => Ledger): Promise<Ledger> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const current = await readLedger(workspaceRoot, account);
        const next = { ...edit(current), version: current.version + 1 };
        const stored = await readLedger(workspaceRoot, account);
        if (stored.version !== current.version) {
            continue;
        }
        await writeJsonAtomic(ledgerPath(workspaceRoot, account), next);
        return next;
    }
    throw new StoreConflict(`ledger for ${account}`);
};

export const upsertLedgerEntries = (ledger: Ledger, entries: readonly LedgerEntry[]): Ledger => {
    const byId = new Map(ledger.entries.map((entry) => [entry.id, entry]));
    for (const entry of entries) {
        byId.set(entry.id, entry);
    }
    return { ...ledger, entries: [...byId.values()].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)) };
};

export const ledgerEntryId = (sessionId: string, transactionId: string): string => `${sessionId}:${transactionId}`;
