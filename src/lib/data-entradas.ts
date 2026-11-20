// Histórico de entradas e perdas (igual a entradas/page.tsx do site), corrigir e excluir lançamento.
import type { Profile } from "./auth";
import { cached, check } from "./data";
import { loadPeople } from "./data-inventario";
import { addDays, formatQty, today } from "./dates";
import { isNetworkError } from "./queue.ts";
import { updateMovementWith } from "./movement-update.ts";
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
  /** Para corrigir: a quantidade como se digita (embalagens na entrada) e a unidade dela. */
  edit: { amount: number; unit: string };
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
        edit:
          m.kind === "entrada"
            ? { amount: m.packages !== null ? Number(m.packages) : quantity / Number(p?.units_per_purchase ?? 1), unit: p?.purchase_unit ?? "" }
            : { amount: quantity, unit: countUnit },
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

/** Corrige a data e a quantidade de um lançamento, com a mesma regra do site (updateMovement). */
export async function updateMovement(profile: Profile, id: string, date: string, typedText: string): Promise<string | null> {
  const offline = "Sem internet. Conecte o celular para corrigir.";
  try {
    const res = await updateMovementWith(supabase, profile.store.id, id, date, typedText);
    return res === "offline" ? offline : res;
  } catch {
    return offline;
  }
}
/** Se a nota já foi lançada, diz quando e por quem; se não, devolve null (igual a checkInvoice do site). */
export async function checkInvoice(profile: Profile, key: string): Promise<string | null> {
  if (!/^\d{44}$/.test(key)) return null;
  const { data } = await supabase
    .from("imported_invoices")
    .select("created_at, created_by")
    .eq("store_id", profile.store.id)
    .eq("access_key", key)
    .maybeSingle();
  if (!data) return null;
  const d = new Date(new Date(data.created_at as string).getTime() - 3 * 3600_000);
  const when = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const people = await loadPeople(profile.store.id, profile.store.name);
  const who = Object.keys(people).length > 1 ? people[(data.created_by as string | null) ?? ""] : undefined;
  return `em ${when}${who ? ` por ${who}` : ""}`;
}

/** Guarda qual produto da loja é cada item da nota, para a próxima nota do fornecedor já vir ligada. */
export async function rememberInvoiceLinks(profile: Profile, issuerId: string, links: { code: string; productId: string; factor: number }[]) {
  const issuer = issuerId.replace(/\D/g, "");
  const valid = links.filter((l) => l.code && l.productId && Number.isFinite(l.factor) && l.factor > 0);
  if (!issuer || valid.length === 0) return;
  const unique = new Map(valid.map((l) => [l.code.slice(0, 60), l]));
  await supabase.from("invoice_item_links").upsert(
    [...unique].map(([code, l]) => ({
      store_id: profile.store.id,
      issuer_id: issuer,
      item_code: code,
      product_id: l.productId,
      packs_per_unit: Math.round(l.factor * 10000) / 10000,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "store_id,issuer_id,item_code" },
  );
}

export async function loadInvoiceData(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:nota:${storeId}`, async () => {
    const [products, links] = await Promise.all([
      supabase.from("products").select("id, name, category, purchase_unit, position").eq("store_id", storeId).eq("active", true),
      supabase.from("invoice_item_links").select("issuer_id, item_code, product_id, packs_per_unit").eq("store_id", storeId),
    ]);
    return {
      products: (check(products) ?? []) as { id: string; name: string; category: string; purchase_unit: string; position: number | null }[],
      links: ((check(links) ?? []) as { issuer_id: string; item_code: string; product_id: string; packs_per_unit: number }[]).map((l) => ({
        ...l,
        packs_per_unit: Number(l.packs_per_unit),
      })),
    };
  });
}
