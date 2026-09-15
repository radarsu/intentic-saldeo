<script setup lang="ts">
import {
    AgentRunButton,
    Button,
    ConfirmDialog,
    Icon,
    Notice,
    noticeFrom,
    type NoticeModel,
    SegmentedControl,
    StatStrip,
    timeAgo,
    ui,
    useAgentRunPick,
} from "@intentic/extension-ui";
import { computed, ref } from "vue";
import type { Allocation, DecideAsk, Session } from "../core/contract.ts";
import { host } from "../host.ts";
import { pickOf } from "./format.ts";
import MatchRow from "./MatchRow.vue";
import type { useSessionActions } from "./useSaldeo.ts";

// One imported statement: what the matcher made of every row, what the owner decided, and the two runs the agent
// can be sent on (resolve the leftovers; mark the confirmed ones paid through the browser account).

const props = defineProps<{
    account: string;
    session: Session;
    skipped: readonly { row: number; reason: string }[];
    browserAccounts: readonly string[];
    mayPropose: boolean;
    actions: ReturnType<typeof useSessionActions>;
}>();
const emit = defineEmits<{ closed: [] }>();
const api = host();

const askModel = useAgentRunPick(() => api.models, `saldeo-reconcile`);
const markModel = useAgentRunPick(() => api.models, `saldeo-mark`);
const notice = ref<NoticeModel>();
const deleting = ref(false);

const counts = computed(() => {
    const items = props.session.items;
    const undecided = items.filter((item) => item.decision === undefined);
    return {
        confident: undecided.filter((item) => item.verdict === `confident`).length,
        ambiguous: undecided.filter((item) => item.verdict === `ambiguous`).length,
        unmatched: undecided.filter((item) => item.verdict === `unmatched`).length,
        ignored: undecided.filter((item) => item.verdict === `ignored`).length,
        confirmed: items.filter((item) => item.decision?.status === `confirmed`).length,
        marked: items.filter((item) => item.marking?.status === `ok`).length,
        unmarked: items.filter((item) => item.decision?.status === `confirmed` && item.marking?.status !== `ok`).length,
        unresolved: undecided.filter((item) => item.verdict === `ambiguous` || item.verdict === `unmatched`).length,
    };
});
const stats = computed(() => [
    { label: `confident`, value: String(counts.value.confident) },
    { label: `need a look`, value: String(counts.value.ambiguous) },
    { label: `no match`, value: String(counts.value.unmatched) },
    { label: `not invoices`, value: String(counts.value.ignored) },
    { label: `confirmed`, value: String(counts.value.confirmed), note: `${counts.value.marked} marked in Saldeo` },
]);

type Filter = `all` | `decide` | `confirmed` | `other`;
const filter = ref<Filter>(`decide`);
const FILTERS: { label: string; value: Filter }[] = [
    { label: `To decide`, value: `decide` },
    { label: `Confirmed`, value: `confirmed` },
    { label: `Other`, value: `other` },
    { label: `All`, value: `all` },
];
const rows = computed(() =>
    props.session.items
        .map((item) => ({ item, transaction: props.session.transactions.find((entry) => entry.id === item.transactionId) }))
        .filter(({ item }) => {
            switch (filter.value) {
                case `decide`:
                    return item.decision === undefined && item.verdict !== `ignored`;
                case `confirmed`:
                    return item.decision?.status === `confirmed`;
                case `other`:
                    return (item.decision !== undefined && item.decision.status !== `confirmed`) || (item.decision === undefined && item.verdict === `ignored`);
                default:
                    return true;
            }
        })
        .sort((a, b) => (a.transaction?.row ?? 0) - (b.transaction?.row ?? 0)),
);

const guard = async (wrote: string, run: () => Promise<unknown>): Promise<void> => {
    notice.value = undefined;
    try {
        await run();
    } catch (error) {
        notice.value = noticeFrom(error, wrote);
    }
};

const decide = (transactionId: string, status: DecideAsk, invoices?: readonly Allocation[], note?: string): Promise<void> =>
    guard(`deciding`, () => props.actions.decide.mutateAsync({ id: props.session.id, transactionId, status, ...(invoices === undefined ? {} : { invoices }), ...(note === undefined ? {} : { note }) }));

const askAgent = (): Promise<void> =>
    guard(`asking the agent`, async () => {
        const pick = askModel.overridden.value ? pickOf(askModel.model.value) : undefined;
        const { conversationId } = await props.actions.askAgent.mutateAsync({ id: props.session.id, ...(pick === undefined ? {} : { pick }) });
        askModel.clear();
        api.chat.openAgent(conversationId);
    });

const mark = (): Promise<void> =>
    guard(`starting the marking run`, async () => {
        const browserAccount = props.browserAccounts[0];
        if (browserAccount === undefined) {
            throw new Error(`connect the SaldeoSMART (web) browser account first`);
        }
        const pick = markModel.overridden.value ? pickOf(markModel.model.value) : undefined;
        const { conversationId } = await props.actions.mark.mutateAsync({ id: props.session.id, browserAccount, ...(pick === undefined ? {} : { pick }) });
        markModel.clear();
        api.chat.openAgent(conversationId);
    });

