import { hostSlot as e, sandboxPoll as t } from "@intentic/extension-api";
import { Fragment as n, computed as r, createBlock as i, createCommentVNode as a, createElementBlock as o, createElementVNode as s, createTextVNode as c, createVNode as l, defineComponent as u, normalizeClass as d, openBlock as f, ref as p, renderList as m, toDisplayString as h, toRef as g, unref as _, vModelRadio as v, vModelText as y, watch as b, withCtx as x, withDirectives as S } from "vue";
import { AgentRunButton as C, Button as w, Card as T, ConfirmDialog as E, CopyButton as D, DisclosureRow as O, FilterBar as k, Icon as A, InfoTable as j, Notice as M, Page as N, PageHeader as P, Picker as F, Row as I, RowGroup as L, SegmentedControl as R, StatStrip as z, StatusBadge as B, noticeFrom as V, timeAgo as H, ui as U, useAgentRunPick as ee } from "@intentic/extension-ui";
import { useMutation as W, useQuery as G, useQueryClient as te } from "@tanstack/vue-query";
//#region \0rolldown/runtime.js
var ne = Object.defineProperty, K = (e, t, n) => () => {
	if (n) throw n[0];
	try {
		return e && (t = e(e = 0)), t;
	} catch (e) {
		throw n = [e], e;
	}
}, re = (e, t) => {
	let n = {};
	for (var r in e) ne(n, r, {
		get: e[r],
		enumerable: !0
	});
	return t || ne(n, Symbol.toStringTag, { value: "Module" }), n;
}, q, ie = K((() => {
	q = {
		status: (e) => `/accounts/${encodeURIComponent(e)}/status`,
		companies: (e) => `/accounts/${encodeURIComponent(e)}/companies`,
		invoices: (e, t, n, r) => `/accounts/${encodeURIComponent(e)}/invoices?company=${encodeURIComponent(t)}&months=${n}&open=${+!!r}`,
		statements: (e, t) => `/accounts/${encodeURIComponent(e)}/statements?company=${encodeURIComponent(t)}`,
		sessions: (e) => `/accounts/${encodeURIComponent(e)}/sessions`,
		session: (e, t) => `/accounts/${encodeURIComponent(e)}/sessions/${encodeURIComponent(t)}`,
		ledger: (e) => `/accounts/${encodeURIComponent(e)}/ledger`
	};
})), ae, J, oe, se = K((() => {
	({bindHost: ae, host: J} = e("intentic.saldeo")), oe = (e) => e.backend;
})), ce, le, ue, de, fe, pe = K((() => {
	ce = "saldeosmart", le = "saldeosmart-web", ue = (e) => e === void 0 || e === "" || e === "on" || e === !0 || e === "true", de = (e) => e.filter((e) => e.kind === "cli" && e.config.provider === ce).map((e) => ({
		id: e.id,
		username: String(e.config.username ?? ""),
		company: typeof e.config.company == "string" && e.config.company !== "" ? String(e.config.company) : void 0,
		propose: ue(e.config.propose)
	})), fe = (e) => e.filter((e) => e.kind === "browser" && e.config.platform === le).map((e) => e.id);
})), me, he, ge, _e, ve = K((() => {
	ie(), se(), pe(), me = t({
		host: J,
		everyMs: 3e5,
		initial: () => ({ byAccount: {} }),
		read: async (e) => {
			let t = {};
			for (let n of de(e.workspace.capabilities())) try {
				let { sessions: r } = await oe(e).json(q.sessions(n.id));
				t[n.id] = r.reduce((e, t) => e + t.counts.awaiting, 0);
			} catch {
				t[n.id] = 0;
			}
			return { byAccount: t };
		}
	}), he = () => {
		let e = me.start(), t;
		try {
			t = J().workspace.onDidChangeFiles(() => me.refresh());
		} catch {
			t = void 0;
		}
		return { dispose: () => {
			e.dispose(), t?.dispose();
		} };
	}, ge = (e) => me.state.value.byAccount[e] ?? 0, _e = () => me.refresh();
})), ye, be = K((() => {
	ye = (e, t) => {
		let n = e < 0 ? "-" : "", r = Math.abs(e), i = `${n}${Math.floor(r / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\xA0")},${(r % 100).toString().padStart(2, "0")}`;
		return t === void 0 ? i : `${i} ${t}`;
	};
})), xe, Se, Ce, Y, we, Te, Ee, De = K((() => {
	be(), xe = {
		confident: "confident",
		ambiguous: "needs a look",
		unmatched: "no match",
		ignored: "not an invoice"
	}, Se = (e) => e === "confident" ? "success" : e === "ambiguous" ? "warning" : e === "unmatched" ? "danger" : "neutral", Ce = (e) => e === "confirmed" ? "success" : e === "rejected" ? "danger" : "neutral", Y = (e, t) => ye(e, t), we = (e) => e.decision === void 0 ? {
		label: xe[e.verdict],
		tone: Se(e.verdict)
	} : e.decision.status === "confirmed" ? e.verification?.paidInSaldeo === !0 ? {
		label: "paid in Saldeo",
		tone: "success"
	} : e.marking?.status === "ok" ? {
		label: "marked",
		tone: "success"
	} : e.marking?.status === "failed" ? {
		label: "marking failed",
		tone: "danger"
	} : e.marking?.status === "pending" ? {
		label: "marking…",
		tone: "info"
	} : {
		label: "confirmed",
		tone: "primary"
	} : {
		label: e.decision.status,
		tone: Ce(e.decision.status)
	}, Te = (e) => ({
		agent: e.provider,
		model: e.model,
		...e.account === void 0 ? {} : { account: e.account },
		...e.harness === void 0 ? {} : { harness: e.harness },
		...e.effort === void 0 ? {} : { effort: e.effort },
		...e.thinking === void 0 ? {} : { thinking: e.thinking },
		...e.fast === void 0 ? {} : { fast: e.fast }
	}), Ee = (e) => [[
		"Data",
		"Kwota",
		"Waluta",
		"Kontrahent",
		"Tytuł",
		"Faktury",
		"Potwierdzono",
		"Oznaczono w Saldeo",
		"Zweryfikowano"
	].join(";"), ...e.map((e) => [
		e.date,
		ye(e.amount).replace(/ /g, ""),
		e.currency,
		e.counterparty,
		e.title,
		e.invoices,
		e.confirmedAt,
		e.marked,
		e.verified
	].map((e) => `"${String(e).replaceAll("\"", "\"\"")}"`).join(";"))].join("\r\n");
})), X, Z, Q, Oe, ke, Ae, je, Me, Ne, Pe, Fe, Ie, Le, Re = K((() => {
	ie(), ve(), se(), X = "saldeo", Z = (e, t = "POST") => ({
		method: t,
		body: JSON.stringify(e),
		headers: { "content-type": "application/json" }
	}), Q = async (e, t) => {
		let n = await oe(J()).request(e, t), r = await n.text(), i;
		try {
			i = r === "" ? {} : JSON.parse(r);
		} catch {
			throw Error(`the Saldeo backend answered ${n.status} with something that is not JSON`);
		}
		if (!n.ok) {
			let e = i.error;
			throw Error(e ?? `the Saldeo backend answered ${n.status}`);
		}
		return i;
	}, Oe = () => r(() => J().sandbox.reachable()), ke = (e) => G({
		queryKey: r(() => J().sandbox.key(X, "status", e.value)),
		queryFn: () => Q(q.status(e.value)),
		enabled: Oe(),
		staleTime: 6e4
	}), Ae = (e) => G({
		queryKey: r(() => J().sandbox.key(X, "companies", e.value)),
		queryFn: () => Q(q.companies(e.value)),
		enabled: Oe(),
		staleTime: 3e5
	}), je = (e) => G({
		queryKey: r(() => J().sandbox.key(X, "sessions", e.value)),
		queryFn: () => Q(q.sessions(e.value)),
		enabled: Oe(),
		refetchInterval: 3e4
	}), Me = (e, t) => G({
		queryKey: r(() => J().sandbox.key(X, "session", e.value, t.value ?? "")),
		queryFn: () => Q(q.session(e.value, t.value ?? "")),
		enabled: r(() => J().sandbox.reachable() && t.value !== void 0),
		refetchInterval: 3e4
	}), Ne = (e, t, n, i) => G({
		queryKey: r(() => J().sandbox.key(X, "invoices", e.value, t.value ?? "", String(n.value), i.value ? "open" : "all")),
		queryFn: () => Q(q.invoices(e.value, t.value ?? "", n.value, i.value)),
		enabled: r(() => J().sandbox.reachable() && t.value !== void 0),
		staleTime: 3e5
	}), Pe = (e, t) => G({
		queryKey: r(() => J().sandbox.key(X, "statements", e.value, t.value ?? "")),
		queryFn: () => Q(q.statements(e.value, t.value ?? "")),
		enabled: r(() => J().sandbox.reachable() && t.value !== void 0),
		staleTime: 3e5
	}), Fe = (e) => G({
		queryKey: r(() => J().sandbox.key(X, "ledger", e.value)),
		queryFn: () => Q(q.ledger(e.value)),
		enabled: Oe()
	}), Ie = (e) => {
		let t = te(), n = async () => {
			await t.invalidateQueries({ queryKey: J().sandbox.key(X) }), _e();
		}, r = (e) => W({
			mutationFn: e,
			onSettled: () => void n()
		}), i = (t, n) => `${q.session(_(e), t)}${n === void 0 ? "" : `/${n}`}`;
		return {
			importFile: r((t) => Q(q.sessions(_(e)), Z(t))),
			applyMapping: r((e) => Q(i(e.id, "mapping"), Z({
				mapping: e.mapping,
				...e.lookbackMonths === void 0 ? {} : { lookbackMonths: e.lookbackMonths }
			}, "PUT"))),
			rematch: r((e) => Q(i(e, "rematch"), Z({}))),
			decide: r((e) => Q(i(e.id, "decide"), Z({
				transactionId: e.transactionId,
				status: e.status,
				...e.invoices === void 0 ? {} : { invoices: e.invoices },
				...e.note === void 0 ? {} : { note: e.note }
			}))),
			confirmAll: r((e) => Q(i(e, "decide-all"), Z({ verdict: "confident" }))),
			askAgent: r((e) => Q(i(e.id, "ask-agent"), Z({ ...e.pick === void 0 ? {} : { pick: e.pick } }))),
			mark: r((e) => Q(i(e.id, "mark"), Z({
				browserAccount: e.browserAccount,
				...e.transactionIds === void 0 ? {} : { transactionIds: e.transactionIds },
				...e.pick === void 0 ? {} : { pick: e.pick }
			}))),
			verify: r((e) => Q(i(e, "verify"), Z({}))),
			remove: r((e) => Q(i(e), { method: "DELETE" }))
		};
	}, Le = (e) => new Promise((t, n) => {
		let r = new FileReader();
		r.onerror = () => n(r.error ?? /* @__PURE__ */ Error(`could not read ${e.name}`)), r.onload = () => {
			let e = String(r.result ?? "");
			t(e.slice(e.indexOf(",") + 1));
		}, r.readAsDataURL(e);
	});
})), ze, Be, Ve, He, Ue, We, Ge, Ke, qe, Je, Ye = K((() => {
	De(), Re(), ze = { class: "flex flex-col gap-3" }, Be = { class: "flex flex-wrap items-baseline gap-x-2" }, Ve = { class: "font-mono" }, He = { class: "text-muted" }, Ue = { key: 0 }, We = { key: 1 }, Ge = { class: "font-medium text-content" }, Ke = {
		key: 0,
		class: "text-subtle"
	}, qe = {
		key: 1,
		class: "text-xs text-muted"
	}, Je = /*@__PURE__*/ u({
		__name: "InvoicesPane",
		props: {
			account: {},
			company: {}
		},
		setup(e) {
			let t = e, u = p("6"), v = p("open"), y = p("all"), b = p(""), S = Ne(g(t, "account"), g(t, "company"), r(() => Number.parseInt(u.value, 10)), r(() => v.value === "open")), C = r(() => {
				let e = b.value.trim().toLowerCase();
				return (S.data.value?.invoices ?? []).filter((e) => y.value === "all" || e.direction === y.value).filter((t) => e === "" || `${t.number} ${t.contractor?.name ?? ""} ${t.contractor?.nip ?? ""}`.toLowerCase().includes(e)).sort((e, t) => (e.dueDate ?? e.issueDate).localeCompare(t.dueDate ?? t.issueDate));
			}), w = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
			return (e, t) => (f(), o("div", ze, [
				l(_(k), {
					modelValue: b.value,
					"onUpdate:modelValue": t[3] ||= (e) => b.value = e,
					placeholder: "Number, contractor, NIP…",
					count: C.value.length,
					busy: _(S).isFetching.value
				}, {
					controls: x(() => [
						l(_(R), {
							modelValue: y.value,
							"onUpdate:modelValue": t[0] ||= (e) => y.value = e,
							size: "xs",
							options: [
								{
									label: "All",
									value: "all"
								},
								{
									label: "Owed to us",
									value: "in"
								},
								{
									label: "We owe",
									value: "out"
								}
							]
						}, null, 8, ["modelValue"]),
						l(_(R), {
							modelValue: v.value,
							"onUpdate:modelValue": t[1] ||= (e) => v.value = e,
							size: "xs",
							options: [{
								label: "Open",
								value: "open"
							}, {
								label: "Everything",
								value: "all"
							}]
						}, null, 8, ["modelValue"]),
						l(_(R), {
							modelValue: u.value,
							"onUpdate:modelValue": t[2] ||= (e) => u.value = e,
							size: "xs",
							options: [
								{
									label: "3 mo",
									value: "3"
								},
								{
									label: "6 mo",
									value: "6"
								},
								{
									label: "12 mo",
									value: "12"
								}
							]
						}, null, 8, ["modelValue"])
					]),
					_: 1
				}, 8, [
					"modelValue",
					"count",
					"busy"
				]),
				_(S).error.value ? (f(), i(_(M), {
					key: 0,
					of: {
						tone: "danger",
						title: "Could not read invoices",
						detail: _(S).error.value.message
					}
				}, null, 8, ["of"])) : a("", !0),
				l(_(L), {
					label: v.value === "open" ? "Open" : "All",
					count: C.value.length,
					density: "compact",
					caption: _(S).data.value ? `read ${_(H)(Date.parse(_(S).data.value.fetchedAt))}` : "not read yet"
				}, {
					default: x(() => [(f(!0), o(n, null, m(C.value, (e) => (f(), i(_(I), {
						key: e.id,
						density: "compact",
						icon: e.direction === "in" ? "arrow-down-left" : "arrow-up-right",
						tone: e.dueDate !== void 0 && e.dueDate < _(w) && !e.isPaid ? "warning" : "default"
					}, {
						title: x(() => [s("span", Be, [s("span", Ve, h(e.number), 1), s("span", He, h(e.contractor?.name ?? "no contractor"), 1)])]),
						description: x(() => [
							c(h(e.kind) + " · issued " + h(e.issueDate), 1),
							e.dueDate ? (f(), o("span", Ue, " · due " + h(e.dueDate), 1)) : a("", !0),
							e.contractor?.nip ? (f(), o("span", We, " · NIP " + h(e.contractor.nip), 1)) : a("", !0)
						]),
						meta: x(() => [
							s("span", Ge, h(_(Y)(e.remaining, e.currency)), 1),
							e.paid > 0 ? (f(), o("span", Ke, "of " + h(_(Y)(e.total)), 1)) : a("", !0),
							e.isPaid ? (f(), i(_(B), {
								key: 1,
								variant: "success",
								size: "xs",
								label: "paid"
							})) : e.dueDate !== void 0 && e.dueDate < _(w) ? (f(), i(_(B), {
								key: 2,
								variant: "warning",
								size: "xs",
								label: "overdue"
							})) : a("", !0)
						]),
						_: 2
					}, 1032, ["icon", "tone"]))), 128)), C.value.length === 0 && _(S).isFetched.value ? (f(), o("p", {
						key: 0,
						class: d(_(U).emptyState())
					}, "Nothing " + h(v.value === "open" ? "open" : "") + " in the last " + h(u.value) + " months.", 3)) : _(S).isLoading.value ? (f(), o("p", qe, "Reading from SaldeoSMART…")) : a("", !0)]),
					_: 1
				}, 8, [
					"label",
					"count",
					"caption"
				])
			]));
		}
	});
})), Xe, Ze = K((() => {
	Ye(), Ye(), Xe = Je;
})), Qe, $e, et, tt, nt, rt, it = K((() => {
	De(), Re(), Qe = { class: "flex flex-col gap-3" }, $e = { class: "flex flex-wrap items-baseline gap-x-2" }, et = { class: "font-mono text-xs text-muted" }, tt = { class: "font-medium" }, nt = {
		key: 0,
		class: "truncate"
	}, rt = /*@__PURE__*/ u({
		__name: "LedgerPane",
		props: { account: {} },
		setup(e) {
			let t = Fe(g(e, "account")), u = r(() => t.data.value?.ledger.entries ?? []), p = r(() => Ee(u.value.map((e) => ({
				date: e.transaction.date,
				amount: e.transaction.amount,
				currency: e.transaction.currency,
				counterparty: e.transaction.counterparty ?? "",
				title: e.transaction.title,
				invoices: e.invoices.map((e) => `${e.number} ${Y(e.amount)}`).join(" + "),
				confirmedAt: e.confirmedAt.slice(0, 10),
				marked: e.marking?.status ?? "",
				verified: e.verification === void 0 ? "" : e.verification.paidInSaldeo ? "yes" : "no"
			}))));
			return (e, r) => (f(), o("div", Qe, [_(t).error.value ? (f(), i(_(M), {
				key: 0,
				of: {
					tone: "danger",
					title: "Could not read the ledger",
					detail: _(t).error.value.message
				}
			}, null, 8, ["of"])) : a("", !0), l(_(L), {
				label: "Confirmed settlements",
				count: u.value.length,
				density: "compact"
			}, {
				actions: x(() => [l(_(D), {
					text: p.value,
					label: "Copy as CSV"
				}, null, 8, ["text"])]),
				default: x(() => [(f(!0), o(n, null, m(u.value, (e) => (f(), i(_(I), {
					key: e.id,
					density: "compact",
					icon: "check-circle"
				}, {
					title: x(() => [s("span", $e, [
						s("span", et, h(e.transaction.date), 1),
						s("span", tt, h(_(Y)(e.transaction.amount, e.transaction.currency)), 1),
						e.transaction.counterparty ? (f(), o("span", nt, h(e.transaction.counterparty), 1)) : a("", !0)
					])]),
					description: x(() => [c(h(e.invoices.map((e) => `${e.number} (${_(Y)(e.amount)})`).join(" + ")) + " · " + h(e.transaction.title), 1)]),
					meta: x(() => [e.verification?.paidInSaldeo ? (f(), i(_(B), {
						key: 0,
						variant: "success",
						size: "xs",
						label: "paid in Saldeo"
					})) : e.marking?.status === "ok" ? (f(), i(_(B), {
						key: 1,
						variant: "success",
						size: "xs",
						label: "marked"
					})) : e.marking?.status === "failed" ? (f(), i(_(B), {
						key: 2,
						variant: "danger",
						size: "xs",
						label: "marking failed"
					})) : e.marking?.status === "pending" ? (f(), i(_(B), {
						key: 3,
						variant: "info",
						size: "xs",
						label: "marking…"
					})) : (f(), i(_(B), {
						key: 4,
						variant: "primary",
						size: "xs",
						label: "not in Saldeo yet"
					}))]),
					_: 2
				}, 1024))), 128)), u.value.length === 0 && _(t).isFetched.value ? (f(), o("p", {
					key: 0,
					class: d(_(U).emptyState())
				}, "Nothing confirmed yet.", 2)) : a("", !0)]),
				_: 1
			}, 8, ["count"])]));
		}
	});
})), at, ot = K((() => {
	it(), it(), at = rt;
})), st, ct, lt, ut = K((() => {
	Re(), st = { class: "flex flex-col gap-2" }, ct = { class: "flex items-center gap-2 text-sm font-medium text-content" }, lt = /*@__PURE__*/ u({
		__name: "ImportCard",
		props: {
			account: {},
			company: {}
		},
		emits: ["created"],
		setup(e, { emit: t }) {
			let n = e, r = t, o = Ie(g(n, "account")), u = p(), d = p(), m = p(!1), h = () => u.value?.click(), v = async (e) => {
				let t = e.target.files?.[0];
				if (t !== void 0) {
					m.value = !0, d.value = void 0;
					try {
						let e = await Le(t), { session: i } = await o.importFile.mutateAsync({
							company: n.company,
							name: t.name,
							content: e
						});
						r("created", i.id);
					} catch (e) {
						d.value = V(e, `importing ${t.name}`);
					} finally {
						m.value = !1, u.value !== void 0 && (u.value.value = "");
					}
				}
			};
			return (e, t) => (f(), i(_(T), { dashed: "" }, {
				default: x(() => [s("div", st, [
					s("div", ct, [l(_(A), { name: "upload" }), t[1] ||= c(" Import a bank export", -1)]),
					t[3] ||= s("p", { class: "text-xs text-muted" }, "A CSV as your bank exports it (mBank, PKO BP, ING, Pekao, Santander or any other). The columns are recognised where the bank is known and asked about once where it is not.", -1),
					s("input", {
						ref_key: "input",
						ref: u,
						type: "file",
						accept: ".csv,.txt,text/csv,text/plain",
						class: "hidden",
						onChange: v
					}, null, 544),
					l(_(w), {
						size: "small",
						loading: m.value,
						disabled: m.value,
						onClick: h
					}, {
						default: x(() => [l(_(A), { name: "paperclip" }), t[2] ||= c(" Choose a CSV…", -1)]),
						_: 1
					}, 8, ["loading", "disabled"]),
					d.value ? (f(), i(_(M), {
						key: 0,
						of: d.value,
						onDismiss: t[0] ||= (e) => d.value = void 0
					}, null, 8, ["of"])) : a("", !0)
				])]),
				_: 1
			}));
		}
	});
})), dt, ft = K((() => {
	ut(), ut(), dt = lt;
})), pt, mt, ht, gt, _t, vt, yt, bt, xt, St, Ct, wt, Tt, Et, Dt, Ot, kt, At, jt, Mt, Nt, $, Pt, Ft = K((() => {
	pt = { class: "flex flex-col gap-4" }, mt = { class: "flex flex-wrap items-center gap-2 text-sm" }, ht = { class: "font-medium text-content" }, gt = { class: "text-xs text-muted" }, _t = { class: "grid gap-3 @lg:grid-cols-2" }, vt = { class: "flex flex-col gap-1 text-xs text-muted" }, yt = { class: "flex flex-col gap-1 text-xs text-muted" }, bt = { class: "flex flex-col gap-1 text-xs text-muted" }, xt = { class: "flex flex-wrap items-center gap-2" }, St = { class: "flex items-center gap-1" }, Ct = { class: "flex items-center gap-1" }, wt = {
		key: 1,
		class: "grid grid-cols-2 gap-2"
	}, Tt = { class: "flex flex-col gap-1 text-xs text-muted" }, Et = { class: "flex flex-col gap-1 text-xs text-muted" }, Dt = { class: "grid grid-cols-2 gap-2" }, Ot = { class: "flex flex-col gap-1 text-xs text-muted" }, kt = { class: "flex flex-col gap-1 text-xs text-muted" }, At = { class: "flex flex-col gap-1 text-xs text-muted" }, jt = { class: "flex items-center gap-3" }, Mt = {
		key: 0,
		class: "text-xs text-muted"
	}, Nt = {
		key: 1,
		class: "text-xs text-muted"
	}, $ = "—", Pt = /*@__PURE__*/ u({
		__name: "MappingEditor",
		props: {
			session: {},
			busy: { type: Boolean },
			error: {}
		},
		emits: ["apply"],
		setup(e, { emit: t }) {
			let n = e, u = t, m = r(() => [{
				value: $,
				label: "(none)"
			}, ...n.session.file.columns.map((e) => ({
				value: e,
				label: e
			}))]), g = p(""), C = p("signed"), E = p($), D = p($), O = p($), k = p(""), A = p($), N = p($), P = p($), I = p("PLN"), L = p("6"), R = (e) => {
				g.value = e?.date ?? "", C.value = e?.credit !== void 0 && e.debit !== void 0 ? "split" : "signed", E.value = e?.amount ?? $, D.value = e?.credit ?? $, O.value = e?.debit ?? $, k.value = e?.title ?? "", A.value = e?.counterparty ?? $, N.value = e?.account ?? $, P.value = e?.currency ?? $, I.value = e?.defaultCurrency ?? "PLN";
			};
			b(() => n.session.id, () => R(n.session.mapping), { immediate: !0 });
			let z = (e) => e === $ || e === "" ? void 0 : e, V = r(() => {
				let e = z(g.value), t = z(k.value);
				if (e === void 0 || t === void 0) return;
				if (C.value === "signed") {
					let n = z(E.value);
					return n === void 0 ? void 0 : {
						date: e,
						amount: n,
						title: t,
						...H()
					};
				}
				let n = z(D.value), r = z(O.value);
				return n === void 0 || r === void 0 ? void 0 : {
					date: e,
					credit: n,
					debit: r,
					title: t,
					...H()
				};
			}), H = () => ({
				...z(A.value) === void 0 ? {} : { counterparty: z(A.value) },
				...z(N.value) === void 0 ? {} : { account: z(N.value) },
				...z(P.value) === void 0 ? {} : { currency: z(P.value) },
				defaultCurrency: I.value.trim().toUpperCase() || "PLN"
			}), ee = r(() => n.session.rows.slice(0, 5).map((e) => n.session.file.columns.map((t, n) => e[n] ?? ""))), W = () => {
				V.value !== void 0 && u("apply", V.value, Math.max(1, Math.min(36, Number.parseInt(L.value, 10) || 6)));
			};
			return (t, n) => (f(), o("div", pt, [
				l(_(T), null, {
					default: x(() => [s("div", mt, [
						s("span", ht, h(e.session.file.name), 1),
						e.session.file.preset ? (f(), i(_(B), {
							key: 0,
							variant: "info",
							size: "xs",
							label: e.session.file.preset
						}, null, 8, ["label"])) : (f(), i(_(B), {
							key: 1,
							variant: "neutral",
							size: "xs",
							label: "unknown bank"
						})),
						s("span", gt, h(e.session.file.rows) + " rows · " + h(e.session.file.encoding) + " · delimiter \"" + h(e.session.file.delimiter === "	" ? "tab" : e.session.file.delimiter) + "\" · header on line " + h(e.session.file.headerRow + 1), 1)
					]), n[12] ||= s("p", { class: "mt-2 text-xs text-muted" }, "Say which column holds what, then apply: the rows become transactions and are matched against the open invoices of the months before them.", -1)]),
					_: 1
				}),
				s("div", _t, [
					s("label", vt, [n[13] ||= c("Date ", -1), l(_(F), {
						modelValue: g.value,
						"onUpdate:modelValue": n[0] ||= (e) => g.value = e,
						options: m.value.slice(1),
						placeholder: "column…",
						variant: "input"
					}, null, 8, ["modelValue", "options"])]),
					s("label", yt, [n[14] ||= c("Title / description ", -1), l(_(F), {
						modelValue: k.value,
						"onUpdate:modelValue": n[1] ||= (e) => k.value = e,
						options: m.value.slice(1),
						placeholder: "column…",
						variant: "input"
					}, null, 8, ["modelValue", "options"])]),
					s("div", bt, [
						n[17] ||= s("span", null, "Amount", -1),
						s("div", xt, [s("label", St, [S(s("input", {
							"onUpdate:modelValue": n[2] ||= (e) => C.value = e,
							type: "radio",
							value: "signed"
						}, null, 512), [[v, C.value]]), n[15] ||= c(" one signed column", -1)]), s("label", Ct, [S(s("input", {
							"onUpdate:modelValue": n[3] ||= (e) => C.value = e,
							type: "radio",
							value: "split"
						}, null, 512), [[v, C.value]]), n[16] ||= c(" credit and debit columns", -1)])]),
						C.value === "signed" ? (f(), i(_(F), {
							key: 0,
							modelValue: E.value,
							"onUpdate:modelValue": n[4] ||= (e) => E.value = e,
							options: m.value,
							placeholder: "amount column…",
							variant: "input"
						}, null, 8, ["modelValue", "options"])) : (f(), o("div", wt, [l(_(F), {
							modelValue: D.value,
							"onUpdate:modelValue": n[5] ||= (e) => D.value = e,
							options: m.value,
							placeholder: "credit (in)…",
							variant: "input"
						}, null, 8, ["modelValue", "options"]), l(_(F), {
							modelValue: O.value,
							"onUpdate:modelValue": n[6] ||= (e) => O.value = e,
							options: m.value,
							placeholder: "debit (out)…",
							variant: "input"
						}, null, 8, ["modelValue", "options"])]))
					]),
					s("label", Tt, [n[18] ||= c("Counterparty ", -1), l(_(F), {
						modelValue: A.value,
						"onUpdate:modelValue": n[7] ||= (e) => A.value = e,
						options: m.value,
						variant: "input"
					}, null, 8, ["modelValue", "options"])]),
					s("label", Et, [n[19] ||= c("Counterparty account ", -1), l(_(F), {
						modelValue: N.value,
						"onUpdate:modelValue": n[8] ||= (e) => N.value = e,
						options: m.value,
						variant: "input"
					}, null, 8, ["modelValue", "options"])]),
					s("div", Dt, [s("label", Ot, [n[20] ||= c("Currency column ", -1), l(_(F), {
						modelValue: P.value,
						"onUpdate:modelValue": n[9] ||= (e) => P.value = e,
						options: m.value,
						variant: "input"
					}, null, 8, ["modelValue", "options"])]), s("label", kt, [n[21] ||= c("Default currency ", -1), S(s("input", {
						"onUpdate:modelValue": n[10] ||= (e) => I.value = e,
						class: d(_(U).input()),
						maxlength: "3"
					}, null, 2), [[y, I.value]])])]),
					s("label", At, [n[22] ||= c("Look for invoices this many months before the earliest transaction ", -1), S(s("input", {
						"onUpdate:modelValue": n[11] ||= (e) => L.value = e,
						type: "number",
						min: "1",
						max: "36",
						class: d(_(U).input("w-24"))
					}, null, 2), [[y, L.value]])])
				]),
				l(_(j), {
					headers: [...e.session.file.columns],
					rows: ee.value
				}, null, 8, ["headers", "rows"]),
				e.error ? (f(), i(_(M), {
					key: 0,
					of: {
						tone: "danger",
						title: "Mapping refused",
						detail: e.error
					}
				}, null, 8, ["of"])) : a("", !0),
				s("div", jt, [l(_(w), {
					disabled: V.value === void 0 || e.busy,
					loading: e.busy,
					onClick: W
				}, {
					default: x(() => [...n[23] ||= [c("Apply and match", -1)]]),
					_: 1
				}, 8, ["disabled", "loading"]), V.value === void 0 ? (f(), o("span", Mt, "A date, an amount (or credit + debit) and a title column are needed.")) : (f(), o("span", Nt, "Reads the invoices from SaldeoSMART; a few months take a dozen API calls."))])
			]));
		}
	});
})), It, Lt = K((() => {
	Ft(), Ft(), It = Pt;
})), Rt, zt, Bt, Vt, Ht, Ut, Wt, Gt, Kt, qt, Jt, Yt, Xt, Zt, Qt, $t, en, tn, nn, rn, an, on, sn, cn, ln, un, dn, fn, pn, mn = K((() => {
	De(), Rt = { class: "flex flex-wrap items-baseline gap-x-2" }, zt = { class: "font-mono text-xs text-muted" }, Bt = {
		key: 0,
		class: "truncate"
	}, Vt = ["title"], Ht = {
		key: 0,
		class: "text-2xs text-subtle"
	}, Ut = { class: "flex flex-col gap-3 text-xs" }, Wt = {
		key: 0,
		class: "font-mono text-2xs text-subtle"
	}, Gt = {
		key: 1,
		class: "flex flex-col gap-1"
	}, Kt = { class: "text-muted" }, qt = { class: "font-medium text-content" }, Jt = { key: 0 }, Yt = { key: 1 }, Xt = {
		key: 0,
		class: "text-muted"
	}, Zt = { class: "text-content" }, Qt = { key: 0 }, $t = {
		key: 1,
		class: "text-muted"
	}, en = {
		key: 0,
		class: "flex list-none flex-col gap-2 p-0"
	}, tn = { class: "flex flex-wrap items-center gap-2" }, nn = { class: "font-medium text-content" }, rn = { class: "ml-auto flex items-center gap-1" }, an = { class: "list-disc pl-4 text-muted" }, on = {
		key: 0,
		class: "text-muted"
	}, sn = {
		key: 1,
		class: "text-muted"
	}, cn = { class: "flex flex-wrap items-end gap-2" }, ln = { class: "flex min-w-0 flex-1 flex-col gap-1 text-muted" }, un = {
		key: 0,
		class: "flex flex-col gap-1 text-muted"
	}, dn = ["placeholder"], fn = { class: "ml-auto flex items-center gap-1" }, pn = /*@__PURE__*/ u({
		__name: "MatchRow",
		props: {
			session: {},
			item: {},
			transaction: {}
		},
		emits: ["decide"],
		setup(e, { emit: t }) {
			let u = e, g = t, v = p(u.item.decision === void 0 && u.item.verdict !== "confident" && u.item.verdict !== "ignored"), b = r(() => we(u.item)), C = r(() => b.value.tone === "danger" ? "danger" : b.value.tone === "warning" ? "warning" : b.value.tone === "success" ? "success" : "default"), T = (e) => u.session.invoices.find((t) => t.id === e), E = r(() => Math.abs(u.transaction?.amount ?? 0)), D = r(() => (u.transaction?.amount ?? 0) >= 0 ? "in" : "out"), k = r(() => {
				let e = new Set(u.item.proposals.flatMap((e) => e.invoices.map((e) => e.invoiceId)));
				return u.session.invoices.filter((e) => !e.isPaid && e.remaining > 0 && e.direction === D.value && e.currency === (u.transaction?.currency ?? "PLN")).sort((t, n) => Number(e.has(n.id)) - Number(e.has(t.id)) || n.issueDate.localeCompare(t.issueDate)).map((e) => ({
					value: e.id,
					label: `${e.number} · ${Y(e.remaining, e.currency)}`,
					description: `${e.contractor?.name ?? "no contractor"} · issued ${e.issueDate}${e.dueDate === void 0 ? "" : `, due ${e.dueDate}`}`
				}));
			}), j = p(), M = p(""), N = r(() => j.value === void 0 ? void 0 : T(j.value)), P = r(() => N.value === void 0 ? 0 : Math.min(E.value, N.value.remaining)), I = r(() => {
				let e = M.value.trim();
				if (e === "") return P.value;
				let t = Number.parseFloat(e.replace(/\s/g, "").replace(",", "."));
				return Number.isFinite(t) ? Math.round(t * 100) : 0;
			}), L = (e) => e.invoices.map((e) => `${T(e.invoiceId)?.number ?? e.invoiceId} (${Y(e.amount)})`).join(" + "), R = (e) => g("decide", u.item.transactionId, "confirmed", e.invoices), z = () => {
				j.value !== void 0 && I.value > 0 && g("decide", u.item.transactionId, "confirmed", [{
					invoiceId: j.value,
					amount: I.value
				}], "picked by hand");
			};
			return (t, r) => (f(), i(_(O), {
				open: v.value,
				"onUpdate:open": r[5] ||= (e) => v.value = e,
				density: "compact",
				tone: C.value,
				body: "drawer"
			}, {
				title: x(() => [s("span", Rt, [
					s("span", zt, h(e.transaction?.date ?? "?"), 1),
					s("span", { class: d(["font-medium", (e.transaction?.amount ?? 0) >= 0 ? "text-success" : "text-content"]) }, h(e.transaction ? _(Y)(e.transaction.amount, e.transaction.currency) : "?"), 3),
					e.transaction?.counterparty ? (f(), o("span", Bt, h(e.transaction.counterparty), 1)) : a("", !0)
				])]),
				description: x(() => [s("span", {
					class: "truncate",
					title: e.transaction?.title
				}, h(e.transaction?.title), 9, Vt)]),
				meta: x(() => [e.item.decision === void 0 && e.item.proposals.length > 0 ? (f(), o("span", Ht, h(e.item.proposals.length) + " proposal" + h(e.item.proposals.length === 1 ? "" : "s"), 1)) : a("", !0), l(_(B), {
					variant: b.value.tone,
					size: "xs",
					label: b.value.label
				}, null, 8, ["variant", "label"])]),
				below: x(() => [s("div", Ut, [e.transaction?.counterpartyAccount ? (f(), o("div", Wt, "from " + h(e.transaction.counterpartyAccount), 1)) : a("", !0), e.item.decision ? (f(), o("div", Gt, [
					s("div", Kt, [
						s("span", qt, h(e.item.decision.status), 1),
						e.item.decision.invoices.length > 0 ? (f(), o("span", Jt, " · " + h(e.item.decision.invoices.map((e) => `${T(e.invoiceId)?.number ?? e.invoiceId} (${_(Y)(e.amount)})`).join(" + ")), 1)) : a("", !0),
						e.item.decision.note ? (f(), o("span", Yt, " · " + h(e.item.decision.note), 1)) : a("", !0)
					]),
					e.item.marking ? (f(), o("div", Xt, [
						r[6] ||= c("marking in SaldeoSMART: ", -1),
						s("span", Zt, h(e.item.marking.status), 1),
						e.item.marking.note ? (f(), o("span", Qt, " · " + h(e.item.marking.note), 1)) : a("", !0)
					])) : a("", !0),
					e.item.verification ? (f(), o("div", $t, "SaldeoSMART shows it " + h(e.item.verification.paidInSaldeo ? "paid" : "still open") + " (checked " + h(e.item.verification.at.slice(0, 16).replace("T", " ")) + ")", 1)) : a("", !0),
					s("div", null, [s("button", {
						type: "button",
						class: d(_(U).textAction()),
						onClick: r[0] ||= (t) => g("decide", e.item.transactionId, "cleared")
					}, [l(_(A), { name: "undo" }), r[7] ||= c(" Undo this decision", -1)], 2)])
				])) : (f(), o(n, { key: 2 }, [e.item.proposals.length > 0 ? (f(), o("ul", en, [(f(!0), o(n, null, m(e.item.proposals, (e, t) => (f(), o("li", {
					key: t,
					class: "flex flex-col gap-1 rounded-md border border-line p-2"
				}, [
					s("div", tn, [
						s("span", nn, h(L(e)), 1),
						l(_(B), {
							variant: e.score >= 80 ? "success" : e.score >= 50 ? "warning" : "neutral",
							size: "xs",
							label: `${e.score}`
						}, null, 8, ["variant", "label"]),
						e.by === "agent" ? (f(), i(_(B), {
							key: 0,
							variant: "info",
							size: "xs",
							label: "agent"
						})) : a("", !0),
						s("span", rn, [e.invoices.length > 0 ? (f(), i(_(w), {
							key: 0,
							size: "small",
							onClick: (t) => R(e)
						}, {
							default: x(() => [l(_(A), { name: "check" }), r[8] ||= c(" Confirm", -1)]),
							_: 1
						}, 8, ["onClick"])) : a("", !0)])
					]),
					s("ul", an, [(f(!0), o(n, null, m(e.reasons, (e) => (f(), o("li", { key: e }, h(e), 1))), 128))]),
					e.note ? (f(), o("div", on, h(e.note), 1)) : a("", !0)
				]))), 128))])) : (f(), o("p", sn, "The matcher found no open invoice for this; ask the agent, pick one below, or skip it.")), s("div", cn, [
					s("label", ln, [r[9] ||= c(" Pick an invoice ", -1), l(_(F), {
						modelValue: j.value,
						"onUpdate:modelValue": r[1] ||= (e) => j.value = e,
						options: k.value,
						placeholder: "open invoices…",
						variant: "input",
						"search-threshold": 6
					}, null, 8, ["modelValue", "options"])]),
					N.value ? (f(), o("label", un, [r[10] ||= c(" Amount ", -1), S(s("input", {
						"onUpdate:modelValue": r[2] ||= (e) => M.value = e,
						class: d(_(U).input("w-32")),
						placeholder: _(Y)(P.value)
					}, null, 10, dn), [[y, M.value]])])) : a("", !0),
					N.value ? (f(), i(_(w), {
						key: 1,
						size: "small",
						disabled: I.value <= 0,
						onClick: z
					}, {
						default: x(() => [l(_(A), { name: "check" }), r[11] ||= c(" Confirm", -1)]),
						_: 1
					}, 8, ["disabled"])) : a("", !0),
					s("span", fn, [l(_(w), {
						size: "small",
						severity: "secondary",
						onClick: r[3] ||= (t) => g("decide", e.item.transactionId, "rejected", [], void 0)
					}, {
						default: x(() => [l(_(A), { name: "times" }), r[12] ||= c(" Reject", -1)]),
						_: 1
					}), l(_(w), {
						size: "small",
						severity: "secondary",
						onClick: r[4] ||= (t) => g("decide", e.item.transactionId, "skipped", [], void 0)
					}, {
						default: x(() => [l(_(A), { name: "ban" }), r[13] ||= c(" Not an invoice", -1)]),
						_: 1
					})])
				])], 64))])]),
				_: 1
			}, 8, ["open", "tone"]));
		}
	});
})), hn, gn = K((() => {
	mn(), mn(), hn = pn;
})), _n, vn, yn, bn, xn, Sn, Cn, wn, Tn, En, Dn, On, kn, An = K((() => {
	se(), De(), gn(), _n = { class: "flex flex-col gap-4" }, vn = { class: "flex flex-wrap items-center gap-x-3 gap-y-1" }, yn = { class: "text-sm font-medium text-content" }, bn = { class: "text-xs text-muted" }, xn = ["title"], Sn = { class: "ml-auto flex items-center gap-1" }, Cn = ["disabled"], wn = ["disabled"], Tn = { class: "flex flex-wrap items-center gap-2" }, En = { class: "flex items-center gap-2" }, Dn = { class: "text-xs text-muted" }, On = { class: "flex flex-col gap-1" }, kn = /*@__PURE__*/ u({
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
		setup(e, { emit: t }) {
			let u = e, g = t, v = J(), y = ee(() => v.models, "saldeo-reconcile"), b = ee(() => v.models, "saldeo-mark"), S = p(), T = p(!1), D = r(() => {
				let e = u.session.items, t = e.filter((e) => e.decision === void 0);
				return {
					confident: t.filter((e) => e.verdict === "confident").length,
					ambiguous: t.filter((e) => e.verdict === "ambiguous").length,
					unmatched: t.filter((e) => e.verdict === "unmatched").length,
					ignored: t.filter((e) => e.verdict === "ignored").length,
					confirmed: e.filter((e) => e.decision?.status === "confirmed").length,
					marked: e.filter((e) => e.marking?.status === "ok").length,
					unmarked: e.filter((e) => e.decision?.status === "confirmed" && e.marking?.status !== "ok").length,
					unresolved: t.filter((e) => e.verdict === "ambiguous" || e.verdict === "unmatched").length
				};
			}), O = r(() => [
				{
					label: "confident",
					value: String(D.value.confident)
				},
				{
					label: "need a look",
					value: String(D.value.ambiguous)
				},
				{
					label: "no match",
					value: String(D.value.unmatched)
				},
				{
					label: "not invoices",
					value: String(D.value.ignored)
				},
				{
					label: "confirmed",
					value: String(D.value.confirmed),
					note: `${D.value.marked} marked in Saldeo`
				}
			]), k = p("decide"), j = [
				{
					label: "To decide",
					value: "decide"
				},
				{
					label: "Confirmed",
					value: "confirmed"
				},
				{
					label: "Other",
					value: "other"
				},
				{
					label: "All",
					value: "all"
				}
			], N = r(() => u.session.items.map((e) => ({
				item: e,
				transaction: u.session.transactions.find((t) => t.id === e.transactionId)
			})).filter(({ item: e }) => {
				switch (k.value) {
					case "decide": return e.decision === void 0 && e.verdict !== "ignored";
					case "confirmed": return e.decision?.status === "confirmed";
					case "other": return e.decision !== void 0 && e.decision.status !== "confirmed" || e.decision === void 0 && e.verdict === "ignored";
					default: return !0;
				}
			}).sort((e, t) => (e.transaction?.row ?? 0) - (t.transaction?.row ?? 0))), P = async (e, t) => {
				S.value = void 0;
				try {
					await t();
				} catch (t) {
					S.value = V(t, e);
				}
			}, F = (e, t, n, r) => P("deciding", () => u.actions.decide.mutateAsync({
				id: u.session.id,
				transactionId: e,
				status: t,
				...n === void 0 ? {} : { invoices: n },
				...r === void 0 ? {} : { note: r }
			})), I = () => P("asking the agent", async () => {
				let e = y.overridden.value ? Te(y.model.value) : void 0, { conversationId: t } = await u.actions.askAgent.mutateAsync({
					id: u.session.id,
					...e === void 0 ? {} : { pick: e }
				});
				y.clear(), v.chat.openAgent(t);
			}), L = () => P("starting the marking run", async () => {
				let e = u.browserAccounts[0];
				if (e === void 0) throw Error("connect the SaldeoSMART (web) browser account first");
				let t = b.overridden.value ? Te(b.model.value) : void 0, { conversationId: n } = await u.actions.mark.mutateAsync({
					id: u.session.id,
					browserAccount: e,
					...t === void 0 ? {} : { pick: t }
				});
				b.clear(), v.chat.openAgent(n);
			}), B = () => P("deleting the session", async () => {
				await u.actions.remove.mutateAsync(u.session.id), T.value = !1, g("closed");
			}), W = r(() => u.session.agentRuns[u.session.agentRuns.length - 1]);
			return (t, r) => (f(), o("div", _n, [
				s("div", vn, [
					s("span", yn, h(e.session.file.name), 1),
					s("span", bn, [c(h(e.session.transactions.length) + " transactions · matched against " + h(e.session.invoices.length) + " invoices ", 1), e.session.invoicesAt ? (f(), o("span", {
						key: 0,
						title: e.session.invoicesAt
					}, "read " + h(_(H)(Date.parse(e.session.invoicesAt))), 9, xn)) : a("", !0)]),
					s("span", Sn, [
						s("button", {
							type: "button",
							class: d(_(U).textAction()),
							title: "Read the invoices again and re-match the undecided rows",
							disabled: e.actions.rematch.isPending.value,
							onClick: r[0] ||= (t) => P("re-matching", () => e.actions.rematch.mutateAsync(e.session.id))
						}, [l(_(A), {
							name: "refresh",
							spin: e.actions.rematch.isPending.value
						}, null, 8, ["spin"]), r[10] ||= c(" Re-match ", -1)], 10, Cn),
						s("button", {
							type: "button",
							class: d(_(U).textAction()),
							title: "Ask SaldeoSMART whether the confirmed invoices show as paid there",
							disabled: e.actions.verify.isPending.value || D.value.confirmed === 0,
							onClick: r[1] ||= (t) => P("verifying", () => e.actions.verify.mutateAsync(e.session.id))
						}, [l(_(A), {
							name: "check-circle",
							spin: e.actions.verify.isPending.value
						}, null, 8, ["spin"]), r[11] ||= c(" Verify with Saldeo ", -1)], 10, wn),
						s("button", {
							type: "button",
							class: d(_(U).iconButton()),
							title: "Delete this session",
							onClick: r[2] ||= (e) => T.value = !0
						}, [l(_(A), { name: "trash" })], 2)
					])
				]),
				l(_(z), { items: O.value }, null, 8, ["items"]),
				e.skipped.length > 0 ? (f(), i(_(M), {
					key: 0,
					of: {
						tone: "warning",
						title: `${e.skipped.length} row${e.skipped.length === 1 ? "" : "s"} could not be read`,
						detail: e.skipped.map((e) => `row ${e.row}: ${e.reason}`).join("; ")
					}
				}, null, 8, ["of"])) : a("", !0),
				S.value ? (f(), i(_(M), {
					key: 1,
					of: S.value,
					onDismiss: r[3] ||= (e) => S.value = void 0
				}, null, 8, ["of"])) : a("", !0),
				s("div", Tn, [
					l(_(w), {
						size: "small",
						disabled: D.value.confident === 0,
						onClick: r[4] ||= (t) => P("confirming", () => e.actions.confirmAll.mutateAsync(e.session.id))
					}, {
						default: x(() => [l(_(A), { name: "check" }), c(" Confirm " + h(D.value.confident) + " confident ", 1)]),
						_: 1
					}, 8, ["disabled"]),
					l(_(C), {
						label: "Ask the agent",
						icon: "sparkles",
						size: "small",
						picker: _(y),
						hint: e.mayPropose ? `Resolve the ${D.value.unresolved} unresolved rows with the saldeo tools; proposals come back here for you to confirm` : "The card's 'Let the agent propose matches' switch is off",
						disabled: D.value.unresolved === 0 || !e.mayPropose,
						loading: e.actions.askAgent.isPending.value,
						onRun: I
					}, null, 8, [
						"picker",
						"hint",
						"disabled",
						"loading"
					]),
					l(_(C), {
						label: "Mark as paid in SaldeoSMART",
						icon: "check-square",
						size: "small",
						picker: _(b),
						hint: e.browserAccounts.length === 0 ? "Needs the SaldeoSMART (web) browser account: the API cannot write payments" : `Starts a browser run over ${D.value.unmarked} confirmed settlement${D.value.unmarked === 1 ? "" : "s"}`,
						disabled: D.value.unmarked === 0 || e.browserAccounts.length === 0,
						loading: e.actions.mark.isPending.value,
						onRun: L
					}, null, 8, [
						"picker",
						"hint",
						"disabled",
						"loading"
					]),
					e.browserAccounts.length === 0 ? (f(), o("button", {
						key: 0,
						type: "button",
						class: d(_(U).linkButton()),
						onClick: r[5] ||= (e) => _(v).navigate("/capabilities")
					}, "Connect SaldeoSMART (web) to mark invoices paid", 2)) : a("", !0),
					W.value ? (f(), o("button", {
						key: 1,
						type: "button",
						class: d(_(U).textAction("ml-auto")),
						onClick: r[6] ||= (e) => _(v).chat.openAgent(W.value.conversationId)
					}, [l(_(A), { name: "comments" }), c(" last run: " + h(W.value.kind === "mark" ? "marking" : "resolving") + " " + h(_(H)(Date.parse(W.value.startedAt))), 1)], 2)) : a("", !0)
				]),
				s("div", En, [l(_(R), {
					modelValue: k.value,
					"onUpdate:modelValue": r[7] ||= (e) => k.value = e,
					size: "xs",
					options: j
				}, null, 8, ["modelValue"]), s("span", Dn, h(N.value.length) + " of " + h(e.session.items.length), 1)]),
				s("div", On, [(f(!0), o(n, null, m(N.value, (t) => (f(), i(hn, {
					key: t.item.transactionId,
					session: e.session,
					item: t.item,
					transaction: t.transaction,
					onDecide: F
				}, null, 8, [
					"session",
					"item",
					"transaction"
				]))), 128)), N.value.length === 0 ? (f(), o("p", {
					key: 0,
					class: d(_(U).emptyState())
				}, "Nothing here" + h(k.value === "decide" ? ": every row is decided" : "") + ".", 3)) : a("", !0)]),
				l(_(E), {
					open: T.value,
					header: "Delete this session?",
					"confirm-label": "Delete",
					destructive: "",
					loading: e.actions.remove.isPending.value,
					onCancel: r[8] ||= (e) => T.value = !1,
					onHide: r[9] ||= (e) => T.value = !1,
					onConfirm: B
				}, {
					default: x(() => [...r[12] ||= [s("p", { class: "text-sm text-muted" }, "The imported rows, the matches and this session's ledger entries go. Nothing in SaldeoSMART changes.", -1)]]),
					_: 1
				}, 8, ["open", "loading"])
			]));
		}
	});
})), jn, Mn = K((() => {
	An(), An(), jn = kn;
})), Nn, Pn, Fn, In, Ln, Rn, zn, Bn, Vn, Hn, Un = K((() => {
	se(), ft(), Lt(), Mn(), Re(), Nn = { class: "grid gap-4 @3xl:grid-cols-[minmax(14rem,18rem)_1fr]" }, Pn = { class: "flex min-w-0 flex-col gap-3" }, Fn = { key: 0 }, In = { key: 1 }, Ln = {
		key: 0,
		class: "text-link"
	}, Rn = { key: 1 }, zn = ["title"], Bn = { class: "min-w-0" }, Vn = {
		key: 2,
		class: "text-sm text-muted"
	}, Hn = /*@__PURE__*/ u({
		__name: "ReconcilePane",
		props: {
			account: {},
			company: {},
			browserAccounts: {},
			mayPropose: { type: Boolean }
		},
		setup(e) {
			let t = e, u = J(), p = g(t, "account"), v = je(p), y = r({
				get: () => u.route.query().session,
				set: (e) => u.route.setQuery({ session: e })
			}), b = Me(p, y), S = Ie(p), C = r(() => (v.data.value?.sessions ?? []).filter((e) => e.company === t.company)), w = r(() => b.data.value?.session), T = r(() => b.data.value?.skipped ?? []), E = async (e, t) => {
				y.value !== void 0 && await S.applyMapping.mutateAsync({
					id: y.value,
					mapping: e,
					lookbackMonths: t
				});
			};
			return (t, r) => (f(), o("div", Nn, [s("aside", Pn, [
				l(dt, {
					account: p.value,
					company: e.company,
					onCreated: r[0] ||= (e) => y.value = e
				}, null, 8, ["account", "company"]),
				l(_(L), {
					label: "Statements",
					count: C.value.length,
					density: "compact"
				}, {
					default: x(() => [(f(!0), o(n, null, m(C.value, (e) => (f(), i(_(I), {
						key: e.id,
						as: "button",
						density: "compact",
						icon: "file",
						selected: y.value === e.id,
						title: e.file.name,
						onClick: (t) => y.value = e.id
					}, {
						description: x(() => [e.mapped ? (f(), o("span", In, [c(h(e.counts.transactions) + " rows · ", 1), e.counts.awaiting > 0 ? (f(), o("span", Ln, h(e.counts.awaiting) + " to decide", 1)) : (f(), o("span", Rn, h(e.counts.confirmed) + " confirmed", 1))])) : (f(), o("span", Fn, "columns not mapped yet"))]),
						meta: x(() => [s("span", { title: e.createdAt }, h(_(H)(Date.parse(e.createdAt))), 9, zn)]),
						_: 2
					}, 1032, [
						"selected",
						"title",
						"onClick"
					]))), 128)), C.value.length === 0 && _(v).isFetched.value ? (f(), o("p", {
						key: 0,
						class: d(_(U).emptyState())
					}, "No statement imported for this company yet.", 2)) : a("", !0)]),
					_: 1
				}, 8, ["count"]),
				_(v).error.value ? (f(), i(_(M), {
					key: 0,
					of: {
						tone: "danger",
						title: "Could not list statements",
						detail: _(v).error.value.message
					}
				}, null, 8, ["of"])) : a("", !0)
			]), s("section", Bn, [y.value === void 0 ? (f(), o("div", {
				key: 0,
				class: d(_(U).emptyState("py-10"))
			}, [l(_(A), { name: "upload" }), r[2] ||= s("p", { class: "mt-2" }, "Import a bank export on the left, or open a statement. Matches are proposed; nothing is written to SaldeoSMART until you confirm and start the marking run.", -1)], 2)) : _(b).error.value ? (f(), i(_(M), {
				key: 1,
				of: {
					tone: "danger",
					title: "Could not open the session",
					detail: _(b).error.value.message
				}
			}, null, 8, ["of"])) : w.value === void 0 ? (f(), o("p", Vn, "Loading…")) : w.value.mapping === void 0 || w.value.transactions.length === 0 ? (f(), i(It, {
				key: 3,
				session: w.value,
				busy: _(S).applyMapping.isPending.value,
				error: _(S).applyMapping.error.value?.message,
				onApply: E
			}, null, 8, [
				"session",
				"busy",
				"error"
			])) : (f(), i(jn, {
				key: 4,
				account: p.value,
				session: w.value,
				skipped: T.value,
				"browser-accounts": e.browserAccounts,
				"may-propose": e.mayPropose,
				actions: _(S),
				onClosed: r[1] ||= (e) => y.value = void 0
			}, null, 8, [
				"account",
				"session",
				"skipped",
				"browser-accounts",
				"may-propose",
				"actions"
			]))])]));
		}
	});
})), Wn, Gn = K((() => {
	Un(), Un(), Wn = Hn;
})), Kn, qn, Jn, Yn = K((() => {
	De(), Re(), Kn = { class: "flex flex-col gap-2" }, qn = {
		key: 2,
		class: "text-xs text-muted"
	}, Jn = /*@__PURE__*/ u({
		__name: "StatementsPane",
		props: {
			account: {},
			company: {}
		},
		setup(e) {
			let t = e, s = Pe(g(t, "account"), g(t, "company")), c = (e) => e.map((e) => [
				e.date,
				Y(e.amount, e.currency),
				e.description,
				e.settled.length === 0 ? e.remainingToSettle === void 0 ? "" : `open ${Y(e.remainingToSettle)}` : e.settled.map((e) => `${e.number} (${Y(e.amountSettled)})`).join(", ")
			]), u = r(() => s.data.value?.statements ?? []);
			return (e, t) => (f(), o("div", Kn, [
				_(s).error.value ? (f(), i(_(M), {
					key: 0,
					of: {
						tone: "danger",
						title: "Could not read bank statements",
						detail: _(s).error.value.message
					}
				}, null, 8, ["of"])) : a("", !0),
				(f(!0), o(n, null, m(u.value, (e, t) => (f(), i(_(O), {
					key: t,
					density: "compact",
					body: "drawer",
					icon: "file",
					title: `${e.account} · ${e.from} – ${e.to}`,
					description: `${e.status} · ${e.operations.length} operations${e.filename === void 0 ? "" : ` · ${e.filename}`}`
				}, {
					below: x(() => [l(_(j), {
						headers: [
							"Date",
							"Amount",
							"Description",
							"Settled against"
						],
						rows: c(e.operations)
					}, null, 8, ["rows"])]),
					_: 2
				}, 1032, ["title", "description"]))), 128)),
				u.value.length === 0 && _(s).isFetched.value ? (f(), o("p", {
					key: 1,
					class: d(_(U).emptyState())
				}, "SaldeoSMART holds no statements flagged for this company.", 2)) : _(s).isLoading.value ? (f(), o("p", qn, "Reading from SaldeoSMART…")) : a("", !0)
			]));
		}
	});
})), Xn, Zn = K((() => {
	Yn(), Yn(), Xn = Jn;
})), Qn, $n, er, tr, nr = K((() => {
	se(), pe(), Ze(), ot(), Gn(), Zn(), Re(), Qn = { class: "@container flex flex-col gap-4" }, $n = ["title"], er = {
		key: 4,
		class: "text-sm text-muted"
	}, tr = /*@__PURE__*/ u({
		__name: "SaldeoView",
		props: { account: {} },
		setup(e) {
			let t = e, c = J(), u = r(() => t.account ?? de(c.workspace.capabilities())[0]?.id ?? "saldeosmart"), d = r(() => de(c.workspace.capabilities()).find((e) => e.id === u.value)), p = r(() => fe(c.workspace.capabilities())), m = ke(u), g = Ae(u), v = [
				{
					label: "Reconcile",
					value: "reconcile"
				},
				{
					label: "Invoices",
					value: "invoices"
				},
				{
					label: "Bank statements",
					value: "statements"
				},
				{
					label: "Ledger",
					value: "ledger"
				}
			], y = r({
				get: () => v.some((e) => e.value === c.route.query().tab) ? c.route.query().tab : "reconcile",
				set: (e) => c.route.setQuery({ tab: e === "reconcile" ? void 0 : e })
			}), S = r(() => (g.data.value?.companies ?? []).map((e) => ({
				value: e.programId,
				label: e.name,
				...e.nip === void 0 ? {} : { description: `NIP ${e.nip}` }
			}))), C = r({
				get: () => d.value?.company ?? c.route.query().company ?? (S.value.length === 1 ? S.value[0]?.value : void 0),
				set: (e) => c.route.setQuery({ company: e })
			});
			b(S, (e) => {
				C.value === void 0 && e.length === 1 && (C.value = e[0]?.value);
			});
			let w = r(() => m.data.value !== void 0 && !m.data.value.reachable), T = r(() => {
				let e = m.data.value;
				return e === void 0 ? `SaldeoSMART, as ${d.value?.username ?? u.value}` : `SaldeoSMART as ${e.username}${e.reachable ? "" : " · not answering"}${e.detail === void 0 || !e.reachable ? "" : ` · ${e.detail}`}`;
			});
			return (e, t) => (f(), i(_(N), { width: "wide" }, {
				default: x(() => [s("div", Qn, [
					l(_(P), {
						title: "Saldeo",
						description: T.value
					}, {
						actions: x(() => [d.value?.company === void 0 && S.value.length > 1 ? (f(), i(_(F), {
							key: 0,
							modelValue: C.value,
							"onUpdate:modelValue": t[0] ||= (e) => C.value = e,
							options: S.value,
							placeholder: "Company…",
							"aria-label": "Company",
							variant: "input"
						}, null, 8, ["modelValue", "options"])) : C.value === void 0 ? a("", !0) : (f(), o("span", {
							key: 1,
							class: "text-xs text-muted",
							title: C.value
						}, h(S.value.find((e) => e.value === C.value)?.label ?? C.value), 9, $n)), l(_(R), {
							modelValue: y.value,
							"onUpdate:modelValue": t[1] ||= (e) => y.value = e,
							size: "sm",
							options: v
						}, null, 8, ["modelValue"])]),
						_: 1
					}, 8, ["description"]),
					w.value ? (f(), i(_(M), {
						key: 0,
						of: {
							tone: "danger",
							title: "SaldeoSMART is not answering",
							detail: _(m).data.value?.detail ?? ""
						}
					}, null, 8, ["of"])) : _(m).error.value ? (f(), i(_(M), {
						key: 1,
						of: {
							tone: "danger",
							title: "The Saldeo backend failed",
							detail: _(m).error.value.message
						}
					}, null, 8, ["of"])) : C.value === void 0 && S.value.length === 0 && _(g).isFetched.value ? (f(), i(_(M), {
						key: 2,
						of: {
							tone: "warning",
							title: "No company to work on",
							detail: "This login sees no companies in SaldeoSMART. The API is an office-side login; a client-side one sees nothing."
						}
					})) : a("", !0),
					C.value === void 0 ? S.value.length > 1 ? (f(), o("p", er, "Pick a company to start.")) : a("", !0) : (f(), o(n, { key: 3 }, [y.value === "reconcile" ? (f(), i(Wn, {
						key: 0,
						account: u.value,
						company: C.value,
						"browser-accounts": p.value,
						"may-propose": d.value?.propose ?? !0
					}, null, 8, [
						"account",
						"company",
						"browser-accounts",
						"may-propose"
					])) : y.value === "invoices" ? (f(), i(Xe, {
						key: 1,
						account: u.value,
						company: C.value
					}, null, 8, ["account", "company"])) : y.value === "statements" ? (f(), i(Xn, {
						key: 2,
						account: u.value,
						company: C.value
					}, null, 8, ["account", "company"])) : (f(), i(at, {
						key: 3,
						account: u.value
					}, null, 8, ["account"]))], 64))
				])]),
				_: 1
			}));
		}
	});
})), rr = /* @__PURE__ */ re({ default: () => ir }), ir, ar = K((() => {
	nr(), nr(), ir = tr;
}));
ve(), se(), pe();
var or = (e, t) => {
	ae(e), t.subscriptions.push(he(), e.views.register({
		id: "saldeo",
		label: "Saldeo",
		surface: "rail",
		detect: (e, t) => de(t).map((e) => ({
			key: e.id,
			title: de(t).length > 1 ? `Saldeo · ${e.id}` : "Saldeo",
			icon: "credit-card",
			props: { account: e.id }
		})),
		badge: (e) => {
			let t = typeof e.props?.account == "string" ? e.props.account : e.key, n = ge(t);
			return n > 0 ? {
				count: n,
				tone: "info",
				tooltip: `${n} payment${n === 1 ? "" : "s"} waiting for your decision`
			} : void 0;
		},
		view: async () => (await Promise.resolve().then(() => (ar(), rr))).default
	}));
};
//#endregion
export { or as activate };
