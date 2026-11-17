import { useState } from "react";
import { Alert as Dialog, Modal, ScrollView, View } from "react-native";
import { Button, Field, Notice, T } from "@/components/ui";
import { Badge, Choice } from "@/components/widgets";
import type { SiteResult } from "@/lib/site-api";
import { colors } from "@/lib/theme";

type Access = "gerente" | "funcionario";
export type LoginRow = { id: string; name: string; email: string; access: Access };
const LABEL = { gerente: "Gerente", funcionario: "Funcionário" } as const;
const TEXT = {
  gerente: "Faz tudo: compras, produtos, fornecedores, valores e logins.",
  funcionario: "Conta o estoque e lança entradas e perdas. Não vê valores nem compras.",
} as const;
type Editing = { id: string | null; name: string; email: string; access: Access; password: string };

/**
 * Logins de uma loja, como o StoreLogins do site: quem entra, com qual acesso, criar, editar e remover.
 * Criar e mudar senha passam pelo site (chave secreta). `selfId` não pode se remover nem mudar o próprio acesso.
 */
export function StoreLogins({
  logins,
  selfId,
  storeName,
  onAdd,
  onUpdate,
  onRemove,
  onChanged,
}: {
  logins: LoginRow[];
  selfId: string;
  storeName: string;
  onAdd: (f: { name: string; email: string; password: string; access: string }) => Promise<SiteResult<{ ok?: string }>>;
  onUpdate: (f: { id: string; name: string; access: string; password: string }) => Promise<SiteResult<{ ok?: string }>>;
  onRemove: (id: string) => Promise<SiteResult<{ ok?: string }>>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const managers = logins.filter((l) => l.access === "gerente").length;
  const display = (l: LoginRow) => (l.name && l.name !== storeName ? l.name : "Login principal da loja");
  const self = editing?.id === selfId;
  const lastManager = Boolean(editing?.id && logins.find((l) => l.id === editing.id)?.access === "gerente" && managers < 2);

  async function submit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = editing.id
      ? await onUpdate({ id: editing.id, name: editing.name, access: editing.access, password: editing.password })
      : await onAdd({ name: editing.name, email: editing.email, password: editing.password, access: editing.access });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(null);
    if (res.data.ok) Dialog.alert("Pronto", String(res.data.ok));
    onChanged();
  }

  function remove(l: LoginRow) {
    Dialog.alert("Remover este login?", `${display(l)} (${l.email}) deixa de entrar no sistema. As contagens e os lançamentos que essa pessoa fez continuam na loja.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          const res = await onRemove(l.id);
          if (!res.ok) Dialog.alert("Não removeu", res.error);
          else onChanged();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 10 }}>
      {logins.map((l) => {
        const last = l.access === "gerente" && managers < 2;
        return (
          <View key={l.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <T weight="semibold">{display(l)}</T>
              <Badge tone={l.access === "gerente" ? "ok" : "off"}>{LABEL[l.access]}</Badge>
              {l.id === selfId && <T size={14} color={colors.muted}>(você)</T>}
            </View>
            <T size={14} color={colors.muted}>{l.email}</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                label="Editar"
                variant="secondary"
                style={{ flex: 1, minHeight: 44 }}
                onPress={() => {
                  setError(null);
                  setEditing({ id: l.id, name: l.name, email: l.email, access: l.access, password: "" });
                }}
              />
              {l.id !== selfId && !last && <Button label="Remover" variant="danger" style={{ flex: 1, minHeight: 44 }} onPress={() => remove(l)} />}
            </View>
          </View>
        );
      })}
      <Button
        label="Adicionar login"
        onPress={() => {
          setError(null);
          setEditing({ id: null, name: "", email: "", access: "funcionario", password: "" });
        }}
      />

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing && (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, backgroundColor: colors.bg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <T weight="extrabold" size={22}>{editing.id ? "Editar login" : "Novo login"}</T>
            <T color={colors.muted}>
              {editing.id ? editing.email : "Cada pessoa entra com o próprio e-mail. Fica registrado quem contou cada produto e quem lançou cada entrada."}
            </T>
            <Field label="Nome da pessoa" value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
            {!editing.id && (
              <Field label="E-mail" value={editing.email} onChangeText={(v) => setEditing({ ...editing, email: v })} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
            )}
            {self || lastManager ? (
              <T size={14} color={colors.muted}>{self ? "Você não pode mudar o seu próprio acesso." : "Este é o único gerente: crie outro antes de mudar."}</T>
            ) : (
              <>
                <Choice
                  label="Acesso"
                  value={editing.access}
                  options={[
                    { value: "funcionario", label: "Funcionário" },
                    { value: "gerente", label: "Gerente" },
                  ]}
                  onChange={(v) => setEditing({ ...editing, access: v })}
                />
                <T size={14} color={colors.muted}>{TEXT[editing.access]}</T>
              </>
            )}
            <Field
              label={editing.id ? "Nova senha" : "Senha"}
              hint={editing.id ? "Deixe em branco para manter a senha atual. Mínimo de 8 caracteres." : "Mínimo de 8 caracteres. Passe para a pessoa junto com o e-mail."}
              value={editing.password}
              onChangeText={(v) => setEditing({ ...editing, password: v })}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button label={editing.id ? "Salvar" : busy ? "Criando…" : "Criar login"} busy={busy} onPress={() => void submit()} />
            <Button label="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
