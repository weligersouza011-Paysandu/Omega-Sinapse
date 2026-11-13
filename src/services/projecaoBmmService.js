'use strict';

const AppError = require('../errors/AppError');
const repo = require('../repositories/projecaoBmmRepository');
const { cicloDaReferencia, semanasDoIntervalo, iso } = require('../utils/diasUteis');
const dinheiro = require('../utils/dinheiro');

/**
 * Projeção de BMM — receita prevista por obra e ciclo 16→15.
 *
 * Grade semanal (dias × pessoas/quantidade) sobre os preços do QQP do contrato/TAC.
 * Valor de cada item × semana (D = dias úteis do ciclo, d = dias na semana, q = pessoas):
 *   MES     preço × d × q ÷ D        (idêntico ao sistema Projeção Financeira)
 *   HORA    preço × d × q × horas_dia
 *   DIA     preço × d × q
 *   UNIDADE preço × q                 (d ignorado)
 * Cada item × semana é arredondado em centavos (meio para cima) e só depois somado.
 * O preço vem sempre do banco; o que o navegador envia é ignorado.
 *
 * A soma das projeções do contrato num mês vira o "Projetado" (previsto replanejado)
 * da curva financeira, com registro no histórico da curva.
 */

/** Cadastram e editam em qualquer obra. */
const PERFIS_GESTORES = ['SUPERVISOR', 'ADMIN'];
/** PLANEJADOR cadastra/edita só nas obras em que é planejador. */
const PERFIS_QUE_PROJETAM = [...PERFIS_GESTORES, 'PLANEJADOR'];
const PERFIS_QUE_EXCLUEM = ['ADMIN'];
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN', 'CLIENTE'];

const HORAS_DIA_PADRAO = '8';
const MAX_ITENS = 500;
const CASAS_PESSOAS = 4;
const CASAS_HORAS = 2;

/* -------------------------------------------------------------------------- */
/* Validação                                                                  */
/* -------------------------------------------------------------------------- */

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

function validarUsuario(usuario) {
  if (!usuario || usuario.id === undefined || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_VALIDOS.includes(usuario.perfil)) {
    throw new AppError(403, `Perfil desconhecido: "${usuario.perfil}".`);
  }
}

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

/** TAC do payload: vazio/0/"TAC0" = contrato original (null); senão o id do TAC. */
function lerTac(valor) {
  if (estaVazio(valor) || valor === 0 || String(valor).trim() === '0' || /^tac0$/i.test(String(valor).trim())) {
    return null;
  }
  return validarId(valor, 'termo_aditivo_id');
}

function lerReferencia(valor) {
  const referencia = String(valor || '').trim();
  const ciclo = cicloDaReferencia(referencia);
  if (!ciclo) throw new AppError(400, 'O campo "referencia" deve estar no formato AAAA-MM.');
  return { referencia, ciclo };
}

function lerNumeroBmm(valor) {
  if (estaVazio(valor)) throw new AppError(400, 'O campo "numero_bmm" é obrigatório.');
  const numero = String(valor).trim();
  if (numero.length > 30) throw new AppError(400, 'O campo "numero_bmm" aceita no máximo 30 caracteres.');
  return numero;
}

/** Decimal não negativo como texto, com no máximo `casas` casas decimais. */
function lerDecimal(valor, rotulo, casas) {
  if (estaVazio(valor)) return '0';
  if (typeof valor === 'boolean') throw new AppError(400, `"${rotulo}" deve ser um número maior ou igual a zero.`);
  const texto = typeof valor === 'number' ? (Number.isFinite(valor) ? String(valor) : '') : String(valor).trim().replace(',', '.');
  let partes;
  try {
    partes = dinheiro.partesDecimais(texto);
  } catch {
    throw new AppError(400, `"${rotulo}" deve ser um número maior ou igual a zero.`);
  }
  // Remove zeros à direita antes de conferir as casas.
  let { digitos, escala } = partes;
  while (escala > 0 && digitos % 10n === 0n) {
    digitos /= 10n;
    escala -= 1;
  }
  if (escala > casas) throw new AppError(400, `"${rotulo}" aceita no máximo ${casas} casas decimais.`);
  const base = 10n ** BigInt(escala);
  const inteiro = digitos / base;
  if (inteiro >= 10n ** 8n) throw new AppError(400, `"${rotulo}" está acima do limite permitido.`);
  return escala === 0 ? String(inteiro) : `${inteiro}.${String(digitos % base).padStart(escala, '0')}`;
}

