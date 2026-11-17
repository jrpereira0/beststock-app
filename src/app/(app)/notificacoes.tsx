import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert as Dialog, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { LoadingMark } from "@/components/loading-mark";
import { T } from "@/components/ui";
import type { Alert } from "@/lib/alert";
import { useProfile } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { appRoute, markRead, useNotifications } from "@/lib/notifications";
import { colors } from "@/lib/theme";

const TONE = {
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: "warning" },
  warn: { bg: colors.brandSoft, fg: colors.brandDark, icon: "warning" },
  info: { bg: "#e6effa", fg: "#1f5fa8", icon: "information-circle" },
} as const;

function Heading({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 }}>
      <T weight="bold" size={12} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1 }}>{children}</T>
      {right}
    </View>
  );
}

/**
 * Notificações, como o painel do sino no site: o que precisa de atenção, os avisos do administrador
 * e os avisos já lidos. Tocar numa notificação leva à tela onde ela se resolve.
 */
export default function NotificacoesScreen() {
  const profile = useProfile();
  const { data, refresh } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const alerts = data?.alerts ?? [];
  const attention = alerts.filter((a) => !a.announcementId);
  const notices = alerts.filter((a) => a.announcementId);
  const read = data?.read ?? [];

  async function mark(id?: string) {
    setMarking(id ?? "todos");
    const err = await markRead(profile, id);
    if (err) Dialog.alert("Não marcou", err);
    await refresh();
    setMarking(null);
  }

  function open(a: Alert) {
    if (!a.href) return;
    router.back();
    // As abas são trocadas; as outras telas abrem por cima.
    const route = appRoute(a.href.split("?")[0]) + (a.href.includes("?") ? `?${a.href.split("?")[1]}` : "");
    setTimeout(() => router.push(route as never), 50);
  }

  const row = (a: Alert) => {
    const t = TONE[a.tone];
    const body = (
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={t.icon} size={20} color={t.fg} />
        </View>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <T weight="semibold">{a.title}</T>
          {a.text ? <T size={14} color={colors.muted}>{a.text}</T> : null}
          {a.announcementId && (
            <Pressable
              accessibilityRole="button"
              disabled={marking !== null}
              onPress={() => void mark(a.announcementId)}
              style={{ alignSelf: "flex-start", marginTop: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: "center", backgroundColor: colors.card }}
            >
              <T weight="bold" size={14}>{marking === a.announcementId ? "Marcando…" : "Marcar como lido"}</T>
            </Pressable>
          )}
        </View>
        {a.href ? <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginTop: 10 }} /> : null}
      </View>
    );
    return a.href ? (
      <Pressable key={a.id} accessibilityRole="button" onPress={() => open(a)} style={({ pressed }) => ({ paddingHorizontal: 20, paddingVertical: 14, backgroundColor: pressed ? colors.bg : colors.card, borderTopWidth: 1, borderTopColor: colors.line })}>
        {body}
      </Pressable>
    ) : (
      <View key={a.id} style={{ paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
        {body}
      </View>
    );
  };

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
      <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 4 }}>
        <T color={colors.muted}>O que precisa da sua atenção e os avisos do administrador.</T>
      </View>

      {!data && (
        <View style={{ alignItems: "center", paddingTop: 48 }}>
          <LoadingMark />
        </View>
      )}

      {data && alerts.length === 0 && (
        <View style={{ alignItems: "center", paddingHorizontal: 32, paddingTop: 48, gap: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.okSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark-circle" size={34} color={colors.ok} />
          </View>
          <T weight="extrabold" size={19}>Tudo em dia</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Nenhuma notificação agora. Quando houver algo importante, o sino avisa.</T>
        </View>
      )}

      {attention.length > 0 && (
        <View>
          <Heading>Precisa de atenção</Heading>
          {attention.map(row)}
        </View>
      )}

      {notices.length > 0 && (
        <View>
          <Heading
            right={
              notices.length > 1 ? (
                <Pressable accessibilityRole="button" disabled={marking !== null} onPress={() => void mark()} style={{ minHeight: 32, justifyContent: "center" }}>
                  <T weight="bold" size={14} style={{ textDecorationLine: "underline" }}>{marking === "todos" ? "Marcando…" : "Marcar todos como lidos"}</T>
                </Pressable>
              ) : undefined
            }
          >
            Avisos do administrador
          </Heading>
          {notices.map(row)}
        </View>
      )}

      {read.length > 0 && (
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showRead }}
            onPress={() => setShowRead((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, minHeight: 52 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="notifications-outline" size={16} color={colors.muted} />
              <T weight="bold" size={14} color={colors.muted}>Avisos já lidos ({read.length})</T>
            </View>
            <Ionicons name={showRead ? "chevron-down" : "chevron-forward"} size={16} color={colors.muted} />
          </Pressable>
          {showRead &&
            read.map((a) => (
              <View key={a.id} style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
                <T weight="semibold" color={colors.muted}>{a.title}</T>
                {a.body ? <T size={14} color={colors.muted}>{a.body}</T> : null}
                <T size={12} weight="semibold" color={colors.muted}>{formatDate(a.created_at.slice(0, 10))}</T>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}
