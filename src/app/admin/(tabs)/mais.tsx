import { router } from "expo-router";
import { Dialog } from "@/lib/dialog";
import { View } from "react-native";
import { Button } from "@/components/ui";
import { ListLink, Page } from "@/components/widgets";
import { useAdmin, useAuth } from "@/lib/auth";

/** Mais opções do administrador, como no site: lista padrão, avisos, contatos e sair. */
export default function AdminMais() {
  const admin = useAdmin();
  const { signOut } = useAuth();
  return (
    <Page tab="admin" title="Mais opções" subtitle={admin.email}>
      <View style={{ gap: 10 }}>
        <ListLink icon="megaphone-outline" title="Avisos" subtitle="Mensagens para as unidades" onPress={() => router.push("/admin/avisos")} />
        <ListLink icon="people-outline" title="Contatos" subtitle="Pedidos de demonstração do site" onPress={() => router.push("/admin/contatos")} />
        <ListLink icon="list-outline" title="Lista padrão" subtitle="Produtos copiados para unidades novas" onPress={() => router.push("/admin/catalogo")} />
      </View>
      <Button
        label="Sair do sistema"
        icon="log-out-outline"
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
