// Notificações do administrador (as mesmas do sino do site), atualizadas ao abrir, ao voltar para o app
// e a cada 5 minutos.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Alert } from "./alert";
import { loadAdminAlerts } from "./data-admin";

type State = { alerts: Alert[] | null; refresh: () => Promise<void> };
const Context = createContext<State>({ alerts: null, refresh: async () => undefined });

export function AdminAlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setAlerts((await loadAdminAlerts()).data);
    } catch {
      // Sem internet e nada guardado: o sino fica sem número até a conexão voltar.
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
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
  const value = useMemo(() => ({ alerts, refresh }), [alerts, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useAdminAlerts = () => useContext(Context);
