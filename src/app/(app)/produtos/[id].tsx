import { router, Stack, useLocalSearchParams } from "expo-router";
import { Dialog } from "@/lib/dialog";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { Choice, Footer, Page, Toggle } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { productRow, UNITS, type ProductInput } from "@/lib/cadastros";
import { deleteProduct, loadProduct, saveProduct, type ProductDetail } from "@/lib/data-cadastros";
import { brl } from "@/lib/site/billing";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const text = (n: number | null | undefined) => (n ? String(n).replace(".", ",") : "");

export default function ProdutoScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = raw === "novo" ? null : raw;
  const profile = useProfile();
  const load = useCallback(() => loadProduct(profile, id), [profile, id]);
  const { data, fromCache, error } = useLoad(load);
  if (!data) {
    return (
      <Page error={error} loading>
        <Stack.Screen options={{ title: id ? "Produto" : "Novo produto" }} />
      </Page>
    );
  }
  return <ProductForm id={id} data={data} fromCache={fromCache} />;
}

function initialForm(p: ProductDetail["product"]): ProductInput {
  return {
    name: p?.name ?? "",
    category: p?.category ?? "",
    storage: p?.storage ?? "gelado",
    count_unit: p?.count_unit ?? "un",
    purchase_unit: p?.purchase_unit ?? "caixa",
    units_per_purchase: p ? String(p.units_per_purchase).replace(".", ",") : "1",
    shelf_life_days: p?.shelf_life_days ? String(p.shelf_life_days) : "",
    cost_per_purchase: text(p?.cost_per_purchase),
    min_stock: text(p?.min_stock),
    supplier_id: p?.supplier_id ?? "",
    active: p?.active ?? true,
    essential: p?.essential ?? false,
  };
}

