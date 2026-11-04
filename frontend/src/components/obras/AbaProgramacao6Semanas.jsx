import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Unlock,
  Zap,
} from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import { StatusRestricaoBadge } from '../dashboard/DashboardBadges.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { baixarPlanilhaRdo, obterLookahead, salvarRestricaoAtividade } from '../../services/cronogramaApi.js';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';

const TIPOS = [
  ['PROJETOS', 'Projetos'],
  ['SUPRIMENTOS', 'Suprimentos'],
  ['LIBERACAO_AREA', 'Liberação de área'],
  ['SMS', 'SMS'],
  ['EQUIPAMENTO', 'Equipamento'],
];
const ROTULO_TIPO = Object.fromEntries(TIPOS);

function Cartao({ rotulo, valor, detalhe, tom = 'text-slate-800' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal de restrições da atividade                                           */
/* -------------------------------------------------------------------------- */

const FORM_VAZIO = { tipo: 'SUPRIMENTOS', descricao: '', responsavel: '', data_limite: '' };

function ModalRestricoes({ obraId, atividade, podeEditar, onFechar, onAlterado }) {
  const toast = useToast();
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(null);

  async function cadastrar(evento) {
    evento.preventDefault();
    if (!form.descricao.trim()) {
      toast.erro('Descreva a restrição.');
      return;
    }
    setSalvando('nova');
    try {
      await salvarRestricaoAtividade(obraId, {
        atividade_id: atividade.id,
        tipo: form.tipo,
        descricao: form.descricao,
        responsavel: form.responsavel || null,
        data_limite: form.data_limite || null,
      });
      toast.sucesso('Restrição cadastrada.');
      setForm(FORM_VAZIO);
      onAlterado();
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(null);
    }
  }

  async function alternarStatus(restricao) {
    setSalvando(restricao.id);
    try {
      const status = restricao.status === 'PENDENTE' ? 'BAIXADA' : 'PENDENTE';
      await salvarRestricaoAtividade(obraId, { id: restricao.id, status });
      toast.sucesso(status === 'BAIXADA' ? 'Restrição baixada.' : 'Restrição reaberta.');
      onAlterado();
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <ModalBase
      aberto={Boolean(atividade)}
      titulo={atividade ? `${atividade.codigo_atividade} · ${atividade.descricao}` : ''}
      subtitulo={
        atividade
          ? `${formatarData(atividade.inicio)} a ${formatarData(atividade.termino)} · ${atividade.status_liberacao === 'LIBERADA' ? 'Liberada' : 'Bloqueada'}`
          : ''
      }
      onFechar={onFechar}
      tamanho="lg"
    >
      {atividade ? (
        <div className="space-y-4 p-5">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Restrições da atividade</h3>
            {atividade.restricoes.length ? (
              <ul className="space-y-2">
                {atividade.restricoes.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700">
                        <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                          {ROTULO_TIPO[r.tipo] || r.tipo}
                        </span>
                        {r.descricao}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {r.responsavel ? `Resp.: ${r.responsavel} · ` : ''}
                        {r.data_limite ? `Limite ${formatarData(r.data_limite)}` : 'Sem data limite'}
                        {r.herdada ? ` · herdada do item ${r.herdada_de}` : ''}
                        {r.status === 'BAIXADA' && r.data_baixa ? ` · baixada em ${formatarData(r.data_baixa)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          r.status === 'PENDENTE' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {r.status === 'PENDENTE' ? 'Pendente' : 'Baixada'}
                      </span>
                      {podeEditar ? (
                        <button
                          type="button"
                          className="btn-neutro px-2 py-1 text-xs"
                          onClick={() => alternarStatus(r)}
                          disabled={salvando !== null}
                        >
                          {salvando === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : r.status === 'PENDENTE' ? (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {r.status === 'PENDENTE' ? 'Baixar' : 'Reabrir'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma restrição cadastrada — atividade liberada.</p>
            )}
          </div>

          {podeEditar ? (
            <form onSubmit={cadastrar} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Nova restrição</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="rotulo" htmlFor="restricao-tipo">Tipo</label>
                  <select id="restricao-tipo" className="campo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                    {TIPOS.map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>{rotulo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="rotulo" htmlFor="restricao-limite">Data limite</label>
                  <input id="restricao-limite" type="date" className="campo" value={form.data_limite} onChange={(e) => setForm({ ...form, data_limite: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="rotulo" htmlFor="restricao-descricao">Descrição</label>
                  <input id="restricao-descricao" className="campo" maxLength={500} placeholder="Ex.: Eletrodutos não entregues" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="rotulo" htmlFor="restricao-responsavel">Responsável</label>
                  <input id="restricao-responsavel" className="campo" maxLength={255} placeholder="Ex.: Suprimentos / João" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn-primario" disabled={salvando !== null}>
                  {salvando === 'nova' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  Cadastrar restrição
                </button>
              </div>
            </form>
          ) : null}
        </div>
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
 * Aba "Programação de 6 Semanas (6WLA)": atividades do cronograma vigente nas
 * próximas seis semanas, liberação por restrições, PPC e exportação para o RDO.
 */
export default function AbaProgramacao6Semanas({ obra, podeEditar = false, onIrParaAba }) {
  const toast = useToast();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [semCronograma, setSemCronograma] = useState(false);
  const [erro, setErro] = useState(null);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [semanaExportar, setSemanaExportar] = useState('');
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await obterLookahead(obra.id));
      setSemCronograma(false);
    } catch (err) {
      if (err.status === 404) setSemCronograma(true);
      else setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [obra.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function exportar() {
    setExportando(true);
    try {
      const { nome, linhas } = await baixarPlanilhaRdo(obra.id, semanaExportar ? { semana: semanaExportar } : {});
      toast.sucesso(`${nome} gerado com ${linhas} linha(s).`);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setExportando(false);
    }
  }

  const atividadeSelecionada = dados
    ? dados.semanas.flatMap((s) => s.atividades).find((a) => a.id === selecionadaId) || null
    : null;

  const resumo = dados?.resumo;

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
                O lookahead de 6 semanas, o PPC e a exportação do RDO usam as atividades do cronograma importado.
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
                Lookahead {formatarData(dados.horizonte.inicio)} a {formatarData(dados.horizonte.fim)}
              </h2>
              <p className="text-xs text-slate-500">
                Cronograma {dados.versao.versao} · clique em uma atividade para ver ou cadastrar restrições.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="campo w-auto py-1.5 text-sm" value={semanaExportar} onChange={(e) => setSemanaExportar(e.target.value)} aria-label="Semanas a exportar">
                <option value="">Todas as 6 semanas</option>
                {dados.semanas.map((s) => (
                  <option key={s.numero} value={String(s.numero)}>
                    Semana {s.numero} (S{s.semana_iso})
                  </option>
                ))}
              </select>
              <button type="button" className="btn-primario" onClick={exportar} disabled={exportando}>
                {exportando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                Exportar para RDO (.xlsx)
              </button>
            </div>
          </section>

          <section aria-label="Resumo do lookahead" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <Cartao rotulo="Atividades no horizonte" valor={resumo.atividades_no_horizonte} detalhe={`${resumo.criticas_bloqueadas} crítica(s) bloqueada(s)`} />
            <Cartao rotulo="Liberadas" valor={resumo.liberadas} detalhe={`${formatarPercentual(resumo.percentual_liberado ?? 0, 1)} do horizonte`} tom="text-emerald-600" />
            <Cartao rotulo="Bloqueadas" valor={resumo.bloqueadas} detalhe="Com restrição pendente" tom={resumo.bloqueadas ? 'text-red-600' : 'text-slate-800'} />
            <Cartao rotulo="Restrições pendentes" valor={resumo.restricoes_pendentes} detalhe={`${resumo.restricoes_vencidas} vencida(s)`} tom={resumo.restricoes_vencidas ? 'text-red-600' : 'text-slate-800'} />
            <Cartao
              rotulo="PPC última semana"
              valor={resumo.ppc_ultima_semana === null ? '—' : formatarPercentual(resumo.ppc_ultima_semana, 0)}
              detalhe={`Média 4 semanas: ${resumo.ppc_medio_4_semanas === null ? '—' : formatarPercentual(resumo.ppc_medio_4_semanas, 0)}`}
            />
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dados.semanas.map((semana) => (
              <div key={semana.numero} className={`card flex flex-col p-3 ${semana.numero === 1 ? 'ring-1 ring-omega-500/40' : ''}`}>
                <header className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      Semana {semana.numero} · S{semana.semana_iso}
                      {semana.numero === 1 ? <span className="ml-1 text-omega-700">(atual)</span> : null}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatarData(semana.inicio)} – {formatarData(semana.fim)}
                    </p>
                  </div>
                  <div className="flex gap-1 text-[10px] font-bold">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{semana.liberadas} lib.</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{semana.bloqueadas} bloq.</span>
                  </div>
                </header>
                <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {semana.atividades.map((a) => {
                    const bloqueada = a.status_liberacao === 'BLOQUEADA';
                    return (
                      <li key={`${semana.numero}-${a.id}`}>
                        <button
                          type="button"
                          onClick={() => setSelecionadaId(a.id)}
                          className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition hover:shadow-sm ${
                            bloqueada ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-white'
                          }`}
                        >
                          <span className="flex items-start gap-1.5">
                            {bloqueada ? (
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Bloqueada" />
                            ) : (
                              <Unlock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Liberada" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 font-semibold text-slate-700">{a.descricao}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-400">
                                <span className="font-mono">{a.codigo_atividade}</span>
                                <span>
                                  {formatarData(a.inicio)} → {formatarData(a.termino)}
                                </span>
                                <span>{formatarPercentual(a.avanco_fisico_real, 0)}</span>
                                {a.caminho_critico ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-red-600">
                                    <Zap className="h-3 w-3" aria-hidden="true" />
                                    crítica
                                  </span>
                                ) : null}
                                {a.restricoes_pendentes ? (
                                  <span className="font-bold text-red-600">{a.restricoes_pendentes} restrição(ões)</span>
                                ) : null}
                                {a.restricao_vencida ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-red-700">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    vencida
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {semana.atividades.length === 0 ? (
                  <p className="mt-auto py-4 text-center text-[11px] italic text-slate-400">Sem atividades programadas</p>
                ) : null}
              </div>
            ))}
          </section>

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

      <ModalRestricoes
        obraId={obra.id}
        atividade={atividadeSelecionada}
        podeEditar={podeEditar}
        onFechar={() => setSelecionadaId(null)}
        onAlterado={carregar}
      />
    </div>
  );
}
