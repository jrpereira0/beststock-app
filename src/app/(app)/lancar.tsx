import { router, Stack, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Alert as Dialog, KeyboardAvoidingView, Platform, Pressable, ScrollView, SectionList, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageSkeleton } from "@/components/skeleton";
import { Button, Notice, QuantityStepper, T, styles as ui } from "@/components/ui";
import { useProfile } from "@/lib/auth";
import { categoriesOf, groupProducts } from "@/lib/count-rules";
import { loadMovementForm, Offline, saveMovements, type MovementForm } from "@/lib/data";
import { addDays, daysFrom, formatDate, formatDay, formatQty, today, weekday } from "@/lib/dates";
import { isShort, unitHint, validateMovements, type Kind, type MovementProduct } from "@/lib/movements";
import { takeInvoiceDraft, type InvoiceDraft } from "@/lib/invoice-draft";
import { colors } from "@/lib/theme";

export default function LancarScreen() {
  const params = useLocalSearchParams<{ tipo?: string; nota?: string }>();
  // Vindo da nota fiscal: quantidades, data e a nota já chegam preenchidas.
  const [draft] = useState(() => (params.nota === "1" ? takeInvoiceDraft() : null));
  const kind: Kind = params.tipo === "perda" ? "perda" : "entrada";
  const profile = useProfile();
  const [form, setForm] = useState<MovementForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMovementForm(profile, kind)
      .then((res) => alive && setForm(res.data))
      .catch((e: unknown) => alive && setError(e instanceof Offline ? "Sem internet. Conecte o celular para lançar." : "Não foi possível carregar os produtos."));
    return () => {
      alive = false;
    };
  }, [profile, kind]);

  const title = kind === "entrada" ? "Registrar entrada" : "Registrar perda";
  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        <Stack.Screen options={{ title }} />
        <Notice tone="danger">{error}</Notice>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  if (!form) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title }} />
        <PageSkeleton title={false} variant="count" />
      </View>
    );
  }
  return <Form kind={kind} form={form} title={title} draft={kind === "entrada" ? draft : null} />;
}

