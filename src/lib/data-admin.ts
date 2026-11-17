// Painel do administrador da rede, com as mesmas consultas e regras das telas e ações do site
// (src/app/(app)/admin e lib/notifications.ts, loadAdminAlerts). O administrador lê e grava direto no
// banco (as regras por linha liberam tudo para ele); criar unidade e mudar a cobrança passam pela rota
// do site (api/app/admin), que usa as mesmas regras do site.
import type { Alert } from "./alert";
import { cached, check } from "./data";
import { daysBetween, formatDate, isIsoDate, today } from "./dates";
import { isNetworkError } from "./queue.ts";
import { callSite } from "./site-api";
import { brl, dueText, firstOfMonth, isPaymentMethod, monthLabel, situation } from "./site/billing";
import { NETWORK_SUPPLIER } from "./site/network";
import type { Announcement, CatalogProduct, Payment, PaymentMethod, Plan, Store } from "./site/types";
import { supabase } from "./supabase";

const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";
const fail = (error: { message: string; code?: string }, text: string) => (isNetworkError(error) ? OFFLINE : text);
async function run(fn: () => Promise<string | null>): Promise<string | null> {
  try {
    return await fn();
  } catch {
    return OFFLINE;
  }
}

/** Garante as cobranças dos planos até o mês atual (a função do banco nunca duplica). */
const ensureCharges = () => supabase.rpc("generate_due_charges");

// ---------------- Notificações do administrador ----------------

export async function computeAdminAlerts(): Promise<Alert[]> {
  await ensureCharges();
  const now = today();
  const [storeRes, payRes, invRes, leadRes] = await Promise.all([
    supabase.from("stores").select("*").order("name"),
    supabase.from("payments").select("id, store_id, reference_month, description, amount, due_date, status").eq("status", "pendente").order("due_date"),
    supabase.from("inventories").select("store_id, counted_on").eq("status", "closed").order("counted_on", { ascending: false }).limit(1000),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("handled", false),
  ]);
  const stores = (check(storeRes) ?? []) as Store[];
  const byId = new Map(stores.map((s) => [s.id, s]));
  const alerts: Alert[] = [];
  const leads = leadRes.count ?? 0;
  if (leads > 0) {
    alerts.push({
      id: "leads-open",
      tone: "warn",
      title: leads === 1 ? "1 pedido de demonstração para responder" : `${leads} pedidos de demonstração para responder`,
      text: "Veio da página de apresentação do sistema.",
      href: "/admin/contatos",
    });
  }
  for (const p of (check(payRes) ?? []) as Payment[]) {
    const s = situation(p, now);
    if (s !== "atrasado" && s !== "vence_logo") continue;
    const store = byId.get(p.store_id);
    alerts.push({
      id: `pay-${p.id}`,
      tone: s === "atrasado" ? "danger" : "warn",
      title: `${store?.name ?? "Unidade"}: ${p.description.toLowerCase()} de ${monthLabel(p.reference_month)} ${s === "atrasado" ? "em atraso" : "perto de vencer"}`,
      text: `${brl.format(Number(p.amount))}, ${dueText(p.due_date, now)}.`,
      href: `/admin/lojas/${p.store_id}`,
    });
  }
  const lastCount = new Map<string, string>();
  for (const inv of (check(invRes) ?? []) as { store_id: string; counted_on: string }[]) {
    if (!lastCount.has(inv.store_id)) lastCount.set(inv.store_id, inv.counted_on);
  }
  for (const s of stores) {
    if (!s.active) {
      alerts.push({ id: `blocked-${s.id}`, tone: "info", title: `${s.name} está bloqueada`, text: s.blocked_reason ? `Motivo: ${s.blocked_reason}` : undefined, href: `/admin/lojas/${s.id}` });
      continue;
    }
    if (!s.billing_active) {
      alerts.push({
        id: `nobilling-${s.id}`,
        tone: "warn",
        title: `${s.name} está sem cobrança`,
        text: "A unidade entra no sistema, mas o plano não gera cobrança.",
        href: `/admin/lojas/${s.id}?aba=plano`,
      });
    }
    const last = lastCount.get(s.id);
    const since = daysBetween(last ?? s.created_at.slice(0, 10), now);
    if (since > s.count_interval_days * 2) {
      alerts.push({
        id: `nocount-${s.id}`,
        tone: "warn",
        title: `${s.name} está sem contar o estoque`,
        text: last ? `Última contagem em ${formatDate(last)}, há ${since} dias.` : `Nenhuma contagem em ${since} dias.`,
        href: `/admin/lojas/${s.id}`,
      });
    }
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => order[a.tone] - order[b.tone]);
}

