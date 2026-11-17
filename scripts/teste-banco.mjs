// Confere, com um login de teste de verdade, que o banco aceita o que o app faz (e recusa o que deve).
// Usa só a chave pública, como o app. Rode depois de "teste-ui.mjs criar":
//   node --env-file=../beststock/.env.local scripts/teste-banco.mjs <arquivo-das-senhas.json>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function login(who) {
  const db = createClient(url, key, opts);
  const { data, error } = await db.auth.signInWithPassword(seed.logins[who]);
  if (error) throw new Error(`login ${who}: ${error.message}`);
  return { db, userId: data.user.id };
}

const { db, userId } = await login("funcionario");
const storeId = seed.storeId;

// Login errado: mesma mensagem genérica do Supabase.
const wrong = await createClient(url, key, opts).auth.signInWithPassword({ email: seed.logins.funcionario.email, password: "errada-123" });
check("senha errada não entra", Boolean(wrong.error) && wrong.error.status === 400, wrong.error?.message);

const profile = await db.from("profiles").select("id, role, store_id, access, stores(id, name, active, count_interval_days)").eq("id", userId).maybeSingle();
check("perfil com a loja na mesma consulta", profile.data?.access === "funcionario" && profile.data?.stores?.active === true, profile.error?.message);

// Abre a contagem de hoje.
const inv = await db.from("inventories").insert({ store_id: storeId, counted_on: today, created_by: userId }).select("id").single();
check("funcionário abre a contagem de hoje", !inv.error, inv.error?.message);
const second = await db.from("inventories").insert({ store_id: storeId, counted_on: "2020-01-01", created_by: userId });
check("não abre duas contagens ao mesmo tempo", second.error?.code === "23505", second.error?.code);

const { data: products } = await db.from("products").select("id, name").eq("store_id", storeId).eq("active", true);
const byName = Object.fromEntries(products.map((p) => [p.name, p.id]));
const save = (pid, quantity, stockout_on = null) =>
  db.from("inventory_items").upsert(
    { inventory_id: inv.data.id, store_id: storeId, product_id: pid, quantity, stockout_on, updated_at: new Date().toISOString(), counted_by: userId },
    { onConflict: "inventory_id,product_id" },
  );
