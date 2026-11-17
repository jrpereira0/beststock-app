import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { T } from "@/components/ui";
import { useAdminAlerts } from "@/lib/admin-alerts";
import { useNotifications } from "@/lib/notifications";
import { colors } from "@/lib/theme";

/** Sino das notificações da loja, com o número do que pede atenção, como no topo do site. */
export function Bell() {
  const { data } = useNotifications();
  return <BellButton count={data?.alerts.length ?? 0} href="/notificacoes" />;
}

/** Sino do administrador da rede. */
export function AdminBell() {
  const { alerts } = useAdminAlerts();
  return <BellButton count={alerts?.length ?? 0} href="/admin/notificacoes" />;
}

function BellButton({ count, href }: { count: number; href: "/notificacoes" | "/admin/notificacoes" }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notificações: ${count}` : "Notificações"}
      onPress={() => router.push(href)}
      hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: pressed ? colors.line : "transparent" })}
    >
      <Ionicons name={count > 0 ? "notifications" : "notifications-outline"} size={26} color={colors.ink} />
      {count > 0 && (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 2,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        >
          <T weight="extrabold" size={11} color="#fff" style={{ lineHeight: 13 }}>{count > 99 ? "99+" : String(count)}</T>
        </View>
      )}
    </Pressable>
  );
}
