'use strict';

/**
 * Regras puras da Programação S+1 (sem banco): semana da programação, leitura da planilha
 * "Programação_S+1_Sem_NN revNN.xlsx" e resumo (totais por dia, saldo por função e conflitos).
 */

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const TIPOS_FRENTE = ['OBRA', 'APOIO', 'DISPONIVEL', 'AFASTAMENTO'];
/** Frentes cujo efetivo conta como "programado" (trabalhando) no dia. */
const TIPOS_PRODUTIVOS = ['OBRA', 'APOIO'];

const limpar = (v) => (v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim());
const limparTexto = (v) => (v === undefined || v === null ? '' : String(v).replace(/\r\n/g, '\n').trim());

/** Data (UTC, meia-noite) da segunda-feira da semana que contém `data`. */
function segundaDaSemana(data) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diaSemana = utc.getUTCDay(); // 0 = domingo
  utc.setUTCDate(utc.getUTCDate() - ((diaSemana + 6) % 7));
  return utc;
}

/**
 * Nº da semana pela mesma regra do WEEKNUM(data) do Excel usado na planilha
 * (semana 1 contém 1º de janeiro; as semanas começam no domingo).
 */
function numeroSemana(data) {
  const d = new Date(data);
  const inicioAno = Date.UTC(d.getUTCFullYear(), 0, 1);
  const diaDoAno = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - inicioAno) / 86400000);
  const diaSemanaJan1 = new Date(inicioAno).getUTCDay();
  return Math.floor((diaDoAno + diaSemanaJan1) / 7) + 1;
}

/** Ano, semana e segunda-feira de uma data qualquer da semana programada. */
function identificarSemana(data) {
  const segunda = segundaDaSemana(data);
  if (!segunda) return null;
  return { ano: segunda.getUTCFullYear(), semana: numeroSemana(segunda), data_inicio: segunda };
}

/** Datas (YYYY-MM-DD) de segunda a domingo. */
function datasDaSemana(dataInicio) {
  const base = new Date(dataInicio);
  return DIAS_SEMANA.map((_, i) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    return d.toISOString().slice(0, 10);
  });
}

/** Normaliza a presença para exatamente 7 posições booleanas. */
function normalizarDias(dias) {
  const lista = Array.isArray(dias) ? dias : [];
  return DIAS_SEMANA.map((_, i) => Boolean(lista[i]));
}

/** Tipo da frente a partir do título e do código do bloco na planilha. */
function inferirTipoFrente(titulo, codigo) {
  const t = limpar(titulo).toUpperCase();
  if (/DISPON[IÍ]VEL/.test(t)) return 'DISPONIVEL';
  if (/F[ÉE]RIAS|INSS|AFASTAMENTO/.test(t)) return 'AFASTAMENTO';
  if (limpar(codigo).toUpperCase() === 'ITINERANTE') return 'APOIO';
  return 'OBRA';
}

/** "SS 113/24" → "113/24" e "998" = "SS998" (comparação da SS da frente com a SS da obra). */
function normalizarSs(valor) {
  return limpar(valor).toUpperCase().replace(/\s+/g, '').replace(/^SS-?/, '');
}

const ehCodigoEquipe = (v) => /^[A-ZÇ]{2,5}-\d{1,3}$/i.test(limpar(v));
const ehNumero = (v) => limpar(v) !== '' && !Number.isNaN(Number(limpar(v)));

/** Revisão informada no nome do arquivo ("... rev02.xlsx" → 2). */
function revisaoDoNomeArquivo(nome) {
  const m = /rev\.?\s*(\d+)/i.exec(String(nome || ''));
  return m ? Number(m[1]) : 0;
}

/**
 * Lê a aba de programação (primeira aba cujo nome começa com "PRG") no layout atual da reunião:
 *  - linha 2: semana (G2) e a segunda-feira (H2);
 *  - cada bloco começa numa linha com "SEM | SEG | TER..." (título em B, responsável em E, código em F),
 *    seguida da linha "MAT. | NOME | FUNÇÃO" (código da equipe pode vir na coluna A);
 *  - linhas de equipe: código em A (MEC-03) e disciplina em B; atividades em O e premissas em P;
 *  - linhas de pessoa: nº em A, matrícula em B, nome em C, função em D, presença de H (SEG) a N (DOM).
 * @param {object} XLSX biblioteca `xlsx`
 * @param {Buffer} buffer conteúdo do arquivo
 */
