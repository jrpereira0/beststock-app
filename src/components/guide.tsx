import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Card, T } from "@/components/ui";
import type { Guide as GuideData } from "@/lib/guides";
import { colors } from "@/lib/theme";

/**
 * Explicação curta dos termos da tela, como o ColumnGuide do site no celular: recolhida atrás do título,
 * com "Mostrar" e "Esconder".
 */
export function Guide({ guide, open: startOpen = false }: { guide: GuideData; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ minHeight: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Ionicons name="help-circle-outline" size={20} color={colors.ink} />
          <T weight="bold">{guide.title}</T>
        </View>
        <T weight="semibold" size={14} color={colors.muted}>{open ? "Esconder" : "Mostrar"}</T>
      </Pressable>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, padding: 16, gap: 14 }}>
          {guide.items.map((item) => (
            <View key={item.title} style={{ flexDirection: "row", gap: 12 }}>
              <Ionicons name={item.icon} size={24} color={colors.ink} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <T weight="bold">{item.title}</T>
                <T size={14} color={colors.muted}>{item.text}</T>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Exemplo de uma semana de açaí: 20 kg contados, chegam 40 kg, sobram 15 kg. Saíram 45 kg.
const STEPS = [
  { icon: "clipboard-outline", title: "Você conta", value: "20 kg", caption: "tinha no domingo", height: 44, bar: colors.ink },
  { icon: "add-circle-outline", title: "Chega compra", value: "40 kg", caption: "4 caixas na quarta", height: 89, bar: colors.ok },
  { icon: "clipboard-outline", title: "Conta de novo", value: "15 kg", caption: "sobrou no outro domingo", height: 33, bar: colors.ink },
  { icon: "bar-chart-outline", title: "Sistema calcula", value: "45 kg", caption: "saíram na semana", height: 100, bar: colors.brand },
] as const;
const OPERATORS = ["+", "−", "="];

/** Explicação visual do sistema, como o HowItWorks do site: a conta que ele faz, com um exemplo em barras. */
export function HowItWorks() {
  return (
    <Card style={{ gap: 14, borderRadius: 24 }}>
      <View>
        <T weight="extrabold" size={20}>Como o BestStock funciona</T>
        <T color={colors.muted}>Um exemplo com o açaí, em uma semana.</T>
      </View>
      <View
        accessible
        accessibilityLabel="20 kg contados, mais 40 kg que chegaram, menos 15 kg que sobraram: saíram 45 kg na semana."
        style={{ flexDirection: "row", alignItems: "flex-start" }}
      >
        {STEPS.map((step, i) => (
          <View key={step.title} style={{ flexDirection: "row", flex: 1, alignItems: "flex-start" }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
                <T weight="extrabold" size={12}>{String(i + 1)}</T>
              </View>
              <Ionicons name={step.icon} size={26} color={colors.ink} style={{ marginTop: 6 }} />
              <T weight="bold" size={12} numberOfLines={2} style={{ textAlign: "center", height: 34, marginTop: 2 }}>{step.title}</T>
              <View style={{ height: 96, width: "100%", alignItems: "center", justifyContent: "flex-end" }}>
                <View style={{ width: 30, height: `${step.height}%`, backgroundColor: step.bar, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
              </View>
              <View style={{ alignSelf: "stretch", borderTopWidth: 2, borderTopColor: colors.ink, paddingTop: 4, alignItems: "center" }}>
                <T weight="extrabold" size={16}>{step.value}</T>
                <T size={11} color={colors.muted} numberOfLines={3} style={{ textAlign: "center", height: 46 }}>{step.caption}</T>
              </View>
            </View>
            {i < OPERATORS.length && (
              // Na altura da base das barras: número (24) + ícone (32) + título (36) + barra (96).
              <T weight="extrabold" size={18} color={colors.muted} style={{ marginTop: 166, marginHorizontal: 1 }}>
                {OPERATORS[i]}
              </T>
            )}
          </View>
        ))}
      </View>
      <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 16, flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Ionicons name="cart" size={36} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <T weight="bold" size={12} color={colors.brand} style={{ textTransform: "uppercase", letterSpacing: 1 }}>E avisa o que comprar</T>
          <T weight="extrabold" size={18} color="#fff">Pedir 5 caixas de açaí</T>
          <T size={14} color="rgba(255,255,255,0.75)">O suficiente para a próxima semana, com uma folga. Sem faltar e sem dinheiro parado.</T>
        </View>
      </View>
    </Card>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** O caminho da cobrança em três passos, como o BillingGuide do site; o primeiro que falta fica em destaque. */
export function BillingGuide({ plans, units, billed, open }: { plans: number; units: number; billed: number; open: number }) {
  const steps = [
    {
      title: "Crie os planos",
      text: "O plano diz o valor e de quanto em quanto tempo a unidade paga. Exemplo: Mensal, R$ 150,00 por mês.",
      status: plans ? plural(plans, "plano ativo", "planos ativos") : "Nenhum plano ainda",
      done: plans > 0,
      href: plans ? "/admin/planos" : "/admin/planos/novo",
      link: plans ? "Ver planos" : "Criar o primeiro plano",
    },
    {
      title: "Escolha o plano de cada unidade",
      text: "Na ficha da unidade, seção Plano, você escolhe o plano e o dia do vencimento.",
      status: units ? `${billed} de ${plural(units, "unidade", "unidades")} com plano` : "Nenhuma unidade cadastrada",
      done: billed > 0,
      href: "/admin/lojas",
      link: "Ver unidades",
    },
    {
      title: "Receba e registre o pagamento",
      text: "O sistema cria cada cobrança sozinho, no mês certo. Quando a unidade pagar, toque em Registrar pagamento.",
      status: open ? plural(open, "cobrança aguardando pagamento", "cobranças aguardando pagamento") : "Nada para receber agora",
      done: false,
      href: null,
      link: null,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <View style={{ gap: 10 }}>
      {steps.map((s, i) => {
        const now = i === current && s.href !== null;
        return (
          <View key={s.title} style={{ borderRadius: 18, borderWidth: 1, borderColor: now ? colors.brand : colors.line, backgroundColor: now ? colors.brandSoft : colors.card, padding: 16, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: s.done ? colors.ok : colors.ink, alignItems: "center", justifyContent: "center" }}>
                {s.done ? <Ionicons name="checkmark" size={16} color="#fff" accessibilityLabel="Feito" /> : <T weight="extrabold" size={13} color="#fff">{String(i + 1)}</T>}
              </View>
              <T weight="extrabold" style={{ flex: 1 }}>{s.title}</T>
            </View>
            <T size={14} color={colors.muted}>{s.text}</T>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <T weight="bold" size={14}>{s.status}</T>
              {s.href && (
                <Pressable accessibilityRole="link" onPress={() => router.push(s.href as never)} style={{ minHeight: 36, justifyContent: "center" }}>
                  <T weight="bold" size={14} style={{ textDecorationLine: "underline" }}>{`${s.link} ›`}</T>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
