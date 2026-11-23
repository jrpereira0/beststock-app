// As lojas de um login (um cliente com várias lojas) e a troca da loja que ele usa. Sem depender das telas:
// o login (auth.tsx) usa estas funções. As regras estão no banco (profile_stores, switch_store), as mesmas do site.
import { isNetworkError } from "./queue.ts";
import { supabase } from "./supabase";

export type MyStore = { id: string; name: string; city: string };

const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";

type Row = { id: string; name: string; city: string; active: boolean };

/** As lojas ativas do login, por nome. */
export async function fetchMyStores(): Promise<MyStore[]> {
  const { data, error } = await supabase.from("profile_stores").select("store_id, stores(id, name, city, active)");
  if (error) throw error;
  const list: MyStore[] = [];
  for (const r of (data ?? []) as unknown as { stores: Row | Row[] | null }[]) {
    const s = Array.isArray(r.stores) ? r.stores[0] : r.stores;
    if (s?.active) list.push({ id: s.id, name: s.name, city: s.city });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Troca a loja que o login usa. O banco só deixa trocar para uma loja da lista do próprio login. */
export async function switchStoreRpc(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.rpc("switch_store", { p_store: id });
    if (!error) return null;
    return isNetworkError(error) ? OFFLINE : "Não foi possível trocar de loja.";
  } catch {
    return OFFLINE;
  }
}
