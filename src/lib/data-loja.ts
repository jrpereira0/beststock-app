// Financeiro e configurações da loja (iguais a financeiro/page.tsx e configuracoes/page.tsx do site).
import type { Profile } from "./auth";
import { cached, check } from "./data";
import { computePlan } from "./data-compras";
import { today } from "./dates";
import { callSite } from "./site-api";
import { setupFacts } from "./site/setup";
import type { Payment, PaymentMethod, Plan } from "./site/types";
import { supabase } from "./supabase";

export type Finance = {
  payments: Payment[];
  plan: Plan | null;
  store: { due_day: number; payment_method: PaymentMethod; billing_active: boolean };
  settings: { pix_key: string | null; instructions: string | null } | null;
};

export async function loadFinance(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:financeiro:${storeId}`, async (): Promise<Finance> => {
    // Garante que as cobranças do plano até o mês atual existem (a função do banco nunca duplica).
    await supabase.rpc("generate_due_charges");
    const store = check(
      await supabase.from("stores").select("plan_id, due_day, payment_method, billing_active").eq("id", storeId).single(),
    ) as Finance["store"] & { plan_id: string | null };
    const [payRes, settingsRes, planRes] = await Promise.all([
      supabase.from("payments").select("*").eq("store_id", storeId).order("due_date", { ascending: false }).limit(60),
      supabase.from("billing_settings").select("pix_key, instructions").maybeSingle(),
      store.plan_id ? supabase.from("plans").select("*").eq("id", store.plan_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      payments: (check(payRes) ?? []) as Payment[],
      plan: store.billing_active ? ((planRes.data ?? null) as Plan | null) : null,
      store,
      settings: (settingsRes.data ?? null) as Finance["settings"],
    };
  });
}

export type StoreLogin = { id: string; name: string; email: string; access: "gerente" | "funcionario" };

/** Logins da loja e cidade. Criar, editar e remover login passa pelo site (precisa da chave secreta). */
export async function loadSettings(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:configuracoes:${storeId}`, async () => {
    const [logins, store, plan, suppliers, closed] = await Promise.all([
      supabase.from("profiles").select("id, name, email, access").eq("store_id", storeId).order("created_at"),
      supabase.from("stores").select("city, count_interval_days").eq("id", storeId).single(),
      computePlan(storeId, profile.store.count_interval_days),
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      supabase.from("inventories").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "closed"),
    ]);
    // Situação do cadastro e da rotina, para a lista "Para os números saírem certos" (igual ao site).
    const facts = setupFacts(plan, {
      countIntervalDays: Number((check(store) as { count_interval_days: number }).count_interval_days),
      suppliers: suppliers.count ?? 0,
      closedCounts: closed.count ?? 0,
      today: today(),
    });
    return {
      facts,
      logins: (check(logins) ?? []) as StoreLogin[],
      city: String((check(store) as { city: string }).city ?? ""),
      interval: Number((check(store) as { count_interval_days: number }).count_interval_days),
    };
  });
}

export async function addLogin(input: { name: string; email: string; password: string; access: string }) {
  return callSite<{ ok?: string }>("/api/app/logins", { body: { action: "add", ...input } });
}
export async function updateLogin(input: { id: string; name: string; access: string; password: string }) {
  return callSite<{ ok?: string }>("/api/app/logins", { body: { action: "update", ...input } });
}
export async function removeLogin(id: string) {
  return callSite<{ ok?: string }>("/api/app/logins", { body: { action: "remove", id } });
}
