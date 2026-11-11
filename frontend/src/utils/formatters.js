/**
 * Modo "valores ocultos" (olho da página de Medição): enquanto ligado, todo valor em R$ formatado
 * por `formatarMoeda`/`formatarMoedaCompacta` aparece mascarado. A página liga ao abrir e desliga
 * ao sair, então as outras telas não são afetadas.
 */
let moedaOculta = false;
export const MASCARA_MOEDA = 'R$ ••••••';

export function definirMoedaOculta(ocultar) {
  moedaOculta = Boolean(ocultar);
}

export function moedaEstaOculta() {
  return moedaOculta;
}

/** Formata um número como moeda brasileira (R$). */
export function formatarMoeda(valor) {
  if (moedaOculta) return MASCARA_MOEDA;
  const numero = Number(valor);
  const seguro = Number.isFinite(numero) ? numero : 0;
  return seguro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata um número como moeda compacta (ex.: "R$ 82,9 mi"), para eixos de gráfico. */
export function formatarMoedaCompacta(valor) {
  if (moedaOculta) return 'R$ •••';
  const numero = Number(valor);
  const seguro = Number.isFinite(numero) ? numero : 0;
  return seguro.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/**
 * Formata uma data ISO como dd/mm/aaaa.
 *
 * Datas "puras" (vindas de colunas DATE do banco, serializadas como
 * `aaaa-mm-ddT00:00:00.000Z`) são formatadas sem conversão de fuso — caso
 * contrário, no Brasil (UTC-3) o dia anterior seria exibido.
 */
export function formatarData(valor) {
  if (!valor) return '—';

  const texto = String(valor);
  const dataPura = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/.exec(texto);
  if (dataPura) {
    const [, ano, mes, dia] = dataPura;
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formata uma data ISO como dd/mm/aaaa hh:mm. */
export function formatarDataHora(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Retorna o rótulo da revisão: 0 -> "Rev 00". */
export function rotuloRevisao(numero) {
  return `Rev ${String(numero ?? 0).padStart(2, '0')}`;
}

/** Formata um percentual com casas decimais no padrão brasileiro. */
export function formatarPercentual(valor, casas = 1) {
  const numero = Number(valor);
  const seguro = Number.isFinite(numero) ? numero : 0;
  return `${seguro.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

/** Retorna a data local no formato aaaa-mm-dd (para inputs type="date"). */
export function dataLocalISO(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Valor de um input date a partir de uma data ISO (sem deslocar o dia). */
export function dataParaInput(valor) {
  if (!valor) return '';
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : dataLocalISO(data);
}

/**
 * Calcula a semana ISO 8601 (1..53) de uma data no formato aaaa-mm-dd.
 * Retorna 0 quando a data é inválida.
 */
export function semanaISO(valor) {
  const texto = dataParaInput(valor);
  if (!texto) return 0;

  const data = new Date(`${texto}T12:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return 0;

  // Quinta-feira da semana (00:00 UTC): o ano dela é o ano ISO da semana.
  const alvo = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const diaDaSemana = (alvo.getUTCDay() + 6) % 7;
  alvo.setUTCDate(alvo.getUTCDate() - diaDaSemana + 3);

  const inicioDoAno = Date.UTC(alvo.getUTCFullYear(), 0, 1);
  return Math.floor((alvo - inicioDoAno) / 86400000 / 7) + 1;
}

/**
 * Ano ISO 8601 da semana de uma data aaaa-mm-dd (ano da quinta-feira da semana):
 * 31/12/2026 pertence à semana 53 de 2026; 01/01/2027 também (2026-W53).
 */
export function anoSemanaISO(valor) {
  const texto = dataParaInput(valor);
  if (!texto) return null;
  const data = new Date(`${texto}T12:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return null;
  data.setUTCDate(data.getUTCDate() - ((data.getUTCDay() + 6) % 7) + 3);
  return data.getUTCFullYear();
}

/** Ano (UTC) de uma data ISO. */
export function anoDaData(valor) {
  const texto = dataParaInput(valor);
  if (!texto) return null;
  const data = new Date(`${texto}T12:00:00.000Z`);
  return Number.isNaN(data.getTime()) ? null : data.getUTCFullYear();
}

/**
 * Rótulo curto da semana com o ano, para diferenciar ciclos plurianuais:
 * `S17/2025`, `S17/2026`. Sem data válida, retorna apenas `S17`.
 */
export function formatarSemana(semana, valorData) {
  const numero = Number(semana);
  if (!Number.isFinite(numero) || numero <= 0) return '—';
  const ano = anoDaData(valorData);
  return ano ? `S${numero}/${ano}` : `S${numero}`;
}
