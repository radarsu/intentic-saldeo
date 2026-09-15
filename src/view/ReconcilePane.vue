<script setup lang="ts">
import { Icon, Notice, Row, RowGroup, timeAgo, ui } from "@intentic/extension-ui";
import { computed, toRef } from "vue";
import { host } from "../host.ts";
import ImportCard from "./ImportCard.vue";
import MappingEditor from "./MappingEditor.vue";
import SessionPane from "./SessionPane.vue";
import { useSession, useSessionActions, useSessions } from "./useSaldeo.ts";

// Reconcile: the sessions (one per imported statement) beside the open one. A session without a mapping shows the
// mapping editor in place of its rows; the open session's id rides the URL.

const props = defineProps<{ account: string; company: string; browserAccounts: readonly string[]; mayPropose: boolean }>();
const api = host();
const account = toRef(props, `account`);
const sessions = useSessions(account);
const open = computed<string | undefined>({
    get: () => api.route.query()[`session`],
    set: (value) => api.route.setQuery({ session: value }),
});
const current = useSession(account, open);
const actions = useSessionActions(account);

const mine = computed(() => (sessions.data.value?.sessions ?? []).filter((session) => session.company === props.company));
const session = computed(() => current.data.value?.session);
const skipped = computed(() => current.data.value?.skipped ?? []);

const applyMapping = async (mapping: Parameters<typeof actions.applyMapping.mutateAsync>[0][`mapping`], lookbackMonths: number): Promise<void> => {
    if (open.value === undefined) {
        return;
    }
    await actions.applyMapping.mutateAsync({ id: open.value, mapping, lookbackMonths });
};
</script>

<template>
    <div class="grid gap-4 @3xl:grid-cols-[minmax(14rem,18rem)_1fr]">
        <aside class="flex min-w-0 flex-col gap-3">
            <ImportCard :account="account" :company="company" @created="(id) => (open = id)" />
            <RowGroup label="Statements" :count="mine.length" density="compact">
                <Row
                    v-for="entry in mine"
                    :key="entry.id"
                    as="button"
                    density="compact"
                    icon="file"
                    :selected="open === entry.id"
                    :title="entry.file.name"
                    @click="open = entry.id"
                >
                    <template #description>
                        <span v-if="!entry.mapped">columns not mapped yet</span>
                        <span v-else>
                            {{ entry.counts.transactions }} rows ·
                            <span v-if="entry.counts.awaiting > 0" class="text-link">{{ entry.counts.awaiting }} to decide</span>
                            <span v-else>{{ entry.counts.confirmed }} confirmed</span>
                        </span>
                    </template>
                    <template #meta>
                        <span :title="entry.createdAt">{{ timeAgo(Date.parse(entry.createdAt)) }}</span>
                    </template>
                </Row>
                <p v-if="mine.length === 0 && sessions.isFetched.value" :class="ui.emptyState()">No statement imported for this company yet.</p>
            </RowGroup>
            <Notice v-if="sessions.error.value" :of="{ tone: `danger`, title: `Could not list statements`, detail: sessions.error.value.message }" />
        </aside>

        <section class="min-w-0">
            <div v-if="open === undefined" :class="ui.emptyState(`py-10`)">
                <Icon name="upload" />
                <p class="mt-2">Import a bank export on the left, or open a statement. Matches are proposed; nothing is written to SaldeoSMART until you confirm and start the marking run.</p>
            </div>
            <Notice v-else-if="current.error.value" :of="{ tone: `danger`, title: `Could not open the session`, detail: current.error.value.message }" />
            <p v-else-if="session === undefined" class="text-sm text-muted">Loading…</p>
            <MappingEditor v-else-if="session.mapping === undefined || session.transactions.length === 0" :session="session" :busy="actions.applyMapping.isPending.value" :error="actions.applyMapping.error.value?.message" @apply="applyMapping" />
            <SessionPane v-else :account="account" :session="session" :skipped="skipped" :browser-accounts="browserAccounts" :may-propose="mayPropose" :actions="actions" @closed="open = undefined" />
        </section>
    </div>
</template>
