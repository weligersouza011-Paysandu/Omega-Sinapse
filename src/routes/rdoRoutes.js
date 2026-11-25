'use strict';

const { Router } = require('express');
const rdoService = require('../services/rdoService');
const cadastroService = require('../services/rdoCadastroService');
const { autorizar } = require('../middlewares/auth');
const upload = require('../config/multer');
const { gerarPdfDoRdo } = require('../services/rdoPdfService');

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

const PERFIS_RDO = ['ENCARREGADO', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

/* ----------------------------- RDO (/api/rdos) ----------------------------- */
const rdos = Router();
rdos.use(autorizar(...PERFIS_RDO));

// Apoio ao formulário: obras do escopo do usuário e atividades vigentes (com o % vigente).
rdos.get('/obras', acao((req) => rdoService.listarObras(req.user)));
rdos.get('/obras/:obraId/resumo', acao((req) => rdoService.resumoDaObra(req.params.obraId, req.query || {}, req.user)));
// Programação S+1 da obra no dia: efetivo programado e supervisor sugerido (?data=AAAA-MM-DD).
rdos.get('/obras/:obraId/programacao', acao((req) => rdoService.programacaoDoDia(req.params.obraId, req.query || {}, req.user)));
rdos.get('/obras/:obraId/atividades', acao((req) => rdoService.listarAtividadesDaObra(req.params.obraId, req.user)));

// Controle de fotos (todas as fotos de evidência, com filtros).
rdos.get('/fotos', acao((req) => rdoService.listarFotos(req.query || {}, req.user)));

rdos.get('/', acao((req) => rdoService.listar(req.query || {}, req.user)));
rdos.post('/', acao((req) => rdoService.criar(req.body || {}, req.user), 201));
rdos.get('/:id', acao((req) => rdoService.obter(req.params.id, req.user)));
// PDF do RDO (mesma regra de acesso da consulta).
rdos.get('/:id/pdf', async (req, res, next) => {
  try {
    const rdo = await rdoService.obter(req.params.id, req.user);
    const pdf = await gerarPdfDoRdo(rdo);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="RDO-${rdo.id}.pdf"`, 'Cache-Control': 'no-store' });
    return res.send(pdf);
  } catch (err) {
    return next(err);
  }
});
rdos.put('/:id', acao((req) => rdoService.atualizar(req.params.id, req.body || {}, req.user)));
rdos.delete('/:id', acao((req) => rdoService.excluir(req.params.id, req.user)));

// Fluxo: finalizar (encarregado assina) → aprovar | devolver (planejador).
rdos.post('/:id/finalizar', acao((req) => rdoService.finalizar(req.params.id, req.user)));
rdos.post('/:id/aprovar', acao((req) => rdoService.aprovar(req.params.id, req.body || {}, req.user)));
rdos.post('/:id/devolver', acao((req) => rdoService.devolver(req.params.id, req.body || {}, req.user)));

// Fotos de evidência (uma por requisição, campo "foto").
rdos.post(
  '/:id/atividades/:atividadeId/fotos',
  upload.single('foto'),
  acao((req) => rdoService.adicionarFoto(req.params.id, req.params.atividadeId, req.file, req.body || {}, req.user), 201)
);
rdos.delete('/:id/fotos/:fotoId', acao((req) => rdoService.removerFoto(req.params.id, req.params.fotoId, req.user)));

/* --------------------- Cadastros (/api/rdo-cadastros) --------------------- */
const cadastros = Router();
cadastros.use(autorizar(...PERFIS_RDO));

// Declaradas antes de "/:tipo" para não serem capturadas pelo parâmetro.
cadastros.get('/supervisores', acao(() => rdoService.listarSupervisores()));
cadastros.get('/encarregados', acao((req) => cadastroService.listarEncarregados(req.user)));
cadastros.put('/encarregados/:usuarioId/obras', acao((req) => cadastroService.definirObrasDoEncarregado(req.params.usuarioId, req.body || {}, req.user)));

cadastros.get('/:tipo', acao((req) => cadastroService.listar(req.params.tipo, req.query || {})));
cadastros.post('/:tipo', acao((req) => cadastroService.criar(req.params.tipo, req.body || {}, req.user), 201));
cadastros.put('/:tipo/:id', acao((req) => cadastroService.atualizar(req.params.tipo, req.params.id, req.body || {}, req.user)));

module.exports = { rdos, cadastros };