function Form({ kind, form, title, draft }: { kind: Kind; form: MovementForm; title: string; draft: InvoiceDraft | null }) {
  const profile = useProfile();
  const now = today();
  const [date, setDate] = useState(draft?.date ?? now);
  const [values, setValues] = useState<Record<string, string>>(draft?.quantities ?? {});
  const [rest, setRest] = useState<Record<string, "vem" | "nao">>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = draft && draft.date < addDays(now, -13) ? draft.date : addDays(now, -13);
  const days = useMemo(() => daysFrom(start, now).reverse(), [start, now]);
  const sections = useMemo(
    () => groupProducts(form.products, { search, category }).map(([t, data]) => ({ title: t, data })),
    [form.products, search, category],
  );
  const categories = useMemo(() => categoriesOf(form.products), [form.products]);
  const filled = Object.values(values).filter((v) => v.trim() !== "").length;

  const onChange = useCallback((id: string, text: string) => setValues((v) => ({ ...v, [id]: text })), []);
  const onRest = useCallback((id: string, choice: "vem" | "nao") => setRest((r) => ({ ...r, [id]: choice })), []);

  async function save() {
    setError(null);
    const checked = validateMovements(kind, date, today(), form.products, values, rest, form.outstanding);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    const fail = await saveMovements(profile, kind, date, checked.items, form.products, draft?.invoice ?? null);
    setSaving(false);
    if (fail) {
      setError(fail);
      return;
    }
    const n = checked.items.length;
    Dialog.alert(
      kind === "entrada" ? "Entrada salva" : "Perda salva",
      `${n} ${n === 1 ? "produto lançado" : "produtos lançados"} em ${formatDate(date)}. Já aparece no site.`,
    );
    router.back();
  }

  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      {draft && (
        <Notice title={`Da nota ${draft.invoice.number} · ${draft.invoice.issuer}`}>
          As quantidades vieram da nota. Confira com o que chegou de verdade e corrija o que for diferente antes de salvar.
        </Notice>
      )}
      <T color={colors.muted}>
        {kind === "entrada"
          ? "Preencha só os produtos que chegaram, com o número de embalagens."
          : "Preencha só os produtos perdidos (venceu, quebrou, estragou)."}
      </T>
      <View style={[ui.card, { gap: 8 }]}>
        <T weight="semibold">{kind === "entrada" ? "Dia em que a mercadoria chegou" : "Dia da perda"}</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((d) => {
            const active = d === date;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatDate(d)}
                onPress={() => setDate(d)}
                style={{
                  minWidth: 60,
                  minHeight: 52,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 8,
                  backgroundColor: active ? colors.ink : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.ink : colors.line,
                }}
              >
                <T size={12} color={active ? "#fff" : colors.muted}>{d === now ? "hoje" : weekday(d)}</T>
                <T weight="bold" size={15} color={active ? "#fff" : colors.ink}>{formatDay(d)}</T>
              </Pressable>
            );
          })}
        </ScrollView>
        {kind === "entrada" && form.countDates.includes(date) && (
          <T size={14} color={colors.muted}>
            Neste dia tem contagem. Se o produto já foi contado, esta entrada entra no estoque e não muda o número. Se ainda não foi contado,
            conte a prateleira inteira, com o que acabou de chegar.
          </T>
        )}
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar produto"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Buscar produto"
        clearButtonMode="while-editing"
        style={ui.input}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[null, ...categories].map((c) => {
          const active = category === c;
          return (
            <Pressable
              key={c ?? "todas"}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(c)}
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
              <T weight="semibold" size={15} color={active ? "#fff" : colors.ink}>{c ?? "Todas"}</T>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title }} />
      <SectionList
        sections={sections}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>
            {section.title}
          </T>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={[ui.card, { alignItems: "center", paddingVertical: 32 }]}>
            <T color={colors.muted}>{form.products.length === 0 ? "Nenhum produto cadastrado. Cadastre no site." : "Nenhum produto encontrado."}</T>
          </View>
        }
        renderItem={({ item }) => (
          <Row
            kind={kind}
            product={item}
            value={values[item.id] ?? ""}
            outstanding={form.outstanding[item.id]}
            rest={rest[item.id]}
            onChange={onChange}
            onRest={onRest}
          />
        )}
      />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          {error && <Notice tone="danger">{error}</Notice>}
          <T size={14} weight="semibold" color={colors.muted}>
            {filled === 0 ? "Nenhum produto preenchido ainda." : `${filled} ${filled === 1 ? "produto preenchido" : "produtos preenchidos"}`}
          </T>
          <Button label={kind === "entrada" ? "Salvar entrada" : "Salvar perda"} busy={saving} onPress={() => void save()} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const Row = memo(function Row({
  kind,
  product: p,
  value,
  outstanding,
  rest,
  onChange,
  onRest,
}: {
  kind: Kind;
  product: MovementProduct;
  value: string;
  outstanding?: number;
  rest?: "vem" | "nao";
  onChange: (id: string, text: string) => void;
  onRest: (id: string, choice: "vem" | "nao") => void;
}) {
  const short = isShort(kind, p, value, outstanding);
  return (
    <View style={[ui.card, { paddingVertical: 12, gap: 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <View style={{ flexShrink: 1, minWidth: 120 }}>
          <T weight="semibold">{p.name}</T>
          <T size={14} color={colors.muted}>{unitHint(kind, p)}</T>
          {kind === "entrada" && (outstanding ?? 0) > 0 && (
            <T size={14} weight="semibold" color={colors.brandText}>
              {formatQty(outstanding ?? 0)} {p.count_unit} a caminho
            </T>
          )}
        </View>
        <QuantityStepper label={p.name} value={value} onChange={(t) => onChange(p.id, t)} />
      </View>
      {short && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 8 }} accessibilityRole="radiogroup">
          <T size={15} weight="semibold">Chegou menos do que o pedido. O resto ainda vem?</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["vem", "nao"] as const).map((c) => {
              const active = rest === c;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => onRest(p.id, c)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? colors.ink : colors.card,
                    borderWidth: 1,
                    borderColor: active ? colors.ink : colors.line,
                  }}
                >
                  <T weight="semibold" size={15} color={active ? "#fff" : colors.ink}>{c === "vem" ? "O resto ainda vem" : "Não vai chegar"}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
});
