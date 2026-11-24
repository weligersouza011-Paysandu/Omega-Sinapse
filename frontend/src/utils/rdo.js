/** Utilidades do módulo RDO: rótulos, cores e conversão entre a API e o formulário. */

export const STATUS_RDO = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  FINALIZADO: { label: 'Aguardando validação', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
  APROVADO: { label: 'Aprovado', cor: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  DEVOLVIDO: { label: 'Devolvido', cor: 'bg-red-100 text-red-700 border-red-300' },
};

export const OPCOES_CLIMA = ['Ensolarado', 'Nublado', 'Chuva fraca', 'Chuva forte', 'Vento forte', 'Sem expediente'];

export const PERFIS_CAMPO = ['ENCARREGADO', 'ADMIN'];
export const PERFIS_VALIDADORES = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];
export const PERFIS_CADASTRO = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

let contador = 0;
/** Chave estável de linha para listas editáveis (React). */
export const novaChave = () => `k${(contador += 1)}`;

export function minutosParaTexto(minutos) {
  if (minutos === null || minutos === undefined) return 'aguardando liberação';
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
}

export function numeroOuVazio(valor) {
  return valor === null || valor === undefined ? '' : String(valor);
}

/** Minutos → "HH:MM" (ex.: 80 → "01:20"). */
export function formatarHHMM(minutos) {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "HH:MM" → minutos ("" ou inválido → 0). */
export function hhmmParaMinutos(texto) {
  const [h, m] = String(texto || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

/** Minutos entre duas horas "HH:MM" do mesmo dia; null se faltar uma ou a liberação for anterior. */
export function esperaEntreHoras(solicitacao, liberacao) {
  if (!solicitacao || !liberacao) return null;
  const [h1, m1] = solicitacao.split(':').map(Number);
  const [h2, m2] = liberacao.split(':').map(Number);
  const minutos = h2 * 60 + m2 - (h1 * 60 + m1);
  return minutos >= 0 ? minutos : null;
}

export const formVazio = (data) => ({
  obra_id: '',
  data,
  supervisor_id: '',
  clima_manha: '',
  clima_tarde: '',
  clima_noite: '',
  dss_tema: '',
  dss_participantes: '',
  comentario_geral: '',
  pts_necessaria: null,
  desvios_observacao: '',
  efetivo: [],
  atividades: [],
  equipamentos: [],
  pts: { hora_solicitacao: '', hora_liberacao: '', emitente: '' },
  desvios: [],
});

export const atividadeVazia = () => ({
  chave: novaChave(),
  id: null,
  codigo_atividade: '',
  descricao_snapshot: '',
  fora_de_escopo: false,
  justificativa: '',
  concluida: false,
  percentual_anterior: 0,
  percentual_declarado: '',
  percentual_validado: null,
  observacao: '',
  mao_obra: [],
  fotos: [],
});

export const maoObraVazia = () => ({ chave: novaChave(), pessoa: '', quantidade: '1', horas: '8' });

/** Chave de uma pessoa do efetivo: "F<funcao_id>" (por função) ou "N<colaborador_id>" (nominal). */
export const chaveEfetivo = (e) => (e.tipo === 'FUNCAO' ? `F${e.funcao_id}` : `N${e.colaborador_id}`);

/** Resposta da API → estado do formulário. */
export function rdoParaForm(rdo) {
  return {
    obra_id: String(rdo.obra_id),
    data: String(rdo.data).slice(0, 10),
    supervisor_id: rdo.supervisor_id ? String(rdo.supervisor_id) : '',
    clima_manha: rdo.clima_manha || '',
    clima_tarde: rdo.clima_tarde || '',
    clima_noite: rdo.clima_noite || '',
    dss_tema: rdo.dss_tema || '',
    dss_participantes: numeroOuVazio(rdo.dss_participantes),
    comentario_geral: rdo.comentario_geral || '',
    pts_necessaria: rdo.pts_necessaria,
    desvios_observacao: rdo.desvios_observacao || '',
    efetivo: rdo.efetivo.map((e) => ({
      chave: novaChave(),
      tipo: e.tipo,
      funcao_id: e.funcao_id ? String(e.funcao_id) : '',
      colaborador_id: e.colaborador_id ? String(e.colaborador_id) : '',
      quantidade: numeroOuVazio(e.quantidade),
      nome: e.tipo === 'FUNCAO' ? e.funcao?.nome : e.colaborador?.nome,
    })),
    atividades: rdo.atividades.map((a) => ({
      chave: novaChave(),
      id: a.id,
      codigo_atividade: a.codigo_atividade || '',
      descricao_snapshot: a.descricao_snapshot,
      fora_de_escopo: a.fora_de_escopo,
      justificativa: a.justificativa || '',
      concluida: !a.fora_de_escopo && Number(a.percentual_anterior) >= 100,
      percentual_anterior: Number(a.percentual_anterior),
      percentual_declarado: numeroOuVazio(a.percentual_declarado),
      percentual_validado: a.percentual_validado === null ? null : Number(a.percentual_validado),
      observacao: a.observacao || '',
      hh: a.hh,
      fotos: a.fotos,
      mao_obra: a.mao_obra.map((m) => ({
        chave: novaChave(),
        pessoa: m.tipo === 'FUNCAO' ? `F${m.funcao_id}` : `N${m.colaborador_id}`,
        quantidade: numeroOuVazio(m.quantidade),
        horas: numeroOuVazio(m.horas),
      })),
    })),
    equipamentos: rdo.equipamentos.map((e) => ({
      chave: novaChave(),
      equipamento_id: String(e.equipamento_id),
      horas_trabalhadas: numeroOuVazio(e.horas_trabalhadas),
      horas_paradas: numeroOuVazio(e.horas_paradas),
      observacao: e.observacao || '',
    })),
    pts: {
      hora_solicitacao: rdo.pts[0]?.hora_solicitacao || '',
      hora_liberacao: rdo.pts[0]?.hora_liberacao || '',
      emitente: rdo.pts[0]?.emitente || '',
    },
    // Desvios: uma linha por motivo, em minutos (a tela mostra HH:MM).
    desvios: rdo.desvios.map((d) => ({ motivo_id: String(d.motivo_id), descricao: d.motivo?.descricao, minutos: Math.round(Number(d.horas) * 60) })),
  };
}

const idOuNulo = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Estado do formulário → corpo da API. */
export function formParaPayload(form) {
  return {
    obra_id: Number(form.obra_id),
    data: form.data,
    supervisor_id: idOuNulo(form.supervisor_id),
    clima_manha: form.clima_manha,
    clima_tarde: form.clima_tarde,
    clima_noite: form.clima_noite,
    dss_tema: form.dss_tema,
    dss_participantes: form.dss_participantes === '' ? null : Number(form.dss_participantes),
    comentario_geral: form.comentario_geral,
    pts_necessaria: form.pts_necessaria,
    desvios_observacao: form.desvios_observacao,
    efetivo: form.efetivo.map((e) => ({
      tipo: e.tipo,
      funcao_id: e.tipo === 'FUNCAO' ? idOuNulo(e.funcao_id) : null,
      colaborador_id: e.tipo === 'NOMINAL' ? idOuNulo(e.colaborador_id) : null,
      quantidade: e.tipo === 'FUNCAO' ? e.quantidade : 1,
    })),
    atividades: form.atividades.map((a) => ({
      id: a.id,
      fora_de_escopo: a.fora_de_escopo,
      codigo_atividade: a.fora_de_escopo ? null : a.codigo_atividade,
      descricao: a.fora_de_escopo ? a.descricao_snapshot : undefined,
      justificativa: a.fora_de_escopo ? a.justificativa : undefined,
      percentual_declarado: a.fora_de_escopo ? 0 : a.concluida ? 100 : a.percentual_declarado,
      observacao: a.observacao,
      mao_obra: a.mao_obra.map((m) => {
        const nominal = m.pessoa.startsWith('N');
        return {
          tipo: nominal ? 'NOMINAL' : 'FUNCAO',
          funcao_id: nominal ? null : idOuNulo(m.pessoa.slice(1)),
          colaborador_id: nominal ? idOuNulo(m.pessoa.slice(1)) : null,
          quantidade: nominal ? 1 : m.quantidade,
          horas: m.horas,
        };
      }),
    })),
    equipamentos: form.equipamentos.map((e) => ({
      equipamento_id: idOuNulo(e.equipamento_id),
      horas_trabalhadas: e.horas_trabalhadas || 0,
      horas_paradas: e.horas_paradas || 0,
      observacao: e.observacao,
    })),
    pts: form.pts_necessaria && form.pts.hora_solicitacao
      ? [{ hora_solicitacao: form.pts.hora_solicitacao, hora_liberacao: form.pts.hora_liberacao || null, emitente: form.pts.emitente }]
      : [],
    desvios: form.desvios
      .filter((d) => d.minutos > 0)
      .map((d) => ({ motivo_id: idOuNulo(d.motivo_id), horas: Math.round((d.minutos / 60) * 100) / 100 })),
  };
}
