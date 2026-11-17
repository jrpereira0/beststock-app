/// <reference types="node" />
// Regras do app que precisam bater com o site. Uso: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareCategories,
  countWarnings,
  groupProducts,
  isZero,
  maxPossibleFrom,
  parseQty,
  step,
  stockoutRange,
  toField,
  validStockout,
} from "../src/lib/count-rules.ts";
import { addDays, daysFrom, formatQty, nextCount, today } from "../src/lib/dates.ts";
import { isShort, unitHint, unitsOf, validateMovements, type MovementProduct } from "../src/lib/movements.ts";
import { flushQueue, isNetworkError, readQueue, removeIfSame, writeQueue, type KeyValue, type Pending } from "../src/lib/queue.ts";

describe("leitura do número digitado", () => {
  it("vazio não é zero", () => {
    assert.equal(parseQty(""), null);
    assert.equal(parseQty("   "), null);
    assert.equal(isZero(""), false);
    assert.equal(isZero("0"), true);
    assert.equal(isZero("0,0"), true);
  });
  it("vírgula é decimal e espaços somem, como no servidor do site", () => {
    assert.equal(parseQty("1,5"), 1.5);
    assert.equal(parseQty(" 1 2 "), 12);
  });
  it("negativo e texto são inválidos", () => {
    assert.ok(Number.isNaN(parseQty("-1")));
    assert.ok(Number.isNaN(parseQty("abc")));
  });
  it("botões − e +", () => {
    assert.equal(step("", 1), "1");
    assert.equal(step("", -1), "0");
    assert.equal(step("0", -1), "0");
    assert.equal(step("2,5", 1), "3,5");
    assert.equal(step("1", -1), "0");
  });
  it("número salvo volta para o campo sem separador de milhar", () => {
    assert.equal(toField(1234.5), "1234,5");
    assert.equal(formatQty(1234.5), "1.234,5");
  });
});

describe("avisos de número estranho", () => {
  it("mais do que o possível", () => {
    assert.deepEqual(countWarnings("11", "kg", 10).map((w) => w.kind), ["tooMuch"]);
    // 2% de folga, como no site.
    assert.deepEqual(countWarnings("10,2", "kg", 10), []);
  });
  it("1.000 parece milhar", () => {
    const kinds = countWarnings("1.000", "un", undefined).map((w) => w.kind);
    assert.ok(kinds.includes("thousands"));
    assert.ok(!kinds.includes("veryHigh"));
  });
  it("número alto sem contagem anterior pede conferida", () => {
    assert.deepEqual(countWarnings("1500", "un", undefined).map((w) => w.kind), ["veryHigh"]);
    assert.deepEqual(countWarnings("999", "un", undefined), []);
  });
  it("vazio não avisa nada e texto é inválido", () => {
    assert.deepEqual(countWarnings("", "un", 1), []);
    assert.deepEqual(countWarnings("x", "un", 1).map((w) => w.kind), ["invalid"]);
  });
});

describe("Acabou em", () => {
  it("só existe com contagem anterior", () => {
    assert.equal(stockoutRange(null, "2026-11-17"), null);
    assert.deepEqual(stockoutRange("2026-11-10", "2026-11-17"), { min: "2026-11-11", max: "2026-11-17" });
  });
  it("precisa estar depois da contagem anterior e até esta", () => {
    assert.equal(validStockout("2026-11-10", "2026-11-10", "2026-11-17"), false);
    assert.equal(validStockout("2026-11-11", "2026-11-10", "2026-11-17"), true);
    assert.equal(validStockout("2026-11-17", "2026-11-10", "2026-11-17"), true);
    assert.equal(validStockout("2026-11-18", "2026-11-10", "2026-11-17"), false);
    assert.equal(validStockout("2026-11-12", null, "2026-11-17"), false);
  });
});

