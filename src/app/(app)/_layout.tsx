import { Stack } from "expo-router";
import { useProfile } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { colors, font } from "@/lib/theme";

export default function AppLayout() {
  const profile = useProfile();
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
