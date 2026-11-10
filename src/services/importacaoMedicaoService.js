'use strict';

/**
 * Importação do histórico de medição (pasta 13).
 *
 * Lê as duas planilhas exportadas do Excel (tabelas dinâmicas em CSV):
 *  - "medição bmm.csv":    uma linha por BMM x SS, com o valor medido (R$);
 *  - "Curva tendencia.csv": por BMM, o previsto acumulado, o previsto mensal, o
 *                          realizado e a tendência do contrato.
 *
 * Tudo aqui é função pura (sem banco), para poder simular a importação e testar
 * com os arquivos reais. A gravação fica em `scripts/importarMedicaoPasta13.js`.
 *
 * Regras:
 *  - O total do boletim é o REAL da curva (tem centavos); as SS vêm da planilha de
 *    medição (valores em reais inteiros). Diferenças de arredondamento (até R$ 5)
 *    são absorvidas na maior SS do boletim; diferenças maiores ficam como "valor
 *    sem detalhamento por SS", avisadas no relatório;
 *  - Cada código de SS/PEP da planilha vira o item de uma obra do Synapse quando
 *    casa com ela (pela SS e, se houver mais de uma obra com a SS, pelo PEP);
 *    os demais ficam só com o código (obra_id vazio).
 */

const MESES = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Diferença máxima (R$) entre a soma das SS e o total do boletim tratada como arredondamento. */
const TOLERANCIA_ARREDONDAMENTO = 5;

/* -------------------------------------------------------------------------- */
/* Leitura de CSV                                                             */
/* -------------------------------------------------------------------------- */

