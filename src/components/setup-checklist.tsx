import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { T } from "@/components/ui";
import { Badge, type IconName } from "@/components/widgets";
import { formatDate } from "@/lib/dates";
import type { SetupFacts } from "@/lib/site/setup";
import { colors } from "@/lib/theme";

type State = "ok" | "todo" | "warn" | "neutral";
type Item = { icon: IconName; title: string; text: string; status: string; state: State; badge?: string; href: string | null; link: string };

const BADGE: Record<State, { tone: "ok" | "warn" | "danger" | "off"; text: string }> = {
  ok: { tone: "ok", text: "Feito" },
  todo: { tone: "warn", text: "Falta fazer" },
  warn: { tone: "danger", text: "Atenção" },
  neutral: { tone: "off", text: "Opcional" },
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Mesmos itens e textos do SetupChecklist do site (configuracoes/setup-checklist.tsx), com os endereços do app.
function setupItems(f: SetupFacts): Item[] {
  const all = (n: number) => f.products > 0 && n >= f.products;
  return [
    {
      icon: "calendar-outline",
      title: "Período de contagem",
      text: "De quantos em quantos dias a loja conta o estoque. O sistema avisa o dia da contagem e calcula cada compra para durar até a contagem seguinte.",
      status: `A cada ${plural(f.countIntervalDays, "dia", "dias")}`,
      state: "ok",
      href: null,
      link: "Alterar o período aqui embaixo",
    },
    {
      icon: "car-outline",
      title: "Fornecedores com o prazo de entrega",
      text: "Quantos dias o gelado e o seco levam para chegar depois do pedido. Cada produto usa o prazo do tipo dele, somado ao período de contagem.",
      status: f.suppliers > 0 ? plural(f.suppliers, "fornecedor cadastrado", "fornecedores cadastrados") : "Nenhum fornecedor cadastrado",
      state: f.suppliers > 0 ? "ok" : "todo",
      href: "/fornecedores",
      link: "Abrir fornecedores",
    },
    {
      icon: "cube-outline",
      title: "Fornecedor em cada produto",
      text: "O produto entra na lista desse fornecedor e usa o prazo de gelado ou de seco, conforme o cadastro dele. Sem fornecedor, o sistema considera entrega no mesmo dia.",
      status: `${f.withSupplier} de ${plural(f.products, "produto", "produtos")} com fornecedor`,
      state: all(f.withSupplier) ? "ok" : "todo",
      href: all(f.withSupplier) ? "/produtos" : "/produtos?falta=fornecedor",
      link: all(f.withSupplier) ? "Abrir produtos" : "Ver produtos sem fornecedor",
    },
    {
      icon: "layers-outline",
      title: "Embalagem de compra",
      text: "Quantas unidades de contagem vêm em cada embalagem. Exemplo: caixa de 10 kg. É o que converte a entrada lançada e a sugestão de compra.",
      status:
        f.inPacks > 0
          ? `${plural(f.inPacks, "produto compra", "produtos compram")} em embalagem diferente da unidade de contagem`
          : "Todos os produtos contam e compram na mesma unidade",
      state: "neutral",
      badge: "Conferir",
      href: "/produtos",
      link: "Abrir produtos",
    },
    {
      icon: "cash-outline",
      title: "Custo por embalagem",
      text: "Mostra o valor do estoque e das compras e ordena o consumo pelo que mais pesa em dinheiro.",
      status: `${f.withCost} de ${plural(f.products, "produto", "produtos")} com custo`,
      state: all(f.withCost) ? "ok" : "todo",
      href: all(f.withCost) ? "/produtos" : "/produtos?falta=custo",
      link: all(f.withCost) ? "Abrir produtos" : "Ver produtos sem custo",
    },
    {
      icon: "locate-outline",
      title: "Estoque mínimo e validade",
      text: "O mínimo é o piso da sugestão de compra e vale para produto sem histórico. A validade impede sugerir mais do que dá para usar.",
      status: `${f.withMin} com mínimo · ${f.withShelf} com validade`,
      state: "neutral",
      href: "/produtos",
      link: "Abrir produtos",
    },
  ];
}

function routineItems(f: SetupFacts): Item[] {
  const count: Pick<Item, "status" | "state" | "badge"> = !f.lastCount
    ? { status: "Nenhuma contagem fechada ainda", state: "todo" }
    : f.countDue?.overdue
      ? { status: f.countDue.text, state: "warn" }
      : f.notCounted > 0
        ? { status: `${plural(f.notCounted, "produto ficou", "produtos ficaram")} sem contar em ${formatDate(f.lastCount)}`, state: "warn" }
        : { status: `Última contagem em ${formatDate(f.lastCount)}, com todos os produtos`, state: "ok", badge: "Em dia" };
  const entries: Pick<Item, "status" | "state" | "badge"> =
    f.closedCounts < 2
      ? { status: "Vale a partir da segunda contagem", state: "neutral", badge: "Rotina" }
      : f.negativePeriods > 0
        ? { status: `${plural(f.negativePeriods, "produto teve", "produtos tiveram")} período ignorado: confira as entradas`, state: "warn" }
        : { status: "Nenhum período ignorado nas últimas contagens", state: "ok", badge: "Em dia" };
  return [
    {
      icon: "clipboard-outline",
      title: "Contar no dia e contar tudo",
      text: "A contagem é a base de todos os números. Produto que fica sem contar aparece como Sem dados e sai da lista de compras.",
      ...count,
      href: "/inventario",
      link: "Abrir inventário",
    },
    {
      icon: "add-circle-outline",
      title: "Lançar toda entrada",
      text: "Mercadoria que chega e fica sem lançar faz o consumo parecer menor. Se a conta fica negativa, o sistema ignora aquele período.",
      ...entries,
      href: "/entradas",
      link: "Abrir entradas",
    },
    {
      icon: "remove-circle-outline",
      title: "Lançar as perdas",
      text: "O que venceu, quebrou ou estragou sai do estoque sem contar como consumo. Sem lançar, a perda entra na média e a compra sugerida sobe.",
      status: "Lance no dia em que acontecer",
      state: "neutral",
      badge: "Rotina",
      href: "/lancar?tipo=perda",
      link: "Registrar perda",
    },
    {
      icon: "bar-chart-outline",
      title: "Histórico de contagens",
      text: "O consumo aparece a partir da segunda contagem fechada. Com quatro ou mais, a folga de segurança passa a seguir a variação real da loja.",
      status:
        f.closedCounts >= 2 && f.closedCounts < 4
          ? `${plural(f.closedCounts, "contagem fechada", "contagens fechadas")}. Com 4, a folga fica mais precisa`
          : plural(f.closedCounts, "contagem fechada", "contagens fechadas"),
      state: f.closedCounts >= 2 ? "ok" : "todo",
      href: "/inventario",
      link: "Abrir inventário",
    },
  ];
}

function Group({ title, description, items }: { title: string; description: string; items: Item[] }) {
  const tracked = items.filter((i) => i.state !== "neutral");
  const ready = tracked.filter((i) => i.state === "ok").length;
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
      <View style={{ backgroundColor: colors.bg, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" size={18}>{title}</T>
          <T size={14} color={colors.muted}>{description}</T>
        </View>
        <T weight="bold" size={14}>{`${ready} de ${tracked.length} em ordem`}</T>
      </View>
      {items.map((item, i) => {
        const badge = BADGE[item.state];
        return (
          <View key={item.title} style={{ flexDirection: "row", gap: 12, padding: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.line }}>
            <Ionicons name={item.icon} size={26} color={colors.ink} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <View>
                <T weight="bold">{item.title}</T>
                <T size={14} color={colors.muted}>{item.text}</T>
              </View>
              <Badge tone={badge.tone}>{item.badge ?? badge.text}</Badge>
              <T weight="semibold" size={14}>{item.status}</T>
              {item.href ? (
                <Pressable accessibilityRole="link" onPress={() => router.push(item.href as never)} style={{ minHeight: 36, justifyContent: "center", alignSelf: "flex-start" }}>
                  <T weight="bold" size={14} style={{ textDecorationLine: "underline" }}>{`${item.link} ›`}</T>
                </Pressable>
              ) : (
                <T weight="semibold" size={14} color={colors.muted}>{item.link}</T>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Lista do que a loja precisa preencher e manter para o consumo e a compra saírem certos, como no site. */
export function SetupChecklist({ facts }: { facts: SetupFacts }) {
  return (
    <View style={{ gap: 14 }}>
      <Group title="Cadastro" description="Preenche uma vez e revisa quando algo mudar." items={setupItems(facts)} />
      <Group title="Rotina" description="O que mantém os números certos entre uma contagem e outra." items={routineItems(facts)} />
    </View>
  );
}
