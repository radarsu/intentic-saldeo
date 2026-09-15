import { hostSlot } from "@intentic/extension-api";

/* The activated host handle, bound once by activate() and read by every view module. */
export const { bindHost, host } = hostSlot(`intentic.saldeo`);
