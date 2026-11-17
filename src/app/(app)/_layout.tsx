import { Stack } from "expo-router";
import { colors, font } from "@/lib/theme";

export default function AppLayout() {
  return (
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="contagem/[id]" options={{ title: "Contagem" }} />
      <Stack.Screen name="lancar" options={{ title: "Lançar" }} />
    </Stack>
  );
}
