// Lista de compras, pedidos e consumo. O cálculo é o mesmo do site: os dados vêm da função store_plan_data
// do banco e a conta é a de src/lib/site/planning.ts (copiada do site).
import type { Profile } from "./auth";
import { cached, check, Offline } from "./data";
import { addDays, today } from "./dates";
import { isNetworkError } from "./queue.ts";
import { orderDateError } from "./site/order-dates";
import { buildPlan, type PlanInventory, type PlanMovement, type PlanProduct, type PlanSupplier, type StockPlan } from "./site/planning";
import { supabase } from "./supabase";

const HISTORY = 8; // inventários fechados usados no cálculo (igual ao site)
const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";

type PlanData = {
  products: (Omit<PlanProduct, "units_per_purchase" | "cost_per_purchase" | "min_stock"> & {
    units_per_purchase: number | string;
    cost_per_purchase: number | string;
    min_stock: number | string;
  })[];
  suppliers: PlanSupplier[];
  inventories: { counted_on: string; items: { product_id: string; quantity: number | string; stockout_on: string | null }[] }[];
  in_transit: { product_id: string; quantity: number | string; expected_on: string }[];
  movements: (Omit<PlanMovement, "quantity"> & { quantity: number | string })[];
};

/** Carrega os dados da loja e calcula consumo e sugestão de compra (igual a lib/planning-data.ts do site). */
export async function computePlan(storeId: string, countIntervalDays: number): Promise<StockPlan> {
  const { data, error } = await supabase.rpc("store_plan_data", { p_store: storeId, p_history: HISTORY });
  if (error || !data) {
    if (error && isNetworkError(error)) throw new Offline();
    throw new Error("Não foi possível carregar os dados do estoque.");
  }
  const raw = data as PlanData;
  const products: PlanProduct[] = raw.products.map((p) => ({
    ...p,
    units_per_purchase: Number(p.units_per_purchase),
    cost_per_purchase: Number(p.cost_per_purchase),
    min_stock: Number(p.min_stock),
  }));
  const inventories: PlanInventory[] = raw.inventories.map((inv) => {
    const items: Record<string, number> = {};
    const stockouts: Record<string, string> = {};
    for (const it of inv.items) {
      items[it.product_id] = Number(it.quantity);
      if (it.stockout_on) stockouts[it.product_id] = it.stockout_on;
    }
    return { counted_on: inv.counted_on, items, stockouts };
  });
  const inTransit = raw.in_transit.map((t) => ({ ...t, quantity: Number(t.quantity) }));
  const movements: PlanMovement[] = inventories.length ? raw.movements.map((m) => ({ ...m, quantity: Number(m.quantity) }) as PlanMovement) : [];
  return buildPlan({ products, suppliers: raw.suppliers, inventories, movements, countIntervalDays, inTransit, today: today() });
}

export type OpenOrder = { id: string; kind: string; who: string; ordered_on: string; expected_on: string; products: number };

