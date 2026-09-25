import { computed as x, unref as t, defineComponent as H, ref as M, toRef as _, openBlock as o, createElementBlock as y, createVNode as b, withCtx as A, createBlock as $, createCommentVNode as S, Fragment as G, renderList as ee, createElementVNode as m, toDisplayString as k, createTextVNode as I, normalizeClass as N, watch as ye, withDirectives as ne, vModelRadio as ve, vModelText as de } from "vue";
import { FilterBar as Ae, SegmentedControl as oe, Notice as j, RowGroup as ue, timeAgo as ae, Row as re, StatusBadge as E, ui as O, CopyButton as Ce, Card as ke, Icon as L, Button as X, noticeFrom as be, Picker as Q, InfoTable as xe, DisclosureRow as he, useAgentRunPick as pe, StatStrip as Ve, AgentRunButton as fe, ConfirmDialog as Ie, Page as Re, PageHeader as Pe } from "@intentic/extension-ui";
import { hostSlot as Me, sandboxPoll as Te } from "@intentic/extension-api";
import { useQuery as te, useQueryClient as De, useMutation as Ue } from "@tanstack/vue-query";
const W = {
  status: (e) => `/accounts/${encodeURIComponent(e)}/status`,
  companies: (e) => `/accounts/${encodeURIComponent(e)}/companies`,
  invoices: (e, l, s, u) => `/accounts/${encodeURIComponent(e)}/invoices?company=${encodeURIComponent(l)}&months=${s}&open=${u ? 1 : 0}`,
  statements: (e, l) => `/accounts/${encodeURIComponent(e)}/statements?company=${encodeURIComponent(l)}`,
  sessions: (e) => `/accounts/${encodeURIComponent(e)}/sessions`,
  session: (e, l) => `/accounts/${encodeURIComponent(e)}/sessions/${encodeURIComponent(l)}`,
  ledger: (e) => `/accounts/${encodeURIComponent(e)}/ledger`
}, { bindHost: Ne, host: D } = Me("intentic.saldeo"), $e = (e) => e.backend, ze = "saldeosmart", Fe = "saldeosmart-web", Oe = (e) => e === void 0 || e === "" || e === "on" || e === !0 || e === "true", se = (e) => e.filter((l) => l.kind === "cli" && l.config.provider === ze).map((l) => ({
  id: l.id,
  username: String(l.config.username ?? ""),
  company: typeof l.config.company == "string" && l.config.company !== "" ? String(l.config.company) : void 0,
  propose: Oe(l.config.propose)
})), qe = (e) => e.filter((l) => l.kind === "browser" && l.config.platform === Fe).map((l) => l.id), Le = 5 * 6e4, le = Te({
  host: D,
  everyMs: Le,
  initial: () => ({ byAccount: {} }),
  read: async (e) => {
    const l = {};
    for (const s of se(e.workspace.capabilities()))
      try {
        const { sessions: u } = await $e(e).json(W.sessions(s.id));
        l[s.id] = u.reduce((c, n) => c + n.counts.awaiting, 0);
      } catch {
        l[s.id] = 0;
      }
    return { byAccount: l };
  }
}), Be = () => {
  const e = le.start();
  let l;
  try {
    l = D().workspace.onDidChangeFiles(() => le.refresh());
  } catch {
    l = void 0;
  }
  return {
    dispose: () => {
      e.dispose(), l?.dispose();
    }
  };
}, Ee = (e) => le.state.value.byAccount[e] ?? 0, je = () => le.refresh(), to = (e, l) => {
  Ne(e), l.subscriptions.push(
    Be(),
    e.views.register({
      id: "saldeo",
      label: "Saldeo",
      surface: "rail",
      detect: (s, u) => se(u).map((c) => ({
        key: c.id,
        title: se(u).length > 1 ? `Saldeo · ${c.id}` : "Saldeo",
        icon: "credit-card",
        props: { account: c.id }
      })),
      badge: (s) => {
        const u = typeof s.props?.account == "string" ? s.props.account : s.key, c = Ee(u);
        return c > 0 ? { count: c, tone: "info", tooltip: `${c} payment${c === 1 ? "" : "s"} waiting for your decision` } : void 0;
      },
      view: async () => (await Promise.resolve().then(() => Yn)).default
    })
  );
}, we = (e, l) => {
  const s = e < 0 ? "-" : "", u = Math.abs(e), c = Math.floor(u / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "), n = `${s}${c},${(u % 100).toString().padStart(2, "0")}`;
  return l === void 0 ? n : `${n} ${l}`;
}, Ke = {
  confident: "confident",
  ambiguous: "needs a look",
  unmatched: "no match",
  ignored: "not an invoice"
}, Qe = (e) => e === "confident" ? "success" : e === "ambiguous" ? "warning" : e === "unmatched" ? "danger" : "neutral", We = (e) => e === "confirmed" ? "success" : e === "rejected" ? "danger" : "neutral", B = (e, l) => we(e, l), Ge = (e) => e.decision === void 0 ? { label: Ke[e.verdict], tone: Qe(e.verdict) } : e.decision.status !== "confirmed" ? { label: e.decision.status, tone: We(e.decision.status) } : e.verification?.paidInSaldeo === !0 ? { label: "paid in Saldeo", tone: "success" } : e.marking?.status === "ok" ? { label: "marked", tone: "success" } : e.marking?.status === "failed" ? { label: "marking failed", tone: "danger" } : e.marking?.status === "pending" ? { label: "marking…", tone: "info" } : { label: "confirmed", tone: "primary" }, ge = (e) => ({
  agent: e.provider,
  model: e.model,
  ...e.account === void 0 ? {} : { account: e.account },
  ...e.harness === void 0 ? {} : { harness: e.harness },
  ...e.effort === void 0 ? {} : { effort: e.effort },
  ...e.thinking === void 0 ? {} : { thinking: e.thinking },
  ...e.fast === void 0 ? {} : { fast: e.fast }
}), He = (e) => [
  ["Data", "Kwota", "Waluta", "Kontrahent", "Tytuł", "Faktury", "Potwierdzono", "Oznaczono w Saldeo", "Zweryfikowano"].join(";"),
  ...e.map(
    (l) => [l.date, we(l.amount).replace(/ /g, ""), l.currency, l.counterparty, l.title, l.invoices, l.confirmedAt, l.marked, l.verified].map((s) => `"${String(s).replaceAll('"', '""')}"`).join(";")
  )
].join(`\r
`), Z = "saldeo", Y = (e, l = "POST") => ({ method: l, body: JSON.stringify(e), headers: { "content-type": "application/json" } }), U = async (e, l) => {
  const s = await $e(D()).request(e, l), u = await s.text();
  let c;
  try {
    c = u === "" ? {} : JSON.parse(u);
  } catch {
    throw new Error(`the Saldeo backend answered ${s.status} with something that is not JSON`);
  }
  if (!s.ok) {
    const n = c.error;
    throw new Error(n ?? `the Saldeo backend answered ${s.status}`);
  }
  return c;
}, ie = () => x(() => D().sandbox.reachable()), Je = (e) => te({
  queryKey: x(() => D().sandbox.key(Z, "status", e.value)),
  queryFn: () => U(W.status(e.value)),
  enabled: ie(),
  staleTime: 6e4
}), Ye = (e) => te({
  queryKey: x(() => D().sandbox.key(Z, "companies", e.value)),
  queryFn: () => U(W.companies(e.value)),
  enabled: ie(),
  staleTime: 5 * 6e4
}), Ze = (e) => te({
  queryKey: x(() => D().sandbox.key(Z, "sessions", e.value)),
  queryFn: () => U(W.sessions(e.value)),
  enabled: ie(),
  refetchInterval: 3e4
}), Xe = (e, l) => te({
  queryKey: x(() => D().sandbox.key(Z, "session", e.value, l.value ?? "")),
  queryFn: () => U(W.session(e.value, l.value ?? "")),
  enabled: x(() => D().sandbox.reachable() && l.value !== void 0),
  refetchInterval: 3e4
}), _e = (e, l, s, u) => te({
  queryKey: x(() => D().sandbox.key(Z, "invoices", e.value, l.value ?? "", String(s.value), u.value ? "open" : "all")),
  queryFn: () => U(W.invoices(e.value, l.value ?? "", s.value, u.value)),
  enabled: x(() => D().sandbox.reachable() && l.value !== void 0),
  staleTime: 5 * 6e4
}), et = (e, l) => te({
  queryKey: x(() => D().sandbox.key(Z, "statements", e.value, l.value ?? "")),
  queryFn: () => U(W.statements(e.value, l.value ?? "")),
  enabled: x(() => D().sandbox.reachable() && l.value !== void 0),
  staleTime: 5 * 6e4
}), tt = (e) => te({
  queryKey: x(() => D().sandbox.key(Z, "ledger", e.value)),
  queryFn: () => U(W.ledger(e.value)),
  enabled: ie()
}), Se = (e) => {
  const l = De(), s = async () => {
    await l.invalidateQueries({ queryKey: D().sandbox.key(Z) }), je();
  }, u = (n) => Ue({
    mutationFn: n,
    onSettled: () => {
      s();
    }
  }), c = (n, p) => `${W.session(t(e), n)}${p === void 0 ? "" : `/${p}`}`;
  return {
    importFile: u((n) => U(W.sessions(t(e)), Y(n))),
    applyMapping: u(
      (n) => U(c(n.id, "mapping"), Y({ mapping: n.mapping, ...n.lookbackMonths === void 0 ? {} : { lookbackMonths: n.lookbackMonths } }, "PUT"))
    ),
    rematch: u((n) => U(c(n, "rematch"), Y({}))),
    decide: u(
      (n) => U(c(n.id, "decide"), Y({ transactionId: n.transactionId, status: n.status, ...n.invoices === void 0 ? {} : { invoices: n.invoices }, ...n.note === void 0 ? {} : { note: n.note } }))
    ),
    confirmAll: u((n) => U(c(n, "decide-all"), Y({ verdict: "confident" }))),
    askAgent: u((n) => U(c(n.id, "ask-agent"), Y({ ...n.pick === void 0 ? {} : { pick: n.pick } }))),
    mark: u(
      (n) => U(c(n.id, "mark"), Y({ browserAccount: n.browserAccount, ...n.transactionIds === void 0 ? {} : { transactionIds: n.transactionIds }, ...n.pick === void 0 ? {} : { pick: n.pick } }))
    ),
    verify: u((n) => U(c(n, "verify"), Y({}))),
    remove: u((n) => U(c(n), { method: "DELETE" }))
  };
}, nt = (e) => new Promise((l, s) => {
  const u = new FileReader();
  u.onerror = () => s(u.error ?? new Error(`could not read ${e.name}`)), u.onload = () => {
    const c = String(u.result ?? "");
    l(c.slice(c.indexOf(",") + 1));
  }, u.readAsDataURL(e);
}), ot = { class: "flex flex-col gap-3" }, st = { class: "flex flex-wrap items-baseline gap-x-2" }, at = { class: "font-mono" }, lt = { class: "text-muted" }, it = { key: 0 }, dt = { key: 1 }, ut = { class: "font-medium text-content" }, rt = {
  key: 0,
  class: "text-subtle"
}, ct = {
  key: 1,
  class: "text-xs text-muted"
}, mt = /* @__PURE__ */ H({
  __name: "InvoicesPane",
  props: {
    account: {},
    company: {}
  },
  setup(e) {
    const l = e, s = M("6"), u = M("open"), c = M("all"), n = M(""), p = _e(
      _(l, "account"),
      _(l, "company"),
      x(() => Number.parseInt(s.value, 10)),
      x(() => u.value === "open")
    ), f = x(() => {
      const w = n.value.trim().toLowerCase();
      return (p.data.value?.invoices ?? []).filter((h) => c.value === "all" || h.direction === c.value).filter((h) => w === "" || `${h.number} ${h.contractor?.name ?? ""} ${h.contractor?.nip ?? ""}`.toLowerCase().includes(w)).sort((h, i) => (h.dueDate ?? h.issueDate).localeCompare(i.dueDate ?? i.issueDate));
    }), C = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return (w, h) => (o(), y("div", ot, [
      b(t(Ae), {
        modelValue: n.value,
        "onUpdate:modelValue": h[3] || (h[3] = (i) => n.value = i),
        placeholder: "Number, contractor, NIP…",
        count: f.value.length,
        busy: t(p).isFetching.value
      }, {
        controls: A(() => [
          b(t(oe), {
            modelValue: c.value,
            "onUpdate:modelValue": h[0] || (h[0] = (i) => c.value = i),
            size: "xs",
            options: [{ label: "All", value: "all" }, { label: "Owed to us", value: "in" }, { label: "We owe", value: "out" }]
          }, null, 8, ["modelValue"]),
          b(t(oe), {
            modelValue: u.value,
            "onUpdate:modelValue": h[1] || (h[1] = (i) => u.value = i),
            size: "xs",
            options: [{ label: "Open", value: "open" }, { label: "Everything", value: "all" }]
          }, null, 8, ["modelValue"]),
          b(t(oe), {
            modelValue: s.value,
            "onUpdate:modelValue": h[2] || (h[2] = (i) => s.value = i),
            size: "xs",
            options: [{ label: "3 mo", value: "3" }, { label: "6 mo", value: "6" }, { label: "12 mo", value: "12" }]
          }, null, 8, ["modelValue"])
        ]),
        _: 1
      }, 8, ["modelValue", "count", "busy"]),
      t(p).error.value ? (o(), $(t(j), {
        key: 0,
        of: { tone: "danger", title: "Could not read invoices", detail: t(p).error.value.message }
      }, null, 8, ["of"])) : S("", !0),
      b(t(ue), {
        label: u.value === "open" ? "Open" : "All",
        count: f.value.length,
        density: "compact",
        caption: t(p).data.value ? `read ${t(ae)(Date.parse(t(p).data.value.fetchedAt))}` : "not read yet"
      }, {
        default: A(() => [
          (o(!0), y(G, null, ee(f.value, (i) => (o(), $(t(re), {
            key: i.id,
            density: "compact",
            icon: i.direction === "in" ? "arrow-down-left" : "arrow-up-right",
            tone: i.dueDate !== void 0 && i.dueDate < t(C) && !i.isPaid ? "warning" : "default"
          }, {
            title: A(() => [
              m("span", st, [
                m("span", at, k(i.number), 1),
                m("span", lt, k(i.contractor?.name ?? "no contractor"), 1)
              ])
            ]),
            description: A(() => [
              I(k(i.kind) + " · issued " + k(i.issueDate), 1),
              i.dueDate ? (o(), y("span", it, " · due " + k(i.dueDate), 1)) : S("", !0),
              i.contractor?.nip ? (o(), y("span", dt, " · NIP " + k(i.contractor.nip), 1)) : S("", !0)
            ]),
            meta: A(() => [
              m("span", ut, k(t(B)(i.remaining, i.currency)), 1),
              i.paid > 0 ? (o(), y("span", rt, "of " + k(t(B)(i.total)), 1)) : S("", !0),
              i.isPaid ? (o(), $(t(E), {
                key: 1,
                variant: "success",
                size: "xs",
                label: "paid"
              })) : i.dueDate !== void 0 && i.dueDate < t(C) ? (o(), $(t(E), {
                key: 2,
                variant: "warning",
                size: "xs",
                label: "overdue"
              })) : S("", !0)
            ]),
            _: 2
          }, 1032, ["icon", "tone"]))), 128)),
          f.value.length === 0 && t(p).isFetched.value ? (o(), y("p", {
            key: 0,
            class: N(t(O).emptyState())
          }, "Nothing " + k(u.value === "open" ? "open" : "") + " in the last " + k(s.value) + " months.", 3)) : t(p).isLoading.value ? (o(), y("p", ct, "Reading from SaldeoSMART…")) : S("", !0)
        ]),
        _: 1
      }, 8, ["label", "count", "caption"])
    ]));
  }
}), vt = { class: "flex flex-col gap-3" }, pt = { class: "flex flex-wrap items-baseline gap-x-2" }, ft = { class: "font-mono text-xs text-muted" }, gt = { class: "font-medium" }, yt = {
  key: 0,
  class: "truncate"
}, kt = /* @__PURE__ */ H({
  __name: "LedgerPane",
  props: {
    account: {}
  },
  setup(e) {
    const s = tt(_(e, "account")), u = x(() => s.data.value?.ledger.entries ?? []), c = x(
      () => He(
        u.value.map((n) => ({
          date: n.transaction.date,
          amount: n.transaction.amount,
          currency: n.transaction.currency,
          counterparty: n.transaction.counterparty ?? "",
          title: n.transaction.title,
          invoices: n.invoices.map((p) => `${p.number} ${B(p.amount)}`).join(" + "),
          confirmedAt: n.confirmedAt.slice(0, 10),
          marked: n.marking?.status ?? "",
          verified: n.verification === void 0 ? "" : n.verification.paidInSaldeo ? "yes" : "no"
        }))
      )
    );
    return (n, p) => (o(), y("div", vt, [
      t(s).error.value ? (o(), $(t(j), {
        key: 0,
        of: { tone: "danger", title: "Could not read the ledger", detail: t(s).error.value.message }
      }, null, 8, ["of"])) : S("", !0),
      b(t(ue), {
        label: "Confirmed settlements",
        count: u.value.length,
        density: "compact"
      }, {
        actions: A(() => [
          b(t(Ce), {
            text: c.value,
            label: "Copy as CSV"
          }, null, 8, ["text"])
        ]),
        default: A(() => [
          (o(!0), y(G, null, ee(u.value, (f) => (o(), $(t(re), {
            key: f.id,
            density: "compact",
            icon: "check-circle"
          }, {
            title: A(() => [
              m("span", pt, [
                m("span", ft, k(f.transaction.date), 1),
                m("span", gt, k(t(B)(f.transaction.amount, f.transaction.currency)), 1),
                f.transaction.counterparty ? (o(), y("span", yt, k(f.transaction.counterparty), 1)) : S("", !0)
              ])
            ]),
            description: A(() => [
              I(k(f.invoices.map((C) => `${C.number} (${t(B)(C.amount)})`).join(" + ")) + " · " + k(f.transaction.title), 1)
            ]),
            meta: A(() => [
              f.verification?.paidInSaldeo ? (o(), $(t(E), {
                key: 0,
                variant: "success",
                size: "xs",
                label: "paid in Saldeo"
              })) : f.marking?.status === "ok" ? (o(), $(t(E), {
                key: 1,
                variant: "success",
                size: "xs",
                label: "marked"
              })) : f.marking?.status === "failed" ? (o(), $(t(E), {
                key: 2,
                variant: "danger",
                size: "xs",
                label: "marking failed"
              })) : f.marking?.status === "pending" ? (o(), $(t(E), {
                key: 3,
                variant: "info",
                size: "xs",
                label: "marking…"
              })) : (o(), $(t(E), {
                key: 4,
                variant: "primary",
                size: "xs",
                label: "not in Saldeo yet"
              }))
            ]),
            _: 2
          }, 1024))), 128)),
          u.value.length === 0 && t(s).isFetched.value ? (o(), y("p", {
            key: 0,
            class: N(t(O).emptyState())
          }, "Nothing confirmed yet.", 2)) : S("", !0)
        ]),
        _: 1
      }, 8, ["count"])
    ]));
  }
}), bt = { class: "flex flex-col gap-2" }, xt = { class: "flex items-center gap-2 text-sm font-medium text-content" }, ht = /* @__PURE__ */ H({
  __name: "ImportCard",
  props: {
    account: {},
    company: {}
  },
  emits: ["created"],
  setup(e, { emit: l }) {
    const s = e, u = l, c = Se(_(s, "account")), n = M(), p = M(), f = M(!1), C = () => n.value?.click(), w = async (h) => {
      const i = h.target.files?.[0];
      if (i !== void 0) {
        f.value = !0, p.value = void 0;
        try {
          const P = await nt(i), { session: R } = await c.importFile.mutateAsync({ company: s.company, name: i.name, content: P });
          u("created", R.id);
        } catch (P) {
          p.value = be(P, `importing ${i.name}`);
        } finally {
          f.value = !1, n.value !== void 0 && (n.value.value = "");
        }
      }
    };
    return (h, i) => (o(), $(t(ke), { dashed: "" }, {
      default: A(() => [
        m("div", bt, [
          m("div", xt, [
            b(t(L), { name: "upload" }),
            i[1] || (i[1] = I(" Import a bank export", -1))
          ]),
          i[3] || (i[3] = m("p", { class: "text-xs text-muted" }, "A CSV as your bank exports it (mBank, PKO BP, ING, Pekao, Santander or any other). The columns are recognised where the bank is known and asked about once where it is not.", -1)),
          m("input", {
            ref_key: "input",
            ref: n,
            type: "file",
            accept: ".csv,.txt,text/csv,text/plain",
            class: "hidden",
            onChange: w
          }, null, 544),
          b(t(X), {
            size: "small",
            loading: f.value,
            disabled: f.value,
            onClick: C
          }, {
            default: A(() => [
              b(t(L), { name: "paperclip" }),
              i[2] || (i[2] = I(" Choose a CSV…", -1))
            ]),
            _: 1
          }, 8, ["loading", "disabled"]),
          p.value ? (o(), $(t(j), {
            key: 0,
            of: p.value,
            onDismiss: i[0] || (i[0] = (P) => p.value = void 0)
          }, null, 8, ["of"])) : S("", !0)
        ])
      ]),
      _: 1
    }));
  }
}), $t = { class: "flex flex-col gap-4" }, wt = { class: "flex flex-wrap items-center gap-2 text-sm" }, St = { class: "font-medium text-content" }, At = { class: "text-xs text-muted" }, Ct = { class: "grid gap-3 @lg:grid-cols-2" }, Vt = { class: "flex flex-col gap-1 text-xs text-muted" }, It = { class: "flex flex-col gap-1 text-xs text-muted" }, Rt = { class: "flex flex-col gap-1 text-xs text-muted" }, Pt = { class: "flex flex-wrap items-center gap-2" }, Mt = { class: "flex items-center gap-1" }, Tt = { class: "flex items-center gap-1" }, Dt = {
  key: 1,
  class: "grid grid-cols-2 gap-2"
}, Ut = { class: "flex flex-col gap-1 text-xs text-muted" }, Nt = { class: "flex flex-col gap-1 text-xs text-muted" }, zt = { class: "grid grid-cols-2 gap-2" }, Ft = { class: "flex flex-col gap-1 text-xs text-muted" }, Ot = { class: "flex flex-col gap-1 text-xs text-muted" }, qt = { class: "flex flex-col gap-1 text-xs text-muted" }, Lt = { class: "flex items-center gap-3" }, Bt = {
  key: 0,
  class: "text-xs text-muted"
}, Et = {
  key: 1,
  class: "text-xs text-muted"
}, q = "—", jt = /* @__PURE__ */ H({
  __name: "MappingEditor",
  props: {
    session: {},
    busy: { type: Boolean },
    error: {}
  },
  emits: ["apply"],
  setup(e, { emit: l }) {
    const s = e, u = l, c = x(() => [{ value: q, label: "(none)" }, ...s.session.file.columns.map((r) => ({ value: r, label: r }))]), n = M(""), p = M("signed"), f = M(q), C = M(q), w = M(q), h = M(""), i = M(q), P = M(q), R = M(q), g = M("PLN"), z = M("6"), K = (r) => {
      n.value = r?.date ?? "", p.value = r?.credit !== void 0 && r.debit !== void 0 ? "split" : "signed", f.value = r?.amount ?? q, C.value = r?.credit ?? q, w.value = r?.debit ?? q, h.value = r?.title ?? "", i.value = r?.counterparty ?? q, P.value = r?.account ?? q, R.value = r?.currency ?? q, g.value = r?.defaultCurrency ?? "PLN";
    };
    ye(() => s.session.id, () => K(s.session.mapping), { immediate: !0 });
    const F = (r) => r === q || r === "" ? void 0 : r, J = x(() => {
      const r = F(n.value), v = F(h.value);
      if (r === void 0 || v === void 0)
        return;
      if (p.value === "signed") {
        const me = F(f.value);
        return me === void 0 ? void 0 : { date: r, amount: me, title: v, ...T() };
      }
      const V = F(C.value), ce = F(w.value);
      return V === void 0 || ce === void 0 ? void 0 : { date: r, credit: V, debit: ce, title: v, ...T() };
    }), T = () => ({
      ...F(i.value) === void 0 ? {} : { counterparty: F(i.value) },
      ...F(P.value) === void 0 ? {} : { account: F(P.value) },
      ...F(R.value) === void 0 ? {} : { currency: F(R.value) },
      defaultCurrency: g.value.trim().toUpperCase() || "PLN"
    }), a = x(() => s.session.rows.slice(0, 5).map((r) => s.session.file.columns.map((v, V) => r[V] ?? ""))), d = () => {
      J.value !== void 0 && u("apply", J.value, Math.max(1, Math.min(36, Number.parseInt(z.value, 10) || 6)));
    };
    return (r, v) => (o(), y("div", $t, [
      b(t(ke), null, {
        default: A(() => [
          m("div", wt, [
            m("span", St, k(e.session.file.name), 1),
            e.session.file.preset ? (o(), $(t(E), {
              key: 0,
              variant: "info",
              size: "xs",
              label: e.session.file.preset
            }, null, 8, ["label"])) : (o(), $(t(E), {
              key: 1,
              variant: "neutral",
              size: "xs",
              label: "unknown bank"
            })),
            m("span", At, k(e.session.file.rows) + " rows · " + k(e.session.file.encoding) + ' · delimiter "' + k(e.session.file.delimiter === "	" ? "tab" : e.session.file.delimiter) + '" · header on line ' + k(e.session.file.headerRow + 1), 1)
          ]),
          v[12] || (v[12] = m("p", { class: "mt-2 text-xs text-muted" }, "Say which column holds what, then apply: the rows become transactions and are matched against the open invoices of the months before them.", -1))
        ]),
        _: 1
      }),
      m("div", Ct, [
        m("label", Vt, [
          v[13] || (v[13] = I("Date ", -1)),
          b(t(Q), {
            modelValue: n.value,
            "onUpdate:modelValue": v[0] || (v[0] = (V) => n.value = V),
            options: c.value.slice(1),
            placeholder: "column…",
            variant: "input"
          }, null, 8, ["modelValue", "options"])
        ]),
        m("label", It, [
          v[14] || (v[14] = I("Title / description ", -1)),
          b(t(Q), {
            modelValue: h.value,
            "onUpdate:modelValue": v[1] || (v[1] = (V) => h.value = V),
            options: c.value.slice(1),
            placeholder: "column…",
            variant: "input"
          }, null, 8, ["modelValue", "options"])
        ]),
        m("div", Rt, [
          v[17] || (v[17] = m("span", null, "Amount", -1)),
          m("div", Pt, [
            m("label", Mt, [
              ne(m("input", {
                "onUpdate:modelValue": v[2] || (v[2] = (V) => p.value = V),
                type: "radio",
                value: "signed"
              }, null, 512), [
                [ve, p.value]
              ]),
              v[15] || (v[15] = I(" one signed column", -1))
            ]),
            m("label", Tt, [
              ne(m("input", {
                "onUpdate:modelValue": v[3] || (v[3] = (V) => p.value = V),
                type: "radio",
                value: "split"
              }, null, 512), [
                [ve, p.value]
              ]),
              v[16] || (v[16] = I(" credit and debit columns", -1))
            ])
          ]),
          p.value === "signed" ? (o(), $(t(Q), {
            key: 0,
            modelValue: f.value,
            "onUpdate:modelValue": v[4] || (v[4] = (V) => f.value = V),
            options: c.value,
            placeholder: "amount column…",
            variant: "input"
          }, null, 8, ["modelValue", "options"])) : (o(), y("div", Dt, [
            b(t(Q), {
              modelValue: C.value,
              "onUpdate:modelValue": v[5] || (v[5] = (V) => C.value = V),
              options: c.value,
              placeholder: "credit (in)…",
              variant: "input"
            }, null, 8, ["modelValue", "options"]),
            b(t(Q), {
              modelValue: w.value,
              "onUpdate:modelValue": v[6] || (v[6] = (V) => w.value = V),
              options: c.value,
              placeholder: "debit (out)…",
              variant: "input"
            }, null, 8, ["modelValue", "options"])
          ]))
        ]),
        m("label", Ut, [
          v[18] || (v[18] = I("Counterparty ", -1)),
          b(t(Q), {
            modelValue: i.value,
            "onUpdate:modelValue": v[7] || (v[7] = (V) => i.value = V),
            options: c.value,
            variant: "input"
          }, null, 8, ["modelValue", "options"])
        ]),
        m("label", Nt, [
          v[19] || (v[19] = I("Counterparty account ", -1)),
          b(t(Q), {
            modelValue: P.value,
            "onUpdate:modelValue": v[8] || (v[8] = (V) => P.value = V),
            options: c.value,
            variant: "input"
          }, null, 8, ["modelValue", "options"])
        ]),
        m("div", zt, [
          m("label", Ft, [
            v[20] || (v[20] = I("Currency column ", -1)),
            b(t(Q), {
              modelValue: R.value,
              "onUpdate:modelValue": v[9] || (v[9] = (V) => R.value = V),
              options: c.value,
              variant: "input"
            }, null, 8, ["modelValue", "options"])
          ]),
          m("label", Ot, [
            v[21] || (v[21] = I("Default currency ", -1)),
            ne(m("input", {
              "onUpdate:modelValue": v[10] || (v[10] = (V) => g.value = V),
              class: N(t(O).input()),
              maxlength: "3"
            }, null, 2), [
              [de, g.value]
            ])
          ])
        ]),
        m("label", qt, [
          v[22] || (v[22] = I("Look for invoices this many months before the earliest transaction ", -1)),
          ne(m("input", {
            "onUpdate:modelValue": v[11] || (v[11] = (V) => z.value = V),
            type: "number",
            min: "1",
            max: "36",
            class: N(t(O).input("w-24"))
          }, null, 2), [
            [de, z.value]
          ])
        ])
      ]),
      b(t(xe), {
        headers: [...e.session.file.columns],
        rows: a.value
      }, null, 8, ["headers", "rows"]),
      e.error ? (o(), $(t(j), {
        key: 0,
        of: { tone: "danger", title: "Mapping refused", detail: e.error }
      }, null, 8, ["of"])) : S("", !0),
      m("div", Lt, [
        b(t(X), {
          disabled: J.value === void 0 || e.busy,
          loading: e.busy,
          onClick: d
        }, {
          default: A(() => [...v[23] || (v[23] = [
            I("Apply and match", -1)
          ])]),
          _: 1
        }, 8, ["disabled", "loading"]),
        J.value === void 0 ? (o(), y("span", Bt, "A date, an amount (or credit + debit) and a title column are needed.")) : (o(), y("span", Et, "Reads the invoices from SaldeoSMART; a few months take a dozen API calls."))
      ])
    ]));
  }
}), Kt = { class: "flex flex-wrap items-baseline gap-x-2" }, Qt = { class: "font-mono text-xs text-muted" }, Wt = {
  key: 0,
  class: "truncate"
}, Gt = ["title"], Ht = {
  key: 0,
  class: "text-2xs text-subtle"
}, Jt = { class: "flex flex-col gap-3 text-xs" }, Yt = {
  key: 0,
  class: "font-mono text-2xs text-subtle"
}, Zt = {
  key: 1,
  class: "flex flex-col gap-1"
}, Xt = { class: "text-muted" }, _t = { class: "font-medium text-content" }, en = { key: 0 }, tn = { key: 1 }, nn = {
  key: 0,
  class: "text-muted"
}, on = { class: "text-content" }, sn = { key: 0 }, an = {
  key: 1,
  class: "text-muted"
}, ln = {
  key: 0,
  class: "flex list-none flex-col gap-2 p-0"
}, dn = { class: "flex flex-wrap items-center gap-2" }, un = { class: "font-medium text-content" }, rn = { class: "ml-auto flex items-center gap-1" }, cn = { class: "list-disc pl-4 text-muted" }, mn = {
  key: 0,
  class: "text-muted"
}, vn = {
  key: 1,
  class: "text-muted"
}, pn = { class: "flex flex-wrap items-end gap-2" }, fn = { class: "flex min-w-0 flex-1 flex-col gap-1 text-muted" }, gn = {
  key: 0,
  class: "flex flex-col gap-1 text-muted"
}, yn = ["placeholder"], kn = { class: "ml-auto flex items-center gap-1" }, bn = /* @__PURE__ */ H({
  __name: "MatchRow",
  props: {
    session: {},
    item: {},
    transaction: {}
  },
  emits: ["decide"],
  setup(e, { emit: l }) {
    const s = e, u = l, c = M(s.item.decision === void 0 && s.item.verdict !== "confident" && s.item.verdict !== "ignored"), n = x(() => Ge(s.item)), p = x(() => n.value.tone === "danger" ? "danger" : n.value.tone === "warning" ? "warning" : n.value.tone === "success" ? "success" : "default"), f = (T) => s.session.invoices.find((a) => a.id === T), C = x(() => Math.abs(s.transaction?.amount ?? 0)), w = x(() => (s.transaction?.amount ?? 0) >= 0 ? "in" : "out"), h = x(() => {
      const T = new Set(s.item.proposals.flatMap((a) => a.invoices.map((d) => d.invoiceId)));
      return s.session.invoices.filter((a) => !a.isPaid && a.remaining > 0 && a.direction === w.value && a.currency === (s.transaction?.currency ?? "PLN")).sort((a, d) => Number(T.has(d.id)) - Number(T.has(a.id)) || d.issueDate.localeCompare(a.issueDate)).map((a) => ({
        value: a.id,
        label: `${a.number} · ${B(a.remaining, a.currency)}`,
        description: `${a.contractor?.name ?? "no contractor"} · issued ${a.issueDate}${a.dueDate === void 0 ? "" : `, due ${a.dueDate}`}`
      }));
    }), i = M(), P = M(""), R = x(() => i.value === void 0 ? void 0 : f(i.value)), g = x(() => R.value === void 0 ? 0 : Math.min(C.value, R.value.remaining)), z = x(() => {
      const T = P.value.trim();
      if (T === "")
        return g.value;
      const a = Number.parseFloat(T.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(a) ? Math.round(a * 100) : 0;
    }), K = (T) => T.invoices.map((a) => `${f(a.invoiceId)?.number ?? a.invoiceId} (${B(a.amount)})`).join(" + "), F = (T) => u("decide", s.item.transactionId, "confirmed", T.invoices), J = () => {
      i.value !== void 0 && z.value > 0 && u("decide", s.item.transactionId, "confirmed", [{ invoiceId: i.value, amount: z.value }], "picked by hand");
    };
    return (T, a) => (o(), $(t(he), {
      open: c.value,
      "onUpdate:open": a[5] || (a[5] = (d) => c.value = d),
      density: "compact",
      tone: p.value,
      body: "drawer"
    }, {
      title: A(() => [
        m("span", Kt, [
          m("span", Qt, k(e.transaction?.date ?? "?"), 1),
          m("span", {
            class: N(["font-medium", (e.transaction?.amount ?? 0) >= 0 ? "text-success" : "text-content"])
          }, k(e.transaction ? t(B)(e.transaction.amount, e.transaction.currency) : "?"), 3),
          e.transaction?.counterparty ? (o(), y("span", Wt, k(e.transaction.counterparty), 1)) : S("", !0)
        ])
      ]),
      description: A(() => [
        m("span", {
          class: "truncate",
          title: e.transaction?.title
        }, k(e.transaction?.title), 9, Gt)
      ]),
      meta: A(() => [
        e.item.decision === void 0 && e.item.proposals.length > 0 ? (o(), y("span", Ht, k(e.item.proposals.length) + " proposal" + k(e.item.proposals.length === 1 ? "" : "s"), 1)) : S("", !0),
        b(t(E), {
          variant: n.value.tone,
          size: "xs",
          label: n.value.label
        }, null, 8, ["variant", "label"])
      ]),
      below: A(() => [
        m("div", Jt, [
          e.transaction?.counterpartyAccount ? (o(), y("div", Yt, "from " + k(e.transaction.counterpartyAccount), 1)) : S("", !0),
          e.item.decision ? (o(), y("div", Zt, [
            m("div", Xt, [
              m("span", _t, k(e.item.decision.status), 1),
              e.item.decision.invoices.length > 0 ? (o(), y("span", en, " · " + k(e.item.decision.invoices.map((d) => `${f(d.invoiceId)?.number ?? d.invoiceId} (${t(B)(d.amount)})`).join(" + ")), 1)) : S("", !0),
              e.item.decision.note ? (o(), y("span", tn, " · " + k(e.item.decision.note), 1)) : S("", !0)
            ]),
            e.item.marking ? (o(), y("div", nn, [
              a[6] || (a[6] = I("marking in SaldeoSMART: ", -1)),
              m("span", on, k(e.item.marking.status), 1),
              e.item.marking.note ? (o(), y("span", sn, " · " + k(e.item.marking.note), 1)) : S("", !0)
            ])) : S("", !0),
            e.item.verification ? (o(), y("div", an, "SaldeoSMART shows it " + k(e.item.verification.paidInSaldeo ? "paid" : "still open") + " (checked " + k(e.item.verification.at.slice(0, 16).replace("T", " ")) + ")", 1)) : S("", !0),
            m("div", null, [
              m("button", {
                type: "button",
                class: N(t(O).textAction()),
                onClick: a[0] || (a[0] = (d) => u("decide", e.item.transactionId, "cleared"))
              }, [
                b(t(L), { name: "undo" }),
                a[7] || (a[7] = I(" Undo this decision", -1))
              ], 2)
            ])
          ])) : (o(), y(G, { key: 2 }, [
            e.item.proposals.length > 0 ? (o(), y("ul", ln, [
              (o(!0), y(G, null, ee(e.item.proposals, (d, r) => (o(), y("li", {
                key: r,
                class: "flex flex-col gap-1 rounded-md border border-line p-2"
              }, [
                m("div", dn, [
                  m("span", un, k(K(d)), 1),
                  b(t(E), {
                    variant: d.score >= 80 ? "success" : d.score >= 50 ? "warning" : "neutral",
                    size: "xs",
                    label: `${d.score}`
                  }, null, 8, ["variant", "label"]),
                  d.by === "agent" ? (o(), $(t(E), {
                    key: 0,
                    variant: "info",
                    size: "xs",
                    label: "agent"
                  })) : S("", !0),
                  m("span", rn, [
                    d.invoices.length > 0 ? (o(), $(t(X), {
                      key: 0,
                      size: "small",
                      onClick: (v) => F(d)
                    }, {
                      default: A(() => [
                        b(t(L), { name: "check" }),
                        a[8] || (a[8] = I(" Confirm", -1))
                      ]),
                      _: 1
                    }, 8, ["onClick"])) : S("", !0)
                  ])
                ]),
                m("ul", cn, [
                  (o(!0), y(G, null, ee(d.reasons, (v) => (o(), y("li", { key: v }, k(v), 1))), 128))
                ]),
                d.note ? (o(), y("div", mn, k(d.note), 1)) : S("", !0)
              ]))), 128))
            ])) : (o(), y("p", vn, "The matcher found no open invoice for this; ask the agent, pick one below, or skip it.")),
            m("div", pn, [
              m("label", fn, [
                a[9] || (a[9] = I(" Pick an invoice ", -1)),
                b(t(Q), {
                  modelValue: i.value,
                  "onUpdate:modelValue": a[1] || (a[1] = (d) => i.value = d),
                  options: h.value,
                  placeholder: "open invoices…",
                  variant: "input",
                  "search-threshold": 6
                }, null, 8, ["modelValue", "options"])
              ]),
              R.value ? (o(), y("label", gn, [
                a[10] || (a[10] = I(" Amount ", -1)),
                ne(m("input", {
                  "onUpdate:modelValue": a[2] || (a[2] = (d) => P.value = d),
                  class: N(t(O).input("w-32")),
                  placeholder: t(B)(g.value)
                }, null, 10, yn), [
                  [de, P.value]
                ])
              ])) : S("", !0),
              R.value ? (o(), $(t(X), {
                key: 1,
                size: "small",
                disabled: z.value <= 0,
                onClick: J
              }, {
                default: A(() => [
                  b(t(L), { name: "check" }),
                  a[11] || (a[11] = I(" Confirm", -1))
                ]),
                _: 1
              }, 8, ["disabled"])) : S("", !0),
              m("span", kn, [
                b(t(X), {
                  size: "small",
                  severity: "secondary",
                  onClick: a[3] || (a[3] = (d) => u("decide", e.item.transactionId, "rejected", [], void 0))
                }, {
                  default: A(() => [
                    b(t(L), { name: "times" }),
                    a[12] || (a[12] = I(" Reject", -1))
                  ]),
                  _: 1
                }),
                b(t(X), {
                  size: "small",
                  severity: "secondary",
                  onClick: a[4] || (a[4] = (d) => u("decide", e.item.transactionId, "skipped", [], void 0))
                }, {
                  default: A(() => [
                    b(t(L), { name: "ban" }),
                    a[13] || (a[13] = I(" Not an invoice", -1))
                  ]),
                  _: 1
                })
              ])
            ])
          ], 64))
        ])
      ]),
      _: 1
    }, 8, ["open", "tone"]));
  }
}), xn = { class: "flex flex-col gap-4" }, hn = { class: "flex flex-wrap items-center gap-x-3 gap-y-1" }, $n = { class: "text-sm font-medium text-content" }, wn = { class: "text-xs text-muted" }, Sn = ["title"], An = { class: "ml-auto flex items-center gap-1" }, Cn = ["disabled"], Vn = ["disabled"], In = { class: "flex flex-wrap items-center gap-2" }, Rn = { class: "flex items-center gap-2" }, Pn = { class: "text-xs text-muted" }, Mn = { class: "flex flex-col gap-1" }, Tn = /* @__PURE__ */ H({
  __name: "SessionPane",
  props: {
    account: {},
    session: {},
    skipped: {},
    browserAccounts: {},
    mayPropose: { type: Boolean },
    actions: {}
  },
  emits: ["closed"],
  setup(e, { emit: l }) {
    const s = e, u = l, c = D(), n = pe(() => c.models, "saldeo-reconcile"), p = pe(() => c.models, "saldeo-mark"), f = M(), C = M(!1), w = x(() => {
      const a = s.session.items, d = a.filter((r) => r.decision === void 0);
      return {
        confident: d.filter((r) => r.verdict === "confident").length,
        ambiguous: d.filter((r) => r.verdict === "ambiguous").length,
        unmatched: d.filter((r) => r.verdict === "unmatched").length,
        ignored: d.filter((r) => r.verdict === "ignored").length,
        confirmed: a.filter((r) => r.decision?.status === "confirmed").length,
        marked: a.filter((r) => r.marking?.status === "ok").length,
        unmarked: a.filter((r) => r.decision?.status === "confirmed" && r.marking?.status !== "ok").length,
        unresolved: d.filter((r) => r.verdict === "ambiguous" || r.verdict === "unmatched").length
      };
    }), h = x(() => [
      { label: "confident", value: String(w.value.confident) },
      { label: "need a look", value: String(w.value.ambiguous) },
      { label: "no match", value: String(w.value.unmatched) },
      { label: "not invoices", value: String(w.value.ignored) },
      { label: "confirmed", value: String(w.value.confirmed), note: `${w.value.marked} marked in Saldeo` }
    ]), i = M("decide"), P = [
      { label: "To decide", value: "decide" },
      { label: "Confirmed", value: "confirmed" },
      { label: "Other", value: "other" },
      { label: "All", value: "all" }
    ], R = x(
      () => s.session.items.map((a) => ({ item: a, transaction: s.session.transactions.find((d) => d.id === a.transactionId) })).filter(({ item: a }) => {
        switch (i.value) {
          case "decide":
            return a.decision === void 0 && a.verdict !== "ignored";
          case "confirmed":
            return a.decision?.status === "confirmed";
          case "other":
            return a.decision !== void 0 && a.decision.status !== "confirmed" || a.decision === void 0 && a.verdict === "ignored";
          default:
            return !0;
        }
      }).sort((a, d) => (a.transaction?.row ?? 0) - (d.transaction?.row ?? 0))
    ), g = async (a, d) => {
      f.value = void 0;
      try {
        await d();
      } catch (r) {
        f.value = be(r, a);
      }
    }, z = (a, d, r, v) => g("deciding", () => s.actions.decide.mutateAsync({ id: s.session.id, transactionId: a, status: d, ...r === void 0 ? {} : { invoices: r }, ...v === void 0 ? {} : { note: v } })), K = () => g("asking the agent", async () => {
      const a = n.overridden.value ? ge(n.model.value) : void 0, { conversationId: d } = await s.actions.askAgent.mutateAsync({ id: s.session.id, ...a === void 0 ? {} : { pick: a } });
      n.clear(), c.chat.openAgent(d);
    }), F = () => g("starting the marking run", async () => {
      const a = s.browserAccounts[0];
      if (a === void 0)
        throw new Error("connect the SaldeoSMART (web) browser account first");
      const d = p.overridden.value ? ge(p.model.value) : void 0, { conversationId: r } = await s.actions.mark.mutateAsync({ id: s.session.id, browserAccount: a, ...d === void 0 ? {} : { pick: d } });
      p.clear(), c.chat.openAgent(r);
    }), J = () => g("deleting the session", async () => {
      await s.actions.remove.mutateAsync(s.session.id), C.value = !1, u("closed");
    }), T = x(() => s.session.agentRuns[s.session.agentRuns.length - 1]);
    return (a, d) => (o(), y("div", xn, [
      m("div", hn, [
        m("span", $n, k(e.session.file.name), 1),
        m("span", wn, [
          I(k(e.session.transactions.length) + " transactions · matched against " + k(e.session.invoices.length) + " invoices ", 1),
          e.session.invoicesAt ? (o(), y("span", {
            key: 0,
            title: e.session.invoicesAt
          }, "read " + k(t(ae)(Date.parse(e.session.invoicesAt))), 9, Sn)) : S("", !0)
        ]),
        m("span", An, [
          m("button", {
            type: "button",
            class: N(t(O).textAction()),
            title: "Read the invoices again and re-match the undecided rows",
            disabled: e.actions.rematch.isPending.value,
            onClick: d[0] || (d[0] = (r) => g("re-matching", () => e.actions.rematch.mutateAsync(e.session.id)))
          }, [
            b(t(L), {
              name: "refresh",
              spin: e.actions.rematch.isPending.value
            }, null, 8, ["spin"]),
            d[10] || (d[10] = I(" Re-match ", -1))
          ], 10, Cn),
          m("button", {
            type: "button",
            class: N(t(O).textAction()),
            title: "Ask SaldeoSMART whether the confirmed invoices show as paid there",
            disabled: e.actions.verify.isPending.value || w.value.confirmed === 0,
            onClick: d[1] || (d[1] = (r) => g("verifying", () => e.actions.verify.mutateAsync(e.session.id)))
          }, [
            b(t(L), {
              name: "check-circle",
              spin: e.actions.verify.isPending.value
            }, null, 8, ["spin"]),
            d[11] || (d[11] = I(" Verify with Saldeo ", -1))
          ], 10, Vn),
          m("button", {
            type: "button",
            class: N(t(O).iconButton()),
            title: "Delete this session",
            onClick: d[2] || (d[2] = (r) => C.value = !0)
          }, [
            b(t(L), { name: "trash" })
          ], 2)
        ])
      ]),
      b(t(Ve), { items: h.value }, null, 8, ["items"]),
      e.skipped.length > 0 ? (o(), $(t(j), {
        key: 0,
        of: { tone: "warning", title: `${e.skipped.length} row${e.skipped.length === 1 ? "" : "s"} could not be read`, detail: e.skipped.map((r) => `row ${r.row}: ${r.reason}`).join("; ") }
      }, null, 8, ["of"])) : S("", !0),
      f.value ? (o(), $(t(j), {
        key: 1,
        of: f.value,
        onDismiss: d[3] || (d[3] = (r) => f.value = void 0)
      }, null, 8, ["of"])) : S("", !0),
      m("div", In, [
        b(t(X), {
          size: "small",
          disabled: w.value.confident === 0,
          onClick: d[4] || (d[4] = (r) => g("confirming", () => e.actions.confirmAll.mutateAsync(e.session.id)))
        }, {
          default: A(() => [
            b(t(L), { name: "check" }),
            I(" Confirm " + k(w.value.confident) + " confident ", 1)
          ]),
          _: 1
        }, 8, ["disabled"]),
        b(t(fe), {
          label: "Ask the agent",
          icon: "sparkles",
          size: "small",
          picker: t(n),
          hint: e.mayPropose ? `Resolve the ${w.value.unresolved} unresolved rows with the saldeo tools; proposals come back here for you to confirm` : "The card's 'Let the agent propose matches' switch is off",
          disabled: w.value.unresolved === 0 || !e.mayPropose,
          loading: e.actions.askAgent.isPending.value,
          onRun: K
        }, null, 8, ["picker", "hint", "disabled", "loading"]),
        b(t(fe), {
          label: "Mark as paid in SaldeoSMART",
          icon: "check-square",
          size: "small",
          picker: t(p),
          hint: e.browserAccounts.length === 0 ? "Needs the SaldeoSMART (web) browser account: the API cannot write payments" : `Starts a browser run over ${w.value.unmarked} confirmed settlement${w.value.unmarked === 1 ? "" : "s"}`,
          disabled: w.value.unmarked === 0 || e.browserAccounts.length === 0,
          loading: e.actions.mark.isPending.value,
          onRun: F
        }, null, 8, ["picker", "hint", "disabled", "loading"]),
        e.browserAccounts.length === 0 ? (o(), y("button", {
          key: 0,
          type: "button",
          class: N(t(O).linkButton()),
          onClick: d[5] || (d[5] = (r) => t(c).navigate("/capabilities"))
        }, "Connect SaldeoSMART (web) to mark invoices paid", 2)) : S("", !0),
        T.value ? (o(), y("button", {
          key: 1,
          type: "button",
          class: N(t(O).textAction("ml-auto")),
          onClick: d[6] || (d[6] = (r) => t(c).chat.openAgent(T.value.conversationId))
        }, [
          b(t(L), { name: "comments" }),
          I(" last run: " + k(T.value.kind === "mark" ? "marking" : "resolving") + " " + k(t(ae)(Date.parse(T.value.startedAt))), 1)
        ], 2)) : S("", !0)
      ]),
      m("div", Rn, [
        b(t(oe), {
          modelValue: i.value,
          "onUpdate:modelValue": d[7] || (d[7] = (r) => i.value = r),
          size: "xs",
          options: P
        }, null, 8, ["modelValue"]),
        m("span", Pn, k(R.value.length) + " of " + k(e.session.items.length), 1)
      ]),
      m("div", Mn, [
        (o(!0), y(G, null, ee(R.value, (r) => (o(), $(bn, {
          key: r.item.transactionId,
          session: e.session,
          item: r.item,
          transaction: r.transaction,
          onDecide: z
        }, null, 8, ["session", "item", "transaction"]))), 128)),
        R.value.length === 0 ? (o(), y("p", {
          key: 0,
          class: N(t(O).emptyState())
        }, "Nothing here" + k(i.value === "decide" ? ": every row is decided" : "") + ".", 3)) : S("", !0)
      ]),
      b(t(Ie), {
        open: C.value,
        header: "Delete this session?",
        "confirm-label": "Delete",
        destructive: "",
        loading: e.actions.remove.isPending.value,
        onCancel: d[8] || (d[8] = (r) => C.value = !1),
        onHide: d[9] || (d[9] = (r) => C.value = !1),
        onConfirm: J
      }, {
        default: A(() => [...d[12] || (d[12] = [
          m("p", { class: "text-sm text-muted" }, "The imported rows, the matches and this session's ledger entries go. Nothing in SaldeoSMART changes.", -1)
        ])]),
        _: 1
      }, 8, ["open", "loading"])
    ]));
  }
}), Dn = { class: "grid gap-4 @3xl:grid-cols-[minmax(14rem,18rem)_1fr]" }, Un = { class: "flex min-w-0 flex-col gap-3" }, Nn = { key: 0 }, zn = { key: 1 }, Fn = {
  key: 0,
  class: "text-link"
}, On = { key: 1 }, qn = ["title"], Ln = { class: "min-w-0" }, Bn = {
  key: 2,
  class: "text-sm text-muted"
}, En = /* @__PURE__ */ H({
  __name: "ReconcilePane",
  props: {
    account: {},
    company: {},
    browserAccounts: {},
    mayPropose: { type: Boolean }
  },
  setup(e) {
    const l = e, s = D(), u = _(l, "account"), c = Ze(u), n = x({
      get: () => s.route.query().session,
      set: (P) => s.route.setQuery({ session: P })
    }), p = Xe(u, n), f = Se(u), C = x(() => (c.data.value?.sessions ?? []).filter((P) => P.company === l.company)), w = x(() => p.data.value?.session), h = x(() => p.data.value?.skipped ?? []), i = async (P, R) => {
      n.value !== void 0 && await f.applyMapping.mutateAsync({ id: n.value, mapping: P, lookbackMonths: R });
    };
    return (P, R) => (o(), y("div", Dn, [
      m("aside", Un, [
        b(ht, {
          account: u.value,
          company: e.company,
          onCreated: R[0] || (R[0] = (g) => n.value = g)
        }, null, 8, ["account", "company"]),
        b(t(ue), {
          label: "Statements",
          count: C.value.length,
          density: "compact"
        }, {
          default: A(() => [
            (o(!0), y(G, null, ee(C.value, (g) => (o(), $(t(re), {
              key: g.id,
              as: "button",
              density: "compact",
              icon: "file",
              selected: n.value === g.id,
              title: g.file.name,
              onClick: (z) => n.value = g.id
            }, {
              description: A(() => [
                g.mapped ? (o(), y("span", zn, [
                  I(k(g.counts.transactions) + " rows · ", 1),
                  g.counts.awaiting > 0 ? (o(), y("span", Fn, k(g.counts.awaiting) + " to decide", 1)) : (o(), y("span", On, k(g.counts.confirmed) + " confirmed", 1))
                ])) : (o(), y("span", Nn, "columns not mapped yet"))
              ]),
              meta: A(() => [
                m("span", {
                  title: g.createdAt
                }, k(t(ae)(Date.parse(g.createdAt))), 9, qn)
              ]),
              _: 2
            }, 1032, ["selected", "title", "onClick"]))), 128)),
            C.value.length === 0 && t(c).isFetched.value ? (o(), y("p", {
              key: 0,
              class: N(t(O).emptyState())
            }, "No statement imported for this company yet.", 2)) : S("", !0)
          ]),
          _: 1
        }, 8, ["count"]),
        t(c).error.value ? (o(), $(t(j), {
          key: 0,
          of: { tone: "danger", title: "Could not list statements", detail: t(c).error.value.message }
        }, null, 8, ["of"])) : S("", !0)
      ]),
      m("section", Ln, [
        n.value === void 0 ? (o(), y("div", {
          key: 0,
          class: N(t(O).emptyState("py-10"))
        }, [
          b(t(L), { name: "upload" }),
          R[2] || (R[2] = m("p", { class: "mt-2" }, "Import a bank export on the left, or open a statement. Matches are proposed; nothing is written to SaldeoSMART until you confirm and start the marking run.", -1))
        ], 2)) : t(p).error.value ? (o(), $(t(j), {
          key: 1,
          of: { tone: "danger", title: "Could not open the session", detail: t(p).error.value.message }
        }, null, 8, ["of"])) : w.value === void 0 ? (o(), y("p", Bn, "Loading…")) : w.value.mapping === void 0 || w.value.transactions.length === 0 ? (o(), $(jt, {
          key: 3,
          session: w.value,
          busy: t(f).applyMapping.isPending.value,
          error: t(f).applyMapping.error.value?.message,
          onApply: i
        }, null, 8, ["session", "busy", "error"])) : (o(), $(Tn, {
          key: 4,
          account: u.value,
          session: w.value,
          skipped: h.value,
          "browser-accounts": e.browserAccounts,
          "may-propose": e.mayPropose,
          actions: t(f),
          onClosed: R[1] || (R[1] = (g) => n.value = void 0)
        }, null, 8, ["account", "session", "skipped", "browser-accounts", "may-propose", "actions"]))
      ])
    ]));
  }
}), jn = { class: "flex flex-col gap-2" }, Kn = {
  key: 2,
  class: "text-xs text-muted"
}, Qn = /* @__PURE__ */ H({
  __name: "StatementsPane",
  props: {
    account: {},
    company: {}
  },
  setup(e) {
    const l = e, s = et(_(l, "account"), _(l, "company")), u = (n) => n.map((p) => [
      p.date,
      B(p.amount, p.currency),
      p.description,
      p.settled.length === 0 ? p.remainingToSettle === void 0 ? "" : `open ${B(p.remainingToSettle)}` : p.settled.map((f) => `${f.number} (${B(f.amountSettled)})`).join(", ")
    ]), c = x(() => s.data.value?.statements ?? []);
    return (n, p) => (o(), y("div", jn, [
      t(s).error.value ? (o(), $(t(j), {
        key: 0,
        of: { tone: "danger", title: "Could not read bank statements", detail: t(s).error.value.message }
      }, null, 8, ["of"])) : S("", !0),
      (o(!0), y(G, null, ee(c.value, (f, C) => (o(), $(t(he), {
        key: C,
        density: "compact",
        body: "drawer",
        icon: "file",
        title: `${f.account} · ${f.from} – ${f.to}`,
        description: `${f.status} · ${f.operations.length} operations${f.filename === void 0 ? "" : ` · ${f.filename}`}`
      }, {
        below: A(() => [
          b(t(xe), {
            headers: ["Date", "Amount", "Description", "Settled against"],
            rows: u(f.operations)
          }, null, 8, ["rows"])
        ]),
        _: 2
      }, 1032, ["title", "description"]))), 128)),
      c.value.length === 0 && t(s).isFetched.value ? (o(), y("p", {
        key: 1,
        class: N(t(O).emptyState())
      }, "SaldeoSMART holds no statements flagged for this company.", 2)) : t(s).isLoading.value ? (o(), y("p", Kn, "Reading from SaldeoSMART…")) : S("", !0)
    ]));
  }
}), Wn = { class: "@container flex flex-col gap-4" }, Gn = ["title"], Hn = {
  key: 4,
  class: "text-sm text-muted"
}, Jn = /* @__PURE__ */ H({
  __name: "SaldeoView",
  props: {
    account: {}
  },
  setup(e) {
    const l = e, s = D(), u = x(() => l.account ?? se(s.workspace.capabilities())[0]?.id ?? "saldeosmart"), c = x(() => se(s.workspace.capabilities()).find((g) => g.id === u.value)), n = x(() => qe(s.workspace.capabilities())), p = Je(u), f = Ye(u), C = [
      { label: "Reconcile", value: "reconcile" },
      { label: "Invoices", value: "invoices" },
      { label: "Bank statements", value: "statements" },
      { label: "Ledger", value: "ledger" }
    ], w = x({
      get: () => C.some((g) => g.value === s.route.query().tab) ? s.route.query().tab : "reconcile",
      set: (g) => s.route.setQuery({ tab: g === "reconcile" ? void 0 : g })
    }), h = x(
      () => (f.data.value?.companies ?? []).map((g) => ({ value: g.programId, label: g.name, ...g.nip === void 0 ? {} : { description: `NIP ${g.nip}` } }))
    ), i = x({
      get: () => c.value?.company ?? s.route.query().company ?? (h.value.length === 1 ? h.value[0]?.value : void 0),
      set: (g) => s.route.setQuery({ company: g })
    });
    ye(h, (g) => {
      i.value === void 0 && g.length === 1 && (i.value = g[0]?.value);
    });
    const P = x(() => p.data.value !== void 0 && !p.data.value.reachable), R = x(() => {
      const g = p.data.value;
      return g === void 0 ? `SaldeoSMART, as ${c.value?.username ?? u.value}` : `SaldeoSMART as ${g.username}${g.reachable ? "" : " · not answering"}${g.detail === void 0 || !g.reachable ? "" : ` · ${g.detail}`}`;
    });
    return (g, z) => (o(), $(t(Re), { width: "wide" }, {
      default: A(() => [
        m("div", Wn, [
          b(t(Pe), {
            title: "Saldeo",
            description: R.value
          }, {
            actions: A(() => [
              c.value?.company === void 0 && h.value.length > 1 ? (o(), $(t(Q), {
                key: 0,
                modelValue: i.value,
                "onUpdate:modelValue": z[0] || (z[0] = (K) => i.value = K),
                options: h.value,
                placeholder: "Company…",
                "aria-label": "Company",
                variant: "input"
              }, null, 8, ["modelValue", "options"])) : i.value !== void 0 ? (o(), y("span", {
                key: 1,
                class: "text-xs text-muted",
                title: i.value
              }, k(h.value.find((K) => K.value === i.value)?.label ?? i.value), 9, Gn)) : S("", !0),
              b(t(oe), {
                modelValue: w.value,
                "onUpdate:modelValue": z[1] || (z[1] = (K) => w.value = K),
                size: "sm",
                options: C
              }, null, 8, ["modelValue"])
            ]),
            _: 1
          }, 8, ["description"]),
          P.value ? (o(), $(t(j), {
            key: 0,
            of: { tone: "danger", title: "SaldeoSMART is not answering", detail: t(p).data.value?.detail ?? "" }
          }, null, 8, ["of"])) : t(p).error.value ? (o(), $(t(j), {
            key: 1,
            of: { tone: "danger", title: "The Saldeo backend failed", detail: t(p).error.value.message }
          }, null, 8, ["of"])) : i.value === void 0 && h.value.length === 0 && t(f).isFetched.value ? (o(), $(t(j), {
            key: 2,
            of: { tone: "warning", title: "No company to work on", detail: "This login sees no companies in SaldeoSMART. The API is an office-side login; a client-side one sees nothing." }
          })) : S("", !0),
          i.value !== void 0 ? (o(), y(G, { key: 3 }, [
            w.value === "reconcile" ? (o(), $(En, {
              key: 0,
              account: u.value,
              company: i.value,
              "browser-accounts": n.value,
              "may-propose": c.value?.propose ?? !0
            }, null, 8, ["account", "company", "browser-accounts", "may-propose"])) : w.value === "invoices" ? (o(), $(mt, {
              key: 1,
              account: u.value,
              company: i.value
            }, null, 8, ["account", "company"])) : w.value === "statements" ? (o(), $(Qn, {
              key: 2,
              account: u.value,
              company: i.value
            }, null, 8, ["account", "company"])) : (o(), $(kt, {
              key: 3,
              account: u.value
            }, null, 8, ["account"]))
          ], 64)) : h.value.length > 1 ? (o(), y("p", Hn, "Pick a company to start.")) : S("", !0)
        ])
      ]),
      _: 1
    }));
  }
}), Yn = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Jn
}, Symbol.toStringTag, { value: "Module" }));
export {
  to as activate
};
