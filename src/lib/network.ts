import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/** Está com internet? Começa como "sim" e corrige assim que o aparelho responde. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        // isInternetReachable pode vir null enquanto o aparelho testa: só conta "sem internet" quando tem certeza.
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    [],
  );
  return online;
}

/** Chama `fn` toda vez que a internet volta. */
export function onReconnect(fn: () => void): () => void {
  let wasOnline: boolean | null = null;
  return NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    if (online && wasOnline === false) fn();
    wasOnline = online;
  });
}
