import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useProfile } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

type Icon = ComponentProps<typeof Ionicons>["name"];
function icon(name: Icon) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  }
  return TabIcon;
}

/** As mesmas abas do site: o funcionário não vê Compras (valores e pedidos ficam com o gerente). */
export default function TabsLayout() {
  const profile = useProfile();
  const manager = profile.access === "gerente";
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
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="inventario" options={{ title: "Inventário", tabBarIcon: icon("clipboard-outline") }} />
      <Tabs.Screen name="entradas" options={{ title: "Entradas", tabBarIcon: icon("cube-outline") }} />
      <Tabs.Screen name="compras" options={{ title: "Compras", tabBarIcon: icon("cart-outline"), href: manager ? undefined : null }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
