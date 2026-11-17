// Confere as rotas que o site oferece ao app (login com a trava e logins da loja), com os logins de teste.
//   node scripts/teste-rotas.mjs <arquivo-das-senhas.json> [endereço do site, padrão http://localhost:3000]
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const site = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${label}${!ok && detail ? `  (${detail})` : ""}`);
};
const post = async (path, data, token) => {
  const res = await fetch(`${site}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const get = async (path, token) => {
  const res = await fetch(`${site}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const wrong = await post("/api/app/login", { email: seed.logins.funcionario.email, password: "senha-errada-1" });
check("senha errada: mensagem genérica", wrong.status === 401 && wrong.body.error === "E-mail ou senha incorretos.", JSON.stringify(wrong));

const staff = await post("/api/app/login", seed.logins.funcionario);
check("funcionário entra e recebe a sessão", staff.status === 200 && Boolean(staff.body.access_token), JSON.stringify(staff.body));
const manager = await post("/api/app/login", seed.logins.gerente);
check("gerente entra", manager.status === 200 && Boolean(manager.body.access_token));

const noToken = await get("/api/app/logins");
check("sem login a rota recusa", noToken.status === 401);
const staffList = await get("/api/app/logins", staff.body.access_token);
check("funcionário não mexe em logins", staffList.status === 403, String(staffList.status));

const token = manager.body.access_token;
const list = await get("/api/app/logins", token);
check("gerente lista os logins da loja", list.status === 200 && list.body.logins?.length === 2, JSON.stringify(list.body));

const email = seed.logins.gerente.email.replace("teste-ui-gerente-", "teste-ui-extra-");
const add = await post("/api/app/logins", { action: "add", name: "Extra Teste", email, password: "curta", access: "funcionario" }, token);
check("senha curta é recusada", add.status === 400 && /8 caracteres/.test(add.body.error ?? ""), JSON.stringify(add.body));
const add2 = await post("/api/app/logins", { action: "add", name: "Extra Teste", email, password: "senha-longa-123", access: "funcionario" }, token);
check("gerente cria login de funcionário", add2.status === 200, JSON.stringify(add2.body));
const after = await get("/api/app/logins", token);
const extra = after.body.logins?.find((l) => l.email === email);
check("login novo aparece na lista", Boolean(extra));
const me = after.body.logins?.find((l) => l.email === seed.logins.gerente.email);
const demote = await post("/api/app/logins", { action: "update", id: me?.id, name: "Gerente Teste", access: "funcionario", password: "" }, token);
check("gerente não muda o próprio acesso", demote.status === 400, JSON.stringify(demote.body));
const rename = await post("/api/app/logins", { action: "update", id: extra?.id, name: "Extra Renomeado", access: "funcionario", password: "" }, token);
check("gerente renomeia o login", rename.status === 200, JSON.stringify(rename.body));
const remove = await post("/api/app/logins", { action: "remove", id: extra?.id }, token);
check("gerente remove o login", remove.status === 200, JSON.stringify(remove.body));

console.log(failed ? `\n${failed} falharam.` : "\nTudo passou.");
process.exit(failed ? 1 : 0);