function textoDecimal(valor) {
  return valor === null || valor === undefined ? null : String(valor);
}

function exigirEdicaoNaObra(usuario, obra) {
  validarUsuario(usuario);
  if (PERFIS_GESTORES.includes(usuario.perfil)) return;
  if (usuario.perfil === 'PLANEJADOR') {
    const ehPlanejador =
      obra.planejador_id === usuario.id || (obra.planejadores || []).some((p) => p.usuario_id === usuario.id);
    if (ehPlanejador) return;
    throw new AppError(403, 'O PLANEJADOR só cadastra projeções nas obras em que é planejador.');
  }
  throw new AppError(403, `Apenas perfis ${PERFIS_QUE_PROJETAM.join(', ')} podem cadastrar projeções de BMM.`);
}

/* -------------------------------------------------------------------------- */
/* Motor (função pura)                                                        */
/* -------------------------------------------------------------------------- */

/** Valor (centavos) de um item numa semana. */
function centavosDaSemana({ unidade, preco, dias, pessoas, horasDia, diasUteisCiclo }) {
  switch (unidade) {
    case 'MES':
      return diasUteisCiclo > 0 ? dinheiro.centavosDoProduto([preco, dias, pessoas], diasUteisCiclo) : 0n;
    case 'HORA':
      return dinheiro.centavosDoProduto([preco, dias, pessoas, horasDia]);
    case 'DIA':
      return dinheiro.centavosDoProduto([preco, dias, pessoas]);
    case 'UNIDADE':
      return dinheiro.centavosDoProduto([preco, pessoas]);
    default:
      throw new AppError(400, `Unidade do QQP desconhecida: ${unidade}.`);
  }
}

/**
 * Calcula a grade. Sem acesso ao banco.
 * @param {object} entrada
 * @param {Array<{semana_inicio, dias_uteis}>} entrada.semanas  semanas do ciclo
 * @param {Map<number, {id, unidade, preco_unitario}>} entrada.itensQqp  itens válidos do escopo
 * @param {Array} entrada.linhas  [{ item_qqp_id, horas_dia?, semanas: [{ semana_inicio, dias, pessoas }] }]
 * @returns {{ diasUteis, itens, totaisSemanas, totalCentavos }}
 */
