import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View, type DimensionValue } from "react-native";
import { colors } from "@/lib/theme";

/** Pulso compartilhado pelos blocos de uma tela: todos piscam juntos, como o animate-pulse do site. */
function usePulse() {
  const [v] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive || reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [v]);
  return v;
}

function Bar({ w = "100%", h = 16, r = 10, style }: { w?: DimensionValue; h?: number; r?: number; style?: object }) {
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: colors.line }, style]} />;
}

/** Um cartão de lista: nome, linha de detalhe e o campo à direita. */
function RowCard({ withField = false }: { withField?: boolean }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 8 }}>
        <Bar w="65%" h={16} />
        <Bar w="40%" h={12} />
      </View>
      {withField && <Bar w={150} h={48} r={14} />}
    </View>
  );
}

/**
 * Esqueleto da tela enquanto os dados chegam: o formato da página em blocos cinza que piscam,
 * como o carregamento do site. `variant` muda o miolo: lista de produtos ou painel com números.
 */
export function PageSkeleton({ title = true, variant = "list" }: { title?: boolean; variant?: "list" | "count" | "dashboard" }) {
  const pulse = usePulse();
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Carregando" style={{ opacity: pulse, padding: 16, gap: 16 }}>
      {title && (
        <View style={{ gap: 10 }}>
          <Bar w="55%" h={28} />
          <Bar w="85%" h={14} />
        </View>
      )}
      {variant === "dashboard" && (
        <>
          <Bar h={150} r={24} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <Bar key={i} w="48%" h={84} r={18} />
            ))}
          </View>
        </>
      )}
      {variant === "count" && (
        <>
          <Bar h={72} r={18} />
          <Bar h={52} r={14} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[90, 70, 110].map((w, i) => (
              <Bar key={i} w={w} h={40} r={20} />
            ))}
          </View>
        </>
      )}
      <Bar w={120} h={12} style={{ marginTop: 4 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <RowCard key={i} withField={variant === "count"} />
      ))}
    </Animated.View>
  );
}

/** Linhas do painel de notificações: ícone redondo e duas linhas de texto. */
export function NotificationsSkeleton() {
  const pulse = usePulse();
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Carregando" style={{ opacity: pulse, paddingTop: 16 }}>
      <Bar w={140} h={12} style={{ marginHorizontal: 20, marginBottom: 12 }} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Bar w={40} h={40} r={20} />
          <View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
            <Bar w="75%" h={15} />
            <Bar w="90%" h={12} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}
