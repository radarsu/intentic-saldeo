<script setup lang="ts">
import { Button, Card, InfoTable, Notice, Picker, StatusBadge, ui, type PickerOption } from "@intentic/extension-ui";
import { computed, ref, watch } from "vue";
import type { Mapping, Session } from "../core/contract.ts";

// Which column is which. Pre-filled from the bank preset or the header names; the owner corrects and applies once, and
// the same mapping is what a re-import of the same bank gets proposed next time.

const props = defineProps<{ session: Session; busy: boolean; error?: string | undefined }>();
const emit = defineEmits<{ apply: [mapping: Mapping, lookbackMonths: number] }>();

const NONE = `—`;
const columns = computed<PickerOption[]>(() => [{ value: NONE, label: `(none)` }, ...props.session.file.columns.map((column) => ({ value: column, label: column }))]);

const date = ref(``);
const amountMode = ref<`signed` | `split`>(`signed`);
const amount = ref(NONE);
const credit = ref(NONE);
const debit = ref(NONE);
const title = ref(``);
const counterparty = ref(NONE);
const account = ref(NONE);
const currency = ref(NONE);
const defaultCurrency = ref(`PLN`);
const lookback = ref(`6`);

const seed = (mapping: Mapping | undefined): void => {
    date.value = mapping?.date ?? ``;
    amountMode.value = mapping?.credit !== undefined && mapping.debit !== undefined ? `split` : `signed`;
    amount.value = mapping?.amount ?? NONE;
    credit.value = mapping?.credit ?? NONE;
    debit.value = mapping?.debit ?? NONE;
    title.value = mapping?.title ?? ``;
    counterparty.value = mapping?.counterparty ?? NONE;
    account.value = mapping?.account ?? NONE;
    currency.value = mapping?.currency ?? NONE;
    defaultCurrency.value = mapping?.defaultCurrency ?? `PLN`;
};
watch(() => props.session.id, () => seed(props.session.mapping), { immediate: true });

const some = (value: string): string | undefined => (value === NONE || value === `` ? undefined : value);
const mapping = computed<Mapping | undefined>(() => {
    const dateColumn = some(date.value);
    const titleColumn = some(title.value);
    if (dateColumn === undefined || titleColumn === undefined) {
        return undefined;
    }
    if (amountMode.value === `signed`) {
        const amountColumn = some(amount.value);
        return amountColumn === undefined ? undefined : { date: dateColumn, amount: amountColumn, title: titleColumn, ...optional() };
    }
    const creditColumn = some(credit.value);
    const debitColumn = some(debit.value);
    return creditColumn === undefined || debitColumn === undefined ? undefined : { date: dateColumn, credit: creditColumn, debit: debitColumn, title: titleColumn, ...optional() };
});
const optional = () => ({
    ...(some(counterparty.value) === undefined ? {} : { counterparty: some(counterparty.value) as string }),
    ...(some(account.value) === undefined ? {} : { account: some(account.value) as string }),
    ...(some(currency.value) === undefined ? {} : { currency: some(currency.value) as string }),
    defaultCurrency: defaultCurrency.value.trim().toUpperCase() || `PLN`,
});

const preview = computed(() => props.session.rows.slice(0, 5).map((row) => props.session.file.columns.map((_, index) => row[index] ?? ``)));

const apply = (): void => {
    if (mapping.value !== undefined) {
        emit(`apply`, mapping.value, Math.max(1, Math.min(36, Number.parseInt(lookback.value, 10) || 6)));
    }
};
</script>

<template>
    <div class="flex flex-col gap-4">
        <Card>
            <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-medium text-content">{{ session.file.name }}</span>
                <StatusBadge v-if="session.file.preset" variant="info" size="xs" :label="session.file.preset" />
                <StatusBadge v-else variant="neutral" size="xs" label="unknown bank" />
                <span class="text-xs text-muted">{{ session.file.rows }} rows · {{ session.file.encoding }} · delimiter "{{ session.file.delimiter === `\t` ? `tab` : session.file.delimiter }}" · header on line {{ session.file.headerRow + 1 }}</span>
            </div>
            <p class="mt-2 text-xs text-muted">Say which column holds what, then apply: the rows become transactions and are matched against the open invoices of the months before them.</p>
        </Card>

        <div class="grid gap-3 @lg:grid-cols-2">
            <label class="flex flex-col gap-1 text-xs text-muted">Date <Picker v-model="date" :options="columns.slice(1)" placeholder="column…" variant="input" /></label>
            <label class="flex flex-col gap-1 text-xs text-muted">Title / description <Picker v-model="title" :options="columns.slice(1)" placeholder="column…" variant="input" /></label>
            <div class="flex flex-col gap-1 text-xs text-muted">
                <span>Amount</span>
                <div class="flex flex-wrap items-center gap-2">
                    <label class="flex items-center gap-1"><input v-model="amountMode" type="radio" value="signed" /> one signed column</label>
                    <label class="flex items-center gap-1"><input v-model="amountMode" type="radio" value="split" /> credit and debit columns</label>
                </div>
                <Picker v-if="amountMode === `signed`" v-model="amount" :options="columns" placeholder="amount column…" variant="input" />
                <div v-else class="grid grid-cols-2 gap-2">
                    <Picker v-model="credit" :options="columns" placeholder="credit (in)…" variant="input" />
                    <Picker v-model="debit" :options="columns" placeholder="debit (out)…" variant="input" />
                </div>
            </div>
            <label class="flex flex-col gap-1 text-xs text-muted">Counterparty <Picker v-model="counterparty" :options="columns" variant="input" /></label>
            <label class="flex flex-col gap-1 text-xs text-muted">Counterparty account <Picker v-model="account" :options="columns" variant="input" /></label>
            <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1 text-xs text-muted">Currency column <Picker v-model="currency" :options="columns" variant="input" /></label>
                <label class="flex flex-col gap-1 text-xs text-muted">Default currency <input v-model="defaultCurrency" :class="ui.input()" maxlength="3" /></label>
            </div>
            <label class="flex flex-col gap-1 text-xs text-muted">Look for invoices this many months before the earliest transaction <input v-model="lookback" type="number" min="1" max="36" :class="ui.input(`w-24`)" /></label>
        </div>

        <InfoTable :headers="[...session.file.columns]" :rows="preview" />

        <Notice v-if="error" :of="{ tone: `danger`, title: `Mapping refused`, detail: error }" />
        <div class="flex items-center gap-3">
            <Button :disabled="mapping === undefined || busy" :loading="busy" @click="apply">Apply and match</Button>
            <span v-if="mapping === undefined" class="text-xs text-muted">A date, an amount (or credit + debit) and a title column are needed.</span>
            <span v-else class="text-xs text-muted">Reads the invoices from SaldeoSMART; a few months take a dozen API calls.</span>
        </div>
    </div>
</template>