export const loadAdminAlerts = () => cached("beststock:admin:alertas", computeAdminAlerts);

// ---------------- Visão geral ----------------

export type PaymentRow = Payment & { storeName?: string };

export async function loadPanel() {
  return cached("beststock:admin:painel", async () => {
    const alerts = await computeAdminAlerts();
    const [storeRes, openRes, paidRes] = await Promise.all([
      supabase.from("stores").select("id, name, active, billing_active"),
      supabase.from("payments").select("*").eq("status", "pendente"),
      supabase.from("payments").select("*").eq("status", "pago").order("paid_on", { ascending: false }).limit(200),
    ]);
    return {
      stores: (check(storeRes) ?? []) as Pick<Store, "id" | "name" | "active" | "billing_active">[],
      open: (check(openRes) ?? []) as Payment[],
      paid: (check(paidRes) ?? []) as Payment[],
      alerts,
    };
  });
}

// ---------------- Unidades ----------------

export async function loadStores() {
  return cached("beststock:admin:lojas", async () => {
    await ensureCharges();
    const [storeRes, payRes, planRes] = await Promise.all([
      supabase.from("stores").select("*").order("name"),
      supabase.from("payments").select("store_id, amount, due_date, status").eq("status", "pendente"),
      supabase.from("plans").select("*"),
    ]);
    return {
      stores: (check(storeRes) ?? []) as Store[],
      pending: (check(payRes) ?? []) as Pick<Payment, "store_id" | "amount" | "due_date" | "status">[],
      plans: (check(planRes) ?? []) as Plan[],
    };
  });
}

export type StoreLogin = { id: string; name: string; email: string; access: "gerente" | "funcionario" };
export type StoreDetail = {
  store: Store;
  logins: StoreLogin[];
  products: number;
  lastCount: string | null;
  payments: Payment[];
  plans: Plan[];
  notes: string;
};

export async function loadStore(id: string) {
  return cached(`beststock:admin:loja:${id}`, async (): Promise<StoreDetail> => {
    await ensureCharges();
    const [storeRes, loginRes, productsRes, lastInvRes, payRes, planRes, notesRes] = await Promise.all([
      supabase.from("stores").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("id, name, email, access").eq("store_id", id).order("created_at"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", id).eq("active", true),
      supabase.from("inventories").select("counted_on").eq("store_id", id).eq("status", "closed").order("counted_on", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("payments").select("*").eq("store_id", id).order("due_date", { ascending: false }).limit(60),
      supabase.from("plans").select("*").order("price"),
      supabase.from("store_admin_notes").select("notes").eq("store_id", id).maybeSingle(),
    ]);
    const store = check(storeRes) as Store | null;
    if (!store) throw new Error("Unidade não encontrada.");
    return {
      store,
      logins: (check(loginRes) ?? []) as StoreLogin[],
      products: productsRes.count ?? 0,
      lastCount: (lastInvRes.data?.counted_on as string | undefined) ?? null,
      payments: (check(payRes) ?? []) as Payment[],
      plans: (check(planRes) ?? []) as Plan[],
      notes: String((notesRes.data?.notes as string | undefined) ?? ""),
    };
  });
}

/** Planos que a unidade pode escolher: os ativos e o que ela já usa, mesmo desativado (igual ao site). */
export const plansFor = (plans: Plan[], store?: Pick<Store, "plan_id"> | null) => plans.filter((p) => p.active || p.id === store?.plan_id);

export type StoreFields = {
  name: string;
  city: string;
  address: string;
  document: string;
  count_interval_days: string;
  owner_name: string;
  phone: string;
  notes: string;
};

/** Dados cadastrais (igual a storeData do site). */
export function storeRow(f: StoreFields) {
  const name = f.name.trim();
  const days = Number(f.count_interval_days.trim() || "7");
  if (!name) return { error: "Informe o nome da unidade." } as const;
  if (!Number.isInteger(days) || days < 1 || days > 90) return { error: "O período de contagem deve ficar entre 1 e 90 dias." } as const;
  return {
    row: {
      name,
      city: f.city.trim(),
      address: f.address.trim(),
      document: f.document.trim(),
      count_interval_days: days,
      owner_name: f.owner_name.trim(),
      phone: f.phone.trim(),
    },
    notes: f.notes.trim(),
  } as const;
}

export async function updateStoreData(id: string, f: StoreFields): Promise<string | null> {
  const data = storeRow(f);
  if ("error" in data) return data.error ?? "Confira os dados.";
  return run(async () => {
    const { error } = await supabase.from("stores").update(data.row).eq("id", id);
    if (error) return fail(error, "Não foi possível salvar o cadastro.");
    const { error: notesError } = await supabase.from("store_admin_notes").upsert({ store_id: id, notes: data.notes }, { onConflict: "store_id" });
    return notesError ? fail(notesError, "O cadastro foi salvo, mas as anotações internas não. Salve de novo.") : null;
  });
}

export async function blockStore(id: string, reason: string, pauseBilling: boolean): Promise<string | null> {
  if (!reason.trim()) return "Informe o motivo do bloqueio.";
  return run(async () => {
    const { error } = await supabase
      .from("stores")
      .update({ active: false, blocked_at: new Date().toISOString(), blocked_reason: reason.trim(), ...(pauseBilling ? { billing_active: false } : {}) })
      .eq("id", id);
    return error ? fail(error, "Não foi possível bloquear a unidade.") : null;
  });
}

export async function unblockStore(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("stores").update({ active: true, blocked_at: null, blocked_reason: "" }).eq("id", id);
    return error ? fail(error, "Não foi possível reativar a unidade.") : null;
  });
}

