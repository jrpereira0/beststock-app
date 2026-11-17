// Cria e apaga uma loja de teste ("TESTE UI …") para experimentar o app sem tocar nas lojas reais.
// Precisa da chave secreta do Supabase, que fica só no computador (nunca no app nem no git):
//   node --env-file=../beststock/.env.local scripts/teste-ui.mjs criar  <arquivo-para-as-senhas.json>
//   node --env-file=../beststock/.env.local scripts/teste-ui.mjs apagar
// "apagar" remove todas as lojas com nome "TESTE UI" e os logins teste-ui-…@beststock.test.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (use --env-file com o .env.local do site).");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const iso = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const daysAgo = (n) => iso(new Date(Date.now() - n * 86_400_000));

async function criar(out) {
  const tag = randomBytes(3).toString("hex");
  const store = must(
    await admin.from("stores").insert({ name: `TESTE UI Loja do App ${tag}`, city: "Teste", count_interval_days: 7 }).select("id, name").single(),
    "loja",
  );
  const logins = {};
  for (const [access, name] of [
    ["gerente", "Gerente Teste"],
    ["funcionario", "Funcionário Teste"],
  ]) {
    const email = `teste-ui-${access}-${tag}@beststock.test`;
    const password = randomBytes(9).toString("base64url");
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "login");
    must(await admin.from("profiles").insert({ id: user.user.id, role: "store", store_id: store.id, name, email, access }), "perfil");
    logins[access] = { email, password };
  }
  const supplier = must(await admin.from("suppliers").insert({ store_id: store.id, name: "TESTE UI Fornecedor" }).select("id").single(), "fornecedor");
  const items = [
    ["Açaí tradicional", "Açaí", "balde", "caixa", 4, "gelado"],
    ["Açaí zero", "Açaí", "balde", "caixa", 4, "gelado"],
    ["Sorvete de creme", "Sorvetes", "pote", "pote", 1, "gelado"],
    ["Granola", "Acompanhamentos", "kg", "pacote", 1, "seco"],
    ["Leite em pó", "Acompanhamentos", "kg", "lata", 0.4, "seco"],
    ["Paçoca", "Acompanhamentos", "un", "caixa", 50, "seco"],
    ["Copo 300 ml", "Potes e copos", "un", "pacote", 100, "seco"],
    ["Colher", "Potes e copos", "un", "pacote", 500, "seco"],
  ];
  const products = must(
    await admin
      .from("products")
      .insert(
        items.map(([name, category, count_unit, purchase_unit, units_per_purchase, storage]) => ({
          store_id: store.id,
          supplier_id: supplier.id,
          name,
          category,
          count_unit,
          purchase_unit,
          units_per_purchase,
          storage,
          cost_per_purchase: 50,
        })),
      )
      .select("id, name"),
    "produtos",
  );
  const byName = Object.fromEntries(products.map((p) => [p.name, p.id]));
  // Contagem fechada de uma semana atrás: dá o "anterior", o máximo possível e o "Acabou em".
  const prev = must(
    await admin.from("inventories").insert({ store_id: store.id, counted_on: daysAgo(7), status: "draft" }).select("id").single(),
    "contagem anterior",
  );
  const qty = [8, 3, 12, 5, 2, 120, 900, 2000];
  must(
    await admin.from("inventory_items").insert(products.map((p, i) => ({ inventory_id: prev.id, store_id: store.id, product_id: p.id, quantity: qty[i] }))),
    "itens da contagem anterior",
  );
  must(await admin.from("inventories").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", prev.id), "fechar contagem");
  // Pedido em aberto, que já devia ter chegado: 3 caixas de açaí tradicional (12 baldes).
  const order = must(
    await admin
      .from("purchase_orders")
      .insert({ store_id: store.id, supplier_id: supplier.id, storage: "gelado", ordered_on: daysAgo(4), expected_on: daysAgo(2) })
      .select("id")
      .single(),
    "pedido",
  );
  must(
    await admin.from("purchase_order_items").insert({
      order_id: order.id,
      store_id: store.id,
      product_id: byName["Açaí tradicional"],
      packs: 3,
      ordered_quantity: 12,
      outstanding_quantity: 12,
    }),
    "item do pedido",
  );
  const result = { store: store.name, storeId: store.id, orderId: order.id, logins };
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`Criada: ${store.name}${out ? ` (logins em ${out})` : ""}`);
}

async function apagar() {
  const stores = must(await admin.from("stores").select("id, name").like("name", "TESTE UI%"), "lojas");
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = (list?.users ?? []).filter((u) => /^teste-ui-.*@beststock\.test$/.test(u.email ?? ""));
  for (const u of users) {
    await admin.from("profiles").delete().eq("id", u.id);
    must(await admin.auth.admin.deleteUser(u.id), "apagar login");
  }
  for (const s of stores) {
    // Itens de pedido seguram o produto (on delete restrict): saem antes da loja.
    await admin.from("purchase_order_items").delete().eq("store_id", s.id);
    must(await admin.from("stores").delete().eq("id", s.id), `apagar ${s.name}`);
  }
  console.log(`Apagadas ${stores.length} lojas e ${users.length} logins de teste.`);
}

const [cmd, out] = process.argv.slice(2);
if (cmd === "criar") await criar(out);
else if (cmd === "apagar") await apagar();
else console.log("Use: criar <arquivo.json> | apagar");
