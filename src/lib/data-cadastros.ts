// Produtos, fornecedores e configurações da loja. Só o gerente cadastra (o banco também confere).
import type { Profile } from "./auth";
import { sameUnit, type ProductRow } from "./cadastros";
import { cached, check } from "./data";
import { isNetworkError } from "./queue.ts";
import { compareCategories } from "./site/category-order";
import type { Product, Supplier } from "./site/types";
import { supabase } from "./supabase";

const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";
const fail = (error: { message: string; code?: string }, text: string) => (isNetworkError(error) ? OFFLINE : text);

export async function loadProducts(profile: Profile) {
  return cached(`beststock:produtos:${profile.store.id}`, async () => {
    const [products, suppliers] = await Promise.all([
      supabase.from("products").select("*").eq("store_id", profile.store.id).order("category").order("name"),
      supabase.from("suppliers").select("*").eq("store_id", profile.store.id).order("name"),
    ]);
    return { products: (check(products) ?? []) as Product[], suppliers: (check(suppliers) ?? []) as Supplier[] };
  });
}

export type ProductDetail = {
  product: (Product & { networkCost: number | null }) | null;
  suppliers: Supplier[];
  categories: string[];
};

export async function loadProduct(profile: Profile, id: string | null) {
  return cached(`beststock:produto:${id ?? "novo"}`, async (): Promise<ProductDetail> => {
    const storeId = profile.store.id;
    const [product, suppliers, cats] = await Promise.all([
      id
        ? supabase.from("products").select("*, catalog_products(cost_per_purchase)").eq("id", id).eq("store_id", storeId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("suppliers").select("*").eq("store_id", storeId).order("name"),
      supabase.from("products").select("category").eq("store_id", storeId),
    ]);
    const p = check(product) as (Product & { catalog_products: { cost_per_purchase: number } | null }) | null;
    if (id && !p) throw new Error("Produto não encontrado.");
    return {
      product: p ? { ...p, networkCost: p.catalog_products ? Number(p.catalog_products.cost_per_purchase) : null } : null,
      suppliers: (check(suppliers) ?? []) as Supplier[],
      categories: [...new Set(((check(cats) ?? []) as { category: string }[]).map((r) => r.category).filter(Boolean))].sort(compareCategories),
    };
  });
}

export async function saveProduct(profile: Profile, id: string | null, row: ProductRow): Promise<string | null> {
  const storeId = profile.store.id;
  try {
    const data: Record<string, unknown> = { ...row };
    if (id) {
      const { data: current, error } = await supabase
        .from("products")
        .select("count_unit, catalog_product_id, catalog_products(cost_per_purchase)")
        .eq("id", id)
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) return fail(error, "Não foi possível salvar o produto.");
      // Produto da lista padrão: com o custo igual ao da rede, segue a rede; diferente, é custo da loja.
      const network = current?.catalog_product_id ? (current.catalog_products as unknown as { cost_per_purchase: number } | null) : null;
      if (network) data.custom_cost = Math.abs(row.cost_per_purchase - Number(network.cost_per_purchase)) > 0.004;
      if (current && !sameUnit(String(current.count_unit), row.count_unit)) {
        const [counts, moves] = await Promise.all([
          supabase.from("inventory_items").select("product_id", { count: "exact", head: true }).eq("product_id", id),
          supabase.from("movements").select("id", { count: "exact", head: true }).eq("product_id", id),
        ]);
        if ((counts.count ?? 0) > 0 || (moves.count ?? 0) > 0) {
          return `Este produto já tem contagens em ${current.count_unit}. Trocar a unidade de contagem misturaria os números antigos com os novos. Para contar em outra unidade, cadastre um produto novo e desative este.`;
        }
      }
    }
    const { error } = id
      ? await supabase.from("products").update(data).eq("id", id).eq("store_id", storeId)
      : await supabase.from("products").insert({ ...data, store_id: storeId });
    return error ? fail(error, "Não foi possível salvar o produto.") : null;
  } catch {
    return OFFLINE;
  }
}

export async function deleteProduct(profile: Profile, id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from("products").delete().eq("id", id).eq("store_id", profile.store.id);
    if (error?.code === "23503") return 'Este produto já tem contagens ou entradas. Desligue "Produto ativo" em vez de excluir.';
    return error ? fail(error, "Não foi possível excluir o produto.") : null;
  } catch {
    return OFFLINE;
  }
}

export async function loadSupplier(profile: Profile, id: string) {
  return cached(`beststock:fornecedor:${id}`, async () => {
    const s = check(await supabase.from("suppliers").select("*").eq("id", id).eq("store_id", profile.store.id).maybeSingle()) as Supplier | null;
    if (!s) throw new Error("Fornecedor não encontrado.");
    return s;
  });
}

export async function saveSupplier(
  profile: Profile,
  id: string | null,
  row: { name: string; contact: string; lead_time_days: number; lead_time_dry_days: number },
): Promise<string | null> {
  try {
    const { error } = id
      ? await supabase.from("suppliers").update(row).eq("id", id).eq("store_id", profile.store.id)
      : await supabase.from("suppliers").insert({ ...row, store_id: profile.store.id });
    return error ? fail(error, "Não foi possível salvar o fornecedor.") : null;
  } catch {
    return OFFLINE;
  }
}

export async function deleteSupplier(profile: Profile, id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("store_id", profile.store.id);
    return error ? fail(error, "Não foi possível excluir o fornecedor.") : null;
  } catch {
    return OFFLINE;
  }
}

export async function saveSettings(days: number): Promise<string | null> {
  try {
    const { error } = await supabase.rpc("update_my_store_settings", { p_count_interval_days: days });
    return error ? fail(error, "Não foi possível salvar as configurações.") : null;
  } catch {
    return OFFLINE;
  }
}
