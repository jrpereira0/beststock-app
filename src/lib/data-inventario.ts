// Inventário: lista, contagem fechada e reabrir (iguais a inventario/page.tsx, [id]/page.tsx e actions.ts do site).
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Profile } from "./auth";
import { compareProducts } from "./count-rules.ts";
import { cached, check } from "./data";
import { isNetworkError } from "./queue.ts";
import { supabase } from "./supabase";

/** Nome de cada login da loja. O login antigo da loja tem o nome da loja e aparece como "Gerente". */
export async function loadPeople(storeId: string, storeName: string): Promise<Record<string, string>> {
  const { data } = await supabase.from("profiles").select("id, name").eq("store_id", storeId);
  return Object.fromEntries(
    (data ?? []).map((p) => {
      const name = String(p.name ?? "").trim();
      return [p.id as string, name && name !== storeName ? name : "Gerente"];
    }),
  );
}

export type InventoryRow = { id: string; counted_on: string; status: "draft" | "closed"; counted: number };
export type InventoryList = { inventories: InventoryRow[]; productCount: number };

export async function loadInventories(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:inventarios:${storeId}`, async (): Promise<InventoryList> => {
    const [inv, products] = await Promise.all([
      supabase
        .from("inventories")
        .select("id, counted_on, status, inventory_items(count)")
        .eq("store_id", storeId)
        .order("counted_on", { ascending: false })
        .limit(30),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("active", true),
    ]);
    const rows = (check(inv) ?? []) as unknown as { id: string; counted_on: string; status: "draft" | "closed"; inventory_items: { count: number }[] }[];
    return {
      inventories: rows.map((r) => ({ id: r.id, counted_on: r.counted_on, status: r.status, counted: Number(r.inventory_items?.[0]?.count ?? 0) })),
      productCount: products.count ?? 0,
    };
  });
}

export type ClosedCount = {
  inventory: { id: string; counted_on: string; status: "draft" | "closed"; closed_at: string | null; closed_by: string | null };
  groups: [string, { id: string; name: string; count_unit: string; quantity: number | null; stockout: string | null; who: string | null; when: string | null }[]][];
  counted: number;
  isLatest: boolean;
  /** Quem contou e quem fechou, quando a loja tem mais de um login. */
  whoText: string;
};

const time = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Horário de Brasília (UTC−3).
  const br = new Date(d.getTime() - 3 * 3600_000);
  return `${pad(br.getUTCDate())}/${pad(br.getUTCMonth() + 1)} ${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}`;
};

export async function loadClosedCount(profile: Profile, id: string, compareCategories: (a: string, b: string) => number) {
  const storeId = profile.store.id;
  return cached(`beststock:contagem-fechada:${id}`, async (): Promise<ClosedCount> => {
    const inv = check(
      await supabase.from("inventories").select("id, counted_on, status, closed_at, closed_by").eq("id", id).eq("store_id", storeId).maybeSingle(),
    ) as ClosedCount["inventory"] | null;
    if (!inv) throw new Error("Contagem não encontrada.");
    const [productsRes, itemsRes, latestRes, people] = await Promise.all([
      supabase.from("products").select("id, name, category, count_unit, active, position").eq("store_id", storeId),
      supabase.from("inventory_items").select("product_id, quantity, stockout_on, counted_by, updated_at").eq("inventory_id", id),
      supabase.from("inventories").select("id").eq("store_id", storeId).order("counted_on", { ascending: false }).limit(1).maybeSingle(),
      loadPeople(storeId, profile.store.name),
    ]);
    const products = ((check(productsRes) ?? []) as { id: string; name: string; category: string; count_unit: string; active: boolean; position: number | null }[]).sort(compareProducts);
    const items = (check(itemsRes) ?? []) as { product_id: string; quantity: number; stockout_on: string | null; counted_by: string | null; updated_at: string | null }[];
    const byProduct = new Map(items.map((i) => [i.product_id, i]));
    const showPeople = Object.keys(people).length > 1;
    const groups = new Map<string, ClosedCount["groups"][number][1]>();
    for (const p of products) {
      const it = byProduct.get(p.id);
      if (!p.active && !it) continue;
      const key = p.category || "Sem categoria";
      groups.set(key, [
        ...(groups.get(key) ?? []),
        {
          id: p.id,
          name: p.name,
          count_unit: p.count_unit,
          quantity: it ? Number(it.quantity) : null,
          stockout: it?.stockout_on ?? null,
          who: showPeople && it?.counted_by ? (people[it.counted_by] ?? null) : null,
          when: showPeople && it?.updated_at ? time(it.updated_at) : null,
        },
      ]);
    }
    const counters = [...new Set(items.map((i) => (i.counted_by ? people[i.counted_by] : undefined)).filter(Boolean))] as string[];
    const closedBy = inv.closed_by ? people[inv.closed_by] : undefined;
    const whoText = [
      showPeople && counters.length > 0 && `contado por ${counters.join(", ").replace(/, ([^,]*)$/, " e $1")}`,
      inv.closed_at && `fechado${showPeople && closedBy ? ` por ${closedBy}` : ""} em ${time(inv.closed_at)}`,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      inventory: inv,
      groups: [...groups].sort((a, b) => compareCategories(a[0], b[0])),
      counted: items.length,
      isLatest: (latestRes.data?.id as string | undefined) === inv.id,
      whoText: whoText ? whoText.charAt(0).toUpperCase() + whoText.slice(1) : "",
    };
  });
}

/** Reabre a contagem mais recente para corrigir. Só o gerente (o banco também confere). */
export async function reopenInventory(profile: Profile, id: string): Promise<string | null> {
  if (profile.access !== "gerente") return "Só o gerente reabre uma contagem fechada.";
  try {
    const { data: latest, error: e1 } = await supabase
      .from("inventories")
      .select("id")
      .eq("store_id", profile.store.id)
      .order("counted_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) return isNetworkError(e1) ? "Sem internet. Conecte o celular para reabrir." : "Não foi possível reabrir.";
    if (latest?.id !== id) return "Só a contagem mais recente pode ser reaberta.";
    const { error } = await supabase
      .from("inventories")
      .update({ status: "draft", closed_at: null, closed_by: null })
      .eq("id", id)
      .eq("store_id", profile.store.id);
    if (error) return isNetworkError(error) ? "Sem internet. Conecte o celular para reabrir." : "Não foi possível reabrir.";
    await AsyncStorage.multiRemove([`beststock:dados-contagem:${id}`, `beststock:contagem-fechada:${id}`]).catch(() => undefined);
    return null;
  } catch {
    return "Sem internet. Conecte o celular para reabrir.";
  }
}
