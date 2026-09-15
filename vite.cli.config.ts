import { defineConfig } from "vite";

/* The `saldeo` CLI: dist/bin/saldeo, on the agent's PATH via `contributes.bin`. The shebang is a banner since `#!` in a bundle is a syntax error. */
export default defineConfig({
    build: {
        ssr: "src/cli/saldeo.ts",
        outDir: "dist/bin",
        emptyOutDir: false,
        target: "node22",
        rollupOptions: { output: { entryFileNames: "saldeo", banner: "#!/usr/bin/env node" } },
    },
    ssr: { noExternal: true },
});
