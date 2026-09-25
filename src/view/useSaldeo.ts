import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref, unref } from "vue";
import type { Allocation, DecideAsk, Mapping } from "../core/contract.ts";
import { ROUTES } from "../core/wire.ts";
import type {
    AgentRunRequest,
    AgentRunResponse,
    CompaniesResponse,
    ImportRequest,
    InvoicesResponse,
    LedgerResponse,
    SessionResponse,
    SessionsResponse,
    StatementsResponse,
    StatusResponse,
} from "../core/wire.ts";
import { refreshBadge } from "../badge.ts";
import { backendOf, host } from "../host.ts";

// The view's reads and writes, all through the extension's own backend namespace; no `permissions.sandbox` entry is
// needed for that. Query keys start with `saldeo`, the name the manifest's `contributes.files` invalidates when the
// records directory changes, so an agent's proposal shows without a poll.

const KEY = `saldeo`;

const post = (body: unknown, method = `POST`): RequestInit => ({ method, body: JSON.stringify(body), headers: { "content-type": `application/json` } });

const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await backendOf(host()).request(path, init);
    const text = await response.text();
    let parsed: unknown;
    try {
        parsed = text === `` ? {} : JSON.parse(text);
    } catch {
        throw new Error(`the Saldeo backend answered ${response.status} with something that is not JSON`);
    }
    if (!response.ok) {
        const error = (parsed as { error?: string }).error;
        throw new Error(error ?? `the Saldeo backend answered ${response.status}`);
    }
    return parsed as T;
};

const reachable = () => computed(() => host().sandbox.reachable());

export const useStatus = (account: Ref<string>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `status`, account.value)),
        queryFn: () => call<StatusResponse>(ROUTES.status(account.value)),
        enabled: reachable(),
        staleTime: 60_000,
    });

export const useCompanies = (account: Ref<string>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `companies`, account.value)),
        queryFn: () => call<CompaniesResponse>(ROUTES.companies(account.value)),
        enabled: reachable(),
        staleTime: 5 * 60_000,
    });

export const useSessions = (account: Ref<string>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `sessions`, account.value)),
        queryFn: () => call<SessionsResponse>(ROUTES.sessions(account.value)),
        enabled: reachable(),
        refetchInterval: 30_000,
    });

export const useSession = (account: Ref<string>, id: Ref<string | undefined>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `session`, account.value, id.value ?? ``)),
        queryFn: () => call<SessionResponse>(ROUTES.session(account.value, id.value ?? ``)),
        enabled: computed(() => host().sandbox.reachable() && id.value !== undefined),
        refetchInterval: 30_000,
    });

export const useInvoices = (account: Ref<string>, company: Ref<string | undefined>, months: Ref<number>, open: Ref<boolean>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `invoices`, account.value, company.value ?? ``, String(months.value), open.value ? `open` : `all`)),
        queryFn: () => call<InvoicesResponse>(ROUTES.invoices(account.value, company.value ?? ``, months.value, open.value)),
        enabled: computed(() => host().sandbox.reachable() && company.value !== undefined),
        staleTime: 5 * 60_000,
    });

export const useStatements = (account: Ref<string>, company: Ref<string | undefined>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `statements`, account.value, company.value ?? ``)),
        queryFn: () => call<StatementsResponse>(ROUTES.statements(account.value, company.value ?? ``)),
        enabled: computed(() => host().sandbox.reachable() && company.value !== undefined),
        staleTime: 5 * 60_000,
    });

export const useLedger = (account: Ref<string>) =>
    useQuery({
        queryKey: computed(() => host().sandbox.key(KEY, `ledger`, account.value)),
        queryFn: () => call<LedgerResponse>(ROUTES.ledger(account.value)),
        enabled: reachable(),
    });

// Every write invalidates the whole `saldeo` family for the account and pokes the badge: sessions, one session and
// the ledger all change together.
export const useSessionActions = (account: Ref<string>) => {
    const queries = useQueryClient();
    const settle = async (): Promise<void> => {
        await queries.invalidateQueries({ queryKey: host().sandbox.key(KEY) });
        refreshBadge();
    };
    const mutate = <TInput, TOutput>(run: (input: TInput) => Promise<TOutput>) =>
        useMutation({
            mutationFn: run,
            onSettled: () => void settle(),
        });
    const sessionPath = (id: string, action?: string) => `${ROUTES.session(unref(account), id)}${action === undefined ? `` : `/${action}`}`;
    return {
        importFile: mutate((input: ImportRequest) => call<SessionResponse>(ROUTES.sessions(unref(account)), post(input))),
        applyMapping: mutate((input: { id: string; mapping: Mapping; lookbackMonths?: number }) =>
            call<SessionResponse>(sessionPath(input.id, `mapping`), post({ mapping: input.mapping, ...(input.lookbackMonths === undefined ? {} : { lookbackMonths: input.lookbackMonths }) }, `PUT`)),
        ),
        rematch: mutate((id: string) => call<SessionResponse>(sessionPath(id, `rematch`), post({}))),
        decide: mutate((input: { id: string; transactionId: string; status: DecideAsk; invoices?: readonly Allocation[]; note?: string }) =>
            call<SessionResponse>(sessionPath(input.id, `decide`), post({ transactionId: input.transactionId, status: input.status, ...(input.invoices === undefined ? {} : { invoices: input.invoices }), ...(input.note === undefined ? {} : { note: input.note }) })),
        ),
        confirmAll: mutate((id: string) => call<SessionResponse>(sessionPath(id, `decide-all`), post({ verdict: `confident` }))),
        askAgent: mutate((input: { id: string } & AgentRunRequest) => call<AgentRunResponse>(sessionPath(input.id, `ask-agent`), post({ ...(input.pick === undefined ? {} : { pick: input.pick }) }))),
        mark: mutate((input: { id: string; browserAccount: string; transactionIds?: readonly string[] } & AgentRunRequest) =>
            call<AgentRunResponse>(sessionPath(input.id, `mark`), post({ browserAccount: input.browserAccount, ...(input.transactionIds === undefined ? {} : { transactionIds: input.transactionIds }), ...(input.pick === undefined ? {} : { pick: input.pick }) })),
        ),
        verify: mutate((id: string) => call<SessionResponse>(sessionPath(id, `verify`), post({}))),
        remove: mutate((id: string) => call<{ ok: true }>(sessionPath(id), { method: `DELETE` })),
    };
};

// A file the owner picked, as the import route wants it.
export const readFileForImport = (file: File): Promise<ImportRequest[`content`]> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error(`could not read ${file.name}`));
        reader.onload = () => {
            const result = String(reader.result ?? ``);
            resolve(result.slice(result.indexOf(`,`) + 1));
        };
        reader.readAsDataURL(file);
    });
