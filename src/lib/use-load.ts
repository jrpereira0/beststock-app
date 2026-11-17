import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Offline } from "./data";

/**
 * Carrega os dados de uma tela toda vez que ela aparece (o que mudou no site aparece aqui) e no
 * "puxar para atualizar". Sem internet, mostra o que foi guardado no aparelho, se houver.
 */
export function useLoad<T>(load: () => Promise<{ data: T; fromCache: boolean }>) {
  const [data, setData] = useState<T | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const run = useCallback(async () => {
    try {
      const res = await loadRef.current();
      setData(res.data);
      setFromCache(res.fromCache);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Offline
          ? "Sem internet, e esta tela ainda não foi aberta neste aparelho. Conecte o celular."
          : e instanceof Error && e.message
            ? e.message
            : "Não foi possível carregar.",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run();
    }, [run]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  }, [run]);

  return { data, fromCache, error, refreshing, refresh, reload: run, setData };
}
