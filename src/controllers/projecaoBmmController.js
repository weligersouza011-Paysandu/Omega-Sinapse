'use strict';

const service = require('../services/projecaoBmmService');

/** Envolve um caso de uso assíncrono no contrato de resposta do Express. */
function acao(metodo, status = 200) {
  return async (req, res, next) => {
    try {
      return res.status(status).json(await metodo(req));
    } catch (err) {
      return next(err);
    }
  };
}

/* ----------------------------- Projeções de BMM ----------------------------- */

const listar = acao((req) => service.listar(req.params.id, req.query || {}, req.user));
const calcular = acao((req) => service.calcular(req.params.id, req.body || {}, req.user));
const criar = acao((req) => service.criar(req.params.id, req.body || {}, req.user), 201);
const semanasDoCiclo = acao((req) => service.semanasDoCiclo(req.params.id, req.params.referencia, req.user));
const obter = acao((req) => service.obter(req.params.id, req.user));
const atualizar = acao((req) => service.atualizar(req.params.id, req.body || {}, req.user));
const excluir = acao((req) => service.excluir(req.params.id, req.user));
const copiar = acao((req) => service.copiarDe(req.params.id, req.body || {}, req.user));

/* ------------------------------ Feriados personalizados ------------------------------ */

const listarFeriados = acao((req) => service.listarFeriados(req.query || {}, req.user));
const criarFeriado = acao((req) => service.criarFeriado(req.body || {}, req.user), 201);
const atualizarFeriado = acao((req) => service.atualizarFeriado(req.params.id, req.body || {}, req.user));
const excluirFeriado = acao((req) => service.excluirFeriado(req.params.id, req.user));

module.exports = {
  listar,
  calcular,
  criar,
  semanasDoCiclo,
  obter,
  atualizar,
  excluir,
  copiar,
  listarFeriados,
  criarFeriado,
  atualizarFeriado,
  excluirFeriado,
};
