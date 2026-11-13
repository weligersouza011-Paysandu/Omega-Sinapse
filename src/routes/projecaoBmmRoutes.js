'use strict';

const { Router } = require('express');
const controller = require('../controllers/projecaoBmmController');
const { autorizar } = require('../middlewares/auth');
const { PERFIS_QUE_PROJETAM, PERFIS_QUE_EXCLUEM, PERFIS_GESTORES } = require('../services/projecaoBmmService');

/**
 * Projeções de BMM (receita prevista por obra e ciclo) e feriados personalizados.
 * Leitura para qualquer perfil autenticado. Cadastro e edição: ADMIN/SUPERVISOR em
 * qualquer obra, PLANEJADOR nas suas obras (conferido no service). Exclusão: ADMIN.
 */
const projecoes = Router();

// GET    /api/projecoes-bmm/:id          -> projeção com itens e todas as semanas do ciclo
projecoes.get('/:id', controller.obter);
// PUT    /api/projecoes-bmm/:id          -> { numero_bmm?, referencia?, observacao?, itens } (mantém contrato/TAC/obra)
projecoes.put('/:id', autorizar(...PERFIS_QUE_PROJETAM), controller.atualizar);
// DELETE /api/projecoes-bmm/:id
projecoes.delete('/:id', autorizar(...PERFIS_QUE_EXCLUEM), controller.excluir);
// POST   /api/projecoes-bmm/:id/copiar   -> { referencia, numero_bmm? } rascunho calculado (não grava)
projecoes.post('/:id/copiar', autorizar(...PERFIS_QUE_PROJETAM), controller.copiar);

// POST   /api/projecoes-bmm/:id/solicitar-exclusao -> { motivo } (quem não é ADMIN pede; o ADMIN decide)
projecoes.post('/:id/solicitar-exclusao', autorizar(...PERFIS_QUE_PROJETAM), controller.solicitarExclusao);

const solicitacoes = Router();
// POST   /api/solicitacoes-exclusao/:id/decidir -> { aprovar: true|false, motivo? } (ADMIN; recusa exige motivo)
solicitacoes.post('/:id/decidir', autorizar(...PERFIS_QUE_EXCLUEM), controller.decidirSolicitacao);

const feriados = Router();

// GET    /api/feriados?ano=&contrato=   -> globais (+ os do contrato, se informado)
feriados.get('/', controller.listarFeriados);
// POST   /api/feriados                   -> { data: AAAA-MM-DD, nome, contrato_id? }
feriados.post('/', autorizar(...PERFIS_GESTORES), controller.criarFeriado);
feriados.put('/:id', autorizar(...PERFIS_GESTORES), controller.atualizarFeriado);
feriados.delete('/:id', autorizar(...PERFIS_GESTORES), controller.excluirFeriado);

module.exports = { projecoes, feriados, solicitacoes };
