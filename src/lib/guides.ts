// Dicas "Como funciona" de cada tela, com os mesmos textos do site (const guide: GuideItem[] de cada página).
// Os ícones são os equivalentes do Ionicons aos do site.
import type { IconName } from "@/components/widgets";

export type GuideItem = { icon: IconName; title: string; text: string };
export type Guide = { title: string; items: GuideItem[] };

export const GUIDES = {
  inicio: {
    title: "O que significam estes números",
    items: [
      { icon: "warning-outline", title: "Risco de faltar", text: "Produtos que podem acabar antes de uma nova compra chegar." },
      { icon: "cart-outline", title: "Para comprar", text: "Produtos que estão na lista de compras, com o valor estimado do pedido." },
      { icon: "layers-outline", title: "Em excesso", text: "Produtos parados ou com estoque para mais do que o dobro do tempo necessário." },
      { icon: "cash-outline", title: "Valor em estoque", text: "Quanto vale o que está na loja hoje, pelo custo cadastrado dos produtos." },
    ],
  },
  inventario: {
    title: "Como funciona",
    items: [
      { icon: "clipboard-outline", title: "Contagem", text: "Você anota o que há no estoque no dia. Cada produto é salvo sozinho e dá para continuar depois." },
      { icon: "lock-closed-outline", title: "Fechamento", text: "Ao fechar, a contagem passa a valer para os cálculos. A mais recente pode ser reaberta para corrigir." },
      { icon: "bar-chart-outline", title: "Para que serve", text: "A diferença entre duas contagens mostra o consumo. A partir da segunda, o sistema monta a lista de compras." },
    ],
  },
  entradas: {
    title: "Como funciona",
    items: [
      { icon: "add-circle-outline", title: "Entrada", text: "Mercadoria que chegou. Soma no estoque até a próxima contagem." },
      { icon: "remove-circle-outline", title: "Perda", text: "O que venceu, quebrou ou estragou. Sai do estoque sem contar como consumo." },
      { icon: "bar-chart-outline", title: "Para que serve", text: "Com os dois lançados, o sistema sabe quanto a loja consumiu de verdade entre uma contagem e outra." },
    ],
  },
  compras: {
    title: "Como ler esta lista",
    items: [
      {
        icon: "cube-outline",
        title: "Tem hoje",
        text: "Uma estimativa: a última contagem, mais as entradas e menos as perdas lançadas depois, menos o que costuma sair nos dias que passaram.",
      },
      { icon: "trending-up-outline", title: "Sai por semana", text: "A média do que a loja consumiu entre as contagens." },
      {
        icon: "locate-outline",
        title: "Precisa",
        text: "O estoque que você precisa ter hoje para chegar até a próxima compra ser entregue, com uma margem de segurança. Precisa menos tem hoje, menos o que está a caminho, é o que comprar.",
      },
      { icon: "cart-outline", title: "Comprar", text: "O que falta depois do que já está a caminho. Mude o número se quiser pedir diferente." },
    ],
  },
  consumo: {
    title: "Como ler esta tela",
    items: [
      { icon: "trending-up-outline", title: "Sai por semana", text: "Média do que a loja consumiu entre as últimas contagens. As mais recentes pesam mais." },
      {
        icon: "cube-outline",
        title: "Tem hoje",
        text: "O estoque estimado de hoje (a última contagem menos o que costuma sair desde então) e para quantos dias ele é suficiente.",
      },
      { icon: "bar-chart-outline", title: "Classe A, B e C", text: "A são os produtos que mais pesam no consumo da loja, B os intermediários e C os de pouco giro." },
      {
        icon: "warning-outline",
        title: "Situação",
        text: "Risco de faltar: pode acabar antes de a compra chegar. Comprar: já está na lista. Em excesso: tem muito mais do que precisa.",
      },
    ],
  },
  produtos: {
    title: "Como funciona o cadastro",
    items: [
      { icon: "clipboard-outline", title: "Unidade de contagem", text: "Como você conta o produto no estoque: kg, unidade, pote." },
      { icon: "cube-outline", title: "Embalagem de compra", text: "Como o produto chega do fornecedor. Exemplo: caixa com 10 kg." },
      { icon: "cash-outline", title: "Custo", text: "Preço de uma embalagem. Com ele aparecem o valor do estoque e o valor da lista de compras." },
      { icon: "locate-outline", title: "Estoque mínimo", text: "Quantidade que você quer ter sempre. A lista de compras repõe pelo menos até ela." },
    ],
  },
  fornecedores: {
    title: "Como funciona",
    items: [
      { icon: "car-outline", title: "Dois prazos", text: "Gelados e secos podem ter prazos diferentes. Na lista de compras, cada produto usa o prazo do tipo dele." },
      { icon: "calendar-outline", title: "A cada contagem", text: "A lista de compras sai nova a cada contagem do estoque. O período de contagem fica em Configurações." },
      {
        icon: "cart-outline",
        title: "Na lista de compras",
        text: "Cada pedido é calculado para durar até a próxima contagem, mais os dias da entrega. Cada fornecedor tem a sua lista.",
      },
    ],
  },
  calculo: {
    title: "Ver o cálculo com um exemplo",
    items: [
      {
        icon: "calendar-outline",
        title: "Contagem a cada",
        text: "De quanto em quanto tempo você conta o estoque. A cada contagem sai uma lista de compras nova. Exemplo: a cada 7 dias.",
      },
      {
        icon: "car-outline",
        title: "Dias para entregar",
        text: "Tempo entre o pedido e a chegada, no cadastro do fornecedor. Exemplo: 2 dias. Então cada pedido precisa durar 9 dias.",
      },
      { icon: "trending-up-outline", title: "Consumo", text: "Média do que saiu entre as contagens. Exemplo: 2 kg por dia, ou 18 kg em 9 dias, mais uma folga." },
      {
        icon: "cart-outline",
        title: "Compra sugerida",
        text: "O que falta para chegar nesse total, em embalagens. Com 5 kg na loja, o pedido cobre os 13 kg que faltam e a folga.",
      },
    ],
  },
  financeiro: {
    title: "Como funciona",
    items: [
      { icon: "wallet-outline", title: "Plano", text: "Define o valor e de quanto em quanto tempo a unidade paga." },
      { icon: "receipt-outline", title: "Cobrança", text: "Aparece aqui sozinha, com o valor e a data de vencimento." },
      { icon: "checkmark-circle-outline", title: "Pagamento", text: "Pague pela forma combinada. O administrador confirma e a cobrança passa a aparecer como paga." },
      { icon: "warning-outline", title: "Atraso", text: "Cobrança que passou do vencimento sem pagamento. Com atraso, a unidade pode ser bloqueada." },
    ],
  },
  painel: {
    title: "O que significam estes números",
    items: [
      { icon: "storefront-outline", title: "Unidades", text: "As ativas usam o sistema. As bloqueadas não entram. Sem cobrança, a unidade entra, mas o plano não gera cobrança." },
      { icon: "checkmark-circle-outline", title: "Recebido", text: "Pagamentos que você registrou neste mês." },
      { icon: "receipt-outline", title: "A receber", text: "Cobranças que ainda não foram pagas, vencidas ou não." },
      { icon: "warning-outline", title: "Em atraso", text: "Cobranças que passaram do vencimento sem pagamento." },
    ],
  },
  lojas: {
    title: "Como funciona",
    items: [
      { icon: "checkmark-circle-outline", title: "Ativa", text: "A unidade entra no sistema e usa normalmente." },
      { icon: "lock-closed-outline", title: "Bloqueada", text: "A unidade não consegue entrar, mesmo com a senha certa. Os dados dela continuam guardados." },
      { icon: "warning-outline", title: "Com atraso", text: "Tem cobrança vencida sem pagamento. O valor devido aparece ao lado do nome." },
      {
        icon: "wallet-outline",
        title: "Plano",
        text: "Define quanto a unidade paga. Com a cobrança desligada, ela continua entrando, mas o plano não gera cobrança.",
      },
    ],
  },
  planos: {
    title: "Como funciona",
    items: [
      { icon: "wallet-outline", title: "Plano", text: "Diz o valor e de quanto em quanto tempo a unidade paga. Exemplo: Mensal, R$ 150,00 por mês." },
      { icon: "receipt-outline", title: "Cobrança automática", text: "O sistema cria cada cobrança sozinho, na data certa, pelo plano de cada unidade." },
      { icon: "lock-closed-outline", title: "Desativado", text: "O plano deixa de aparecer para escolha nas unidades." },
    ],
  },
  catalogo: {
    title: "Como funciona",
    items: [
      {
        icon: "list-outline",
        title: "Lista padrão",
        text: "Produtos que a loja nova já recebe cadastrados, ligados ao fornecedor da rede e com o custo da rede.",
      },
      {
        icon: "cube-outline",
        title: "O que é copiado",
        text: "Nome, categoria, gelado ou seco, unidades, validade, custo e o fornecedor da rede. O estoque mínimo a loja preenche.",
      },
      {
        icon: "storefront-outline",
        title: "Depois de copiar",
        text: "Mudar o custo aqui muda em todas as lojas, menos nas que mudaram o custo do produto por conta própria. O resto vale para as lojas novas.",
      },
    ],
  },
  avisos: {
    title: "Como funciona",
    items: [
      { icon: "megaphone-outline", title: "Aviso", text: "Mensagem para uma unidade ou para todas. Aparece no sino de notificações de cada uma." },
      { icon: "warning-outline", title: "Importante", text: "O aviso marcado como importante aparece em destaque para a unidade." },
      { icon: "checkmark-circle-outline", title: "Lido por", text: "Quantas unidades já marcaram o aviso como lido." },
    ],
  },
} satisfies Record<string, Guide>;
