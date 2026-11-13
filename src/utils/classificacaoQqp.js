'use strict';

/**
 * Regras para classificar itens de planilhas do QQP (sistema Projeção Financeira ou
 * template do Synapse) nas categorias/unidades que o cálculo do Synapse usa.
 * Usadas pela importação XLSX do QQP e pela cópia do QQP do Projeção (Fase 2).
 *
 * Cada função devolve `null` quando o texto não permite decidir com segurança;
 * quem chama decide se aplica o padrão ou manda o item para revisão.
 */

const CATEGORIAS = ['HH', 'EQUIPAMENTO', 'INSUMO', 'OUTROS'];
const UNIDADES = ['HORA', 'DIA', 'MES', 'UNIDADE'];

/** Texto sem acentos, minúsculo e com espaços simples. */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unidade (enum) a partir do texto da planilha:
 * mês/mes/mensal → MES; h/hora/hh → HORA; dia/diária → DIA; un/unidade/vb/verba → UNIDADE.
 * Outros textos (m², kg, m³...) → null (o chamador decide; na importação viram UNIDADE).
 */
function unidadeDoTexto(texto) {
  const t = normalizar(texto).replace(/[.\s]/g, '');
  if (!t) return null;
  if (UNIDADES.includes(t.toUpperCase())) return t.toUpperCase();
  if (/^(mes|meses|mensal|mensalidade|m[eê]s)$/.test(t)) return 'MES';
  if (/^(h|hr|hrs|hora|horas|hh|h\/h|homemhora)$/.test(t)) return 'HORA';
  if (/^(d|dia|dias|diaria|diarias)$/.test(t)) return 'DIA';
  if (/^(un|und|unid|unidade|unidades|pc|pç|peca|pecas|vb|verba|cj|conjunto|servico|sv)$/.test(t)) return 'UNIDADE';
  return null;
}

/**
 * Categoria (enum) a partir da categoria/grupo da planilha e da unidade já decidida:
 *  - "Price list de materiais" / materiais / insumos → INSUMO;
 *  - mão de obra cobrada por hora → HH;
 *  - máquinas, equipamentos, veículos (ou "Locação…" sem ser mão de obra por hora) → EQUIPAMENTO;
 *  - sem pista → null.
 */
function categoriaDoTexto({ categoria, grupo, subgrupo, descricao } = {}, unidade = null) {
  const textos = [categoria, grupo, subgrupo].map(normalizar).join(' | ');
  const descricaoNorm = normalizar(descricao);
  if (!textos.replace(/[|\s]/g, '') && !descricaoNorm) return null;

  if (/price ?list|materia(l|is)|insumo/.test(textos)) return 'INSUMO';

  const EQUIPAMENTO = /maquina|equipamento|veiculo|caminhao|guindaste|munck|ferramenta|onibus|van\b/;
  const maoDeObra = /mao de obra|\bhh\b|homem.?hora|profissiona|tecnic/.test(textos);
  // Grupo/subgrupo dizem o que é o item; a categoria da planilha costuma misturar
  // ("Locação de Máquinas, Equipamentos e Mão de Obra").
  const grupoEquipamento = EQUIPAMENTO.test(`${normalizar(grupo)} ${normalizar(subgrupo)}`);

  if (grupoEquipamento) return 'EQUIPAMENTO';
  if (maoDeObra && unidade === 'HORA') return 'HH';
  if (EQUIPAMENTO.test(textos) || /locacao/.test(textos)) return maoDeObra ? null : 'EQUIPAMENTO';
  if (maoDeObra) return 'HH';
  return null;
}

/** Texto livre ("HH", "Equipamento", "insumo"...) → enum de categoria, ou null. */
function categoriaInformada(texto) {
  const t = normalizar(texto).replace(/[^a-z]/g, '');
  if (!t) return null;
  if (t === 'hh' || t.startsWith('maodeobra')) return 'HH';
  if (t.startsWith('equip')) return 'EQUIPAMENTO';
  if (t.startsWith('insumo') || t.startsWith('materia')) return 'INSUMO';
  if (t.startsWith('outro')) return 'OUTROS';
  return null;
}

/** Texto livre ("HORA", "por mês", "Mensal"...) → enum de unidade, ou null. */
function unidadeInformada(texto) {
  const t = normalizar(texto).replace(/^por /, '');
  if (!t) return null;
  return unidadeDoTexto(t);
}

module.exports = {
  CATEGORIAS,
  UNIDADES,
  normalizar,
  unidadeDoTexto,
  categoriaDoTexto,
  categoriaInformada,
  unidadeInformada,
};
