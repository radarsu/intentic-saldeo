import { defineConfig } from "vite";

/* The backend bundle: dist/server.js, the manifest's `server` entry; nothing but node builtins is provided at runtime. */
export default defineConfig({
    build: {
        ssr: "src/server/server.ts",
        outDir: "dist",
        emptyOutDir: false,
        target: "node22",
        rollupOptions: { output: { entryFileNames: "server.js" } },
    },
    ssr: { noExternal: true },
});
