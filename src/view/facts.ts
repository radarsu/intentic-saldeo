import type { CapabilityFacts } from "@intentic/extension-api";

// What the view learns from the capability facts alone: which SaldeoSMART API cards are connected (one rail tile
// each) and which browser accounts can mark things paid. The config echo is secret-free; `provider`/`platform` are
// the discriminators the cards pin.

export const SALDEO_PROVIDER = `saldeosmart`;
export const SALDEO_WEB_PLATFORM = `saldeosmart-web`;

export interface SaldeoAccountFacts {
    readonly id: string;
    readonly username: string;
    readonly company: string | undefined;
    readonly propose: boolean;
}

const on = (value: unknown): boolean => value === undefined || value === `` || value === `on` || value === true || value === `true`;

export const saldeoAccounts = (capabilities: readonly CapabilityFacts[]): SaldeoAccountFacts[] =>
    capabilities
        .filter((capability) => capability.kind === `cli` && capability.config[`provider`] === SALDEO_PROVIDER)
        .map((capability) => ({
            id: capability.id,
            username: String(capability.config[`username`] ?? ``),
            company: typeof capability.config[`company`] === `string` && capability.config[`company`] !== `` ? String(capability.config[`company`]) : undefined,
            propose: on(capability.config[`propose`]),
        }));

export const saldeoBrowserAccounts = (capabilities: readonly CapabilityFacts[]): string[] =>
    capabilities.filter((capability) => capability.kind === `browser` && capability.config[`platform`] === SALDEO_WEB_PLATFORM).map((capability) => capability.id);
