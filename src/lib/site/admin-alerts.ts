// Copiado de beststock/src/lib/admin-alerts.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// Avisos do administrador a partir do que o banco já separou (função admin_alerts), com os mesmos textos de
// antes. Sem dependências do servidor: o site e o app usam a mesma.
import { brl, dueText, monthLabel } from "./billing";
import { formatDate } from "./dates";
import type { Alert } from "../alert";

export type AdminAlertItem =
  | {
      kind: "payment";
      id: string;
      store_id: string;
      store_name: string;
      description: string;
      reference_month: string;
      amount: number;
      due_date: string;
      overdue: boolean;
    }
  | { kind: "nobilling"; store_id: string; store_name: string }
  | { kind: "nocount"; store_id: string; store_name: string; last: string | null; since: number }
  | { kind: "blocked"; store_id: string; store_name: string; reason: string | null };

export type AdminAlertsResult = { total: number; items: AdminAlertItem[] };

/** `leads`: pedidos de demonstração ainda não atendidos. As rotas são as mesmas no site e no app. */
export function buildAdminAlerts(res: AdminAlertsResult | null, leads: number, today: string): Alert[] {
  const alerts: Alert[] = [];
  if (leads > 0) {
    alerts.push({
      id: "leads-open",
      tone: "warn",
      title: leads === 1 ? "1 pedido de demonstração para responder" : `${leads} pedidos de demonstração para responder`,
      text: "Veio da página de apresentação do sistema.",
      href: "/admin/contatos",
    });
  }
  for (const it of res?.items ?? []) {
    const href = `/admin/lojas/${it.store_id}`;
    if (it.kind === "payment") {
      alerts.push({
        id: `pay-${it.id}`,
        tone: it.overdue ? "danger" : "warn",
        title: `${it.store_name}: ${it.description.toLowerCase()} de ${monthLabel(it.reference_month)} ${it.overdue ? "em atraso" : "perto de vencer"}`,
        text: `${brl.format(Number(it.amount))}, ${dueText(it.due_date, today)}.`,
        href,
      });
    } else if (it.kind === "nobilling") {
      alerts.push({
        id: `nobilling-${it.store_id}`,
        tone: "warn",
        title: `${it.store_name} está sem cobrança`,
        text: "A unidade entra no sistema, mas o plano não gera cobrança.",
        href: `${href}?aba=plano`,
      });
    } else if (it.kind === "nocount") {
      alerts.push({
        id: `nocount-${it.store_id}`,
        tone: "warn",
        title: `${it.store_name} está sem contar o estoque`,
        text: it.last ? `Última contagem em ${formatDate(it.last)}, há ${it.since} dias.` : `Nenhuma contagem em ${it.since} dias.`,
        href,
      });
    } else {
      alerts.push({
        id: `blocked-${it.store_id}`,
        tone: "info",
        title: `${it.store_name} está bloqueada`,
        text: it.reason ? `Motivo: ${it.reason}` : undefined,
        href,
      });
    }
  }
  // Mais avisos do que os mostrados: o último diz quantos faltam.
  const shown = res?.items.length ?? 0;
  const rest = (res?.total ?? 0) - shown;
  if (rest > 0) {
    alerts.push({
      id: "more",
      tone: "info",
      title: rest === 1 ? "Mais 1 aviso" : `Mais ${rest} avisos`,
      text: "Veja as unidades e as cobranças para o resto.",
      href: "/admin/lojas",
    });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => order[a.tone] - order[b.tone]);
}
