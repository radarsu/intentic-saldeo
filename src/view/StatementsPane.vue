<script setup lang="ts">
import { DisclosureRow, InfoTable, Notice, ui } from "@intentic/extension-ui";
import { computed, toRef } from "vue";
import { money } from "./format.ts";
import { useStatements } from "./useSaldeo.ts";

// The statements SaldeoSMART itself holds and what it settled them against: read-only, so a payment already
// reconciled there is not reconciled twice here.

const props = defineProps<{ account: string; company: string }>();
const statements = useStatements(toRef(props, `account`), toRef(props, `company`));
const rowsOf = (operations: NonNullable<typeof statements.data.value>[`statements`][number][`operations`]) =>
    operations.map((operation) => [
        operation.date,
        money(operation.amount, operation.currency),
        operation.description,
        operation.settled.length === 0 ? (operation.remainingToSettle === undefined ? `` : `open ${money(operation.remainingToSettle)}`) : operation.settled.map((ref) => `${ref.number} (${money(ref.amountSettled)})`).join(`, `),
    ]);
const list = computed(() => statements.data.value?.statements ?? []);
</script>

<template>
    <div class="flex flex-col gap-2">
        <Notice v-if="statements.error.value" :of="{ tone: `danger`, title: `Could not read bank statements`, detail: statements.error.value.message }" />
        <DisclosureRow v-for="(statement, index) in list" :key="index" density="compact" body="drawer" icon="file" :title="`${statement.account} · ${statement.from} – ${statement.to}`" :description="`${statement.status} · ${statement.operations.length} operations${statement.filename === undefined ? `` : ` · ${statement.filename}`}`">
            <template #below>
                <InfoTable :headers="[`Date`, `Amount`, `Description`, `Settled against`]" :rows="rowsOf(statement.operations)" />
            </template>
        </DisclosureRow>
        <p v-if="list.length === 0 && statements.isFetched.value" :class="ui.emptyState()">SaldeoSMART holds no statements flagged for this company.</p>
        <p v-else-if="statements.isLoading.value" class="text-xs text-muted">Reading from SaldeoSMART…</p>
    </div>
</template>
