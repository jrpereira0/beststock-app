import { Stack } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { Card, Notice, SectionTitle, T } from "@/components/ui";
import { Badge, Page, Stat } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { loadFinance } from "@/lib/data-loja";
import { formatDate, today } from "@/lib/dates";
import { brl, dueText, monthLabel, PAYMENT_METHODS, planPrice, situation, SITUATION_LABEL } from "@/lib/site/billing";
import type { Payment } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function FinanceiroScreen() {
  const profile = useProfile();
  const load = useCallback(() => loadFinance(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh } = useLoad(load);
  const now = today();
  const payments = data?.payments ?? [];
  const open = payments.filter((p) => p.status === "pendente");
  const overdue = open.filter((p) => situation(p, now) === "atrasado");
  const next = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const sum = (list: Payment[]) => list.reduce((a, p) => a + Number(p.amount), 0);

  return (
    <Page
      subtitle="O plano da sua unidade, as cobranças e o histórico de pagamentos."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      skeleton="dashboard"
      loading={!data}
    >
      <Stack.Screen options={{ title: "Financeiro" }} />
      {data && (
        <>
          {overdue.length > 0 && (
            <Notice tone="danger" title="Há pagamento em atraso">
              {`${brl.format(sum(overdue))} em ${overdue.length} ${overdue.length === 1 ? "cobrança" : "cobranças"}. Regularize para evitar o bloqueio da unidade.`}
            </Notice>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat
              label="Em aberto"
              value={open.length ? brl.format(sum(open)) : "Nada"}
              tone={overdue.length ? "danger" : open.length ? "neutral" : "ok"}
              hint={open.length ? `${open.length} ${open.length === 1 ? "cobrança" : "cobranças"}` : "Tudo pago"}
            />
            <Stat label="Próximo vencimento" value={next ? formatDate(next.due_date) : "—"} hint={next ? brl.format(Number(next.amount)) : undefined} />
            <Stat label="Plano" value={data.plan ? data.plan.name : "—"} hint={data.plan ? `${planPrice(data.plan)} · vence no dia ${data.store.due_day}` : "Sem cobrança"} />
          </View>

          <SectionTitle>Cobranças</SectionTitle>
          {payments.length === 0 ? (
            <Card style={{ alignItems: "center", paddingVertical: 24 }}>
              <T color={colors.muted} style={{ textAlign: "center" }}>Quando houver uma cobrança para a sua unidade, ela aparece aqui.</T>
            </Card>
          ) : (
            payments.map((p) => {
              const s = situation(p, now);
              const label = SITUATION_LABEL[s];
              const when =
                p.status === "pago" && p.paid_on
                  ? `Pago em ${formatDate(p.paid_on)}${p.method ? ` · ${PAYMENT_METHODS[p.method]}` : ""}`
                  : p.status === "cancelado"
                    ? `Vencimento era ${formatDate(p.due_date)}`
                    : dueText(p.due_date, now).replace(/^v/, "V");
              return (
                <Card key={p.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <T weight="semibold">{`${p.description} de ${monthLabel(p.reference_month)}`}</T>
                      {p.note ? <T size={14} color={colors.muted}>{p.note}</T> : null}
                    </View>
                    <T weight="extrabold" size={18}>{brl.format(Number(p.amount))}</T>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Badge tone={label.tone}>{label.text}</Badge>
                    <T size={14} weight={s === "atrasado" ? "semibold" : "regular"} color={s === "atrasado" ? colors.danger : colors.muted}>{when}</T>
                  </View>
                </Card>
              );
            })
          )}

          <SectionTitle>Como pagar</SectionTitle>
          <Card style={{ gap: 6 }}>
            <T size={14} weight="semibold" color={colors.muted}>Forma de pagamento da unidade</T>
            <T weight="extrabold" size={18}>{PAYMENT_METHODS[data.store.payment_method]}</T>
            {data.settings?.pix_key ? (
              <>
                <T size={14} weight="semibold" color={colors.muted} style={{ marginTop: 8 }}>Chave Pix</T>
                <T weight="extrabold" size={18} selectable>{data.settings.pix_key}</T>
              </>
            ) : null}
            {data.settings?.instructions ? <T style={{ marginTop: 8 }}>{data.settings.instructions}</T> : null}
            {!data.settings?.pix_key && !data.settings?.instructions && <T color={colors.muted}>Fale com o administrador para saber como pagar.</T>}
            <T size={14} color={colors.muted} style={{ marginTop: 8 }}>
              O pagamento é confirmado pelo administrador. Depois de pagar, a cobrança aparece como paga aqui.
            </T>
          </Card>
        </>
      )}
    </Page>
  );
}