const s1 = await save(byName["Açaí tradicional"], 5);
const s2 = await save(byName["Açaí tradicional"], 6);
check("salva e corrige um número", !s1.error && !s2.error, s1.error?.message ?? s2.error?.message);
const prevDay = new Date(Date.now() - 3 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const s3 = await save(byName["Paçoca"], 0, prevDay);
check("zero com Acabou em", !s3.error, s3.error?.message);
await save(byName["Granola"], 1);
const del = await db.from("inventory_items").delete().eq("inventory_id", inv.data.id).eq("product_id", byName["Granola"]).eq("store_id", storeId);
check("apagar o número volta a não contado", !del.error, del.error?.message);

// "Acabaram: marcar como zero" para o que ficou em branco.
const { data: items } = await db.from("inventory_items").select("product_id").eq("inventory_id", inv.data.id);
const counted = new Set(items.map((i) => i.product_id));
const zeros = products.filter((p) => !counted.has(p.id)).map((p) => ({
  inventory_id: inv.data.id, store_id: storeId, product_id: p.id, quantity: 0, updated_at: new Date().toISOString(), counted_by: userId,
}));
const z = await db.from("inventory_items").insert(zeros);
check("marca os que faltam como zero", !z.error, z.error?.message);

const closed = await db.from("inventories").update({ status: "closed", closed_at: new Date().toISOString(), closed_by: userId })
  .eq("id", inv.data.id).eq("store_id", storeId).eq("status", "draft").select("id");
check("funcionário fecha a contagem", closed.data?.length === 1, closed.error?.message);
const late = await save(byName["Colher"], 99);
check("contagem fechada não aceita número enviado depois", Boolean(late.error));

// Perda: grava direto, em unidades de contagem.
const loss = await db.from("movements").insert({
  store_id: storeId, product_id: byName["Granola"], kind: "perda", moved_on: today, quantity: 0.5, packages: null, after_count: null, created_by: userId,
});
check("lança perda", !loss.error, loss.error?.message);

// Entrada: pela função do banco, que dá baixa no pedido em aberto (12 baldes; chegam 2 caixas = 8).
const short = await db.rpc("register_movements", { p_kind: "entrada", p_moved_on: today, p_items: [{ product_id: byName["Açaí tradicional"], typed: 2, rest: null }] });
check("entrada menor que o pedido pergunta se o resto vem", short.error?.code === "P0001" && /resto ainda vem/.test(short.error.message), short.error?.message);
const entry = await db.rpc("register_movements", { p_kind: "entrada", p_moved_on: today, p_items: [{ product_id: byName["Açaí tradicional"], typed: 2, rest: "vem" }] });
check("lança entrada com baixa no pedido", !entry.error && entry.data === 1, entry.error?.message);
const { data: order } = await db.from("purchase_order_items").select("received_quantity, outstanding_quantity").eq("order_id", seed.orderId).single();
check("pedido abateu 8 baldes e ainda espera 4", Number(order?.received_quantity) === 8 && Number(order?.outstanding_quantity) === 4, JSON.stringify(order));
const { data: mv } = await db.from("movements").select("quantity, packages, after_count").eq("store_id", storeId).eq("kind", "entrada").single();
check("entrada em caixas virou baldes e marcou depois da contagem", Number(mv?.quantity) === 8 && Number(mv?.packages) === 2 && mv?.after_count === true, JSON.stringify(mv));
const rest = await db.rpc("register_movements", { p_kind: "entrada", p_moved_on: today, p_items: [{ product_id: byName["Açaí tradicional"], typed: 0.5, rest: "nao" }] });
const { data: ord } = await db.from("purchase_orders").select("status").eq("id", seed.orderId).single();
check("'não vai chegar' fecha o pedido", !rest.error && ord?.status === "closed", rest.error?.message ?? ord?.status);
const future = await db.rpc("register_movements", { p_kind: "entrada", p_moved_on: "2999-01-01", p_items: [{ product_id: byName["Granola"], typed: 1, rest: null }] });
check("data no futuro é recusada", future.error?.message === "A data não pode estar no futuro.", future.error?.message);

// ---- Gerente: compras, nota fiscal, cadastros, configurações e cobranças ----
const { db: gdb, userId: gid } = await login("gerente");
const planRes = await gdb.rpc("store_plan_data", { p_store: storeId, p_history: 8 });
const { buildPlan } = await import("../src/lib/site/planning.ts");
let plan = null;
try {
  const raw = planRes.data;
  const inventories = raw.inventories.map((inv) => ({
    counted_on: inv.counted_on,
    items: Object.fromEntries(inv.items.map((it) => [it.product_id, Number(it.quantity)])),
    stockouts: Object.fromEntries(inv.items.filter((it) => it.stockout_on).map((it) => [it.product_id, it.stockout_on])),
  }));
  plan = buildPlan({
    products: raw.products.map((p) => ({ ...p, units_per_purchase: Number(p.units_per_purchase), cost_per_purchase: Number(p.cost_per_purchase), min_stock: Number(p.min_stock) })),
    suppliers: raw.suppliers,
    inventories,
    movements: raw.movements.map((m) => ({ ...m, quantity: Number(m.quantity) })),
    countIntervalDays: 7,
    inTransit: raw.in_transit.map((t) => ({ ...t, quantity: Number(t.quantity) })),
    today,
  });
} catch (e) {
  plan = null;
  console.log(String(e));
}
check("gerente calcula a lista de compras como o site", !planRes.error && plan?.inventoryCount === 2 && plan.items.length === 8, planRes.error?.message);

const staffOrder = await db.from("purchase_orders").insert({ store_id: storeId, storage: "seco", ordered_on: today, expected_on: today });
check("funcionário não cria pedido", Boolean(staffOrder.error));
const newOrder = await gdb.from("purchase_orders").insert({ store_id: storeId, storage: "seco", ordered_on: today, expected_on: today }).select("id").single();
const oi = await gdb.from("purchase_order_items").insert({ order_id: newOrder.data?.id, store_id: storeId, product_id: byName["Granola"], packs: 2, ordered_quantity: 2, outstanding_quantity: 2 });
check("gerente registra pedido", !newOrder.error && !oi.error, newOrder.error?.message ?? oi.error?.message);
const cancel = await gdb.from("purchase_orders").update({ status: "cancelled" }).eq("id", newOrder.data?.id).eq("status", "open").select("id");
await gdb.from("purchase_order_items").update({ outstanding_quantity: 0 }).eq("order_id", newOrder.data?.id);
check("gerente cancela pedido", cancel.data?.length === 1, cancel.error?.message);

const noteKey = "3".repeat(44);
const inv2 = await gdb.from("imported_invoices").insert({ store_id: storeId, access_key: noteKey, number: "123", issuer_name: "TESTE UI", created_by: gid }).select("id").single();
const viaNote = await gdb.rpc("register_movements", { p_kind: "entrada", p_moved_on: today, p_items: [{ product_id: byName["Colher"], typed: 1, rest: null }], p_invoice_id: inv2.data?.id });
const { data: noteMv } = await gdb.from("movements").select("invoice_id, quantity").eq("product_id", byName["Colher"]).eq("kind", "entrada").single();
check("entrada pela nota fica ligada à nota", !viaNote.error && noteMv?.invoice_id === inv2.data?.id && Number(noteMv?.quantity) === 500, viaNote.error?.message ?? JSON.stringify(noteMv));
const again = await gdb.from("imported_invoices").insert({ store_id: storeId, access_key: noteKey, number: "123", issuer_name: "TESTE UI", created_by: gid });
check("a mesma nota não entra duas vezes", again.error?.code === "23505", again.error?.code);

const newProduct = await gdb.from("products").insert({ store_id: storeId, name: "TESTE UI Produto novo", storage: "seco", count_unit: "un", purchase_unit: "caixa", units_per_purchase: 12 }).select("id").single();
const editProduct = await gdb.from("products").update({ cost_per_purchase: 30, essential: true }).eq("id", newProduct.data?.id);
const delProduct = await gdb.from("products").delete().eq("id", newProduct.data?.id).eq("store_id", storeId);
check("gerente cria, edita e exclui produto", !newProduct.error && !editProduct.error && !delProduct.error, newProduct.error?.message ?? editProduct.error?.message ?? delProduct.error?.message);
const staffProduct = await db.from("products").insert({ store_id: storeId, name: "Invasor" });
check("funcionário não cadastra produto", Boolean(staffProduct.error));
const usedProduct = await gdb.from("products").delete().eq("id", byName["Granola"]).eq("store_id", storeId);
check("produto com histórico não é excluído", usedProduct.error?.code === "23503", usedProduct.error?.code);
const sup = await gdb.from("suppliers").insert({ store_id: storeId, name: "TESTE UI Outro", lead_time_days: 3, lead_time_dry_days: 5 }).select("id").single();
const supDel = await gdb.from("suppliers").delete().eq("id", sup.data?.id);
check("gerente cria e exclui fornecedor", !sup.error && !supDel.error, sup.error?.message ?? supDel.error?.message);
const settings = await gdb.rpc("update_my_store_settings", { p_count_interval_days: 7 });
check("gerente muda o período de contagem", !settings.error, settings.error?.message);
const charges = await gdb.rpc("generate_due_charges");
const pays = await gdb.from("payments").select("id").eq("store_id", storeId);
check("financeiro gera e lê as cobranças da loja", !charges.error && !pays.error, charges.error?.message ?? pays.error?.message);
const delMove = await gdb.from("movements").delete().eq("product_id", byName["Granola"]).eq("kind", "perda").eq("store_id", storeId).select("id");
check("excluir lançamento", delMove.data?.length === 1, delMove.error?.message);

// Outra loja não vê nada disso.
const anon = await createClient(url, key, opts).rpc("register_movements", { p_kind: "perda", p_moved_on: today, p_items: [] });
check("sem login não lança", Boolean(anon.error));

console.log(failed ? `\n${failed} falharam.` : "\nTudo passou.");
process.exit(failed ? 1 : 0);
