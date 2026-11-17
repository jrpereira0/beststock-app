// Confere a rota de relatórios do app e gera as planilhas com o mesmo código do app (src/lib/site/xlsx.ts).
// Rode depois de "teste-ui.mjs criar":
//   node --experimental-strip-types scripts/teste-relatorios.mjs <arquivo-das-senhas.json> [endereço do site] [pasta para salvar]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const site = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const out = process.argv[4];
const { toXlsx } = await import("../src/lib/site/xlsx.ts");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
};
async function token(who) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await db.auth.signInWithPassword(seed.logins[who]);
  return { db, token: data.session.access_token };
}
const get = async (path, t) => {
  const res = await fetch(`${site}${path}`, { headers: { Authorization: `Bearer ${t}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const manager = await token("gerente");
const staff = await token("funcionario");
const { data: inv } = await manager.db.from("inventories").select("id").eq("store_id", seed.storeId).eq("status", "closed").limit(1).single();

if (out) mkdirSync(out, { recursive: true });
for (const [kind, query] of [["modelo", ""], ["contagem", `?id=${inv.id}`], ["consumo", ""], ["compras", ""]]) {
  const res = await get(`/api/app/relatorio/${kind}${query}`, manager.token);
  const report = res.body.report;
  const ok = res.status === 200 && report?.columns?.length > 0;
  check(`gerente recebe o relatório ${kind}`, ok || (kind === "consumo" && res.status === 404), JSON.stringify(res.body).slice(0, 160));
  if (!ok) continue;
  const bytes = toXlsx(report);
  // Um .xlsx é um zip: começa com "PK".
  check(`planilha ${kind} gerada (${report.rows.length} linhas)`, bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.length > 500);
  if (out) writeFileSync(join(out, `${report.filename}.xlsx`), bytes);
}
check("funcionário recebe a planilha em branco", (await get("/api/app/relatorio/modelo", staff.token)).status === 200);
check("funcionário não recebe a lista de compras (tem valores)", (await get("/api/app/relatorio/compras", staff.token)).status === 404);
check("sem login a rota recusa", (await fetch(`${site}/api/app/relatorio/modelo`)).status === 401);

console.log(failed ? `\n${failed} falharam.` : "\nTudo passou.");
process.exit(failed ? 1 : 0);
