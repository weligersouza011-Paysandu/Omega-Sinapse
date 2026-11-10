/**
 * Status do orçamento — espelham o enum StatusOrcamento do back-end e a ordem
 * do fluxo operacional validado pela engenharia.
 *
 * Hierarquia semântica de cores (maturidade do processo):
 *   VISITA_TECNICA       cinza/azul neutro — inicial/informativo
 *   AGUARDANDO_APROVACAO amarelo/laranja   — em análise/atenção
 *   APROVADO             verde             — aprovado/pronto
 *   DESATIVADO           vermelho          — desaprovado/cancelado
 *
 * - `descricao`: nomenclatura oficial exibida nos dropdowns (cadastro e filtro).
 * - `label`: versão curta usada nas badges da listagem e do Kanban.
 * - `cor`: classes Tailwind das badges (fundo + texto + borda).
 * - `hex`: cor sólida usada nos gráficos do Dashboard BI.
 */
export const STATUS_OPCOES = [
  {
    value: 'VISITA_TECNICA',
    descricao: 'Visita Técnica',
    label: 'Visita Técnica',
    cor: 'bg-slate-100 text-slate-700 border-slate-300',
    hex: '#64748b',
  },
  {
    value: 'AGUARDANDO_APROVACAO',
    descricao: 'Aguardando Aprovação (Orçamento Enviado)',
    label: 'Aguardando Aprovação',
    cor: 'bg-amber-100 text-amber-800 border-amber-300',
    hex: '#f59e0b',
  },
  {
    value: 'APROVADO',
    descricao: 'Orçamento Aprovado',
    label: 'Aprovado',
    cor: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    hex: '#10b981',
  },
  {
    value: 'DESATIVADO',
    descricao: 'Desativado',
    label: 'Desativado',
    cor: 'bg-red-100 text-red-700 border-red-300',
    hex: '#ef4444',
  },
];

/** Estado inicial de todo orçamento recém-aberto. */
export const STATUS_INICIAL = 'VISITA_TECNICA';

/**
 * Escopo COMERCIAL — as quatro etapas sob responsabilidade do Técnico
 * Orçamentista (levantamento → envio → decisão).
 *
 * É o recorte padrão da listagem e o único conjunto de colunas do Kanban de
 * Orçamentos. As etapas de OSI pertencem ao módulo de Planejamento
 * (Supervisor/Coordenador + Planejadores) e ficam fora dessa visualização.
 */
export const STATUS_COMERCIAL = ['VISITA_TECNICA', 'AGUARDANDO_APROVACAO', 'APROVADO', 'DESATIVADO'];

/** Opções de status do ciclo comercial, na ordem oficial do processo. */
export const OPCOES_COMERCIAL = STATUS_OPCOES.filter((opcao) => STATUS_COMERCIAL.includes(opcao.value));

/**
 * Escopo OBRAS — etapas de efetivação e execução (aprovado em diante).
 *
 * É o recorte da seção de Obras: o orçamento deixa o ciclo comercial e passa a
 * ser um projeto em execução, conduzido pelo Supervisor/Coordenador de
 * Planejamento e pelos Planejadores (emissão da OSI e RDO).
 */
export const STATUS_OBRAS = ['APROVADO'];

/**
 * Ciclo de vida OPERACIONAL da obra (espelha o enum StatusObra do back-end).
 *
 * Substitui o funil comercial na aba de Obras: depois de aprovado, o projeto
 * passa a ser acompanhado pela execução em campo, com governança ISO 9001
 * (documentação de partida obrigatória antes de iniciar).
 */
export const STATUS_OBRA_OPCOES = [
  {
    value: 'PARA_INICIAR',
    descricao: 'Para Iniciar',
    label: 'Para Iniciar',
    cor: 'bg-slate-100 text-slate-700 border-slate-300',
    hex: '#64748b',
  },
  {
    value: 'EM_ANDAMENTO',
    descricao: 'Em Andamento',
    label: 'Em Andamento',
    cor: 'bg-blue-100 text-blue-700 border-blue-300',
    hex: '#3b82f6',
  },
  {
    value: 'PARALISADA',
    descricao: 'Paralisada',
    label: 'Paralisada',
    cor: 'bg-amber-100 text-amber-800 border-amber-300',
    hex: '#f59e0b',
  },
  {
    value: 'CONCLUIDA',
    descricao: 'Concluída',
    label: 'Concluída',
    cor: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    hex: '#10b981',
  },
];

/**
 * Régua de pendências documentais obrigatórias (ISO 9001) — usada no filtro
 * rápido do painel de Obras. Espelha os valores aceitos pelo back-end
 * (`?pendencia=`).
 */
export const OPCOES_PENDENCIA = [
  { value: 'pendentes', label: 'Com pendências', descricao: 'Com pendências (OSI e/ou Ata)' },
  { value: 'osi', label: 'OSI pendente', descricao: 'OSI pendente' },
  { value: 'ata', label: 'Ata pendente', descricao: 'Ata de Partida pendente' },
  { value: 'ok', label: 'Documentação completa', descricao: 'Documentação completa' },
];

/** Natureza da revisão de valor (espelha o enum TipoAlteracaoRevisao). */
export const TIPOS_ALTERACAO_REVISAO = [
  {
    value: 'REVISAO_SUBSTITUTIVA',
    descricao: 'Revisão (Substitui valor anterior)',
    label: 'Revisão',
    cor: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    value: 'ADITIVO_FINANCEIRO',
    descricao: 'Aditivo (Soma ao orçamento)',
    label: 'Aditivo',
    cor: 'bg-violet-50 text-violet-700 border-violet-200',
  },
];

/** Situação de aprovação da revisão (espelha o enum StatusAprovacaoRevisao). */
export const STATUS_APROVACAO_REVISAO = [
  { value: 'PENDENTE', label: 'Pendente', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'APROVADO', label: 'Aprovado', cor: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'REJEITADO', label: 'Rejeitado', cor: 'bg-red-100 text-red-700 border-red-300' },
];

const DESCONHECIDO = {
  value: 'DESCONHECIDO',
  label: '—',
  cor: 'bg-slate-100 text-slate-500 border-slate-300',
  hex: '#94a3b8',
};

/**
 * Dados visuais de um status — resolve tanto os status comerciais do orçamento
 * quanto os status operacionais da obra.
 */
export function obterStatus(valor) {
  // Etapas antigas de OSI não existem mais no orçamento: valem como aprovado.
  const chave = valor === 'ENCAMINHADO_OSI' || valor === 'OSI_EMITIDA' ? 'APROVADO' : valor;
  return (
    STATUS_OPCOES.find((opcao) => opcao.value === chave) ||
    STATUS_OBRA_OPCOES.find((opcao) => opcao.value === valor) || {
      ...DESCONHECIDO,
      descricao: valor || '—',
    }
  );
}
