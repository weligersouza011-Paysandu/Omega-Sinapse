'use strict';

// =============================================================================
// Synapse — Importação da pasta 13
//
// Lê as planilhas de avanço físico e de localizações de obra, cruza as OSIs
// com as obras cadastradas (via mapa explícito OSI → obra) e alimenta:
//   • obra_avanco_fisico  → base histórica da Curva S;
//   • obra_localizacoes   → múltiplos pontos geográficos por obra.
//
// Uso:
//   node scripts/importarPasta13.js            # dry-run (padrão, não grava)
//   node scripts/importarPasta13.js --dry-run  # idem
//   node scripts/importarPasta13.js --apply    # grava no banco
//
// Regras principais:
//   • percentuais fracionários (0..1) são convertidos para 0..100;
//   • a semana ISO é derivada da data quando a coluna Semana está vazia/zero;
//   • registros duplicados por data são mesclados (prevalece a linha com mais
//     dados semanais, completando os campos nulos com a outra linha);
//   • quando a soma semanal diverge do acumulado de origem e a série acumulada
//     é monotônica, os incrementos são derivados do acumulado;
//   • Físico_Real_Acum é ignorado quando não existe realizado semanal;
//   • a importação é idempotente: medições são criadas/atualizadas por
//     (obra, data) e localizações são deduplicadas por (obra, lat, long).
// =============================================================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PASTA_DADOS = path.join(process.cwd(), '13');
const ARQUIVO_RELATORIO = path.join(PASTA_DADOS, 'relatorio-importacao.json');
const LIMIAR_DIVERGENCIA = 0.5; // pontos percentuais
const CASAS = 2;

/**
 * Mapa explícito OSI → obra.
 *
 * O SS da planilha de localizações é um hash legado, e algumas OSIs não seguem
 * a mesma numeração do SS (ex.: OSI-009/25 pertence ao SS008/25). Por isso o
 * vínculo foi conferido manualmente pela descrição da obra.
 */
const MAPA_OSI = Object.freeze({
  'OSI-001/26': 6,
  'OSI-002/25': 15,
  'OSI-002/26': 2,
  'OSI-003/26': 29,
  'OSI-004/26': 3,
  'OSI-005/26': 5,
  'OSI-008/24': 13,
  'OSI-009/25': 9,
  'OSI-010/25': 8,
  'OSI-011/25': 23,
  'OSI-012/26': 14,
  'OSI-013/25': 28,
  'OSI-014/26': 4,
  'OSI-015/25': 24,
  'OSI-017/25': 22,
  'OSI-018/25': 21,
  'OSI-019/25': 20,
});

const CAMPOS_SEMANAIS = ['prev', 'lb', 'real', 'tend'];
const CAMPOS_PERCENTUAL = ['prev', 'lb', 'real', 'tend', 'prevAc', 'realAc'];

const argumentos = new Set(process.argv.slice(2));

if (argumentos.has('--help') || argumentos.has('-h')) {
  console.log(`
Uso: node scripts/importarPasta13.js [--dry-run|--apply]

  --dry-run   Analisa as planilhas e mostra o relatório sem gravar (padrão).
  --apply     Cria/atualiza as medições e localizações no banco.
`);
  process.exit(0);
}

if (argumentos.has('--apply') && argumentos.has('--dry-run')) {
  console.error('Escolha apenas um modo: --dry-run ou --apply.');
  process.exit(1);
}

const APLICAR = argumentos.has('--apply');
const MODO = APLICAR ? 'apply' : 'dry-run';

const avisos = [];

function aviso(mensagem) {
  avisos.push(mensagem);
  console.log(`  ! ${mensagem}`);
}

function arredondar(valor, casas = CASAS) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Number(numero.toFixed(casas));
}

function numero(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  const convertido = Number(texto.replace(',', '.'));
  return Number.isFinite(convertido) ? convertido : null;
}

function numeroSeguro(valor) {
  return numero(valor) ?? 0;
}

function pad2(valor) {
  return String(valor).padStart(2, '0');
}

function dataISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const partes = XLSX.SSF.parse_date_code(valor);
    if (partes) return `${partes.y}-${pad2(partes.m)}-${pad2(partes.d)}`;
  }

  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  let encontrada = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (encontrada) return `${encontrada[1]}-${encontrada[2]}-${encontrada[3]}`;

  encontrada = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (encontrada) return `${encontrada[3]}-${pad2(encontrada[2])}-${pad2(encontrada[1])}`;

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

/** Semana ISO 8601 (1..53) de uma data aaaa-mm-dd. */
function semanaISO(data) {
  const base = new Date(`${data}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return 0;

  const alvo = new Date(base.valueOf());
  const diaDaSemana = (base.getUTCDay() + 6) % 7;
  alvo.setUTCDate(alvo.getUTCDate() - diaDaSemana + 3);

  const primeiraQuinta = new Date(Date.UTC(alvo.getUTCFullYear(), 0, 4));
  return 1 + Math.round((alvo - primeiraQuinta) / 604800000);
}

function formatarDataBR(data) {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function normalizarOsi(valor) {
  return String(valor ?? '').trim().toUpperCase();
}

function localizarArquivo(termo) {
  const nome = fs
    .readdirSync(PASTA_DADOS)
    .find(
      (arquivo) =>
        arquivo.toLowerCase().endsWith('.xlsx') &&
        !arquivo.startsWith('~$') &&
        arquivo.toLowerCase().includes(termo)
    );

  if (!nome) {
    throw new Error(`Nenhum arquivo .xlsx contendo "${termo}" foi encontrado em ${PASTA_DADOS}.`);
  }
  return path.join(PASTA_DADOS, nome);
}

function lerMatriz(arquivo) {
  const workbook = XLSX.readFile(arquivo, { cellDates: true });
  const aba = workbook.SheetNames[0];
  const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[aba], {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  const indiceCabecalho = matriz.findIndex(
    (linha) => normalizarOsi(linha?.[1]) === 'OSI'
  );

  if (indiceCabecalho < 0) {
    throw new Error(`Não foi possível localizar o cabeçalho (coluna OSI) na aba "${aba}" de ${arquivo}.`);
  }

  return {
    arquivo,
    aba,
    cabecalho: matriz[indiceCabecalho],
    linhas: matriz.slice(indiceCabecalho + 1).filter((linha) =>
      (linha || []).some((valor) => valor !== null && String(valor).trim() !== '')
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Avanço físico                                                              */
/* -------------------------------------------------------------------------- */

function contarCamposSemanais(registro) {
  return CAMPOS_SEMANAIS.reduce(
    (total, campo) => total + (registro[campo] === null ? 0 : 1),
    0
  );
}

/**
 * Agrupa linhas da planilha pela data. Quando há mais de uma linha para a
 * mesma data, mantém como base a que tem mais campos semanais preenchidos e
 * completa os campos nulos com os valores da outra linha.
 */
function deduplicarPorData(registros) {
  const porData = new Map();
  const conflitos = [];
  let duplicadas = 0;

  for (const registro of registros) {
    const existente = porData.get(registro.data);
    if (!existente) {
      porData.set(registro.data, { ...registro });
      continue;
    }

    duplicadas += 1;
    const existenteScore = contarCamposSemanais(existente);
    const novatoScore = contarCamposSemanais(registro);
    const base = novatoScore > existenteScore ? registro : existente;
    const complemento = base === existente ? registro : existente;
    const mesclado = { ...base };

    for (const campo of CAMPOS_PERCENTUAL) {
      if (mesclado[campo] === null) {
        mesclado[campo] = complemento[campo];
      } else if (
        complemento[campo] !== null &&
        Math.abs(Number(mesclado[campo]) - Number(complemento[campo])) > 0.0001
      ) {
        conflitos.push({
          data: registro.data,
          campo,
          mantido: mesclado[campo],
          descartado: complemento[campo],
        });
      }
    }

    porData.set(registro.data, mesclado);
  }

  return {
    registros: [...porData.values()].sort((a, b) => a.data.localeCompare(b.data)),
    duplicadas,
    conflitos,
  };
}

/**
 * Define como uma coluna é interpretada:
 *   • máximo <= 1        → fração (multiplica por 100);
 *   • máximo > 1 e 80%+  → coluna mista (normaliza cada valor <= 1);
 *   • demais             → já está em percentual.
 */
function escalaDoCampo(registros, campo) {
  const valores = registros.map((registro) => registro[campo]).filter((valor) => valor !== null);
  if (valores.length === 0) {
    return { fator: 1, mista: false, max: null, fracionarios: 0, total: 0 };
  }

  const max = Math.max(...valores);
  const fracionarios = valores.filter((valor) => valor <= 1.0000001).length;
  const mista = max > 1.0000001 && fracionarios / valores.length >= 0.8;

  return {
    fator: max <= 1.0000001 ? 100 : 1,
    mista,
    max,
    fracionarios,
    total: valores.length,
  };
}

function normalizarValor(valor, escala) {
  if (valor === null) return null;
  const normalizado = escala.mista
    ? valor <= 1.0000001
      ? valor * 100
      : valor
    : valor * escala.fator;

  return arredondar(Math.min(100, Math.max(0, normalizado)));
}

/**
 * Quando a soma dos incrementos semanais diverge do último acumulado de origem,
 * deriva os incrementos a partir das diferenças do acumulado — desde que a
 * série seja monotônica e cubra os dados necessários.
 */
function derivarAcumulado(registros, campoAcumulado, campoDestino, { exigirCobertura = false } = {}) {
  const pontos = registros
    .map((registro, indice) => ({ indice, data: registro.data, valor: registro[campoAcumulado] }))
    .filter((ponto) => ponto.valor !== null);

  if (pontos.length === 0) {
    return { derivou: false, motivo: 'sem acumulado de origem' };
  }

  const ultimo = pontos[pontos.length - 1];
  const somaSemanal = arredondar(
    registros.reduce((total, registro) => total + numeroSeguro(registro[campoDestino]), 0)
  );
  const divergencia = arredondar(ultimo.valor - somaSemanal, 4);

  if (Math.abs(divergencia) <= LIMIAR_DIVERGENCIA) {
    return {
      derivou: false,
      motivo: 'soma semanal confere com o acumulado',
      soma_semanal: somaSemanal,
      ultimo_acumulado: ultimo.valor,
      divergencia,
    };
  }

  const quedas = [];
  for (let indice = 1; indice < pontos.length; indice += 1) {
    if (pontos[indice].valor + 0.005 < pontos[indice - 1].valor) {
      quedas.push({
        data: pontos[indice].data,
        valor: pontos[indice].valor,
        anterior: pontos[indice - 1].valor,
      });
    }
  }

  if (quedas.length > 0) {
    return {
      derivou: false,
      motivo: 'acumulado de origem não é monotônico',
      soma_semanal: somaSemanal,
      ultimo_acumulado: ultimo.valor,
      divergencia,
      quedas,
    };
  }

  if (exigirCobertura) {
    const ultimoSemanal = registros.reduce(
      (indiceAtual, registro, indice) =>
        registro[campoDestino] !== null ? indice : indiceAtual,
      -1
    );

    if (ultimo.indice < ultimoSemanal) {
      return {
        derivou: false,
        motivo: 'acumulado de origem não cobre toda a série',
        soma_semanal: somaSemanal,
        ultimo_acumulado: ultimo.valor,
        divergencia,
      };
    }
  }

  if (ultimo.valor < -0.005 || ultimo.valor > 100.005) {
    return {
      derivou: false,
      motivo: 'acumulado de origem fora da faixa 0..100',
      soma_semanal: somaSemanal,
      ultimo_acumulado: ultimo.valor,
      divergencia,
    };
  }

  let anterior = 0;
  for (const registro of registros) {
    const acumulado = registro[campoAcumulado];
    if (acumulado === null) {
      registro[campoDestino] = 0;
      continue;
    }

    registro[campoDestino] = arredondar(Math.max(0, acumulado - anterior));
    anterior = acumulado;
  }

  return {
    derivou: true,
    motivo: 'incrementos derivados do acumulado',
    soma_semanal: somaSemanal,
    ultimo_acumulado: ultimo.valor,
    divergencia,
  };
}

/**
 * Valida a tendência acumulada de trás para frente (uma tendência não pode
 * cair ao longo do tempo), preenche os vazios com a última tendência e usa o
 * realizado acumulado quando ainda não existe tendência informada.
 */
function prepararTendencia(registros) {
  const descartadas = [];
  let ancora = null;

  for (let indice = registros.length - 1; indice >= 0; indice -= 1) {
    const valor = registros[indice].tend;
    if (valor === null) continue;

    if (ancora !== null && valor > ancora + 0.005) {
      descartadas.push({
        data: registros[indice].data,
        valor,
        proxima_tendencia: ancora,
      });
      registros[indice].tend = null;
    } else {
      ancora = valor;
    }
  }

  let ultima = null;
  let preenchidasComRealizado = 0;

  for (const registro of registros) {
    if (registro.tend !== null) {
      ultima = registro.tend;
    } else if (ultima !== null) {
      registro.tend = ultima;
    } else {
      registro.tend = registro.realAcCalculado;
      preenchidasComRealizado += 1;
    }

    if (registro.tend + 0.005 < registro.realAcCalculado) {
      descartadas.push({
        data: registro.data,
        valor: registro.tend,
        motivo: 'tendência abaixo do realizado acumulado',
        realizado_acumulado: registro.realAcCalculado,
      });
      registro.tend = registro.realAcCalculado;
      ultima = registro.tend;
    }
  }

  return { descartadas, preenchidasComRealizado };
}

function compararLinhaAvanco(existente, nova) {
  if (Number(existente.semana) !== Number(nova.semana)) return true;

  return CAMPOS_PERCENTUAL.some(
    (campo) => Number(existente[campo] ?? 0) !== Number(nova[campo] ?? 0)
  );
}

async function analisarAvanco(obrasPorId) {
  const leitura = lerMatriz(localizarArquivo('avan'));
  const porOsi = new Map();

  for (const linha of leitura.linhas) {
    const osi = normalizarOsi(linha[1]);
    if (!osi) continue;
    if (!porOsi.has(osi)) porOsi.set(osi, []);
    porOsi.get(osi).push(linha);
  }

  const resultados = [];
  const operacoes = { inserir: 0, atualizar: 0, inalterados: 0 };
  const porObra = new Map();

  for (const [osi, linhas] of [...porOsi.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const obraId = MAPA_OSI[osi];
    if (!obraId) {
      resultados.push({
        osi,
        status: 'ignorada',
        motivo: 'OSI sem correspondência no mapa OSI → obra',
        linhas: linhas.length,
      });
      aviso(`Avanço ${osi}: OSI sem correspondência; ${linhas.length} linha(s) ignorada(s).`);
      continue;
    }

    const obra = obrasPorId.get(obraId);
    if (!obra) {
      resultados.push({
        osi,
        obra_id: obraId,
        status: 'ignorada',
        motivo: `Obra ${obraId} não encontrada no banco`,
        linhas: linhas.length,
      });
      aviso(`Avanço ${osi}: obra ${obraId} não encontrada; linhas ignoradas.`);
      continue;
    }

    const registros = [];
    let datasInvalidas = 0;
    let semanasDivergentes = 0;
    let semanasDerivadas = 0;

    for (const linha of linhas) {
      const data = dataISO(linha[3]);
      if (!data) {
        datasInvalidas += 1;
        continue;
      }

      const semanaCalculada = semanaISO(data);
      const semanaFonte = numero(linha[4]);
      if (semanaFonte && Number.isInteger(semanaFonte) && semanaFonte !== semanaCalculada) {
        semanasDivergentes += 1;
      }
      if (!semanaFonte || !Number.isInteger(semanaFonte) || semanaFonte < 1 || semanaFonte > 53) {
        semanasDerivadas += 1;
      }

      registros.push({
        linha_origem: linha[0],
        data,
        semana: semanaCalculada,
        semana_origem: semanaFonte,
        prev: numero(linha[5]),
        lb: numero(linha[6]),
        real: numero(linha[7]),
        tend: numero(linha[8]),
        prevAc: numero(linha[9]),
        realAc: numero(linha[10]),
      });
    }

    if (registros.length === 0) {
      resultados.push({
        osi,
        obra_id: obraId,
        obra: obra.descricao,
        status: 'ignorada',
        motivo: 'nenhuma data válida',
        linhas: linhas.length,
      });
      continue;
    }

    const dedup = deduplicarPorData(registros);
    const registrosUnicos = dedup.registros;

    const escalas = {};
    for (const campo of CAMPOS_PERCENTUAL) {
      escalas[campo] = escalaDoCampo(registrosUnicos, campo);
      for (const registro of registrosUnicos) {
        registro[campo] = normalizarValor(registro[campo], escalas[campo]);
      }
    }

    const derivacaoPrev = derivarAcumulado(registrosUnicos, 'prevAc', 'prev');
    const temRealSemanal = registrosUnicos.some((registro) => registro.real !== null);
    let derivacaoReal;

    if (!temRealSemanal) {
      for (const registro of registrosUnicos) registro.real = 0;
      derivacaoReal = {
        derivou: false,
        motivo: 'sem realizado semanal; Físico_Real_Acum ignorado',
      };
      aviso(
        `Avanço ${osi} (obra ${obraId}): sem realizado semanal; Físico_Real_Acum foi ignorado.`
      );
    } else {
      derivacaoReal = derivarAcumulado(registrosUnicos, 'realAc', 'real', {
        exigirCobertura: true,
      });
    }

    if (derivacaoPrev.derivou) {
      aviso(
        `Avanço ${osi} (obra ${obraId}): previsto derivado do acumulado (soma semanal ${derivacaoPrev.soma_semanal}% → acumulado ${derivacaoPrev.ultimo_acumulado}%).`
      );
    } else if (derivacaoPrev.quedas) {
      aviso(
        `Avanço ${osi} (obra ${obraId}): acumulado previsto não monotônico; mantidos os valores semanais.`
      );
    }

    if (derivacaoReal.derivou) {
      aviso(
        `Avanço ${osi} (obra ${obraId}): realizado derivado do acumulado (soma semanal ${derivacaoReal.soma_semanal}% → acumulado ${derivacaoReal.ultimo_acumulado}%).`
      );
    }

    let prevAcumulado = 0;
    let realAcumulado = 0;
    for (const registro of registrosUnicos) {
      registro.prev = arredondar(registro.prev ?? 0);
      registro.lb = arredondar(registro.lb ?? 0);
      registro.real = arredondar(registro.real ?? 0);

      prevAcumulado = arredondar(prevAcumulado + registro.prev);
      realAcumulado = arredondar(realAcumulado + registro.real);
      registro.prevAcCalculado = prevAcumulado;
      registro.realAcCalculado = realAcumulado;
    }

    const tendencia = prepararTendencia(registrosUnicos);

    if (prevAcumulado > 100.005 || realAcumulado > 100.005) {
      aviso(
        `Avanço ${osi} (obra ${obraId}): soma acumulada acima de 100% (prev ${prevAcumulado}%, real ${realAcumulado}%).`
      );
    }

    const linhasFinais = registrosUnicos.map((registro) => ({
      obra_id: obraId,
      data: new Date(`${registro.data}T00:00:00.000Z`),
      semana: registro.semana,
      fisico_prev: arredondar(registro.prev),
      fisico_lb_prev: arredondar(registro.lb),
      fisico_real: arredondar(registro.real),
      fisico_tend_acum: arredondar(registro.tend ?? 0),
      fisico_prev_acum: arredondar(registro.prevAcCalculado),
      fisico_real_acum: arredondar(registro.realAcCalculado),
    }));

    const existentes = await prisma.obraAvancoFisico.findMany({
      where: { obra_id: obraId },
      select: {
        id: true,
        data: true,
        semana: true,
        fisico_prev: true,
        fisico_lb_prev: true,
        fisico_real: true,
        fisico_tend_acum: true,
        fisico_prev_acum: true,
        fisico_real_acum: true,
      },
    });

    const porData = new Map(
      existentes.map((registro) => [
        registro.data.toISOString().slice(0, 10),
        registro,
      ])
    );

    const novas = [];
    const atualizacoes = [];

    for (const linha of linhasFinais) {
      const chave = linha.data.toISOString().slice(0, 10);
      const existente = porData.get(chave);

      if (!existente) {
        operacoes.inserir += 1;
        novas.push(linha);
      } else if (compararLinhaAvanco(existente, linha)) {
        operacoes.atualizar += 1;
        atualizacoes.push({ id: existente.id, linha });
      } else {
        operacoes.inalterados += 1;
      }
    }

    if (APLICAR) {
      const operacoesPrisma = [
        ...novas.map((linha) => prisma.obraAvancoFisico.create({ data: linha })),
        ...atualizacoes.map(({ id, linha }) =>
          prisma.obraAvancoFisico.update({
            where: { id },
            data: {
              semana: linha.semana,
              fisico_prev: linha.fisico_prev,
              fisico_lb_prev: linha.fisico_lb_prev,
              fisico_real: linha.fisico_real,
              fisico_tend_acum: linha.fisico_tend_acum,
              fisico_prev_acum: linha.fisico_prev_acum,
              fisico_real_acum: linha.fisico_real_acum,
            },
          })
        ),
      ];

      if (operacoesPrisma.length > 0) {
        await prisma.$transaction(operacoesPrisma);
      }
    }

    porObra.set(obraId, {
      osi,
      obra: obra.descricao,
      ultima_data: registrosUnicos[registrosUnicos.length - 1].data,
      prev_acum: prevAcumulado,
      real_acum: realAcumulado,
    });

    resultados.push({
      osi,
      obra_id: obraId,
      obra: obra.descricao,
      status: 'processada',
      linhas: linhas.length,
      datas_invalidas: datasInvalidas,
      medidas: registrosUnicos.length,
      duplicadas: dedup.duplicadas,
      conflitos: dedup.conflitos,
      semanas_derivadas: semanasDerivadas,
      semanas_divergentes: semanasDivergentes,
      primeira_data: registrosUnicos[0].data,
      ultima_data: registrosUnicos[registrosUnicos.length - 1].data,
      escalas,
      derivacao_prev: derivacaoPrev,
      derivacao_real: derivacaoReal,
      tendencia_descartada: tendencia.descartadas,
      tendencia_preenchida_com_realizado: tendencia.preenchidasComRealizado,
      prev_acum: prevAcumulado,
      real_acum: realAcumulado,
      inserir: novas.length,
      atualizar: atualizacoes.length,
      inalterados: linhasFinais.length - novas.length - atualizacoes.length,
      linhas_extras_preservadas: existentes.filter(
        (registro) => !linhasFinais.some(
          (linha) => linha.data.toISOString().slice(0, 10) === registro.data.toISOString().slice(0, 10)
        )
      ).length,
    });

    console.log(
      `  • ${osi} → obra ${obraId} (${obra.descricao.slice(0, 45)}): ` +
        `${registrosUnicos.length} medição(ões) [${registrosUnicos[0].data}..${registrosUnicos[registrosUnicos.length - 1].data}] ` +
        `| prev ${prevAcumulado}% | real ${realAcumulado}% ` +
        `| ${novas.length} nova(s), ${atualizacoes.length} atualização(ões)`
    );
  }

  return {
    arquivo: leitura.arquivo,
    aba: leitura.aba,
    resultados,
    operacoes,
    porObra,
  };
}

/* -------------------------------------------------------------------------- */
/* Localizações                                                               */
/* -------------------------------------------------------------------------- */

function chaveCoordenada(obraId, latitude, longitude) {
  return `${obraId}|${Number(latitude).toFixed(6)}|${Number(longitude).toFixed(6)}`;
}

function prepararDescricoes(itens) {
  const porBase = new Map();

  for (const item of itens) {
    const base = item.descricao_base;
    porBase.set(base, (porBase.get(base) || 0) + 1);
  }

  const sequencia = new Map();

  return itens.map((item) => {
    const total = porBase.get(item.descricao_base);
    const atual = (sequencia.get(item.descricao_base) || 0) + 1;
    sequencia.set(item.descricao_base, atual);

    if (item.descricao_base === 'Ponto') {
      return { ...item, descricao: `Ponto ${atual}` };
    }
    if (total > 1) {
      return { ...item, descricao: `${item.descricao_base} (${atual}/${total})` };
    }
    return { ...item, descricao: item.descricao_base };
  });
}

async function analisarLocalizacoes(obrasPorId) {
  const leitura = lerMatriz(localizarArquivo('local'));
  const porOsi = new Map();
  let linhasIgnoradas = 0;

  for (const linha of leitura.linhas) {
    const osi = normalizarOsi(linha[1]);
    if (!osi) {
      linhasIgnoradas += 1;
      continue;
    }
    if (!porOsi.has(osi)) porOsi.set(osi, []);
    porOsi.get(osi).push(linha);
  }

  const resultados = [];
  const operacoes = { criar: 0, existentes: 0, invalidas: 0 };
  const obrasComLocalizacoes = new Set();

  for (const [osi, linhas] of [...porOsi.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const obraId = MAPA_OSI[osi];
    if (!obraId) {
      resultados.push({
        osi,
        status: 'ignorada',
        motivo: 'OSI sem correspondência no mapa OSI → obra',
        linhas: linhas.length,
      });
      aviso(`Localizações ${osi}: OSI sem correspondência; ${linhas.length} linha(s) ignorada(s).`);
      continue;
    }

    const obra = obrasPorId.get(obraId);
    if (!obra) {
      resultados.push({
        osi,
        obra_id: obraId,
        status: 'ignorada',
        motivo: `Obra ${obraId} não encontrada no banco`,
        linhas: linhas.length,
      });
      aviso(`Localizações ${osi}: obra ${obraId} não encontrada; linhas ignoradas.`);
      continue;
    }

    const itens = [];
    let invalidas = 0;

    for (const linha of linhas) {
      const latitude = numero(linha[5]);
      const longitude = numero(linha[6]);

      if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        invalidas += 1;
        operacoes.invalidas += 1;
        continue;
      }

      const descricaoBase = String(linha[3] ?? '').trim();
      itens.push({
        linha_origem: linha[0],
        obra_id: obraId,
        osi,
        descricao_base: descricaoBase || 'Ponto',
        latitude: arredondar(latitude, 7),
        longitude: arredondar(longitude, 7),
      });
    }

    if (itens.length === 0) {
      resultados.push({
        osi,
        obra_id: obraId,
        obra: obra.descricao,
        status: 'ignorada',
        motivo: 'nenhuma coordenada válida',
        linhas: linhas.length,
        invalidas,
      });
      continue;
    }

    const itensComDescricao = prepararDescricoes(itens);

    const existentes = await prisma.obraLocalizacao.findMany({
      where: { obra_id: obraId },
      select: { id: true, latitude: true, longitude: true, descricao: true },
    });

    const porCoordenada = new Map();
    for (const localizacao of existentes) {
      if (localizacao.latitude === null || localizacao.longitude === null) continue;
      porCoordenada.set(
        chaveCoordenada(obraId, localizacao.latitude, localizacao.longitude),
        localizacao
      );
    }

    const novas = [];
    let jaExistentes = 0;

    for (const item of itensComDescricao) {
      const chave = chaveCoordenada(obraId, item.latitude, item.longitude);
      if (porCoordenada.has(chave)) {
        jaExistentes += 1;
        operacoes.existentes += 1;
      } else {
        novas.push({
          obra_id: obraId,
          tipo: 'PONTO',
          descricao: item.descricao,
          latitude: item.latitude,
          longitude: item.longitude,
          referencia: osi,
        });
      }
    }

    operacoes.criar += novas.length;
    obrasComLocalizacoes.add(obraId);

    if (APLICAR && novas.length > 0) {
      await prisma.obraLocalizacao.createMany({ data: novas });
    }

    resultados.push({
      osi,
      obra_id: obraId,
      obra: obra.descricao,
      status: 'processada',
      linhas: linhas.length,
      validas: itensComDescricao.length,
      invalidas,
      criar: novas.length,
      existentes: jaExistentes,
      descricoes: [...new Set(itensComDescricao.map((item) => item.descricao))].slice(0, 8),
    });

    console.log(
      `  • ${osi} → obra ${obraId} (${obra.descricao.slice(0, 45)}): ` +
        `${itensComDescricao.length} ponto(s) válido(s) | ${novas.length} novo(s), ${jaExistentes} já existente(s)` +
        (invalidas > 0 ? ` | ${invalidas} inválido(s)` : '')
    );
  }

  return {
    arquivo: leitura.arquivo,
    aba: leitura.aba,
    resultados,
    operacoes,
    linhasIgnoradas,
    obrasComLocalizacoes: [...obrasComLocalizacoes],
  };
}

/* -------------------------------------------------------------------------- */
/* Orquestração                                                               */
/* -------------------------------------------------------------------------- */

async function carregarObras() {
  const obras = await prisma.obra.findMany({
    orderBy: { id: 'asc' },
    include: {
      orcamento: { select: { ss: true, descricao: true } },
    },
  });

  const porId = new Map(
    obras.map((obra) => [
      obra.id,
      {
        id: obra.id,
        osi: obra.osi_numero,
        ss: obra.orcamento?.ss ?? null,
        descricao: obra.orcamento?.descricao ?? `Obra ${obra.id}`,
      },
    ])
  );

  return { obras, porId };
}

async function main() {
  console.log('='.repeat(90));
  console.log(`Synapse — Importação da pasta 13 (${MODO})`);
  console.log('='.repeat(90));

  if (!fs.existsSync(PASTA_DADOS)) {
    throw new Error(`Pasta não encontrada: ${PASTA_DADOS}`);
  }

  const { porId } = await carregarObras();

  console.log(`\nObras no banco: ${porId.size}`);
  console.log(
    `OSIs mapeadas: ${Object.keys(MAPA_OSI).length} | ` +
      `Obras mapeadas: ${new Set(Object.values(MAPA_OSI)).size}`
  );

  console.log('\n--- Avanço físico ------------------------------------------------------');
  const avanco = await analisarAvanco(porId);

  console.log('\n--- Localizações -------------------------------------------------------');
  const localizacoes = await analisarLocalizacoes(porId);

  const relatorio = {
    gerado_em: new Date().toISOString(),
    modo: MODO,
    mapa_osi: MAPA_OSI,
    arquivos: {
      avanco: avanco.arquivo,
      localizacoes: localizacoes.arquivo,
    },
    resumo: {
      avancos_inserir: avanco.operacoes.inserir,
      avancos_atualizar: avanco.operacoes.atualizar,
      avancos_inalterados: avanco.operacoes.inalterados,
      localizacoes_criar: localizacoes.operacoes.criar,
      localizacoes_existentes: localizacoes.operacoes.existentes,
      localizacoes_invalidas: localizacoes.operacoes.invalidas,
      avisos: avisos.length,
    },
    avancos: avanco.resultados,
    localizacoes: localizacoes.resultados,
    avisos,
  };

  fs.writeFileSync(ARQUIVO_RELATORIO, JSON.stringify(relatorio, null, 2), 'utf8');

  console.log('\n--- Resumo -------------------------------------------------------------');
  console.log(
    `Avanço: ${avanco.operacoes.inserir} inserção(ões), ` +
      `${avanco.operacoes.atualizar} atualização(ões), ` +
      `${avanco.operacoes.inalterados} inalterada(s).`
  );
  console.log(
    `Localizações: ${localizacoes.operacoes.criar} criação(ões), ` +
      `${localizacoes.operacoes.existentes} já existente(s), ` +
      `${localizacoes.operacoes.invalidas} inválida(s).`
  );
  console.log(`Avisos: ${avisos.length}`);
  console.log(`Relatório: ${ARQUIVO_RELATORIO}`);

  if (!APLICAR) {
    console.log('\nDry-run concluído. Nenhuma alteração foi gravada.');
    console.log('Para gravar, execute: node scripts/importarPasta13.js --apply');
  } else {
    console.log('\nImportação aplicada com sucesso.');
  }
}

main()
  .catch((erro) => {
    console.error('\nFalha na importação:', erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
