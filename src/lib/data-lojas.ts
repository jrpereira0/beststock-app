// Um cliente com mais de uma loja: trocar de loja e transferir produtos entre elas. As regras estão no banco
// (switch_store, transfer_products, delete_transfer, transfer_missing), as mesmas do site.
import type { Profile } from "./auth";
import { cached, check } from "./data";
import { computePlan } from "./data-compras";
import type { StockParts } from "./site/transfer-stock";
import { isNetworkError } from "./queue.ts";
import { supabase } from "./supabase";

export type { MyStore } from "./my-stores";

const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";

/** Produtos da loja ativa que ainda não existem na loja de destino (serão cadastrados lá). */
export async function loadTransferMissing(profile: Profile, toStoreId: string) {
  return cached(`beststock:transferencia:${profile.store.id}:${toStoreId}`, async () => {
    const res = await supabase.rpc("transfer_missing", { p_to: toStoreId });
    return (check(res) ?? []) as string[];
  });
}

/** O que há de cada produto da loja ativa: última contagem + entradas − saídas (a conta da lista de compras). */
export async function loadTransferStock(profile: Profile) {
  return cached(`beststock:transfer-estoque:${profile.store.id}`, async () => {
    const plan = await computePlan(profile.store.id, profile.store.count_interval_days);
    const stock: Record<string, StockParts | null> = {};
    for (const i of plan.items) stock[i.product.id] = i.lastCount;
    return stock;
  });
}

/** Transfere produtos (quantidades em unidades de contagem) da loja ativa para outra loja do cliente. */
export async function transferProducts(toStoreId: string, date: string, items: { product_id: string; quantity: number }[]): Promise<string | null> {
  try {
    const { error } = await supabase.rpc("transfer_products", { p_to: toStoreId, p_moved_on: date, p_items: items, p_note: "" });
    if (!error) return null;
    if (isNetworkError(error)) return OFFLINE;
    return error.code === "P0001" || error.code === "42501" ? error.message : "Não foi possível transferir. Tente de novo.";
  } catch {
    return OFFLINE;
  }
}

/** Desfaz a transferência inteira: os dois lados saem do histórico das duas lojas. */
export async function deleteTransfer(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.rpc("delete_transfer", { p_id: id });
    if (!error) return null;
    return isNetworkError(error) ? OFFLINE : error.code === "P0001" || error.code === "42501" ? error.message : "Não foi possível desfazer.";
  } catch {
    return OFFLINE;
  }
}