/** CSV com aspas duplas e vírgula como separador (exportação do Excel). */
function lerCsv(texto) {
  const conteudo = String(texto).replace(/^﻿/, '');
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;

  for (let i = 0; i < conteudo.length; i += 1) {
    const c = conteudo[i];
    if (aspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') {
        aspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === ',') {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i += 1;
      linha.push(campo);
      campo = '';
      if (linha.some((valor) => valor !== '')) linhas.push(linha);
      linha = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    if (linha.some((valor) => valor !== '')) linhas.push(linha);
  }
  return linhas;
}

/** "R$ 2385622,00" -> 2385622; vazio -> null; inválido -> NaN. */
function lerMoeda(texto) {
  if (texto === undefined || texto === null || String(texto).trim() === '') return null;
  const limpo = String(texto).replace(/R\$/i, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return NaN;
  return Number(limpo);
}

function lerData(ano, mes, dia) {
  const numeroMes = MESES[String(mes).trim().toLowerCase()];
  const a = Number(ano);
  const d = Number(dia);
  if (!numeroMes || !Number.isInteger(a) || !Number.isInteger(d) || d < 1 || d > 31) return null;
  const data = new Date(Date.UTC(a, numeroMes - 1, d));
  return data.getUTCMonth() === numeroMes - 1 ? data.toISOString().slice(0, 10) : null;
}

/** Entre duas datas, a que cai no dia 16 é o início do ciclo e a do dia 15, o fim. */
function cicloDe(dataA, dataB) {
  const dia = (d) => (d ? Number(d.slice(8, 10)) : null);
  if (dia(dataA) === 16 && dia(dataB) === 15) return { inicio: dataA, fim: dataB };
  if (dia(dataA) === 15 && dia(dataB) === 16) return { inicio: dataB, fim: dataA };
  return null;
}

const centavos = (valor) => Math.round(Number(valor) * 100);
const reais = (cent) => Math.round(cent) / 100;
const numeroDoBmm = (bmm) => Number(String(bmm).replace(/\D/g, ''));

/* -------------------------------------------------------------------------- */
/* Planilhas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "medição bmm.csv": DESCRIÇÃO, (Ano, Trim, Mês, Dia) x2, Soma de VALOR, MEDIÇÃO, SS.
 * @returns {{ linhas: object[], erros: string[] }}
 */
function lerPlanilhaMedicao(texto) {
  const tabela = lerCsv(texto);
  const erros = [];
  const cabecalho = (tabela[0] || []).map((c) => c.trim().toUpperCase());
  const esperadas = ['DESCRIÇÃO', 'SOMA DE VALOR', 'MEDIÇÃO', 'SS'];
  esperadas.forEach((nome) => {
    if (!cabecalho.includes(nome)) erros.push(`Planilha de medição sem a coluna "${nome}".`);
  });
  if (erros.length) return { linhas: [], erros };

  const iValor = cabecalho.indexOf('SOMA DE VALOR');
  const iBmm = cabecalho.indexOf('MEDIÇÃO');
  const iSs = cabecalho.indexOf('SS');
  const linhas = [];

  tabela.slice(1).forEach((campos, indice) => {
    const numeroLinha = indice + 2;
    const bmm = (campos[iBmm] || '').trim().toUpperCase();
    const ss = (campos[iSs] || '').trim().toUpperCase();
    const valor = lerMoeda(campos[iValor]);
    const dataA = lerData(campos[1], campos[3], campos[4]);
    const dataB = lerData(campos[5], campos[7], campos[8]);
    const ciclo = cicloDe(dataA, dataB);

    if (!/^BMM\d+$/.test(bmm)) return erros.push(`Linha ${numeroLinha}: boletim "${bmm}" inválido.`);
    if (!ss) return erros.push(`Linha ${numeroLinha} (${bmm}): SS vazia.`);
    if (valor === null || Number.isNaN(valor)) return erros.push(`Linha ${numeroLinha} (${bmm}/${ss}): valor "${campos[iValor]}" inválido.`);
    if (valor < 0) return erros.push(`Linha ${numeroLinha} (${bmm}/${ss}): valor negativo.`);
    if (!ciclo) return erros.push(`Linha ${numeroLinha} (${bmm}/${ss}): o ciclo não vai do dia 16 ao dia 15.`);

    return linhas.push({
      linha: numeroLinha,
      bmm,
      ss,
      valor,
      descricao: (campos[0] || '').replace(/\s+/g, ' ').trim(),
      inicio: ciclo.inicio,
      fim: ciclo.fim,
    });
  });

  return { linhas, erros };
}

/**
 * "Curva tendencia.csv": PREV. ACUM., MEDIÇÃO, (Ano, Trim, Mês, Dia) x2, PREV.,
 * PREVISTO MENSAL, REAL, REAL ACUM., TENDENCIA.
 */
function lerPlanilhaCurva(texto) {
  const tabela = lerCsv(texto);
  const erros = [];
  const cabecalho = (tabela[0] || []).map((c) => c.trim().toUpperCase());
  const indice = (nome) => cabecalho.indexOf(nome);
  const colunas = {
    acum: indice('SOMA DE PREV. ACUM.'),
    bmm: indice('MEDIÇÃO'),
    prev: indice('SOMA DE PREV.'),
    mensal: indice('SOMA DE PREVISTO MENSAL'),
    real: indice('SOMA DE REAL'),
    realAcum: indice('SOMA DE REAL ACUM.'),
    tendencia: indice('SOMA DE TENDENCIA'),
  };
  Object.entries(colunas).forEach(([nome, posicao]) => {
    if (posicao < 0) erros.push(`Planilha da curva sem a coluna de "${nome}".`);
  });
  if (erros.length) return { ciclos: [], erros };

  const ciclos = [];
  const vistos = new Set();
  tabela.slice(1).forEach((campos, i) => {
    const numeroLinha = i + 2;
    const bmm = (campos[colunas.bmm] || '').trim().toUpperCase();
    const ciclo = cicloDe(lerData(campos[2], campos[4], campos[5]), lerData(campos[6], campos[8], campos[9]));
    const previstoAcumulado = lerMoeda(campos[colunas.acum]);
    const previstoMensal = lerMoeda(campos[colunas.prev]);

    if (!/^BMM\d+$/.test(bmm)) return erros.push(`Curva, linha ${numeroLinha}: boletim "${bmm}" inválido.`);
    if (vistos.has(bmm)) return erros.push(`Curva, linha ${numeroLinha}: ${bmm} repetido.`);
    vistos.add(bmm);
    if (!ciclo) return erros.push(`Curva, linha ${numeroLinha} (${bmm}): o ciclo não vai do dia 16 ao dia 15.`);
    if (previstoAcumulado === null || Number.isNaN(previstoAcumulado)) return erros.push(`Curva, linha ${numeroLinha} (${bmm}): previsto acumulado inválido.`);
    if (previstoMensal === null || Number.isNaN(previstoMensal)) return erros.push(`Curva, linha ${numeroLinha} (${bmm}): previsto mensal inválido.`);

    const opcional = (posicao, rotulo) => {
      const valor = lerMoeda(campos[posicao]);
      if (Number.isNaN(valor)) erros.push(`Curva, linha ${numeroLinha} (${bmm}): ${rotulo} inválido.`);
      return Number.isNaN(valor) ? null : valor;
    };

    return ciclos.push({
      bmm,
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      previsto_acumulado: previstoAcumulado,
      previsto_mensal: previstoMensal,
      previsto_replanejado: opcional(colunas.mensal, 'previsto mensal'),
      real: opcional(colunas.real, 'realizado'),
      real_acumulado: opcional(colunas.realAcum, 'realizado acumulado'),
      tendencia_acumulada: opcional(colunas.tendencia, 'tendência'),
    });
  });

  return { ciclos, erros };
}

/* -------------------------------------------------------------------------- */
/* Casamento das SS com as obras do Synapse                                   */
/* -------------------------------------------------------------------------- */

const normalizar = (texto) => String(texto || '').trim().toUpperCase();

/**
 * Encontra a obra de cada código (SS ou PEP) da planilha.
 *  1) pela SS do orçamento (única);
 *  2) se várias obras têm a mesma SS, a que também tem o PEP igual ao código;
 *  3) pelo PEP.
 * Sem correspondência (ou ambígua) o código fica sem obra.
 *
 * @param {string[]} codigos
 * @param {{ id:number, ss?:string, pep?:string, valor?:number }[]} obras
 * @returns {{ mapa: Map<string, number|null>, ambiguos: string[] }}
 */
function casarObras(codigos, obras) {
  const porSs = new Map();
  const porPep = new Map();
  obras.forEach((obra) => {
    const ss = normalizar(obra.ss);
    const pep = normalizar(obra.pep);
    if (ss) porSs.set(ss, [...(porSs.get(ss) || []), obra]);
    if (pep) porPep.set(pep, [...(porPep.get(pep) || []), obra]);
  });

  const mapa = new Map();
  const ambiguos = [];
  [...new Set(codigos)].forEach((codigo) => {
    const candidatas = porSs.get(codigo) || [];
    if (candidatas.length === 1) return mapa.set(codigo, candidatas[0].id);

    if (candidatas.length > 1) {
      const exata = candidatas.filter((obra) => normalizar(obra.pep) === codigo);
      if (exata.length === 1) return mapa.set(codigo, exata[0].id);
      ambiguos.push(codigo);
      return mapa.set(codigo, null);
    }

    const peps = porPep.get(codigo) || [];
    if (peps.length === 1) return mapa.set(codigo, peps[0].id);
    if (peps.length > 1) ambiguos.push(codigo);
    return mapa.set(codigo, null);
  });
  return { mapa, ambiguos };
}

/* -------------------------------------------------------------------------- */
/* Plano de importação                                                        */
/* -------------------------------------------------------------------------- */

/** Descrição mais frequente (não vazia) de cada código, para identificar a SS sem obra. */
function descricaoPorCodigo(linhas) {
  const contagem = new Map();
  linhas.forEach((linha) => {
    if (!linha.descricao) return;
    const porDescricao = contagem.get(linha.ss) || new Map();
    porDescricao.set(linha.descricao, (porDescricao.get(linha.descricao) || 0) + 1);
    contagem.set(linha.ss, porDescricao);
  });
  const resultado = new Map();
  contagem.forEach((porDescricao, codigo) => {
    const [descricao] = [...porDescricao.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
    resultado.set(codigo, descricao);
  });
  return resultado;
}

/**
 * Monta o que será gravado (e o relatório da simulação) a partir das planilhas.
 *
 * @param {{ medicao: object[], curva: object[], obras: object[], contrato?: object }} entrada
 */
function planejarImportacao({ medicao, curva, obras, contrato = {} }) {
  const avisos = [];
  const erros = [];

  // --- Ciclos: os dois arquivos precisam concordar.
  const cicloDoBmm = new Map(curva.map((linha) => [linha.bmm, linha]));
  const ciclosMedicao = new Map();
  medicao.forEach((linha) => {
    const anterior = ciclosMedicao.get(linha.bmm);
    if (anterior && (anterior.inicio !== linha.inicio || anterior.fim !== linha.fim)) {
      erros.push(`${linha.bmm}: linhas da medição com ciclos diferentes (${anterior.inicio}/${anterior.fim} e ${linha.inicio}/${linha.fim}).`);
    }
    ciclosMedicao.set(linha.bmm, { inicio: linha.inicio, fim: linha.fim });
  });
  ciclosMedicao.forEach((ciclo, bmm) => {
    const daCurva = cicloDoBmm.get(bmm);
    if (!daCurva) avisos.push(`${bmm} está na medição, mas não na curva: o total do boletim será a soma das SS.`);
    else if (daCurva.inicio !== ciclo.inicio || daCurva.fim !== ciclo.fim) {
      erros.push(`${bmm}: ciclo da medição (${ciclo.inicio} a ${ciclo.fim}) difere da curva (${daCurva.inicio} a ${daCurva.fim}).`);
    }
  });

  // --- Obras
  const codigos = medicao.map((linha) => linha.ss);
  const { mapa: obraDoCodigo, ambiguos } = casarObras(codigos, obras);
  ambiguos.forEach((codigo) => avisos.push(`${codigo} casa com mais de uma obra e nenhuma tem o PEP igual: ficará sem obra.`));
  const descricoes = descricaoPorCodigo(medicao);

  // --- Boletins
  const porBmm = new Map();
  medicao.forEach((linha) => {
    if (!porBmm.has(linha.bmm)) porBmm.set(linha.bmm, []);
    porBmm.get(linha.bmm).push(linha);
  });

  const boletins = [...porBmm.entries()]
    .sort((a, b) => numeroDoBmm(a[0]) - numeroDoBmm(b[0]))
    .map(([numero, linhas]) => {
      // Mesma SS repetida no boletim: soma em um item só.
      const itensPorChave = new Map();
      linhas.forEach((linha) => {
        const obraId = obraDoCodigo.get(linha.ss) ?? null;
        const chave = obraId !== null ? `obra:${obraId}` : `ss:${linha.ss}`;
        const item = itensPorChave.get(chave) || {
          obra_id: obraId,
          ss_codigo: obraId === null ? linha.ss : null,
          descricao: obraId === null ? descricoes.get(linha.ss) || null : null,
          codigo: linha.ss,
          cent: 0,
        };
        item.cent += centavos(linha.valor);
        itensPorChave.set(chave, item);
      });
      const itens = [...itensPorChave.values()].sort((a, b) => b.cent - a.cent);

      const somaItensCent = itens.reduce((soma, item) => soma + item.cent, 0);
      const daCurva = cicloDoBmm.get(numero);
      const realCent = daCurva && daCurva.real !== null ? centavos(daCurva.real) : null;
      const totalCent = realCent !== null ? realCent : somaItensCent;
      const diferencaCent = totalCent - somaItensCent;

      let ajusteCent = 0;
      let semDetalheCent = 0;
      if (realCent !== null && diferencaCent !== 0) {
        if (Math.abs(diferencaCent) <= TOLERANCIA_ARREDONDAMENTO * 100) {
          ajusteCent = diferencaCent; // arredondamento: entra na maior SS
          itens[0].cent += diferencaCent;
        } else {
          semDetalheCent = diferencaCent;
          avisos.push(
            `${numero}: a soma das SS (R$ ${reais(somaItensCent).toFixed(2)}) difere do realizado da curva (R$ ${reais(realCent).toFixed(2)}) em R$ ${reais(diferencaCent).toFixed(2)}; a diferença fica como "sem detalhamento por SS".`
          );
        }
      }

      const ciclo = ciclosMedicao.get(numero);
      return {
        numero_bmm: numero,
        ciclo_inicio: ciclo.inicio,
        ciclo_fim: ciclo.fim,
        valor_medido: reais(totalCent),
        status: 'APROVADO',
        observacao:
          semDetalheCent !== 0
            ? `Histórico importado da pasta 13. Planilha de medição incompleta: R$ ${reais(semDetalheCent).toFixed(2)} do total não têm SS detalhada.`
            : 'Histórico importado da pasta 13.',
        itens: itens.map((item) => ({
          obra_id: item.obra_id,
          ss_codigo: item.ss_codigo,
          descricao: item.descricao,
          codigo: item.codigo,
          valor: reais(item.cent),
        })),
        soma_planilha: reais(somaItensCent),
        ajuste_arredondamento: reais(ajusteCent),
        sem_detalhamento: reais(semDetalheCent),
      };
    });

  // --- Boletins só na curva (sem medição): informativo.
  curva.forEach((linha) => {
    if (!porBmm.has(linha.bmm)) {
      avisos.push(
        linha.real === null
          ? `${linha.bmm} (${linha.inicio} a ${linha.fim}) só tem previsto/tendência na curva: entra na curva, não vira boletim.`
          : `${linha.bmm} tem realizado na curva (R$ ${linha.real.toFixed(2)}) mas nenhuma SS na medição: não vira boletim.`
      );
    }
  });

  // --- Contrato (derivado da curva quando não informado)
  const ultimaCurva = [...curva].sort((a, b) => numeroDoBmm(a.bmm) - numeroDoBmm(b.bmm));
  const primeira = ultimaCurva[0];
  const ultima = ultimaCurva[ultimaCurva.length - 1];
  const contratoPlano = {
    id_vale: contrato.id_vale || 'CT-251',
    descricao: contrato.descricao || 'Eletromecânica',
    valor_inicial: contrato.valor_inicial ?? (ultima ? reais(centavos(ultima.previsto_acumulado)) : null),
    data_inicio: contrato.data_inicio || (primeira ? primeira.inicio : null),
    data_fim: contrato.data_fim || (ultima ? ultima.fim : null),
    derivado: {
      valor_inicial: contrato.valor_inicial === undefined || contrato.valor_inicial === null,
      vigencia: !contrato.data_inicio || !contrato.data_fim,
    },
  };
  if (!contratoPlano.valor_inicial || !contratoPlano.data_inicio || !contratoPlano.data_fim) {
    erros.push('Não foi possível determinar o valor inicial e a vigência do contrato (curva vazia e nada informado).');
  }

  // --- Obras cujo medido já passa do valor do orçamento (orçamento sem os aditivos, por exemplo)
  const medidoPorObra = new Map();
  boletins.forEach((boletim) =>
    boletim.itens.forEach((item) => {
      if (item.obra_id !== null) medidoPorObra.set(item.obra_id, (medidoPorObra.get(item.obra_id) || 0) + centavos(item.valor));
    })
  );
  const obrasAcimaDoOrcamento = [];
  medidoPorObra.forEach((medidoCent, obraId) => {
    const obra = obras.find((item) => item.id === obraId);
    const valorCent = obra && obra.valor !== undefined && obra.valor !== null ? centavos(obra.valor) : 0;
    if (valorCent > 0 && medidoCent > valorCent) {
      obrasAcimaDoOrcamento.push({
        obra_id: obraId,
        ss: obra.ss || null,
        valor_orcamento: reais(valorCent),
        medido: reais(medidoCent),
        percentual: Math.round((medidoCent / valorCent) * 1000) / 10,
      });
    }
  });
  obrasAcimaDoOrcamento.sort((a, b) => b.percentual - a.percentual);

  // --- Vínculos obra -> contrato
  const vinculos = [...new Set([...obraDoCodigo.values()].filter((id) => id !== null))].sort((a, b) => a - b);

  // --- Totais para conferência
  const totalMedidoCent = boletins.reduce((soma, boletim) => soma + centavos(boletim.valor_medido), 0);
  const itensSemObra = boletins.flatMap((boletim) => boletim.itens).filter((item) => item.obra_id === null);
  const itensComObra = boletins.flatMap((boletim) => boletim.itens).filter((item) => item.obra_id !== null);
  const soma = (lista) => reais(lista.reduce((total, item) => total + centavos(item.valor), 0));

  return {
    contrato: contratoPlano,
    boletins,
    curva: ultimaCurva.map((linha) => ({
      numero_bmm: linha.bmm,
      ciclo_inicio: linha.inicio,
      ciclo_fim: linha.fim,
      previsto_mensal: linha.previsto_mensal,
      previsto_acumulado: linha.previsto_acumulado,
      previsto_replanejado: linha.previsto_replanejado,
      tendencia_acumulada: linha.tendencia_acumulada,
    })),
    vinculos,
    obras_acima_do_orcamento: obrasAcimaDoOrcamento,
    codigos: {
      total: obraDoCodigo.size,
      com_obra: [...obraDoCodigo.values()].filter((id) => id !== null).length,
      sem_obra: [...obraDoCodigo.entries()].filter(([, id]) => id === null).map(([codigo]) => codigo).sort(),
    },
    totais: {
      boletins: boletins.length,
      itens: boletins.reduce((soma_, boletim) => soma_ + boletim.itens.length, 0),
      total_medido: reais(totalMedidoCent),
      valor_itens_com_obra: soma(itensComObra),
      valor_itens_sem_obra: soma(itensSemObra),
    },
    avisos,
    erros,
  };
}

module.exports = {
  TOLERANCIA_ARREDONDAMENTO,
  lerCsv,
  lerMoeda,
  lerData,
  lerPlanilhaMedicao,
  lerPlanilhaCurva,
  casarObras,
  planejarImportacao,
};