const remove = (): Promise<void> =>
    guard(`deleting the session`, async () => {
        await props.actions.remove.mutateAsync(props.session.id);
        deleting.value = false;
        emit(`closed`);
    });

const lastRun = computed(() => props.session.agentRuns[props.session.agentRuns.length - 1]);
</script>

<template>
    <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="text-sm font-medium text-content">{{ session.file.name }}</span>
            <span class="text-xs text-muted">
                {{ session.transactions.length }} transactions · matched against {{ session.invoices.length }} invoices
                <span v-if="session.invoicesAt" :title="session.invoicesAt">read {{ timeAgo(Date.parse(session.invoicesAt)) }}</span>
            </span>
            <span class="ml-auto flex items-center gap-1">
                <button type="button" :class="ui.textAction()" title="Read the invoices again and re-match the undecided rows" :disabled="actions.rematch.isPending.value" @click="guard(`re-matching`, () => actions.rematch.mutateAsync(session.id))">
                    <Icon name="refresh" :spin="actions.rematch.isPending.value" /> Re-match
                </button>
                <button type="button" :class="ui.textAction()" title="Ask SaldeoSMART whether the confirmed invoices show as paid there" :disabled="actions.verify.isPending.value || counts.confirmed === 0" @click="guard(`verifying`, () => actions.verify.mutateAsync(session.id))">
                    <Icon name="check-circle" :spin="actions.verify.isPending.value" /> Verify with Saldeo
                </button>
                <button type="button" :class="ui.iconButton()" title="Delete this session" @click="deleting = true"><Icon name="trash" /></button>
            </span>
        </div>

        <StatStrip :items="stats" />

        <Notice v-if="skipped.length > 0" :of="{ tone: `warning`, title: `${skipped.length} row${skipped.length === 1 ? `` : `s`} could not be read`, detail: skipped.map((entry) => `row ${entry.row}: ${entry.reason}`).join(`; `) }" />
        <Notice v-if="notice" :of="notice" @dismiss="notice = undefined" />

        <div class="flex flex-wrap items-center gap-2">
            <Button size="small" :disabled="counts.confident === 0" @click="guard(`confirming`, () => actions.confirmAll.mutateAsync(session.id))">
                <Icon name="check" /> Confirm {{ counts.confident }} confident
            </Button>
            <AgentRunButton
                label="Ask the agent"
                icon="sparkles"
                size="small"
                :picker="askModel"
                :hint="mayPropose ? `Resolve the ${counts.unresolved} unresolved rows with the saldeo tools; proposals come back here for you to confirm` : `The card's 'Let the agent propose matches' switch is off`"
                :disabled="counts.unresolved === 0 || !mayPropose"
                :loading="actions.askAgent.isPending.value"
                @run="askAgent"
            />
            <AgentRunButton
                label="Mark as paid in SaldeoSMART"
                icon="check-square"
                size="small"
                :picker="markModel"
                :hint="browserAccounts.length === 0 ? `Needs the SaldeoSMART (web) browser account: the API cannot write payments` : `Starts a browser run over ${counts.unmarked} confirmed settlement${counts.unmarked === 1 ? `` : `s`}`"
                :disabled="counts.unmarked === 0 || browserAccounts.length === 0"
                :loading="actions.mark.isPending.value"
                @run="mark"
            />
            <button v-if="browserAccounts.length === 0" type="button" :class="ui.linkButton()" @click="api.navigate(`/capabilities`)">Connect SaldeoSMART (web) to mark invoices paid</button>
            <button v-if="lastRun" type="button" :class="ui.textAction(`ml-auto`)" @click="api.chat.openAgent(lastRun.conversationId)">
                <Icon name="comments" /> last run: {{ lastRun.kind === `mark` ? `marking` : `resolving` }} {{ timeAgo(Date.parse(lastRun.startedAt)) }}
            </button>
        </div>

        <div class="flex items-center gap-2">
            <SegmentedControl v-model="filter" size="xs" :options="FILTERS" />
            <span class="text-xs text-muted">{{ rows.length }} of {{ session.items.length }}</span>
        </div>

        <div class="flex flex-col gap-1">
            <MatchRow v-for="row in rows" :key="row.item.transactionId" :session="session" :item="row.item" :transaction="row.transaction" @decide="decide" />
            <p v-if="rows.length === 0" :class="ui.emptyState()">Nothing here{{ filter === `decide` ? `: every row is decided` : `` }}.</p>
        </div>

        <ConfirmDialog :open="deleting" header="Delete this session?" confirm-label="Delete" destructive :loading="actions.remove.isPending.value" @cancel="deleting = false" @hide="deleting = false" @confirm="remove">
            <p class="text-sm text-muted">The imported rows, the matches and this session's ledger entries go. Nothing in SaldeoSMART changes.</p>
        </ConfirmDialog>
    </div>
</template>