/** Campos da cobrança da unidade, com os nomes do formulário do site. */
export type BillingInput = { billing_active: boolean; plan_id: string; due_day: number; payment_method: PaymentMethod; billing_start: string };

/** Cria a unidade pelo site (o login dela precisa da chave secreta). */
export async function createStore(f: StoreFields & BillingInput & { email: string; password: string; copy_catalog: boolean }) {
  return callSite<{ id: string }>("/api/app/admin", { body: { action: "create_store", ...f, due_day: String(f.due_day) } });
}

/** Liga, ajusta ou pausa a cobrança pelo site, com a mesma regra de datas do site. */
export async function updateBilling(id: string, f: BillingInput) {
  return callSite<{ ok?: string }>("/api/app/admin", { body: { action: "update_billing", id, ...f, due_day: String(f.due_day) } });
}

// ---------------- Cobranças ----------------

export async function loadBilling() {
  return cached("beststock:admin:cobrancas", async () => {
    await ensureCharges();
    const [payRes, storeRes, planRes, settingsRes] = await Promise.all([
      supabase.from("payments").select("*").order("due_date", { ascending: false }).limit(500),
      supabase.from("stores").select("id, name, billing_active, billing_start, due_day, plan_id").order("name"),
      supabase.from("plans").select("*"),
      supabase.from("billing_settings").select("pix_key, instructions").maybeSingle(),
    ]);
    const stores = (check(storeRes) ?? []) as Pick<Store, "id" | "name" | "billing_active" | "billing_start" | "due_day" | "plan_id">[];
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return {
      payments: ((check(payRes) ?? []) as Payment[]).map((p): PaymentRow => ({ ...p, storeName: names.get(p.store_id) })),
      stores,
      plans: (check(planRes) ?? []) as Plan[],
      settings: (settingsRes.data ?? { pix_key: "", instructions: "" }) as { pix_key: string | null; instructions: string | null },
    };
  });
}

export async function createPayment(f: { store_id: string; description: string; reference_month: string; amount: string; due_date: string }): Promise<string | null> {
  const amount = Number(f.amount.replace(/\s/g, "").replace(",", ".") || "x");
  const description = f.description.trim() || "Cobrança avulsa";
  if (!f.store_id) return "Escolha a unidade.";
  if (!/^\d{4}-\d{2}$/.test(f.reference_month)) return "Informe o mês de referência.";
  if (!isIsoDate(f.due_date)) return "Informe a data de vencimento.";
  if (!Number.isFinite(amount) || amount <= 0) return "Informe um valor maior que zero.";
  return run(async () => {
    const { error } = await supabase
      .from("payments")
      .insert({ store_id: f.store_id, reference_month: firstOfMonth(f.reference_month), description, amount, due_date: f.due_date });
    if (error?.code === "23505") return `Já existe uma cobrança "${description}" para essa unidade nesse mês.`;
    return error ? fail(error, "Não foi possível criar a cobrança.") : null;
  });
}

