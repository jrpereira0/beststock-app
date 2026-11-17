// Testa, com um administrador de teste, o que o painel da rede no app faz no banco e na rota do site.
// O administrador de teste é criado e apagado nesta mesma execução. Só mexe em dados "TESTE UI":
// nenhum aviso para todas as unidades, nenhuma loja real alterada.
//   node --env-file=../beststock/.env.local scripts/teste-admin.mjs [endereço do site, padrão http://localhost:3000]
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const site = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const root = createClient(url, secret, opts);

let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
};
const tag = randomBytes(3).toString("hex");
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const made = { users: [], stores: [], plans: [], catalog: [], leads: [] };

async function post(path, body, token) {
  const res = await fetch(`${site}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

try {
  // Administrador temporário.
  const email = `teste-ui-admin-${tag}@beststock.test`;
  const password = randomBytes(12).toString("base64url");
  const u = await root.auth.admin.createUser({ email, password, email_confirm: true });
  made.users.push(u.data.user.id);
  await root.from("profiles").insert({ id: u.data.user.id, role: "admin", store_id: null, name: "Admin Teste", email });
  const db = createClient(url, key, opts);
  const { data: s } = await db.auth.signInWithPassword({ email, password });
  const token = s.session.access_token;

  const profile = await db.from("profiles").select("role, store_id").eq("id", u.data.user.id).single();
  check("administrador entra e o app reconhece o papel", profile.data?.role === "admin" && profile.data.store_id === null);

  // Plano de teste.
  const plan = await db.from("plans").insert({ name: `TESTE UI Plano ${tag}`, price: 150, duration_months: 1, active: true }).select("id").single();
  made.plans.push(plan.data?.id);
  check("cria plano", !plan.error, plan.error?.message);

  // Unidade nova pela rota do site (cria o login com a chave secreta).
  const storeEmail = `teste-ui-unidade-${tag}@beststock.test`;
  const created = await post(
    "/api/app/admin",
    {
      action: "create_store",
      name: `TESTE UI Unidade ${tag}`,
      city: "Teste",
      count_interval_days: "7",
      owner_name: "Dono Teste",
      phone: "11999990000",
      notes: "anotação",
      billing_active: true,
      plan_id: plan.data?.id,
      due_day: "10",
      payment_method: "pix",
      billing_start: "auto",
      email: storeEmail,
      password: "senha-de-teste-123",
      copy_catalog: false,
    },
    token,
  );
  const storeId = created.body.id;
  if (storeId) made.stores.push(storeId);
  check("cria unidade com login e cobrança pela rota", created.status === 200 && Boolean(storeId), JSON.stringify(created.body));
  const storeLogin = await root.from("profiles").select("email, role").eq("store_id", storeId).maybeSingle();
  if (storeLogin.data) made.users.push((await root.from("profiles").select("id").eq("store_id", storeId).single()).data.id);
  check("login da unidade foi criado", storeLogin.data?.email === storeEmail);
  const network = await db.from("suppliers").select("name").eq("store_id", storeId);
  check("unidade nasce com o fornecedor da rede", network.data?.length === 1);

  const nonAdmin = await post("/api/app/admin", { action: "create_store", name: "x" }, "token-invalido");
  check("rota recusa quem não está logado", nonAdmin.status === 401);

  // Cobrança: pausa e religa pela rota.
  const pause = await post("/api/app/admin", { action: "update_billing", id: storeId, billing_active: false, payment_method: "boleto" }, token);
  const st1 = await db.from("stores").select("billing_active, payment_method").eq("id", storeId).single();
  check("pausa a cobrança", pause.status === 200 && st1.data?.billing_active === false && st1.data.payment_method === "boleto", JSON.stringify(pause.body));
  const on = await post(
    "/api/app/admin",
    { action: "update_billing", id: storeId, billing_active: true, plan_id: plan.data?.id, due_day: "15", payment_method: "pix", billing_start: "auto" },
    token,
  );
  check("liga a cobrança de novo", on.status === 200 && /Cobrança/.test(on.body.ok ?? ""), JSON.stringify(on.body));

  // Cadastro, anotação e bloqueio.
  const upd = await db.from("stores").update({ city: "Teste 2" }).eq("id", storeId);
  const notes = await db.from("store_admin_notes").upsert({ store_id: storeId, notes: "nova" }, { onConflict: "store_id" });
  check("salva o cadastro e as anotações", !upd.error && !notes.error, upd.error?.message ?? notes.error?.message);
  const block = await db.from("stores").update({ active: false, blocked_at: new Date().toISOString(), blocked_reason: "teste" }).eq("id", storeId).select("id");
  const unblock = await db.from("stores").update({ active: true, blocked_at: null, blocked_reason: "" }).eq("id", storeId).select("id");
  check("bloqueia e reativa", block.data?.length === 1 && unblock.data?.length === 1);

  // Cobrança avulsa, pagamento, desfazer e cancelar.
  const pay = await db
    .from("payments")
    .insert({ store_id: storeId, reference_month: `${today.slice(0, 7)}-01`, description: "TESTE UI avulsa", amount: 10, due_date: today })
    .select("id")
    .single();
  const paid = await db.from("payments").update({ status: "pago", paid_on: today, method: "pix", note: "" }).eq("id", pay.data?.id).select("status");
  const reopen = await db.from("payments").update({ status: "pendente", paid_on: null, method: null }).eq("id", pay.data?.id).select("status");
  const cancel = await db.from("payments").update({ status: "cancelado", paid_on: null, method: null }).eq("id", pay.data?.id).eq("status", "pendente").select("status");
  check("cobrança avulsa: criar, pagar, desfazer e cancelar", !pay.error && paid.data?.[0]?.status === "pago" && reopen.data?.[0]?.status === "pendente" && cancel.data?.[0]?.status === "cancelado", pay.error?.message);

  // Aviso só para a unidade de teste.
  const ann = await db.from("announcements").insert({ store_id: storeId, title: "TESTE UI aviso", body: "", level: "info" }).select("id").single();
  const annDel = await db.from("announcements").delete().eq("id", ann.data?.id);
  check("envia e apaga aviso da unidade", !ann.error && !annDel.error, ann.error?.message);

  // Lista padrão: item de teste, sem levar para as lojas.
  const cat = await db
    .from("catalog_products")
    .insert({ name: `TESTE UI item ${tag}`, category: "Teste", storage: "seco", count_unit: "un", purchase_unit: "caixa", units_per_purchase: 6, cost_per_purchase: 12 })
    .select("id")
    .single();
  made.catalog.push(cat.data?.id);
  const catUpd = await db.from("catalog_products").update({ cost_per_purchase: 13 }).eq("id", cat.data?.id);
  const catDel = await db.from("catalog_products").delete().eq("id", cat.data?.id);
  check("lista padrão: criar, mudar custo e excluir", !cat.error && !catUpd.error && !catDel.error, cat.error?.message);

  // Contato de teste.
  const lead = await root.from("leads").insert({ name: `TESTE UI ${tag}`, phone: "11999990000" }).select("id").single();
  made.leads.push(lead.data?.id);
  const handled = await db.from("leads").update({ handled: true }).eq("id", lead.data?.id).select("handled");
  const leadDel = await db.from("leads").delete().eq("id", lead.data?.id);
  check("contato: marcar atendido e apagar", handled.data?.[0]?.handled === true && !leadDel.error, lead.error?.message ?? handled.error?.message);

  // Plano com unidade não muda de duração (regra do site, conferida no app antes de salvar).
  const units = await db.from("stores").select("id", { count: "exact", head: true }).eq("plan_id", plan.data?.id);
  check("plano em uso tem unidade ligada", (units.count ?? 0) === 1);
  const delUsed = await db.from("plans").delete().eq("id", plan.data?.id);
  check("plano com unidade não é excluído", delUsed.error?.code === "23503", delUsed.error?.code);
} finally {
  // Limpeza: tudo que este teste criou.
  for (const id of made.stores) {
    await root.from("purchase_order_items").delete().eq("store_id", id);
    await root.from("stores").delete().eq("id", id);
  }
  for (const id of made.users) await root.auth.admin.deleteUser(id);
  for (const id of made.plans.filter(Boolean)) await root.from("plans").delete().eq("id", id);
  for (const id of made.catalog.filter(Boolean)) await root.from("catalog_products").delete().eq("id", id);
  for (const id of made.leads.filter(Boolean)) await root.from("leads").delete().eq("id", id);
  const left = await root.from("profiles").select("id").like("email", `teste-ui-%${tag}@beststock.test`);
  check("limpeza: nada do teste ficou no banco", (left.data ?? []).length === 0, `${left.data?.length} perfis`);
}

console.log(failed ? `\n${failed} falharam.` : "\nTudo passou.");
process.exit(failed ? 1 : 0);
