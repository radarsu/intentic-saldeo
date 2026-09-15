<script setup lang="ts">
import { Button, Card, Icon, Notice, noticeFrom, type NoticeModel } from "@intentic/extension-ui";
import { ref, toRef } from "vue";
import { readFileForImport, useSessionActions } from "./useSaldeo.ts";

// The way a statement gets in: a CSV from the bank's export, read here, sent to the backend as bytes so it can sniff the
// encoding itself (mBank and ING still write windows-1250, which a browser's text reader would mangle).

const props = defineProps<{ account: string; company: string }>();
const emit = defineEmits<{ created: [id: string] }>();
const actions = useSessionActions(toRef(props, `account`));
const input = ref<HTMLInputElement>();
const notice = ref<NoticeModel>();
const busy = ref(false);

const pick = (): void => input.value?.click();

const chosen = async (event: Event): Promise<void> => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file === undefined) {
        return;
    }
    busy.value = true;
    notice.value = undefined;
    try {
        const content = await readFileForImport(file);
        const { session } = await actions.importFile.mutateAsync({ company: props.company, name: file.name, content });
        emit(`created`, session.id);
    } catch (error) {
        notice.value = noticeFrom(error, `importing ${file.name}`);
    } finally {
        busy.value = false;
        if (input.value !== undefined) {
            input.value.value = ``;
        }
    }
};
</script>

<template>
    <Card dashed>
        <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2 text-sm font-medium text-content"><Icon name="upload" /> Import a bank export</div>
            <p class="text-xs text-muted">A CSV as your bank exports it (mBank, PKO BP, ING, Pekao, Santander or any other). The columns are recognised where the bank is known and asked about once where it is not.</p>
            <input ref="input" type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden" @change="chosen" />
            <Button size="small" :loading="busy" :disabled="busy" @click="pick"><Icon name="paperclip" /> Choose a CSV…</Button>
            <Notice v-if="notice" :of="notice" @dismiss="notice = undefined" />
        </div>
    </Card>
</template>