describe("máximo possível", () => {
  it("anterior + entradas − perdas, sem a entrega lançada depois da contagem do dia", () => {
    const { maxPossible, lastEntrada } = maxPossibleFrom(
      { a: 5 },
      [
        { product_id: "a", kind: "entrada", moved_on: "2026-11-12", quantity: 10, after_count: false },
        { product_id: "a", kind: "perda", moved_on: "2026-11-13", quantity: 2, after_count: null },
        { product_id: "a", kind: "entrada", moved_on: "2026-11-17", quantity: 100, after_count: true },
        { product_id: "b", kind: "entrada", moved_on: "2026-11-14", quantity: 3, after_count: false },
      ],
      "2026-11-17",
    );
    assert.equal(maxPossible.a, 13);
    assert.equal(maxPossible.b, undefined);
    assert.equal(lastEntrada.a, "2026-11-12");
    assert.equal(lastEntrada.b, "2026-11-14");
  });
});

describe("lista por categoria", () => {
  const products = [
    { id: "1", name: "Granola", category: "Acompanhamentos", count_unit: "kg" },
    { id: "2", name: "Açaí tradicional", category: "Açaí", count_unit: "balde" },
    { id: "3", name: "Copo 300", category: "Potes e copos", count_unit: "un" },
    { id: "4", name: "Banana", category: "Acompanhamentos", count_unit: "kg" },
  ];
  it("açaí primeiro, depois acompanhamentos e potes", () => {
    assert.deepEqual(groupProducts(products).map(([c]) => c), ["Açaí", "Acompanhamentos", "Potes e copos"]);
    assert.ok(compareCategories("Açaí", "Revenda") < 0);
  });
  it("busca sem acento e filtro de categoria", () => {
    assert.deepEqual(groupProducts(products, { search: "acai" }).flatMap(([, l]) => l.map((p) => p.id)), ["2"]);
    assert.deepEqual(groupProducts(products, { category: "Acompanhamentos" }).flatMap(([, l]) => l.map((p) => p.name)), ["Banana", "Granola"]);
  });
  it("só o que falta", () => {
    assert.deepEqual(groupProducts(products, { keep: (p) => p.id !== "1" }).flatMap(([, l]) => l.map((p) => p.id)).sort(), ["2", "3", "4"]);
  });
});

describe("datas", () => {
  it("hoje em Brasília", () => {
    assert.equal(today(new Date("2026-11-18T02:00:00Z")), "2026-11-17");
    assert.equal(today(new Date("2026-11-18T04:00:00Z")), "2026-11-18");
  });
  it("dias entre duas datas e próxima contagem", () => {
    assert.deepEqual(daysFrom("2026-11-29", "2026-12-02"), ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(nextCount("2026-11-10", 7, "2026-11-17")?.dueToday, true);
    assert.equal(nextCount("2026-11-01", 7, "2026-11-17")?.overdue, true);
    assert.equal(nextCount(null, 7, "2026-11-17"), null);
  });
});

describe("fila offline", () => {
  function memory(): KeyValue & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
  }
  it("guarda e lê de volta; fila vazia apaga a chave", async () => {
    const s = memory();
    await writeQueue(s, "inv", { a: { value: "2", stockout: null } });
    assert.deepEqual(await readQueue(s, "inv"), { a: { value: "2", stockout: null } });
    await writeQueue(s, "inv", {});
    assert.equal(s.data.size, 0);
  });
  it("lixo no armazenamento vira fila vazia", async () => {
    const s = memory();
    await s.setItem("beststock:contagem:inv", "{quebrado");
    assert.deepEqual(await readQueue(s, "inv"), {});
  });
  it("para no primeiro sem internet e mantém o resto", async () => {
    const queue: Pending = { a: { value: "1", stockout: null }, b: { value: "2", stockout: null }, c: { value: "3", stockout: null } };
    const done: string[] = [];
    const finished = await flushQueue(
      queue,
      async (id) => (id === "b" ? { ok: false, offline: true } : { ok: true }),
      (id) => void done.push(id),
    );
    assert.equal(finished, false);
    assert.deepEqual(done, ["a"]);
  });
  it("recusa do banco sai da fila com o erro", async () => {
    const results: string[] = [];
    const finished = await flushQueue(
      { a: { value: "1", stockout: null } },
      async () => ({ ok: false, error: "fechado" }),
      (_id, _item, res) => void results.push(res.ok ? "ok" : res.error),
    );
    assert.equal(finished, true);
    assert.deepEqual(results, ["fechado"]);
  });
  it("número mudado durante o envio continua na fila", () => {
    const q: Pending = { a: { value: "5", stockout: null } };
    assert.equal(removeIfSame(q, "a", { value: "4", stockout: null }), q);
    assert.deepEqual(removeIfSame(q, "a", { value: "5", stockout: null }), {});
  });
  it("reconhece falta de internet", () => {
    assert.equal(isNetworkError({ message: "TypeError: Network request failed", code: "" }), true);
    assert.equal(isNetworkError({ message: "new row violates row-level security policy", code: "42501" }), false);
    assert.equal(isNetworkError(null), false);
  });
});

