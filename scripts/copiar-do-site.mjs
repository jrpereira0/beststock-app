// Copia do site os arquivos de regra que não dependem do servidor (contas de compra, pedidos, nota fiscal,
// cobrança), para o app fazer exatamente as mesmas contas. Não edite os arquivos em src/lib/site à mão:
// mude no site e rode de novo:  node scripts/copiar-do-site.mjs [pasta-do-site]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const site = process.argv[2] ?? "../beststock";
const files = [
  "planning.ts",
  "order-receipt.ts",
  "order-dates.ts",
  "invoice.ts",
  "billing.ts",
  "dates.ts",
  "types.ts",
  "category-order.ts",
  "inventory-status.ts",
  "setup.ts",
  "network.ts",
  "xlsx.ts",
  "print-fit.ts",
];
// O tipo Alert do site mora em notifications.ts, que depende do servidor: no app ele fica em src/lib/alert.ts.
const rewrite = (text) => text.replace('from "./notifications"', 'from "../alert"');
mkdirSync("src/lib/site", { recursive: true });
for (const f of files) {
  const text = readFileSync(join(site, "src/lib", f), "utf8");
  writeFileSync(join("src/lib/site", f), `// Copiado de beststock/src/lib/${f} por scripts/copiar-do-site.mjs. Não edite aqui.\n${rewrite(text)}`);
  console.log(`copiado: ${f}`);
}
