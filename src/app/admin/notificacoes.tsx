import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { NotificationsSkeleton } from "@/components/skeleton";
import { T } from "@/components/ui";
import type { Alert } from "@/lib/alert";
import { useAdminAlerts } from "@/lib/admin-alerts";
import { colors } from "@/lib/theme";

const TONE = {
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: "warning" },
  warn: { bg: colors.brandSoft, fg: colors.brandDark, icon: "warning" },
  info: { bg: "#e6effa", fg: "#1f5fa8", icon: "information-circle" },
} as const;

/** Notificações do administrador, como no sino do site: cobranças, unidades sem cobrança, paradas e bloqueadas. */
export default function AdminNotificacoes() {
  const { alerts, refresh } = useAdminAlerts();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function open(a: Alert) {
    if (!a.href) return;
    router.back();
    setTimeout(() => router.push(a.href as never), 50);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.card }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <T color={colors.muted}>Cobranças em atraso ou perto de vencer, unidades sem cobrança e unidades paradas.</T>
      </View>
      {!alerts && <NotificationsSkeleton />}
      {alerts && alerts.length === 0 && (
        <View style={{ alignItems: "center", paddingHorizontal: 32, paddingTop: 40, gap: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.okSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark-circle" size={34} color={colors.ok} />
          </View>
          <T weight="extrabold" size={19}>Tudo em dia</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Nenhuma notificação agora. Quando houver algo importante, o sino avisa.</T>
        </View>
      )}
      {alerts?.map((a) => {
        const t = TONE[a.tone];
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            onPress={() => open(a)}
            style={({ pressed }) => ({ paddingHorizontal: 20, paddingVertical: 14, backgroundColor: pressed ? colors.bg : colors.card, borderTopWidth: 1, borderTopColor: colors.line })}
          >
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={t.icon} size={20} color={t.fg} />
              </View>
              <View style={{ flex: 1, paddingTop: 2 }}>
                <T weight="semibold">{a.title}</T>
                {a.text ? <T size={14} color={colors.muted}>{a.text}</T> : null}
              </View>
              {a.href ? <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginTop: 10 }} /> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
