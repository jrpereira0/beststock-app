// Histórico de entradas e perdas (igual a entradas/page.tsx do site) e excluir lançamento.
import type { Profile } from "./auth";
import { cached, check } from "./data";
import { loadPeople } from "./data-inventario";
import { addDays, formatQty, today } from "./dates";
import { isNetworkError } from "./queue.ts";
import { supabase } from "./supabase";

export const HISTORY_DAYS = 90;

export type HistoryRow = {
  id: string;
  date: string;
  kind: "entrada" | "perda";
  name: string;
  category: string;
  /** Como foi lançado: embalagens na entrada, unidades de contagem na perda. */
  amount: number;
  unit: string;
  /** O mesmo em unidades de contagem, quando a embalagem é diferente ("120 un"). */
  equals: string | null;
  /** Pelo custo cadastrado. Só aparece para o gerente. */
  value: number;
  by: string | null;
};
export type History = { rows: HistoryRow[]; lastCount: string | null };

export async function loadHistory(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:historico:${profile.id}`, async (): Promise<History> => {
    const [movRes, prodRes, countRes, people] = await Promise.all([
      supabase
        .from("movements")
        .select("id, product_id, kind, moved_on, quantity, packages, created_by")
        .eq("store_id", storeId)
        .gte("moved_on", addDays(today(), -HISTORY_DAYS))
        .order("moved_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("products").select("id, name, category, count_unit, purchase_unit, units_per_purchase, cost_per_purchase").eq("store_id", storeId),
      supabase
        .from("inventories")
        .select("counted_on")
        .eq("store_id", storeId)
        .eq("status", "closed")
        .order("counted_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadPeople(storeId, profile.store.name),
    ]);
    const movements = (check(movRes) ?? []) as {
      id: string;
      product_id: string;
      kind: "entrada" | "perda";
      moved_on: string;
      quantity: number;
      packages: number | null;
      created_by: string | null;
    }[];
    const products = new Map(
      ((check(prodRes) ?? []) as { id: string; name: string; category: string; count_unit: string; purchase_unit: string; units_per_purchase: number; cost_per_purchase: number }[]).map(
        (p) => [p.id, p],
      ),
    );
    const manyPeople = Object.keys(people).length > 1;
    const manager = profile.access === "gerente";
    const rows = movements.map((m): HistoryRow => {
      const p = products.get(m.product_id);
      const quantity = Number(m.quantity);
      const countUnit = p?.count_unit ?? "";
      const inPacks = m.kind === "entrada" && m.packages !== null && p?.purchase_unit !== countUnit;
      return {
        id: m.id,
        date: m.moved_on,
        kind: m.kind,
        name: p?.name ?? "Produto removido",
        category: p?.category ?? "",
        amount: inPacks ? Number(m.packages) : quantity,
        unit: inPacks ? (p?.purchase_unit ?? "") : countUnit,
        equals: inPacks ? `${formatQty(quantity)} ${countUnit}` : null,
        // O funcionário não vê valores: nem chegam ao aparelho dele.
        value: manager ? (quantity / Number(p?.units_per_purchase ?? 1)) * Number(p?.cost_per_purchase ?? 0) : 0,
        by: manyPeople ? (people[m.created_by ?? ""] ?? null) : null,
      };
    });
    return { rows, lastCount: (countRes.data?.counted_on as string | undefined) ?? null };
  });
}

/** Exclui um lançamento. O banco devolve ao pedido o que a entrada tinha abatido. */
export async function deleteMovement(profile: Profile, id: string): Promise<string | null> {
  const storeId = profile.store.id;
  try {
    const { data: removed, error } = await supabase.from("movements").delete().eq("id", id).eq("store_id", storeId).select("invoice_id").maybeSingle();
    if (error) return isNetworkError(error) ? "Sem internet. Conecte o celular para excluir." : "Não foi possível excluir.";
    // Apagou o último produto que veio de uma nota: a nota pode ser lançada de novo.
    const invoiceId = removed?.invoice_id as string | null | undefined;
    if (invoiceId) {
      const { count } = await supabase.from("movements").select("id", { count: "exact", head: true }).eq("invoice_id", invoiceId).eq("store_id", storeId);
      if (!count) await supabase.from("imported_invoices").delete().eq("id", invoiceId).eq("store_id", storeId);
    }
    return null;
  } catch {
    return "Sem internet. Conecte o celular para excluir.";
  }
}
