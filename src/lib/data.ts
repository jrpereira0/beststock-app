// Leitura e gravação no banco, com as mesmas regras das ações do site.
// Toda consulta leva a loja do login; a regra por linha do banco confere de novo.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { maxPossibleFrom, parseQty, toField, validStockout, type CountProduct } from "./count-rules.ts";
import { daysBetween, formatDate, isIsoDate, nextCount, today } from "./dates.ts";
import type { Profile } from "./auth";
import { dueOutstanding, type Kind, type MovementItem, type MovementProduct } from "./movements.ts";
import { isNetworkError, type SendResult } from "./queue.ts";
import { supabase } from "./supabase";

export class Offline extends Error {
  constructor() {
    super("Sem internet.");
  }
}

/** Erro de rede vira Offline (a tela mostra o que está guardado); recusa do banco segue como erro. */
export function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (isNetworkError(res.error)) throw new Offline();
    throw new Error(res.error.message);
  }
  return res.data;
}

export async function cached<T>(key: string, load: () => Promise<T>): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await load();
    await AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => undefined);
    return { data, fromCache: false };
  } catch (e) {
    if (!(e instanceof Offline) && !(e instanceof TypeError)) throw e;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) throw new Offline();
    return { data: JSON.parse(raw) as T, fromCache: true };
  }
}

// ---------------- Início ----------------

export type Alert = { id: string; tone: "danger" | "warn" | "info"; title: string; text?: string; announcementId?: string };
export type Home = {
  draft: { id: string; counted_on: string } | null;
  lastClosedOn: string | null;
  dueText: string | null;
  dueNow: boolean;
  overdue: boolean;
  productCount: number;
  alerts: Alert[];
};

