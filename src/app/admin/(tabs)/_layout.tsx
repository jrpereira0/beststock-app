import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { colors, font } from "@/lib/theme";

type Icon = ComponentProps<typeof Ionicons>["name"];
function icon(name: Icon) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  }
  return TabIcon;
}

export const unstable_settings = { initialRouteName: "painel" };

/** As mesmas abas do administrador no site: visão geral, unidades, planos, cobranças e mais. */
export default function AdminTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.brandSoft,
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="painel" options={{ title: "Visão geral", tabBarIcon: icon("grid-outline") }} />
      <Tabs.Screen name="lojas" options={{ title: "Unidades", tabBarIcon: icon("storefront-outline") }} />
      <Tabs.Screen name="planos" options={{ title: "Planos", tabBarIcon: icon("wallet-outline") }} />
      <Tabs.Screen name="cobrancas" options={{ title: "Cobranças", tabBarIcon: icon("cash-outline") }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