function calcularGrade({ semanas, itensQqp, linhas }) {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    throw new AppError(400, 'Adicione pelo menos um item do QQP à projeção.');
  }
  if (linhas.length > MAX_ITENS) throw new AppError(400, `A projeção aceita no máximo ${MAX_ITENS} itens.`);

  const porSemana = new Map(semanas.map((s) => [s.semana_inicio, s]));
  const diasUteisCiclo = semanas.reduce((soma, s) => soma + s.dias_uteis, 0);
  const totaisSemanas = new Map(semanas.map((s) => [s.semana_inicio, 0n]));
  const vistos = new Set();
  const itens = [];

  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object') throw new AppError(400, 'A projeção contém um item inválido.');
    const itemId = validarId(linha.item_qqp_id, 'item_qqp_id');
    if (vistos.has(itemId)) throw new AppError(400, 'A projeção contém itens do QQP repetidos.');
    vistos.add(itemId);
    const item = itensQqp.get(itemId);
    if (!item) throw new AppError(400, 'Um ou mais itens não pertencem ao QQP do contrato/TAC selecionado.');

    const preco = String(item.preco_unitario);
    const horasDia =
      item.unidade === 'HORA' ? lerDecimal(estaVazio(linha.horas_dia) ? HORAS_DIA_PADRAO : linha.horas_dia, 'horas_dia', CASAS_HORAS) : null;
    if (horasDia !== null && (Number(horasDia) <= 0 || Number(horasDia) > 24)) {
      throw new AppError(400, `As horas por dia do item ${item.codigo} devem ficar entre 0 e 24.`);
    }

    const informadas = linha.semanas === undefined || linha.semanas === null ? [] : linha.semanas;
    if (!Array.isArray(informadas)) throw new AppError(400, 'As semanas do item devem ser uma lista.');
    const quantidades = new Map();
    for (const entrada of informadas) {
      const chave = String(entrada?.semana_inicio || '').slice(0, 10);
      const semana = porSemana.get(chave);
      if (!semana) throw new AppError(400, `A semana ${chave || '(vazia)'} não pertence ao ciclo da projeção.`);
      if (quantidades.has(chave)) throw new AppError(400, `A semana ${chave} aparece repetida no item ${item.codigo}.`);
      const dias = estaVazio(entrada.dias) ? 0 : Number(entrada.dias);
      if (typeof entrada.dias === 'boolean' || !Number.isInteger(dias) || dias < 0 || dias > semana.dias_uteis) {
        throw new AppError(
          400,
          `Os dias da semana de ${semana.sexta.split('-').reverse().join('/')} devem ser inteiros entre 0 e ${semana.dias_uteis}.`
        );
      }
      const pessoas = lerDecimal(entrada.pessoas, 'pessoas', CASAS_PESSOAS);
      quantidades.set(chave, { dias, pessoas });
    }

    let totalItem = 0n;
    const semanasItem = [];
    for (const semana of semanas) {
      const { dias, pessoas } = quantidades.get(semana.semana_inicio) || { dias: 0, pessoas: '0' };
      const centavos = centavosDaSemana({ unidade: item.unidade, preco, dias, pessoas, horasDia, diasUteisCiclo });
      totalItem += centavos;
      totaisSemanas.set(semana.semana_inicio, totaisSemanas.get(semana.semana_inicio) + centavos);
      semanasItem.push({ semana_inicio: semana.semana_inicio, dias, pessoas, centavos });
    }
    itens.push({ item, preco, horasDia, semanas: semanasItem, totalCentavos: totalItem });
  }

  const totalCentavos = dinheiro.somarCentavos(totaisSemanas.values());
  if (totalCentavos <= 0n) {
    throw new AppError(400, 'Informe ao menos uma quantidade maior que zero para calcular a projeção.');
  }
  if (totalCentavos >= dinheiro.LIMITE_CENTAVOS) throw new AppError(400, 'O total da projeção está acima do limite permitido.');
  return { diasUteis: diasUteisCiclo, itens, totaisSemanas, totalCentavos };
}

/* -------------------------------------------------------------------------- */
/* Contexto do banco                                                          */
/* -------------------------------------------------------------------------- */

async function carregarContrato(idParam) {
  const id = validarId(idParam);
  const contrato = await repo.buscarContrato(id);
  if (!contrato) throw new AppError(404, `Contrato ${id} não encontrado.`);
  return contrato;
}

/** Semanas do ciclo da referência, com os feriados personalizados do contrato. */
async function semanasDaReferencia(contratoId, referencia) {
  const { ciclo } = lerReferencia(referencia);
  const feriadosExtras = await repo.feriadosNoIntervalo(contratoId, ciclo.inicio, ciclo.fim);
  const semanas = semanasDoIntervalo(ciclo.inicio, ciclo.fim, { feriadosExtras });
  return { ciclo, semanas, diasUteis: semanas.reduce((soma, s) => soma + s.dias_uteis, 0) };
}

