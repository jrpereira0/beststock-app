import Ionicons from "@expo/vector-icons/Ionicons";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { PaymentList } from "@/components/admin-payments";
import { Card, SectionTitle, T } from "@/components/ui";
import { Page, Stat } from "@/components/widgets";
import { useAdminAlerts } from "@/lib/admin-alerts";
import { loadPanel, type PaymentRow } from "@/lib/data-admin";
import { today } from "@/lib/dates";
import { brl, firstOfMonth, monthLabel } from "@/lib/site/billing";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const TONE = { danger: colors.danger, warn: colors.brandDark, info: "#1f5fa8" } as const;

/** Visão geral da rede, como admin/painel do site. */
export default function PainelScreen() {
  const { refresh: refreshAlerts } = useAdminAlerts();
  const load = useCallback(async () => {
    const res = await loadPanel();
    void refreshAlerts();
    return res;
  }, [refreshAlerts]);
  const { data, fromCache, error, refreshing, refresh } = useLoad(load);
  const now = today();
  const month = firstOfMonth(now);

  // Os números vêm prontos do banco (admin_summary), valendo com qualquer número de unidades.
  const st = data?.summary.stores ?? { total: 0, active: 0, blocked: 0, unbilled: 0, overdue: 0 };
  const pay = data?.summary.payments;
  const recent: PaymentRow[] = data?.recent ?? [];
  const alerts = data?.alerts ?? [];
  const charges = (n: number) => `${n} ${n === 1 ? "cobrança" : "cobranças"}`;

  return (
    <Page
      tab="admin"
      title="Visão geral"
      subtitle={`Situação das unidades e das cobranças em ${monthLabel(month)}.`}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
      skeleton="dashboard"
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Unidades ativas" value={st.active} onPress={() => router.push("/admin/lojas?f=ativas")} />
        <Stat label="Bloqueadas" value={st.blocked} onPress={() => router.push("/admin/lojas?f=bloqueadas")} />
        <Stat
          label="Sem cobrança"
          value={st.unbilled}
          tone={st.unbilled > 0 ? "warn" : "neutral"}
          hint={st.unbilled === 1 ? "unidade ativa" : "unidades ativas"}
          onPress={() => router.push("/admin/lojas?f=sem-cobranca")}
        />
        <Stat label={`Recebido em ${monthLabel(month)}`} value={brl.format(Number(pay?.paid_month_amount ?? 0))} tone="ok" onPress={() => router.push("/admin/cobrancas?s=pago")} />
        <Stat label="A receber" value={brl.format(Number(pay?.open_amount ?? 0))} hint={charges(pay?.open_count ?? 0)} onPress={() => router.push("/admin/cobrancas?s=aberto")} />
        <Stat
          label="Em atraso"
          value={brl.format(Number(pay?.overdue_amount ?? 0))}
          tone={(pay?.overdue_count ?? 0) > 0 ? "danger" : "neutral"}
          hint={charges(pay?.overdue_count ?? 0)}
          onPress={() => router.push("/admin/cobrancas?s=atraso")}
        />
      </View>
      <Guide guide={GUIDES.painel} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <SectionTitle>Precisa da sua atenção</SectionTitle>
        {alerts.length > 6 && (
          <Pressable accessibilityRole="button" onPress={() => router.push("/admin/notificacoes")} style={{ minHeight: 36, justifyContent: "center" }}>
            <T weight="bold" size={14} style={{ textDecorationLine: "underline" }}>Ver todas ({alerts.length})</T>
          </Pressable>
        )}
      </View>
      {alerts.length === 0 ? (
        <Card style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
          <T weight="bold">Tudo em dia</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Nenhuma cobrança atrasada, nenhuma unidade ativa sem cobrança e nenhuma unidade parada.</T>
        </Card>
      ) : (
        alerts.slice(0, 6).map((a) => (
          <Pressable key={a.id} accessibilityRole="button" onPress={() => a.href && router.push(a.href as never)}>
            <Card style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Ionicons name={a.tone === "info" ? "information-circle" : "warning"} size={22} color={TONE[a.tone]} />
              <View style={{ flex: 1 }}>
                <T weight="semibold">{a.title}</T>
                {a.text ? <T size={14} color={colors.muted}>{a.text}</T> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        ))
      )}

      <SectionTitle>Últimos pagamentos recebidos</SectionTitle>
      {recent.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 24 }}>
          <T color={colors.muted}>Nenhum pagamento registrado ainda.</T>
        </Card>
      ) : (
        <PaymentList payments={recent} />
      )}
    </Page>
  );
}