export async function markPaid(id: string, paidOn: string, method: string, note: string): Promise<string | null> {
  if (!isIsoDate(paidOn)) return "Informe a data do pagamento.";
  if (paidOn > today()) return "A data do pagamento não pode estar no futuro.";
  if (!isPaymentMethod(method)) return "Escolha a forma de pagamento.";
  return run(async () => {
    const { error } = await supabase.from("payments").update({ status: "pago", paid_on: paidOn, method, note: note.trim() }).eq("id", id);
    return error ? fail(error, "Não foi possível registrar o pagamento.") : null;
  });
}

export async function reopenPayment(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("payments").update({ status: "pendente", paid_on: null, method: null }).eq("id", id);
    return error ? fail(error, "Não foi possível desfazer.") : null;
  });
}

export async function cancelPayment(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("payments").update({ status: "cancelado", paid_on: null, method: null }).eq("id", id).eq("status", "pendente");
    return error ? fail(error, "Não foi possível cancelar.") : null;
  });
}

export async function saveBillingSettings(pixKey: string, instructions: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase
      .from("billing_settings")
      .update({ pix_key: pixKey.trim(), instructions: instructions.trim(), updated_at: new Date().toISOString() })
      .eq("id", true);
    return error ? fail(error, "Não foi possível salvar.") : null;
  });
}

// ---------------- Planos ----------------

export async function loadPlans() {
  return cached("beststock:admin:planos", async () => {
    const [planRes, storeRes] = await Promise.all([
      supabase.from("plans").select("*").order("active", { ascending: false }).order("price"),
      supabase.from("stores").select("plan_id"),
    ]);
    const units: Record<string, number> = {};
    for (const s of (check(storeRes) ?? []) as { plan_id: string | null }[]) if (s.plan_id) units[s.plan_id] = (units[s.plan_id] ?? 0) + 1;
    return { plans: (check(planRes) ?? []) as Plan[], units };
  });
}

export async function savePlan(id: string | null, f: { name: string; price: string; duration_months: number; description: string; active: boolean }): Promise<string | null> {
  const name = f.name.trim();
  const price = Number(f.price.replace(/\s/g, "").replace(",", ".") || "x");
  const months = f.duration_months;
  if (!name) return "Informe o nome do plano.";
  if (!Number.isFinite(price) || price <= 0) return "Informe o valor do plano, maior que zero.";
  if (months < 1 || months > 36) return "A duração deve ficar entre 1 e 36 meses.";
  const row = { name, description: f.description.trim(), price, active: f.active };
  return run(async () => {
    if (!id) {
      const { error } = await supabase.from("plans").insert({ ...row, duration_months: months });
      return error ? fail(error, "Não foi possível criar o plano.") : null;
    }
    const [current, units] = await Promise.all([
      supabase.from("plans").select("duration_months").eq("id", id).maybeSingle(),
      supabase.from("stores").select("id", { count: "exact", head: true }).eq("plan_id", id),
    ]);
    if (!current.data) return "Plano não encontrado.";
    // Mudar o ciclo de quem já está sendo cobrado criaria cobranças fora de hora.
    if (months !== current.data.duration_months && (units.count ?? 0) > 0) {
      return "A duração não muda enquanto houver unidade neste plano. Crie outro plano com a nova duração.";
    }
    const { error } = await supabase.from("plans").update({ ...row, duration_months: months }).eq("id", id);
    return error ? fail(error, "Não foi possível salvar o plano.") : null;
  });
}

export async function deletePlan(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error?.code === "23503") return "Há unidades neste plano. Troque o plano delas ou desative este plano em vez de excluir.";
    return error ? fail(error, "Não foi possível excluir o plano.") : null;
  });
}

// ---------------- Lista padrão ----------------

export async function loadCatalog() {
  return cached("beststock:admin:catalogo", async () => {
    const res = await supabase.from("catalog_products").select("*").order("category").order("name");
    return (check(res) ?? []) as CatalogProduct[];
  });
}

export type CatalogRow = {
  name: string;
  category: string;
  storage: "gelado" | "seco";
  count_unit: string;
  purchase_unit: string;
  units_per_purchase: number;
  shelf_life_days: number | null;
  cost_per_purchase: number;
};

