'use strict';

const orcamentoService = require('../services/orcamentoService');

/**
 * POST /api/orcamentos
 * Cria um orçamento (e sua revisão inicial Rev 00).
 */
async function criarOrcamento(req, res, next) {
  try {
    const orcamento = await orcamentoService.criarOrcamento(req.body, req.user);
    return res.status(201).json(orcamento);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orcamentos
 * Lista orçamentos com paginação e filtros opcionais
 * (?status=&pep=&busca=&escopo=&page=&limit=). `escopo=comercial` (padrão)
 * limita a listagem ao ciclo do orçamentista, `escopo=obras` traz apenas as
 * etapas de execução (aprovado em diante) e `escopo=todos` devolve tudo.
 */
async function listarOrcamentos(req, res, next) {
  try {
    const resultado = await orcamentoService.listarOrcamentos(req.query);
    return res.status(200).json(resultado);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orcamentos/opcoes
 * Lista os PEPs e fiscais já usados no histórico (para dropdowns do formulário).
 */
async function listarOpcoes(req, res, next) {
  try {
    const opcoes = await orcamentoService.listarOpcoes();
    return res.status(200).json(opcoes);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orcamentos/estatisticas
 * Indicadores agregados do Dashboard BI (?de=&ate=&busca=).
 */
async function obterEstatisticas(req, res, next) {
  try {
    const estatisticas = await orcamentoService.obterEstatisticas(req.query);
    return res.status(200).json(estatisticas);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orcamentos/:id
 * Retorna um orçamento com seu histórico de revisões.
 */
async function obterOrcamentoPorId(req, res, next) {
  try {
    const orcamento = await orcamentoService.obterOrcamentoPorId(req.params.id);
    return res.status(200).json(orcamento);
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/orcamentos/:id
 * Atualiza os dados permitidos do orçamento.
 * Se o valor mudar, exige `observacao` e gera nova revisão.
 */
async function atualizarOrcamento(req, res, next) {
  try {
    const orcamento = await orcamentoService.atualizarOrcamento(req.params.id, req.body, req.user);
    return res.status(200).json(orcamento);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/orcamentos/:id/revisoes
 * Registra uma nova revisão de valor (Rev N).
 */
async function adicionarRevisao(req, res, next) {
  try {
    const resultado = await orcamentoService.adicionarRevisao(req.params.id, req.body, req.user);
    return res.status(201).json(resultado);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  criarOrcamento,
  listarOrcamentos,
  listarOpcoes,
  obterEstatisticas,
  obterOrcamentoPorId,
  atualizarOrcamento,
  adicionarRevisao,
};
