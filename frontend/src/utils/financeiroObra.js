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

/**
 * Projeção financeira derivada do avanço físico: cada lançamento semanal vira
 * uma medição estimada (valor vigente × percentual físico). Enquanto não houver
 * medições financeiras próprias, estes números são uma ESTIMATIVA.
 *
 * @param {Array} avanco linhas de `obra.avanco_fisico`
 * @param {number} valorContrato valor vigente da obra
 */
export function projetarFinanceiro(avanco = [], valorContrato = 0) {
  const contrato = numero(valorContrato);
  const ordenadas = [...avanco].sort((a, b) => {
    const diferenca = new Date(a.data) - new Date(b.data);
    return diferenca !== 0 ? diferenca : numero(a.id) - numero(b.id);
  });

  const medicoes = ordenadas.map((linha, indice) => {
    const percentualPeriodo = numero(linha.fisico_real);
    const percentualAcumulado = numero(linha.fisico_real_acum);
    return {
      id: linha.id ?? indice,
      numero: indice + 1,
      data: linha.data,
      semana: linha.semana,
      percentualPeriodo,
      percentualAcumulado,
      valorPeriodo: (contrato * percentualPeriodo) / 100,
      valorAcumulado: (contrato * percentualAcumulado) / 100,
      previstoAcumulado: (contrato * numero(linha.fisico_prev_acum)) / 100,
      tendenciaAcumulada: (contrato * numero(linha.fisico_tend_acum)) / 100,
      // Sem realizado lançado, a semana é apenas planejada.
      status: percentualPeriodo > 0 || percentualAcumulado > 0 ? 'MEDIDO' : 'PREVISTO',
    };
  });

  const ultimaMedida = [...medicoes].reverse().find((medicao) => medicao.status === 'MEDIDO');
  const ultima = medicoes[medicoes.length - 1];
  const medidoAcumulado = ultimaMedida ? ultimaMedida.valorAcumulado : 0;
  const previstoAteAgora = ultimaMedida ? ultimaMedida.previstoAcumulado : 0;

  return {
    medicoes,
    contratado: contrato,
    medidoAcumulado,
    saldo: contrato - medidoAcumulado,
    previstoAcumulado: ultima ? ultima.previstoAcumulado : 0,
    // Realizado ÷ previsto até a última semana medida (100% = no ritmo planejado).
    aderencia: previstoAteAgora > 0 ? (medidoAcumulado / previstoAteAgora) * 100 : null,
  };
}