export async function loadPurchases(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:compras:${storeId}`, async () => {
    const [plan, ordersRes, suppliersRes] = await Promise.all([
      computePlan(storeId, profile.store.count_interval_days),
      supabase.from("purchase_orders").select("id, supplier_id, storage, ordered_on, expected_on").eq("store_id", storeId).eq("status", "open").order("expected_on"),
      supabase.from("suppliers").select("id, name").eq("store_id", storeId),
    ]);
    const orders = (check(ordersRes) ?? []) as { id: string; supplier_id: string | null; storage: string; ordered_on: string; expected_on: string }[];
    const names = new Map(((check(suppliersRes) ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
    const count = new Map<string, number>();
    if (orders.length) {
      const items = (check(
        await supabase
          .from("purchase_order_items")
          .select("order_id")
          .eq("store_id", storeId)
          .in("order_id", orders.map((o) => o.id))
          .gt("outstanding_quantity", 0),
      ) ?? []) as { order_id: string }[];
      for (const it of items) count.set(it.order_id, (count.get(it.order_id) ?? 0) + 1);
    }
    const openOrders: OpenOrder[] = orders.map((o) => ({
      id: o.id,
      kind: o.storage === "seco" ? "Secos" : "Gelados",
      who: o.supplier_id ? (names.get(o.supplier_id) ?? "Fornecedor") : "Sem fornecedor",
      ordered_on: o.ordered_on,
      expected_on: o.expected_on,
      products: count.get(o.id) ?? 0,
    }));
    return { plan, openOrders };
  });
}

export type SentLine = { productId: string; packs: number };

/**
 * Grava o pedido e os itens (igual a insertOrder do site): confere que os produtos são da loja e do tipo do
 * pedido, ignora um pedido igual feito há instantes (dois toques seguidos) e desfaz o pedido se os itens falharem.
 */
async function insertOrder(o: {
  storeId: string;
  supplierId: string | null;
  storage: "gelado" | "seco";
  orderedOn: string;
  expectedOn: string;
  lines: SentLine[];
  matchSupplier: boolean;
}): Promise<string | null> {
  const { data: products, error: pe } = await supabase
    .from("products")
    .select("id, units_per_purchase, storage, supplier_id")
    .eq("store_id", o.storeId)
    .in("id", o.lines.map((l) => l.productId));
  if (pe) return isNetworkError(pe) ? OFFLINE : "Não foi possível registrar o pedido.";
  const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
  const items = [];
  for (const line of o.lines) {
    const product = byId.get(line.productId);
    if (!product) return "Um dos produtos não pertence a esta loja.";
    if ((product.storage ?? "gelado") !== o.storage) return "O produto não é desse tipo de pedido.";
    if (o.matchSupplier && (product.supplier_id ?? null) !== o.supplierId) return "O produto não é desse fornecedor.";
    const quantity = line.packs * Number(product.units_per_purchase);
    if (!(quantity > 0)) return "Quantidade inválida no pedido.";
    items.push({ product_id: line.productId, packs: line.packs, ordered_quantity: quantity, outstanding_quantity: quantity });
  }

  let recent = supabase
    .from("purchase_orders")
    .select("id")
    .eq("store_id", o.storeId)
    .eq("storage", o.storage)
    .eq("status", "open")
    .eq("ordered_on", o.orderedOn)
    .eq("expected_on", o.expectedOn)
    .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString());
  recent = o.supplierId ? recent.eq("supplier_id", o.supplierId) : recent.is("supplier_id", null);
  const { data: recentOrders } = await recent;
  if (recentOrders?.length) {
    const { data: recentItems } = await supabase
      .from("purchase_order_items")
      .select("order_id, product_id, packs")
      .eq("store_id", o.storeId)
      .in("order_id", recentOrders.map((r) => r.id as string));
    const signature = (list: { product_id: string; packs: number }[]) =>
      list
        .map((it) => `${it.product_id}:${Number(it.packs)}`)
        .sort()
        .join(",");
    const wanted = signature(items);
    const duplicate = recentOrders.some(
      (r) =>
        signature((recentItems ?? []).filter((it) => it.order_id === r.id).map((it) => ({ product_id: it.product_id as string, packs: Number(it.packs) }))) ===
        wanted,
    );
    if (duplicate) return null;
  }

  const { data: order, error } = await supabase
    .from("purchase_orders")
    .insert({ store_id: o.storeId, supplier_id: o.supplierId, storage: o.storage, ordered_on: o.orderedOn, expected_on: o.expectedOn })
    .select("id")
    .single();
  if (error || !order) return error && isNetworkError(error) ? OFFLINE : "Não foi possível registrar o pedido.";
  const { error: itemError } = await supabase.from("purchase_order_items").insert(items.map((it) => ({ ...it, order_id: order.id, store_id: o.storeId })));
  if (itemError) {
    await supabase.from("purchase_orders").delete().eq("id", order.id).eq("store_id", o.storeId);
    return "Não foi possível registrar o pedido.";
  }
  return null;
}

/** Pedido que saiu da lista de compras. A previsão soma o prazo do fornecedor para gelado ou seco. */
export async function registerPurchaseOrder(profile: Profile, input: { supplierId: string | null; storage: "gelado" | "seco"; lines: SentLine[] }) {
  try {
    const storeId = profile.store.id;
    const lines = input.lines.filter((l) => l.packs > 0);
    if (lines.length === 0) return null;
    let lead = 0;
    if (input.supplierId) {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .select("id, lead_time_days, lead_time_dry_days")
        .eq("id", input.supplierId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) return isNetworkError(error) ? OFFLINE : "Fornecedor não encontrado.";
      if (!supplier) return "Fornecedor não encontrado.";
      lead = input.storage === "seco" ? Number(supplier.lead_time_dry_days) : Number(supplier.lead_time_days);
    }
    const orderedOn = today();
    return await insertOrder({ storeId, supplierId: input.supplierId, storage: input.storage, orderedOn, expectedOn: addDays(orderedOn, lead), lines, matchSupplier: true });
  } catch {
    return OFFLINE;
  }
}

/** Pedido feito por fora da lista. Gelado e seco viram um pedido de cada tipo, cada um com a sua previsão. */
export async function registerManualOrder(
  profile: Profile,
  input: { supplierId: string | null; orderedOn: string; expected: { gelado: string; seco: string }; lines: SentLine[]; storageOf: Record<string, "gelado" | "seco"> },
): Promise<string | null> {
  try {
    if (input.lines.length === 0) return "Informe a quantidade de pelo menos um produto.";
    const groups = new Map<"gelado" | "seco", SentLine[]>();
    for (const line of input.lines) {
      const storage = input.storageOf[line.productId];
      if (!storage) return "Um dos produtos não pertence a esta loja.";
      groups.set(storage, [...(groups.get(storage) ?? []), line]);
    }
    for (const storage of groups.keys()) {
      const dateError = orderDateError(input.orderedOn, input.expected[storage], today());
      if (dateError) return groups.size > 1 ? `${storage === "seco" ? "Secos" : "Gelados"}: ${dateError}` : dateError;
    }
    for (const [storage, group] of groups) {
      const err = await insertOrder({
        storeId: profile.store.id,
        supplierId: input.supplierId,
        storage,
        orderedOn: input.orderedOn,
        expectedOn: input.expected[storage],
        lines: group,
        matchSupplier: false,
      });
      if (err) return err;
    }
    return null;
  } catch {
    return OFFLINE;
  }
}

/** Cancela um pedido enviado por engano. O que já chegou continua no estoque. */
export async function cancelPurchaseOrder(profile: Profile, id: string): Promise<string | null> {
  try {
    const storeId = profile.store.id;
    const { data, error } = await supabase
      .from("purchase_orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("store_id", storeId)
      .eq("status", "open")
      .select("id");
    if (error) return isNetworkError(error) ? OFFLINE : "Não foi possível cancelar.";
    if (!data?.length) return null;
    await supabase.from("purchase_order_items").update({ outstanding_quantity: 0 }).eq("order_id", id).eq("store_id", storeId);
    return null;
  } catch {
    return OFFLINE;
  }
}

export async function loadOrderForm(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:pedido:${storeId}`, async () => {
    const [s, p] = await Promise.all([
      supabase.from("suppliers").select("id, name, lead_time_days, lead_time_dry_days").eq("store_id", storeId).order("name"),
      supabase
        .from("products")
        .select("id, name, category, storage, supplier_id, count_unit, purchase_unit, units_per_purchase, cost_per_purchase")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("category")
        .order("name"),
    ]);
    return {
      suppliers: (check(s) ?? []) as { id: string; name: string; lead_time_days: number; lead_time_dry_days: number }[],
      products: ((check(p) ?? []) as {
        id: string;
        name: string;
        category: string;
        storage: string;
        supplier_id: string | null;
        count_unit: string;
        purchase_unit: string;
        units_per_purchase: number;
        cost_per_purchase: number;
      }[]).map((x) => ({
        ...x,
        storage: x.storage === "seco" ? ("seco" as const) : ("gelado" as const),
        units_per_purchase: Number(x.units_per_purchase),
        cost_per_purchase: Number(x.cost_per_purchase),
      })),
    };
  });
}
