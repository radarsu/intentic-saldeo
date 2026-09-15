import assert from "node:assert/strict";
import { access, constants, readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { ExtensionManifestSchema, extensionIdOf } from "@intentic/extension-manifest";

/* The manifest against the rules the daemon enforces at install time, with the published schema, not a copy of it. */

const here = (path) => new URL(`../${path}`, import.meta.url);
const manifest = JSON.parse(await readFile(here(`intentic-extension.json`), `utf8`));

test(`parses with the published schema and installs under the identity the listing will name`, () => {
    const parsed = ExtensionManifestSchema.parse(manifest);
    assert.equal(extensionIdOf(parsed), `intentic.saldeo`);
    assert.match(parsed.engines.intentic, /^\^2\./u, `the backend half needs a 2.x host`);
});

test(`every path the manifest promises exists, and the shipped tools are executable`, async () => {
    for (const path of [manifest.entry, manifest.server, `${manifest.contributes.bin}/saldeo`, `${manifest.contributes.bin}/saldeo-mcp`]) {
        await access(here(path), constants.R_OK);
    }
    for (const tool of [`saldeo`, `saldeo-mcp`]) {
        const mode = (await stat(here(`${manifest.contributes.bin}/${tool}`))).mode;
        assert.ok(mode & 0o111, `${tool} is not executable: the daemon only puts the directory on PATH`);
        assert.match(await readFile(here(`${manifest.contributes.bin}/${tool}`), `utf8`), /^#!\/usr\/bin\/env node\n/u);
    }
    for (const card of manifest.contributes.capabilities) {
        await access(here(card.skill), constants.R_OK);
    }
});

test(`the plugin is a Claude Code plugin whose MCP server is the shipped binary`, async () => {
    const plugin = manifest.contributes.agent.path;
    await access(here(`${plugin}/.claude-plugin/plugin.json`), constants.R_OK);
    const mcp = JSON.parse(await readFile(here(`${plugin}/.mcp.json`), `utf8`));
    const command = mcp.mcpServers.saldeo.command;
    assert.match(command, /^\$\{CLAUDE_PLUGIN_ROOT\}\//u);
    // Resolved against the plugin directory, the command must be the built MCP binary.
    await access(here(`${plugin}/${command.replace(`\${CLAUDE_PLUGIN_ROOT}/`, ``)}`), constants.X_OK);
    await access(here(`${plugin}/skills/saldeo-reconcile/SKILL.md`), constants.R_OK);
});

test(`the two cards: an API card with the permission switches, and a browser card for the writes the API lacks`, () => {
    const [api, web] = manifest.contributes.capabilities;
    assert.equal(api.kind, `cli`);
    assert.equal(api.id, `saldeosmart`);
    assert.deepEqual(
        api.fields.filter((field) => field.boolean === true).map((field) => field.key),
        [`documents`, `invoices`, `bankStatements`, `propose`],
    );
    assert.ok(api.fields.find((field) => field.key === `apiToken`)?.secret, `the token must be a secret`);
    // Every env template names a field, or the agent gets a literal template.
    const keys = new Set(api.fields.map((field) => field.key));
    for (const template of Object.values(api.env)) {
        for (const [, name] of template.matchAll(/\$\{([a-zA-Z0-9]+)(?::[a-z]+)?\}/g)) {
            assert.ok(keys.has(name), `env refers to "${name}", which is not a field`);
        }
    }
    assert.equal(web.kind, `browser`);
    assert.equal(web.id, `saldeosmart-web`);
    assert.match(web.loginUrl, /^https:\/\/saldeo\.brainshare\.pl\//u);
});

test(`the view is a badged rail tile fed by the records directory; the backend reaches exactly two daemon routes`, () => {
    assert.deepEqual(manifest.contributes.views, [{ id: `saldeo`, label: `Saldeo`, surface: `rail`, badge: true }]);
    assert.deepEqual(manifest.contributes.files, [{ path: `.intentic/records/saldeo/`, invalidates: [`saldeo`] }]);
    assert.deepEqual(manifest.permissions, { daemon: [`GET /capabilities/*/connection`, `POST /agent`] });
});

test(`the skills say what they must`, async () => {
    const api = await readFile(here(`skills/saldeosmart/SKILL.md`), `utf8`);
    assert.match(api, /^---\nname: saldeosmart\n/u);
    assert.match(api, /\$\{id\}/u, `the per-instance skill names its instance`);
    assert.match(api, /cannot mark anything paid/u);
    const web = await readFile(here(`skills/saldeosmart-web/SKILL.md`), `utf8`);
    assert.match(web, /\$\{accounts\}/u);
    assert.match(web, /\$\{tools\}/u);
    assert.match(web, /saldeo_record_marking/u);
    const reconcile = await readFile(here(`plugin/skills/saldeo-reconcile/SKILL.md`), `utf8`);
    assert.match(reconcile, /^---\nname: saldeo-reconcile\n/u);
    assert.match(reconcile, /You propose; the owner decides/u);
});
