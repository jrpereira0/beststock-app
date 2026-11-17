import { router, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { Button, Card, Notice, QuantityStepper, T, styles as ui } from "@/components/ui";
import { Choice, DayPicker, Footer, Page } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { groupProducts } from "@/lib/count-rules";
import { loadOrderForm, registerManualOrder } from "@/lib/data-compras";
import { addDays, daysFrom, formatDate, formatQty, today } from "@/lib/dates";
import { parsePacks } from "@/lib/purchases";
import { brl } from "@/lib/site/billing";
import { MAX_ORDER_AGE_DAYS } from "@/lib/site/order-dates";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Storage = "gelado" | "seco";

/** Pedido feito por fora da lista (telefone, WhatsApp, direto com o fornecedor), igual a compras/pedido do site. */
export default function PedidoScreen() {
  const profile = useProfile();
  const load = useCallback(() => loadOrderForm(profile), [profile]);
  const { data, fromCache, error } = useLoad(load);
  const now = today();
  const [supplierChoice, setSupplierChoice] = useState<string | null>(null);
  const [orderedOn, setOrderedOn] = useState(now);
  const [touched, setTouched] = useState<Partial<Record<Storage, string>>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const suppliers = useMemo(() => data?.suppliers ?? [], [data]);
  const products = useMemo(() => data?.products ?? [], [data]);
  // Com um só fornecedor cadastrado, ele já vem escolhido.
  const supplierId = supplierChoice ?? (suppliers.length === 1 ? suppliers[0].id : "");
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const leadOf = (s: Storage) => (supplier ? (s === "seco" ? supplier.lead_time_dry_days : supplier.lead_time_days) : null);
  const expectedOf = (s: Storage) => {
    const lead = leadOf(s);
    return touched[s] ?? (lead === null ? "" : addDays(orderedOn, lead));
  };
  const groups = useMemo(() => groupProducts(products, { search }), [products, search]);
  const filled = Object.entries(values).filter(([, v]) => parsePacks(v) > 0);
  const total = filled.reduce((a, [id, v]) => a + parsePacks(v) * (products.find((p) => p.id === id)?.cost_per_purchase ?? 0), 0);
  const orderDays = useMemo(() => daysFrom(addDays(now, -20), now).reverse(), [now]);
  const expectedDays = useMemo(() => daysFrom(orderedOn, addDays(orderedOn, 30)), [orderedOn]);

  async function save() {
    setMessage(null);
    for (const [, v] of Object.entries(values)) {
      if (v.trim() && Number.isNaN(Number(v.replace(",", ".")))) return setMessage("Há uma quantidade inválida no pedido.");
    }
    setSaving(true);
    const err = await registerManualOrder(profile, {
      supplierId: supplierId || null,
      orderedOn,
      expected: { gelado: expectedOf("gelado"), seco: expectedOf("seco") },
      lines: filled.map(([productId, v]) => ({ productId, packs: parsePacks(v) })),
      storageOf: Object.fromEntries(products.map((p) => [p.id, p.storage])),
    });
    setSaving(false);
    if (err) return setMessage(err);
    router.back();
  }

  const expectedField = (s: Storage, label: string) => {
    const lead = leadOf(s);
    return (
      <View style={{ gap: 6 }}>
        <T weight="semibold">{label}</T>
        <DayPicker value={expectedOf(s)} onChange={(d) => setTouched((t) => ({ ...t, [s]: d }))} days={expectedDays} todayIso={now} />
        <T size={14} color={colors.muted}>
          {lead === null
            ? "Sem fornecedor, o sistema não sabe o prazo. Informe quando chega, se pediu esse tipo."
            : touched[s] !== undefined
              ? `Data ajustada por você: ${formatDate(expectedOf(s))}.`
              : `${lead} ${lead === 1 ? "dia" : "dias"} depois do pedido, pelo prazo do fornecedor. Mude se ele avisou outra data.`}
        </T>
      </View>
    );
  };

  return (
    <Page
      subtitle="Use quando você comprou fora da lista: por telefone, WhatsApp ou direto com o fornecedor. O sistema passa a contar esse pedido como a caminho e não sugere de novo esses produtos até a mercadoria chegar."
      fromCache={fromCache}
      error={error}
      loading={!data}
      footer={
        data && (
          <Footer>
            {message && <Notice tone="danger">{message}</Notice>}
            <T size={14} weight="semibold" color={colors.muted}>
              {filled.length === 0
                ? "Nenhum produto preenchido ainda."
                : `${filled.length} ${filled.length === 1 ? "produto" : "produtos"}${total > 0 ? ` · ${brl.format(total)}` : ""}`}
            </T>
            <Button label={saving ? "Registrando…" : "Registrar pedido"} busy={saving} onPress={() => void save()} />
          </Footer>
        )
      }
    >
      <Stack.Screen options={{ title: "Registrar pedido" }} />
      {data && (
        <>
          <Card style={{ gap: 14 }}>
            <Choice
              label="Fornecedor"
              value={supplierId}
              options={[{ value: "", label: "Sem fornecedor cadastrado" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={(v) => {
                setSupplierChoice(v);
                setTouched({});
              }}
            />
            {suppliers.length === 0 && <T size={14} color={colors.muted}>Nenhum fornecedor cadastrado ainda. Dá para registrar o pedido assim mesmo.</T>}
            <View style={{ gap: 6 }}>
              <T weight="semibold">Dia em que fez o pedido</T>
              <DayPicker value={orderedOn} onChange={setOrderedOn} days={orderDays} todayIso={now} />
              <T size={14} color={colors.muted}>Pode ser de dias atrás, até {MAX_ORDER_AGE_DAYS} dias.</T>
            </View>
            {expectedField("gelado", "Previsão de chegada dos gelados")}
            {expectedField("seco", "Previsão de chegada dos secos")}
            <T size={14} color={colors.muted}>
              Gelado e seco chegam em prazos diferentes. Se o pedido tiver os dois, o sistema registra um pedido de cada tipo.
            </T>
          </Card>
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar produto" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Buscar produto" />
          {products.length === 0 && <T color={colors.muted}>Nenhum produto cadastrado. Cadastre os produtos da loja antes de registrar um pedido.</T>}
          {groups.map(([category, list]) => (
            <View key={category} style={{ gap: 8 }}>
              <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>{category}</T>
              {list.map((p) => {
                const upp = Number(p.units_per_purchase);
                return (
                  <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 12, flexWrap: "wrap" }}>
                    <View style={{ flexShrink: 1, minWidth: 120 }}>
                      <T weight="semibold">{p.name}</T>
                      <T size={14} color={colors.muted}>
                        {p.storage === "seco" ? "Seco" : "Gelado"} · em {p.purchase_unit}
                        {upp !== 1 || p.purchase_unit !== p.count_unit ? ` (1 ${p.purchase_unit} = ${formatQty(upp)} ${p.count_unit})` : ""}
                      </T>
                    </View>
                    <QuantityStepper label={p.name} value={values[p.id] ?? ""} onChange={(t) => setValues((v) => ({ ...v, [p.id]: t }))} />
                  </Card>
                );
              })}
            </View>
          ))}
        </>
      )}
    </Page>
  );
}
