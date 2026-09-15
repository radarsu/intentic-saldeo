import { type Disposable, sandboxPoll } from "@intentic/extension-api";
import type { SessionSummary } from "./core/contract.ts";
import { ROUTES } from "./core/wire.ts";
import { host } from "./host.ts";
import { saldeoAccounts } from "./view/facts.ts";

// The tile's claim on attention: items in any session that await the owner's decision (a proposal with no decision
// yet). Read per account with nothing mounted, refreshed when the records directory changes (the backend, the agent's
// MCP server and the CLI all write there) and on a slow poll behind that.

const POLL_MS = 5 * 60_000;

interface Awaiting {
    readonly byAccount: Readonly<Record<string, number>>;
}

const poll = sandboxPoll<Awaiting>({
    host,
    everyMs: POLL_MS,
    initial: () => ({ byAccount: {} }),
    read: async (api) => {
        const byAccount: Record<string, number> = {};
        for (const account of saldeoAccounts(api.workspace.capabilities())) {
            try {
                const { sessions } = await api.sandbox.json<{ sessions: SessionSummary[] }>(`/x/intentic.saldeo${ROUTES.sessions(account.id)}`);
                byAccount[account.id] = sessions.reduce((sum, session) => sum + session.counts.awaiting, 0);
            } catch {
                byAccount[account.id] = 0;
            }
        }
        return { byAccount };
    },
});

export const startBadge = (): Disposable => {
    const polling = poll.start();
    // Hosts before the file-change frame degrade to the poll; the frame is what makes an agent's proposal show at once.
    let watching: Disposable | undefined;
    try {
        watching = host().workspace.onDidChangeFiles(() => poll.refresh());
    } catch {
        watching = undefined;
    }
    return {
        dispose: () => {
            polling.dispose();
            watching?.dispose();
        },
    };
};

// Read inside the host's own computed; touching the ref is what repaints the tile.
export const awaitingFor = (account: string): number => poll.state.value.byAccount[account] ?? 0;

export const refreshBadge = (): void => poll.refresh();
