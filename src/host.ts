import { hostSlot, type IntenticApi } from "@intentic/extension-api";

/* The activated host handle, bound once by activate() and read by every view module. */
export const { bindHost, host } = hostSlot(`intentic.saldeo`);

// This extension's own backend, by a path relative to its namespace (`api.backend`, extension API 2.20.0). The host adds
// the routing prefix, which is the install id: `saldeo` when the extension is installed by its card, not
// `intentic.saldeo`, so a prefix spelled here addressed a namespace that was not this extension's.
// Typed here until the published @intentic/extension-api carries it; the manifest's engines range guarantees the host
// does.
export interface BackendApi {
    request(path: string, init?: RequestInit): Promise<Response>;
    json<T>(path: string, init?: RequestInit): Promise<T>;
}
export const backendOf = (api: IntenticApi): BackendApi => (api as IntenticApi & { readonly backend: BackendApi }).backend;
