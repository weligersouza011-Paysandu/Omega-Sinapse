'use strict';

const { Router } = require('express');
const obraController = require('../controllers/obraController');
const obraDetalheController = require('../controllers/obraDetalheController');
const dashboardController = require('../controllers/dashboardController');
const curvaSController = require('../controllers/curvaSController');
const lookaheadController = require('../controllers/lookaheadController');
const { autorizar } = require('../middlewares/auth');

const router = Router();

// GET    /api/obras            -> lista as obras (projetos em execução)
router.get('/', obraController.listarObras);

// GET    /api/obras/planejadores -> técnicos planejadores ativos (atribuição)
// Declarada antes de "/:id" para não ser capturada pelo parâmetro de rota.
router.get('/planejadores', autorizar('SUPERVISOR', 'ADMIN'), obraController.listarPlanejadores);

// GET    /api/obras/localizacoes-referencia?excluir_obra= -> pontos das demais obras (consulta no mapa)
router.get('/localizacoes-referencia', obraController.listarLocalizacoesReferencia);

/* ------------------------- Detalhamento da obra --------------------------- */
// Curva S consolidada (Previsto × Real × Tendência) e indicadores de prazo.
// GET /api/obras/:id/curva-s?versao_id=&comparar=linha_base|nenhum&base_id=
router.get('/:id/curva-s', curvaSController.obterCurvaS);
// Caminho crítico (CPM) da versão mais recente do cronograma.
// GET /api/obras/:id/caminho-critico?versao_id=&prazo=projeto|contratual&todas=true
router.get('/:id/caminho-critico', curvaSController.obterCaminhoCritico);

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

// Lookahead 6 semanas (6WLA) sobre a versão mais recente do cronograma.
// GET /api/obras/:id/lookahead?data_referencia=AAAA-MM-DD&versao_id=
router.get('/:id/lookahead', lookaheadController.obterLookahead);
router.post('/:id/lookahead/restricoes', lookaheadController.salvarRestricao);

// Carga de trabalho por função (MOD, MOI, equipamentos), HH e gargalos do lookahead.
// GET /api/obras/:id/carga-trabalho?versao_id=&data_referencia=AAAA-MM-DD&horas_por_dia=8.8
router.get('/:id/carga-trabalho', lookaheadController.obterCargaTrabalho);

// Exportação .xlsx da programação do lookahead para o RDO / diário de campo.
// GET /api/obras/:id/exportar-rdo?semana=1|1,2&de=AAAA-MM-DD&ate=AAAA-MM-DD&versao_id=
router.get('/:id/exportar-rdo', lookaheadController.exportarRdo);

// Relatório executivo (PDF) das restrições do lookahead, por semana e frente de serviço.
// GET /api/obras/:id/exportar-restricoes-pdf?semana=1|1,2&data_referencia=AAAA-MM-DD&versao_id=&baixadas=true
router.get('/:id/exportar-restricoes-pdf', lookaheadController.exportarRestricoesPdf);

// Restrições: com `atividade_id`/`codigo_atividade`/`id` UUID no corpo, cadastra ou
// atualiza a restrição da atividade do cronograma; sem eles, cria a restrição da
// tabela do Dashboard de Planejamento (comportamento anterior).
router.post('/:id/restricoes', lookaheadController.criarOuAtualizarRestricao);
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