function ProductForm({ id, data, fromCache }: { id: string | null; data: ProductDetail; fromCache: boolean }) {
  const profile = useProfile();
  const [form, setForm] = useState<ProductInput>(() => initialForm(data.product));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setMessage(null);
    const res = productRow(form);
    if ("error" in res) return setMessage(res.error);
    setSaving(true);
    const err = await saveProduct(profile, id, res.row);
    setSaving(false);
    if (err) return setMessage(err);
    router.back();
  }

  function remove() {
    if (!id) return;
    Dialog.alert("Excluir este produto?", "Só é possível excluir um produto que nunca foi contado nem teve entrada.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const err = await deleteProduct(profile, id);
          if (err) Dialog.alert("Não excluiu", err);
          else router.back();
        },
      },
    ]);
  }

  const p = data.product;
  const costHint =
    p?.networkCost == null
      ? undefined
      : p.custom_cost
        ? `Custo próprio desta loja. O da rede é ${brl.format(p.networkCost)}: use esse valor para voltar a seguir a rede.`
        : "Custo da rede, atualizado pelo administrador. Se você mudar, passa a valer o seu.";

  return (
    <Page
      fromCache={fromCache}
      footer={
        <Footer>
          {message && <Notice tone="danger">{message}</Notice>}
          <Button label="Salvar produto" busy={saving} onPress={() => void save()} />
        </Footer>
      }
    >
      <Stack.Screen options={{ title: id ? (p?.name ?? "Produto") : "Novo produto" }} />
      {(
        <>
          <Card style={{ gap: 14 }}>
            <T weight="extrabold" size={18}>Identificação</T>
            <Field label="Nome do produto" value={form.name} onChangeText={(v) => set("name", v)} />
            <Field label="Categoria" hint="Escolha uma da lista ou escreva uma nova" value={form.category} onChangeText={(v) => set("category", v)} />
            {data.categories.length > 0 && <Suggestions values={data.categories} onPick={(v) => set("category", v)} />}
            <Choice
              label="Conservação"
              value={form.storage as "gelado" | "seco"}
              options={[
                { value: "gelado", label: "Gelado" },
                { value: "seco", label: "Seco" },
              ]}
              onChange={(v) => set("storage", v)}
            />
            <T size={14} color={colors.muted}>
              Gelado chega no prazo dos gelados do fornecedor. Seco chega no prazo dos secos. Açaí, sorvete, pote, brownie, bites e stickzinho são gelados.
            </T>
          </Card>

          <Card style={{ gap: 14 }}>
            <T weight="extrabold" size={18}>Como conta e como compra</T>
            <T size={14} color={colors.muted}>
              Exemplo: você conta o açaí em kg, mas compra em caixa de 10 kg. A unidade de contagem é kg, a embalagem é caixa e a quantidade por embalagem é 10.
            </T>
            <Field label="Unidade de contagem" hint="Como você conta no estoque" value={form.count_unit} onChangeText={(v) => set("count_unit", v)} autoCapitalize="none" />
            <Suggestions values={UNITS} onPick={(v) => set("count_unit", v)} />
            <Field label="Embalagem de compra" hint="Como você pede ao fornecedor" value={form.purchase_unit} onChangeText={(v) => set("purchase_unit", v)} autoCapitalize="none" />
            <Suggestions values={UNITS} onPick={(v) => set("purchase_unit", v)} />
            <Field
              label="Quantidade por embalagem"
              hint="Quantas unidades de contagem vêm em uma embalagem"
              value={form.units_per_purchase}
              onChangeText={(v) => set("units_per_purchase", v)}
              keyboardType="decimal-pad"
            />
            <Field
              label="Validade em dias"
              hint="Opcional. Evita sugerir mais do que dá para usar"
              value={form.shelf_life_days}
              onChangeText={(v) => set("shelf_life_days", v)}
              keyboardType="number-pad"
            />
          </Card>

          <Card style={{ gap: 14 }}>
            <T weight="extrabold" size={18}>Custo e compra</T>
            <T size={14} color={colors.muted}>Usados para calcular o valor do estoque e a lista de compras.</T>
            <Field label="Custo por embalagem (R$)" hint={costHint} placeholder="0,00" value={form.cost_per_purchase} onChangeText={(v) => set("cost_per_purchase", v)} keyboardType="decimal-pad" />
            <Choice
              label="Fornecedor"
              value={form.supplier_id}
              options={[{ value: "", label: "Sem fornecedor" }, ...data.suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={(v) => set("supplier_id", v)}
            />
            <Field
              label="Estoque mínimo"
              hint="Na unidade de contagem. Vale enquanto o produto não tem média de consumo"
              placeholder="0"
              value={form.min_stock}
              onChangeText={(v) => set("min_stock", v)}
              keyboardType="decimal-pad"
            />
            <Toggle label="Produto ativo (aparece na contagem)" value={form.active} onChange={(v) => set("active", v)} />
            <Toggle
              label="Item essencial"
              hint="Marque o que para a loja se faltar, como copo e colher. A lista de compras guarda uma folga maior para ele, mesmo sendo barato."
              value={form.essential}
              onChange={(v) => set("essential", v)}
            />
          </Card>

          {id && (
            <Card style={{ gap: 10 }}>
              <T weight="extrabold" size={18}>Excluir produto</T>
              <T size={14} color={colors.muted}>
                Só é possível excluir um produto que nunca foi contado nem teve entrada. Se ele já tem histórico, desligue &quot;Produto ativo&quot; para tirá-lo da contagem.
              </T>
              <Button label="Excluir produto" variant="danger" onPress={remove} />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}

/** Sugestões tocáveis embaixo do campo (no lugar da lista do navegador). */
function Suggestions({ values, onPick }: { values: string[]; onPick: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled" style={{ marginTop: -6 }}>
      {values.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          accessibilityLabel={`Usar ${v}`}
          onPress={() => onPick(v)}
          style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line }}
        >
          <T size={14} weight="semibold">{v}</T>
        </Pressable>
      ))}
      <View style={{ width: 4 }} />
    </ScrollView>
  );
}
