import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/* The BUILT UI bundle against a host stub that refuses what the manifest never declared. */

const manifest = JSON.parse(await readFile(new URL(`../intentic-extension.json`, import.meta.url), `utf8`));

/* THE HOST BRIDGE, STOOD UP BEFORE THE BUNDLE LOADS: the kit resolves to stubs. */
globalThis.__intenticHost = {
    modules: { "@intentic/extension-ui": new Proxy({}, { get: (_, name) => ({ __stub: name }) }) },
};

const { activate } = await import(`../dist/extension.js`);

const declaredViews = new Map((manifest.contributes?.views ?? []).map((view) => [view.id, view]));
const disposable = () => ({ dispose: () => {} });

const facts = [
    { id: `saldeosmart`, kind: `cli`, config: { provider: `saldeosmart`, username: `office`, company: `abc.1`, propose: `on` } },
    { id: `ksiegowosc`, kind: `cli`, config: { provider: `saldeosmart`, username: `other` } },
    { id: `saldeosmart-web`, kind: `browser`, config: { platform: `saldeosmart-web` } },
    { id: `github`, kind: `cli`, config: { provider: `github` } },
];

const hostStub = () => {
    const registered = [];
    const calls = [];
    const refuse = (kind) => () => assert.fail(`${kind} registered, which this manifest never declares`);
    return {
        registered,
        calls,
        api: {
            apiVersion: `2.14.0`,
            views: {
                register: (view) => {
                    assert.ok(declaredViews.has(view.id), `view "${view.id}" is not declared in contributes.views`);
                    assert.equal(view.surface, declaredViews.get(view.id).surface);
                    registered.push(view);
                    return disposable();
                },
            },
            viewers: { register: refuse(`a viewer`) },
            documents: { register: refuse(`a document provider`) },
            commands: { register: refuse(`a command`) },
            settings: { get: () => undefined, set: () => Promise.resolve(), onDidChange: () => disposable() },
            workspace: {
                capabilities: () => facts,
                repos: () => [],
                onDidChange: () => disposable(),
                onDidChangeFiles: () => disposable(),
            },
            sandbox: {
                reachable: () => false,
                key: (...parts) => [`sandbox-1`, ...parts],
                json: (path) => {
                    calls.push(path);
                    // Only the extension's own namespace is reached: nothing else is declared under permissions.sandbox.
                    assert.match(path, /^\/x\/intentic\.saldeo\//u, `called ${path}, outside the extension's own namespace`);
                    return Promise.resolve({ sessions: [] });
                },
                request: () => Promise.reject(new Error(`not in this test`)),
            },
        },
    };
};

test(`activate registers the one declared view, one activation per SaldeoSMART API card, badged from the records`, async () => {
    const { api, registered } = hostStub();
    const context = { extensionId: `intentic.saldeo`, subscriptions: [] };
    await activate(api, context);
    assert.deepEqual(
        registered.map((view) => view.id),
        [...declaredViews.keys()],
    );
    const [view] = registered;
    const activations = view.detect([], facts);
    assert.deepEqual(
        activations.map((activation) => [activation.key, activation.title, activation.props.account]),
        [
            [`saldeosmart`, `Saldeo · saldeosmart`, `saldeosmart`],
            [`ksiegowosc`, `Saldeo · ksiegowosc`, `ksiegowosc`],
        ],
    );
    assert.deepEqual(view.detect([], facts.slice(0, 1)).map((activation) => activation.title), [`Saldeo`]);
    assert.equal(view.badge(activations[0]), undefined, `nothing awaits before anything was read`);
    // The view is loaded lazily and must resolve from INSIDE the single file.
    assert.equal(typeof (await view.view()), `object`);
    // Disposing unwinds the badge poll and the file watch.
    assert.ok(context.subscriptions.length >= 2);
    for (const subscription of context.subscriptions) {
        subscription.dispose();
    }
});

test(`the bundle imports only what the host publishes`, async () => {
    const source = await readFile(new URL(`../dist/extension.js`, import.meta.url), `utf8`);
    const published = new Set([`vue`, `@intentic/extension-api`, `@intentic/extension-ui`, `@tanstack/vue-query`]);
    const specifiers = [
        ...source.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["'`]([^"'`]+)["'`]/gu),
        ...source.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gu),
        ...source.matchAll(/(?:^|\n)\s*import\s*["'`]([^"'`]+)["'`]/gu),
    ].map((match) => match[1]);
    assert.deepEqual(
        specifiers.filter((specifier) => specifier.startsWith(`.`) || specifier.startsWith(`/`)),
        [],
        `a relative import cannot resolve from a blob URL: check inlineDynamicImports`,
    );
    assert.deepEqual(
        [...new Set(specifiers.filter((specifier) => !published.has(specifier)))],
        [],
        `an unpublished import cannot resolve in the host's import map`,
    );
    // node builtins would be fatal in a browser bundle: the UI half must not drag the core's node-only modules in.
    assert.deepEqual(
        specifiers.filter((specifier) => specifier.startsWith(`node:`)),
        [],
    );
});
