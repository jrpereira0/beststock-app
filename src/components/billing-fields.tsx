import { Pressable, ScrollView, View } from "react-native";
import { Card, Notice, T } from "@/components/ui";
import { Badge, Choice } from "@/components/widgets";
import type { BillingInput } from "@/lib/data-admin";
import { formatDate } from "@/lib/dates";
import { addMonths, brl, cycleDueDates, firstBillingMonth, firstChargeMonth, monthLong, PAYMENT_METHODS, periodText } from "@/lib/site/billing";
import type { PaymentMethod, Plan, Store } from "@/lib/site/types";
import { colors } from "@/lib/theme";

/** Opção grande de escolha única, como no formulário do site. */
function Big({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.ink : colors.line, backgroundColor: selected ? colors.brandSoft : colors.card, padding: 14, gap: 2 }}
    >
      {children}
    </Pressable>
  );
}

export const emptyBilling = (store?: Store | null, plans: Plan[] = []): BillingInput => ({
  billing_active: store ? store.billing_active : true,
  plan_id: store?.plan_id ?? (plans.length === 1 ? plans[0].id : ""),
  due_day: store?.due_day ?? 10,
  payment_method: store?.payment_method ?? "pix",
  billing_start: "auto",
});

/**
 * Cobrança da unidade em três perguntas (cobrar ou não, qual plano, quando vence) e o resumo com as
 * próximas cobranças, calculado com a mesma regra que o site usa ao salvar.
 * `chargedUntil` é o primeiro mês (AAAA-MM) que o plano atual ainda não cobrou.
 */
