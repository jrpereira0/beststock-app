import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminBell, Bell } from "@/components/bell";
import { PageSkeleton } from "@/components/skeleton";
import { Card, Notice, T } from "@/components/ui";
import { colors } from "@/lib/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Página com rolagem, título, "puxar para atualizar", aviso de sem internet e erro de carga. */
export function Page({
  title,
  subtitle,
  children,
  refreshing = false,
  onRefresh,
  fromCache = false,
  error,
  loading = false,
  tab = false,
  footer,
  skeleton = "list",
}: {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  fromCache?: boolean;
  error?: string | null;
  loading?: boolean;
  /** Tela de aba: sem cabeçalho de navegação, então respeita a área do relógio. */
  tab?: boolean | "admin";
  footer?: ReactNode;
  /** Formato do esqueleto enquanto carrega: lista, contagem ou painel com números. */
  skeleton?: "list" | "count" | "dashboard";
}) {
  // Carregando: o esqueleto da tela, com blocos que piscam (como o carregamento do site).
  if (loading && !error && !fromCache) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={tab ? ["top"] : []}>
        <PageSkeleton title={Boolean(title)} variant={skeleton} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={tab ? ["top"] : []}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {title && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="extrabold" size={26}>{title}</T>
              {subtitle && <T color={colors.muted}>{subtitle}</T>}
            </View>
            {tab === "admin" ? <AdminBell /> : tab ? <Bell /> : null}
          </View>
        )}
        {fromCache && (
          <Notice tone="warn" title="Sem internet">
            Mostrando o que foi guardado neste aparelho. Puxe para baixo para atualizar quando a conexão voltar.
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {loading && !error ? <PageSkeleton title={false} variant={skeleton} /> : children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

/** Barra de baixo com o botão principal da tela. */
export function Footer({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>{children}</View>
    </SafeAreaView>
  );
}

/** Linha de lista que abre outra tela. */
export function ListLink({
  title,
  subtitle,
  onPress,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  right?: ReactNode;
  /** Ícone à esquerda, como nas listas do site. */
  icon?: IconName;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
        {icon && (
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon} size={24} color={colors.ink} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="bold" size={17}>{title}</T>
          {subtitle ? <T size={14} color={colors.muted}>{subtitle}</T> : null}
        </View>
        {right}
        <T weight="bold" size={22} color={colors.muted}>›</T>
      </Card>
    </Pressable>
  );
}

type Tone = "ok" | "warn" | "danger" | "off" | "info";
export function Badge({ children, tone = "off" }: { children: string; tone?: Tone }) {
  const bg = { ok: colors.okSoft, warn: colors.brandSoft, danger: colors.dangerSoft, off: colors.line, info: "#e6effa" }[tone];
  const fg = { ok: colors.ok, warn: colors.brandText, danger: colors.danger, off: colors.muted, info: "#1f5fa8" }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <T weight="bold" size={13} color={fg}>{children}</T>
    </View>
  );
}

/** Número grande com rótulo, como os quadros do site. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  onPress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "danger" | "warn" | "ok";
  onPress?: () => void;
}) {
  const color = { neutral: colors.ink, danger: colors.danger, warn: colors.brandText, ok: colors.ok }[tone];
  const content = (
    <Card style={{ flex: 1, gap: 2 }}>
      <T size={14} weight="semibold" color={colors.muted}>{label}</T>
      <T weight="extrabold" size={22} color={color}>{String(value)}</T>
      {hint ? <T size={13} color={colors.muted}>{hint}</T> : null}
    </Card>
  );
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} disabled={!onPress} onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      {content}
    </Pressable>
  );
}

/** Escolha entre poucas opções (conservação, forma de pagamento...). */
export function Choice<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label && <T weight="semibold">{label}</T>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 12,
                justifyContent: "center",
                backgroundColor: active ? colors.ink : colors.card,
                borderWidth: 1,
                borderColor: active ? colors.ink : colors.line,
              }}
            >
              <T weight="semibold" size={15} color={active ? "#fff" : colors.ink}>{o.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Liga e desliga, com texto ao lado. */
export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}
    >
      <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? colors.brand : colors.line }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", marginLeft: value ? 20 : 0 }} />
      </View>
      <View style={{ flex: 1 }}>
        <T weight="semibold">{label}</T>
        {hint ? <T size={14} color={colors.muted}>{hint}</T> : null}
      </View>
    </Pressable>
  );
}

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Dias para escolher, no lugar do calendário (é o que a loja usa: hoje e os dias anteriores). */
export function DayPicker({ value, onChange, days, todayIso }: { value: string; onChange: (d: string) => void; days: string[]; todayIso: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {days.map((d) => {
        const active = d === value;
        const [, m, day] = d.split("-");
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${day}/${m}`}
            onPress={() => onChange(d)}
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
            <T size={12} color={active ? "#fff" : colors.muted}>{d === todayIso ? "hoje" : WEEK[new Date(`${d}T12:00:00Z`).getUTCDay()]}</T>
            <T weight="bold" size={15} color={active ? "#fff" : colors.ink}>{`${day}/${m}`}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Data de um dia como o selo escuro do histórico do site ("nov / 17"). */
export function DateMark({ iso }: { iso: string }) {
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [, m, d] = iso.split("-");
  return (
    <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
      <T weight="bold" size={11} color={colors.brand} style={{ textTransform: "uppercase" }}>{MONTHS[Number(m) - 1]}</T>
      <T weight="extrabold" size={18} color="#fff">{d}</T>
    </View>
  );
}