function lerPlanilhaProgramacao(XLSX, buffer, nomeArquivo = '') {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const nomeAba = wb.SheetNames.find((n) => /^PRG/i.test(n.trim())) || wb.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, defval: '', raw: true });

  // Segunda-feira da semana (H2) — serial do Excel ou data.
  let dataInicio = null;
  const h2 = linhas[1]?.[7];
  if (typeof h2 === 'number') {
    const p = XLSX.SSF.parse_date_code(h2);
    if (p) dataInicio = new Date(Date.UTC(p.y, p.m - 1, p.d));
  } else if (h2) {
    dataInicio = new Date(h2);
  }
  const semana = dataInicio ? identificarSemana(dataInicio) : null;
  if (!semana) throw new Error('Não foi possível identificar a semana (célula H2 da aba de programação).');
  const semanaInformada = Number(linhas[1]?.[6]);

  const frentes = [];
  let frente = null;
  let equipe = null;
  let codigoPendente = null;

  const novaEquipe = (codigo, disciplina) => {
    equipe = { codigo: codigo || null, disciplina: disciplina || null, atividades: '', premissas: '', alocacoes: [] };
    frente.equipes.push(equipe);
    codigoPendente = null;
    return equipe;
  };
  const anexar = (atual, extra) => [atual, extra].filter(Boolean).join('\n');

  linhas.forEach((linha, indice) => {
    const c = (i) => linha[i];
    if (indice < 2) return;
    // Cabeçalho de bloco (frente de serviço).
    if (limpar(c(6)).toUpperCase() === 'SEM' && limpar(c(7)).toUpperCase() === 'SEG') {
      const titulo = limpar(c(1)) || 'Sem título';
      const codigo = limpar(c(5)) || null;
      const responsavel = limpar(c(4));
      frente = {
        titulo,
        codigo,
        responsavel: responsavel && responsavel !== '-' ? responsavel : null,
        tipo: inferirTipoFrente(titulo, codigo),
        equipes: [],
      };
      frentes.push(frente);
      equipe = null;
      codigoPendente = null;
      return;
    }
    if (!frente) return; // quadro de saldo do topo: é recalculado pelo sistema

    const colA = limpar(c(0));
    const colB = limpar(c(1));
    const colC = limpar(c(2));
    if (colB.toUpperCase() === 'MAT.') {
      codigoPendente = ehCodigoEquipe(colA) ? colA.toUpperCase() : null;
      return;
    }
    if (limpar(c(5)).toUpperCase() === 'TOTAL') return;

    const atividades = limparTexto(c(14));
    const premissas = limparTexto(c(15));

    // Pessoa.
    if (ehNumero(colA) && (colB || colC)) {
      if (!equipe) novaEquipe(codigoPendente, frente.titulo);
      equipe.alocacoes.push({
        matricula: colB || null,
        nome: colC || `Matrícula ${colB}`,
        funcao: limpar(c(3)) || null,
        dias: DIAS_SEMANA.map((_, i) => Number(c(7 + i)) > 0),
      });
      if (atividades) equipe.atividades = anexar(equipe.atividades, atividades);
      if (premissas) equipe.premissas = anexar(equipe.premissas, premissas);
      return;
    }
    // Equipe (disciplina).
    if (colB && !colC && !ehNumero(colA)) {
      const codigo = ehCodigoEquipe(colA) ? colA.toUpperCase() : codigoPendente;
      novaEquipe(codigo, colB);
      equipe.atividades = atividades;
      equipe.premissas = premissas;
    }
  });

  frentes.forEach((f) => {
    f.equipes = f.equipes.filter((e) => e.alocacoes.length > 0 || e.atividades || e.premissas);
  });

  return {
    ...semana,
    semana_planilha: Number.isFinite(semanaInformada) ? semanaInformada : null,
    revisao: revisaoDoNomeArquivo(nomeArquivo),
    frentes: frentes.filter((f) => f.equipes.length > 0),
  };
}

const chavePessoa = (a) => (limpar(a.matricula) ? `M:${limpar(a.matricula)}` : `N:${limpar(a.nome).toUpperCase()}`);