export async function loadHome(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:inicio:${profile.store.id}:${profile.id}`, async (): Promise<Home> => {
    const now = today();
    const manager = profile.access === "gerente";
    const [inv, products, ann, reads, late] = await Promise.all([
      supabase.from("inventories").select("id, counted_on, status").eq("store_id", storeId).order("counted_on", { ascending: false }).limit(10),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("active", true),
      supabase.from("announcements").select("id, title, body, level, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("announcement_reads").select("announcement_id").eq("profile_id", profile.id),
      manager
        ? supabase.from("purchase_orders").select("id, expected_on, storage").eq("store_id", storeId).eq("status", "open").lt("expected_on", now)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const inventories = check(inv) ?? [];
    if (products.error && isNetworkError(products.error)) throw new Offline();
    const draft = inventories.find((i) => i.status === "draft") ?? null;
    const lastClosed = inventories.find((i) => i.status === "closed") ?? null;
    const due = nextCount(lastClosed?.counted_on ?? null, profile.store.count_interval_days, now);

    const alerts: Alert[] = [];
    if (draft && daysBetween(draft.counted_on, now) >= 2) {
      alerts.push({
        id: `draft-${draft.id}`,
        tone: "warn",
        title: "Contagem aberta sem fechar",
        text: `A contagem de ${formatDate(draft.counted_on)} ainda não foi fechada.`,
      });
    }
    for (const o of (late.data ?? []) as { id: string; expected_on: string; storage: string }[]) {
      alerts.push({
        id: `order-${o.id}`,
        tone: "warn",
        title: `Pedido de ${o.storage === "seco" ? "secos" : "gelados"} previsto para ${formatDate(o.expected_on)} ainda não chegou`,
        text: "Quando chegar, lance a entrada. Os pedidos ficam no site, em Compras.",
      });
    }
    const read = new Set(((reads.data ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
    for (const a of (ann.data ?? []) as { id: string; title: string; body: string; level: string }[]) {
      if (read.has(a.id)) continue;
      alerts.push({ id: `ann-${a.id}`, tone: a.level === "warn" ? "warn" : "info", title: a.title, text: a.body || undefined, announcementId: a.id });
    }
    return {
      draft: draft ? { id: draft.id as string, counted_on: draft.counted_on as string } : null,
      lastClosedOn: (lastClosed?.counted_on as string | undefined) ?? null,
      dueText: due?.text ?? null,
      dueNow: Boolean(due && (due.dueToday || due.overdue)),
      overdue: Boolean(due?.overdue),
      productCount: products.count ?? 0,
      alerts,
    };
  });
}

export async function markAnnouncementRead(profileId: string, announcementId: string) {
  const { error } = await supabase
    .from("announcement_reads")
    .upsert({ announcement_id: announcementId, profile_id: profileId }, { onConflict: "announcement_id,profile_id", ignoreDuplicates: true });
  if (error) throw isNetworkError(error) ? new Offline() : new Error(error.message);
}

// ---------------- Contagem ----------------

/** Abre a contagem do dia escolhido (hoje, se nada for dito). Se já houver uma em andamento, devolve ela. */
export async function openTodayCount(profile: Profile, date: string = today()): Promise<{ id: string } | { error: string }> {
  if (!isIsoDate(date)) return { error: "Informe a data da contagem." };
  if (date > today()) return { error: "A data da contagem não pode estar no futuro." };
  const storeId = profile.store.id;
  const existing = await supabase.from("inventories").select("id").eq("store_id", storeId).eq("status", "draft").maybeSingle();
  if (existing.error && isNetworkError(existing.error)) return { error: "Sem internet. Para abrir uma contagem nova, conecte o celular. Depois dá para contar sem internet." };
  if (existing.data) return { id: existing.data.id as string };
  const { data, error } = await supabase
    .from("inventories")
    .insert({ store_id: storeId, counted_on: date, created_by: profile.id })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: "Já existe um inventário nessa data ou uma contagem em andamento." };
  if (error && isNetworkError(error)) return { error: "Sem internet. Para abrir uma contagem nova, conecte o celular. Depois dá para contar sem internet." };
  if (error || !data) return { error: "Não foi possível iniciar o inventário." };
  return { id: data.id as string };
}

export type CountData = {
  inventory: { id: string; counted_on: string; status: "draft" | "closed" };
  products: CountProduct[];
  /** Texto de cada campo como veio do banco ("" = não contado). */
  initial: Record<string, string>;
  stockouts: Record<string, string>;
  previous: Record<string, number>;
  previousOn: string | null;
  maxPossible: Record<string, number>;
  lastEntrada: Record<string, string>;
  arrivedBefore: { name: string; from: string | null }[];
  arrivedAfter: { name: string; from: string | null }[];
};

/** Tudo que a tela de contagem precisa, guardado no aparelho para abrir sem internet. */
export async function loadCount(profile: Profile, inventoryId: string) {
  const storeId = profile.store.id;
  return cached(`beststock:dados-contagem:${inventoryId}`, async (): Promise<CountData> => {
    const inv = check(await supabase.from("inventories").select("id, counted_on, status").eq("id", inventoryId).eq("store_id", storeId).maybeSingle());
    if (!inv) throw new Error("Contagem não encontrada.");
    const countedOn = inv.counted_on as string;
    const [productsRes, itemsRes, prevRes, sameDayRes] = await Promise.all([
      supabase.from("products").select("id, name, category, count_unit, active, position").eq("store_id", storeId).order("category").order("name"),
      supabase.from("inventory_items").select("product_id, quantity, stockout_on").eq("inventory_id", inventoryId),
      supabase
        .from("inventories")
        .select("id, counted_on")
        .eq("store_id", storeId)
        .eq("status", "closed")
        .lt("counted_on", countedOn)
        .order("counted_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("movements")
        .select("product_id, after_count, transfer_id, transfers(from_store_id)")
        .eq("store_id", storeId)
        .eq("kind", "entrada")
        .eq("moved_on", countedOn),
    ]);
    const products = (check(productsRes) ?? []) as (CountProduct & { active: boolean })[];
    const items = (check(itemsRes) ?? []) as { product_id: string; quantity: number; stockout_on: string | null }[];
    const prev = check(prevRes) as { id: string; counted_on: string } | null;
    const sameDay = (check(sameDayRes) ?? []) as unknown as {
      product_id: string;
      after_count: boolean | null;
      transfers: { from_store_id: string } | { from_store_id: string }[] | null;
    }[];
    // Entrada que veio de transferência: o aviso diz de qual loja, para não parecer compra.
    const fromIds = [...new Set(sameDay.flatMap((m) => (Array.isArray(m.transfers) ? m.transfers[0] : m.transfers)?.from_store_id ?? []))];
    const fromNames = new Map<string, string>();
    if (fromIds.length) {
      for (const s of (check(await supabase.from("stores").select("id, name").in("id", fromIds)) ?? []) as { id: string; name: string }[]) fromNames.set(s.id, s.name);
    }
    const arrival = (m: (typeof sameDay)[number]) => {
      const t = Array.isArray(m.transfers) ? m.transfers[0] : m.transfers;
      return { name: m.product_id, from: t ? (fromNames.get(t.from_store_id) ?? "outra loja") : null };
    };

    const initial: Record<string, string> = {};
    const stockouts: Record<string, string> = {};
    for (const it of items) {
      initial[it.product_id] = toField(Number(it.quantity));
      if (it.stockout_on) stockouts[it.product_id] = it.stockout_on;
    }
    const previous: Record<string, number> = {};
    let maxPossible: Record<string, number> = {};
    let lastEntrada: Record<string, string> = {};
    if (prev) {
      const [prevItems, moves] = await Promise.all([
        supabase.from("inventory_items").select("product_id, quantity").eq("inventory_id", prev.id),
        supabase
          .from("movements")
          .select("product_id, kind, moved_on, quantity, after_count")
          .eq("store_id", storeId)
          .gt("moved_on", prev.counted_on)
          .lte("moved_on", countedOn)
          .limit(5000),
      ]);
      for (const it of (check(prevItems) ?? []) as { product_id: string; quantity: number }[]) previous[it.product_id] = Number(it.quantity);
      ({ maxPossible, lastEntrada } = maxPossibleFrom(previous, (check(moves) ?? []) as never[], countedOn));
    }
    const names = new Map(products.map((p) => [p.id, p.name]));
    const counted = new Set(items.map((i) => i.product_id));
    return {
      inventory: { id: inv.id as string, counted_on: countedOn, status: inv.status as "draft" | "closed" },
      // Na contagem entram os produtos ativos e os inativos que já foram contados nela.
      products: products.filter((p) => p.active || counted.has(p.id)).map(({ active: _a, ...p }) => p),
      initial,
      stockouts,
      previous,
      previousOn: prev?.counted_on ?? null,
      maxPossible,
      lastEntrada,
      arrivedBefore: sameDay.filter((m) => !m.after_count).map((m) => ({ ...arrival(m), name: names.get(m.product_id) ?? "Produto" })),
      arrivedAfter: sameDay.filter((m) => m.after_count).map((m) => ({ ...arrival(m), name: names.get(m.product_id) ?? "Produto" })),
    };
  });
}

/** O mesmo que saveCount do site. Texto vazio apaga a contagem (produto volta a "não contado"). */
export async function saveCount(
  profile: Profile,
  data: Pick<CountData, "inventory" | "previousOn">,
  productId: string,
  raw: string,
  stockoutOn: string | null,
): Promise<SendResult> {
  const storeId = profile.store.id;
  const inventoryId = data.inventory.id;
  const quantity = parseQty(raw);
  const closed = "Não foi possível salvar. O inventário já foi fechado?";
  try {
    if (quantity === null) {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("inventory_id", inventoryId)
        .eq("product_id", productId)
        .eq("store_id", storeId);
      if (error) return isNetworkError(error) ? { ok: false, offline: true } : { ok: false, error: "Não foi possível salvar." };
      return { ok: true };
    }
    if (Number.isNaN(quantity)) return { ok: false, error: "Número inválido." };
    let stockout: string | null = null;
    if (quantity === 0 && stockoutOn) {
      if (!isIsoDate(stockoutOn) || !validStockout(stockoutOn, data.previousOn, data.inventory.counted_on)) {
        return { ok: false, error: "O dia em que acabou precisa estar entre a contagem anterior e esta." };
      }
      stockout = stockoutOn;
    }
    // A regra do banco só aceita gravar em contagem em andamento: contagem fechada devolve erro.
    const { error } = await supabase.from("inventory_items").upsert(
      {
        inventory_id: inventoryId,
        store_id: storeId,
        product_id: productId,
        quantity,
        stockout_on: stockout,
        updated_at: new Date().toISOString(),
        counted_by: profile.id,
      },
      { onConflict: "inventory_id,product_id" },
    );
    if (error) return isNetworkError(error) ? { ok: false, offline: true } : { ok: false, error: closed };
    return { ok: true };
  } catch {
    return { ok: false, offline: true };
  }
}

/** Marca como zero os produtos ativos que ficaram em branco (igual ao site). Devolve os marcados. */
export async function fillMissingWithZero(profile: Profile, inventoryId: string): Promise<{ ids?: string[]; error?: string }> {
  const storeId = profile.store.id;
  try {
    const { data: inv, error: invError } = await supabase
      .from("inventories")
      .select("id")
      .eq("id", inventoryId)
      .eq("store_id", storeId)
      .eq("status", "draft")
      .maybeSingle();
    if (invError) return { error: "Sem conexão. Tente de novo com internet." };
    if (!inv) return { error: "Esta contagem já foi fechada." };
    const [{ data: products }, { data: items }] = await Promise.all([
      supabase.from("products").select("id").eq("store_id", storeId).eq("active", true),
      supabase.from("inventory_items").select("product_id").eq("inventory_id", inventoryId).eq("store_id", storeId),
    ]);
    const counted = new Set((items ?? []).map((i) => i.product_id as string));
    const ids = (products ?? []).map((p) => p.id as string).filter((id) => !counted.has(id));
    if (ids.length === 0) return { ids: [] };
    const now = new Date().toISOString();
    const { error } = await supabase.from("inventory_items").insert(
      ids.map((product_id) => ({ inventory_id: inventoryId, store_id: storeId, product_id, quantity: 0, updated_at: now, counted_by: profile.id })),
    );
    return error ? { error: "Não foi possível marcar como zero. Tente de novo." } : { ids };
  } catch {
    return { error: "Sem conexão. Tente de novo com internet." };
  }
}

export async function closeInventory(profile: Profile, inventoryId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("inventories")
      .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: profile.id })
      .eq("id", inventoryId)
      .eq("store_id", profile.store.id)
      .eq("status", "draft")
      .select("id");
    if (error) return isNetworkError(error) ? "Sem internet. Conecte o celular para fechar." : "Não foi possível fechar a contagem.";
    if (!data?.length) return "Esta contagem já foi fechada.";
    await AsyncStorage.removeItem(`beststock:dados-contagem:${inventoryId}`).catch(() => undefined);
    return null;
  } catch {
    return "Sem internet. Conecte o celular para fechar.";
  }
}

export async function discardInventory(profile: Profile, inventoryId: string): Promise<string | null> {
  try {
    const { error } = await supabase
      .from("inventories")
      .delete()
      .eq("id", inventoryId)
      .eq("store_id", profile.store.id)
      .eq("status", "draft");
    if (error) return isNetworkError(error) ? "Sem internet. Conecte o celular para descartar." : "Não foi possível descartar.";
    await AsyncStorage.removeItem(`beststock:dados-contagem:${inventoryId}`).catch(() => undefined);
    return null;
  } catch {
    return "Sem internet. Conecte o celular para descartar.";
  }
}

// ---------------- Entrada e perda ----------------

export type MovementForm = {
  products: MovementProduct[];
  /** Unidades de contagem ainda a caminho dos pedidos que já deviam ter chegado, por produto. */
  outstanding: Record<string, number>;
  /** Dias que têm contagem (para o aviso na entrada). */
  countDates: string[];
};

export async function loadMovementForm(profile: Profile, kind: Kind) {
  const storeId = profile.store.id;
  return cached(`beststock:lancar:${kind}:${storeId}`, async (): Promise<MovementForm> => {
    const [productsRes, countsRes, ordersRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, category, count_unit, purchase_unit, units_per_purchase, position")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("category")
        .order("name"),
      supabase.from("inventories").select("counted_on").eq("store_id", storeId),
      kind === "entrada"
        ? supabase.from("purchase_orders").select("id, expected_on").eq("store_id", storeId).eq("status", "open").order("expected_on").order("ordered_on")
        : Promise.resolve({ data: [] as { id: string; expected_on: string }[], error: null }),
    ]);
    const products = (check(productsRes) ?? []) as MovementProduct[];
    const countDates = ((check(countsRes) ?? []) as { counted_on: string }[]).map((c) => c.counted_on);
    const orders = (check(ordersRes) ?? []) as { id: string; expected_on: string }[];
    const outstanding: Record<string, number> = {};
    if (orders.length) {
      const rank = new Map(orders.map((o, i) => [o.id, i]));
      const expectedOn = new Map(orders.map((o) => [o.id, o.expected_on]));
      const waiting = (check(
        await supabase
          .from("purchase_order_items")
          .select("order_id, product_id, outstanding_quantity")
          .eq("store_id", storeId)
          .in("order_id", orders.map((o) => o.id))
          .gt("outstanding_quantity", 0),
      ) ?? []) as { order_id: string; product_id: string; outstanding_quantity: number }[];
      const byProduct = new Map<string, { outstanding: number; expectedOn: string }[]>();
      for (const it of [...waiting].sort((a, b) => (rank.get(a.order_id) ?? 0) - (rank.get(b.order_id) ?? 0))) {
        const list = byProduct.get(it.product_id) ?? [];
        list.push({ outstanding: Number(it.outstanding_quantity), expectedOn: expectedOn.get(it.order_id) ?? "" });
        byProduct.set(it.product_id, list);
      }
      const now = today();
      for (const [id, list] of byProduct) outstanding[id] = dueOutstanding(list, now);
    }
    return { products, outstanding, countDates };
  });
}

/** Grava os lançamentos. A entrada passa pela função do banco, que também dá baixa nos pedidos em aberto. */
export async function saveMovements(
  profile: Profile,
  kind: Kind,
  date: string,
  items: MovementItem[],
  products: MovementProduct[],
  invoice: { key: string; number: string; issuer: string; issuedOn: string } | null = null,
): Promise<string | null> {
  const offline = "Sem internet. O lançamento não foi salvo: conecte o celular e toque em salvar de novo.";
  try {
    if (kind === "entrada") {
      // Entrada que veio do XML da nota: a nota fica registrada e não pode ser lançada de novo (igual ao site).
      let invoiceId: string | null = null;
      if (invoice) {
        if (!/^\d{44}$/.test(invoice.key)) return "A chave da nota fiscal está errada. Envie o XML de novo.";
        const { data, error } = await supabase
          .from("imported_invoices")
          .insert({
            store_id: profile.store.id,
            access_key: invoice.key,
            number: invoice.number,
            issuer_name: invoice.issuer,
            issued_on: isIsoDate(invoice.issuedOn) ? invoice.issuedOn : null,
            created_by: profile.id,
          })
          .select("id")
          .single();
        if (error?.code === "23505") return "Esta nota já foi lançada. Veja o histórico de entradas.";
        if (error || !data) return error && isNetworkError(error) ? offline : "Não foi possível registrar a nota fiscal.";
        invoiceId = data.id as string;
      }
      const { error } = await supabase.rpc("register_movements", {
        p_kind: kind,
        p_moved_on: date,
        p_items: items.map((i) => ({ product_id: i.product_id, typed: i.typed, rest: i.rest })),
        p_invoice_id: invoiceId,
      });
      if (!error) return null;
      if (invoiceId) await supabase.from("imported_invoices").delete().eq("id", invoiceId).eq("store_id", profile.store.id);
      if (isNetworkError(error)) return offline;
      return error.code === "P0001" ? error.message : "Não foi possível salvar os lançamentos.";
    }
    const byId = new Map(products.map((p) => [p.id, p]));
    const rows = items
      .filter((i) => byId.has(i.product_id))
      .map((i) => ({
        store_id: profile.store.id,
        product_id: i.product_id,
        kind,
        moved_on: date,
        quantity: i.typed,
        packages: null,
        after_count: null,
        created_by: profile.id,
      }));
    const { error } = await supabase.from("movements").insert(rows);
    if (!error) return null;
    return isNetworkError(error) ? offline : "Não foi possível salvar os lançamentos.";
  } catch {
    return offline;
  }
}

/**
 * Atualiza a cópia da contagem guardada no aparelho depois que um número chega ao banco: quem reabrir a
 * contagem sem internet vê o que já foi salvo, e não o que havia quando a tela foi aberta.
 */
export async function patchCountCache(inventoryId: string, productId: string, value: string, stockout: string | null) {
  const key = `beststock:dados-contagem:${inventoryId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw) as CountData;
    if (value.trim()) data.initial[productId] = value;
    else delete data.initial[productId];
    if (stockout) data.stockouts[productId] = stockout;
    else delete data.stockouts[productId];
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Sem armazenamento: a contagem segue normal, só a cópia fica velha.
  }
}
