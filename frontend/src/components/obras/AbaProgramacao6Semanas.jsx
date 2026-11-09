import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Unlock,
  User,
  Zap,
} from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import { StatusRestricaoBadge } from '../dashboard/DashboardBadges.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  baixarPlanilhaRdo,
  baixarRestricoesPdf,
  obterLookahead,
  salvarRestricaoAtividade,
} from '../../services/cronogramaApi.js';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';

const TIPOS = [
  ['PROJETOS', 'Projetos'],
  ['SUPRIMENTOS', 'Suprimentos'],
  ['LIBERACAO_AREA', 'Liberação de área'],
  ['SMS', 'SMS'],
  ['EQUIPAMENTO', 'Equipamento'],
];

/** Classes completas (o Tailwind só gera o que aparece literalmente no código). */
const ESTILO_TIPO = {
  PROJETOS: 'border-blue-200 bg-blue-50 text-blue-700',
  SUPRIMENTOS: 'border-orange-200 bg-orange-50 text-orange-700',
  LIBERACAO_AREA: 'border-violet-200 bg-violet-50 text-violet-700',
  SMS: 'border-red-200 bg-red-50 text-red-700',
  EQUIPAMENTO: 'border-cyan-200 bg-cyan-50 text-cyan-700',
};
const ROTULO_TIPO = Object.fromEntries(TIPOS);

/* -------------------------------------------------------------------------- */
/* Recálculo local (feedback instantâneo ao baixar/reabrir uma restrição)      */
/* -------------------------------------------------------------------------- */

const DIA_MS = 24 * 60 * 60 * 1000;

