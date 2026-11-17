import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, font } from "@/lib/theme";

const MARK_TOP = "M1.5 0h7a5 5 0 0 1 0 10h-7A1.5 1.5 0 0 1 0 8.5v-7A1.5 1.5 0 0 1 1.5 0Z";
const MARK_BASE = "M1.5 12H13a6 6 0 0 1 0 12H1.5A1.5 1.5 0 0 1 0 22.5v-9A1.5 1.5 0 0 1 1.5 12Z";

/** Símbolo do BestStock: o bloco de cima na cor do texto, o de baixo laranja. */
export function LogoMark({ size = 24, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={(size * 19) / 24} height={size} viewBox="0 0 19 24" aria-hidden>
      <Path d={MARK_BASE} fill={colors.brand} />
      <Path d={MARK_TOP} fill={color} />
    </Svg>
  );
}

export function Logo({ size = 28, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.3 }} accessibilityLabel="BestStock">
      <LogoMark size={size * 0.9} color={color} />
      <Text style={{ fontSize: size, color, letterSpacing: -0.5 }}>
        <Text style={{ fontFamily: font.regular }}>Best</Text>
        <Text style={{ fontFamily: font.extrabold }}>Stock</Text>
      </Text>
    </View>
  );
}

type Weight = "regular" | "semibold" | "bold" | "extrabold";
export function T({
  weight = "regular",
  size = 16,
  color = colors.ink,
  style,
  ...rest
}: TextProps & { weight?: Weight; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[{ fontFamily: font[weight], fontSize: size, color, lineHeight: size * 1.35 }, style]} />;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
  style,
  ...rest
}: Omit<PressableProps, "style"> & {
  label: string;
  variant?: "primary" | "secondary" | "dark" | "danger";
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.brand, secondary: colors.card, dark: colors.ink, danger: colors.card }[variant];
  const fg = { primary: colors.ink, secondary: colors.ink, dark: "#fff", danger: colors.danger }[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        variant === "secondary" || variant === "danger" ? { borderWidth: 1, borderColor: colors.line } : null,
        style,
      ]}
      {...rest}
    >
      {busy ? <ActivityIndicator color={fg} /> : <T weight="bold" size={17} color={fg} style={{ textAlign: "center" }}>{label}</T>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Notice({
  children,
  tone = "info",
  title,
  style,
}: {
  children?: ReactNode;
  tone?: "info" | "warn" | "danger" | "ok";
  title?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { info: colors.card, warn: colors.brandSoft, danger: colors.dangerSoft, ok: colors.okSoft }[tone];
  return (
    <View
      accessibilityRole={tone === "danger" || tone === "warn" ? "alert" : undefined}
      style={[styles.notice, { backgroundColor: bg }, tone === "info" && { borderWidth: 1, borderColor: colors.line }, style]}
    >
      {title && <T weight="bold">{title}</T>}
      {typeof children === "string" ? <T size={15}>{children}</T> : children}
    </View>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T weight="semibold">{label}</T>
      <TextInput
        placeholderTextColor={colors.muted}
        {...input}
        accessibilityLabel={label}
        style={[styles.input, input.style, error ? { borderColor: colors.danger } : null]}
      />
      {hint && <T size={14} color={colors.muted}>{hint}</T>}
      {error && <T size={14} weight="semibold" color={colors.danger}>{error}</T>}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <T weight="bold" size={13} color={colors.muted} style={styles.section}>
      {children}
    </T>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  notice: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: 17,
    color: colors.ink,
  },
  section: { textTransform: "uppercase", letterSpacing: 1, marginTop: 8, marginBottom: 8 },
});

/** Campo de quantidade com botões de menos e mais, como o QuantityInput do site. Aceita vírgula. */
export function QuantityStepper({
  label,
  value,
  onChange,
  invalid = false,
  width = 76,
}: {
  /** Nome do produto, para leitores de tela. */
  label: string;
  value: string;
  onChange: (text: string) => void;
  invalid?: boolean;
  width?: number;
}) {
  const bump = (delta: number) => {
    const n = Number(value.trim().replace(",", "."));
    const base = Number.isFinite(n) ? n : 0;
    onChange(String(Math.max(0, Math.round((base + delta) * 1000) / 1000)).replace(".", ","));
  };
  const btn = { width: 48, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${label}`} hitSlop={4} onPress={() => bump(-1)} style={({ pressed }) => [btn, { backgroundColor: pressed ? colors.brandSoft : colors.bg }]}>
        <T weight="bold" size={24}>−</T>
      </Pressable>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="–"
        placeholderTextColor={colors.muted}
        accessibilityLabel={`Quantidade de ${label}`}
        selectTextOnFocus
        style={[styles.input, { width, paddingHorizontal: 4, textAlign: "center", fontFamily: font.bold, fontSize: 19 }, invalid ? { borderColor: colors.danger } : null]}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} hitSlop={4} onPress={() => bump(1)} style={({ pressed }) => [btn, { backgroundColor: pressed ? colors.brandSoft : colors.bg }]}>
        <T weight="bold" size={24}>+</T>
      </Pressable>
    </View>
  );
}
