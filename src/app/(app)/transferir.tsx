import { router, Stack, useLocalSearchParams } from "expo-router";
import { Dialog } from "@/lib/dialog";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, SectionList, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageSkeleton } from "@/components/skeleton";
import { Button, Notice, QuantityStepper, T, styles as ui } from "@/components/ui";
import { ListLink } from "@/components/widgets";
import { useAuth, useProfile } from "@/lib/auth";
import { categoriesOf, groupProducts } from "@/lib/count-rules";
import { loadMovementForm, Offline, type MovementForm } from "@/lib/data";
import { loadTransferMissing, transferProducts, type MyStore } from "@/lib/data-lojas";
import { addDays, daysFrom, formatDate, formatDay, today, weekday } from "@/lib/dates";
import { validateMovements, type MovementProduct } from "@/lib/movements";
import { colors } from "@/lib/theme";

/**
 * Transferir produtos da loja que está aberta para outra loja do mesmo cliente. Sai do estoque daqui e entra no de
 * lá, marcado como transferência (não vira compra nem perda). As regras estão no banco, as mesmas do site.
 */
export default function TransferirScreen() {
  const { para } = useLocalSearchParams<{ para?: string }>();
  const profile = useProfile();
  const { stores } = useAuth();
  const others = stores.filter((s) => s.id !== profile.store.id);
  const destination = others.length === 1 ? others[0] : others.find((s) => s.id === para);
  const title = "Transferir para outra loja";

  if (profile.access !== "gerente") {
    return (
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        <Stack.Screen options={{ title }} />
        <Notice tone="danger">Só o gerente transfere produtos entre lojas.</Notice>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  if (others.length === 0) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        <Stack.Screen options={{ title }} />
        <Notice>
          Você só tem acesso a uma loja. A transferência é entre lojas do mesmo cliente: peça ao administrador da rede para ligar o seu login às outras lojas.
        </Notice>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  if (!destination) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Stack.Screen options={{ title }} />
        <T color={colors.muted}>De {profile.store.name}. Qual loja vai receber?</T>
        {others.map((s) => (
          <ListLink key={s.id} title={s.name} subtitle={s.city || undefined} onPress={() => router.setParams({ para: s.id })} />
        ))}
      </ScrollView>
    );
  }
  return <Loader destination={destination} title={title} />;
}

function Loader({ destination, title }: { destination: MyStore; title: string }) {
  const profile = useProfile();
  const [data, setData] = useState<{ form: MovementForm; missing: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Os produtos da loja daqui (a mesma lista da perda) e quais ainda não existem na loja de destino.
    Promise.all([loadMovementForm(profile, "perda"), loadTransferMissing(profile, destination.id)])
      .then(([form, missing]) => alive && setData({ form: form.data, missing: missing.data }))
      .catch((e: unknown) => alive && setError(e instanceof Offline ? "Sem internet. Conecte o celular para transferir." : "Não foi possível carregar os produtos."));
    return () => {
      alive = false;
    };
  }, [profile, destination.id]);

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        <Stack.Screen options={{ title }} />
        <Notice tone="danger">{error}</Notice>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title }} />
        <PageSkeleton title={false} variant="count" />
      </View>
    );
  }
  return <Form destination={destination} form={data.form} missing={data.missing} title={title} />;
}

function Form({ destination, form, missing, title }: { destination: MyStore; form: MovementForm; missing: string[]; title: string }) {
  const profile = useProfile();
  const now = today();
  const [date, setDate] = useState(now);
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => daysFrom(addDays(now, -13), now).reverse(), [now]);
  const sections = useMemo(
    () => groupProducts(form.products, { search, category }).map(([t, data]) => ({ title: t, data })),
    [form.products, search, category],
  );
  const categories = useMemo(() => categoriesOf(form.products), [form.products]);
  const filled = Object.values(values).filter((v) => v.trim() !== "").length;
  const missingSet = useMemo(() => new Set(missing), [missing]);
  const onChange = useCallback((id: string, text: string) => setValues((v) => ({ ...v, [id]: text })), []);

  async function save() {
    setError(null);
    // Mesma conferência da perda: quantidade em unidade de contagem, maior que zero.
    const checked = validateMovements("perda", date, today(), form.products, values, {}, {});
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    const fail = await transferProducts(destination.id, date, checked.items.map((i) => ({ product_id: i.product_id, quantity: i.typed })));
    setSaving(false);
    if (fail) {
      setError(fail);
      return;
    }
    const n = checked.items.length;
    Dialog.alert("Transferência feita", `${n} ${n === 1 ? "produto saiu" : "produtos saíram"} de ${profile.store.name} e ${n === 1 ? "entrou" : "entraram"} em ${destination.name}, em ${formatDate(date)}.`);
    router.back();
  }

  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      <Notice title={`De ${profile.store.name} para ${destination.name}`}>
        Sai do estoque daqui e entra no estoque de lá, marcado como transferência. Não conta como compra, nem como perda, nem como consumo.
      </Notice>
      <T color={colors.muted}>Preencha só os produtos que estão indo, na unidade de contagem (kg, un, pote...).</T>
      <View style={[ui.card, { gap: 8 }]}>
        <T weight="semibold">Dia da transferência</T>
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
          <Row product={item} value={values[item.id] ?? ""} willCreate={missingSet.has(item.id) ? destination.name : null} onChange={onChange} />
        )}
      />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          {error && <Notice tone="danger">{error}</Notice>}
          <T size={14} weight="semibold" color={colors.muted}>
            {filled === 0 ? "Nenhum produto preenchido ainda." : `${filled} ${filled === 1 ? "produto preenchido" : "produtos preenchidos"}`}
          </T>
          <Button label="Transferir" busy={saving} onPress={() => void save()} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const Row = memo(function Row({
  product: p,
  value,
  willCreate,
  onChange,
}: {
  product: MovementProduct;
  value: string;
  willCreate: string | null;
  onChange: (id: string, text: string) => void;
}) {
  return (
    <View style={[ui.card, { paddingVertical: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <View style={{ flexShrink: 1, minWidth: 120 }}>
          <T weight="semibold">{p.name}</T>
          <T size={14} color={colors.muted}>{`em ${p.count_unit}`}</T>
          {willCreate && (
            <T size={14} weight="semibold" color={colors.brandText}>
              Ainda não existe em {willCreate}: será cadastrado lá
            </T>
          )}
        </View>
        <QuantityStepper label={p.name} value={value} onChange={(t) => onChange(p.id, t)} />
      </View>
    </View>
  );
});