describe("entrada e perda", () => {
  const caixa: MovementProduct = { id: "p", name: "Granola", category: "", count_unit: "kg", purchase_unit: "caixa", units_per_purchase: 10 };
  const kg: MovementProduct = { id: "q", name: "Banana", category: "", count_unit: "kg", purchase_unit: "kg", units_per_purchase: 1 };
  it("entrada em embalagens vira unidade de contagem; perda não", () => {
    assert.equal(unitsOf("entrada", caixa, "2"), 20);
    assert.equal(unitsOf("perda", caixa, "2"), 2);
    assert.equal(unitHint("entrada", caixa), "em caixa (1 caixa = 10 kg)");
    assert.equal(unitHint("entrada", kg), "em kg");
  });
  it("chegou menos que o pedido pede a resposta", () => {
    assert.equal(isShort("entrada", caixa, "1", 30), true);
    assert.equal(isShort("entrada", caixa, "3", 30), false);
    assert.equal(isShort("perda", caixa, "1", 30), false);
    const res = validateMovements("entrada", "2026-11-17", "2026-11-17", [caixa], { p: "1" }, {}, { p: 30 });
    assert.deepEqual(res, { error: 'Em "Granola", chegou menos do que o pedido. Diga se o resto ainda vem.' });
    const ok = validateMovements("entrada", "2026-11-17", "2026-11-17", [caixa], { p: "1" }, { p: "nao" }, { p: 30 });
    assert.deepEqual(ok, { items: [{ product_id: "p", typed: 1, rest: "nao" }] });
  });
  it("data no futuro, zero e nada preenchido são recusados", () => {
    assert.deepEqual(validateMovements("perda", "2026-11-18", "2026-11-17", [kg], { q: "1" }, {}, {}), { error: "A data não pode estar no futuro." });
    assert.deepEqual(validateMovements("perda", "2026-11-17", "2026-11-17", [kg], { q: "0" }, {}, {}), { error: 'Quantidade inválida em "Banana".' });
    assert.deepEqual(validateMovements("perda", "2026-11-17", "2026-11-17", [kg], { q: " " }, {}, {}), { error: "Informe a quantidade de pelo menos um produto." });
  });
});

describe("pedido a caminho", () => {
  it("conta só o que já devia ter chegado; se nada venceu, o mais antigo", async () => {
    const { dueOutstanding } = await import("../src/lib/movements.ts");
    const items = [
      { outstanding: 10, expectedOn: "2026-11-15" },
      { outstanding: 5, expectedOn: "2026-11-16" },
      { outstanding: 7, expectedOn: "2026-11-20" },
    ];
    assert.equal(dueOutstanding(items, "2026-11-17"), 15);
    assert.equal(dueOutstanding(items, "2026-11-10"), 10);
  });
});

describe("ordem dos produtos", () => {
  it("dentro da categoria vale a posição da planilha; sem posição, no fim em ordem alfabética", async () => {
    const { groupProducts } = await import("../src/lib/count-rules.ts");
    const potes = [
      { id: "a", name: "Pote Açaí Tradicional 1,5 L", category: "Potes", count_unit: "un", position: 50 },
      { id: "b", name: "Pote Pistache c/ Chocolate Branco 1,5 L", category: "Potes", count_unit: "un", position: 20 },
      { id: "c", name: "Pote Açaí do Pará 1,5 L", category: "Potes", count_unit: "un", position: 10 },
      { id: "d", name: "Pote Novo da Loja", category: "Potes", count_unit: "un", position: null },
      { id: "e", name: "Pote Abacaxi da Loja", category: "Potes", count_unit: "un" },
    ];
    assert.deepEqual(groupProducts(potes)[0][1].map((p) => p.id), ["c", "b", "a", "e", "d"]);
  });
});