/**
 * Valida o payload contra o banco e calcula. Não grava.
 * `atual` = projeção em edição (mantém contrato, TAC e obra; itens desativados que já
 * estavam nela continuam aceitos).
 */
async function prepararCalculo(contrato, payload, atual = null) {
  const tacId = atual ? atual.termo_aditivo_id : lerTac(payload.termo_aditivo_id);
  if (tacId !== null && !(await repo.buscarAditivo(contrato.id, tacId))) {
    throw new AppError(404, `TAC ${tacId} não encontrado neste contrato.`);
  }
  const obraId = atual ? atual.obra_id : validarId(payload.obra_id, 'obra_id');
  const obra = await repo.buscarObra(obraId);
  if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);
  if (obra.contrato_id !== contrato.id) throw new AppError(400, 'A obra não está vinculada a este contrato.');

  const { referencia } = lerReferencia(payload.referencia ?? atual?.referencia);
  const { ciclo, semanas } = await semanasDaReferencia(contrato.id, referencia);

  const linhas = Array.isArray(payload.itens) ? payload.itens : [];
  const ids = [...new Set(linhas.map((l) => Number(l?.item_qqp_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const encontrados = ids.length ? await repo.itensDoEscopo(contrato.id, tacId ?? 0, ids) : [];
  const jaNaProjecao = new Set((atual?.itens || []).map((i) => i.item_qqp_id));
  const itensQqp = new Map(
    encontrados.filter((item) => item.ativo || jaNaProjecao.has(item.id)).map((item) => [item.id, item])
  );
  const inativo = encontrados.find((item) => !itensQqp.has(item.id));
  if (inativo) throw new AppError(400, `O item ${inativo.codigo} está desativado no QQP.`);

  const resultado = calcularGrade({ semanas, itensQqp, linhas });
  return { tacId, obra, referencia, ciclo, semanas, resultado };
}

function formatarCalculo({ referencia, ciclo, semanas, resultado }) {
  return {
    referencia,
    ciclo_inicio: iso(ciclo.inicio),
    ciclo_fim: iso(ciclo.fim),
    dias_uteis: resultado.diasUteis,
    semanas: semanas.map((s) => ({ ...s, total: dinheiro.centavosParaReais(resultado.totaisSemanas.get(s.semana_inicio)) })),
    itens: resultado.itens.map((linha) => ({
      item_qqp_id: linha.item.id,
      codigo: linha.item.codigo,
      descricao: linha.item.descricao,
      unidade: linha.item.unidade,
      preco_unitario: linha.preco,
      horas_dia: linha.horasDia,
      total: dinheiro.centavosParaReais(linha.totalCentavos),
      semanas: linha.semanas.map((s) => ({
        semana_inicio: s.semana_inicio,
        dias: s.dias,
        pessoas: s.pessoas,
        valor: dinheiro.centavosParaReais(s.centavos),
      })),
    })),
    total: dinheiro.centavosParaReais(resultado.totalCentavos),
  };
}

/** Linhas para gravar: só semanas com dias ou quantidade (as omitidas valem zero). */
function linhasParaGravar(resultado) {
  return resultado.itens.map((linha) => ({
    item_qqp_id: linha.item.id,
    preco_unitario: linha.preco,
    unidade: linha.item.unidade,
    horas_dia: linha.horasDia,
    total: dinheiro.centavosParaTexto(linha.totalCentavos),
    semanas: linha.semanas
      .filter((s) => s.dias > 0 || s.pessoas !== '0')
      .map((s) => ({
        semana_inicio: new Date(`${s.semana_inicio}T00:00:00Z`),
        dias: s.dias,
        pessoas: s.pessoas,
        valor: dinheiro.centavosParaTexto(s.centavos),
      })),
  }));
}

function formatarProjecao(projecao, semanasCiclo = null) {
  const resumo = {
    id: projecao.id,
    contrato_id: projecao.contrato_id,
    termo_aditivo_id: projecao.termo_aditivo_id,
    termo_aditivo: projecao.termo_aditivo || null,
    obra_id: projecao.obra_id,
    obra: projecao.obra
      ? { id: projecao.obra.id, ss: projecao.obra.orcamento?.ss || null, descricao: projecao.obra.orcamento?.descricao || null }
      : null,
    numero_bmm: projecao.numero_bmm,
    referencia: projecao.referencia,
    ciclo_inicio: iso(projecao.ciclo_inicio),
    ciclo_fim: iso(projecao.ciclo_fim),
    dias_uteis: projecao.dias_uteis,
    total: Number(projecao.total),
    observacao: projecao.observacao,
    usuario: projecao.usuario || null,
    created_at: projecao.created_at,
    updated_at: projecao.updated_at,
  };
  if (projecao._count) resumo.quantidade_itens = projecao._count.itens;
  if (!projecao.itens) return resumo;

  resumo.itens = projecao.itens.map((linha) => ({
    id: linha.id,
    item_qqp_id: linha.item_qqp_id,
    item: linha.item_qqp,
    preco_unitario: String(linha.preco_unitario),
    unidade: linha.unidade,
    horas_dia: textoDecimal(linha.horas_dia),
    total: Number(linha.total),
    semanas: linha.semanas.map((s) => ({
      semana_inicio: iso(s.semana_inicio),
      dias: s.dias,
      pessoas: String(Number(s.pessoas)),
      valor: Number(s.valor),
    })),
  }));
  if (semanasCiclo) resumo.semanas = semanasCiclo;
  return resumo;
}

/* -------------------------------------------------------------------------- */
/* Curva financeira                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Grava no "Projetado" da curva do contrato a soma das projeções da referência
 * (vazio quando não sobrou projeção). Não falha a gravação da projeção: devolve o resultado.
 */
async function sincronizarCurva(contratoId, referencia, usuario) {
  // Carregado aqui para evitar dependência circular no carregamento dos serviços.
  const medicaoService = require('./medicaoService');
  try {
    const contrato = await repo.buscarContrato(contratoId);
    const soma = await repo.somarDoContratoNaReferencia(contratoId, referencia);
    const novoCent = soma === null ? null : Number(dinheiro.arredondarEmCentavos(soma));
    await medicaoService.aplicarAlteracaoNaCurva({
      id: contratoId,
      contrato,
      referencia,
      campo: 'PROJETADO',
      novoCent,
      usuario,
    });
    return { referencia, atualizada: true, projetado: novoCent === null ? null : novoCent / 100 };
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return { referencia, atualizada: false, motivo: err.message };
  }
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/** GET /api/contratos/:id/ciclos/:referencia/semanas */
async function semanasDoCiclo(idParam, referenciaParam, usuario) {
  validarUsuario(usuario);
  const contrato = await carregarContrato(idParam);
  const { referencia } = lerReferencia(referenciaParam);
  const { ciclo, semanas, diasUteis } = await semanasDaReferencia(contrato.id, referencia);
  return { referencia, ciclo_inicio: iso(ciclo.inicio), ciclo_fim: iso(ciclo.fim), dias_uteis: diasUteis, semanas };
}

/** POST /api/contratos/:id/projecoes-bmm/calcular — prévia, sem gravar. */
async function calcular(idParam, payload = {}, usuario) {
  validarUsuario(usuario);
  const contrato = await carregarContrato(idParam);
  let atual = null;
  if (!estaVazio(payload.projecao_id)) {
    atual = await repo.obter(validarId(payload.projecao_id, 'projecao_id'));
    if (!atual || atual.contrato_id !== contrato.id) throw new AppError(404, 'Projeção não encontrada neste contrato.');
  }
  return formatarCalculo(await prepararCalculo(contrato, payload, atual));
}

/** GET /api/contratos/:id/projecoes-bmm?referencia=&obra=&tac= */
async function listar(idParam, filtros = {}, usuario) {
  validarUsuario(usuario);
  const contrato = await carregarContrato(idParam);
  const where = { contrato_id: contrato.id };
  if (!estaVazio(filtros.referencia)) where.referencia = lerReferencia(filtros.referencia).referencia;
  if (!estaVazio(filtros.obra)) where.obra_id = validarId(filtros.obra, 'obra');
  if (!estaVazio(filtros.tac) && String(filtros.tac) !== 'todos') where.termo_aditivo_id = lerTac(filtros.tac);
  const lista = await repo.listar(where);
  return lista.map((p) => formatarProjecao(p));
}

async function carregarProjecao(idParam) {
  const id = validarId(idParam);
  const projecao = await repo.obter(id);
  if (!projecao) throw new AppError(404, `Projeção ${id} não encontrada.`);
  return projecao;
}

/** GET /api/projecoes-bmm/:id — com todas as semanas do ciclo. */
async function obter(idParam, usuario) {
  validarUsuario(usuario);
  const projecao = await carregarProjecao(idParam);
  const { semanas } = await semanasDaReferencia(projecao.contrato_id, projecao.referencia);
  return formatarProjecao(projecao, semanas);
}

function erroDeDuplicidade(err, numeroBmm, referencia) {
  if (err?.code === 'P2002') {
    return new AppError(409, `Já existe a projeção do BMM ${numeroBmm} em ${referencia} para esta obra.`);
  }
  return err;
}

function cabecalhoDe(calculo, payload, contratoId) {
  return {
    contrato_id: contratoId,
    termo_aditivo_id: calculo.tacId,
    obra_id: calculo.obra.id,
    referencia: calculo.referencia,
    ciclo_inicio: calculo.ciclo.inicio,
    ciclo_fim: calculo.ciclo.fim,
    dias_uteis: calculo.resultado.diasUteis,
    total: dinheiro.centavosParaTexto(calculo.resultado.totalCentavos),
    observacao: estaVazio(payload.observacao) ? null : String(payload.observacao).trim(),
  };
}

/** POST /api/contratos/:id/projecoes-bmm */
async function criar(idParam, payload = {}, usuario) {
  validarUsuario(usuario);
  const contrato = await carregarContrato(idParam);
  const numeroBmm = lerNumeroBmm(payload.numero_bmm);
  const calculo = await prepararCalculo(contrato, payload);
  exigirEdicaoNaObra(usuario, calculo.obra);

  let id;
  try {
    id = await repo.criar(
      { ...cabecalhoDe(calculo, payload, contrato.id), numero_bmm: numeroBmm, usuario_id: Number.isInteger(usuario.id) ? usuario.id : null },
      linhasParaGravar(calculo.resultado)
    );
  } catch (err) {
    throw erroDeDuplicidade(err, numeroBmm, calculo.referencia);
  }
  const curva = [await sincronizarCurva(contrato.id, calculo.referencia, usuario)];
  return { ...(await obter(id, usuario)), curva };
}

/** PUT /api/projecoes-bmm/:id — contrato, TAC e obra ficam os originais. */
async function atualizar(idParam, payload = {}, usuario) {
  validarUsuario(usuario);
  const atual = await carregarProjecao(idParam);
  const obraAtual = await repo.buscarObra(atual.obra_id);
  exigirEdicaoNaObra(usuario, obraAtual);
  if (!estaVazio(payload.termo_aditivo_id) && lerTac(payload.termo_aditivo_id) !== atual.termo_aditivo_id) {
    throw new AppError(400, 'A edição mantém o contrato/TAC original da projeção.');
  }
  if (!estaVazio(payload.obra_id) && Number(payload.obra_id) !== atual.obra_id) {
    throw new AppError(400, 'A edição mantém a obra original da projeção.');
  }
  const contrato = await repo.buscarContrato(atual.contrato_id);
  const numeroBmm = estaVazio(payload.numero_bmm) ? atual.numero_bmm : lerNumeroBmm(payload.numero_bmm);
  const calculo = await prepararCalculo(contrato, payload, atual);

  try {
    await repo.substituir(atual.id, { ...cabecalhoDe(calculo, payload, contrato.id), numero_bmm: numeroBmm }, linhasParaGravar(calculo.resultado));
  } catch (err) {
    throw erroDeDuplicidade(err, numeroBmm, calculo.referencia);
  }
  const referencias = [...new Set([atual.referencia, calculo.referencia])];
  const curva = [];
  for (const referencia of referencias) curva.push(await sincronizarCurva(contrato.id, referencia, usuario));
  return { ...(await obter(atual.id, usuario)), curva };
}

/** DELETE /api/projecoes-bmm/:id (ADMIN). */
async function excluir(idParam, usuario) {
  validarUsuario(usuario);
  if (!PERFIS_QUE_EXCLUEM.includes(usuario.perfil)) {
    throw new AppError(403, 'Apenas ADMIN pode excluir projeções de BMM.');
  }
  const atual = await carregarProjecao(idParam);
  await repo.excluir(atual.id);
  const curva = [await sincronizarCurva(atual.contrato_id, atual.referencia, usuario)];
  return { id: atual.id, excluido: true, curva };
}

/**
 * POST /api/projecoes-bmm/:id/copiar — rascunho a partir de uma projeção anterior (não grava).
 * Corpo: { referencia, numero_bmm? }. Semanas casadas por ordem, dias limitados aos dias
 * úteis da nova semana, preços atuais do QQP; itens desativados ficam de fora (avisados).
 * O rascunho volta calculado e pronto para o POST de criação.
 */
async function copiarDe(origemIdParam, destino = {}, usuario) {
  validarUsuario(usuario);
  const origem = await carregarProjecao(origemIdParam);
  const { referencia } = lerReferencia(destino.referencia);
  const contrato = await repo.buscarContrato(origem.contrato_id);
  const { semanas } = await semanasDaReferencia(contrato.id, referencia);

  const ids = origem.itens.map((linha) => linha.item_qqp_id);
  const vigentes = new Map(
    (await repo.itensDoEscopo(contrato.id, origem.termo_aditivo_id ?? 0, ids)).filter((i) => i.ativo).map((i) => [i.id, i])
  );
  // Semanas da origem em ordem (segundas-feiras): a 1ª semana da origem vai para a 1ª do novo ciclo, e assim por diante.
  const porOrdem = semanasDoIntervalo(origem.ciclo_inicio, origem.ciclo_fim).map((s) => s.semana_inicio);
  const avisos = [];
  const itens = [];
  for (const linha of origem.itens) {
    if (!vigentes.has(linha.item_qqp_id)) {
      avisos.push(`O item ${linha.item_qqp?.codigo || linha.item_qqp_id} está desativado no QQP e não foi copiado.`);
      continue;
    }
    const semanasOrigem = new Map(linha.semanas.map((s) => [iso(s.semana_inicio), s]));
    const copiadas = [];
    semanas.forEach((semana, indice) => {
      const valor = semanasOrigem.get(porOrdem[indice]);
      if (!valor) return;
      copiadas.push({
        semana_inicio: semana.semana_inicio,
        dias: Math.min(valor.dias, semana.dias_uteis),
        pessoas: String(Number(valor.pessoas)),
      });
    });
    itens.push({ item_qqp_id: linha.item_qqp_id, horas_dia: textoDecimal(linha.horas_dia), semanas: copiadas });
  }

  const rascunho = {
    obra_id: origem.obra_id,
    termo_aditivo_id: origem.termo_aditivo_id,
    numero_bmm: estaVazio(destino.numero_bmm) ? '' : String(destino.numero_bmm).trim(),
    referencia,
    itens,
  };
  let calculo = null;
  try {
    calculo = formatarCalculo(await prepararCalculo(contrato, rascunho));
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    avisos.push(err.message);
  }
  return { origem_id: origem.id, rascunho, calculo, avisos };
}

/* -------------------------------------------------------------------------- */
/* Feriados personalizados                                                    */
/* -------------------------------------------------------------------------- */

function lerData(valor) {
  const texto = String(valor || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new AppError(400, 'O campo "data" deve estar no formato AAAA-MM-DD.');
  const data = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || iso(data) !== texto) throw new AppError(400, 'O campo "data" não é uma data válida.');
  return data;
}

function formatarFeriado(f) {
  return { id: f.id, data: iso(f.data), nome: f.nome, contrato_id: f.contrato_id, contrato: f.contrato || null };
}

/** GET /api/feriados?ano=&contrato= */
async function listarFeriados(filtros = {}, usuario) {
  validarUsuario(usuario);
  const where = {};
  if (!estaVazio(filtros.ano)) {
    const ano = validarId(filtros.ano, 'ano');
    where.data = { gte: new Date(Date.UTC(ano, 0, 1)), lte: new Date(Date.UTC(ano, 11, 31)) };
  }
  if (!estaVazio(filtros.contrato)) {
    where.OR = [{ contrato_id: null }, { contrato_id: validarId(filtros.contrato, 'contrato') }];
  }
  return (await repo.listarFeriados(where)).map(formatarFeriado);
}

async function dadosDoFeriado(payload) {
  if (estaVazio(payload.nome)) throw new AppError(400, 'O campo "nome" é obrigatório.');
  const nome = String(payload.nome).trim();
  if (nome.length > 120) throw new AppError(400, 'O campo "nome" aceita no máximo 120 caracteres.');
  const contratoId = estaVazio(payload.contrato_id) ? null : validarId(payload.contrato_id, 'contrato_id');
  if (contratoId !== null) await carregarContrato(contratoId);
  return { data: lerData(payload.data), nome, contrato_id: contratoId };
}

function exigirGestor(usuario) {
  validarUsuario(usuario);
  if (!PERFIS_GESTORES.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${PERFIS_GESTORES.join(' ou ')} podem gerir feriados.`);
  }
}

/** POST /api/feriados */
async function criarFeriado(payload = {}, usuario) {
  exigirGestor(usuario);
  const dados = await dadosDoFeriado(payload);
  if (await repo.existeFeriado(dados)) throw new AppError(409, 'Este feriado já está cadastrado.');
  const feriado = await repo.criarFeriado({ ...dados, usuario_id: Number.isInteger(usuario.id) ? usuario.id : null });
  return formatarFeriado(feriado);
}

/** PUT /api/feriados/:id */
async function atualizarFeriado(idParam, payload = {}, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);
  if (!(await repo.buscarFeriado(id))) throw new AppError(404, `Feriado ${id} não encontrado.`);
  const dados = await dadosDoFeriado(payload);
  if (await repo.existeFeriado(dados, id)) throw new AppError(409, 'Este feriado já está cadastrado.');
  return formatarFeriado(await repo.atualizarFeriado(id, dados));
}

/** DELETE /api/feriados/:id */
async function excluirFeriado(idParam, usuario) {
  exigirGestor(usuario);
  const id = validarId(idParam);
  if (!(await repo.excluirFeriado(id))) throw new AppError(404, `Feriado ${id} não encontrado.`);
  return { id, excluido: true };
}

module.exports = {
  PERFIS_QUE_PROJETAM,
  PERFIS_QUE_EXCLUEM,
  PERFIS_GESTORES,
  calcularGrade,
  centavosDaSemana,
  semanasDoCiclo,
  calcular,
  listar,
  obter,
  criar,
  atualizar,
  excluir,
  copiarDe,
  listarFeriados,
  criarFeriado,
  atualizarFeriado,
  excluirFeriado,
};
