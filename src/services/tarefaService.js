'use strict';

const AppError = require('../errors/AppError');
const tarefaRepository = require('../repositories/tarefaRepository');
const usuarioRepository = require('../repositories/usuarioRepository');
const obraRepository = require('../repositories/obraRepository');

/* -------------------------------------------------------------------------- */
/* Domínio                                                                    */
/* -------------------------------------------------------------------------- */

const TIPOS = ['FIXA_RECORRENTE', 'AVULSA'];
const STATUS = ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];
const STATUS_ATIVOS = ['A_FAZER', 'EM_ANDAMENTO'];
const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];

/** Dia da semana → índice de Date#getUTCDay (0 = domingo). */
const DIAS_SEMANA = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};

/** Gestores mantêm tarefas de qualquer colaborador; os demais, só as próprias. */
const PERFIS_GESTORES = ['SUPERVISOR', 'ADMIN'];

/** Perfis que compõem a equipe no painel de carga (além de quem já tem tarefas). */
const PERFIS_EQUIPE = ['PLANEJADOR', 'SUPERVISOR'];

/**
 * Fuso operacional da equipe (Brasília, sem horário de verão desde 2019).
 * Datas informadas sem hora vencem no fim do dia local, independentemente do
 * fuso do servidor (o Render roda em UTC).
 */
const FUSO = '-03:00';
const FUSO_OFFSET_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Antecedência em que uma tarefa ativa passa ao farol amarelo. */
const JANELA_ALERTA_MS = 48 * 60 * 60 * 1000;

const LIMITE_PADRAO = 100;
const LIMITE_MAXIMO = 500;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

/**
 * Lê um campo aceitando snake_case (padrão da API) ou camelCase.
 * @returns {{presente:boolean, valor:any}}
 */
function lerCampo(payload, snake, camel) {
  if (Object.prototype.hasOwnProperty.call(payload, snake)) {
    return { presente: true, valor: payload[snake] };
  }
  if (camel && Object.prototype.hasOwnProperty.call(payload, camel)) {
    return { presente: true, valor: payload[camel] };
  }
  return { presente: false, valor: undefined };
}

function limparTexto(valor, limite) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  return limite ? texto.slice(0, limite) : texto;
}

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

function validarEnum(valor, aceitos, rotulo) {
  const normalizado = String(valor ?? '').trim().toUpperCase();
  if (!aceitos.includes(normalizado)) {
    throw new AppError(400, `${rotulo} inválido. Valores aceitos: ${aceitos.join(', ')}.`);
  }
  return normalizado;
}

/** "aaaa-mm-dd" de hoje no fuso operacional. */
function hojeLocal(agora) {
  return new Date(agora.getTime() + FUSO_OFFSET_MS).toISOString().slice(0, 10);
}

function inicioDoDia(data) {
  return new Date(`${data}T00:00:00.000${FUSO}`);
}

function fimDoDia(data) {
  return new Date(`${data}T23:59:59.999${FUSO}`);
}

/**
 * Converte o vencimento informado. Datas puras ("2026-11-07") vencem às
 * 23:59:59.999 do dia no fuso operacional; datas com hora são respeitadas.
 */
function lerDataVencimento(valor) {
  const texto = String(valor ?? '').trim();
  if (REGEX_DATA.test(texto)) {
    const data = fimDoDia(texto);
    if (!Number.isNaN(data.getTime())) return data;
  } else if (texto) {
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) return data;
  }
  throw new AppError(400, 'Data de vencimento inválida: informe uma data válida (aaaa-mm-dd).');
}

/** Filtro de período: "de" no início do dia e "ate" no fim do dia. */
function lerDataFiltro(valor, campo, limite) {
  if (estaVazio(valor)) return undefined;
  const texto = String(valor).trim();
  if (REGEX_DATA.test(texto)) {
    const data = limite === 'inicio' ? inicioDoDia(texto) : fimDoDia(texto);
    if (!Number.isNaN(data.getTime())) return data;
  } else {
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) return data;
  }
  throw new AppError(400, `O parâmetro "${campo}" deve ser uma data válida (aaaa-mm-dd).`);
}

