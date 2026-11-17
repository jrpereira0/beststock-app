import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/theme";

// Os dois blocos do símbolo, em unidades do desenho (19 × 24), iguais ao LogoMark do site.
const TOP = "M1.5 0h7a5 5 0 0 1 0 10h-7A1.5 1.5 0 0 1 0 8.5v-7A1.5 1.5 0 0 1 1.5 0Z";
const BASE = "M1.5 12H13a6 6 0 0 1 0 12H1.5A1.5 1.5 0 0 1 0 22.5v-9A1.5 1.5 0 0 1 1.5 12Z";
const DURATION = 6000;

/**
 * Símbolo do BestStock animado, com a mesma coreografia do site (globals.css, logo-base/top/new):
 * a base laranja sai pela direita, volta no lugar do bloco de cima e desce até virar base de novo,
 * enquanto um bloco novo cai por cima e encaixa. Quem pede menos movimento no aparelho vê o símbolo parado.
 */
export function LoadingMark({ size = 56, color = colors.ink, label = "Carregando" }: { size?: number; color?: string; label?: string }) {
  const [t] = useState(() => new Animated.Value(0));
  const [still, setStill] = useState(false);
  const u = size / 24; // pixels por unidade do desenho

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => alive && setStill(reduce));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [still, t]);

  const at = (keys: [number, number][]) =>
    t.interpolate({ inputRange: keys.map(([p]) => p / 100), outputRange: keys.map(([, v]) => v), extrapolate: "clamp" });

  // Base laranja (blocos de 19 de largura e 12 de altura, que começam na linha 12).
  const base = {
    opacity: at([[0, 1], [8, 1], [15, 0], [16, 0], [19.5, 1], [100, 1]]),
    transform: [
      { translateX: at([[0, 0], [8, 0], [15, 6 * u], [15.01, 0], [100, 0]]) },
      { translateY: at([[0, 0], [15, 0], [15.01, -14 * u], [16, -14 * u], [24.5, 0], [100, 0]]) },
      { scaleX: at([[0, 1], [15, 1], [15.01, 0.7105], [16, 0.7105], [24.5, 1], [100, 1]]) },
      { scaleY: at([[0, 1], [15, 1], [15.01, 0.8333], [16, 0.8333], [24.5, 1], [29.5, 1], [31, 0.94], [35, 1], [100, 1]]) },
    ],
  };
  // Bloco de cima: desce, cresce até o tamanho da base e some por cima do laranja.
  const top = {
    opacity: at([[0, 1], [19.5, 1], [24.5, 0], [100, 0]]),
    transform: [
      { translateY: at([[0, 0], [16, 0], [24.5, 14 * u], [100, 14 * u]]) },
      { scaleX: at([[0, 1], [16, 1], [24.5, 1.4074], [100, 1.4074]]) },
      { scaleY: at([[0, 1], [16, 1], [24.5, 1.2], [100, 1.2]]) },
    ],
  };
  // Bloco novo: cai do alto, amassa no encaixe e volta.
  const fresh = {
    opacity: at([[0, 0], [21, 0], [23.5, 1], [100, 1]]),
    transform: [
      { translateY: at([[0, -10 * u], [21, -10 * u], [29.5, 0], [31, 0.7 * u], [33.5, 0], [100, 0]]) },
      { scaleY: at([[0, 1], [29.5, 1], [31, 0.86], [33.5, 1.03], [36, 1], [100, 1]]) },
    ],
  };

  const block = (d: string, fill: string, y: number, h: number, w: number) => (
    <Svg width={w * u} height={h * u} viewBox={`0 ${y} ${w} ${h}`}>
      <Path d={d} fill={fill} />
    </Svg>
  );
  // Cada bloco gira em torno do canto de baixo à esquerda, como no site.
  const origin = { transformOrigin: "left bottom" } as const;

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ width: 19 * u, height: 24 * u, overflow: "visible" }}>
      <Animated.View style={[{ position: "absolute", left: 0, top: 12 * u }, origin, still ? null : base]}>{block(BASE, colors.brand, 12, 12, 19)}</Animated.View>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, origin, still ? null : top]}>{block(TOP, color, 0, 10, 13.5)}</Animated.View>
      {!still && (
        <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, origin, fresh]}>{block(TOP, color, 0, 10, 13.5)}</Animated.View>
      )}
    </View>
  );
}

/** Tela inteira de carregamento: o símbolo animado no meio. */
export function LoadingScreen({ dark = false }: { dark?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: dark ? colors.ink : colors.bg }}>
      {dark && <StatusBar style="light" />}
      <LoadingMark size={64} color={dark ? "#fff" : colors.ink} />
    </View>
  );
}
