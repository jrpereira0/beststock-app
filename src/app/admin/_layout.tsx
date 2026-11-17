import { Stack } from "expo-router";
import { AdminAlertsProvider } from "@/lib/admin-alerts";
import { colors, font } from "@/lib/theme";

export const unstable_settings = { initialRouteName: "(tabs)" };

/** Painel do administrador da rede: as mesmas telas do site em /admin. */
export default function AdminLayout() {
  return (
    <AdminAlertsProvider>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Visão geral" }} />
        <Stack.Screen name="notificacoes" options={{ title: "Notificações", presentation: "modal" }} />
      </Stack>
    </AdminAlertsProvider>
  );
}
