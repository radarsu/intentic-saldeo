import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_BASE_URL } from "./contract.ts";
import { type AccountConnection, scopesOf } from "./service.ts";

// How the agent-side binaries (the MCP server, the CLI) find what the backend gets from the daemon: the card's fields
// arrive in the turn's environment as SALDEO_<FIELD>_<INSTANCE>, one set per connected SaldeoSMART card, and the
// workspace is wherever `.intentic/` sits at or above the working directory.

const PREFIX = "SALDEO_USERNAME_";

// The env suffix is the capability id upper-cased with `-` → `_`; going back, `_` becomes `-`, which is where the
// records directory for that account then lives. An id that had underscores would land in a sibling directory.
const accountOf = (suffix: string): string => suffix.toLowerCase().replaceAll("_", "-");

export const accountsFromEnv = (env: Readonly<Record<string, string | undefined>> = process.env): AccountConnection[] =>
    Object.keys(env)
        .filter((key) => key.startsWith(PREFIX) && env[key] !== undefined && env[key] !== "")
        .map((key) => key.slice(PREFIX.length))
        .sort()
        .flatMap((suffix) => {
            const field = (name: string): string | undefined => {
                const value = env[`SALDEO_${name}_${suffix}`];
                return value === undefined || value === "" ? undefined : value;
            };
            const username = field("USERNAME");
            const apiToken = field("API_TOKEN");
            if (username === undefined || apiToken === undefined) {
                return [];
            }
            const company = field("COMPANY");
            return [
                {
                    account: accountOf(suffix),
                    credentials: { username, apiToken, baseUrl: field("URL") ?? DEFAULT_BASE_URL },
                    ...(company === undefined ? {} : { company }),
                    scopes: scopesOf({
                        documents: field("SCOPE_DOCUMENTS"),
                        invoices: field("SCOPE_INVOICES"),
                        bankStatements: field("SCOPE_BANK"),
                        propose: field("SCOPE_PROPOSE"),
                    }),
                },
            ];
        });

export const workspaceRootFrom = (cwd: string = process.cwd()): string => {
    let dir = resolve(cwd);
    for (;;) {
        if (existsSync(join(dir, ".intentic"))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return resolve(cwd);
        }
        dir = parent;
    }
};

// One account when there is one; a named one when asked; otherwise the caller must say which.
export const pickAccount = (accounts: readonly AccountConnection[], wanted: string | undefined): AccountConnection => {
    if (wanted !== undefined) {
        const found = accounts.find((account) => account.account === wanted);
        if (found === undefined) {
            throw new Error(`no SaldeoSMART connection "${wanted}" in this turn; connected: ${accounts.map((account) => account.account).join(", ") || "none"}`);
        }
        return found;
    }
    const [only, second] = accounts;
    if (only === undefined) {
        throw new Error("no SaldeoSMART connection reaches this turn: the card may be missing, or withheld from this persona");
    }
    if (second !== undefined) {
        throw new Error(`several SaldeoSMART connections are available (${accounts.map((account) => account.account).join(", ")}); name one with account`);
    }
    return only;
};
