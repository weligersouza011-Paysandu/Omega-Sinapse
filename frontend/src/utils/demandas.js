/* -------------------------------------------------------------------------- */
/* Domínio da Gestão de Demandas (espelha os enums de /api/tarefas)           */
/* -------------------------------------------------------------------------- */

/** Status da tarefa, na ordem do fluxo. `kanban` indica se vira coluna. */
export const STATUS_DEMANDA = [
  {
    value: 'A_FAZER',
    label: 'A Fazer',
    hex: '#64748b',
    cor: 'bg-slate-100 text-slate-700 border-slate-300',
    kanban: true,
  },
  {
    value: 'EM_ANDAMENTO',
    label: 'Em Andamento',
    hex: '#2563eb',
    cor: 'bg-blue-50 text-blue-700 border-blue-200',
    kanban: true,
  },
  {
    value: 'CONCLUIDO',
    label: 'Concluído',
    hex: '#059669',
    cor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    kanban: true,
  },
  {
    value: 'CANCELADO',
    label: 'Cancelado',
    hex: '#94a3b8',
    cor: 'bg-slate-50 text-slate-500 border-slate-200',
    kanban: false,
  },
];

export const STATUS_KANBAN = STATUS_DEMANDA.filter((status) => status.kanban);

export const PRIORIDADES = [
  { value: 'BAIXA', label: 'Baixa', cor: 'bg-slate-100 text-slate-600 ring-slate-200' },
  { value: 'MEDIA', label: 'Média', cor: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { value: 'ALTA', label: 'Alta', cor: 'bg-orange-50 text-orange-700 ring-orange-200' },
  { value: 'CRITICA', label: 'Crítica', cor: 'bg-red-600 text-white ring-red-600' },
];

/** Dias da semana na ordem de uma semana de trabalho. */
export const DIAS_SEMANA = [
  { value: 'SEGUNDA', label: 'Toda Segunda-feira', curto: 'segunda' },
  { value: 'TERCA', label: 'Toda Terça-feira', curto: 'terça' },
  { value: 'QUARTA', label: 'Toda Quarta-feira', curto: 'quarta' },
  { value: 'QUINTA', label: 'Toda Quinta-feira', curto: 'quinta' },
  { value: 'SEXTA', label: 'Toda Sexta-feira', curto: 'sexta' },
  { value: 'SABADO', label: 'Todo Sábado', curto: 'sábado' },
  { value: 'DOMINGO', label: 'Todo Domingo', curto: 'domingo' },
];

/**
 * Capacidade semanal de referência por colaborador (demandas ativas que vencem
 * na semana). Base da barra de ocupação do painel de carga.
 */
export const CAPACIDADE_SEMANAL = 10;

export const FILTROS_TIPO = [
  { value: '', label: 'Todas' },
  { value: 'FIXA_RECORRENTE', label: 'Fixas/Rotinas' },
  { value: 'AVULSA', label: 'Avulsas' },
];

/** Perfis que gerenciam as demandas de toda a equipe (espelha o back-end). */
export const PERFIS_GESTORES = ['SUPERVISOR', 'ADMIN'];

export function obterStatusDemanda(valor) {
  return STATUS_DEMANDA.find((status) => status.value === valor) || STATUS_DEMANDA[0];
}

export function obterPrioridade(valor) {
  return PRIORIDADES.find((prioridade) => prioridade.value === valor) || PRIORIDADES[1];
}

/** "Fixa · Toda segunda às 18:00" (rotina semanal) ou "Avulsa" (demanda extra pontual). */
export function rotuloTipo(tarefa) {
  if (tarefa?.tipo !== 'FIXA_RECORRENTE') return 'Avulsa';
  const dia = DIAS_SEMANA.find((item) => item.value === tarefa.dia_recorrencia);
  if (!dia) return 'Fixa';
  const artigo = ['SABADO', 'DOMINGO'].includes(dia.value) ? 'Todo' : 'Toda';
  const hora = tarefa.hora_recorrencia ? ` às ${tarefa.hora_recorrencia}` : '';
  return `Fixa · ${artigo} ${dia.curto}${hora}`;
}

/** Motivos padronizados de atraso (espelha CategoriaJustificativa do back-end). */
export const CATEGORIAS_JUSTIFICATIVA = [
  { value: 'SOLICITACAO_EXTRA', label: 'Solicitação extra' },
  { value: 'DEMANDA_FORA_ROTINA', label: 'Demanda fora da rotina' },
  { value: 'DEPENDENCIA_EXTERNA', label: 'Dependência externa (cliente, campo, outras áreas)' },
  { value: 'MUDANCA_ESCOPO', label: 'Mudança de escopo ou prioridade' },
  { value: 'PROBLEMA_TECNICO', label: 'Problema técnico / indisponibilidade de dados' },
  { value: 'OUTROS', label: 'Outros' },
];

export function rotuloCategoria(valor) {
  return CATEGORIAS_JUSTIFICATIVA.find((item) => item.value === valor)?.label || valor || '';
}

/**
 * Aderência por pontualidade (espelha src/utils/aderenciaDemanda.js): 100% no
 * prazo e -0,5 ponto a cada 30 minutos completos de atraso, com piso em 0%.
 */
export function calcularAderencia(vencimento, entrega = new Date()) {
  const atrasoMs = new Date(entrega).getTime() - new Date(vencimento).getTime();
  const blocos = atrasoMs > 0 ? Math.floor(Math.floor(atrasoMs / 60000) / 30) : 0;
  return Math.max(0, 100 - blocos * 0.5);
}

/** "99,5%" / "100%". */
export function formatarAderencia(valor) {
  if (valor === null || valor === undefined) return '—';
  return `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** Referência curta da obra vinculada (OSI, SS ou PEP). */
export function referenciaObra(obra) {
  if (!obra) return null;
  return obra.osi_numero || obra.orcamento?.ss || obra.orcamento?.pep || `Obra #${obra.id}`;
}

export function podeEditar(tarefa, usuario) {
  if (!tarefa || !usuario) return false;
  return PERFIS_GESTORES.includes(usuario.perfil) || tarefa.usuario_id === usuario.id;
}

/** "aaaa-mm-ddThh:mm" local de uma data (para inputs type="datetime-local"). */
export function dataHoraInputLocal(valor) {
  const data = dataInputLocal(valor);
  if (!data) return '';
  const instante = new Date(valor);
  const hora = String(instante.getHours()).padStart(2, '0');
  const minuto = String(instante.getMinutes()).padStart(2, '0');
  return `${data}T${hora}:${minuto}`;
}

/** "aaaa-mm-dd" local de uma data (para inputs type="date"). */
export function dataInputLocal(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function formatarDiaMes(data) {
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/**
 * Farol de prazo da demanda (mesmas faixas do back-end):
 * verde (> 24h), amarelo (vence hoje / < 24h), vermelho (vencida, com os dias
 * de atraso) e cinza (concluída ou cancelada).
 */
export function farolDaTarefa(tarefa, agora = new Date()) {
  const vencimento = new Date(tarefa.data_vencimento);
  const restante = vencimento.getTime() - agora.getTime();

  if (tarefa.status === 'CANCELADO') {
    return { cor: 'cinza', rotulo: 'Cancelada', detalhe: `Vencimento ${formatarDiaMes(vencimento)}` };
  }

  if (tarefa.status === 'CONCLUIDO') {
    const concluidoEm = tarefa.concluido_em ? new Date(tarefa.concluido_em) : null;
    const atrasada = concluidoEm && concluidoEm > vencimento;
    return {
      cor: 'cinza',
      rotulo: atrasada ? 'Concluída com atraso' : 'Concluída no prazo',
      detalhe: concluidoEm ? `em ${formatarDiaMes(concluidoEm)}` : '',
      atrasada: Boolean(atrasada),
    };
  }

  if (restante < 0) {
    const dias = Math.max(1, Math.ceil(-restante / DIA_MS));
    return {
      cor: 'vermelho',
      rotulo: `Vencida há ${dias} dia${dias === 1 ? '' : 's'}`,
      detalhe: `Venceu ${formatarDiaMes(vencimento)}`,
      diasAtraso: dias,
    };
  }

  if (restante <= DIA_MS) {
    const venceHoje = dataInputLocal(vencimento) === dataInputLocal(agora);
    const horas = Math.max(1, Math.floor(restante / HORA_MS));
    return {
      cor: 'amarelo',
      rotulo: venceHoje ? 'Vence hoje' : `Vence em ${horas}h`,
      detalhe: formatarDiaMes(vencimento),
    };
  }

  const dias = Math.ceil(restante / DIA_MS);
  return {
    cor: 'verde',
    rotulo: 'No prazo',
    detalhe: `Vence ${formatarDiaMes(vencimento)}${dias <= 7 ? ` · ${dias}d` : ''}`,
  };
}

/** Conclusão após o vencimento exige justificativa (regra do back-end). */
export function exigeJustificativa(tarefa, agora = new Date()) {
  return agora.getTime() > new Date(tarefa.data_vencimento).getTime();
}

/** Iniciais do nome para o avatar. */
export function iniciais(nome) {
  return (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}
