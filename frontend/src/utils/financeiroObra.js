import { rotuloRevisao } from './formatters.js';

const numero = (valor) => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

/**
 * Decompõe o valor vigente da obra a partir do histórico de revisões (mesma
 * regra do motor financeiro do back-end): a última revisão substitutiva
 * APROVADA é a base e os aditivos APROVADOS posteriores somam a ela.
 * Revisões sem tipo/status (legado) contam como substitutivas aprovadas.
 *
 * @returns {{ base:number, aditivos:number, quantidadeAditivos:number,
 *            vigente:number, revisaoBase:string, pendentes:number }}
 */
export function resumirOrcamento(revisoes = [], valorVigente = 0) {
  const ordenadas = [...revisoes].sort((a, b) => a.numero_revisao - b.numero_revisao);
  const aprovadas = ordenadas.filter((revisao) => (revisao.status_aprovacao || 'APROVADO') === 'APROVADO');
  const pendentes = ordenadas.filter((revisao) => revisao.status_aprovacao === 'PENDENTE').length;

  let indiceBase = -1;
  aprovadas.forEach((revisao, indice) => {
    if (revisao.tipo_alteracao !== 'ADITIVO_FINANCEIRO') indiceBase = indice;
  });

  if (indiceBase === -1) {
    return {
      base: numero(valorVigente),
      aditivos: 0,
      quantidadeAditivos: 0,
      vigente: numero(valorVigente),
      revisaoBase: '—',
      pendentes,
    };
  }

  const base = aprovadas[indiceBase];
  const aditivosPosteriores = aprovadas
    .slice(indiceBase + 1)
    .filter((revisao) => revisao.tipo_alteracao === 'ADITIVO_FINANCEIRO');
  const aditivos = aditivosPosteriores.reduce((soma, revisao) => soma + numero(revisao.valor), 0);

  return {
    base: numero(base.valor),
    aditivos,
    quantidadeAditivos: aditivosPosteriores.length,
    vigente: numero(valorVigente),
    revisaoBase: base.rotulo || rotuloRevisao(base.numero_revisao),
    pendentes,
  };
}
