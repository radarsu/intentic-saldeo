<script setup lang="ts">
import { FilterBar, Notice, Row, RowGroup, SegmentedControl, SkeletonRows, SkeletonSnapshot, StatusBadge, timeAgo, ui, vSkeletonSource } from "@intentic/extension-ui";
import { computed, ref, toRef } from "vue";
import { money } from "./format.ts";
import { useInvoices } from "./useSaldeo.ts";

// What SaldeoSMART says is owed: invoices issued there and cost documents from the archive, with what is still open.

const props = defineProps<{ account: string; company: string }>();
const months = ref(`6`);
const scope = ref<`open` | `all`>(`open`);
const direction = ref<`all` | `in` | `out`>(`all`);
const query = ref(``);

const invoices = useInvoices(
    toRef(props, `account`),
    toRef(props, `company`),
    computed(() => Number.parseInt(months.value, 10)),
    computed(() => scope.value === `open`),
);

const visible = computed(() => {
    const needle = query.value.trim().toLowerCase();
    return (invoices.data.value?.invoices ?? [])
        .filter((invoice) => direction.value === `all` || invoice.direction === direction.value)
        .filter((invoice) => needle === `` || `${invoice.number} ${invoice.contractor?.name ?? ``} ${invoice.contractor?.nip ?? ``}`.toLowerCase().includes(needle))
        .sort((a, b) => (a.dueDate ?? a.issueDate).localeCompare(b.dueDate ?? b.issueDate));
});
const today = new Date().toISOString().slice(0, 10);
</script>

<template>
    <div class="flex flex-col gap-3">
        <FilterBar v-model="query" placeholder="Number, contractor, NIP…" :busy="invoices.isFetching.value">
            <template #controls>
                <SegmentedControl v-model="direction" size="xs" :options="[{ label: `All`, value: `all` }, { label: `Owed to us`, value: `in` }, { label: `We owe`, value: `out` }]" />
                <SegmentedControl v-model="scope" size="xs" :options="[{ label: `Open`, value: `open` }, { label: `Everything`, value: `all` }]" />
                <SegmentedControl v-model="months" size="xs" :options="[{ label: `3 mo`, value: `3` }, { label: `6 mo`, value: `6` }, { label: `12 mo`, value: `12` }]" />
            </template>
        </FilterBar>
        <Notice v-if="invoices.error.value" :of="{ tone: `danger`, title: `Could not read invoices`, detail: invoices.error.value.message }" />
        <!-- A read from SaldeoSMART takes seconds: the company's list as it last looked here stands in, hand-drawn rows until
             it has been seen once. Per company, since one office's clients owe very different numbers of invoices. -->
        <SkeletonSnapshot v-if="invoices.isLoading.value" :of="`saldeo.invoices:${company}`" label="Reading invoices from SaldeoSMART">
            <div role="status" aria-busy="true" aria-label="Reading invoices from SaldeoSMART">
                <RowGroup>
                    <template #label><span class="skeleton block h-2.5 w-24" aria-hidden="true"></span></template>
                    <SkeletonRows :rows="5" description control />
                </RowGroup>
            </div>
        </SkeletonSnapshot>
        <RowGroup v-else v-skeleton-source="`saldeo.invoices:${company}`" :label="scope === `open` ? `Open` : `All`" density="compact" :caption="invoices.data.value ? `read ${timeAgo(Date.parse(invoices.data.value.fetchedAt))}` : `not read yet`">
            <Row v-for="invoice in visible" :key="invoice.id" density="compact" :icon="invoice.direction === `in` ? `arrow-down-left` : `arrow-up-right`" :tone="invoice.dueDate !== undefined && invoice.dueDate < today && !invoice.isPaid ? `warning` : `default`">
                <template #title>
                    <span class="flex flex-wrap items-baseline gap-x-2">
                        <span class="font-mono">{{ invoice.number }}</span>
                        <span class="text-muted">{{ invoice.contractor?.name ?? `no contractor` }}</span>
                    </span>
                </template>
                <template #description>
                    {{ invoice.kind }} · issued {{ invoice.issueDate }}<span v-if="invoice.dueDate"> · due {{ invoice.dueDate }}</span><span v-if="invoice.contractor?.nip"> · NIP {{ invoice.contractor.nip }}</span>
                </template>
                <template #meta>
                    <span class="font-medium text-content">{{ money(invoice.remaining, invoice.currency) }}</span>
                    <span v-if="invoice.paid > 0" class="text-subtle">of {{ money(invoice.total) }}</span>
                    <StatusBadge v-if="invoice.isPaid" variant="success" size="xs" label="paid" />
                    <StatusBadge v-else-if="invoice.dueDate !== undefined && invoice.dueDate < today" variant="warning" size="xs" label="overdue" />
                </template>
            </Row>
            <p v-if="visible.length === 0 && invoices.isFetched.value" :class="ui.emptyState()">Nothing {{ scope === `open` ? `open` : `` }} in the last {{ months }} months.</p>
        </RowGroup>
    </div>
</template>
