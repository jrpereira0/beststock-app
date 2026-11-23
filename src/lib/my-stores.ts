// As lojas de um login (um cliente com várias lojas) e a troca da loja que ele usa. Sem depender das telas:
// o login (auth.tsx) usa estas funções. As regras estão no banco (profile_stores, switch_store), as mesmas do site.
import { isNetworkError } from "./queue.ts";
import { supabase } from "./supabase";

export type MyStore = { id: string; name: string; city: string };

const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";

/** As lojas ativas do login, por nome. */
export async function fetchMyStores(): Promise<MyStore[]> {
  // Do banco (my_stores): as lojas do login e, sendo gerente, as do mesmo cliente.
  const { data, error } = await supabase.rpc("my_stores");
  if (error) throw error;
  return ((data ?? []) as MyStore[]).map((s) => ({ id: s.id, name: s.name, city: s.city }));
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
