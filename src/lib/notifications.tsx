// Notificações da loja, com as mesmas regras do site (lib/notifications.ts, loadStoreAlerts):
// cobrança vencida ou perto de vencer, contagem aberta ou atrasada, pedido atrasado, pendências de
// cadastro e avisos do administrador. O funcionário só recebe o que ele resolve.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Alert } from "./alert";
import type { Profile } from "./auth";
import { cached, check, Offline } from "./data";
import { computePlan } from "./data-compras";
import { daysBetween, formatDate, today } from "./dates";
import { isNetworkError } from "./queue.ts";
import { brl, dueText, monthLabel, situation } from "./site/billing";
import { nextCount } from "./site/inventory-status";
import { setupAlerts, setupFacts } from "./site/setup";
import type { Announcement, Payment } from "./site/types";
import { supabase } from "./supabase";

export type Notifications = { alerts: Alert[]; read: Announcement[] };

export async function loadNotifications(profile: Profile) {
  const storeId = profile.store.id;
  return cached(`beststock:notificacoes:${profile.id}`, async (): Promise<Notifications> => {
    const now = today();
    const manager = profile.access === "gerente";
    // Cobranças: garante as do mês (a função do banco nunca duplica) antes de ler.
    if (manager) await supabase.rpc("generate_due_charges");
    const [payRes, invRes, annRes, readRes, plan, suppliersRes, closedRes, lateRes] = await Promise.all([
      manager
        ? supabase.from("payments").select("id, reference_month, description, amount, due_date, status").eq("store_id", storeId).eq("status", "pendente").order("due_date")
        : Promise.resolve({ data: [], error: null }),
      supabase.from("inventories").select("id, counted_on, status").eq("store_id", storeId).order("counted_on", { ascending: false }).limit(5),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("announcement_reads").select("announcement_id").eq("profile_id", profile.id),
      computePlan(storeId, profile.store.count_interval_days),
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      supabase.from("inventories").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "closed"),
      supabase
        .from("purchase_orders")
        .select("id, supplier_id, storage, expected_on, suppliers(name)")
        .eq("store_id", storeId)
        .eq("status", "open")
        .lt("expected_on", now),
    ]);
    if (invRes.error && isNetworkError(invRes.error)) throw new Offline();
    const alerts: Alert[] = [];

    for (const p of (check(payRes) ?? []) as Payment[]) {
      const s = situation(p, now);
      if (s !== "atrasado" && s !== "vence_logo") continue;
      alerts.push({
        id: `pay-${p.id}`,
        tone: s === "atrasado" ? "danger" : "warn",
        title:
          s === "atrasado"
            ? `${p.description} de ${monthLabel(p.reference_month)} em atraso`
            : `${p.description} de ${monthLabel(p.reference_month)} perto de vencer`,
        text: `${brl.format(Number(p.amount))}, ${dueText(p.due_date, now)}.`,
        href: "/financeiro",
      });
    }

    const inventories = (check(invRes) ?? []) as { id: string; counted_on: string; status: string }[];
    const draft = inventories.find((i) => i.status === "draft");
    const lastClosed = inventories.find((i) => i.status === "closed");
    if (draft && daysBetween(draft.counted_on, now) >= 2) {
      alerts.push({
        id: `draft-${draft.id}`,
        tone: "warn",
        title: "Contagem aberta sem fechar",
        text: `A contagem de ${formatDate(draft.counted_on)} ainda não foi fechada.`,
        href: `/inventario/${draft.id}`,
      });
    }
    if (!draft) {
      const due = nextCount(lastClosed?.counted_on ?? null, profile.store.count_interval_days, now);
      if (due && (due.overdue || due.dueToday)) {
        alerts.push({
          id: "count-due",
          tone: due.overdue ? "danger" : "warn",
          title: due.overdue ? "Contagem do estoque atrasada" : "Hoje é dia de contagem",
          text: due.text,
          href: "/inventario",
        });
      }
    }

    for (const order of (check(lateRes) ?? []) as { id: string; supplier_id: string | null; storage: string; expected_on: string; suppliers: unknown }[]) {
      const kind = order.storage === "seco" ? "secos" : "gelados";
      const supplier = order.suppliers as { name: string } | { name: string }[] | null;
      const name = Array.isArray(supplier) ? supplier[0]?.name : supplier?.name;
      const who = order.supplier_id ? (name ?? "o fornecedor") : "sem fornecedor";
      alerts.push({
        id: `order-${order.id}`,
        tone: "warn",
        title: `Pedido de ${kind} para ${who} previsto para ${formatDate(order.expected_on)} ainda não chegou`,
        href: "/compras",
      });
    }

    alerts.push(
      ...setupAlerts(
        setupFacts(plan, {
          countIntervalDays: profile.store.count_interval_days,
          suppliers: suppliersRes.count ?? 0,
          closedCounts: closedRes.count ?? 0,
          today: now,
        }),
        { hasDraft: Boolean(draft) },
      ),
    );

    const read = new Set(((check(readRes) ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
    const announcements = (check(annRes) ?? []) as Announcement[];
    for (const a of announcements) {
      if (read.has(a.id)) continue;
      alerts.push({ id: `ann-${a.id}`, tone: a.level === "warn" ? "warn" : "info", title: a.title, text: a.body || undefined, announcementId: a.id });
    }

    // O funcionário só recebe o que ele resolve: contagem, entradas e os avisos do administrador.
    const visible = manager ? alerts : alerts.filter((a) => !a.href || a.href.startsWith("/inventario") || a.href.startsWith("/entradas"));
    return { alerts: visible, read: announcements.filter((a) => read.has(a.id)) };
  });
}

/** Marca avisos do administrador como lidos. Sem `id`, marca todos os visíveis (igual ao site). */
export async function markRead(profile: Profile, id?: string): Promise<string | null> {
  try {
    let ids = id ? [id] : [];
    if (!id) {
      const { data } = await supabase.from("announcements").select("id").limit(200);
      ids = (data ?? []).map((a) => a.id as string);
    }
    if (!ids.length) return null;
    const { error } = await supabase
      .from("announcement_reads")
      .upsert(ids.map((announcement_id) => ({ announcement_id, profile_id: profile.id })), { onConflict: "announcement_id,profile_id", ignoreDuplicates: true });
    if (error) return isNetworkError(error) ? "Sem internet. Conecte o celular para marcar como lido." : "Não foi possível marcar como lido.";
    return null;
  } catch {
    return "Sem internet. Conecte o celular para marcar como lido.";
  }
}

/** Endereço do site → tela do app onde se resolve. */
export function appRoute(href: string): string {
  if (href.startsWith("/inventario/")) return `/contagem/${href.slice("/inventario/".length)}`;
  return href;
}

type State = { data: Notifications | null; refresh: () => Promise<void> };
const Context = createContext<State>({ data: null, refresh: async () => undefined });

/** Mantém as notificações atualizadas: ao entrar, quando o app volta para a tela e a cada 5 minutos. */
export function NotificationsProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const [data, setData] = useState<Notifications | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await loadNotifications(profile);
      setData(res.data);
    } catch {
      // Sem internet e nada guardado: o sino fica sem número até a conexão voltar.
    } finally {
      busy.current = false;
    }
  }, [profile]);

  useEffect(() => {
    // Primeira carga logo depois de abrir, sem travar a tela que está aparecendo.
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 5 * 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const value = useMemo(() => ({ data, refresh }), [data, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useNotifications = () => useContext(Context);