/**
 * Resumo da programação: totais por dia (geral e por tipo de frente), total de cada frente,
 * saldo por função (efetivo × programado em obra/apoio) e conflitos (mesma pessoa em duas equipes no mesmo dia).
 * @param {{ frentes: Array<{ id?, titulo, tipo, equipes: Array<{ id?, codigo, alocacoes: Array<{ matricula, nome, funcao, dias }> }> }> }} programacao
 * @param {Array<{ id?, matricula, nome, funcao, situacao }>|null} efetivo efetivo do contrato (colaboradores ativos)
 */
function calcularResumo(programacao, efetivo = null) {
  const zeros = () => DIAS_SEMANA.map(() => 0);
  const porTipo = Object.fromEntries(TIPOS_FRENTE.map((t) => [t, zeros()]));
  const totalPorFrente = {};
  const pessoas = new Map(); // chave → { nome, matricula, funcao, afastado, produtivoDias:Set, marcacoes: [ [dia, equipe] ] }

  (programacao.frentes || []).forEach((frente) => {
    const totalFrente = zeros();
    (frente.equipes || []).forEach((equipe) => {
      (equipe.alocacoes || []).forEach((a) => {
        const dias = normalizarDias(a.dias);
        const chave = chavePessoa(a);
        if (!pessoas.has(chave)) {
          pessoas.set(chave, { matricula: a.matricula || null, nome: a.nome, funcao: limpar(a.funcao).toUpperCase() || 'SEM FUNÇÃO', afastado: false, produtivo: zeros(), marcacoes: [] });
        }
        const p = pessoas.get(chave);
        if (frente.tipo === 'AFASTAMENTO') p.afastado = true;
        dias.forEach((presente, i) => {
          if (!presente) return;
          totalFrente[i] += 1;
          porTipo[frente.tipo] && (porTipo[frente.tipo][i] += 1);
          if (TIPOS_PRODUTIVOS.includes(frente.tipo)) p.produtivo[i] = 1;
          p.marcacoes.push({ dia: i, frente: frente.titulo, equipe: equipe.codigo || null, frente_id: frente.id ?? null });
        });
      });
    });
    totalPorFrente[frente.id ?? frente.titulo] = totalFrente;
  });

  const funcoes = new Map();
  const funcaoDe = (nome) => {
    if (!funcoes.has(nome)) funcoes.set(nome, { funcao: nome, efetivo: 0, afastados: 0, programados: zeros() });
    return funcoes.get(nome);
  };
  const comEfetivo = Array.isArray(efetivo) && efetivo.length > 0;
  // Com o efetivo do contrato: base = colaboradores DISPONÍVEIS por função (como no topo da planilha);
  // sem ele, a base é a própria lista da programação.
  if (comEfetivo) {
    efetivo.forEach((c) => {
      const f = funcaoDe(limpar(c.funcao).toUpperCase() || 'SEM FUNÇÃO');
      if (c.situacao === 'INDISPONIVEL') f.afastados += 1;
      else f.efetivo += 1;
    });
  }
  pessoas.forEach((p) => {
    const f = funcaoDe(p.funcao);
    if (p.afastado) {
      if (!comEfetivo) f.afastados += 1;
      return;
    }
    if (!comEfetivo) f.efetivo += 1;
    p.produtivo.forEach((v, i) => { f.programados[i] += v; });
  });

  // Efetivo × programação: quem está disponível e não aparece na semana, e quem foi programado sem estar no efetivo.
  const naProgramacao = new Set([...pessoas.values()].map((p) => limpar(p.matricula)).filter(Boolean));
  const noEfetivo = new Set((efetivo || []).map((c) => limpar(c.matricula)).filter(Boolean));
  const naoProgramados = comEfetivo
    ? efetivo.filter((c) => c.situacao !== 'INDISPONIVEL' && limpar(c.matricula) && !naProgramacao.has(limpar(c.matricula)))
      .map((c) => ({ id: c.id ?? null, matricula: c.matricula, nome: c.nome, funcao: c.funcao || null }))
    : [];
  const foraDoEfetivo = comEfetivo
    ? [...pessoas.values()].filter((p) => !p.matricula || !noEfetivo.has(limpar(p.matricula)))
      .map((p) => ({ matricula: p.matricula, nome: p.nome, funcao: p.funcao }))
    : [];
  const saldoPorFuncao = [...funcoes.values()]
    .map((f) => ({ ...f, sem_programacao: f.programados.map((n) => f.efetivo - n) }))
    .sort((a, b) => b.efetivo - a.efetivo || a.funcao.localeCompare(b.funcao));

  const conflitos = [];
  pessoas.forEach((p) => {
    DIAS_SEMANA.forEach((_, dia) => {
      const doDia = p.marcacoes.filter((m) => m.dia === dia);
      if (doDia.length > 1) conflitos.push({ matricula: p.matricula, nome: p.nome, dia, locais: doDia.map((m) => ({ frente: m.frente, equipe: m.equipe, frente_id: m.frente_id })) });
    });
  });

  const ativos = [...pessoas.values()].filter((p) => !p.afastado);
  return {
    total_pessoas: pessoas.size,
    efetivo_ativo: ativos.length,
    afastados: pessoas.size - ativos.length,
    // Pessoas distintas em obra/apoio no dia (quem está em duas equipes conta uma vez).
    programados_por_dia: DIAS_SEMANA.map((_, i) => ativos.reduce((s, p) => s + p.produtivo[i], 0)),
    por_tipo: porTipo,
    total_por_frente: totalPorFrente,
    saldo_por_funcao: saldoPorFuncao,
    saldo_pelo_efetivo: comEfetivo,
    nao_programados: naoProgramados,
    fora_do_efetivo: foraDoEfetivo,
    conflitos,
  };
}

