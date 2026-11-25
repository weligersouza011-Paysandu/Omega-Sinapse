import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ExternalLink, Search, Users } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { obterProgramacaoDaObra } from '../../services/programacaoApi.js';
import { formatarData } from '../../utils/formatters.js';

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const RECORTES = [
  ['proxima', 'Próxima semana (S+1)'],
  ['atual', 'Semana atual'],
  ['ultima', 'Última programada'],
];
const rev = (n) => `rev${String(n ?? 0).padStart(2, '0')}`;

/** Datas dd/mm de segunda a domingo. */
function datasDaSemana(dataInicio) {
  const base = new Date(dataInicio);
  return DIAS.map((_, i) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function DiasProgramados({ dias }) {
  return (
    <span className="inline-flex gap-0.5" aria-label="Dias programados">
      {DIAS.map((d, i) => (
        <span key={d} title={d} className={`flex h-5 w-6 items-center justify-center rounded text-[10px] font-bold ${dias[i] ? 'bg-omega-600 text-white' : 'bg-slate-100 text-slate-300'}`}>{d[0]}</span>
      ))}
    </span>
  );
}

/**
 * Programação S+1 da obra: frentes desta obra na programação semanal e o efetivo nominal programado
 * (matrícula, nome, função, equipe e dias). Padrão: a próxima semana (S+1).
 */
export default function AbaProgramacaoS1Obra({ obra }) {
  const [filtro, setFiltro] = useState({ recorte: 'proxima' });
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    obterProgramacaoDaObra(obra.id, filtro)
      .then((r) => { if (ativo) setDados(r); })
      .catch((err) => { if (ativo) setErro(err.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [obra.id, filtro]);

  const prog = dados?.programacao;
  const datas = useMemo(() => (prog ? datasDaSemana(prog.data_inicio) : []), [prog]);
  const termo = busca.trim().toUpperCase();
  const efetivo = (dados?.efetivo_nominal || []).filter((p) => !termo || `${p.nome} ${p.matricula || ''} ${p.funcao || ''}`.toUpperCase().includes(termo));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <CalendarRange className="h-5 w-5 text-omega-600" aria-hidden="true" />
        {RECORTES.map(([valor, rotulo]) => (
          <button key={valor} type="button" onClick={() => setFiltro({ recorte: valor })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro.recorte === valor ? 'border-omega-600 bg-omega-600 text-white' : 'border-slate-200 text-slate-600 hover:border-omega-300'}`}>
            {rotulo}
          </button>
        ))}
        {dados?.semanas?.length ? (
          <select className="campo !w-auto !py-1 text-xs" aria-label="Escolher semana"
            value={filtro.programacao_id || ''} onChange={(e) => setFiltro(e.target.value ? { programacao_id: e.target.value } : { recorte: 'proxima' })}>
            <option value="">Outra semana...</option>
            {dados.semanas.map((s) => <option key={s.id} value={s.id}>Semana {s.semana}/{s.ano} · {rev(s.revisao)}</option>)}
          </select>
        ) : null}
        <Link to="/programacao-s1" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-omega-700 hover:underline">
          Abrir Programação S+1 <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {erro ? <div className="card p-4 text-sm text-red-700">{erro}</div> : null}
      {carregando && !dados ? <div className="flex justify-center py-10"><Spinner /></div> : null}

      {dados && !prog && !carregando ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {dados.semanas.length
            ? <>Esta obra não está na programação {filtro.recorte === 'atual' ? 'da semana atual' : filtro.recorte === 'proxima' ? 'da próxima semana' : 'escolhida'}. Ela aparece em {dados.semanas.length} semana(s): use <strong>Outra semana...</strong>.</>
            : <>Esta obra ainda não tem frente na Programação S+1. Vincule uma frente a ela na página <Link to="/programacao-s1" className="font-semibold text-omega-700 hover:underline">Programação S+1</Link>.</>}
        </div>
      ) : null}

      {prog ? (
        <>
          <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="font-bold text-slate-800">Semana {prog.semana}/{prog.ano} · {rev(prog.revisao)}</span>
            <span className="text-slate-500">{formatarData(prog.data_inicio)} a {datas[6]}</span>
            {prog.status === 'EMITIDA'
              ? <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Emitida</span>
              : <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Em elaboração</span>}
            <span className="ml-auto inline-flex items-center gap-1 text-slate-600"><Users className="h-4 w-4" aria-hidden="true" />{dados.total_pessoas} pessoa(s) · {dados.frentes.length} frente(s)</span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {DIAS.map((d, i) => (
              <div key={d} className="card px-2 py-2 text-center">
                <p className="text-[11px] font-bold uppercase text-slate-500">{d} <span className="font-normal">{datas[i]}</span></p>
                <p className="text-lg font-extrabold text-omega-700">{dados.programados_por_dia[i]}</p>
                <p className="text-[10px] text-slate-500">programados</p>
              </div>
            ))}
          </div>

          {dados.frentes.map((f) => (
            <section key={f.id} className="card overflow-hidden">
              <div className="bg-omega-700 px-4 py-2 text-sm font-bold text-white">
                {f.titulo}{f.responsavel ? <span className="ml-2 text-xs font-normal text-white/80">Resp. {f.responsavel}</span> : null}
              </div>
              <div className="divide-y divide-slate-100">
                {f.equipes.map((e) => (
                  <div key={e.id} className="grid gap-3 p-4 md:grid-cols-[12rem_1fr_1fr]">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{e.codigo || 'Equipe'}</p>
                      <p className="text-xs text-slate-500">{e.disciplina || '—'} · {e.alocacoes.length} pessoa(s)</p>
                    </div>
                    <div>
                      <p className="rotulo">Principais atividades</p>
                      {(e.itens_atividade || []).map((i) => (
                        <p key={i.id} className="text-sm text-slate-700">
                          {i.codigo_atividade
                            ? <span className="mr-1 rounded border border-omega-300 bg-omega-50 px-1 font-mono text-[11px] font-bold text-omega-700">{i.codigo_atividade}</span>
                            : <span className="mr-1 rounded border border-amber-300 bg-amber-50 px-1 text-[11px] font-bold text-amber-700">Escrita</span>}
                          {i.descricao}{i.observacao ? <span className="text-slate-500"> · {i.observacao}</span> : null}
                        </p>
                      ))}
                      {e.atividades || !(e.itens_atividade || []).length ? <p className="whitespace-pre-wrap text-sm text-slate-700">{e.atividades || '—'}</p> : null}
                    </div>
                    <div>
                      <p className="rotulo">Premissas / pendências</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{e.premissas || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="card overflow-x-auto">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-slate-800">Efetivo nominal programado</p>
              <span className="relative ml-auto">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input className="campo !w-56 !pl-8" placeholder="Buscar pessoa ou função" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Mat.</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Função</th>
                  <th className="px-3 py-2">Equipe</th><th className="px-3 py-2">SEG–DOM</th>
                </tr>
              </thead>
              <tbody>
                {efetivo.map((p) => (
                  <tr key={`${p.matricula || p.nome}`} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{p.matricula || '—'}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{p.nome}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{p.funcao || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{p.equipes.filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-3 py-1.5"><DiasProgramados dias={p.dias} /></td>
                  </tr>
                ))}
                {efetivo.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">Ninguém encontrado.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
