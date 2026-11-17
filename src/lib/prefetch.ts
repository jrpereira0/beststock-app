// Guarda no aparelho, com internet, as telas que a loja usa sem sinal: assim o Inventário, a contagem em
// andamento e os lançamentos abrem em modo avião mesmo que ninguém tenha aberto a tela antes.
import type { Profile } from "./auth";
import { loadCount, loadHome, loadMovementForm } from "./data";
import { loadHistory } from "./data-entradas";
import { loadInventories } from "./data-inventario";

let running = false;
let last = 0;

export async function warmStoreCache(profile: Profile, force = false) {
  // No máximo uma vez por minuto, a não ser que a internet tenha acabado de voltar.
  if (running || (!force && Date.now() - last < 60_000)) return;
  running = true;
  last = Date.now();
  try {
    const [home] = await Promise.allSettled([
      loadHome(profile),
      loadInventories(profile),
      loadHistory(profile),
      loadMovementForm(profile, "entrada"),
      loadMovementForm(profile, "perda"),
    ]);
    // A contagem em andamento, com os produtos e os números da anterior, para contar sem sinal.
    if (home.status === "fulfilled" && !home.value.fromCache && home.value.data.draft) {
      await loadCount(profile, home.value.data.draft.id).catch(() => undefined);
    }
  } finally {
    running = false;
  }
}
