import { defineConfig } from "vite";

/* The MCP server: dist/bin/saldeo-mcp, spawned over stdio by the plugin's .mcp.json; the MCP SDK is bundled in. */
export default defineConfig({
    build: {
        ssr: "src/mcp/server.ts",
        outDir: "dist/bin",
        emptyOutDir: false,
        target: "node22",
        rollupOptions: { output: { entryFileNames: "saldeo-mcp", banner: "#!/usr/bin/env node" } },
    },
    ssr: { noExternal: true },
});
