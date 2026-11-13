'use strict';

const AppError = require('../errors/AppError');
const contratoRepository = require('../repositories/contratoRepository');
const qqpRepository = require('../repositories/qqpRepository');
const { projetarCustosQqp } = require('./projecaoFinanceiraService');
const dinheiro = require('../utils/dinheiro');

/**
 * QQP (Quadro de Quantidades e Preços) do contrato e recursos planejados por
 * obra. Os itens do QQP trazem o preço contratual; cada recurso da obra diz
 * quantos recursos entram, em que período, e alimenta a projeção de custos.
 */

const PERFIS_QUE_GEREM_QQP = ['SUPERVISOR', 'ADMIN'];
const PERFIS_QUE_PLANEJAM_RECURSOS = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
const PERFIS_VALIDOS = ['ORCAMENTISTA', 'PLANEJADOR', 'SUPERVISOR', 'ADMIN', 'CLIENTE'];
const CATEGORIAS = ['HH', 'EQUIPAMENTO', 'INSUMO', 'OUTROS'];
const UNIDADES = ['HORA', 'DIA', 'MES', 'UNIDADE'];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const temCampo = (obj, campo) => Object.prototype.hasOwnProperty.call(obj, campo);
const estaVazio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

function validarUsuario(usuario) {
  if (!usuario || usuario.id === undefined || !usuario.perfil) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  if (!PERFIS_VALIDOS.includes(usuario.perfil)) {
    throw new AppError(403, `Perfil desconhecido: "${usuario.perfil}".`);
  }
}

function exigirPerfil(usuario, perfis, acao) {
  validarUsuario(usuario);
  if (!perfis.includes(usuario.perfil)) {
    throw new AppError(403, `Apenas perfis ${perfis.join(', ')} podem ${acao}.`);
  }
}

function validarId(valor, campo = 'id') {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new AppError(400, `O parâmetro "${campo}" deve ser um número inteiro positivo.`);
  }
  return numero;
}

function numeroPositivo(valor, rotulo, casas) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new AppError(400, `O campo "${rotulo}" deve ser um número maior que zero.`);
  }
  const fator = 10 ** casas;
  return Math.round(numero * fator) / fator;
}

