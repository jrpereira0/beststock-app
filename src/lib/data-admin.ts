// Painel do administrador da rede, com as mesmas consultas e regras das telas e ações do site
// (src/app/(app)/admin e lib/notifications.ts, loadAdminAlerts). O administrador lê e grava direto no
// banco (as regras por linha liberam tudo para ele); criar unidade e mudar a cobrança passam pela rota
// do site (api/app/admin), que usa as mesmas regras do site.
import type { Alert } from "./alert";
import { buildAdminAlerts, type AdminAlertsResult } from "./site/admin-alerts";
import { selectAll } from "./site/select-all";
import { cached, check } from "./data";
import { isIsoDate, today } from "./dates";
import { isNetworkError } from "./queue.ts";
import { callSite } from "./site-api";
import { firstOfMonth, isPaymentMethod } from "./site/billing";
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

// As cobranças dos planos o banco gera de madrugada (pg_cron); criar unidade e mudar a cobrança geram na hora.
// Contas sobre todas as unidades ficam no banco (admin_summary, admin_store_page, admin_alerts,
// admin_payment_page): a API devolve no máximo 1000 linhas por busca, e a rede pode ter mais unidades.

/** Números da rede, iguais aos do site (admin/painel). */
export type AdminSummary = {
  stores: { total: number; active: number; blocked: number; unbilled: number; overdue: number };
  payments: { open_count: number; open_amount: number; overdue_count: number; overdue_amount: number; paid_month_count: number; paid_month_amount: number };
  plans: Record<string, number>;
  leads_open: number;
};

async function summary(): Promise<AdminSummary> {
  const res = await supabase.rpc("admin_summary");
  return check(res) as AdminSummary;
}

// ---------------- Notificações do administrador ----------------

export async function computeAdminAlerts(): Promise<Alert[]> {
  const [alertRes, leadRes] = await Promise.all([
    supabase.rpc("admin_alerts", { p_limit: 100 }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("handled", false),
  ]);
  return buildAdminAlerts(check(alertRes) as AdminAlertsResult, leadRes.count ?? 0, today());
}

export const loadAdminAlerts = () => cached("beststock:admin:alertas", computeAdminAlerts);

// ---------------- Visão geral ----------------

export type PaymentRow = Payment & { storeName?: string };

export async function loadPanel() {
  return cached("beststock:admin:painel", async () => {
    const [alerts, sm, paidRes] = await Promise.all([
      computeAdminAlerts(),
      summary(),
      supabase.from("payments").select("*, stores(name)").eq("status", "pago").order("paid_on", { ascending: false }).limit(6),
    ]);
    const recent = ((check(paidRes) ?? []) as (Payment & { stores: { name: string } | null })[]).map(
      ({ stores, ...p }): PaymentRow => ({ ...p, storeName: stores?.name }),
    );
    return { summary: sm, recent, alerts };
  });
}

// ---------------- Unidades ----------------

export type StoreFilter = "todas" | "ativas" | "sem-cobranca" | "atraso" | "bloqueadas";
export type StoreListRow = Store & { overdue_amount: number };

/** Uma página da lista de unidades (as primeiras `limit`), com filtro e busca, e os totais de cada filtro. */
export async function loadStores(filter: StoreFilter = "todas", search = "", limit = 50) {
  const q = search.trim().slice(0, 80);
  return cached(`beststock:admin:lojas:${filter}:${q}:${limit}`, async () => {
    const [sm, pageRes, planRes] = await Promise.all([
      summary(),
      supabase.rpc("admin_store_page", { p_filter: filter, p_search: q, p_offset: 0, p_limit: limit }),
      supabase.from("plans").select("*"),
    ]);
    const page = check(pageRes) as { total: number; rows: StoreListRow[] };
    return { counts: sm.stores, total: page.total, stores: page.rows, plans: (check(planRes) ?? []) as Plan[] };
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

export type BillingFilter = "aberto" | "atraso" | "pago" | "cancelado" | "todas";
type Totals = Record<BillingFilter, { count: number; amount: number }>;
export type BillingUnit = Pick<Store, "id" | "name" | "billing_active" | "billing_start" | "due_day" | "plan_id">;

/** Cobranças de um filtro (as primeiras `limit`), os totais de cada situação e as unidades (em partes de 1000). */
export async function loadBilling(filter: BillingFilter = "aberto", month = "", limit = 50) {
  return cached(`beststock:admin:cobrancas:${filter}:${month}:${limit}`, async () => {
    const [payRes, stores, planRes, settingsRes] = await Promise.all([
      supabase.rpc("admin_payment_page", { p_filter: filter, p_month: month ? `${month}-01` : null, p_offset: 0, p_limit: limit }),
      selectAll<BillingUnit>((from, to) =>
        supabase.from("stores").select("id, name, billing_active, billing_start, due_day, plan_id").order("name").order("id").range(from, to),
      ),
      supabase.from("plans").select("*"),
      supabase.from("billing_settings").select("pix_key, instructions").maybeSingle(),
    ]);
    const page = check(payRes) as { total: number; totals: Totals; rows: (Payment & { store_name: string })[] };
    return {
      payments: page.rows.map(({ store_name, ...p }): PaymentRow => ({ ...p, storeName: store_name })),
      total: page.total,
      totals: page.totals,
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
    const [planRes, sm] = await Promise.all([
      supabase.from("plans").select("*").order("active", { ascending: false }).order("price"),
      summary(),
    ]);
    // Unidades em cada plano, contadas no banco.
    return { plans: (check(planRes) ?? []) as Plan[], units: sm.plans ?? {} };
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
      // Numa operação só, com qualquer número de lojas (como no site).
      const { error: addError } = await supabase.rpc("add_catalog_product_to_stores", { p_catalog: created.id, p_supplier_name: NETWORK_SUPPLIER.name });
      if (addError) return "O item entrou na lista padrão, mas não nas lojas. Tente adicionar de novo pela loja.";
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
    const [annRes, stores, sm] = await Promise.all([
      supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100),
      // Todas as unidades para o "Para quem" (em partes de 1000).
      selectAll<{ id: string; name: string; active: boolean }>((from, to) => supabase.from("stores").select("id, name, active").order("name").order("id").range(from, to)),
      summary(),
    ]);
    const announcements = (check(annRes) ?? []) as Announcement[];
    // Quantas unidades leram cada aviso, contado no banco.
    const readRes = announcements.length ? await supabase.rpc("announcement_read_counts", { p_ids: announcements.map((a) => a.id) }) : { data: {}, error: null };
    const reads = (readRes.data ?? {}) as Record<string, number>;
    return { announcements, stores, reads, activeCount: sm.stores.active };
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
