import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

/* The UI bundle: dist/extension.js, one file, the host's modules external. Runs first, so it is the build that empties dist/. */
export default defineConfig({
    plugins: [vue()],
    build: {
        outDir: "dist",
        lib: { entry: "src/extension.ts", formats: ["es"], fileName: () => "extension.js" },
        rollupOptions: {
            external: ["vue", "@tanstack/vue-query", "@intentic/extension-api", "@intentic/extension-ui"],
            output: { inlineDynamicImports: true },
        },
    },
});
