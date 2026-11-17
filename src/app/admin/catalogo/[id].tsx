import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert as Dialog, View } from "react-native";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { Choice, Page, Toggle } from "@/components/widgets";
import { productRow, UNITS } from "@/lib/cadastros";
import { deleteCatalogProduct, loadCatalog, saveCatalogProduct } from "@/lib/data-admin";
import { brl } from "@/lib/site/billing";
import type { CatalogProduct } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** Produto da lista padrão, como admin/catalogo/[id] e novo do site. */
export default function CatalogoItem() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = raw === "novo" ? null : raw;
  const { data, fromCache, error } = useLoad(loadCatalog);
  const item = id ? data?.find((p) => p.id === id) : undefined;
  return (
    <Page fromCache={fromCache} error={error ?? (data && id && !item ? "Produto não encontrado." : null)} loading={!data}>
      <Stack.Screen options={{ title: id ? (item?.name ?? "Produto") : "Novo produto" }} />
      {data && (!id || item) && <ItemForm item={item} categories={[...new Set(data.map((p) => p.category).filter(Boolean))]} />}
    </Page>
  );
}

function ItemForm({ item, categories }: { item?: CatalogProduct; categories: string[] }) {
  const [f, setF] = useState({
    name: item?.name ?? "",
    category: item?.category ?? "",
    storage: (item?.storage ?? "gelado") as "gelado" | "seco",
    count_unit: item?.count_unit ?? "un",
    purchase_unit: item?.purchase_unit ?? "caixa",
    units_per_purchase: item ? String(item.units_per_purchase).replace(".", ",") : "1",
    shelf_life_days: item?.shelf_life_days ? String(item.shelf_life_days) : "",
    cost_per_purchase: item && Number(item.cost_per_purchase) ? String(item.cost_per_purchase).replace(".", ",") : "",
  });
  const [addToStores, setAddToStores] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (key: keyof typeof f, value: string) => setF((x) => ({ ...x, [key]: value }));

  async function save() {
    setMessage(null);
    // Mesmas conferências do cadastro de produto do site (lib/form.ts, productFields).
    const res = productRow({ ...f, min_stock: "", supplier_id: "", active: true, essential: false });
    if ("error" in res) return setMessage(res.error);
    const { name, category, storage, count_unit, purchase_unit, units_per_purchase, shelf_life_days, cost_per_purchase } = res.row;
    setBusy(true);
    const err = await saveCatalogProduct(item?.id ?? null, { name, category, storage, count_unit, purchase_unit, units_per_purchase, shelf_life_days, cost_per_purchase }, addToStores);
    setBusy(false);
    if (err) return setMessage(err);
    router.back();
  }
  function remove() {
    if (!item) return;
    Dialog.alert("Excluir da lista padrão?", "Sai da lista para as lojas novas. As lojas que já têm o produto continuam com ele.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const err = await deleteCatalogProduct(item.id);
          if (err) Dialog.alert("Não excluiu", err);
          else router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Card style={{ gap: 14 }}>
        <T weight="extrabold" size={18}>Identificação</T>
        <Field label="Nome do produto" value={f.name} onChangeText={(v) => set("name", v)} />
        <Field label="Categoria" hint="Escolha uma da lista ou escreva uma nova" value={f.category} onChangeText={(v) => set("category", v)} />
        {categories.length > 0 && <Choice value={f.category} options={categories.map((c) => ({ value: c, label: c }))} onChange={(v) => set("category", v)} />}
        <Choice
          label="Conservação"
          value={f.storage}
          options={[
            { value: "gelado", label: "Gelado" },
            { value: "seco", label: "Seco" },
          ]}
          onChange={(v) => set("storage", v)}
        />
      </Card>
      <Card style={{ gap: 14 }}>
        <T weight="extrabold" size={18}>Como conta e como compra</T>
        <Field label="Unidade de contagem" hint="Como a loja conta no estoque" value={f.count_unit} onChangeText={(v) => set("count_unit", v)} autoCapitalize="none" />
        <Choice value={f.count_unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={(v) => set("count_unit", v)} />
        <Field label="Embalagem de compra" hint="Como a loja pede ao fornecedor" value={f.purchase_unit} onChangeText={(v) => set("purchase_unit", v)} autoCapitalize="none" />
        <Choice value={f.purchase_unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={(v) => set("purchase_unit", v)} />
        <Field label="Quantidade por embalagem" value={f.units_per_purchase} onChangeText={(v) => set("units_per_purchase", v)} keyboardType="decimal-pad" />
        <Field label="Validade em dias" hint="Opcional" value={f.shelf_life_days} onChangeText={(v) => set("shelf_life_days", v)} keyboardType="number-pad" />
      </Card>
      <Card style={{ gap: 14 }}>
        <T weight="extrabold" size={18}>Custo da rede</T>
        <Field
          label="Custo por embalagem (R$)"
          hint={item ? `Hoje: ${brl.format(Number(item.cost_per_purchase))}. Vale para todas as lojas que não mudaram o custo deste produto.` : "Vale para todas as lojas que recebem este produto."}
          placeholder="0,00"
          value={f.cost_per_purchase}
          onChangeText={(v) => set("cost_per_purchase", v)}
          keyboardType="decimal-pad"
        />
        {!item && (
          <Toggle
            label="Adicionar também às lojas que já existem"
            hint="Entra em cada loja ligado ao fornecedor da rede. Sem marcar, vale só para as lojas novas."
            value={addToStores}
            onChange={setAddToStores}
          />
        )}
      </Card>
      {item && <Button label="Excluir da lista padrão" variant="danger" onPress={remove} />}
      <View style={{ gap: 8 }}>
        {message && <Notice tone="danger">{message}</Notice>}
        <Button label="Salvar produto" busy={busy} onPress={() => void save()} />
      </View>
      <T size={13} color={colors.muted}>O estoque mínimo cada loja preenche no cadastro dela.</T>
    </>
  );
}
