'use strict';

/**
 * Contas financeiras exatas (port de `calculo-decimal.js` do sistema Projeção Financeira).
 *
 * Os valores entram como texto ou número decimal e viram frações de inteiros (BigInt);
 * o arredondamento para centavos é feito uma única vez, meio centavo para cima.
 * Toda soma é feita em centavos (BigInt). Nunca misture com Number nas somas.
 */

const ERRO = 'Não foi possível calcular o valor financeiro.';

/** Teto dos valores monetários gravados (Decimal(16,2) => menor que 10^14 reais). */
const LIMITE_CENTAVOS = 10n ** 16n;

/**
 * Decompõe um decimal não negativo em { digitos, escala } (valor = digitos / 10^escala).
 * Aceita "1,5", "1.5", 1.5, "1e-7", Decimal do Prisma (toString) e BigInt.
 */
function partesDecimais(valor) {
  if (typeof valor === 'bigint') {
    if (valor < 0n) throw new Error(ERRO);
    return { digitos: valor, escala: 0 };
  }
  if (valor === null || valor === undefined) throw new Error(ERRO);
  const texto = String(valor).trim().replace(',', '.');
  const partes = texto.match(/^([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?$/i);
  const expoente = Number(partes?.[3] || 0);
  if (!partes || !Number.isInteger(expoente) || expoente < -324 || expoente > 308) {
    throw new Error(ERRO);
  }
  const fracao = partes[2] || '';
  let digitos = BigInt(partes[1] + fracao);
  let escala = fracao.length - expoente;
  if (escala < 0) {
    digitos *= 10n ** BigInt(-escala);
    escala = 0;
  }
  return { digitos, escala };
}

/** Arredonda numerador/denominador (reais) para centavos, meio para cima. */
function arredondarFracaoEmCentavos(numerador, denominador) {
  if (numerador < 0n || denominador <= 0n) throw new Error(ERRO);
  const escalado = numerador * 100n;
  let centavos = escalado / denominador;
  if ((escalado % denominador) * 2n >= denominador) centavos += 1n;
  return centavos;
}

/** Decimal em reais -> centavos (BigInt). */
function arredondarEmCentavos(valor) {
  const { digitos, escala } = partesDecimais(valor);
  return arredondarFracaoEmCentavos(digitos, 10n ** BigInt(escala));
}

/**
 * Produto de fatores decimais, dividido por um inteiro opcional, em centavos.
 * Ex.: centavosDoProduto([preco, dias, pessoas], diasUteis).
 */
function centavosDoProduto(fatores, divisor = 1) {
  let numerador = 1n;
  let escala = 0;
  for (const fator of fatores) {
    const partes = partesDecimais(fator);
    numerador *= partes.digitos;
    escala += partes.escala;
  }
  const div = BigInt(divisor);
  if (div <= 0n) throw new Error(ERRO);
  return arredondarFracaoEmCentavos(numerador, 10n ** BigInt(escala) * div);
}

/** Total do item do QQP: quantidade × preço unitário, em centavos. */
function totalDoItemEmCentavos(quantidade, precoUnitario) {
  return centavosDoProduto([quantidade, precoUnitario]);
}

/** Centavos (BigInt) -> texto em reais com duas casas ("1234.56"), para gravar em Decimal. */
function centavosParaTexto(centavos) {
  const valor = BigInt(centavos);
  if (valor < 0n) throw new Error(ERRO);
  const inteiro = valor / 100n;
  const resto = valor % 100n;
  return `${inteiro}.${String(resto).padStart(2, '0')}`;
}

/**
 * Centavos (BigInt) -> Number em reais, para a resposta JSON. Recusa valores que não cabem
 * sem perder precisão (o Projeção usa a mesma regra).
 */
function centavosParaReais(centavos) {
  const valor = BigInt(centavos);
  if (valor < 0n || valor >= LIMITE_CENTAVOS) {
    throw new Error('O valor deve ser menor que R$ 100.000.000.000.000,00.');
  }
  if (valor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('O valor ultrapassa a precisão monetária suportada.');
  }
  return Number(valor) / 100;
}

/** Soma de centavos (BigInt). */
function somarCentavos(lista) {
  return lista.reduce((soma, valor) => soma + BigInt(valor), 0n);
}

module.exports = {
  partesDecimais,
  arredondarFracaoEmCentavos,
  arredondarEmCentavos,
  centavosDoProduto,
  totalDoItemEmCentavos,
  centavosParaTexto,
  centavosParaReais,
  somarCentavos,
  LIMITE_CENTAVOS,
};
