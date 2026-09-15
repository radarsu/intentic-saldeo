<script setup lang="ts">
import { Notice, Page, PageHeader, Picker, SegmentedControl, type PickerOption } from "@intentic/extension-ui";
import { computed, watch } from "vue";
import { host } from "../host.ts";
import { saldeoAccounts, saldeoBrowserAccounts } from "./facts.ts";
import InvoicesPane from "./InvoicesPane.vue";
import LedgerPane from "./LedgerPane.vue";
import ReconcilePane from "./ReconcilePane.vue";
import StatementsPane from "./StatementsPane.vue";
import { useCompanies, useStatus } from "./useSaldeo.ts";

// The rail view for one SaldeoSMART API card (`account` is its capability id). Everything below is keyed by a
// company, since every read of the API is; the tab and the open session live in the URL query so a link carries them.

const props = defineProps<{ account?: string }>();
const api = host();
const account = computed(() => props.account ?? saldeoAccounts(api.workspace.capabilities())[0]?.id ?? `saldeosmart`);
const facts = computed(() => saldeoAccounts(api.workspace.capabilities()).find((entry) => entry.id === account.value));
const browserAccounts = computed(() => saldeoBrowserAccounts(api.workspace.capabilities()));

const status = useStatus(account);
const companies = useCompanies(account);

type Tab = `reconcile` | `invoices` | `statements` | `ledger`;
const TABS: { label: string; value: Tab }[] = [
    { label: `Reconcile`, value: `reconcile` },
    { label: `Invoices`, value: `invoices` },
    { label: `Bank statements`, value: `statements` },
    { label: `Ledger`, value: `ledger` },
];
const tab = computed<Tab>({
    get: () => (TABS.some((entry) => entry.value === api.route.query()[`tab`]) ? (api.route.query()[`tab`] as Tab) : `reconcile`),
    set: (value) => api.route.setQuery({ tab: value === `reconcile` ? undefined : value }),
});

// The pinned company wins; otherwise the query, otherwise the only one; otherwise the owner picks.
const companyOptions = computed<PickerOption[]>(() =>
    (companies.data.value?.companies ?? []).map((company) => ({ value: company.programId, label: company.name, ...(company.nip === undefined ? {} : { description: `NIP ${company.nip}` }) })),
);
const company = computed<string | undefined>({
    get: () => facts.value?.company ?? api.route.query()[`company`] ?? (companyOptions.value.length === 1 ? companyOptions.value[0]?.value : undefined),
    set: (value) => api.route.setQuery({ company: value }),
});
watch(companyOptions, (options) => {
    if (company.value === undefined && options.length === 1) {
        company.value = options[0]?.value;
    }
});

const unreachable = computed(() => status.data.value !== undefined && !status.data.value.reachable);
const description = computed(() => {
    const data = status.data.value;
    if (data === undefined) {
        return `SaldeoSMART, as ${facts.value?.username ?? account.value}`;
    }
    return `SaldeoSMART as ${data.username}${data.reachable ? `` : ` · not answering`}${data.detail === undefined || !data.reachable ? `` : ` · ${data.detail}`}`;
});
</script>

<template>
    <Page width="wide">
        <div class="@container flex flex-col gap-4">
            <PageHeader title="Saldeo" :description="description">
                <template #actions>
                    <Picker
                        v-if="facts?.company === undefined && companyOptions.length > 1"
                        v-model="company"
                        :options="companyOptions"
                        placeholder="Company…"
                        aria-label="Company"
                        variant="input"
                    />
                    <span v-else-if="company !== undefined" class="text-xs text-muted" :title="company">{{ companyOptions.find((option) => option.value === company)?.label ?? company }}</span>
                    <SegmentedControl v-model="tab" size="sm" :options="TABS" />
                </template>
            </PageHeader>

            <Notice
                v-if="unreachable"
                :of="{ tone: `danger`, title: `SaldeoSMART is not answering`, detail: status.data.value?.detail ?? `` }"
            />
            <Notice v-else-if="status.error.value" :of="{ tone: `danger`, title: `The Saldeo backend failed`, detail: status.error.value.message }" />
            <Notice
                v-else-if="company === undefined && companyOptions.length === 0 && companies.isFetched.value"
                :of="{ tone: `warning`, title: `No company to work on`, detail: `This login sees no companies in SaldeoSMART. The API is an office-side login; a client-side one sees nothing.` }"
            />

            <template v-if="company !== undefined">
                <ReconcilePane v-if="tab === `reconcile`" :account="account" :company="company" :browser-accounts="browserAccounts" :may-propose="facts?.propose ?? true" />
                <InvoicesPane v-else-if="tab === `invoices`" :account="account" :company="company" />
                <StatementsPane v-else-if="tab === `statements`" :account="account" :company="company" />
                <LedgerPane v-else :account="account" />
            </template>
            <p v-else-if="companyOptions.length > 1" class="text-sm text-muted">Pick a company to start.</p>
        </div>
    </Page>
</template>