/** Prazo de uma restrição pendente em relação à data de referência do lookahead. */
function prazoLocal(restricao, hoje) {
  const limite = restricao.data_limite ? String(restricao.data_limite).slice(0, 10) : null;
  if (restricao.status !== 'PENDENTE' || !limite) {
    return { vencida: false, dias_atraso: 0, dias_para_vencer: null, sem_prazo: restricao.status === 'PENDENTE' && !limite };
  }
  const dias = Math.round((Date.parse(`${limite}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / DIA_MS);
  return { vencida: dias < 0, dias_atraso: dias < 0 ? -dias : 0, dias_para_vencer: dias >= 0 ? dias : null, sem_prazo: false };
}

function recalcularAtividade(atividade, hoje) {
  const pendentes = atividade.restricoes.filter((r) => r.status === 'PENDENTE');
  const vencidas = pendentes.filter((r) => r.vencida).length;
  return {
    ...atividade,
    status_liberacao: pendentes.length ? 'BLOQUEADA' : 'LIBERADA',
    restricoes_pendentes: pendentes.length,
    restricoes_baixadas: atividade.restricoes.length - pendentes.length,
    restricoes_vencidas: vencidas,
    restricao_vencida: vencidas > 0,
    bloqueio_vencido: vencidas > 0,
    hoje,
  };
}

/** Aplica `alteracoes` à restrição em todas as atividades/semanas e refaz os contadores. */
function aplicarAlteracao(dados, restricaoId, alteracoes) {
  const hoje = dados.data_referencia;
  const semanas = dados.semanas.map((semana) => {
    const atividades = semana.atividades.map((atividade) => {
      if (!atividade.restricoes.some((r) => r.id === restricaoId)) return atividade;
      const restricoes = atividade.restricoes.map((r) => {
        if (r.id !== restricaoId) return r;
        const atualizada = { ...r, ...alteracoes };
        return { ...atualizada, ...prazoLocal(atualizada, hoje) };
      });
      restricoes.sort(
        (x, y) =>
          Number(y.status === 'PENDENTE') - Number(x.status === 'PENDENTE') ||
          Number(y.vencida) - Number(x.vencida) ||
          String(x.data_limite || '9999').localeCompare(String(y.data_limite || '9999'))
      );
      return recalcularAtividade({ ...atividade, restricoes }, hoje);
    });
    const liberadas = atividades.filter((a) => a.status_liberacao === 'LIBERADA').length;
    return {
      ...semana,
      atividades,
      liberadas,
      bloqueadas: atividades.length - liberadas,
      bloqueadas_vencidas: atividades.filter((a) => a.bloqueio_vencido).length,
      restricoes_pendentes: atividades.reduce((t, a) => t + a.restricoes_pendentes, 0),
      percentual_liberado: atividades.length ? Math.round((liberadas / atividades.length) * 10000) / 100 : null,
    };
  });

  // Resumo: liberadas/bloqueadas por atividade única do horizonte.
  const unicas = new Map();
  semanas.forEach((s) => s.atividades.forEach((a) => unicas.set(a.codigo_atividade, a)));
  const lista = [...unicas.values()];
  const liberadas = lista.filter((a) => a.status_liberacao === 'LIBERADA').length;
  const antes = dados.semanas.flatMap((s) => s.atividades).find((a) => a.restricoes.some((r) => r.id === restricaoId))?.restricoes.find((r) => r.id === restricaoId);
  const delta = antes && alteracoes.status && antes.status !== alteracoes.status ? (alteracoes.status === 'BAIXADA' ? -1 : 1) : 0;
  const deltaVencida = antes && delta !== 0 && antes.vencida ? delta : 0;
  return {
    ...dados,
    semanas,
    resumo: {
      ...dados.resumo,
      liberadas,
      bloqueadas: lista.length - liberadas,
      percentual_liberado: lista.length ? Math.round((liberadas / lista.length) * 10000) / 100 : null,
      criticas_bloqueadas: lista.filter((a) => a.caminho_critico && a.status_liberacao === 'BLOQUEADA').length,
      atividades_bloqueadas_vencidas: lista.filter((a) => a.bloqueio_vencido).length,
      restricoes_pendentes: Math.max((dados.resumo.restricoes_pendentes || 0) + delta, 0),
      restricoes_vencidas: Math.max((dados.resumo.restricoes_vencidas || 0) + deltaVencida, 0),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Pequenos componentes                                                       */
/* -------------------------------------------------------------------------- */

function Cartao({ rotulo, valor, detalhe, tom = 'text-slate-800' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

function EtiquetaTipo({ tipo }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ESTILO_TIPO[tipo] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {ROTULO_TIPO[tipo] || tipo}
    </span>
  );
}

/** Texto e cor do prazo da restrição. */
function descreverPrazo(restricao) {
  if (restricao.status === 'BAIXADA') {
    return { texto: restricao.data_baixa ? `Baixada em ${formatarData(restricao.data_baixa)}` : 'Baixada', classe: 'text-emerald-700' };
  }
  if (restricao.vencida) {
    return { texto: `Vencida há ${restricao.dias_atraso} d · limite ${formatarData(restricao.data_limite)}`, classe: 'font-bold text-red-600' };
  }
  if (!restricao.data_limite) return { texto: 'Sem data limite', classe: 'text-slate-400' };
  if (restricao.dias_para_vencer === 0) return { texto: 'Vence hoje', classe: 'font-bold text-amber-700' };
  if (restricao.dias_para_vencer !== null && restricao.dias_para_vencer <= 3) {
    return { texto: `Vence em ${restricao.dias_para_vencer} d · ${formatarData(restricao.data_limite)}`, classe: 'font-semibold text-amber-700' };
  }
  return { texto: `Limite ${formatarData(restricao.data_limite)}`, classe: 'text-slate-600' };
}

function LinhaRestricao({ restricao, podeEditar, salvando, onBaixar, onReabrir, onEditar }) {
  const pendente = restricao.status === 'PENDENTE';
  const prazo = descreverPrazo(restricao);
  const ocupada = salvando === restricao.id;

  return (
    <li
      className={`rounded-md border px-2.5 py-2 text-xs ${
        !pendente
          ? 'border-slate-200 bg-slate-50/70'
          : restricao.vencida
            ? 'border-red-300 bg-red-50/70'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <EtiquetaTipo tipo={restricao.tipo} />
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
              pendente ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {pendente ? 'Pendente' : 'Baixada'}
          </span>
          {restricao.herdada ? (
            <span className="text-[10px] text-slate-400" title="Cadastrada no item de resumo: vale para todas as atividades dele">
              herdada de {restricao.herdada_de}
            </span>
          ) : null}
        </div>

        {podeEditar ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              title="Editar restrição"
              aria-label="Editar restrição"
              onClick={() => onEditar(restricao)}
              disabled={ocupada}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {pendente ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                title="Dar baixa: a restrição foi removida"
                onClick={() => onBaixar(restricao)}
                disabled={ocupada}
              >
                {ocupada ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                Baixar
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                title="Reabrir restrição"
                onClick={() => onReabrir(restricao)}
                disabled={ocupada}
              >
                {ocupada ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-3 w-3" aria-hidden="true" />}
                Reabrir
              </button>
            )}
          </div>
        ) : null}
      </div>

      <p className={`mt-1 font-semibold leading-snug ${pendente ? 'text-slate-800' : 'text-slate-500 line-through decoration-slate-300'}`}>
        {restricao.descricao}
      </p>

      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        <span className="inline-flex items-center gap-1 text-slate-600">
          <User className="h-3 w-3 text-slate-400" aria-hidden="true" />
          {restricao.responsavel || <span className="text-slate-400">Sem responsável</span>}
        </span>
        <span className={`inline-flex items-center gap-1 ${prazo.classe}`}>
          {restricao.vencida ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <CalendarRange className="h-3 w-3 text-slate-400" aria-hidden="true" />}
          {prazo.texto}
        </span>
        {pendente && restricao.bloqueia_inicio && !restricao.vencida ? (
          <span className="text-[10px] font-semibold text-amber-700" title="A data limite é posterior ao início programado da atividade">
            prazo depois do início
          </span>
        ) : null}
      </p>

      {restricao.plano_acao ? (
        <p className="mt-1.5 rounded bg-slate-100/80 px-2 py-1 text-[11px] leading-snug text-slate-700" title={restricao.plano_acao}>
          <span className="font-bold text-slate-500">Plano de ação: </span>
          <span className="line-clamp-3 whitespace-pre-line">{restricao.plano_acao}</span>
        </p>
      ) : pendente ? (
        <p className="mt-1 text-[10px] italic text-slate-400">Plano de ação não informado</p>
      ) : null}
    </li>
  );
}

function CartaoAtividade({ atividade, podeEditar, salvando, onBaixar, onReabrir, onEditar, onNova }) {
  const bloqueada = atividade.status_liberacao === 'BLOQUEADA';
  const avanco = Math.min(Math.max(Number(atividade.avanco_fisico_real) || 0, 0), 100);

  return (
    <article
      className={`flex flex-col rounded-lg border border-l-4 bg-white p-3 shadow-sm ${
        bloqueada ? (atividade.bloqueio_vencido ? 'border-red-200 border-l-red-600' : 'border-red-100 border-l-red-400') : 'border-slate-200 border-l-emerald-500'
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-mono text-[10px] text-slate-400">{atividade.codigo_atividade}</span>
        <div className="flex flex-wrap items-center gap-1">
          {atividade.caminho_critico ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              <Zap className="h-2.5 w-2.5" aria-hidden="true" />
              Crítica
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              bloqueada ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {bloqueada ? <Lock className="h-3 w-3" aria-hidden="true" /> : <Unlock className="h-3 w-3" aria-hidden="true" />}
            {bloqueada ? 'Bloqueada' : 'Liberada'}
          </span>
        </div>
      </header>

      <h4 className="mt-1 text-[13px] font-bold leading-snug text-slate-800">{atividade.descricao}</h4>
      {atividade.frente ? <p className="truncate text-[10px] uppercase tracking-wide text-slate-400" title={atividade.frente}>{atividade.frente}</p> : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          {formatarData(atividade.inicio)} → {formatarData(atividade.termino)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <span className="block h-full rounded-full bg-amber-500" style={{ width: `${avanco}%` }} />
          </span>
          {formatarPercentual(avanco, 0)}
        </span>
      </div>

      {atividade.restricoes.length ? (
        <ul className="mt-2 space-y-1.5">
          {atividade.restricoes.map((restricao) => (
            <LinhaRestricao
              key={restricao.id}
              restricao={restricao}
              podeEditar={podeEditar}
              salvando={salvando}
              onBaixar={onBaixar}
              onReabrir={onReabrir}
              onEditar={(r) => onEditar(atividade, r)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">Nenhuma restrição cadastrada.</p>
      )}

      {podeEditar ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-[11px] font-bold text-omega-700 transition hover:bg-omega-50"
          onClick={() => onNova(atividade)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Restrição
        </button>
      ) : null}
    </article>
  );
}

function BlocoSemana({ semana, atividades, podeEditar, salvando, aberta, onAlternar, ...acoes }) {
  const progresso = semana.percentual_liberado ?? 0;
  return (
    <section aria-label={`${semana.rotulo}`} className="card overflow-hidden">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
          semana.numero === 1 ? 'bg-omega-50/50' : 'bg-slate-50/60'
        }`}
      >
        <span className="flex items-center gap-2">
          {aberta ? <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />}
          <span>
            <span className="block text-sm font-bold text-slate-800">
              {semana.rotulo} · S{semana.semana_iso}
              {semana.numero === 1 ? <span className="ml-1.5 rounded-full bg-omega-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">atual</span> : null}
            </span>
            <span className="block text-[11px] text-slate-400">
              {formatarData(semana.inicio)} a {formatarData(semana.fim)}
            </span>
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{semana.total} atividade(s)</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{semana.liberadas} liberada(s)</span>
          <span className={`rounded-full px-2 py-0.5 ${semana.bloqueadas ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
            {semana.bloqueadas} bloqueada(s)
          </span>
          {semana.bloqueadas_vencidas ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-white">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {semana.bloqueadas_vencidas} com prazo vencido
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-slate-500" title="Percentual de atividades liberadas">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
              <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progresso}%` }} />
            </span>
            {semana.percentual_liberado === null ? '—' : formatarPercentual(progresso, 0)}
          </span>
        </span>
      </button>

      {aberta ? (
        atividades.length ? (
          <div className="grid grid-cols-1 items-start gap-3 border-t border-slate-100 p-3 md:grid-cols-2 2xl:grid-cols-3 min-[1800px]:grid-cols-4">
            {atividades.map((atividade) => (
              <CartaoAtividade key={`${semana.numero}-${atividade.id}`} atividade={atividade} podeEditar={podeEditar} salvando={salvando} {...acoes} />
            ))}
          </div>
        ) : (
          <p className="border-t border-slate-100 px-4 py-6 text-center text-xs italic text-slate-400">
            {semana.total ? 'Nenhuma atividade corresponde ao filtro nesta semana.' : 'Sem atividades programadas nesta semana.'}
          </p>
        )
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal de cadastro / edição de restrição                                    */
/* -------------------------------------------------------------------------- */

const FORM_VAZIO = { tipo: 'SUPRIMENTOS', descricao: '', responsavel: '', data_limite: '', plano_acao: '' };

function ModalRestricao({ obraId, alvo, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const edicao = Boolean(alvo?.restricao);

  useEffect(() => {
    if (!alvo) return;
    const r = alvo.restricao;
    setForm(
      r
        ? {
            tipo: r.tipo,
            descricao: r.descricao || '',
            responsavel: r.responsavel || '',
            data_limite: r.data_limite ? String(r.data_limite).slice(0, 10) : '',
            plano_acao: r.plano_acao || '',
          }
        : FORM_VAZIO
    );
  }, [alvo]);

  async function salvar(evento) {
    evento.preventDefault();
    if (!form.descricao.trim()) {
      toast.erro('Descreva a restrição.');
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        tipo: form.tipo,
        descricao: form.descricao,
        responsavel: form.responsavel || null,
        data_limite: form.data_limite || null,
        plano_acao: form.plano_acao || null,
      };
      await salvarRestricaoAtividade(obraId, edicao ? { id: alvo.restricao.id, ...dados } : { atividade_id: alvo.atividade.id, ...dados });
      toast.sucesso(edicao ? 'Restrição atualizada.' : 'Restrição cadastrada.');
      onSalvo();
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const campo = (nome) => (evento) => setForm((atual) => ({ ...atual, [nome]: evento.target.value }));

  return (
    <ModalBase
      aberto={Boolean(alvo)}
      titulo={edicao ? 'Editar restrição' : 'Nova restrição'}
      subtitulo={alvo ? `${alvo.atividade.codigo_atividade} · ${alvo.atividade.descricao}` : ''}
      onFechar={() => (salvando ? null : onFechar())}
      tamanho="lg"
    >
      {alvo ? (
        <form onSubmit={salvar} className="space-y-3 p-5">
          {edicao && alvo.restricao.herdada ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Esta restrição foi cadastrada no item <strong>{alvo.restricao.herdada_de}</strong> e vale para todas as atividades dele: a
              alteração vale para todas.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="restricao-tipo">Tipo</label>
              <select id="restricao-tipo" className="campo" value={form.tipo} onChange={campo('tipo')}>
                {TIPOS.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="restricao-limite">Data limite</label>
              <input id="restricao-limite" type="date" className="campo" value={form.data_limite} onChange={campo('data_limite')} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="restricao-descricao">Descrição da restrição</label>
              <input id="restricao-descricao" className="campo" maxLength={500} placeholder="Ex.: Eletrodutos não entregues" value={form.descricao} onChange={campo('descricao')} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="restricao-responsavel">Responsável pela remoção</label>
              <input id="restricao-responsavel" className="campo" maxLength={255} placeholder="Ex.: Suprimentos / João" value={form.responsavel} onChange={campo('responsavel')} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="restricao-plano">Plano de ação</label>
              <textarea
                id="restricao-plano"
                className="campo min-h-[5.5rem]"
                maxLength={4000}
                placeholder="Como e quando a restrição será removida (ações, parceiros, entregas previstas)"
                value={form.plano_acao}
                onChange={campo('plano_acao')}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {edicao ? 'Salvar alterações' : 'Cadastrar restrição'}
            </button>
          </div>
        </form>
      ) : null}
    </ModalBase>
  );
}

/* -------------------------------------------------------------------------- */
/* Restrições do painel de planejamento (tabela obra_restricoes)              */
/* -------------------------------------------------------------------------- */

function RestricoesPainel({ restricoes }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Restrições do Dashboard de Planejamento</h2>
          <p className="text-xs text-slate-500">{restricoes.length} restrição(ões) cadastrada(s) no painel para esta obra.</p>
        </div>
        <Link to="/planejamento" className="btn-neutro">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Gerenciar no painel
        </Link>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Atividade', 'Restrição', 'Responsável', 'Prazo', 'Status'].map((titulo) => (
                <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {restricoes.map((restricao) => (
              <tr key={restricao.id} className="align-top">
                <td className="px-3 py-2 font-semibold text-slate-700">{restricao.atividade}</td>
                <td className="min-w-[14rem] px-3 py-2 text-slate-600">{restricao.descricao}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{restricao.responsavel || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{restricao.prazo ? formatarData(restricao.prazo) : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <StatusRestricaoBadge status={restricao.status} />
                </td>
              </tr>
            ))}
            {restricoes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhuma restrição no painel para esta obra.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Aba "Programação de 6 Semanas (6WLA)" — mapa de restrições e planos de ação.
 * Cada semana é um bloco com os cartões das atividades; as restrições aparecem
 * dentro do cartão (tipo, responsável, prazo, plano de ação) e podem ser baixadas
 * com um clique. O relatório executivo em PDF e o RDO exportam o recorte atual.
 */
export default function AbaProgramacao6Semanas({ obra, podeEditar = false, onIrParaAba }) {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [semCronograma, setSemCronograma] = useState(false);
  const [erro, setErro] = useState(null);
  const [semanaFiltro, setSemanaFiltro] = useState(null);
  const [apenasBloqueadas, setApenasBloqueadas] = useState(false);
  const [fechadas, setFechadas] = useState(() => new Set());
  const [salvandoId, setSalvandoId] = useState(null);
  const [modal, setModal] = useState(null);
  const [exportando, setExportando] = useState('');

  const carregar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setCarregando(true);
      setErro(null);
      try {
        setDados(await obterLookahead(obra.id));
        setSemCronograma(false);
      } catch (err) {
        if (err.status === 404) setSemCronograma(true);
        else if (!silencioso) setErro(err.message);
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [obra.id]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Baixa/reabre com atualização imediata da tela e confirmação em segundo plano. */
  const alterarStatus = useCallback(
    async (restricao, status) => {
      const anterior = dados;
      setSalvandoId(restricao.id);
      setDados((atual) =>
        aplicarAlteracao(atual, restricao.id, {
          status,
          data_baixa: status === 'BAIXADA' ? new Date().toISOString() : null,
        })
      );
      try {
        await salvarRestricaoAtividade(obra.id, { id: restricao.id, status });
        toast.sucesso(status === 'BAIXADA' ? 'Restrição baixada.' : 'Restrição reaberta.');
        carregar({ silencioso: true });
      } catch (err) {
        setDados(anterior);
        toast.erro(err.message);
      } finally {
        setSalvandoId(null);
      }
    },
    [dados, obra.id, toast, carregar]
  );

  async function exportar(tipo) {
    setExportando(tipo);
    const params = semanaFiltro ? { semana: semanaFiltro } : {};
    try {
      if (tipo === 'pdf') {
        const { nome, restricoes } = await baixarRestricoesPdf(obra.id, params);
        toast.sucesso(`${nome} gerado com ${restricoes} restrição(ões).`);
      } else {
        const { nome, linhas } = await baixarPlanilhaRdo(obra.id, params);
        toast.sucesso(`${nome} gerado com ${linhas} linha(s).`);
      }
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setExportando('');
    }
  }

  const alternarSemana = (numero) =>
    setFechadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(numero)) novo.delete(numero);
      else novo.add(numero);
      return novo;
    });

  const semanasVisiveis = useMemo(() => {
    if (!dados) return [];
    return dados.semanas
      .filter((s) => !semanaFiltro || s.numero === semanaFiltro)
      .map((semana) => ({
        semana,
        atividades: semana.atividades
          .filter((a) => !apenasBloqueadas || a.status_liberacao === 'BLOQUEADA')
          // Bloqueadas com prazo vencido primeiro, depois críticas.
          .sort(
            (x, y) =>
              Number(y.bloqueio_vencido) - Number(x.bloqueio_vencido) ||
              Number(y.status_liberacao === 'BLOQUEADA') - Number(x.status_liberacao === 'BLOQUEADA') ||
              Number(y.caminho_critico) - Number(x.caminho_critico)
          ),
      }));
  }, [dados, semanaFiltro, apenasBloqueadas]);

  const resumo = dados?.resumo;
  const rotuloExportacao = semanaFiltro ? ` (Semana ${semanaFiltro})` : '';

  return (
    <div className="space-y-4">
      {carregando && !dados ? (
        <div className="card flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Montando a programação das próximas 6 semanas…
        </div>
      ) : null}

      {erro ? <div className="card px-4 py-3 text-sm text-red-700">{erro}</div> : null}

      {semCronograma ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-amber-900">Importe o cronograma para montar a programação</p>
              <p className="text-xs text-amber-800">
                O lookahead de 6 semanas, o mapa de restrições, o PPC e os relatórios usam as atividades do cronograma importado.
              </p>
            </div>
          </div>
          {onIrParaAba ? (
            <button type="button" className="btn-primario shrink-0" onClick={() => onIrParaAba('cronograma')}>
              Ir para a aba Cronograma
            </button>
          ) : null}
        </div>
      ) : null}

      {dados ? (
        <>
          <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <CalendarRange className="h-4 w-4 text-omega-600" aria-hidden="true" />
                Mapa de restrições · {formatarData(dados.horizonte.inicio)} a {formatarData(dados.horizonte.fim)}
              </h2>
              <p className="text-xs text-slate-500">
                Cronograma {dados.versao.versao} · baixe cada restrição no próprio cartão; a atividade é liberada quando não restar nenhuma pendente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primario" onClick={() => exportar('pdf')} disabled={Boolean(exportando)}>
                {exportando === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                Relatório PDF{rotuloExportacao}
              </button>
              <button type="button" className="btn-neutro" onClick={() => exportar('rdo')} disabled={Boolean(exportando)}>
                {exportando === 'rdo' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                RDO (.xlsx){rotuloExportacao}
              </button>
            </div>
          </section>

          <section aria-label="Resumo do lookahead" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Cartao rotulo="Atividades no horizonte" valor={resumo.atividades_no_horizonte} detalhe={`${formatarPercentual(resumo.percentual_liberado ?? 0, 0)} liberadas`} />
            <Cartao rotulo="Liberadas" valor={resumo.liberadas} detalhe="Sem restrição pendente" tom="text-emerald-600" />
            <Cartao
              rotulo="Bloqueadas"
              valor={resumo.bloqueadas}
              detalhe={resumo.atividades_bloqueadas_vencidas ? `${resumo.atividades_bloqueadas_vencidas} com prazo vencido` : 'Com restrição pendente'}
              tom={resumo.bloqueadas ? 'text-red-600' : 'text-slate-800'}
            />
            <Cartao rotulo="Críticas bloqueadas" valor={resumo.criticas_bloqueadas} detalhe="No caminho crítico" tom={resumo.criticas_bloqueadas ? 'text-red-600' : 'text-slate-800'} />
            <Cartao rotulo="Restrições pendentes" valor={resumo.restricoes_pendentes} detalhe={`${resumo.restricoes_vencidas} vencida(s)`} tom={resumo.restricoes_vencidas ? 'text-red-600' : 'text-slate-800'} />
            <Cartao
              rotulo="PPC última semana"
              valor={resumo.ppc_ultima_semana === null ? '—' : formatarPercentual(resumo.ppc_ultima_semana, 0)}
              detalhe={`Média 4 semanas: ${resumo.ppc_medio_4_semanas === null ? '—' : formatarPercentual(resumo.ppc_medio_4_semanas, 0)}`}
            />
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold shadow-sm" role="group" aria-label="Filtrar por semana">
              {[{ numero: null, rotulo: 'Todas as semanas' }, ...dados.semanas.map((s) => ({ numero: s.numero, rotulo: `S${s.semana_iso}`, bloqueadas: s.bloqueadas }))].map((item) => (
                <button
                  key={item.numero ?? 'todas'}
                  type="button"
                  onClick={() => setSemanaFiltro(item.numero)}
                  className={`rounded-md px-3 py-1.5 transition ${semanaFiltro === item.numero ? 'bg-omega-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {item.rotulo}
                  {item.bloqueadas ? (
                    <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${semanaFiltro === item.numero ? 'bg-white/25 text-white' : 'bg-red-100 text-red-700'}`}>{item.bloqueadas}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={apenasBloqueadas} onChange={(e) => setApenasBloqueadas(e.target.checked)} />
              Somente atividades bloqueadas
            </label>
          </section>

          <div className="space-y-3">
            {semanasVisiveis.map(({ semana, atividades }) => (
              <BlocoSemana
                key={semana.numero}
                semana={semana}
                atividades={atividades}
                podeEditar={podeEditar}
                salvando={salvandoId}
                aberta={!fechadas.has(semana.numero)}
                onAlternar={() => alternarSemana(semana.numero)}
                onBaixar={(r) => alterarStatus(r, 'BAIXADA')}
                onReabrir={(r) => alterarStatus(r, 'PENDENTE')}
                onEditar={(atividade, restricao) => setModal({ atividade, restricao })}
                onNova={(atividade) => setModal({ atividade, restricao: null })}
              />
            ))}
          </div>

          <section className="card overflow-hidden">
            <header className="px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">PPC — Percentual de Planos Concluídos</h2>
              <p className="text-xs text-slate-500">
                Atividades que o plano previa terminar em cada semana × concluídas segundo o cronograma {dados.versao.versao}.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Semana', 'Período', 'Plano', 'Planejadas', 'Concluídas', 'PPC'].map((titulo) => (
                      <th key={titulo} scope="col" className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {dados.ppc.semanas.map((s) => (
                    <tr key={s.inicio}>
                      <td className="px-3 py-2 font-semibold text-slate-700">S{s.semana_iso}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatarData(s.inicio)} – {formatarData(s.fim)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.fonte_plano === 'linha_base' ? 'Linha de base' : s.fonte_plano}</td>
                      <td className="px-3 py-2 tabular-nums">{s.planejadas}</td>
                      <td className="px-3 py-2 tabular-nums">{s.concluidas}</td>
                      <td className={`px-3 py-2 font-bold tabular-nums ${s.ppc !== null && s.ppc < 80 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {s.ppc === null ? '—' : formatarPercentual(s.ppc, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <RestricoesPainel restricoes={obra.restricoes || []} />

      <ModalRestricao
        obraId={obra.id}
        alvo={modal}
        onFechar={() => setModal(null)}
        onSalvo={() => {
          setModal(null);
          carregar({ silencioso: true });
        }}
      />
    </div>
  );
}
