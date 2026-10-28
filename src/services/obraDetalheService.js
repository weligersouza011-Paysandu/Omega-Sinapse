'use strict';

const AppError = require('../errors/AppError');
const obraRepository = require('../repositories/obraRepository');

/** Perfis autorizados a criar/editar o detalhamento da obra. */
const PERFIS_ESCRITA = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

const TIPOS_LOCALIZACAO = ['PONTO', 'TRECHO'];
const STATUS_RELATORIO = ['RASCUNHO', 'ENVIADO', 'APROVADO'];
const STATUS_ATIVIDADE = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA'];
const GRAVIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];
const TIPOS_MIDIA = ['FOTO', 'VIDEO'];

const CAMPOS_AVANCO = [
  'fisico_prev',
  'fisico_lb_prev',
  'fisico_real',
  'fisico_tend_acum',
  'fisico_prev_acum',
  'fisico_real_acum',
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function temCampo(obj, campo) {
  return Object.prototype.hasOwnProperty.call(obj, campo);
}

function estaVazio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

async function garantirObra(idParam) {
  const id = validarId(idParam);
  if (!(await obraRepository.existsById(id))) {
    throw new AppError(404, `Obra ${id} não encontrada.`);
  }
  return id;
}

function exigirEscrita(usuario) {
  if (!usuario || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_ESCRITA.includes(usuario.perfil)) {
    throw new AppError(
      403,
      `Apenas perfis ${PERFIS_ESCRITA.join(', ')} podem alterar o detalhamento da obra.`
    );
  }
}

function textoObrigatorio(payload, campo, max = 255) {
  if (estaVazio(payload[campo])) {
    throw new AppError(400, `Informe o campo "${campo}".`);
  }
  const texto = String(payload[campo]).trim();
  if (texto.length > max) {
    throw new AppError(400, `O campo "${campo}" deve ter no máximo ${max} caracteres.`);
  }
  return texto;
}

function textoOpcional(payload, campo, max = 255) {
  if (!temCampo(payload, campo)) return undefined;
  if (estaVazio(payload[campo])) return null;
  const texto = String(payload[campo]).trim();
  if (texto.length > max) {
    throw new AppError(400, `O campo "${campo}" deve ter no máximo ${max} caracteres.`);
  }
  return texto;
}

function numeroDe(valor) {
  if (typeof valor === 'string') {
    return Number(valor.replace(',', '.').trim());
  }
  return Number(valor);
}

function numeroOpcional(payload, campo, { min = -Infinity, max = Infinity } = {}) {
  if (!temCampo(payload, campo)) return undefined;
  if (estaVazio(payload[campo])) return null;

  const numero = numeroDe(payload[campo]);
  if (!Number.isFinite(numero)) {
    throw new AppError(400, `O campo "${campo}" deve ser numérico.`);
  }
  if (numero < min || numero > max) {
    throw new AppError(
      400,
      `O campo "${campo}" deve estar entre ${min} e ${max}.`
    );
  }
  return numero;
}

function percentual(payload, campo, padrao = 0) {
  if (!temCampo(payload, campo) || estaVazio(payload[campo])) return padrao;
  const numero = numeroDe(payload[campo]);
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) {
    throw new AppError(400, `O campo "${campo}" deve ser um percentual entre 0 e 100.`);
  }
  return arredondar(numero);
}

function arredondar(valor, casas = 2) {
  return Number(Number(valor).toFixed(casas));
}

function dataDe(valor, campo) {
  if (estaVazio(valor)) {
    throw new AppError(400, `Informe o campo "${campo}".`);
  }
  const texto = String(valor).trim();
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? new Date(`${texto}T00:00:00.000Z`)
    : new Date(texto);

  if (Number.isNaN(data.getTime())) {
    throw new AppError(400, `O campo "${campo}" deve conter uma data válida.`);
  }
  return data;
}

function dataOpcional(payload, campo) {
  if (!temCampo(payload, campo)) return undefined;
  if (estaVazio(payload[campo])) return null;
  return dataDe(payload[campo], campo);
}

function enumOpcional(payload, campo, valores, padrao = undefined) {
  if (!temCampo(payload, campo) || estaVazio(payload[campo])) return padrao;
  const valor = String(payload[campo]).trim().toUpperCase();
  if (!valores.includes(valor)) {
    throw new AppError(400, `Valor inválido para "${campo}". Aceitos: ${valores.join(', ')}.`);
  }
  return valor;
}

