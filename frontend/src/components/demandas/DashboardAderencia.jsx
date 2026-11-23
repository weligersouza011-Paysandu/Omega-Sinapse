import { useMemo, useState } from 'react';
import { Gauge, RefreshCw, ShieldCheck, TimerOff, Trophy } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useAderencia } from '../../hooks/useTarefas.js';
import { CATEGORIAS_JUSTIFICATIVA, formatarAderencia, rotuloCategoria } from '../../utils/demandas.js';

/** "aaaa-mm-dd" local. */
function dataLocal(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Período padrão: do dia 1º do mês corrente até hoje. */
function periodoPadrao() {
  const hoje = new Date();
  return { de: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: dataLocal(hoje) };
}

/** Cor da aderência: verde (≥ 99), âmbar (≥ 95) e vermelho abaixo disso. */
function tomAderencia(valor) {
  if (valor === null || valor === undefined) return 'text-slate-300';
  if (valor >= 99) return 'text-emerald-300';
  if (valor >= 95) return 'text-amber-300';
  return 'text-red-300';
}

function Indicador({ Icone, rotulo, valor, detalhe, tom = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/80">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {rotulo}
      </div>
      <p className={`mt-1.5 text-3xl font-black leading-none ${tom}`}>{valor}</p>
      {detalhe ? <p className="mt-1.5 text-xs text-slate-300">{detalhe}</p> : null}
    </div>
  );
}

/** Distribuição dos atrasos por categoria de justificativa. */
function DistribuicaoCategorias({ itens }) {
  const total = itens.reduce((soma, item) => soma + item.total, 0);
  const maximo = Math.max(1, ...itens.map((item) => item.total));

  return (
    <section className="card p-4">
      <h3 className="text-sm font-bold text-slate-800">Justificativas por categoria</h3>
      <p className="mb-3 text-xs text-slate-500">Motivos informados nas entregas concluídas com atraso.</p>
      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nenhum atraso justificado no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((item) => (
            <li key={item.categoria}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-semibold text-slate-700">
                  {item.categoria === 'SEM_CATEGORIA' ? 'Sem categoria' : rotuloCategoria(item.categoria)}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {item.total} ({Math.round((item.total / total) * 100)}%)
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-omega-500"
                  style={{ width: `${(item.total / maximo) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Comparativo de pontualidade por colaborador (somente Master/Admin; a API já o omite dos demais). */
function RankingPontualidade({ ranking }) {
  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
        Ranking de pontualidade
      </h3>
      <p className="mb-3 text-xs text-slate-500">Visão restrita à gestão: ordenado pela aderência média.</p>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Sem entregas concluídas no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Planejador</th>
                <th className="py-1.5 pr-2 text-right">Entregas</th>
                <th className="py-1.5 pr-2 text-right">No prazo</th>
                <th className="py-1.5 pr-2 text-right">Atrasadas</th>
                <th className="py-1.5 text-right">Aderência</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((linha, indice) => (
                <tr key={linha.usuario_id} className="border-t border-slate-100">
                  <td className="py-2 pr-2 font-bold text-slate-400">{indice + 1}</td>
                  <td className="py-2 pr-2 font-semibold text-slate-700">{linha.nome}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{linha.concluidas}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-emerald-600">{linha.no_prazo}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-red-600">{linha.com_atraso}</td>
                  <td className="py-2 text-right font-bold tabular-nums text-slate-800">
                    {formatarAderencia(linha.aderencia_media)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Dashboard de Aderência. Master/Admin veem a equipe (com filtros por planejador
 * e categoria e o ranking); os demais perfis veem apenas os próprios indicadores.
 * A restrição é garantida pela API: aqui só se omitem os controles que não se aplicam.
 */
export default function DashboardAderencia({ usuario, equipe = [], master = false }) {
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [usuarioId, setUsuarioId] = useState('');
  const [categoria, setCategoria] = useState('');

  const filtros = useMemo(
    () => ({
      de: periodo.de,
      ate: periodo.ate,
      usuarioId: master ? usuarioId : '',
      categoria: master ? categoria : '',
    }),
    [periodo, usuarioId, categoria, master]
  );
  const { dados, carregando, erro, recarregar } = useAderencia(filtros);

  const resumo = dados?.resumo;
  const individual = dados?.escopo === 'INDIVIDUAL';
  const tituloEscopo = !master
    ? 'Seus indicadores'
    : individual
      ? `Indicadores de ${equipe.find((pessoa) => String(pessoa.id) === String(usuarioId))?.nome || 'planejador'}`
      : 'Indicadores da equipe';

  return (
    <div className="space-y-4">
      <section className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div>
          <label className="rotulo" htmlFor="aderencia-de">
            De
          </label>
          <input
            id="aderencia-de"
            type="date"
            className="campo"
            value={periodo.de}
            max={periodo.ate || undefined}
            onChange={(evento) => setPeriodo((atual) => ({ ...atual, de: evento.target.value }))}
          />
        </div>
        <div>
          <label className="rotulo" htmlFor="aderencia-ate">
            Até
          </label>
          <input
            id="aderencia-ate"
            type="date"
            className="campo"
            value={periodo.ate}
            min={periodo.de || undefined}
            onChange={(evento) => setPeriodo((atual) => ({ ...atual, ate: evento.target.value }))}
          />
        </div>

        {master ? (
          <>
            <div className="lg:w-64">
              <label className="rotulo" htmlFor="aderencia-planejador">
                Planejador
              </label>
              <select
                id="aderencia-planejador"
                className="campo"
                value={usuarioId}
                onChange={(evento) => setUsuarioId(evento.target.value)}
              >
                <option value="">Toda a equipe</option>
                {equipe.map((pessoa) => (
                  <option key={pessoa.id} value={String(pessoa.id)}>
                    {pessoa.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:w-72">
              <label className="rotulo" htmlFor="aderencia-categoria">
                Categoria da justificativa
              </label>
              <select
                id="aderencia-categoria"
                className="campo"
                value={categoria}
                onChange={(evento) => setCategoria(evento.target.value)}
              >
                <option value="">Todas</option>
                {CATEGORIAS_JUSTIFICATIVA.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        <button type="button" className="btn-neutro lg:ml-auto" onClick={recarregar} disabled={carregando}>
          {carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Atualizar
        </button>
      </section>

      {erro ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <span>{erro}</span>
          <button type="button" className="btn-perigo" onClick={recarregar}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <header className="tema-claro rounded-xl bg-gradient-to-br from-omega-900 via-omega-800 to-slate-900 px-5 py-5 text-white shadow-sm sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200/80">
                  Omega Sinapse · Aderência de entregas
                </p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight">{tituloEscopo}</h3>
              </div>
              <p className="text-xs text-slate-300">
                100% no prazo · −0,5% a cada 30 min de atraso{!master ? ' · visível somente para você' : ''}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador
                Icone={Gauge}
                rotulo="Aderência média"
                valor={carregando && !resumo ? '…' : formatarAderencia(resumo?.aderencia_media)}
                tom={tomAderencia(resumo?.aderencia_media)}
                detalhe={`${resumo?.concluidas ?? 0} entrega(s) concluída(s)`}
              />
              <Indicador
                Icone={ShieldCheck}
                rotulo="Entregas no prazo"
                valor={carregando && !resumo ? '…' : resumo?.no_prazo ?? 0}
                tom="text-emerald-300"
                detalhe={resumo?.pontualidade === null || !resumo ? 'Sem entregas' : `${resumo.pontualidade}% de pontualidade`}
              />
              <Indicador
                Icone={TimerOff}
                rotulo="Entregas com atraso"
                valor={carregando && !resumo ? '…' : resumo?.com_atraso ?? 0}
                tom={resumo?.com_atraso > 0 ? 'text-red-300' : 'text-white'}
                detalhe="Com justificativa registrada"
              />
              <Indicador
                Icone={Trophy}
                rotulo="Pontualidade"
                valor={
                  carregando && !resumo
                    ? '…'
                    : resumo?.pontualidade === null || !resumo
                      ? '—'
                      : `${resumo.pontualidade}%`
                }
                detalhe="No prazo ÷ concluídas"
              />
            </div>
          </header>

          <div className={`grid gap-4 ${dados?.ranking ? 'xl:grid-cols-2' : ''}`}>
            <DistribuicaoCategorias itens={dados?.por_categoria || []} />
            {dados?.ranking ? <RankingPontualidade ranking={dados.ranking} /> : null}
          </div>
        </>
      )}
      {!master && usuario ? (
        <p className="text-center text-[11px] text-slate-400">
          Por privacidade, cada colaborador visualiza apenas as próprias demandas e indicadores.
        </p>
      ) : null}
    </div>
  );
}
