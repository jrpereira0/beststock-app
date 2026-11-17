import { router, useLocalSearchParams } from "expo-router";
import { BillingGuide } from "@/components/guide";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { PaymentList } from "@/components/admin-payments";
import { NewPayment } from "@/components/new-payment";
import { Button, Card, Field, Notice, SectionTitle, T } from "@/components/ui";
import { ListLink, Page, Stat } from "@/components/widgets";
import { loadBilling, saveBillingSettings, type PaymentRow } from "@/lib/data-admin";
import { formatDate, today } from "@/lib/dates";
import { addMonths, brl, monthLabel, nextChargeDate, planPrice, planTitle, situation } from "@/lib/site/billing";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const FILTERS = [
  { key: "aberto", label: "Para receber", about: "Cobranças que ainda não foram pagas, da mais antiga para a mais nova. Quando o dinheiro entrar, toque em Registrar pagamento." },
  { key: "atraso", label: "Em atraso", about: "Cobranças que passaram do vencimento sem pagamento." },
  { key: "pago", label: "Pagas", about: "Pagamentos que você já registrou." },
  { key: "cancelado", label: "Canceladas", about: "Cobranças canceladas. Ficam só no histórico e não entram em nenhuma soma." },
  { key: "todas", label: "Todas", about: "Todas as cobranças, da mais nova para a mais antiga." },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Cobranças da rede, como admin/cobrancas do site. */
export default function CobrancasScreen() {
  const { s } = useLocalSearchParams<{ s?: string }>();
  const [filter, setFilter] = useState<FilterKey>(FILTERS.some((x) => x.key === s) ? (s as FilterKey) : "aberto");
  const [seenParam, setSeenParam] = useState(s);
  if (s !== seenParam) {
    setSeenParam(s);
    if (FILTERS.some((x) => x.key === s)) setFilter(s as FilterKey);
  }
  const [month, setMonth] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(loadBilling);
  const now = today();
  const thisMonth = now.slice(0, 7);

  const all = useMemo(() => (data?.payments ?? []).filter((p) => !month || p.reference_month.slice(0, 7) === month), [data, month]);
  const is = (p: PaymentRow, key: FilterKey) =>
    key === "aberto" ? p.status === "pendente" : key === "atraso" ? situation(p, now) === "atrasado" : key === "pago" ? p.status === "pago" : key === "cancelado" ? p.status === "cancelado" : true;
  const of = (key: FilterKey) => all.filter((p) => is(p, key));
  const sum = (key: FilterKey) => of(key).reduce((a, p) => a + Number(p.amount), 0);
  const visible = of(filter);
  if (filter === "aberto" || filter === "atraso") visible.reverse();
  const current = FILTERS.find((x) => x.key === filter)!;
  const planById = new Map((data?.plans ?? []).map((p) => [p.id, p]));
  const upcoming = (data?.stores ?? [])
    .flatMap((u) => {
      const plan = u.billing_active && u.plan_id ? planById.get(u.plan_id) : undefined;
      const date = nextChargeDate(u, plan, now);
      return plan && date ? [{ unit: u, plan, date }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, 1 - i));

  return (
    <Page
      tab="admin"
      title="Cobranças"
      subtitle={month ? `O que cada unidade tem para pagar, só de ${monthLabel(`${month}-01`)}.` : "O que cada unidade tem para pagar, o que já pagou e o que está atrasado."}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
      skeleton="dashboard"
    >
      {data && (
        <>
          <Button label="Cobrança avulsa" variant="secondary" onPress={() => setCreating(true)} />
          <SectionTitle>Como funciona</SectionTitle>
          <BillingGuide
            plans={data.plans.filter((p) => p.active).length}
            units={data.stores.length}
            billed={upcoming.length}
            open={(data.payments ?? []).filter((p) => p.status === "pendente").length}
          />
          <SectionTitle>{month ? `Resumo de ${monthLabel(`${month}-01`)}` : "Resumo"}</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat
              label="Para receber"
              value={brl.format(sum("aberto"))}
              hint={of("aberto").length ? count(of("aberto").length, "cobrança sem pagamento", "cobranças sem pagamento") : "Nada pendente"}
              onPress={() => setFilter("aberto")}
            />
            <Stat
              label="Em atraso"
              value={brl.format(sum("atraso"))}
              tone={sum("atraso") > 0 ? "danger" : "ok"}
              hint={of("atraso").length ? count(of("atraso").length, "cobrança vencida", "cobranças vencidas") : "Nenhuma vencida"}
              onPress={() => setFilter("atraso")}
            />
            <Stat label="Já recebido" value={brl.format(sum("pago"))} tone="ok" hint={count(of("pago").length, "pagamento registrado", "pagamentos registrados")} onPress={() => setFilter("pago")} />
          </View>

          <SectionTitle>Cobranças</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.map((x) => (
              <Chip key={x.key} active={filter === x.key} label={`${x.label} ${of(x.key).length}`} onPress={() => setFilter(x.key)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip active={month === ""} label="Todos os meses" onPress={() => setMonth("")} />
            {months.map((m) => (
              <Chip key={m} active={month === m} label={monthLabel(`${m}-01`)} onPress={() => setMonth(m)} />
            ))}
          </ScrollView>
          <T size={14} color={colors.muted}>{current.about}</T>
          {visible.length === 0 ? (
            <Card style={{ alignItems: "center", paddingVertical: 24 }}>
              <T color={colors.muted} style={{ textAlign: "center" }}>
                {filter === "aberto"
                  ? "Nada para receber agora. As próximas cobranças aparecem aqui sozinhas, na data de cada uma."
                  : filter === "atraso"
                    ? "Nenhuma cobrança em atraso."
                    : "Nenhuma cobrança nesta situação."}
              </T>
            </Card>
          ) : (
            <PaymentList payments={visible} admin onChange={() => void reload()} />
          )}

          <SectionTitle>Próximas cobranças automáticas</SectionTitle>
          <T size={14} color={colors.muted}>O que o sistema vai criar sozinho, pelo plano de cada unidade. Para mudar o plano ou o vencimento, abra a unidade.</T>
          {upcoming.length === 0 ? (
            <Card style={{ alignItems: "center", paddingVertical: 20 }}>
              <T color={colors.muted}>Nenhuma unidade tem plano com cobrança ligada.</T>
            </Card>
          ) : (
            upcoming.map(({ unit, plan, date }) => (
              <ListLink
                key={unit.id}
                title={unit.name}
                subtitle={`${planTitle(plan.name)} · ${planPrice(plan)}`}
                onPress={() => router.push(`/admin/lojas/${unit.id}?aba=plano`)}
                right={
                  <View style={{ alignItems: "flex-end" }}>
                    <T weight="extrabold">{formatDate(date)}</T>
                    <T size={14} color={colors.muted}>{brl.format(Number(plan.price))}</T>
                  </View>
                }
              />
            ))
          )}

          <SectionTitle>Como as unidades pagam</SectionTitle>
          <PaySettings pix={data.settings.pix_key ?? ""} instructions={data.settings.instructions ?? ""} onSaved={() => void reload()} />

          {creating && (
            <NewPayment
              stores={data.stores}
              defaultMonth={month || thisMonth}
              onClose={() => setCreating(false)}
              onDone={() => {
                setCreating(false);
                void reload();
              }}
            />
          )}
        </>
      )}
    </Page>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        justifyContent: "center",
        backgroundColor: active ? colors.ink : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.ink : colors.line,
      }}
    >
      <T weight="semibold" size={15} color={active ? "#fff" : colors.ink}>{label}</T>
    </Pressable>
  );
}

function PaySettings({ pix, instructions, onSaved }: { pix: string; instructions: string; onSaved: () => void }) {
  const [pixKey, setPixKey] = useState(pix);
  const [text, setText] = useState(instructions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  async function save() {
    setBusy(true);
    const err = await saveBillingSettings(pixKey, text);
    setBusy(false);
    if (err) setMessage({ tone: "danger", text: err });
    else {
      setMessage({ tone: "ok", text: "Instruções de pagamento salvas." });
      onSaved();
    }
  }
  return (
    <Card style={{ gap: 12 }}>
      <T size={14} color={colors.muted}>A chave Pix e as instruções abaixo aparecem para cada unidade na tela Financeiro, ao lado das cobranças dela.</T>
      <Field label="Chave Pix" value={pixKey} onChangeText={setPixKey} autoCapitalize="none" />
      <Field
        label="Instruções de pagamento"
        hint="Exemplo: enviar o comprovante por WhatsApp, dados para transferência."
        value={text}
        onChangeText={setText}
        multiline
        style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 12 }}
      />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button label="Salvar instruções" busy={busy} onPress={() => void save()} />
    </Card>
  );
}

