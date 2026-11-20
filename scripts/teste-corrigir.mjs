// Confere o "corrigir lançamento" (data e quantidade) no banco, com o mesmo código do app
// (src/lib/movement-update.ts) e logins de teste de verdade. Rode depois de "teste-ui.mjs criar":
//   node --experimental-strip-types --env-file=../beststock/.env.local scripts/teste-corrigir.mjs <arquivo-das-senhas.json>
// Tudo o que cria fica na loja "TESTE UI", que "teste-ui.mjs apagar" remove.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const { moveDayWith, updateMovementWith } = await import("../src/lib/movement-update.ts");
const { addDays, today } = await import("../src/lib/dates.ts");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const storeId = seed.storeId;
const now = today();

let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
};
async function login(who) {
  const db = createClient(url, key, opts);
  const { data, error } = await db.auth.signInWithPassword(seed.logins[who]);
  if (error) throw new Error(`login ${who}: ${error.message}`);
  return { db, userId: data.user.id };
}

const { db, userId } = await login("gerente");
const { data: products } = await db.from("products").select("id, units_per_purchase").eq("store_id", storeId).gt("units_per_purchase", 1).limit(2);
const [p1, p2] = products ?? [];
if (!p1) throw new Error("A loja de teste precisa de um produto com mais de uma unidade por embalagem.");
const upp = Number(p1.units_per_purchase);
const read = async (id) => (await db.from("movements").select("moved_on, quantity, packages, after_count").eq("id", id).single()).data;
const insert = async (row) =>
  (await db.from("movements").insert({ store_id: storeId, created_by: userId, ...row }).select("id").single()).data.id;

// Entrada: muda a data e a quantidade (em embalagens).
const entrada = await insert({ product_id: p1.id, kind: "entrada", moved_on: addDays(now, -2), quantity: 2 * upp, packages: 2, after_count: false });
check("corrige data e quantidade da entrada", (await updateMovementWith(db, storeId, entrada, addDays(now, -3), "3")) === null);
let m = await read(entrada);
check("entrada gravada em unidades", m.moved_on === addDays(now, -3) && Number(m.quantity) === 3 * upp && Number(m.packages) === 3, JSON.stringify(m));
check("data no futuro é recusada", (await updateMovementWith(db, storeId, entrada, addDays(now, 1), "3"))?.includes("futuro"));
check("quantidade zero é recusada", (await updateMovementWith(db, storeId, entrada, now, "0"))?.includes("maior que zero"));

// Perda: a quantidade já é em unidades de contagem, com vírgula.
const perda = await insert({ product_id: p1.id, kind: "perda", moved_on: addDays(now, -1), quantity: 1, packages: null });
check("corrige a perda", (await updateMovementWith(db, storeId, perda, addDays(now, -1), "1,5")) === null);
m = await read(perda);
check("perda gravada em unidades", Number(m.quantity) === 1.5 && m.packages === null, JSON.stringify(m));

// Entrada que baixou pedido de compra: a quantidade não muda; a data sim.
const { data: item } = await db.from("purchase_order_items").select("id").eq("order_id", seed.orderId).limit(1).single();
const ligada = await insert({ product_id: p1.id, kind: "entrada", moved_on: addDays(now, -2), quantity: upp, packages: 1, after_count: false });
const rec = await db.from("purchase_order_receipts").insert({ store_id: storeId, movement_id: ligada, item_id: item.id, quantity: upp });
check("recebimento de pedido registrado (preparação)", !rec.error, rec.error?.message);
check("entrada ligada a pedido não muda a quantidade", (await updateMovementWith(db, storeId, ligada, addDays(now, -2), "5"))?.includes("pedido de compra"));
check("entrada ligada a pedido muda a data", (await updateMovementWith(db, storeId, ligada, addDays(now, -4), "1")) === null);

// Mudar para o dia de uma contagem que já contou o produto: a entrada fica fora daquela contagem.
const day = addDays(now, -5);
const inv = await db.from("inventories").insert({ store_id: storeId, counted_on: day, status: "draft", created_by: userId }).select("id").single();
check("contagem de teste aberta (preparação)", !inv.error, inv.error?.message);
if (inv.data) {
  const it = await db.from("inventory_items").insert({ inventory_id: inv.data.id, store_id: storeId, product_id: p1.id, quantity: 4, counted_by: userId });
  check("produto contado (preparação)", !it.error, it.error?.message);
  await updateMovementWith(db, storeId, entrada, day, "3");
  check("entrada no dia da contagem fica fora dela", (await read(entrada)).after_count === true);
  if (p2) {
    const outra = await insert({ product_id: p2.id, kind: "entrada", moved_on: addDays(now, -2), quantity: Number(p2.units_per_purchase), packages: 1, after_count: true });
    await updateMovementWith(db, storeId, outra, day, "1");
    check("produto não contado naquele dia entra na contagem", (await read(outra)).after_count === false);
  }
  // Dia inteiro: entradas e perda de um dia vão juntas para o dia da contagem.
  const from = addDays(now, -6);
  const d1 = await insert({ product_id: p1.id, kind: "entrada", moved_on: from, quantity: upp, packages: 1, after_count: false });
  const d2 = p2 ? await insert({ product_id: p2.id, kind: "entrada", moved_on: from, quantity: Number(p2.units_per_purchase), packages: 1, after_count: true }) : null;
  const d3 = await insert({ product_id: p1.id, kind: "perda", moved_on: from, quantity: 1, packages: null });
  const ids = [d1, d2, d3].filter(Boolean);
  check("muda a data do dia inteiro", (await moveDayWith(db, storeId, ids, from, day)) === null);
  const moved = await Promise.all(ids.map(read));
  check("todos foram para o dia novo", moved.every((x) => x.moved_on === day), JSON.stringify(moved));
  check("entrada do produto contado fica fora da contagem", moved[0].after_count === true);
  if (d2) check("entrada do produto não contado entra na contagem", moved[1].after_count === false);
  check("dia inteiro: futuro recusado", (await moveDayWith(db, storeId, ids, day, addDays(now, 1)))?.includes("futuro"));
  check("dia inteiro: sem login não muda", (await moveDayWith(createClient(url, key, opts), storeId, ids, day, from)) !== null);
  check("dia inteiro: continua no dia novo", (await read(d1)).moved_on === day);

  await db.from("inventory_items").delete().eq("inventory_id", inv.data.id);
  await db.from("inventories").delete().eq("id", inv.data.id);
}

// Funcionário corrige (como exclui); sem login, nada acontece.
const staff = await login("funcionario");
check("funcionário corrige", (await updateMovementWith(staff.db, storeId, perda, addDays(now, -1), "2")) === null);
const anon = createClient(url, key, opts);
check("sem login não corrige", (await updateMovementWith(anon, storeId, perda, addDays(now, -1), "9")) !== null);
check("valor continua o do funcionário", Number((await read(perda)).quantity) === 2);

// Limpeza: os lançamentos de teste (o banco devolve ao pedido o que a entrada tinha abatido).
await db.from("movements").delete().eq("store_id", storeId).eq("created_by", userId);
const { count } = await db.from("movements").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("created_by", userId);
check("limpeza: lançamentos de teste apagados", count === 0);

console.log(failed ? `\n${failed} falharam.` : "\nTudo passou.");
process.exit(failed ? 1 : 0);
