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

/** "2026-12-10T13:30:00.000Z" → "2026-12-10T10:30" (horário de Brasília, para input datetime-local). */
export function isoParaLocal(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 16);
}

/** "2026-12-10T10:30" (Brasília) → ISO com fuso. */
export function localParaIso(valor) {
  return valor ? `${valor}:00-03:00` : null;
}

export function minutosParaTexto(minutos) {
  if (minutos === null || minutos === undefined) return 'aguardando liberação';
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
}

export function numeroOuVazio(valor) {
  return valor === null || valor === undefined ? '' : String(valor);
}

export const formVazio = (data) => ({
  data,
  clima_manha: '',
  clima_tarde: '',
  clima_noite: '',
  dss_tema: '',
  dss_participantes: '',
  comentario_geral: '',
  atividades: [],
  equipamentos: [],
  pts: [],
  desvios: [],
});

export const atividadeVazia = () => ({
  chave: novaChave(),
  id: null,
  obra_id: '',
  codigo_atividade: '',
  descricao_snapshot: '',
  fora_de_escopo: false,
  percentual_anterior: 0,
  percentual_declarado: '',
  observacao: '',
  mao_obra: [],
  fotos: [],
});

export const maoObraVazia = () => ({ chave: novaChave(), tipo: 'FUNCAO', funcao_id: '', colaborador_id: '', quantidade: '1', horas: '8' });

/** Resposta da API → estado do formulário. */
export function rdoParaForm(rdo) {
  return {
    data: String(rdo.data).slice(0, 10),
    clima_manha: rdo.clima_manha || '',
    clima_tarde: rdo.clima_tarde || '',
    clima_noite: rdo.clima_noite || '',
    dss_tema: rdo.dss_tema || '',
    dss_participantes: numeroOuVazio(rdo.dss_participantes),
    comentario_geral: rdo.comentario_geral || '',
    atividades: rdo.atividades.map((a) => ({
      chave: novaChave(),
      id: a.id,
      obra_id: String(a.obra_id),
      codigo_atividade: a.codigo_atividade || '',
      descricao_snapshot: a.descricao_snapshot,
      fora_de_escopo: a.fora_de_escopo,
      percentual_anterior: Number(a.percentual_anterior),
      percentual_declarado: numeroOuVazio(a.percentual_declarado),
      percentual_validado: a.percentual_validado === null ? null : Number(a.percentual_validado),
      observacao: a.observacao || '',
      hh: a.hh,
      fotos: a.fotos,
      obra: a.obra,
      mao_obra: a.mao_obra.map((m) => ({
        chave: novaChave(),
        tipo: m.tipo,
        funcao_id: m.funcao_id ? String(m.funcao_id) : '',
        colaborador_id: m.colaborador_id ? String(m.colaborador_id) : '',
        quantidade: numeroOuVazio(m.quantidade),
        horas: numeroOuVazio(m.horas),
        funcao: m.funcao,
        colaborador: m.colaborador,
      })),
    })),
    equipamentos: rdo.equipamentos.map((e) => ({
      chave: novaChave(),
      equipamento_id: String(e.equipamento_id),
      horas_trabalhadas: numeroOuVazio(e.horas_trabalhadas),
      horas_paradas: numeroOuVazio(e.horas_paradas),
      observacao: e.observacao || '',
    })),
    pts: rdo.pts.map((p) => ({
      chave: novaChave(),
      numero: p.numero || '',
      solicitado_em: isoParaLocal(p.solicitado_em),
      liberado_em: isoParaLocal(p.liberado_em),
    })),
    desvios: rdo.desvios.map((d) => ({ chave: novaChave(), motivo_id: String(d.motivo_id), horas: numeroOuVazio(d.horas), observacao: d.observacao || '' })),
  };
}

const idOuNulo = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Estado do formulário → corpo da API. */
export function formParaPayload(form) {
  return {
    data: form.data,
    clima_manha: form.clima_manha,
    clima_tarde: form.clima_tarde,
    clima_noite: form.clima_noite,
    dss_tema: form.dss_tema,
    dss_participantes: form.dss_participantes === '' ? null : Number(form.dss_participantes),
    comentario_geral: form.comentario_geral,
    atividades: form.atividades.map((a) => ({
      id: a.id,
      obra_id: Number(a.obra_id),
      fora_de_escopo: a.fora_de_escopo,
      codigo_atividade: a.fora_de_escopo ? null : a.codigo_atividade,
      descricao: a.fora_de_escopo ? a.descricao_snapshot : undefined,
      percentual_declarado: a.fora_de_escopo ? 0 : a.percentual_declarado,
      observacao: a.observacao,
      mao_obra: a.mao_obra.map((m) => ({
        tipo: m.tipo,
        funcao_id: m.tipo === 'FUNCAO' ? idOuNulo(m.funcao_id) : null,
        colaborador_id: m.tipo === 'NOMINAL' ? idOuNulo(m.colaborador_id) : null,
        quantidade: m.tipo === 'FUNCAO' ? m.quantidade : 1,
        horas: m.horas,
      })),
    })),
    equipamentos: form.equipamentos.map((e) => ({
      equipamento_id: idOuNulo(e.equipamento_id),
      horas_trabalhadas: e.horas_trabalhadas || 0,
      horas_paradas: e.horas_paradas || 0,
      observacao: e.observacao,
    })),
    pts: form.pts.map((p) => ({ numero: p.numero, solicitado_em: localParaIso(p.solicitado_em), liberado_em: localParaIso(p.liberado_em) })),
    desvios: form.desvios.map((d) => ({ motivo_id: idOuNulo(d.motivo_id), horas: d.horas, observacao: d.observacao })),
  };
}
