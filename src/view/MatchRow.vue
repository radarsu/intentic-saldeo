<script setup lang="ts">
import { Button, DisclosureRow, Icon, Picker, StatusBadge, ui, type PickerOption } from "@intentic/extension-ui";
import { computed, ref } from "vue";
import type { Allocation, DecideAsk, Proposal, Session, SessionItem, Transaction } from "../core/contract.ts";
import { itemState, money } from "./format.ts";

// One bank transaction and what could have been paid with it. The proposals are the matcher's and the agent's, each
// with its reasons; the owner confirms one, rejects, skips, or picks an invoice the proposals missed.

const props = defineProps<{ session: Session; item: SessionItem; transaction: Transaction | undefined }>();
const emit = defineEmits<{ decide: [transactionId: string, status: DecideAsk, invoices?: readonly Allocation[], note?: string] }>();

const open = ref(props.item.decision === undefined && props.item.verdict !== `confident` && props.item.verdict !== `ignored`);
const state = computed(() => itemState(props.item));
const tone = computed(() => (state.value.tone === `danger` ? `danger` : state.value.tone === `warning` ? `warning` : state.value.tone === `success` ? `success` : `default`));

const invoiceOf = (id: string) => props.session.invoices.find((invoice) => invoice.id === id);
const magnitude = computed(() => Math.abs(props.transaction?.amount ?? 0));
const direction = computed(() => ((props.transaction?.amount ?? 0) >= 0 ? `in` : `out`));

// The pool the owner may pick from by hand: open, same direction and currency, the proposals' own invoices first.
const pickable = computed<PickerOption[]>(() => {
    const proposed = new Set(props.item.proposals.flatMap((proposal) => proposal.invoices.map((allocation) => allocation.invoiceId)));
    return props.session.invoices
        .filter((invoice) => !invoice.isPaid && invoice.remaining > 0 && invoice.direction === direction.value && invoice.currency === (props.transaction?.currency ?? `PLN`))
        .sort((a, b) => Number(proposed.has(b.id)) - Number(proposed.has(a.id)) || b.issueDate.localeCompare(a.issueDate))
        .map((invoice) => ({
            value: invoice.id,
            label: `${invoice.number} · ${money(invoice.remaining, invoice.currency)}`,
            description: `${invoice.contractor?.name ?? `no contractor`} · issued ${invoice.issueDate}${invoice.dueDate === undefined ? `` : `, due ${invoice.dueDate}`}`,
        }));
});
const picked = ref<string>();
const pickedAmount = ref(``);
const pickedInvoice = computed(() => (picked.value === undefined ? undefined : invoiceOf(picked.value)));
const suggestedAmount = computed(() => (pickedInvoice.value === undefined ? 0 : Math.min(magnitude.value, pickedInvoice.value.remaining)));
const pickedGrosze = computed(() => {
    const raw = pickedAmount.value.trim();
    if (raw === ``) {
        return suggestedAmount.value;
    }
    const value = Number.parseFloat(raw.replace(/\s/g, ``).replace(`,`, `.`));
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
});

const describe = (proposal: Proposal): string =>
    proposal.invoices.map((allocation) => `${invoiceOf(allocation.invoiceId)?.number ?? allocation.invoiceId} (${money(allocation.amount)})`).join(` + `);

const confirm = (proposal: Proposal): void => emit(`decide`, props.item.transactionId, `confirmed`, proposal.invoices);
const confirmPicked = (): void => {
    if (picked.value !== undefined && pickedGrosze.value > 0) {
        emit(`decide`, props.item.transactionId, `confirmed`, [{ invoiceId: picked.value, amount: pickedGrosze.value }], `picked by hand`);
    }
};
</script>

