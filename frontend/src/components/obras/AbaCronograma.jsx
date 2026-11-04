import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  FileSpreadsheet,
  GitBranch,
  Info,
  Loader2,
  RefreshCw,
  Upload,
  Users,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useToast } from '../../context/ToastContext.jsx';
import {
  enviarCronograma,
  listarVersoesCronograma,
  obterCaminhoCritico,
  obterCargaTrabalho,
  obterCurvaS,
} from '../../services/cronogramaApi.js';
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarMoedaCompacta,
  formatarPercentual,
} from '../../utils/formatters.js';

const CORES = { previsto: '#64748b', real: '#0f766e', tendencia: '#f59e0b', base: '#a855f7', barra: '#94a3b8' };

const STATUS_PRAZO = {
  NO_PRAZO: { rotulo: 'No prazo', classe: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  ATENCAO: { rotulo: 'Atenção', classe: 'bg-amber-100 text-amber-800 border-amber-300' },
  ATRASADO: { rotulo: 'Atrasado', classe: 'bg-red-100 text-red-700 border-red-300' },
  SEM_DADOS: { rotulo: 'Sem dados', classe: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const SITUACAO_RECURSO = {
  MOBILIZAR: 'bg-red-100 text-red-700',
  OCIOSIDADE: 'bg-amber-100 text-amber-800',
};

function numero(valor, casas = 2) {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function Cartao({ rotulo, valor, detalhe, tom = 'text-slate-800', extra = null }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <p className={`text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
        {extra}
      </div>
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

function Secao({ titulo, subtitulo, icone: Icone, acoes = null, children }) {
  return (
    <section className="card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            {Icone ? <Icone className="h-4 w-4 text-omega-600" aria-hidden="true" /> : null}
            {titulo}
          </h2>
          {subtitulo ? <p className="text-xs text-slate-500">{subtitulo}</p> : null}
        </div>
        {acoes}
      </header>
      {children}
    </section>
  );
}

function Avisos({ avisos }) {
  if (!avisos?.length) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {avisos.map((aviso) => (
        <li key={aviso} className="flex gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{aviso}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Importação                                                                 */
/* -------------------------------------------------------------------------- */

function ImportarCronograma({ obraId, temVersoes, onImportado }) {
  const toast = useToast();
  const entrada = useRef(null);
  const [arquivo, setArquivo] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [arrastando, setArrastando] = useState(false);

  function escolher(lista) {
    const selecionado = lista?.[0];
    if (!selecionado) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(selecionado.name)) {
      toast.erro('Envie a planilha do cronograma em Excel (.xlsx).');
      return;
    }
    setArquivo(selecionado);
  }

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    setProgresso(0);
    try {
      const versao = await enviarCronograma(obraId, arquivo, { observacao, onProgresso: setProgresso });
      toast.sucesso(`Cronograma importado: ${versao.versao} com ${versao.total_atividades} atividades.`);
      setArquivo(null);
      setObservacao('');
      if (entrada.current) entrada.current.value = '';
      onImportado(versao);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <Upload className="h-4 w-4 text-omega-600" aria-hidden="true" />
        {temVersoes ? 'Enviar nova revisão do cronograma' : 'Importar cronograma da obra'}
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Planilha do modelo padrão (relatório semanal): abas Cronograma, Avanço_Físico&amp;Financeiro, MOD_MOI, EQP e
        Dashboard. Cada envio gera uma nova revisão (Rev 00, Rev 01, …) e as anteriores ficam guardadas.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_18rem_auto] lg:items-end">
        <label
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setArrastando(false);
            escolher(evento.dataTransfer.files);
          }}
          className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition ${
            arrastando ? 'border-omega-500 bg-omega-50' : 'border-slate-300 bg-slate-50 hover:border-omega-400'
          }`}
        >
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-700">
              {arquivo ? arquivo.name : 'Clique para escolher ou arraste a planilha aqui'}
            </p>
            <p className="text-[11px] text-slate-500">
              {arquivo ? `${(arquivo.size / 1024 / 1024).toFixed(1)} MB` : 'Formatos .xlsx, .xlsm ou .xls — até 25 MB'}
            </p>
          </div>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="sr-only"
            onChange={(evento) => escolher(evento.target.files)}
            disabled={enviando}
          />
        </label>

        <div>
          <label className="rotulo" htmlFor="observacao-cronograma">
            Observação (opcional)
          </label>
          <input
            id="observacao-cronograma"
            className="campo"
            placeholder="Ex.: Atualização semana 43"
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
            disabled={enviando}
            maxLength={300}
          />
        </div>

        <button type="button" className="btn-primario" onClick={enviar} disabled={!arquivo || enviando}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {enviando ? (progresso < 100 ? `Enviando ${progresso}%` : 'Processando…') : 'Importar'}
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Curva S                                                                    */
/* -------------------------------------------------------------------------- */

function TooltipSerie({ active, payload, label, moeda }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">
        {label} · {formatarData(payload[0]?.payload?.data)}
      </p>
      {payload
        .filter((serie) => serie.value !== null && serie.value !== undefined)
        .map((serie) => (
          <p key={serie.dataKey} className="flex items-center gap-2 text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: serie.color }} aria-hidden="true" />
            <span className="font-medium">{serie.name}:</span>
            <span className="font-bold text-slate-800">
              {moeda ? formatarMoeda(serie.value) : formatarPercentual(serie.value, 2)}
            </span>
          </p>
        ))}
    </div>
  );
}

function CurvaS({ curva }) {
  const [dimensao, setDimensao] = useState('fisico');
  const financeiro = dimensao === 'financeiro';
  const prefixo = financeiro ? 'financeiro_' : '';
  const temFinanceiro = Boolean(curva.series?.financeiro);
  const temBase = curva.pontos.some((p) => p[`${prefixo}previsto_linha_base`] !== undefined);

  return (
    <Secao
      titulo="Curva S — Previsto × Real × Tendência"
      subtitulo={
        curva.linha_base
          ? `${curva.versao?.versao} comparada com a linha de base original (${curva.linha_base.versao}).`
          : 'Avanço acumulado semana a semana.'
      }
      icone={GitBranch}
      acoes={
        temFinanceiro ? (
          <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs font-semibold">
            {[
              ['fisico', 'Físico (%)'],
              ['financeiro', 'Financeiro (R$)'],
            ].map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDimensao(id)}
                className={`rounded px-2.5 py-1 ${dimensao === id ? 'bg-omega-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={curva.pontos} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              width={financeiro ? 72 : 44}
              domain={financeiro ? ['auto', 'auto'] : [0, 100]}
              tickFormatter={(v) => (financeiro ? formatarMoedaCompacta(v) : `${v}%`)}
            />
            <Tooltip content={<TooltipSerie moeda={financeiro} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey={`${prefixo}previsto`} name="Previsto (LB)" stroke={CORES.previsto} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
            {temBase ? (
              <Line type="monotone" dataKey={`${prefixo}previsto_linha_base`} name="Linha de base Rev 00" stroke={CORES.base} strokeWidth={1.5} strokeDasharray="2 3" dot={false} connectNulls />
            ) : null}
            <Line type="monotone" dataKey={`${prefixo}real`} name="Real" stroke={CORES.real} strokeWidth={2.5} dot={{ r: 2 }} />
            <Line type="monotone" dataKey={`${prefixo}tendencia`} name="Tendência" stroke={CORES.tendencia} strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Secao>
  );
}

function IndicadoresPrazo({ curva }) {
  const fisico = curva.indicadores?.fisico || {};
  const financeiro = curva.indicadores?.financeiro;
  const status = STATUS_PRAZO[fisico.status_prazo] || STATUS_PRAZO.SEM_DADOS;
  const desvio = fisico.desvio;

  return (
    <section aria-label="Indicadores de prazo" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao
        rotulo={`Avanço físico · semana ${fisico.semana_status ?? '—'}`}
        valor={`${formatarPercentual(fisico.real_acumulado ?? 0, 2)}`}
        detalhe={`Previsto ${formatarPercentual(fisico.previsto_acumulado ?? 0, 2)} · status ${formatarData(fisico.data_status)}`}
        tom="text-teal-700"
      />
      <Cartao
        rotulo="Desvio real − previsto"
        valor={desvio === null || desvio === undefined ? '—' : `${desvio > 0 ? '+' : ''}${numero(desvio)} p.p.`}
        detalhe={fisico.linha_base ? `vs Rev 00: ${numero(fisico.linha_base.desvio)} p.p.` : 'Pontos percentuais acumulados'}
        tom={desvio < 0 ? 'text-red-600' : 'text-emerald-600'}
      />
      <Cartao
        rotulo="SPI (aderência ao prazo)"
        valor={fisico.spi === null || fisico.spi === undefined ? '—' : numero(fisico.spi, 2)}
        detalhe={fisico.aderencia === null || fisico.aderencia === undefined ? 'Sem medição' : `${formatarPercentual(fisico.aderencia, 1)} do previsto`}
        extra={
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${status.classe}`}>{status.rotulo}</span>
        }
      />
      <Cartao
        rotulo="Término"
        valor={formatarData(fisico.termino_tendencia)}
        detalhe={`LB ${formatarData(fisico.termino_lb)}${
          fisico.desvio_termino_dias ? ` · ${fisico.desvio_termino_dias > 0 ? '+' : ''}${fisico.desvio_termino_dias} dia(s)` : ''
        }`}
        tom={fisico.desvio_termino_dias > 0 ? 'text-red-600' : 'text-slate-800'}
      />
      {financeiro ? (
        <>
          <Cartao
            rotulo={`Financeiro realizado · semana ${financeiro.semana_status ?? '—'}`}
            valor={formatarMoeda(financeiro.real_acumulado ?? 0)}
            detalhe={`Previsto ${formatarMoeda(financeiro.previsto_acumulado ?? 0)} · ${formatarPercentual(financeiro.percentual_realizado ?? 0, 1)} do total`}
          />
          <Cartao
            rotulo="Desvio financeiro"
            valor={formatarMoeda(financeiro.desvio ?? 0)}
            detalhe={`SPI financeiro ${numero(financeiro.spi, 2)}`}
            tom={financeiro.desvio < 0 ? 'text-red-600' : 'text-emerald-600'}
          />
          <Cartao rotulo="Saldo a realizar" valor={formatarMoeda(financeiro.saldo_a_realizar ?? 0)} detalhe={`Total previsto ${formatarMoeda(financeiro.total_previsto)}`} />
          <Cartao
            rotulo="Ritmo físico semanal"
            valor={`${numero(fisico.ritmo_real_semanal)} p.p.`}
            detalhe={`Necessário ${numero(fisico.ritmo_necessario_semanal)} p.p. · no ritmo atual termina em ${formatarData(fisico.conclusao_no_ritmo)}`}
          />
        </>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Caminho crítico                                                            */
/* -------------------------------------------------------------------------- */

function CaminhoCritico({ critico, prazo, onPrazo, carregando }) {
  const resumo = critico?.resumo || {};
  return (
    <Secao
      titulo="Caminho crítico (CPM)"
      subtitulo={
        critico
          ? `${resumo.atividades_criticas} atividade(s) com folga ≤ 0 de ${resumo.atividades_na_rede} na rede · término projetado ${formatarData(resumo.termino_projeto)}`
          : 'Atividades com folga total menor ou igual a zero.'
      }
      icone={CalendarClock}
      acoes={
        <select className="campo w-auto py-1 text-xs" value={prazo} onChange={(evento) => onPrazo(evento.target.value)} disabled={carregando}>
          <option value="projeto">Prazo: término do projeto</option>
          <option value="contratual">Prazo: término contratual (LB)</option>
        </select>
      }
    >
      {critico?.avisos?.length ? (
        <div className="mb-3">
          <Avisos avisos={critico.avisos} />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['EDT', 'Atividade', 'Início', 'Término', 'Término LB', 'Folga (d)', 'Impacto (d)', 'Situação', 'Responsável'].map((titulo) => (
                <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {(critico?.data || []).map((item) => (
              <tr key={item.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{item.codigo_atividade}</td>
                <td className="min-w-[16rem] px-3 py-2">
                  <p className="font-semibold text-slate-700">{item.descricao}</p>
                  {item.frente ? <p className="text-[11px] text-slate-400">{item.frente}</p> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarData(item.inicio)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatarData(item.termino)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatarData(item.termino_lb)}</td>
                <td className={`whitespace-nowrap px-3 py-2 font-bold tabular-nums ${item.folga_total_dias < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {numero(item.folga_total_dias)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                  {item.impacto_prazo_dias ? numero(item.impacto_prazo_dias) : '—'}
                  {item.atraso_termino_vs_lb_dias ? (
                    <p className="text-[10px] text-slate-400">{numero(item.atraso_termino_vs_lb_dias)} d vs LB</p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                  {{ NAO_INICIADA: 'Não iniciada', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' }[item.situacao]}
                  <p className="text-[10px] text-slate-400">{formatarPercentual(item.avanco_fisico_real, 0)} real</p>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {[...item.responsavel.funcoes, ...item.responsavel.planejadores].join(', ') || '—'}
                  {item.responsavel.restricoes.length ? (
                    <p className="text-[10px] font-semibold text-amber-700">{item.responsavel.restricoes.length} restrição(ões) aberta(s)</p>
                  ) : null}
                </td>
              </tr>
            ))}
            {critico && !critico.data.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Nenhuma atividade crítica para o prazo selecionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}

/* -------------------------------------------------------------------------- */
/* Carga de trabalho                                                          */
/* -------------------------------------------------------------------------- */

function CargaTrabalho({ carga }) {
  const ind = carga.indicadores;
  const dados = carga.semanas.map((s) => ({
    rotulo: `S${String(s.semana).padStart(2, '0')}`,
    data: s.inicio,
    previsto: s.histograma_planejado ? s.mao_de_obra.previsto : s.efetivo_previsto_curva_s,
    realizado: s.mao_de_obra.realizado,
  }));

  return (
    <Secao
      titulo="Carga de trabalho e alocação por função"
      subtitulo={`Efetivo da semana de status (S${carga.semana_status ?? '—'}) e demanda prevista nos histogramas MOD/MOI/EQP. HH com ${numero(ind.horas_por_dia, 1)} h/dia.`}
      icone={Users}
    >
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Efetivo atual" valor={numero(ind.efetivo_atual, 0)} detalhe={`MOD ${ind.efetivo_atual_mod} · MOI ${ind.efetivo_atual_moi} · ${ind.equipamentos_atuais} equip.`} />
        <Cartao
          rotulo="Pico de efetivo previsto"
          valor={numero(ind.pico_efetivo_previsto?.valor, 0)}
          detalhe={ind.pico_efetivo_previsto ? `Semana ${ind.pico_efetivo_previsto.semana} · realizado máx. ${numero(ind.pico_efetivo_realizado?.valor, 0)}` : '—'}
        />
        <Cartao
          rotulo="HH realizado / previsto"
          valor={`${numero(ind.hh_realizado_ate_status, 0)} h`}
          detalhe={`de ${numero(ind.hh_previsto_ate_status, 0)} h · aderência ${formatarPercentual(ind.aderencia_hh ?? 0, 1)}`}
        />
        <Cartao
          rotulo="Lookahead (6 semanas)"
          valor={`${ind.funcoes_a_mobilizar} a mobilizar`}
          detalhe={`${ind.funcoes_ociosas} função(ões) ociosa(s) · pico ${numero(ind.pico_efetivo_lookahead?.valor, 0)}`}
          tom={ind.funcoes_a_mobilizar ? 'text-red-600' : 'text-slate-800'}
        />
      </div>

      <div className="mb-3">
        <Avisos avisos={carga.avisos} />
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip formatter={(valor, nome) => [numero(valor, 0), nome]} labelFormatter={(rotulo, itens) => `${rotulo} · ${formatarData(itens?.[0]?.payload?.data)}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="realizado" name="Efetivo realizado" fill={CORES.real} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="previsto" name="Efetivo previsto" stroke={CORES.previsto} strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {carga.gargalos.length ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Gargalos previstos no lookahead</h3>
          <div className="flex flex-wrap gap-2">
            {carga.gargalos.slice(0, 30).map((g) => (
              <span key={`${g.inicio}-${g.recurso}`} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${SITUACAO_RECURSO[g.situacao]}`}>
                S{g.semana} · {g.recurso}: {g.situacao === 'MOBILIZAR' ? `+${numero(g.gap, 0)}` : numero(g.gap, 0)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Função / Equipamento', 'Cat.', 'Atual', 'Pico previsto', 'Pico real', 'HH previsto', 'HH realizado', 'Aderência'].map((titulo) => (
                <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {[...carga.funcoes, ...carga.equipamentos].map((r) => (
              <tr key={`${r.categoria}-${r.nome}`}>
                <td className="px-3 py-1.5 font-medium text-slate-700">{r.nome}</td>
                <td className="px-3 py-1.5 text-[11px] font-bold text-slate-500">{r.categoria === 'EQUIPAMENTO' ? 'EQP' : r.categoria}</td>
                <td className="px-3 py-1.5 tabular-nums">{numero(r.efetivo_atual, 0)}</td>
                <td className="px-3 py-1.5 tabular-nums">{numero(r.pico_previsto?.valor, 0)}</td>
                <td className="px-3 py-1.5 tabular-nums">{numero(r.pico_realizado?.valor, 0)}</td>
                <td className="px-3 py-1.5 tabular-nums">{numero(r.hh_previsto_total ?? r.horas_maquina_previstas_total, 0)}</td>
                <td className="px-3 py-1.5 tabular-nums">{numero(r.hh_realizado_ate_status ?? r.horas_maquina_realizadas_ate_status, 0)}</td>
                <td className={`px-3 py-1.5 tabular-nums font-semibold ${r.aderencia_alocacao !== null && r.aderencia_alocacao < 80 ? 'text-red-600' : 'text-slate-700'}`}>
                  {r.aderencia_alocacao === null ? '—' : formatarPercentual(r.aderencia_alocacao, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}

/* -------------------------------------------------------------------------- */
/* Aba                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Aba "Cronograma": importação do modelo padrão, revisões enviadas e análises
 * da revisão selecionada (Curva S, indicadores, caminho crítico e carga).
 */
export default function AbaCronograma({ obra, podeEditar }) {
  const [versoes, setVersoes] = useState([]);
  const [versaoId, setVersaoId] = useState(null);
  const [carregandoVersoes, setCarregandoVersoes] = useState(true);
  const [erroVersoes, setErroVersoes] = useState(null);
  const [analise, setAnalise] = useState({ curva: null, critico: null, carga: null, erros: [] });
  const [carregandoAnalise, setCarregandoAnalise] = useState(false);
  const [prazo, setPrazo] = useState('projeto');

  const carregarVersoes = useCallback(
    async (selecionar = null) => {
      setCarregandoVersoes(true);
      setErroVersoes(null);
      try {
        const resposta = await listarVersoesCronograma(obra.id);
        setVersoes(resposta.data);
        setVersaoId((atual) => selecionar || (resposta.data.some((v) => v.id === atual) ? atual : resposta.vigente_id));
      } catch (err) {
        setErroVersoes(err.message);
      } finally {
        setCarregandoVersoes(false);
      }
    },
    [obra.id]
  );

  useEffect(() => {
    carregarVersoes();
  }, [carregarVersoes]);

  useEffect(() => {
    if (!versaoId) return undefined;
    let ativo = true;
    setCarregandoAnalise(true);
    const params = { versao_id: versaoId };
    Promise.allSettled([
      obterCurvaS(obra.id, params),
      obterCaminhoCritico(obra.id, { ...params, prazo }),
      obterCargaTrabalho(obra.id, params),
    ]).then(([curva, critico, carga]) => {
      if (!ativo) return;
      setAnalise({
        curva: curva.status === 'fulfilled' ? curva.value : null,
        critico: critico.status === 'fulfilled' ? critico.value : null,
        carga: carga.status === 'fulfilled' ? carga.value : null,
        erros: [curva, critico, carga].filter((r) => r.status === 'rejected').map((r) => r.reason.message),
      });
      setCarregandoAnalise(false);
    });
    return () => {
      ativo = false;
    };
  }, [obra.id, versaoId, prazo]);

  const versao = versoes.find((v) => v.id === versaoId) || null;

  return (
    <div className="space-y-4">
      {podeEditar ? (
        <ImportarCronograma obraId={obra.id} temVersoes={versoes.length > 0} onImportado={(nova) => carregarVersoes(nova.id)} />
      ) : null}

      {carregandoVersoes && !versoes.length ? (
        <div className="card flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando revisões do cronograma…
        </div>
      ) : null}

      {erroVersoes ? (
        <div className="card flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-700">
          {erroVersoes}
          <button type="button" className="btn-neutro" onClick={() => carregarVersoes()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!carregandoVersoes && !erroVersoes && !versoes.length ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <FileSpreadsheet className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">Nenhum cronograma importado para esta obra</p>
          <p className="max-w-md text-xs text-slate-500">
            {podeEditar
              ? 'Use o quadro acima para enviar a planilha do relatório semanal. A Curva S, o caminho crítico, o lookahead de 6 semanas e a carga de trabalho são montados a partir dela.'
              : 'Peça ao planejador responsável para importar a planilha do cronograma.'}
          </p>
        </div>
      ) : null}

      {versoes.length ? (
        <section className="card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[16rem]">
              <label className="rotulo" htmlFor="versao-cronograma">
                Revisão analisada
              </label>
              <select id="versao-cronograma" className="campo" value={versaoId || ''} onChange={(evento) => setVersaoId(evento.target.value)}>
                {versoes.map((v, indice) => (
                  <option key={v.id} value={v.id}>
                    {v.versao} · {formatarDataHora(v.created_at)}
                    {indice === 0 ? ' (vigente)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {versao ? (
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Período do relatório</dt>
                  <dd>
                    {formatarData(versao.periodo_inicio)} a {formatarData(versao.periodo_fim)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Enviado por</dt>
                  <dd>{versao.autor_nome || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Atividades</dt>
                  <dd>{versao.total_atividades}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Arquivo</dt>
                  <dd>
                    {versao.arquivo_url ? (
                      <a href={versao.arquivo_url} target="_blank" rel="noreferrer" className="font-semibold text-omega-700 hover:underline">
                        {versao.arquivo_nome || 'Baixar original'}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
          {versao?.observacao ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5" aria-hidden="true" />
              {versao.observacao}
            </p>
          ) : null}
          {versao?.resumo?.avisos?.length ? (
            <div className="mt-3">
              <Avisos avisos={versao.resumo.avisos} />
            </div>
          ) : null}
        </section>
      ) : null}

      {versoes.length && carregandoAnalise && !analise.curva ? (
        <div className="card flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Calculando Curva S, caminho crítico e carga de trabalho…
        </div>
      ) : null}

      {analise.erros.length ? <Avisos avisos={analise.erros} /> : null}

      {versoes.length && analise.curva ? (
        <>
          <IndicadoresPrazo curva={analise.curva} />
          <CurvaS curva={analise.curva} />
        </>
      ) : null}
      {versoes.length && analise.critico ? (
        <CaminhoCritico critico={analise.critico} prazo={prazo} onPrazo={setPrazo} carregando={carregandoAnalise} />
      ) : null}
      {versoes.length && analise.carga ? <CargaTrabalho carga={analise.carga} /> : null}
    </div>
  );
}