/** Valida que um relatório opcional pertence à obra informada. */
async function idRelatorioDaObra(obraId, payload) {
  if (!temCampo(payload, 'relatorio_id') || estaVazio(payload.relatorio_id)) {
    return temCampo(payload, 'relatorio_id') ? null : undefined;
  }

  const id = validarId(payload.relatorio_id, 'relatorio_id');
  const relatorio = await obraRepository.buscarRelatorio(obraId, id);
  if (!relatorio) {
    throw new AppError(404, `Relatório ${id} não encontrado nesta obra.`);
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Localizações                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza os campos de localização. `existente` permite atualização parcial
 * mantendo os valores atuais quando o campo não é enviado.
 */
function montarLocalizacao(payload, existente = null, { parcial = false } = {}) {
  const dados = {};

  const tipo = enumOpcional(payload, 'tipo', TIPOS_LOCALIZACAO, existente?.tipo || 'PONTO');
  if (!parcial || temCampo(payload, 'tipo')) {
    dados.tipo = tipo;
  }

  if (!parcial || temCampo(payload, 'descricao')) {
    dados.descricao = textoObrigatorio(payload, 'descricao', 255);
  }

  const camposNumericos = [
    ['latitude', { min: -90, max: 90, casas: 7 }],
    ['longitude', { min: -180, max: 180, casas: 7 }],
    ['km_inicial', { min: 0, max: 999999, casas: 3 }],
    ['km_final', { min: 0, max: 999999, casas: 3 }],
  ];

  for (const [campo, opcoes] of camposNumericos) {
    if (temCampo(payload, campo)) {
      const valor = numeroOpcional(payload, campo, opcoes);
      dados[campo] = valor === null ? null : arredondar(valor, opcoes.casas);
    } else if (!parcial && existente) {
      dados[campo] = existente[campo] ?? null;
    }
  }

  if (!parcial || temCampo(payload, 'referencia')) {
    const referencia = textoOpcional(payload, 'referencia', 120);
    if (referencia !== undefined) dados.referencia = referencia;
  }

  // Combina os valores finais (payload + registro existente) para validar.
  const final = {
    tipo: dados.tipo ?? existente?.tipo ?? 'PONTO',
    latitude: temCampo(dados, 'latitude') ? dados.latitude : existente?.latitude ?? null,
    longitude: temCampo(dados, 'longitude') ? dados.longitude : existente?.longitude ?? null,
    km_inicial: temCampo(dados, 'km_inicial') ? dados.km_inicial : existente?.km_inicial ?? null,
    km_final: temCampo(dados, 'km_final') ? dados.km_final : existente?.km_final ?? null,
  };

  const temCoordenadas =
    final.latitude !== null &&
    final.latitude !== undefined &&
    final.longitude !== null &&
    final.longitude !== undefined;
  const temKm = final.km_inicial !== null && final.km_inicial !== undefined;

  if (final.tipo === 'PONTO' && !temCoordenadas) {
    throw new AppError(400, 'Localizações do tipo PONTO exigem latitude e longitude.');
  }
  if (final.tipo === 'TRECHO' && !temKm && !temCoordenadas) {
    throw new AppError(
      400,
      'Localizações do tipo TRECHO exigem o km inicial ou um par de coordenadas.'
    );
  }
  if (temKm && final.km_final !== null && final.km_final !== undefined && final.km_final < final.km_inicial) {
    throw new AppError(400, 'O km final não pode ser menor que o km inicial.');
  }

  return dados;
}

async function criarLocalizacao(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const dados = montarLocalizacao(payload);
  await obraRepository.criarLocalizacao(obraId, dados);
  return obraRepository.findById(obraId);
}

async function atualizarLocalizacao(idParam, localizacaoIdParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const localizacaoId = validarId(localizacaoIdParam, 'localizacaoId');
  const existente = await obraRepository.buscarLocalizacao(obraId, localizacaoId);
  if (!existente) {
    throw new AppError(404, `Localização ${localizacaoId} não encontrada nesta obra.`);
  }

  const dados = montarLocalizacao(payload, existente, { parcial: true });
  if (Object.keys(dados).length === 0) {
    return obraRepository.findById(obraId);
  }

  await obraRepository.atualizarLocalizacao(obraId, localizacaoId, dados);
  return obraRepository.findById(obraId);
}

async function removerLocalizacao(idParam, localizacaoIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const localizacaoId = validarId(localizacaoIdParam, 'localizacaoId');
  const removida = await obraRepository.removerLocalizacao(obraId, localizacaoId);
  if (!removida) {
    throw new AppError(404, `Localização ${localizacaoId} não encontrada nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

/* -------------------------------------------------------------------------- */
/* Avanço físico (Curva S)                                                    */
/* -------------------------------------------------------------------------- */

function montarAvanco(payload, existente = null, { parcial = false } = {}) {
  const dados = {};

  if (!parcial || temCampo(payload, 'semana')) {
    const semana = Number(payload.semana);
    if (!Number.isInteger(semana) || semana <= 0 || semana > 9999) {
      throw new AppError(400, 'O campo "semana" deve ser um inteiro positivo.');
    }
    dados.semana = semana;
  }

  if (!parcial || temCampo(payload, 'data')) {
    dados.data = dataDe(payload.data, 'data');
  }

  for (const campo of CAMPOS_AVANCO) {
    if (temCampo(payload, campo) && !estaVazio(payload[campo])) {
      dados[campo] = percentual(payload, campo, existente ? Number(existente[campo]) : 0);
    } else if (!parcial && temCampo(payload, campo)) {
      // Campo enviado vazio equivale a zero explícito.
      dados[campo] = 0;
    }
  }

  return dados;
}

/**
 * Preenche os acumulados não informados a partir da semana anterior.
 * Assim o usuário pode lançar apenas o avanço da semana (Prev/Real).
 */
async function completarAcumulados(obraId, dados, ignorarId = null) {
  const anterior = await obraRepository.buscarAvancoAnterior(obraId, dados.semana, ignorarId);

  if (!temCampo(dados, 'fisico_prev_acum')) {
    dados.fisico_prev_acum = arredondar(
      Number(anterior?.fisico_prev_acum || 0) + Number(dados.fisico_prev || 0)
    );
  }
  if (!temCampo(dados, 'fisico_real_acum')) {
    dados.fisico_real_acum = arredondar(
      Number(anterior?.fisico_real_acum || 0) + Number(dados.fisico_real || 0)
    );
  }
  if (!temCampo(dados, 'fisico_tend_acum')) {
    dados.fisico_tend_acum = arredondar(
      Number(anterior?.fisico_tend_acum || anterior?.fisico_real_acum || 0)
    );
  }

  return dados;
}

async function criarAvanco(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const dados = montarAvanco(payload);

  const existente = await obraRepository.buscarAvancoPorSemana(obraId, dados.semana);
  if (existente) {
    throw new AppError(
      409,
      `Já existe uma medição para a semana ${dados.semana}. Edite o registro existente.`
    );
  }

  await completarAcumulados(obraId, dados);
  await obraRepository.criarAvanco(obraId, dados);
  await obraRepository.recalcularAcumulados(obraId);
  return obraRepository.findById(obraId);
}

async function atualizarAvanco(idParam, avancoIdParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const avancoId = validarId(avancoIdParam, 'avancoId');
  const existente = await obraRepository.buscarAvanco(obraId, avancoId);
  if (!existente) {
    throw new AppError(404, `Medição ${avancoId} não encontrada nesta obra.`);
  }

  const dados = montarAvanco(payload, existente, { parcial: true });

  if (temCampo(dados, 'semana') && dados.semana !== existente.semana) {
    const conflito = await obraRepository.buscarAvancoPorSemana(obraId, dados.semana);
    if (conflito && conflito.id !== avancoId) {
      throw new AppError(409, `Já existe uma medição para a semana ${dados.semana}.`);
    }
  }

  if (Object.keys(dados).length === 0) {
    return obraRepository.findById(obraId);
  }

  await obraRepository.atualizarAvanco(obraId, avancoId, dados);
  await obraRepository.recalcularAcumulados(obraId);
  return obraRepository.findById(obraId);
}

async function removerAvanco(idParam, avancoIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const avancoId = validarId(avancoIdParam, 'avancoId');
  const removido = await obraRepository.removerAvanco(obraId, avancoId);
  if (!removido) {
    throw new AppError(404, `Medição ${avancoId} não encontrada nesta obra.`);
  }

  await obraRepository.recalcularAcumulados(obraId);
  return obraRepository.findById(obraId);
}

/* -------------------------------------------------------------------------- */
/* Relatórios (RDO)                                                           */
/* -------------------------------------------------------------------------- */

function montarRelatorio(payload, existente = null, { parcial = false } = {}) {
  const dados = {};

  if (!parcial || temCampo(payload, 'data')) {
    dados.data = temCampo(payload, 'data') && !estaVazio(payload.data)
      ? dataDe(payload.data, 'data')
      : existente?.data || dataDe(new Date().toISOString().slice(0, 10), 'data');
  }

  if (!parcial || temCampo(payload, 'titulo')) {
    dados.titulo = textoObrigatorio(payload, 'titulo', 200);
  }

  if (!parcial || temCampo(payload, 'resumo')) {
    const resumo = textoOpcional(payload, 'resumo', 5000);
    if (resumo !== undefined) dados.resumo = resumo;
  }

  if (!parcial || temCampo(payload, 'status')) {
    dados.status = enumOpcional(payload, 'status', STATUS_RELATORIO, existente?.status || 'RASCUNHO');
  }

  return dados;
}

async function criarRelatorio(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const dados = montarRelatorio(payload);
  dados.autor_id = usuario.id;

  await obraRepository.criarRelatorio(obraId, dados);
  return obraRepository.findById(obraId);
}

async function atualizarRelatorio(idParam, relatorioIdParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const relatorioId = validarId(relatorioIdParam, 'relatorioId');
  const existente = await obraRepository.buscarRelatorio(obraId, relatorioId);
  if (!existente) {
    throw new AppError(404, `Relatório ${relatorioId} não encontrado nesta obra.`);
  }

  const dados = montarRelatorio(payload, existente, { parcial: true });
  if (Object.keys(dados).length === 0) {
    return obraRepository.findById(obraId);
  }

  await obraRepository.atualizarRelatorio(obraId, relatorioId, dados);
  return obraRepository.findById(obraId);
}

async function removerRelatorio(idParam, relatorioIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const relatorioId = validarId(relatorioIdParam, 'relatorioId');
  const removido = await obraRepository.removerRelatorio(obraId, relatorioId);
  if (!removido) {
    throw new AppError(404, `Relatório ${relatorioId} não encontrado nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

/* -------------------------------------------------------------------------- */
/* Atividades / tarefas                                                       */
/* -------------------------------------------------------------------------- */

function montarAtividade(payload, existente = null, { parcial = false } = {}) {
  const dados = {};

  if (!parcial || temCampo(payload, 'titulo')) {
    dados.titulo = textoObrigatorio(payload, 'titulo', 200);
  }

  if (!parcial || temCampo(payload, 'descricao')) {
    const descricao = textoOpcional(payload, 'descricao', 5000);
    if (descricao !== undefined) dados.descricao = descricao;
  }

  if (!parcial || temCampo(payload, 'status')) {
    dados.status = enumOpcional(
      payload,
      'status',
      STATUS_ATIVIDADE,
      existente?.status || 'PENDENTE'
    );
  }

  if (!parcial || temCampo(payload, 'responsavel')) {
    const responsavel = textoOpcional(payload, 'responsavel', 120);
    if (responsavel !== undefined) dados.responsavel = responsavel;
  }

  if (!parcial || temCampo(payload, 'prazo')) {
    const prazo = dataOpcional(payload, 'prazo');
    if (prazo !== undefined) dados.prazo = prazo;
  }

  return dados;
}

async function criarAtividade(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const dados = montarAtividade(payload);
  const relatorioId = await idRelatorioDaObra(obraId, payload);
  if (relatorioId !== undefined) dados.relatorio_id = relatorioId;

  await obraRepository.criarAtividade(obraId, dados);
  return obraRepository.findById(obraId);
}

async function atualizarAtividade(idParam, atividadeIdParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const atividadeId = validarId(atividadeIdParam, 'atividadeId');
  const dados = montarAtividade(payload, null, { parcial: true });

  const relatorioId = await idRelatorioDaObra(obraId, payload);
  if (relatorioId !== undefined) dados.relatorio_id = relatorioId;

  if (Object.keys(dados).length === 0) {
    return obraRepository.findById(obraId);
  }

  const atualizada = await obraRepository.atualizarAtividade(obraId, atividadeId, dados);
  if (!atualizada) {
    throw new AppError(404, `Atividade ${atividadeId} não encontrada nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

async function removerAtividade(idParam, atividadeIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const atividadeId = validarId(atividadeIdParam, 'atividadeId');
  const removida = await obraRepository.removerAtividade(obraId, atividadeId);
  if (!removida) {
    throw new AppError(404, `Atividade ${atividadeId} não encontrada nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

/* -------------------------------------------------------------------------- */
/* Ocorrências                                                                */
/* -------------------------------------------------------------------------- */

async function criarOcorrencia(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const dados = {
    descricao: textoObrigatorio(payload, 'descricao', 5000),
    gravidade: enumOpcional(payload, 'gravidade', GRAVIDADES, 'MEDIA'),
  };

  const relatorioId = await idRelatorioDaObra(obraId, payload);
  if (relatorioId !== undefined) dados.relatorio_id = relatorioId;

  await obraRepository.criarOcorrencia(obraId, dados);
  return obraRepository.findById(obraId);
}

async function removerOcorrencia(idParam, ocorrenciaIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const ocorrenciaId = validarId(ocorrenciaIdParam, 'ocorrenciaId');
  const removida = await obraRepository.removerOcorrencia(obraId, ocorrenciaId);
  if (!removida) {
    throw new AppError(404, `Ocorrência ${ocorrenciaId} não encontrada nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

/* -------------------------------------------------------------------------- */
/* Comentários                                                                */
/* -------------------------------------------------------------------------- */

async function criarComentario(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const dados = {
    texto: textoObrigatorio(payload, 'texto', 5000),
    autor_id: usuario.id,
  };

  const relatorioId = await idRelatorioDaObra(obraId, payload);
  if (relatorioId !== undefined) dados.relatorio_id = relatorioId;

  await obraRepository.criarComentario(obraId, dados);
  return obraRepository.findById(obraId);
}

async function removerComentario(idParam, comentarioIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const comentarioId = validarId(comentarioIdParam, 'comentarioId');
  const removido = await obraRepository.removerComentario(obraId, comentarioId);
  if (!removido) {
    throw new AppError(404, `Comentário ${comentarioId} não encontrado nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

/* -------------------------------------------------------------------------- */
/* Mídias                                                                     */
/* -------------------------------------------------------------------------- */

async function criarMidia(idParam, payload = {}, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const url = textoObrigatorio(payload, 'url', 2000);
  if (!/^https?:\/\//i.test(url)) {
    throw new AppError(400, 'A URL da mídia deve começar com http:// ou https://.');
  }

  const dados = {
    tipo: enumOpcional(payload, 'tipo', TIPOS_MIDIA, 'FOTO'),
    url,
  };

  const legenda = textoOpcional(payload, 'legenda', 255);
  if (legenda !== undefined) dados.legenda = legenda;

  const relatorioId = await idRelatorioDaObra(obraId, payload);
  if (relatorioId !== undefined) dados.relatorio_id = relatorioId;

  await obraRepository.criarMidia(obraId, dados);
  return obraRepository.findById(obraId);
}

async function removerMidia(idParam, midiaIdParam, usuario) {
  const obraId = await garantirObra(idParam);
  exigirEscrita(usuario);

  const midiaId = validarId(midiaIdParam, 'midiaId');
  const removida = await obraRepository.removerMidia(obraId, midiaId);
  if (!removida) {
    throw new AppError(404, `Mídia ${midiaId} não encontrada nesta obra.`);
  }

  return obraRepository.findById(obraId);
}

module.exports = {
  PERFIS_ESCRITA,
  TIPOS_LOCALIZACAO,
  STATUS_RELATORIO,
  STATUS_ATIVIDADE,
  GRAVIDADES,
  TIPOS_MIDIA,
  criarLocalizacao,
  atualizarLocalizacao,
  removerLocalizacao,
  criarAvanco,
  atualizarAvanco,
  removerAvanco,
  criarRelatorio,
  atualizarRelatorio,
  removerRelatorio,
  criarAtividade,
  atualizarAtividade,
  removerAtividade,
  criarOcorrencia,
  removerOcorrencia,
  criarComentario,
  removerComentario,
  criarMidia,
  removerMidia,
};