/** Data do Excel (serial ou texto dd/mm/aaaa) → Date UTC, ou null. */
function dataDaCelula(XLSX, valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    const p = XLSX.SSF.parse_date_code(valor);
    return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null;
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpar(valor));
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
}

/**
 * Lê a aba "EFETIVO A DISTRIBUIR" (efetivo do contrato): MAT, NOME, FUNÇÃO OMEGA (cargo),
 * FUNÇÃO PLANEJAMENTO, DISCIP., SUPERVISOR, ENCARREGADO, SITUAÇÃO, férias e primeiro dia na obra.
 * Uma linha por matrícula (a primeira prevalece).
 */
function lerPlanilhaEfetivo(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const nomeAba = wb.SheetNames.find((n) => /EFETIVO/i.test(n));
  if (!nomeAba) throw new Error('Aba "EFETIVO A DISTRIBUIR" não encontrada.');
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, defval: '', raw: true });
  const cab = (linhas[0] || []).map((c) => limpar(c).toUpperCase());
  const col = (re) => cab.findIndex((c) => re.test(c));
  const i = {
    mat: col(/^MAT/), nome: col(/^NOME/), cargo: col(/FUN[ÇC][ÃA]O OMEGA/), funcao: col(/FUN[ÇC][ÃA]O PLANEJAMENTO/),
    disciplina: col(/^DI[SC]+IP/), supervisor: col(/^SUPERVISOR/), encarregado: col(/^ENCARREGADO/),
    situacao: col(/^SITUA/), feriasIni: col(/IN[IÍ]CIO F[ÉE]RIAS/), feriasFim: col(/T[ÉE]RMINO F[ÉE]RIAS/), mobilizacao: col(/PRIMEIRO DIA/),
  };
  if (i.mat < 0 || i.nome < 0) throw new Error('Colunas MAT e NOME não encontradas na aba de efetivo.');
  const vistos = new Set();
  const efetivo = [];
  linhas.slice(1).forEach((l) => {
    const matricula = limpar(l[i.mat]);
    const nome = limpar(l[i.nome]);
    if (!matricula || !nome || vistos.has(matricula)) return;
    vistos.add(matricula);
    const pegar = (k) => (i[k] >= 0 ? limpar(l[i[k]]) || null : null);
    efetivo.push({
      matricula,
      nome,
      cargo: pegar('cargo'),
      funcao: pegar('funcao')?.toUpperCase() || pegar('cargo')?.toUpperCase() || null,
      disciplina: pegar('disciplina'),
      supervisor: pegar('supervisor'),
      encarregado: pegar('encarregado'),
      situacao: /^INDISPON/i.test(pegar('situacao') || '') ? 'INDISPONIVEL' : 'DISPONIVEL',
      ferias_inicio: i.feriasIni >= 0 ? dataDaCelula(XLSX, l[i.feriasIni]) : null,
      ferias_fim: i.feriasFim >= 0 ? dataDaCelula(XLSX, l[i.feriasFim]) : null,
      data_mobilizacao: i.mobilizacao >= 0 ? dataDaCelula(XLSX, l[i.mobilizacao]) : null,
    });
  });
  return efetivo;
}