function parseData(valor, rotulo) {
  if (estaVazio(valor)) {
    throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  }
  const texto = String(valor).trim();
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00Z`) : new Date(texto);
  if (Number.isNaN(data.getTime())) {
    throw new AppError(400, `O campo "${rotulo}" deve ser uma data válida (AAAA-MM-DD).`);
  }
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

function opcaoDe(valor, lista, rotulo) {
  const texto = String(valor ?? '').trim().toUpperCase();
  if (!lista.includes(texto)) {
    throw new AppError(400, `"${rotulo}" inválido. Valores aceitos: ${lista.join(', ')}.`);
  }
  return texto;
}

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const dataISO = (valor) => (valor ? new Date(valor).toISOString().slice(0, 10) : null);

/** Decimal do Prisma em texto exato, sem zeros à direita ("12.50000000" -> "12.5"). */
function textoDecimalExato(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = typeof valor === 'object' && typeof valor.toFixed === 'function' ? valor.toFixed() : String(valor);
  return texto.includes('.') ? texto.replace(/0+$/, '').replace(/\.$/, '') : texto;
}

function formatarItem(item) {
  const quantidade = textoDecimalExato(item.quantidade);
  const preco = textoDecimalExato(item.preco_unitario);
  return {
    id: item.id,
    contrato_id: item.contrato_id,
    termo_aditivo_id: item.termo_aditivo_id ?? null,
    escopo_tac: item.escopo_tac ?? 0,
    codigo: item.codigo,
    descricao: item.descricao,
    categoria: item.categoria,
    unidade: item.unidade,
    categoria_planilha: item.categoria_planilha ?? null,
    categoria_exibida: categoriaExibida(item),
    grupo: item.grupo ?? null,
    subgrupo: item.subgrupo ?? null,
    unidade_planilha: item.unidade_planilha ?? null,
    /** Quantidade e preço exatos em texto (até 8 casas); `preco_unitario` segue como número. */
    quantidade,
    preco_unitario: numero(item.preco_unitario),
    preco_unitario_exato: preco,
    total: quantidade === null ? null : dinheiro.centavosParaReais(dinheiro.totalDoItemEmCentavos(quantidade, preco)),
    posicao: item.posicao ?? 0,
    ativo: item.ativo,
    recursos_em_uso: item._count?.recursos ?? 0,
    projecoes_em_uso: item._count?.projecoes ?? 0,
  };
}

function formatarRecurso(recurso) {
  return {
    id: recurso.id,
    obra_id: recurso.obra_id,
    item_id: recurso.item_id,
    item: recurso.item ? formatarItem(recurso.item) : null,
    quantidade: numero(recurso.quantidade),
    horas_dia: numero(recurso.horas_dia),
    data_inicio: dataISO(recurso.data_inicio),
    data_fim: dataISO(recurso.data_fim),
    inclui_sabados: recurso.inclui_sabados,
    observacao: recurso.observacao ?? null,
  };
}

async function garantirContrato(idParam) {
  const id = validarId(idParam);
  if (!(await contratoRepository.existsById(id))) {
    throw new AppError(404, `Contrato ${id} não encontrado.`);
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Itens do QQP (contrato)                                                    */
/* -------------------------------------------------------------------------- */

const SEM_GRUPO = '';
const ROTULO_CATEGORIA_ENUM = { HH: 'HH (mão de obra)', EQUIPAMENTO: 'Equipamentos', INSUMO: 'Insumos', OUTROS: 'Outros' };

/**
 * Decimal não negativo como texto exato (sem ponto flutuante), com no máximo `casas`
 * casas decimais e `inteiros` dígitos inteiros. Aceita vírgula decimal ("1.234,56").
 */
function decimalExato(valor, rotulo, { casas, inteiros, permitirZero = true }) {
  if (estaVazio(valor)) throw new AppError(400, `O campo "${rotulo}" é obrigatório.`);
  const bruto = typeof valor === 'number' ? (Number.isFinite(valor) ? String(valor) : '') : String(valor).trim();
  const texto = /,/.test(bruto) ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
  let partes;
  try {
    partes = dinheiro.partesDecimais(texto);
  } catch {
    throw new AppError(400, `O campo "${rotulo}" deve ser um número maior ou igual a zero.`);
  }
  let { digitos, escala } = partes;
  while (escala > 0 && digitos % 10n === 0n) {
    digitos /= 10n;
    escala -= 1;
  }
  if (escala > casas) throw new AppError(400, `O campo "${rotulo}" aceita no máximo ${casas} casas decimais.`);
  const base = 10n ** BigInt(escala);
  const inteiro = digitos / base;
  if (String(inteiro).length > inteiros) throw new AppError(400, `O campo "${rotulo}" está acima do limite permitido.`);
  if (!permitirZero && digitos === 0n) throw new AppError(400, `O campo "${rotulo}" deve ser maior que zero.`);
  return escala === 0 ? String(inteiro) : `${inteiro}.${String(digitos % base).padStart(escala, '0')}`;
}

const lerPreco = (valor) => decimalExato(valor, 'preco_unitario', { casas: 8, inteiros: 10 });
const lerQuantidade = (valor) => decimalExato(valor, 'quantidade', { casas: 8, inteiros: 16 });

function textoOpcional(valor, rotulo, maximo) {
  if (estaVazio(valor)) return null;
  const texto = String(valor).trim().replace(/\s+/g, ' ');
  if (texto.length > maximo) throw new AppError(400, `O campo "${rotulo}" aceita no máximo ${maximo} caracteres.`);
  return texto;
}

function lerCodigo(valor) {
  if (estaVazio(valor)) throw new AppError(400, 'O campo "codigo" é obrigatório.');
  const codigo = String(valor).trim().toUpperCase();
  if (codigo.length > 120) throw new AppError(400, 'O campo "codigo" aceita no máximo 120 caracteres.');
  return codigo;
}

/** Revisão do QQP enviada pelo cliente: 428 se faltar (exigida em toda gravação do QQP). */
function lerRevisao(valor) {
  if (estaVazio(valor)) {
    throw new AppError(428, 'Recarregue o QQP: a gravação precisa informar a versão carregada ("qqp_revisao").');
  }
  const revisao = Number(String(valor).replace(/"/g, ''));
  if (!Number.isInteger(revisao) || revisao < 0) throw new AppError(400, 'O campo "qqp_revisao" é inválido.');
  return revisao;
}

/** Executa a gravação sob a revisão informada; 409 se o QQP mudou desde que foi carregado. */
async function gravarComRevisao(contratoId, revisaoParam, operacao) {
  const revisao = lerRevisao(revisaoParam);
  const saida = await qqpRepository.comRevisao(contratoId, revisao, operacao);
  if (saida.conflito) {
    const atual = await qqpRepository.revisaoAtual(contratoId);
    throw new AppError(
      409,
      'O QQP deste contrato foi alterado por outra pessoa depois que você o abriu. Recarregue para ver a versão atual.',
      { revisao_atual: atual, revisao_enviada: revisao }
    );
  }
  return saida;
}

/**
 * Escopo pedido: "todos" = todos; "0"/"TAC0" = contrato original; senão o id do TAC.
 * Vazio = todos (listagem) ou contrato original (gravação, com `padraoTodos: false`).
 */
function lerEscopo(valor, { padraoTodos = true } = {}) {
  const texto = String(valor ?? '').trim();
  if (texto === '') return padraoTodos ? undefined : 0;
  if (texto.toLowerCase() === 'todos') return undefined;
  if (texto === '0' || /^tac0$/i.test(texto)) return 0;
  return validarId(texto, 'tac');
}

function rotuloEscopo(contrato, tac) {
  if (!tac) return `${contrato.numero_sap || contrato.id_vale} – TAC0`;
  return `${tac.numero_sap || contrato.numero_sap || contrato.id_vale} – ${tac.numero_tac}`;
}

function escoposDoContrato(contrato) {
  return [
    { tac_id: 0, numero_tac: 'TAC0', numero_sap: contrato.numero_sap, rotulo: rotuloEscopo(contrato, null) },
    ...contrato.aditivos.map((tac) => ({
      tac_id: tac.id,
      numero_tac: tac.numero_tac,
      numero_sap: tac.numero_sap,
      data_inicio: dataISO(tac.data_inicio),
      data_fim: dataISO(tac.data_fim),
      rotulo: rotuloEscopo(contrato, tac),
    })),
  ];
}

async function carregarEstado(contratoId) {
  const contrato = await qqpRepository.estadoDoContrato(contratoId);
  if (!contrato) throw new AppError(404, `Contrato ${contratoId} não encontrado.`);
  return contrato;
}

function garantirEscopoDoContrato(contrato, escopo) {
  if (escopo && !contrato.aditivos.some((tac) => tac.id === escopo)) {
    throw new AppError(404, `TAC ${escopo} não encontrado neste contrato.`);
  }
}

function totalCentavosDoItem(item) {
  if (item.quantidade === null || item.quantidade === undefined) return null;
  return dinheiro.totalDoItemEmCentavos(textoDecimalExato(item.quantidade), textoDecimalExato(item.preco_unitario));
}

/** Categoria exibida na árvore: a da planilha ou, sem ela, o rótulo da categoria do Synapse. */
function categoriaExibida(item) {
  return item.categoria_planilha || ROTULO_CATEGORIA_ENUM[item.categoria] || item.categoria;
}

/** Ordena nomes pela ordem personalizada; os que não estão nela vêm depois, na ordem original. */
function ordenarPor(lista, preferida = []) {
  const indice = new Map((Array.isArray(preferida) ? preferida : []).map((nome, i) => [nome, i]));
  return lista
    .map((nome, original) => ({ nome, original }))
    .sort((a, b) => {
      const ia = indice.has(a.nome) ? indice.get(a.nome) : Infinity;
      const ib = indice.has(b.nome) ? indice.get(b.nome) : Infinity;
      return ia === ib ? a.original - b.original : ia - ib;
    })
    .map(({ nome }) => nome);
}

/**
 * Árvore Categoria › Grupo › Subgrupo › itens, com totais (Σ quantidade × preço) em reais.
 * Função pura: recebe itens formatados com `total_centavos` (BigInt ou null).
 * Ordem: { categorias: [nome], grupos: { [categoria]: [grupo] }, subgrupos: { ["categoria›grupo"]: [subgrupo] } }.
 */
function montarArvore(itens, ordem = null) {
  const categorias = new Map();
  const ordenados = [...itens].sort((a, b) => a.escopo_tac - b.escopo_tac || a.posicao - b.posicao || a.codigo.localeCompare(b.codigo));
  for (const item of ordenados) {
    const nomeCategoria = item.categoria_exibida;
    if (!categorias.has(nomeCategoria)) categorias.set(nomeCategoria, new Map());
    const grupos = categorias.get(nomeCategoria);
    const nomeGrupo = item.grupo || SEM_GRUPO;
    if (!grupos.has(nomeGrupo)) grupos.set(nomeGrupo, new Map());
    const subgrupos = grupos.get(nomeGrupo);
    const nomeSubgrupo = item.subgrupo || SEM_GRUPO;
    if (!subgrupos.has(nomeSubgrupo)) subgrupos.set(nomeSubgrupo, []);
    subgrupos.get(nomeSubgrupo).push(item);
  }

  const reais = (centavos) => dinheiro.centavosParaReais(centavos);
  const preferencias = ordem && typeof ordem === 'object' ? ordem : {};
  const semCentavos = ({ total_centavos: _t, ...resto }) => resto;

  let totalGeral = 0n;
  const arvore = ordenarPor([...categorias.keys()], preferencias.categorias).map((nomeCategoria) => {
    const grupos = categorias.get(nomeCategoria);
    let totalCategoria = 0n;
    const listaGrupos = ordenarPor([...grupos.keys()], preferencias.grupos?.[nomeCategoria]).map((nomeGrupo) => {
      const subgrupos = grupos.get(nomeGrupo);
      let totalGrupo = 0n;
      const chave = `${nomeCategoria}›${nomeGrupo}`;
      const listaSub = ordenarPor([...subgrupos.keys()], preferencias.subgrupos?.[chave]).map((nomeSubgrupo) => {
        const lista = subgrupos.get(nomeSubgrupo);
        const total = lista.reduce((soma, i) => soma + (i.total_centavos ?? 0n), 0n);
        totalGrupo += total;
        return { subgrupo: nomeSubgrupo, total: reais(total), itens: lista.map(semCentavos) };
      });
      totalCategoria += totalGrupo;
      return { grupo: nomeGrupo, total: reais(totalGrupo), subgrupos: listaSub };
    });
    totalGeral += totalCategoria;
    return { categoria: nomeCategoria, total: reais(totalCategoria), grupos: listaGrupos };
  });
  return { arvore, total: reais(totalGeral) };
}

/** Itens do escopo formatados, com `total_centavos` para as somas. */
async function itensComTotais(contratoId, escopo) {
  const brutos = await qqpRepository.listarItens(contratoId, escopo);
  return brutos.map((item) => ({ ...formatarItem(item), total_centavos: totalCentavosDoItem(item) }));
}

/**
 * GET /api/contratos/:id/qqp?tac=0|<id>|todos
 * `data` é a lista plana (compatível com as telas de recursos); `arvore` agrupa por
 * Categoria › Grupo › Subgrupo com os totais. `qqp_revisao` deve voltar em toda gravação.
 */
async function listarItens(idParam, usuario, filtros = {}) {
  validarUsuario(usuario);
  const contratoId = validarId(idParam);
  const contrato = await carregarEstado(contratoId);
  const escopo = lerEscopo(filtros.tac);
  garantirEscopoDoContrato(contrato, escopo);

  const itens = await itensComTotais(contratoId, escopo);
  const { arvore, total } = montarArvore(itens, contrato.qqp_ordem?.ordem);
  return {
    data: itens.map(({ total_centavos: _t, ...resto }) => resto),
    total: itens.length,
    valor_total: total,
    arvore,
    contrato: { id: contrato.id, id_vale: contrato.id_vale, descricao: contrato.descricao, numero_sap: contrato.numero_sap },
    escopos: escoposDoContrato(contrato),
    tac: escopo === undefined ? 'todos' : escopo,
    ordem: contrato.qqp_ordem?.ordem || null,
    qqp_revisao: contrato.qqp_revisao,
  };
}

/** Campos editáveis do item (criação e edição). */
function dadosDoPayload(payload, { parcial }) {
  const dados = {};
  const quer = (campo) => !parcial || temCampo(payload, campo);
  if (quer('codigo')) dados.codigo = lerCodigo(payload.codigo);
  if (quer('descricao')) {
    if (estaVazio(payload.descricao)) throw new AppError(400, 'O campo "descricao" é obrigatório.');
    dados.descricao = String(payload.descricao).trim();
  }
  if (quer('categoria')) dados.categoria = opcaoDe(payload.categoria, CATEGORIAS, 'categoria');
  if (quer('unidade')) dados.unidade = opcaoDe(payload.unidade, UNIDADES, 'unidade');
  if (quer('preco_unitario')) dados.preco_unitario = lerPreco(payload.preco_unitario);
  if (temCampo(payload, 'quantidade')) dados.quantidade = estaVazio(payload.quantidade) ? null : lerQuantidade(payload.quantidade);
  if (temCampo(payload, 'categoria_planilha')) dados.categoria_planilha = textoOpcional(payload.categoria_planilha, 'categoria_planilha', 200);
  if (temCampo(payload, 'grupo')) dados.grupo = textoOpcional(payload.grupo, 'grupo', 200);
  if (temCampo(payload, 'subgrupo')) dados.subgrupo = textoOpcional(payload.subgrupo, 'subgrupo', 200);
  if (temCampo(payload, 'unidade_planilha')) dados.unidade_planilha = textoOpcional(payload.unidade_planilha, 'unidade_planilha', 30);
  if (temCampo(payload, 'ativo')) dados.ativo = Boolean(payload.ativo);
  return dados;
}

/** POST /api/contratos/:id/qqp — { codigo, descricao, categoria, unidade, preco_unitario, termo_aditivo_id?, ..., qqp_revisao } */
async function criarItem(idParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'cadastrar itens do QQP');
  const contratoId = validarId(idParam);
  const contrato = await carregarEstado(contratoId);
  const escopo = lerEscopo(payload.termo_aditivo_id, { padraoTodos: false });
  if (escopo === undefined) throw new AppError(400, 'Escolha o contrato original (TAC0) ou um TAC para o item.');
  garantirEscopoDoContrato(contrato, escopo);
  const dados = { ...dadosDoPayload(payload, { parcial: false }), ativo: payload.ativo === undefined ? true : Boolean(payload.ativo) };

  const { revisao, resultado } = await gravarComRevisao(contratoId, payload.qqp_revisao, async (tx) => {
    if (await qqpRepository.buscarItemPorCodigo(contratoId, dados.codigo, escopo, tx)) {
      throw new AppError(409, `Já existe um item do QQP com o código ${dados.codigo} neste contrato/TAC.`);
    }
    const posicao = (await qqpRepository.ultimaPosicao(contratoId, escopo, tx)) + 1;
    return qqpRepository.criarItem(contratoId, { ...dados, termo_aditivo_id: escopo || null, escopo_tac: escopo, posicao }, tx);
  });
  return { ...formatarItem(resultado), qqp_revisao: revisao };
}

/** PUT /api/contratos/:id/qqp/:itemId — o item continua no mesmo contrato/TAC. */
async function atualizarItem(idParam, itemIdParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'alterar itens do QQP');
  const contratoId = await garantirContrato(idParam);
  const itemId = validarId(itemIdParam, 'itemId');
  const dados = dadosDoPayload(payload, { parcial: true });
  if (Object.keys(dados).length === 0) throw new AppError(400, 'Informe ao menos um campo do item para alterar.');

  const { revisao, resultado } = await gravarComRevisao(contratoId, payload.qqp_revisao, async (tx) => {
    const existente = await qqpRepository.buscarItem(contratoId, itemId, tx);
    if (!existente) throw new AppError(404, `Item ${itemId} do QQP não encontrado neste contrato.`);
    if (dados.unidade && dados.unidade !== existente.unidade && existente._count.recursos > 0) {
      throw new AppError(409, 'A unidade não pode mudar enquanto houver recursos de obra usando este item.');
    }
    if (dados.codigo && dados.codigo !== existente.codigo) {
      if (await qqpRepository.buscarItemPorCodigo(contratoId, dados.codigo, existente.escopo_tac, tx)) {
        throw new AppError(409, `Já existe um item do QQP com o código ${dados.codigo} neste contrato/TAC.`);
      }
    }
    return qqpRepository.atualizarItem(contratoId, itemId, dados, tx);
  });
  return { ...formatarItem(resultado), qqp_revisao: revisao };
}

/** DELETE /api/contratos/:id/qqp/:itemId?qqp_revisao= — só sem recursos de obra nem projeções usando o item. */
async function excluirItem(idParam, itemIdParam, usuario, revisaoParam) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'excluir itens do QQP');
  const contratoId = await garantirContrato(idParam);
  const itemId = validarId(itemIdParam, 'itemId');

  const { revisao } = await gravarComRevisao(contratoId, revisaoParam, async (tx) => {
    const existente = await qqpRepository.buscarItem(contratoId, itemId, tx);
    if (!existente) throw new AppError(404, `Item ${itemId} do QQP não encontrado neste contrato.`);
    if (existente._count.recursos > 0) {
      throw new AppError(
        409,
        `O item ${existente.codigo} está em uso em ${existente._count.recursos} alocação(ões) de obra. Desative-o em vez de excluir.`
      );
    }
    if (existente._count.projecoes > 0) {
      throw new AppError(
        409,
        `O item ${existente.codigo} está em uso em ${existente._count.projecoes} projeção(ões) de BMM. Desative-o em vez de excluir.`
      );
    }
    await qqpRepository.excluirItem(contratoId, itemId, tx);
  });
  return { id: itemId, excluido: true, qqp_revisao: revisao };
}

/** Valida a ordem personalizada { categorias: [], grupos: {}, subgrupos: {} } (listas de textos). */
function validarOrdem(ordem) {
  const listaDeTextos = (lista) =>
    Array.isArray(lista) && lista.length <= 2000 && lista.every((v) => typeof v === 'string' && v.length <= 500);
  const mapaDeListas = (mapa) =>
    Boolean(mapa) && typeof mapa === 'object' && !Array.isArray(mapa) && Object.keys(mapa).length <= 2000 && Object.values(mapa).every(listaDeTextos);
  if (!ordem || typeof ordem !== 'object' || !listaDeTextos(ordem.categorias) || !mapaDeListas(ordem.grupos) || !mapaDeListas(ordem.subgrupos)) {
    throw new AppError(400, 'Ordem de visualização inválida: informe { categorias: [], grupos: {}, subgrupos: {} }.');
  }
  return { categorias: ordem.categorias, grupos: ordem.grupos, subgrupos: ordem.subgrupos };
}

/** PUT /api/contratos/:id/qqp/ordem — { ordem, qqp_revisao } */
async function salvarOrdem(idParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_GEREM_QQP, 'personalizar a visualização do QQP');
  const contratoId = await garantirContrato(idParam);
  const ordem = validarOrdem(payload.ordem);
  const { revisao } = await gravarComRevisao(contratoId, payload.qqp_revisao, (tx) => qqpRepository.salvarOrdem(contratoId, ordem, tx));
  return { ordem, qqp_revisao: revisao };
}

/* -------------------------------------------------------------------------- */
/* Recursos planejados da obra                                                */
/* -------------------------------------------------------------------------- */

async function garantirObraComContrato(obraIdParam) {
  const obraId = validarId(obraIdParam);
  const obra = await qqpRepository.contratoDaObra(obraId);
  if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);
  if (!obra.contrato_id) {
    throw new AppError(409, 'Vincule a obra a um contrato com QQP antes de planejar os recursos.');
  }
  return { obraId, contratoId: obra.contrato_id };
}

/**
 * Valida os campos de uma alocação (completa) e devolve o que deve ser gravado.
 * `estado` é o recurso já com as alterações aplicadas.
 */
function validarAlocacao(estado, item) {
  const dados = {
    item_id: item.id,
    quantidade: numeroPositivo(estado.quantidade, 'quantidade', 3),
    data_inicio: parseData(estado.data_inicio, 'data_inicio'),
    inclui_sabados: Boolean(estado.inclui_sabados),
    observacao: estaVazio(estado.observacao) ? null : String(estado.observacao).trim(),
    horas_dia: null,
    data_fim: null,
  };

  if (item.unidade !== 'UNIDADE') {
    dados.data_fim = parseData(estado.data_fim, 'data_fim');
    if (dados.data_fim < dados.data_inicio) {
      throw new AppError(400, 'A data de fim da alocação não pode ser anterior à data de início.');
    }
  }
  if (item.unidade === 'HORA' && !estaVazio(estado.horas_dia)) {
    const horas = Number(estado.horas_dia);
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
      throw new AppError(400, 'O campo "horas_dia" deve ficar entre 0 e 24.');
    }
    dados.horas_dia = Math.round(horas * 100) / 100;
  }
  return dados;
}

async function carregarItemDoContrato(contratoId, itemIdParam, { exigirAtivo }) {
  const itemId = validarId(itemIdParam, 'item_id');
  const item = await qqpRepository.buscarItem(contratoId, itemId);
  if (!item) throw new AppError(400, `O item ${itemId} não pertence ao QQP do contrato da obra.`);
  if (exigirAtivo && !item.ativo) throw new AppError(400, `O item ${item.codigo} está desativado no QQP.`);
  return item;
}

/** GET /api/obras/:id/recursos-qqp — alocações + custo projetado por ciclo. */
async function listarRecursos(obraIdParam, usuario) {
  validarUsuario(usuario);
  const obraId = validarId(obraIdParam);
  const obra = await qqpRepository.contratoDaObra(obraId);
  if (!obra) throw new AppError(404, `Obra ${obraId} não encontrada.`);

  const recursos = await qqpRepository.listarRecursosDaObra(obraId);
  const projecao = projetarCustosQqp(recursos);
  const custoPorRecurso = new Map(projecao.por_recurso.map((linha) => [linha.recurso_id, linha]));

  return {
    contrato_id: obra.contrato_id,
    data: recursos.map((recurso) => ({
      ...formatarRecurso(recurso),
      dias_uteis: custoPorRecurso.get(recurso.id)?.dias_uteis ?? 0,
      custo_total: custoPorRecurso.get(recurso.id)?.custo_total ?? 0,
    })),
    totais: projecao.totais,
  };
}

/** POST /api/obras/:id/recursos-qqp */
async function criarRecurso(obraIdParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_PLANEJAM_RECURSOS, 'planejar recursos da obra');
  const { obraId, contratoId } = await garantirObraComContrato(obraIdParam);
  const item = await carregarItemDoContrato(contratoId, payload.item_id, { exigirAtivo: true });
  const dados = validarAlocacao(payload, item);
  return formatarRecurso(await qqpRepository.criarRecurso(obraId, dados));
}

/** PUT /api/obras/:id/recursos-qqp/:recursoId */
async function atualizarRecurso(obraIdParam, recursoIdParam, payload = {}, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_PLANEJAM_RECURSOS, 'planejar recursos da obra');
  const { obraId, contratoId } = await garantirObraComContrato(obraIdParam);
  const recursoId = validarId(recursoIdParam, 'recursoId');

  const existente = await qqpRepository.buscarRecurso(obraId, recursoId);
  if (!existente) throw new AppError(404, `Recurso ${recursoId} não encontrado nesta obra.`);

  const trocouItem = temCampo(payload, 'item_id') && Number(payload.item_id) !== existente.item_id;
  const item = trocouItem
    ? await carregarItemDoContrato(contratoId, payload.item_id, { exigirAtivo: true })
    : existente.item;

  const estado = {
    quantidade: temCampo(payload, 'quantidade') ? payload.quantidade : existente.quantidade,
    horas_dia: temCampo(payload, 'horas_dia') ? payload.horas_dia : existente.horas_dia,
    data_inicio: temCampo(payload, 'data_inicio') ? payload.data_inicio : existente.data_inicio,
    data_fim: temCampo(payload, 'data_fim') ? payload.data_fim : existente.data_fim,
    inclui_sabados: temCampo(payload, 'inclui_sabados') ? payload.inclui_sabados : existente.inclui_sabados,
    observacao: temCampo(payload, 'observacao') ? payload.observacao : existente.observacao,
  };
  const dados = validarAlocacao(estado, item);
  return formatarRecurso(await qqpRepository.atualizarRecurso(obraId, recursoId, dados));
}

/** DELETE /api/obras/:id/recursos-qqp/:recursoId */
async function excluirRecurso(obraIdParam, recursoIdParam, usuario) {
  exigirPerfil(usuario, PERFIS_QUE_PLANEJAM_RECURSOS, 'planejar recursos da obra');
  const obraId = validarId(obraIdParam);
  const recursoId = validarId(recursoIdParam, 'recursoId');
  if (!(await qqpRepository.excluirRecurso(obraId, recursoId))) {
    throw new AppError(404, `Recurso ${recursoId} não encontrado nesta obra.`);
  }
  return { id: recursoId, excluido: true };
}

module.exports = {
  PERFIS_QUE_GEREM_QQP,
  PERFIS_QUE_PLANEJAM_RECURSOS,
  CATEGORIAS,
  UNIDADES,
  listarItens,
  criarItem,
  atualizarItem,
  excluirItem,
  salvarOrdem,
  montarArvore,
  itensComTotais,
  carregarEstado,
  lerEscopo,
  garantirEscopoDoContrato,
  rotuloEscopo,
  gravarComRevisao,
  decimalExato,
  textoOpcional,
  lerCodigo,
  formatarItem,
  exigirPerfil,
  validarUsuario,
  validarId,
  listarRecursos,
  criarRecurso,
  atualizarRecurso,
  excluirRecurso,
};