export function BillingFields({
  value: v,
  onChange,
  store,
  plans,
  today,
  chargedUntil = null,
}: {
  value: BillingInput;
  onChange: (v: BillingInput) => void;
  store?: Store | null;
  plans: Plan[];
  today: string;
  chargedUntil?: string | null;
}) {
  const set = <K extends keyof BillingInput>(key: K, value: BillingInput[K]) => onChange({ ...v, [key]: value });
  const thisMonth = today.slice(0, 7);
  const running = store?.billing_active && store.billing_start ? store.billing_start.slice(0, 7) : null;
  const plan = plans.find((p) => p.id === v.plan_id);
  const planChanged = Boolean(running && store?.plan_id && store.plan_id !== v.plan_id);

  let dates: string[] = [];
  let pushedTo: string | null = null;
  if (v.billing_active && plan) {
    if (running && !planChanged) {
      dates = cycleDueDates(running, plan.duration_months, v.due_day, addMonths(thisMonth, 1), 3);
    } else {
      const wanted = running ?? (v.billing_start === "auto" ? firstBillingMonth(today, v.due_day) : v.billing_start);
      const first = firstChargeMonth(wanted, chargedUntil, thisMonth);
      if (first > wanted) pushedTo = first;
      dates = cycleDueDates(first, plan.duration_months, v.due_day, first, 3);
    }
  }

  if (plans.length === 0) {
    return (
      <Notice tone="warn" title="Crie um plano primeiro">
        A cobrança segue um plano, que diz o valor e de quanto em quanto tempo a unidade paga. Crie o primeiro plano na aba Planos. Sem plano, a unidade fica sem cobrança.
      </Notice>
    );
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <T weight="extrabold">Esta unidade vai ser cobrada?</T>
        <Big selected={v.billing_active} onPress={() => set("billing_active", true)}>
          <T weight="bold">Sim, cobrar pelo plano</T>
          <T size={14} color={colors.muted}>O sistema cria cada cobrança sozinho, na data certa.</T>
        </Big>
        <Big selected={!v.billing_active} onPress={() => set("billing_active", false)}>
          <T weight="bold">{running ? "Não, pausar a cobrança" : "Não cobrar"}</T>
          <T size={14} color={colors.muted}>
            {running ? "Nenhuma cobrança nova é criada. As que já existem continuam na lista." : "A unidade usa o sistema sem pagar. Dá para ligar a cobrança depois."}
          </T>
        </Big>
      </View>

      {v.billing_active && (
        <>
          <View style={{ gap: 8 }}>
            <T weight="extrabold">Qual é o plano?</T>
            <T size={14} color={colors.muted}>O plano define o valor e de quanto em quanto tempo a unidade paga.</T>
            {plans.map((p) => (
              <Big key={p.id} selected={v.plan_id === p.id} onPress={() => set("plan_id", p.id)}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <T weight="bold">{p.name}</T>
                  {running && store?.plan_id === p.id && <Badge tone="ok">Plano atual</Badge>}
                  {!p.active && <Badge>Desativado</Badge>}
                </View>
                <T>
                  <T weight="extrabold" size={20}>{brl.format(Number(p.price))}</T> <T size={14} weight="semibold" color={colors.muted}>{periodText(p.duration_months)}</T>
                </T>
                {p.description ? <T size={14} color={colors.muted}>{p.description}</T> : null}
              </Big>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <T weight="extrabold">Quando vence e como a unidade paga?</T>
            <T weight="semibold">Dia do vencimento</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: v.due_day === d }}
                  accessibilityLabel={`Dia ${d}`}
                  onPress={() => set("due_day", d)}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: v.due_day === d ? colors.ink : colors.card,
                    borderWidth: 1,
                    borderColor: v.due_day === d ? colors.ink : colors.line,
                  }}
                >
                  <T weight="bold" color={v.due_day === d ? "#fff" : colors.ink}>{String(d)}</T>
                </Pressable>
              ))}
            </ScrollView>
            <Choice
              label="Forma de pagamento"
              value={v.payment_method}
              options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value: value as PaymentMethod, label }))}
              onChange={(m) => set("payment_method", m)}
            />
            {running ? (
              <T size={14} color={colors.muted}>Cobrando desde {monthLong(running)}.</T>
            ) : (
              <Choice
                label="Primeira cobrança"
                value={v.billing_start}
                options={[
                  { value: "auto", label: "No próximo vencimento" },
                  ...[1, 2, 3].map((n) => {
                    const ym = addMonths(thisMonth, n);
                    return { value: ym, label: `Em ${monthLong(ym)}` };
                  }),
                ]}
                onChange={(s) => set("billing_start", s)}
              />
            )}
          </View>
        </>
      )}

      <Card style={{ backgroundColor: colors.bg, gap: 8 }}>
        <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Como vai ficar</T>
        {!v.billing_active ? (
          <T>{running ? "A cobrança fica pausada. O sistema para de criar cobranças novas até você ligar de novo." : "Esta unidade não recebe cobrança."}</T>
        ) : !plan ? (
          <T>Escolha um plano acima para ver os valores e as datas.</T>
        ) : (
          <>
            <T>
              A unidade paga <T weight="bold">{brl.format(Number(plan.price))}</T> {periodText(plan.duration_months)}, com vencimento no <T weight="bold">dia {v.due_day}</T>.
            </T>
            <T size={14} weight="semibold" color={colors.muted}>Próximas cobranças</T>
            {dates.map((d, i) => (
              <View key={d} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
                <T size={14} weight="semibold" color={colors.muted}>{i + 1}ª cobrança</T>
                <T weight="extrabold">{formatDate(d)}</T>
              </View>
            ))}
            {planChanged && (
              <T size={14} color={colors.muted}>O plano novo começa quando termina o período que o plano atual já cobrou. As cobranças que já existem ficam como estão.</T>
            )}
            {!planChanged && pushedTo && (
              <T size={14} color={colors.muted}>Esta unidade já foi cobrada pelo período atual, por isso a primeira cobrança nova sai em {monthLong(pushedTo)}.</T>
            )}
            {running && !planChanged && <T size={14} color={colors.muted}>Mudar o dia do vencimento vale para as próximas cobranças. As que já existem ficam como estão.</T>}
          </>
        )}
      </Card>
    </View>
  );
}
