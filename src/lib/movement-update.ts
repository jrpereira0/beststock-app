// Corrigir um lançamento no banco, com a regra do site (lib/movement-edit.ts). Recebe o cliente do Supabase
// para rodar igual no app e no teste (scripts/teste-corrigir.mjs).
import type { SupabaseClient } from "@supabase/supabase-js";
import { today } from "./dates.ts";
import { isNetworkError } from "./queue.ts";
import { parseTyped, planMovementEdit } from "./site/movement-edit.ts";

/** Devolve null quando deu certo; senão, a mensagem para a pessoa. `offline` quando a conexão caiu. */
export async function updateMovementWith(
  db: SupabaseClient,
  storeId: string,
  id: string,
  date: string,
  typedText: string,
): Promise<string | null | "offline"> {
  const { data: mov, error: readError } = await db
    .from("movements")
    .select("id, kind, product_id, quantity, moved_on, products(units_per_purchase)")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (readError) return isNetworkError(readError) ? "offline" : "Não foi possível corrigir.";
  if (!mov) return "Este lançamento não existe mais. Puxe a tela para atualizar.";
  const product = (Array.isArray(mov.products) ? mov.products[0] : mov.products) as { units_per_purchase: number } | null;
  const { data: receipts } = await db.from("purchase_order_receipts").select("quantity").eq("movement_id", id);
  const plan = planMovementEdit({
    kind: mov.kind as "entrada" | "perda",
    date,
    today: today(),
    typed: parseTyped(typedText),
    unitsPerPurchase: Number(product?.units_per_purchase ?? 1),
    oldQuantity: Number(mov.quantity),
    receivedOnOrders: (receipts ?? []).reduce((a, r) => a + Number(r.quantity), 0),
  });
  if ("error" in plan) return plan.error;
  // Mudou o dia: a entrada no dia de uma contagem que já contou o produto fica fora dela (como ao lançar).
  let afterCount: boolean | null = null;
  if (mov.kind === "entrada" && plan.patch.moved_on !== mov.moved_on) {
    const { data: inv } = await db
      .from("inventories")
      .select("id, inventory_items(product_id)")
      .eq("store_id", storeId)
      .eq("counted_on", plan.patch.moved_on)
      .eq("inventory_items.product_id", mov.product_id as string)
      .maybeSingle();
    afterCount = Boolean((inv?.inventory_items as unknown[] | undefined)?.length);
  }
  const { data: updated, error } = await db
    .from("movements")
    .update({ ...plan.patch, ...(afterCount === null ? {} : { after_count: afterCount }) })
    .eq("id", id)
    .eq("store_id", storeId)
    .select("id");
  if (error) return isNetworkError(error) ? "offline" : "Não foi possível salvar a correção.";
  if (!updated?.length) return "Não foi possível salvar a correção.";
  return null;
}