<template>
    <DisclosureRow v-model:open="open" density="compact" :tone="tone" body="drawer">
        <template #title>
            <span class="flex flex-wrap items-baseline gap-x-2">
                <span class="font-mono text-xs text-muted">{{ transaction?.date ?? `?` }}</span>
                <span class="font-medium" :class="(transaction?.amount ?? 0) >= 0 ? `text-success` : `text-content`">{{ transaction ? money(transaction.amount, transaction.currency) : `?` }}</span>
                <span v-if="transaction?.counterparty" class="truncate">{{ transaction.counterparty }}</span>
            </span>
        </template>
        <template #description>
            <span class="truncate" :title="transaction?.title">{{ transaction?.title }}</span>
        </template>
        <template #meta>
            <span v-if="item.decision === undefined && item.proposals.length > 0" class="text-2xs text-subtle">{{ item.proposals.length }} proposal{{ item.proposals.length === 1 ? `` : `s` }}</span>
            <StatusBadge :variant="state.tone" size="xs" :label="state.label" />
        </template>
        <template #below>
            <div class="flex flex-col gap-3 text-xs">
                <div v-if="transaction?.counterpartyAccount" class="font-mono text-2xs text-subtle">from {{ transaction.counterpartyAccount }}</div>

                <div v-if="item.decision" class="flex flex-col gap-1">
                    <div class="text-muted">
                        <span class="font-medium text-content">{{ item.decision.status }}</span>
                        <span v-if="item.decision.invoices.length > 0"> · {{ item.decision.invoices.map((allocation) => `${invoiceOf(allocation.invoiceId)?.number ?? allocation.invoiceId} (${money(allocation.amount)})`).join(` + `) }}</span>
                        <span v-if="item.decision.note"> · {{ item.decision.note }}</span>
                    </div>
                    <div v-if="item.marking" class="text-muted">marking in SaldeoSMART: <span class="text-content">{{ item.marking.status }}</span><span v-if="item.marking.note"> · {{ item.marking.note }}</span></div>
                    <div v-if="item.verification" class="text-muted">SaldeoSMART shows it {{ item.verification.paidInSaldeo ? `paid` : `still open` }} (checked {{ item.verification.at.slice(0, 16).replace(`T`, ` `) }})</div>
                    <div><button type="button" :class="ui.textAction()" @click="emit(`decide`, item.transactionId, `cleared`)"><Icon name="undo" /> Undo this decision</button></div>
                </div>

                <template v-else>
                    <ul v-if="item.proposals.length > 0" class="flex list-none flex-col gap-2 p-0">
                        <li v-for="(proposal, index) in item.proposals" :key="index" class="flex flex-col gap-1 rounded-md border border-line p-2">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-medium text-content">{{ describe(proposal) }}</span>
                                <StatusBadge :variant="proposal.score >= 80 ? `success` : proposal.score >= 50 ? `warning` : `neutral`" size="xs" :label="`${proposal.score}`" />
                                <StatusBadge v-if="proposal.by === `agent`" variant="info" size="xs" label="agent" />
                                <span class="ml-auto flex items-center gap-1">
                                    <Button v-if="proposal.invoices.length > 0" size="small" @click="confirm(proposal)"><Icon name="check" /> Confirm</Button>
                                </span>
                            </div>
                            <ul class="list-disc pl-4 text-muted">
                                <li v-for="reason in proposal.reasons" :key="reason">{{ reason }}</li>
                            </ul>
                            <div v-if="proposal.note" class="text-muted">{{ proposal.note }}</div>
                        </li>
                    </ul>
                    <p v-else class="text-muted">The matcher found no open invoice for this; ask the agent, pick one below, or skip it.</p>

                    <div class="flex flex-wrap items-end gap-2">
                        <label class="flex min-w-0 flex-1 flex-col gap-1 text-muted">
                            Pick an invoice
                            <Picker v-model="picked" :options="pickable" placeholder="open invoices…" variant="input" :search-threshold="6" />
                        </label>
                        <label v-if="pickedInvoice" class="flex flex-col gap-1 text-muted">
                            Amount
                            <input v-model="pickedAmount" :class="ui.input(`w-32`)" :placeholder="money(suggestedAmount)" />
                        </label>
                        <Button v-if="pickedInvoice" size="small" :disabled="pickedGrosze <= 0" @click="confirmPicked"><Icon name="check" /> Confirm</Button>
                        <span class="ml-auto flex items-center gap-1">
                            <Button size="small" severity="secondary" @click="emit(`decide`, item.transactionId, `rejected`, [], undefined)"><Icon name="times" /> Reject</Button>
                            <Button size="small" severity="secondary" @click="emit(`decide`, item.transactionId, `skipped`, [], undefined)"><Icon name="ban" /> Not an invoice</Button>
                        </span>
                    </div>
                </template>
            </div>
        </template>
    </DisclosureRow>
</template>
