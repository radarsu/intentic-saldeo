<script setup lang="ts">
import { CopyButton, Notice, Row, RowGroup, SkeletonRows, SkeletonSnapshot, StatusBadge, ui, vSkeletonSource } from "@intentic/extension-ui";
import { computed, toRef } from "vue";
import { ledgerCsv, money } from "./format.ts";
import { useLedger } from "./useSaldeo.ts";

// Every settlement the owner confirmed, across sessions, with whether it reached SaldeoSMART; the record that
// outlives a session, and the thing to hand an accountant.

const props = defineProps<{ account: string }>();
const ledger = useLedger(toRef(props, `account`));
const entries = computed(() => ledger.data.value?.ledger.entries ?? []);
const csv = computed(() =>
    ledgerCsv(
        entries.value.map((entry) => ({
            date: entry.transaction.date,
            amount: entry.transaction.amount,
            currency: entry.transaction.currency,
            counterparty: entry.transaction.counterparty ?? ``,
            title: entry.transaction.title,
            invoices: entry.invoices.map((invoice) => `${invoice.number} ${money(invoice.amount)}`).join(` + `),
            confirmedAt: entry.confirmedAt.slice(0, 10),
            marked: entry.marking?.status ?? ``,
            verified: entry.verification === undefined ? `` : entry.verification.paidInSaldeo ? `yes` : `no`,
        })),
    ),
);
</script>

<template>
    <div class="flex flex-col gap-3">
        <Notice v-if="ledger.error.value" :of="{ tone: `danger`, title: `Could not read the ledger`, detail: ledger.error.value.message }" />
        <!-- The ledger as it last looked here while it is read, hand-drawn rows until then; an empty group, with no rows and
             no note, read as a ledger with nothing in it. -->
        <SkeletonSnapshot v-if="ledger.isLoading.value" :of="`saldeo.ledger:${account}`" label="Reading the ledger">
            <div role="status" aria-busy="true" aria-label="Reading the ledger">
                <RowGroup>
                    <template #label><span class="skeleton block h-2.5 w-36" aria-hidden="true"></span></template>
                    <SkeletonRows :rows="4" description control />
                </RowGroup>
            </div>
        </SkeletonSnapshot>
        <RowGroup v-else v-skeleton-source="`saldeo.ledger:${account}`" label="Confirmed settlements" density="compact">
            <template #actions>
                <CopyButton :text="csv" label="Copy as CSV" />
            </template>
            <Row v-for="entry in entries" :key="entry.id" density="compact" icon="check-circle">
                <template #title>
                    <span class="flex flex-wrap items-baseline gap-x-2">
                        <span class="font-mono text-xs text-muted">{{ entry.transaction.date }}</span>
                        <span class="font-medium">{{ money(entry.transaction.amount, entry.transaction.currency) }}</span>
                        <span v-if="entry.transaction.counterparty" class="truncate">{{ entry.transaction.counterparty }}</span>
                    </span>
                </template>
                <template #description>
                    {{ entry.invoices.map((invoice) => `${invoice.number} (${money(invoice.amount)})`).join(` + `) }} · {{ entry.transaction.title }}
                </template>
                <template #meta>
                    <StatusBadge v-if="entry.verification?.paidInSaldeo" variant="success" size="xs" label="paid in Saldeo" />
                    <StatusBadge v-else-if="entry.marking?.status === `ok`" variant="success" size="xs" label="marked" />
                    <StatusBadge v-else-if="entry.marking?.status === `failed`" variant="danger" size="xs" label="marking failed" />
                    <StatusBadge v-else-if="entry.marking?.status === `pending`" variant="info" size="xs" label="marking…" />
                    <StatusBadge v-else variant="primary" size="xs" label="not in Saldeo yet" />
                </template>
            </Row>
            <p v-if="entries.length === 0 && ledger.isFetched.value" :class="ui.emptyState()">Nothing confirmed yet.</p>
        </RowGroup>
    </div>
</template>