export async function saveCatalogProduct(id: string | null, row: CatalogRow, addToStores: boolean): Promise<string | null> {
  if (row.cost_per_purchase < 0) return "O custo não pode ser negativo.";
  return run(async () => {
    if (id) {
      const { error } = await supabase.from("catalog_products").update(row).eq("id", id);
      if (error) return fail(error, "Não foi possível salvar o item.");
      // O custo da rede vale para todas as lojas, menos as que mudaram o custo deste produto.
      const { error: spreadError } = await supabase
        .from("products")
        .update({ cost_per_purchase: row.cost_per_purchase })
        .eq("catalog_product_id", id)
        .eq("custom_cost", false);
      return spreadError ? "O item foi salvo, mas o custo não chegou às lojas. Salve de novo." : null;
    }
    const { data: created, error } = await supabase.from("catalog_products").insert(row).select("id").single();
    if (error || !created) return error ? fail(error, "Não foi possível salvar o item.") : "Não foi possível salvar o item.";
    if (addToStores) {
      const [{ data: stores }, { data: networks }] = await Promise.all([
        supabase.from("stores").select("id"),
        supabase.from("suppliers").select("id, store_id").eq("name", NETWORK_SUPPLIER.name),
      ]);
      const supplierOf = new Map((networks ?? []).map((s) => [s.store_id as string, s.id as string]));
      if (stores?.length) {
        const { error: addError } = await supabase
          .from("products")
          .insert(stores.map((s) => ({ ...row, store_id: s.id, catalog_product_id: created.id, supplier_id: supplierOf.get(s.id) ?? null })));
        if (addError) return "O item entrou na lista padrão, mas não nas lojas. Tente adicionar de novo pela loja.";
      }
    }
    return null;
  });
}

export async function deleteCatalogProduct(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("catalog_products").delete().eq("id", id);
    return error ? fail(error, "Não foi possível excluir o item.") : null;
  });
}

// ---------------- Avisos ----------------

export async function loadAnnouncements() {
  return cached("beststock:admin:avisos", async () => {
    const [annRes, storeRes, readRes] = await Promise.all([
      supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("stores").select("id, name, active").order("name"),
      supabase.from("announcement_reads").select("announcement_id"),
    ]);
    const reads: Record<string, number> = {};
    for (const r of (check(readRes) ?? []) as { announcement_id: string }[]) reads[r.announcement_id] = (reads[r.announcement_id] ?? 0) + 1;
    return {
      announcements: (check(annRes) ?? []) as Announcement[],
      stores: (check(storeRes) ?? []) as { id: string; name: string; active: boolean }[],
      reads,
    };
  });
}

export async function sendAnnouncement(f: { store_id: string; title: string; body: string; important: boolean }): Promise<string | null> {
  if (!f.title.trim()) return "Escreva o título do aviso.";
  return run(async () => {
    const { error } = await supabase
      .from("announcements")
      .insert({ store_id: f.store_id || null, title: f.title.trim(), body: f.body.trim(), level: f.important ? "warn" : "info" });
    return error ? fail(error, "Não foi possível enviar o aviso.") : null;
  });
}

export async function deleteAnnouncement(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    return error ? fail(error, "Não foi possível apagar o aviso.") : null;
  });
}

// ---------------- Contatos ----------------

export type Lead = {
  id: string;
  name: string;
  store_name: string;
  city: string;
  phone: string;
  stores_count: string;
  message: string;
  handled: boolean;
  created_at: string;
};

export async function loadLeads() {
  return cached("beststock:admin:contatos", async () => {
    const res = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(300);
    return (check(res) ?? []) as Lead[];
  });
}

export async function setLeadHandled(id: string, handled: boolean): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("leads").update({ handled }).eq("id", id);
    return error ? fail(error, "Não foi possível salvar.") : null;
  });
}

export async function deleteLead(id: string): Promise<string | null> {
  return run(async () => {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    return error ? fail(error, "Não foi possível apagar.") : null;
  });
}

// ---------------- Logins de uma unidade (pela rota do site, com a chave secreta) ----------------

export async function addStoreLogin(storeId: string, f: { name: string; email: string; password: string; access: string }) {
  return callSite<{ ok?: string }>("/api/app/logins", { body: { action: "add", store_id: storeId, ...f } });
}
export async function updateStoreLogin(storeId: string, f: { id: string; name: string; access: string; password: string }) {
  return callSite<{ ok?: string }>("/api/app/logins", { body: { action: "update", store_id: storeId, ...f } });
}
export async function removeStoreLogin(storeId: string, id: string) {
  return callSite<{ ok?: string }>("/api/app/logins", { body: { action: "remove", store_id: storeId, id } });
}
