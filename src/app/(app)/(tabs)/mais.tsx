import { router } from "expo-router";
import { Alert as Dialog, View } from "react-native";
import { Button } from "@/components/ui";
import { ListLink, Page } from "@/components/widgets";
import { useAuth, useProfile } from "@/lib/auth";

/** Mais opções, como no site. O funcionário já tem nas abas tudo o que usa: aqui fica só o sair. */
export default function MaisTab() {
  const profile = useProfile();
  const { signOut } = useAuth();
  const manager = profile.access === "gerente";
  return (
    <Page tab title="Mais opções" subtitle={profile.email}>
      {manager && (
        <View style={{ gap: 10 }}>
          <ListLink title="Consumo" subtitle="O que mais sai e o que está parado" onPress={() => router.push("/consumo")} />
          <ListLink title="Produtos" subtitle="Cadastrar e editar produtos" onPress={() => router.push("/produtos")} />
          <ListLink title="Fornecedores" subtitle="Prazos de entrega do gelado e do seco" onPress={() => router.push("/fornecedores")} />
          <ListLink title="Financeiro" subtitle="Plano, cobranças e pagamentos da unidade" onPress={() => router.push("/financeiro")} />
          <ListLink title="Configurações" subtitle="Período de contagem e logins da loja" onPress={() => router.push("/configuracoes")} />
        </View>
      )}
      <Button
        label="Sair do sistema"
        variant="secondary"
        onPress={() =>
          Dialog.alert("Sair do app?", "Para entrar de novo vai precisar do e-mail e da senha.", [
            { text: "Cancelar", style: "cancel" },
            { text: "Sair", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </Page>
  );
}