/**
 * Próximo vencimento de uma rotina semanal: o dia da semana escolhido, no fim
 * do dia local. Com `estrita`, a data nunca é o próprio dia de referência
 * (usado ao agendar a ocorrência seguinte de uma rotina concluída).
 */
function proximoVencimento(diaRecorrencia, referencia, { estrita = false } = {}) {
  const hoje = hojeLocal(referencia);
  const diaAtual = new Date(`${hoje}T00:00:00.000Z`).getUTCDay();
  let delta = (DIAS_SEMANA[diaRecorrencia] - diaAtual + 7) % 7;
  if (estrita && delta === 0) delta = 7;
  const alvo = new Date(new Date(`${hoje}T00:00:00.000Z`).getTime() + delta * DIA_MS);
  return fimDoDia(alvo.toISOString().slice(0, 10));
}

/* -------------------------------------------------------------------------- */
/* Farol de prazo                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Situação de prazo da tarefa e a cor do farol correspondente:
 * VERDE (no prazo), AMARELO (vence em até 48h), VERMELHO (vencida) e
 * CINZA (encerrada — concluída ou cancelada).
 */
function avaliarPrazo(tarefa, agora) {
  const vencimento = new Date(tarefa.data_vencimento).getTime();

  if (tarefa.status === 'CANCELADO') {
    return { situacao_prazo: 'CANCELADA', farol: 'CINZA', em_atraso: false };
  }
  if (tarefa.status === 'CONCLUIDO') {
    const atrasada =
      tarefa.concluido_em !== null && new Date(tarefa.concluido_em).getTime() > vencimento;
    return {
      situacao_prazo: atrasada ? 'CONCLUIDA_COM_ATRASO' : 'CONCLUIDA_NO_PRAZO',
      farol: 'CINZA',
      em_atraso: false,
    };
  }

  const restante = vencimento - agora.getTime();
  if (restante < 0) {
    return { situacao_prazo: 'VENCIDA', farol: 'VERMELHO', em_atraso: true };
  }
  if (restante <= JANELA_ALERTA_MS) {
    return { situacao_prazo: 'PROXIMO_DO_VENCIMENTO', farol: 'AMARELO', em_atraso: false };
  }
  return { situacao_prazo: 'NO_PRAZO', farol: 'VERDE', em_atraso: false };
}

function mapearTarefa(tarefa, agora = new Date()) {
  if (!tarefa) return tarefa;
  return { ...tarefa, ...avaliarPrazo(tarefa, agora) };
}

/* -------------------------------------------------------------------------- */
/* Permissões e validações                                                    */
/* -------------------------------------------------------------------------- */