const ROTULO_TIPO = { OBRA: 'OBRA', APOIO: 'ITINERANTE', DISPONIVEL: 'ITINERANTE', AFASTAMENTO: 'ITINERANTE' };

/**
 * Monta a planilha de exportação com as MESMAS colunas da planilha da reunião (aba "PRG S+1_"):
 * A código da equipe/nº · B matrícula/título · C nome · D função · E turma/responsável · F código/previsto ·
 * G "SEM"/P · H..N segunda a domingo (1 = programado) · O principais atividades · P premissas.
 * Assim o arquivo exportado abre igual ao que a equipe usa (e pode ser lido de volta).
 * Inclui a aba "SALDO POR FUNÇÃO".
 * @returns {Buffer} conteúdo .xlsx
 */
function montarPlanilhaProgramacao(XLSX, programacao, resumo) {
  const iso = datasDaSemana(programacao.data_inicio);
  const datas = iso.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  // Meio-dia UTC: a conversão para data do Excel usa o fuso local e não pode cair no dia anterior.
  const datasExcel = iso.map((d) => new Date(`${d}T12:00:00Z`));
  const rev = `rev${String(programacao.revisao ?? 0).padStart(2, '0')}`;
  const vazio7 = DIAS_SEMANA.map(() => '');
  const linhas = [
    ['', `PROGRAMAÇÃO DE MÃO DE OBRA S+1_SEMANA ${programacao.semana}/${programacao.ano} ${rev}`, '', '', '', '', 'SEM', ...DIAS_SEMANA],
    ['', 'ITEM', 'RESUMO', '', 'TURMA', 'QTD', programacao.semana, ...datasExcel],
  ];
  (programacao.frentes || []).forEach((f) => {
    const codigo = f.obra?.orcamento?.ss || f.codigo || ROTULO_TIPO[f.tipo];
    linhas.push(['', f.titulo, '', '', f.responsavel || '-', codigo, 'SEM', ...DIAS_SEMANA, 'PRINCIPAIS ATIVIDADES', 'PREMISSAS']);
    linhas.push(['', 'MAT.', 'NOME', 'FUNÇÃO', 'TURMA', 'PREVISTO', programacao.semana, ...datas]);
    const total = DIAS_SEMANA.map(() => 0);
    (f.equipes || []).forEach((e) => {
      linhas.push([e.codigo || '', e.disciplina || 'EQUIPE', '', '', '', '', '', ...vazio7, e.atividades || '', e.premissas || '']);
      (e.alocacoes || []).forEach((a, n) => {
        const dias = normalizarDias(a.dias);
        dias.forEach((v, i) => { if (v) total[i] += 1; });
        linhas.push([n + 1, a.matricula || '', a.nome, a.funcao || '', codigo, 1, 'P', ...dias.map((v) => (v ? 1 : ''))]);
      });
    });
    linhas.push(['', '', '', '', '', 'TOTAL', '', ...total]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(linhas, { dateNF: 'dd/mm' });
  ws['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 34 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 5 }, ...DIAS_SEMANA.map(() => ({ wch: 6 })), { wch: 60 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, ws, 'PRG S+1_');

  if (resumo) {
    const saldo = [
      ['FUNÇÃO', resumo.saldo_pelo_efetivo ? 'DISPONÍVEL NO EFETIVO' : 'EFETIVO', 'AFASTADOS', ...DIAS_SEMANA.map((d, i) => `${d} ${datas[i]}`)],
      ...resumo.saldo_por_funcao.map((s) => [s.funcao, s.efetivo, s.afastados, ...s.sem_programacao]),
    ];
    const wsSaldo = XLSX.utils.aoa_to_sheet(saldo);
    wsSaldo['!cols'] = [{ wch: 38 }, { wch: 12 }, { wch: 10 }, ...DIAS_SEMANA.map(() => ({ wch: 10 }))];
    XLSX.utils.book_append_sheet(wb, wsSaldo, 'SALDO POR FUNÇÃO');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  lerPlanilhaEfetivo,
  montarPlanilhaProgramacao,
  DIAS_SEMANA,
  TIPOS_FRENTE,
  segundaDaSemana,
  numeroSemana,
  identificarSemana,
  datasDaSemana,
  normalizarDias,
  inferirTipoFrente,
  normalizarSs,
  revisaoDoNomeArquivo,
  lerPlanilhaProgramacao,
  calcularResumo,
};
