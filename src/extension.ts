import type { ExtensionContext, IntenticApi } from "@intentic/extension-api";
import { awaitingFor, startBadge } from "./badge.ts";
import { bindHost } from "./host.ts";
import { saldeoAccounts } from "./view/facts.ts";

// intentic.saldeo activation: one rail tile per connected SaldeoSMART API card (the capability id is the activation
// key, so two logins are two tiles), badged with the decisions the owner still owes.
export const activate = (api: IntenticApi, context: ExtensionContext): void => {
    bindHost(api);
    context.subscriptions.push(
        startBadge(),
        api.views.register({
            id: `saldeo`,
            label: `Saldeo`,
            surface: `rail`,
            detect: (_repos, capabilities) =>
                saldeoAccounts(capabilities).map((account) => ({
                    key: account.id,
                    title: saldeoAccounts(capabilities).length > 1 ? `Saldeo · ${account.id}` : `Saldeo`,
                    icon: `credit-card`,
                    props: { account: account.id },
                })),
            badge: (activation) => {
                const account = typeof activation.props?.[`account`] === `string` ? activation.props[`account`] : activation.key;
                const count = awaitingFor(account);
                return count > 0 ? { count, tone: `info`, tooltip: `${count} payment${count === 1 ? `` : `s`} waiting for your decision` } : undefined;
            },
            view: async () => (await import(`./view/SaldeoView.vue`)).default,
        }),
    );
};