function exigirUsuario(usuario) {
  if (!usuario || !usuario.id || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
}

function ehGestor(usuario) {
  return PERFIS_GESTORES.includes(usuario.perfil);
}

function exigirPermissaoSobre(tarefa, usuario) {
  if (!ehGestor(usuario) && tarefa.usuario_id !== usuario.id) {
    throw new AppError(
      403,
      `Apenas o responsável pela tarefa ou perfis ${PERFIS_GESTORES.join(', ')} podem alterá-la.`
    );
  }
}

async function garantirResponsavel(usuarioId, solicitante) {
  if (usuarioId !== solicitante.id && !ehGestor(solicitante)) {
    throw new AppError(
      403,
      `Apenas perfis ${PERFIS_GESTORES.join(', ')} podem atribuir tarefas a outros colaboradores.`
    );
  }
  const responsavel = await usuarioRepository.findById(usuarioId);
  if (!responsavel) {
    throw new AppError(404, `Usuário ${usuarioId} não encontrado.`);
  }
  if (!responsavel.ativo) {
    throw new AppError(400, `O usuário ${responsavel.nome} está inativo e não pode receber tarefas.`);
  }
}

async function garantirObra(obraId) {
  if (obraId && !(await obraRepository.existsById(obraId))) {
    throw new AppError(404, `Obra ${obraId} não encontrada.`);
  }
}

async function buscarTarefa(idParam) {
  const id = validarId(idParam);
  const tarefa = await tarefaRepository.findById(id);
  if (!tarefa) {
    throw new AppError(404, `Tarefa ${id} não encontrada.`);
  }
  return tarefa;
}

/**
 * Normaliza o corpo da requisição. Apenas os campos presentes entram no
 * resultado (permite edição parcial); campos desconhecidos são ignorados.
 */
function normalizarPayload(payload = {}) {
  const dados = {};

  const titulo = lerCampo(payload, 'titulo');
  if (titulo.presente) {
    dados.titulo = limparTexto(titulo.valor, 200);
    if (!dados.titulo) throw new AppError(400, 'O título da tarefa não pode ficar em branco.');
  }

  const descricao = lerCampo(payload, 'descricao');
  if (descricao.presente) dados.descricao = limparTexto(descricao.valor);

  const tipo = lerCampo(payload, 'tipo');
  if (tipo.presente) dados.tipo = validarEnum(tipo.valor, TIPOS, 'Tipo de tarefa');

  const dia = lerCampo(payload, 'dia_recorrencia', 'diaRecorrencia');
  if (dia.presente) {
    dados.dia_recorrencia = estaVazio(dia.valor)
      ? null
      : validarEnum(dia.valor, Object.keys(DIAS_SEMANA), 'Dia de recorrência');
  }

  const vencimento = lerCampo(payload, 'data_vencimento', 'dataVencimento');
  if (vencimento.presente) dados.data_vencimento = lerDataVencimento(vencimento.valor);

  const prioridade = lerCampo(payload, 'prioridade');
  if (prioridade.presente) {
    dados.prioridade = validarEnum(prioridade.valor, PRIORIDADES, 'Prioridade');
  }

  const status = lerCampo(payload, 'status');
  if (status.presente) dados.status = validarEnum(status.valor, STATUS, 'Status da tarefa');

  const usuarioId = lerCampo(payload, 'usuario_id', 'usuarioId');
  if (usuarioId.presente) dados.usuario_id = validarId(usuarioId.valor, 'usuario_id');

  const obraId = lerCampo(payload, 'obra_id', 'obraId');
  if (obraId.presente) {
    dados.obra_id = estaVazio(obraId.valor) ? null : validarId(obraId.valor, 'obra_id');
  }

  const justificativa = lerCampo(payload, 'justificativa_atraso', 'justificativaAtraso');
  if (justificativa.presente) dados.justificativa_atraso = limparTexto(justificativa.valor);

  return dados;
}

/**
 * Ajusta recorrência e vencimento conforme o tipo final da tarefa.
 * Rotinas fixas vencem sempre no próximo dia da semana escolhido.
 */
function aplicarRecorrencia(dados, atual, agora) {
  const tipo = dados.tipo ?? atual?.tipo ?? 'AVULSA';
  dados.tipo = tipo;

  if (tipo === 'AVULSA') {
    dados.dia_recorrencia = null;
    if (!atual && !dados.data_vencimento) {
      throw new AppError(400, 'Campos obrigatórios: data_vencimento.');
    }
    return;
  }

  const dia = dados.dia_recorrencia !== undefined ? dados.dia_recorrencia : atual?.dia_recorrencia;
  if (!dia) {
    throw new AppError(
      400,
      'Informe o dia_recorrencia para tarefas do tipo FIXA_RECORRENTE.'
    );
  }

  // Na criação, ou quando a rotina muda de tipo/dia sem vencimento explícito,
  // o vencimento passa a ser o próximo dia da semana configurado.
  const mudouRecorrencia =
    !atual || atual.tipo !== tipo || atual.dia_recorrencia !== dia;
  if (!atual || (mudouRecorrencia && !dados.data_vencimento)) {
    dados.data_vencimento = proximoVencimento(dia, agora);
  }
}

/**
 * Aplica a transição de status e valida a regra de atraso: concluir após o
 * vencimento exige justificativa; concluir no prazo descarta justificativas.
 */
function aplicarStatus(dados, atual, agora) {
  const statusFinal = dados.status ?? atual.status;

  if (dados.status && dados.status !== atual.status) {
    if (dados.status === 'CONCLUIDO') {
      dados.concluido_em = agora;
    } else if (atual.status === 'CONCLUIDO') {
      // Reabertura: a conclusão anterior deixa de valer.
      dados.concluido_em = null;
      if (dados.justificativa_atraso === undefined) dados.justificativa_atraso = null;
    }
  }

  if (statusFinal !== 'CONCLUIDO') return;

  const concluidoEm = dados.concluido_em !== undefined ? dados.concluido_em : atual.concluido_em;
  const vencimento = dados.data_vencimento ?? atual.data_vencimento;
  const justificativa =
    dados.justificativa_atraso !== undefined ? dados.justificativa_atraso : atual.justificativa_atraso;

  const foraDoPrazo =
    concluidoEm && new Date(concluidoEm).getTime() > new Date(vencimento).getTime();

  if (foraDoPrazo && !justificativa) {
    throw new AppError(
      400,
      'Tarefa concluída fora do prazo: informe a justificativa_atraso.',
      { campo: 'justificativa_atraso', data_vencimento: new Date(vencimento).toISOString() }
    );
  }
  if (!foraDoPrazo && justificativa) {
    dados.justificativa_atraso = null;
  }
}

/** Dados da ocorrência seguinte de uma rotina recém-concluída. */
function montarProximaOcorrencia(tarefa, agora) {
  const vencimentoAtual = new Date(tarefa.data_vencimento);
  const referencia = vencimentoAtual > agora ? vencimentoAtual : agora;
  return {
    titulo: tarefa.titulo,
    descricao: tarefa.descricao,
    tipo: 'FIXA_RECORRENTE',
    dia_recorrencia: tarefa.dia_recorrencia,
    data_vencimento: proximoVencimento(tarefa.dia_recorrencia, referencia, { estrita: true }),
    prioridade: tarefa.prioridade,
    usuario_id: tarefa.usuario_id,
    obra_id: tarefa.obra_id,
  };
}

/**
 * Grava a atualização. Ao concluir uma rotina FIXA_RECORRENTE, a ocorrência
 * da semana seguinte é criada na mesma transação.
 */
async function persistirAtualizacao(atual, dados, agora) {
  const concluindo = dados.status === 'CONCLUIDO' && atual.status !== 'CONCLUIDO';
  const final = { ...atual, ...dados };

  if (concluindo && final.tipo === 'FIXA_RECORRENTE' && final.dia_recorrencia) {
    const { concluida, proxima } = await tarefaRepository.concluirRecorrente(
      atual.id,
      dados,
      montarProximaOcorrencia(final, agora)
    );
    return { ...mapearTarefa(concluida, agora), proxima_ocorrencia: mapearTarefa(proxima, agora) };
  }

  const atualizada = await tarefaRepository.update(atual.id, dados);
  return mapearTarefa(atualizada, agora);
}

/* -------------------------------------------------------------------------- */
/* Casos de uso                                                               */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/tarefas
 * ?usuario_id=&status=A_FAZER,EM_ANDAMENTO&tipo=&obra_id=&de=&ate=&page=&limit=
 */
async function listarTarefas(query = {}) {
  const page = estaVazio(query.page) ? 1 : Number(query.page);
  const limit = estaVazio(query.limit) ? LIMITE_PADRAO : Number(query.limit);

  if (!Number.isInteger(page) || page <= 0) {
    throw new AppError(400, 'O parâmetro "page" deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > LIMITE_MAXIMO) {
    throw new AppError(400, `O parâmetro "limit" deve ser um inteiro entre 1 e ${LIMITE_MAXIMO}.`);
  }

  const usuarioId = query.usuario_id ?? query.usuarioId;
  const obraId = query.obra_id ?? query.obraId;

  const filtros = {
    page,
    limit,
    usuarioId: estaVazio(usuarioId) ? undefined : validarId(usuarioId, 'usuario_id'),
    obraId: estaVazio(obraId) ? undefined : validarId(obraId, 'obra_id'),
    tipo: estaVazio(query.tipo) ? undefined : validarEnum(query.tipo, TIPOS, 'Tipo de tarefa'),
    // Aceita vários status separados por vírgula (ex.: A_FAZER,EM_ANDAMENTO).
    status: estaVazio(query.status)
      ? undefined
      : String(query.status)
          .split(',')
          .filter((item) => item.trim())
          .map((item) => validarEnum(item, STATUS, 'Status da tarefa')),
    de: lerDataFiltro(query.de, 'de', 'inicio'),
    ate: lerDataFiltro(query.ate, 'ate', 'fim'),
  };

  if (filtros.de && filtros.ate && filtros.de > filtros.ate) {
    throw new AppError(400, 'Período inválido: "de" deve ser anterior ou igual a "ate".');
  }

  const agora = new Date();
  const resultado = await tarefaRepository.findAll(filtros);
  return { ...resultado, data: resultado.data.map((tarefa) => mapearTarefa(tarefa, agora)) };
}

/** GET /api/tarefas/:id */
async function obterTarefa(idParam) {
  return mapearTarefa(await buscarTarefa(idParam));
}

/** POST /api/tarefas */
async function criarTarefa(payload, usuario) {
  exigirUsuario(usuario);
  const agora = new Date();
  const dados = normalizarPayload(payload);

  if (!dados.titulo) {
    throw new AppError(400, 'Campos obrigatórios: titulo.');
  }

  dados.status = dados.status ?? 'A_FAZER';
  if (!STATUS_ATIVOS.includes(dados.status)) {
    throw new AppError(
      400,
      `Uma tarefa nova deve iniciar como ${STATUS_ATIVOS.join(' ou ')}.`
    );
  }
  // Justificativa só faz sentido ao concluir fora do prazo.
  delete dados.justificativa_atraso;

  dados.usuario_id = dados.usuario_id ?? usuario.id;
  aplicarRecorrencia(dados, null, agora);

  await garantirResponsavel(dados.usuario_id, usuario);
  await garantirObra(dados.obra_id);

  return mapearTarefa(await tarefaRepository.create(dados), agora);
}

/**
 * PUT /api/tarefas/:id — edição parcial ou total. Mudanças de status seguem
 * as mesmas regras do PATCH /status (justificativa de atraso, recorrência).
 */
async function atualizarTarefa(idParam, payload, usuario) {
  exigirUsuario(usuario);
  const agora = new Date();
  const atual = await buscarTarefa(idParam);
  exigirPermissaoSobre(atual, usuario);

  const dados = normalizarPayload(payload);
  if (Object.keys(dados).length === 0) {
    throw new AppError(400, 'Nenhum campo válido informado para atualização.');
  }

  if (dados.usuario_id !== undefined && dados.usuario_id !== atual.usuario_id) {
    await garantirResponsavel(dados.usuario_id, usuario);
  }
  if (dados.obra_id !== undefined) {
    await garantirObra(dados.obra_id);
  }

  aplicarRecorrencia(dados, atual, agora);
  aplicarStatus(dados, atual, agora);

  return persistirAtualizacao(atual, dados, agora);
}

/** PATCH /api/tarefas/:id/status — { status, justificativa_atraso? } */
async function alterarStatus(idParam, payload = {}, usuario) {
  exigirUsuario(usuario);
  const agora = new Date();
  const atual = await buscarTarefa(idParam);
  exigirPermissaoSobre(atual, usuario);

  const status = lerCampo(payload, 'status');
  if (!status.presente || estaVazio(status.valor)) {
    throw new AppError(400, 'Campos obrigatórios: status.');
  }

  const dados = { status: validarEnum(status.valor, STATUS, 'Status da tarefa') };
  const justificativa = lerCampo(payload, 'justificativa_atraso', 'justificativaAtraso');
  if (justificativa.presente) {
    dados.justificativa_atraso = limparTexto(justificativa.valor);
  }

  aplicarStatus(dados, atual, agora);
  return persistirAtualizacao(atual, dados, agora);
}

/** DELETE /api/tarefas/:id */
async function removerTarefa(idParam, usuario) {
  exigirUsuario(usuario);
  const atual = await buscarTarefa(idParam);
  exigirPermissaoSobre(atual, usuario);

  if (!(await tarefaRepository.remove(atual.id))) {
    throw new AppError(404, `Tarefa ${atual.id} não encontrada.`);
  }
  return true;
}

/**
 * GET /api/tarefas/carga-equipe?de=&ate=
 * Resumo por colaborador: tarefas ativas, concluídas e vencidas. Lista a
 * equipe de planejamento ativa mesmo sem tarefas (carga zero).
 */
async function cargaEquipe(query = {}) {
  const agora = new Date();
  const de = lerDataFiltro(query.de, 'de', 'inicio');
  const ate = lerDataFiltro(query.ate, 'ate', 'fim');
  if (de && ate && de > ate) {
    throw new AppError(400, 'Período inválido: "de" deve ser anterior ou igual a "ate".');
  }

  const { porStatus, vencidas, concluidasComAtraso } = await tarefaRepository.contarCargaEquipe({
    de,
    ate,
    agora,
    statusAtivos: STATUS_ATIVOS,
  });

  const vazio = () => ({
    a_fazer: 0,
    em_andamento: 0,
    ativas: 0,
    concluidas: 0,
    concluidas_com_atraso: 0,
    canceladas: 0,
    vencidas: 0,
    total: 0,
  });
  const contagens = new Map();
  const contagemDe = (usuarioId) => {
    if (!contagens.has(usuarioId)) contagens.set(usuarioId, vazio());
    return contagens.get(usuarioId);
  };

  const CAMPO_STATUS = {
    A_FAZER: 'a_fazer',
    EM_ANDAMENTO: 'em_andamento',
    CONCLUIDO: 'concluidas',
    CANCELADO: 'canceladas',
  };
  for (const linha of porStatus) {
    const item = contagemDe(linha.usuario_id);
    const quantidade = linha._count._all;
    item[CAMPO_STATUS[linha.status]] += quantidade;
    item.total += quantidade;
    if (STATUS_ATIVOS.includes(linha.status)) item.ativas += quantidade;
  }
  for (const linha of vencidas) contagemDe(linha.usuario_id).vencidas = linha._count._all;
  for (const linha of concluidasComAtraso) {
    contagemDe(linha.usuario_id).concluidas_com_atraso = linha._count._all;
  }

  const colaboradores = await tarefaRepository.listarColaboradores(PERFIS_EQUIPE, [
    ...contagens.keys(),
  ]);

  const linhas = colaboradores
    .map((colaborador) => ({
      usuario_id: colaborador.id,
      nome: colaborador.nome,
      perfil: colaborador.perfil,
      ativo: colaborador.ativo,
      ...(contagens.get(colaborador.id) || vazio()),
    }))
    .sort((a, b) => b.ativas - a.ativas || a.nome.localeCompare(b.nome, 'pt-BR'));

  const totais = linhas.reduce((soma, linha) => {
    for (const campo of Object.keys(soma)) soma[campo] += linha[campo];
    return soma;
  }, vazio());

  return {
    gerado_em: agora.toISOString(),
    periodo: { de: de ? de.toISOString() : null, ate: ate ? ate.toISOString() : null },
    colaboradores: linhas,
    totais,
  };
}

module.exports = {
  listarTarefas,
  obterTarefa,
  criarTarefa,
  atualizarTarefa,
  alterarStatus,
  removerTarefa,
  cargaEquipe,
  // Regras de domínio expostas para testes.
  proximoVencimento,
  avaliarPrazo,
  TIPOS,
  STATUS,
  PRIORIDADES,
  DIAS_SEMANA,
};
