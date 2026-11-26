'use strict';

const { Router } = require('express');
const service = require('../services/programacaoService');
const { autorizar } = require('../middlewares/auth');
const { uploadPlanilhaProgramacao } = require('../config/multer');

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

/** Programação S+1 é do planejamento: Planejador, Supervisor e Admin. */
const PERFIS_PROGRAMACAO = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

const router = Router();
router.use(autorizar(...PERFIS_PROGRAMACAO));

// Apoio: obras em andamento (para vincular uma frente) e o efetivo do contrato.
router.get('/obras', acao(() => service.listarObras()));
router.get('/efetivo', acao((req) => service.listarEfetivo({ todos: ['1', 'true'].includes(String(req.query?.todos || '')) })));
// Efetivo do contrato: mobilizar (nova pessoa ou volta), desmobilizar e situação (disponível/indisponível).
router.post('/efetivo/mobilizar', acao((req) => service.mobilizarColaborador(req.body || {}), 201));
router.post('/efetivo/:id/desmobilizar', acao((req) => service.desmobilizarColaborador(req.params.id, req.body || {})));
// Atualiza o efetivo do contrato pela aba "EFETIVO A DISTRIBUIR" da planilha (multipart: arquivo .xlsx).
router.post('/efetivo/importar', uploadPlanilhaProgramacao, acao((req) => service.importarEfetivo(req.file)));
router.put('/efetivo/:id', acao((req) => service.atualizarColaboradorEfetivo(req.params.id, req.body || {})));
// Funções de planejamento: lista e nova função (Planejador/Admin).
router.get('/funcoes', acao(() => service.listarFuncoes()));
router.post('/funcoes', acao((req) => service.criarFuncao(req.body || {}, req.user), 201));

// Detalhamento da obra: programação e efetivo nominal de uma obra (?recorte=proxima|atual|ultima ou ?programacao_id=).
router.get('/por-obra/:obraId', acao((req) => service.programacaoDaObra(req.params.obraId, req.query || {})));

// Início da reunião: nova semana copiando a anterior.
router.post('/proxima', acao((req) => service.criarProxima(req.user), 201));

// Importação da planilha da reunião (multipart: arquivo .xlsx, substituir?).
router.post('/importar', uploadPlanilhaProgramacao, acao((req) => service.importar(req.file, req.body || {}, req.user), 201));

// Frentes, equipes e pessoas (rotas por id do próprio item).
router.put('/frentes/:id', acao((req) => service.atualizarFrente(req.params.id, req.body || {})));
router.delete('/frentes/:id', acao((req) => service.excluirFrente(req.params.id)));
router.post('/frentes/:id/equipes', acao((req) => service.criarEquipe(req.params.id, req.body || {}), 201));
router.put('/equipes/:id', acao((req) => service.atualizarEquipe(req.params.id, req.body || {})));
router.delete('/equipes/:id', acao((req) => service.excluirEquipe(req.params.id)));
router.post('/equipes/:id/alocacoes', acao((req) => service.criarAlocacao(req.params.id, req.body || {}), 201));
// Atividades programadas da equipe (linha do cronograma da obra ou texto) e o cronograma da obra.
router.get('/cronograma/:obraId', acao((req) => service.cronogramaDaObra(req.params.obraId)));
router.post('/equipes/:id/atividades', acao((req) => service.criarItemAtividade(req.params.id, req.body || {}), 201));
router.put('/atividades/:id', acao((req) => service.atualizarItemAtividade(req.params.id, req.body || {})));
router.delete('/atividades/:id', acao((req) => service.excluirItemAtividade(req.params.id)));
router.put('/alocacoes/:id', acao((req) => service.atualizarAlocacao(req.params.id, req.body || {})));
router.delete('/alocacoes/:id', acao((req) => service.excluirAlocacao(req.params.id)));

// Programações semanais.
router.get('/', acao(() => service.listar()));
router.post('/', acao((req) => service.criar(req.body || {}, req.user), 201));
router.get('/:id', acao((req) => service.obter(req.params.id)));
router.put('/:id', acao((req) => service.atualizar(req.params.id, req.body || {})));
router.delete('/:id', acao((req) => service.excluir(req.params.id, req.user)));
router.post('/:id/emitir', acao((req) => service.emitir(req.params.id)));
router.post('/:id/revisao', acao((req) => service.novaRevisao(req.params.id)));
// Efetivo nominal: cadastra quem foi programado e ainda não está no efetivo e liga as pessoas ao cadastro.
router.post('/:id/sincronizar-efetivo', acao((req) => service.sincronizarEfetivo(req.params.id)));
router.post('/:id/frentes', acao((req) => service.criarFrente(req.params.id, req.body || {}), 201));
// Exportação .xlsx no layout da reunião.
router.get('/:id/exportar', async (req, res, next) => {
  try {
    const { nome, conteudo } = await service.exportar(req.params.id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(nome)}"`,
      'Cache-Control': 'no-store',
    });
    return res.send(conteudo);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
