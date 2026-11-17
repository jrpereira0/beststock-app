import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useProfile } from "@/lib/auth";
import { onReconnect } from "@/lib/network";
import { NotificationsProvider } from "@/lib/notifications";
import { warmStoreCache } from "@/lib/prefetch";
import { colors, font } from "@/lib/theme";

export default function AppLayout() {
  const profile = useProfile();
  // Ao entrar, ao voltar para o app e quando a internet volta: guarda as telas para usar sem sinal.
  useEffect(() => {
    void warmStoreCache(profile, true);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void warmStoreCache(profile);
    });
    const net = onReconnect(() => void warmStoreCache(profile, true));
    return () => {
      app.remove();
      net();
    };
  }, [profile]);
  return (
    <NotificationsProvider profile={profile}>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: font.bold, fontSize: 18 },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Início" }} />
      <Stack.Screen name="contagem/[id]" options={{ title: "Contagem" }} />
      <Stack.Screen name="lancar" options={{ title: "Lançar" }} />
      <Stack.Screen name="notificacoes" options={{ title: "Notificações", presentation: "modal" }} />
    </Stack>
    </NotificationsProvider>
  );
}
