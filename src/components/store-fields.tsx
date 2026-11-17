import { Card, Field, T } from "@/components/ui";
import type { StoreFields } from "@/lib/data-admin";
import { colors } from "@/lib/theme";

/** Dados da unidade e do responsável (usado na ficha e na unidade nova). */
export function StoreFieldsForm({ value: f, set }: { value: StoreFields; set: (key: keyof StoreFields, value: string) => void }) {
  return (
    <>
      <Card style={{ gap: 14 }}>
        <T weight="extrabold" size={18}>Dados da unidade</T>
        <Field label="Nome da unidade" placeholder="Exemplo: The Best Açaí Centro" value={f.name} onChangeText={(v) => set("name", v)} />
        <Field label="Cidade" value={f.city} onChangeText={(v) => set("city", v)} />
        <Field label="Endereço" hint="Opcional" value={f.address} onChangeText={(v) => set("address", v)} />
        <Field label="CNPJ ou CPF" hint="Opcional" value={f.document} onChangeText={(v) => set("document", v)} />
        <Field
          label="Conta o estoque a cada quantos dias"
          hint="Toda semana = 7. A unidade pode alterar depois"
          value={f.count_interval_days}
          onChangeText={(v) => set("count_interval_days", v)}
          keyboardType="number-pad"
        />
      </Card>
      <Card style={{ gap: 14 }}>
        <T weight="extrabold" size={18}>Responsável</T>
        <T size={14} color={colors.muted}>Quem responde pela unidade e como falar com ele.</T>
        <Field label="Nome do responsável" value={f.owner_name} onChangeText={(v) => set("owner_name", v)} />
        <Field label="Telefone ou WhatsApp" value={f.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
        <Field
          label="Anotações internas"
          hint="Opcional. Só o administrador vê."
          value={f.notes}
          onChangeText={(v) => set("notes", v)}
          multiline
          style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }}
        />
      </Card>
    </>
  );
}

