import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { fakeServer, type FakeState } from "./helpers/fake-saldeo.ts";

/* The BUILT `saldeo` CLI, as the agent's shell would run it: credentials from the environment, never on the command line. */

const BINARY = new URL(`../dist/bin/saldeo`, import.meta.url).pathname;
const run = promisify(execFile);

let root = "";
let fake: { server: Server; url: string };
const state: FakeState = { paid65: false, calls: [] };

const saldeo = async (args: string[], env: Record<string, string> = {}) => {
    try {
        const { stdout, stderr } = await run(BINARY, args, { cwd: root, env: { PATH: process.env["PATH"] ?? "", ...env } });
        return { code: 0, stdout, stderr };
    } catch (error) {
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
    }
};

before(async () => {
    root = await mkdtemp(join(tmpdir(), "saldeo-cli-"));
    await mkdir(join(root, ".intentic"), { recursive: true });
    fake = await fakeServer(state);
});
after(async () => {
    fake.server.close();
    await rm(root, { recursive: true, force: true });
});

test("without a card the CLI says so and fails; help prints the verbs", async () => {
    const status = await saldeo(["status"]);
    assert.equal(status.code, 1);
    assert.match(status.stdout, /no SaldeoSMART connection reaches this shell/);
    const help = await saldeo(["help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /record-marking <session> <transaction> ok\|failed/);
    const unknown = await saldeo(["frobnicate"]);
    assert.equal(unknown.code, 2);
});

test("with a card, verbs answer from SaldeoSMART, readable or as JSON", async () => {
    const env = { SALDEO_USERNAME_SALDEOSMART: "user", SALDEO_API_TOKEN_SALDEOSMART: "token", SALDEO_URL_SALDEOSMART: fake.url };
    const status = await saldeo(["status"], env);
    assert.equal(status.code, 0, status.stderr);
    assert.match(status.stdout, /^saldeosmart: user · reachable \(1 company visible\) · reads: documents, invoices, bankStatements, propose$/m);
    const companies = await saldeo(["companies", "--json"], env);
    assert.deepEqual(JSON.parse(companies.stdout), [{ programId: "abc.1", name: "Firma" }]);
    // One company visible, so none has to be named.
    const invoices = await saldeo(["invoices", "--months", "1"], env);
    assert.equal(invoices.code, 0, invoices.stderr);
    assert.match(invoices.stdout, /document:65\tOUT\tFV\/101\/2016\t2026-07-25\tdue 2026-08-08\t492,00 PLN of 492,00\tBORACLE POLSKA Sp\. z o\.o\./);
    const refused = await saldeo(["statements"], { ...env, SALDEO_SCOPE_BANK_SALDEOSMART: "off" });
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /does not allow reading bank statements/);
    const sessions = await saldeo(["sessions", "--json"], env);
    assert.deepEqual(JSON.parse(sessions.stdout), []);
});
