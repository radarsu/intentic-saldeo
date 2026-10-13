<script setup lang="ts">
import { SkeletonRows, SkeletonSnapshot } from "@intentic/extension-ui";

// A session while it is being read, in SessionPane's shape rather than a "Loading…" line: that session as it last
// looked in this sandbox (the imprint ReconcilePane takes under the same name), and until it has been opened here,
// this hand-drawn one: the file and its facts, the five counts, the actions, the filter and the first rows.
// Widths are fixed, not random, so it doesn't reshuffle every render.

defineProps<{
    /** The name ReconcilePane's `v-skeleton-source` records the session under. */
    of: string;
}>();

const STATS = [`w-14`, `w-16`, `w-12`, `w-16`, `w-14`] as const;
const ACTIONS = [`w-32`, `w-28`, `w-48`] as const;
</script>

<template>
    <SkeletonSnapshot :of="of" label="Reading the session">
        <!-- aria-busy, not aria-hidden: a screen reader should hear "loading", not silence that reads as an empty session. -->
        <div class="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Reading the session">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1" aria-hidden="true">
                <span class="skeleton block h-3.5 w-48"></span>
                <span class="skeleton block h-3 w-64"></span>
                <span class="ml-auto flex items-center gap-1">
                    <span class="skeleton block h-6 w-20 rounded-md"></span>
                    <span class="skeleton block h-6 w-32 rounded-md"></span>
                    <span class="skeleton block h-6 w-6 rounded-md"></span>
                </span>
            </div>

            <!-- StatStrip's own spacing, so the counts land where these stood. -->
            <div class="my-4 flex flex-wrap gap-x-10 gap-y-4" aria-hidden="true">
                <div v-for="(width, index) in STATS" :key="index" class="flex min-w-24 flex-col gap-1.5">
                    <span class="skeleton block h-2.5" :class="width"></span>
                    <span class="skeleton block h-5 w-8"></span>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-2" aria-hidden="true">
                <span v-for="(width, index) in ACTIONS" :key="index" class="skeleton block h-7 rounded-md" :class="width"></span>
            </div>

            <div class="flex items-center gap-2" aria-hidden="true">
                <span class="skeleton block h-6 w-56 rounded-md"></span>
                <span class="skeleton block h-3 w-12"></span>
            </div>

            <div class="flex flex-col gap-1">
                <SkeletonRows :rows="5" density="compact" :lead="false" description control />
            </div>
        </div>
    </SkeletonSnapshot>
</template>
