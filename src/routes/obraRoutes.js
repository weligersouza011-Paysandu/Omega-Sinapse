'use strict';

const { Router } = require('express');
const obraController = require('../controllers/obraController');
const obraDetalheController = require('../controllers/obraDetalheController');
const dashboardController = require('../controllers/dashboardController');
const { autorizar } = require('../middlewares/auth');

const router = Router();

// GET    /api/obras            -> lista as obras (projetos em execução)
router.get('/', obraController.listarObras);

// GET    /api/obras/planejadores -> técnicos planejadores ativos (atribuição)
// Declarada antes de "/:id" para não ser capturada pelo parâmetro de rota.
router.get('/planejadores', autorizar('SUPERVISOR', 'ADMIN'), obraController.listarPlanejadores);

/* ------------------------- Detalhamento da obra --------------------------- */
// Localizações (pontos geográficos e trechos por quilometragem).
router.post('/:id/localizacoes', obraDetalheController.criarLocalizacao);
router.put('/:id/localizacoes/:localizacaoId', obraDetalheController.atualizarLocalizacao);
router.delete('/:id/localizacoes/:localizacaoId', obraDetalheController.removerLocalizacao);

// Avanço físico semanal (base da Curva S).
router.post('/:id/avanco-fisico', obraDetalheController.criarAvanco);
router.put('/:id/avanco-fisico/:avancoId', obraDetalheController.atualizarAvanco);
router.delete('/:id/avanco-fisico/:avancoId', obraDetalheController.removerAvanco);

// Relatórios Diários de Obra (RDO).
router.post('/:id/relatorios', obraDetalheController.criarRelatorio);
router.put('/:id/relatorios/:relatorioId', obraDetalheController.atualizarRelatorio);
router.delete('/:id/relatorios/:relatorioId', obraDetalheController.removerRelatorio);

// Lista de tarefas / atividades.
router.post('/:id/atividades', obraDetalheController.criarAtividade);
router.put('/:id/atividades/:atividadeId', obraDetalheController.atualizarAtividade);
router.delete('/:id/atividades/:atividadeId', obraDetalheController.removerAtividade);

// Ocorrências.
router.post('/:id/ocorrencias', obraDetalheController.criarOcorrencia);
router.delete('/:id/ocorrencias/:ocorrenciaId', obraDetalheController.removerOcorrencia);

// Comentários.
router.post('/:id/comentarios', obraDetalheController.criarComentario);
router.delete('/:id/comentarios/:comentarioId', obraDetalheController.removerComentario);

// Fotos e vídeos.
router.post('/:id/midias', obraDetalheController.criarMidia);
router.delete('/:id/midias/:midiaId', obraDetalheController.removerMidia);

// Restrições 6WLA (tabela do Dashboard de Planejamento).
router.post('/:id/restricoes', dashboardController.criarRestricao);
router.put('/:id/restricoes/:restricaoId', dashboardController.atualizarRestricao);
router.delete('/:id/restricoes/:restricaoId', dashboardController.removerRestricao);

// GET    /api/obras/:id        -> detalhe da obra (projeto, fiscais, revisões,
// localizações, avanço físico e RDOs)
router.get('/:id', obraController.obterObra);

// PUT    /api/obras/:id        -> status operacional, planejador, Ata e observações
// (o RBAC por campo é validado no service: planejador_id só para SUPERVISOR/ADMIN)
router.put('/:id', obraController.atualizarObra);

// POST   /api/obras/:id/osi    -> registra a emissão da OSI
router.post('/:id/osi', obraController.registrarOsi);

module.exports = router;
