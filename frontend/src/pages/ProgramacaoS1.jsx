import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, CalendarRange, Copy, Download, HardHat, Lock, Plus, Search, Trash2, Unlock, Users } from 'lucide-react';
import ModalBase from '../components/ModalBase.jsx';
import Spinner from '../components/Spinner.jsx';
import { Secao } from '../components/rdo/SecoesRdo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  atualizarAlocacao, atualizarEquipe, atualizarFrente, baixarExportacaoProgramacao, criarAlocacao, criarEquipe, criarFrente,
  criarProgramacao, criarProximaProgramacao, emitirProgramacao, excluirAlocacao, excluirEquipe, excluirFrente, excluirProgramacao,
  listarEfetivoProgramacao, listarObrasProgramacao, listarProgramacoes, novaRevisaoProgramacao, obterProgramacao,
} from '../services/programacaoApi.js';
import { formatarData, formatarDataHora } from '../utils/formatters.js';

const ID_LISTA_EFETIVO = 'programacao-efetivo-contrato';

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const TIPOS = {
  OBRA: { label: 'Obras', cor: 'bg-omega-600/10 text-omega-700 border-omega-300' },
  APOIO: { label: 'Itinerante', cor: 'bg-sky-50 text-sky-700 border-sky-200' },
  DISPONIVEL: { label: 'Disponível', cor: 'bg-amber-50 text-amber-700 border-amber-200' },
  AFASTAMENTO: { label: 'Férias / INSS', cor: 'bg-slate-100 text-slate-600 border-slate-300' },
};
const rev = (n) => `rev${String(n ?? 0).padStart(2, '0')}`;
const nomeSemana = (p) => `Semana ${p.semana}/${p.ano} · ${rev(p.revisao)}`;

function datasDaSemana(dataInicio) {
  const base = new Date(dataInicio);
  return DIAS.map((_, i) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const rotuloObra = (o) => `${o.ss || `Obra ${o.id}`}${o.categoria === 'CANTEIRO_CENTRAL' ? ' · Canteiro Central' : ''} · ${o.descricao?.slice(0, 70) || ''}`;

const somaDias = (alocacoes) => DIAS.map((_, i) => alocacoes.reduce((s, a) => s + (a.dias?.[i] ? 1 : 0), 0));

function SeloStatus({ status }) {
  return status === 'EMITIDA'
    ? <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Emitida</span>
    : <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Em elaboração</span>;
}

function CartaoNumero({ titulo, valor, detalhe, alerta = false }) {
  return (
    <div className="card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`text-2xl font-extrabold ${alerta ? 'text-red-600' : 'text-slate-800'}`}>{valor}</p>
      {detalhe ? <p className="text-xs text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

/** Campo de texto que salva ao sair (blur) quando o valor mudou. */
function CampoSalvo({ valor, onSalvar, multilinha = false, className = 'campo', placeholder, editavel }) {
  const [atual, setAtual] = useState(valor || '');
  useEffect(() => setAtual(valor || ''), [valor]);
  if (!editavel) {
    return multilinha
      ? <p className="whitespace-pre-wrap text-sm text-slate-700">{valor || <span className="text-slate-400">—</span>}</p>
      : <span>{valor || '—'}</span>;
  }
  const props = {
    className,
    value: atual,
    placeholder,
    onChange: (e) => setAtual(e.target.value),
    onBlur: () => { if ((atual || '') !== (valor || '')) onSalvar(atual); },
  };
  return multilinha ? <textarea rows={5} {...props} /> : <input {...props} />;
}

/** Tabela de uma equipe: pessoas × dias (clique na célula marca/desmarca o dia). */
function Equipe({ equipe, editavel, executar, efetivoPorMatricula }) {
  const [nova, setNova] = useState({ matricula: '', nome: '', funcao: '' });
  // Matrícula do efetivo do contrato: completa nome e função.
  const escolherMatricula = (matricula) => {
    const c = efetivoPorMatricula.get(matricula.trim());
    setNova((atual) => (c ? { matricula, nome: c.nome, funcao: c.funcao || '' } : { ...atual, matricula }));
  };
  const totais = somaDias(equipe.alocacoes);

  const adicionar = async () => {
    if (!nova.nome.trim() && !nova.matricula.trim()) return;
    const ok = await executar(() => criarAlocacao(equipe.id, nova));
    if (ok) setNova({ matricula: '', nome: '', funcao: '' });
  };

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        {editavel ? (
          <>
            <CampoSalvo editavel className="campo !w-28 !py-1 font-bold" valor={equipe.codigo} placeholder="Código" onSalvar={(v) => executar(() => atualizarEquipe(equipe.id, { codigo: v }))} />
            <CampoSalvo editavel className="campo !w-56 !py-1" valor={equipe.disciplina} placeholder="Disciplina" onSalvar={(v) => executar(() => atualizarEquipe(equipe.id, { disciplina: v }))} />
          </>
        ) : (
          <p className="text-sm font-bold text-slate-800">{equipe.codigo || 'Equipe'} <span className="font-semibold text-slate-500">· {equipe.disciplina || '—'}</span></p>
        )}
        <span className="ml-auto text-xs text-slate-500">{equipe.alocacoes.length} pessoa(s)</span>
        {editavel ? (
          <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Excluir equipe" title="Excluir equipe"
            onClick={() => window.confirm(`Excluir a equipe ${equipe.codigo || ''} e as pessoas dela?`) && executar(() => excluirEquipe(equipe.id))}>
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5">Mat.</th>
              <th className="px-3 py-1.5">Nome</th>
              <th className="px-3 py-1.5">Função</th>
              {DIAS.map((d) => <th key={d} className="w-10 px-1 py-1.5 text-center">{d}</th>)}
              {editavel ? <th className="w-8" /> : null}
            </tr>
          </thead>
          <tbody>
            {equipe.alocacoes.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-1 font-mono text-xs text-slate-600">{a.matricula || '—'}</td>
                <td className="px-3 py-1 font-medium text-slate-800">{a.nome}</td>
                <td className="px-3 py-1 text-xs text-slate-600">{a.funcao || '—'}</td>
                {DIAS.map((d, i) => {
                  const marcado = Boolean(a.dias?.[i]);
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      <button type="button" disabled={!editavel} aria-label={`${a.nome} ${d}`} aria-pressed={marcado}
                        className={`h-6 w-7 rounded text-xs font-bold transition ${marcado ? 'bg-omega-600 text-white' : 'bg-slate-100 text-slate-300'} ${editavel ? 'hover:ring-2 hover:ring-omega-500/40' : 'cursor-default'}`}
                        onClick={() => executar(() => atualizarAlocacao(a.id, { dias: a.dias.map((v, j) => (j === i ? !v : v)) }))}>
                        {marcado ? '1' : ''}
                      </button>
                    </td>
                  );
                })}
                {editavel ? (
                  <td className="px-1 text-center">
                    <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Remover ${a.nome}`} onClick={() => executar(() => excluirAlocacao(a.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {editavel ? (
              <tr className="border-t border-slate-100 bg-slate-50/60">
                <td className="px-2 py-1"><input className="campo !py-1 text-xs" placeholder="Matrícula (efetivo)" list={ID_LISTA_EFETIVO} value={nova.matricula} onChange={(e) => escolherMatricula(e.target.value)} /></td>
                <td className="px-2 py-1"><input className="campo !py-1 text-xs" placeholder="Nome (ou só a matrícula do cadastro)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && adicionar()} /></td>
                <td className="px-2 py-1"><input className="campo !py-1 text-xs" placeholder="Função" value={nova.funcao} onChange={(e) => setNova({ ...nova, funcao: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && adicionar()} /></td>
                <td colSpan={DIAS.length + 1} className="px-2 py-1">
                  <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={adicionar}><Plus className="h-3.5 w-3.5" /> Adicionar pessoa</button>
                </td>
              </tr>
            ) : null}
            <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
              <td colSpan={3} className="px-3 py-1 text-right">TOTAL</td>
              {totais.map((t, i) => <td key={DIAS[i]} className="px-1 py-1 text-center">{t || '—'}</td>)}
              {editavel ? <td /> : null}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2">
        <div>
          <p className="rotulo">Principais atividades</p>
          <CampoSalvo multilinha editavel={editavel} valor={equipe.atividades} placeholder="> Atividade programada..." onSalvar={(v) => executar(() => atualizarEquipe(equipe.id, { atividades: v }))} />
        </div>
        <div>
          <p className="rotulo">Premissas / pendências</p>
          <CampoSalvo multilinha editavel={editavel} valor={equipe.premissas} placeholder="> Material, munck, PT, liberação..." onSalvar={(v) => executar(() => atualizarEquipe(equipe.id, { premissas: v }))} />
        </div>
      </div>
    </div>
  );
}

function Frente({ frente, editavel, obras, executar, totais, efetivoPorMatricula }) {
  const [editando, setEditando] = useState(false);
  const pessoas = frente.equipes.reduce((s, e) => s + e.alocacoes.length, 0);
  const ss = frente.obra?.orcamento?.ss || frente.codigo;
  const titulo = (
    <span className="flex flex-wrap items-center gap-2">
      {ss ? <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs">{ss}</span> : null}
      <span>{frente.titulo}</span>
    </span>
  );
  const resumo = `${frente.responsavel ? `Resp. ${frente.responsavel} · ` : ''}${pessoas} pessoa(s) · ${DIAS.map((d, i) => totais?.[i] ?? 0).slice(0, 6).join('/')}`;

  return (
    <Secao faixa titulo={titulo} resumo={resumo} aberta={frente.tipo === 'OBRA'}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2 py-0.5 font-bold ${TIPOS[frente.tipo]?.cor}`}>{TIPOS[frente.tipo]?.label}</span>
          {frente.obra ? (
            <Link to={`/obras/${frente.obra.id}`} className="font-semibold text-omega-700 hover:underline">Abrir obra {frente.obra.orcamento?.ss}</Link>
          ) : frente.tipo === 'OBRA' ? (
            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-bold text-red-700">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Vincule a uma obra em andamento{editavel ? ' (Editar frente)' : ''}
            </span>
          ) : frente.tipo === 'APOIO' ? <span className="text-slate-500">Atende todas as frentes</span> : null}
          {frente.obra ? <Link to={`/rdo/obra/${frente.obra.id}`} className="font-semibold text-omega-700 hover:underline">RDOs da obra</Link> : null}
          {editavel ? (
            <span className="ml-auto flex gap-2">
              <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={() => setEditando((v) => !v)}>{editando ? 'Fechar edição' : 'Editar frente'}</button>
              <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={() => executar(() => criarEquipe(frente.id, { disciplina: '' }))}><Plus className="h-3.5 w-3.5" /> Equipe</button>
              <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Excluir frente" title="Excluir frente"
                onClick={() => window.confirm(`Excluir a frente "${frente.titulo}" com todas as equipes?`) && executar(() => excluirFrente(frente.id))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          ) : null}
        </div>

        {editando && editavel ? (
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2"><label className="rotulo">Título</label><CampoSalvo editavel valor={frente.titulo} onSalvar={(v) => executar(() => atualizarFrente(frente.id, { titulo: v }))} /></div>
            <div><label className="rotulo">Código (SS)</label><CampoSalvo editavel valor={frente.codigo} onSalvar={(v) => executar(() => atualizarFrente(frente.id, { codigo: v }))} /></div>
            <div><label className="rotulo">Responsável</label><CampoSalvo editavel valor={frente.responsavel} onSalvar={(v) => executar(() => atualizarFrente(frente.id, { responsavel: v }))} /></div>
            <div>
              <label className="rotulo">Tipo</label>
              <select className="campo" value={frente.tipo} onChange={(e) => executar(() => atualizarFrente(frente.id, e.target.value === 'OBRA' && !frente.obra_id && obras[0] ? { tipo: 'OBRA', obra_id: obras[0].id } : { tipo: e.target.value }))}>
                {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
              </select>
            </div>
            {frente.tipo === 'OBRA' ? (
              <div className="sm:col-span-2 lg:col-span-5">
                <label className="rotulo">Obra em andamento</label>
                <select className="campo" value={frente.obra_id || ''} onChange={(e) => e.target.value && executar(() => atualizarFrente(frente.id, { obra_id: e.target.value }))}>
                  <option value="" disabled>Selecione a obra</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{rotuloObra(o)}</option>)}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        {frente.equipes.map((e) => <Equipe key={e.id} equipe={e} editavel={editavel} executar={executar} efetivoPorMatricula={efetivoPorMatricula} />)}
        {frente.equipes.length === 0 ? <p className="text-sm text-slate-500">Nenhuma equipe nesta frente.</p> : null}
      </div>
    </Secao>
  );
}

function SaldoPorFuncao({ resumo, datas }) {
  return (
    <div className="card overflow-x-auto">
      <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
        {resumo.saldo_pelo_efetivo
          ? <>Saldo por função e dia: <strong>disponíveis no efetivo do contrato</strong> menos os programados em obra ou itinerante. Positivo = sobra gente; <span className="font-semibold text-red-600">negativo = programou mais do que tem</span>.</>
          : <>Pessoas <strong>sem programação</strong> por função e dia: efetivo da lista (fora férias/INSS) menos quem está programado em obra ou itinerante.</>}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Função</th>
            <th className="px-2 py-2 text-center">{resumo.saldo_pelo_efetivo ? 'Disponível' : 'Efetivo'}</th>
            <th className="px-2 py-2 text-center">Afast.</th>
            {DIAS.map((d, i) => <th key={d} className="px-2 py-2 text-center">{d}<br /><span className="font-normal normal-case">{datas[i]}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {resumo.saldo_por_funcao.map((f) => (
            <tr key={f.funcao} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-medium text-slate-800">{f.funcao}</td>
              <td className="px-2 py-1.5 text-center">{f.efetivo}</td>
              <td className="px-2 py-1.5 text-center text-slate-500">{f.afastados || '—'}</td>
              {f.sem_programacao.map((n, i) => (
                <td key={DIAS[i]} className={`px-2 py-1.5 text-center font-semibold ${n < 0 ? 'text-red-600' : n > 0 ? 'text-amber-700' : 'text-slate-300'}`} title={`${f.programados[i]} programado(s)`}>{n || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Conflitos({ conflitos, datas }) {
  if (conflitos.length === 0) return <div className="card p-8 text-center text-sm text-slate-500">Nenhuma pessoa programada em duas equipes no mesmo dia.</div>;
  return (
    <div className="card divide-y divide-slate-100">
      {conflitos.map((c) => (
        <div key={`${c.matricula || c.nome}-${c.dia}`} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <strong className="text-slate-800">{c.nome}</strong>
          {c.matricula ? <span className="font-mono text-xs text-slate-500">{c.matricula}</span> : null}
          <span className="text-slate-600">· {DIAS[c.dia]} {datas[c.dia]} em</span>
          <span className="text-slate-700">{c.locais.map((l) => `${l.equipe || '—'} (${l.frente})`).join(' e ')}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Efetivo do contrato (cadastro de colaboradores, o mesmo que o RDO usa na mão de obra) cruzado com a
 * semana: onde cada pessoa está programada e quem está disponível sem programação.
 */
function EfetivoContrato({ efetivo, prog }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const ondeEsta = useMemo(() => {
    const mapa = new Map();
    prog.frentes.forEach((f) => f.equipes.forEach((e) => e.alocacoes.forEach((a) => {
      if (!a.matricula) return;
      const lista = mapa.get(a.matricula) || [];
      lista.push({ frente: f, equipe: e, dias: a.dias });
      mapa.set(a.matricula, lista);
    })));
    return mapa;
  }, [prog]);

  const termo = busca.trim().toUpperCase();
  const linhas = efetivo
    .filter((c) => !termo || `${c.nome} ${c.matricula || ''} ${c.funcao || ''} ${c.disciplina || ''} ${c.supervisor || ''}`.toUpperCase().includes(termo))
    .filter((c) => {
      const programado = ondeEsta.has(c.matricula);
      if (filtro === 'sem') return c.situacao === 'DISPONIVEL' && !programado;
      if (filtro === 'indisponiveis') return c.situacao === 'INDISPONIVEL';
      return true;
    });
  const semProgramacao = efetivo.filter((c) => c.situacao === 'DISPONIVEL' && !ondeEsta.has(c.matricula)).length;

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        {[['', `Todos (${efetivo.length})`], ['sem', `Disponíveis sem programação (${semProgramacao})`], ['indisponiveis', 'Indisponíveis']].map(([v, rotulo]) => (
          <button key={v || 'todos'} type="button" onClick={() => setFiltro(v)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === v ? 'border-omega-600 bg-omega-600 text-white' : 'border-slate-200 text-slate-600 hover:border-omega-300'}`}>
            {rotulo}
          </button>
        ))}
        <span className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input className="campo !w-64 !pl-8" placeholder="Buscar no efetivo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </span>
      </div>
      {efetivo.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">Nenhum colaborador no efetivo do contrato (cadastro de colaboradores do RDO).</div> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Mat.</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Função</th>
                <th className="px-3 py-2">Disciplina</th><th className="px-3 py-2">Supervisor</th><th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Nesta semana</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                const locais = ondeEsta.get(c.matricula) || [];
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{c.matricula || '—'}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{c.nome}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{c.funcao || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{c.disciplina || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{c.supervisor || '—'}</td>
                    <td className="px-3 py-1.5">
                      {c.situacao === 'INDISPONIVEL'
                        ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Indisponível</span>
                        : <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Disponível</span>}
                      {c.ferias_inicio ? <span className="ml-1 text-[11px] text-slate-500">férias {formatarData(c.ferias_inicio)}–{formatarData(c.ferias_fim)}</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {locais.length
                        ? locais.map((l) => `${l.equipe.codigo || '—'} · ${l.frente.obra?.orcamento?.ss || l.frente.codigo || l.frente.titulo}`).join(' | ')
                        : <span className={c.situacao === 'DISPONIVEL' ? 'font-semibold text-amber-700' : 'text-slate-400'}>sem programação</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModalNovaSemana({ aberto, onFechar, programacoes, onCriada }) {
  const toast = useToast();
  const proxima = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [data, setData] = useState(proxima);
  const [copiarDe, setCopiarDe] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) { setData(proxima); setCopiarDe(programacoes[0]?.id ? String(programacoes[0].id) : ''); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    setSalvando(true);
    try {
      const p = await criarProgramacao({ data, copiar_de_id: copiarDe || null });
      toast.sucesso(`Programação da semana ${p.semana}/${p.ano} criada.`);
      onCriada(p);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalBase aberto={aberto} titulo="Nova programação semanal" subtitulo="Escolha um dia da semana a programar (S+1)." onFechar={onFechar} tamanho="md">
      <div className="space-y-3">
        <div><label className="rotulo">Dia da semana programada</label><input type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div>
          <label className="rotulo">Partir de</label>
          <select className="campo" value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
            <option value="">Programação em branco</option>
            {programacoes.map((p) => <option key={p.id} value={p.id}>Copiar {nomeSemana(p)}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">A cópia traz frentes, equipes, pessoas, presença, atividades e premissas — é só ajustar o que muda.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-neutro" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={salvando || !data} onClick={salvar}>{salvando ? 'Criando...' : 'Criar'}</button>
        </div>
      </div>
    </ModalBase>
  );
}

function ModalNovaFrente({ aberto, onFechar, obras, onSalvar }) {
  const [f, setF] = useState({ titulo: '', tipo: 'OBRA', codigo: '', responsavel: '', obra_id: '' });
  useEffect(() => { if (aberto) setF({ titulo: '', tipo: 'OBRA', codigo: '', responsavel: '', obra_id: '' }); }, [aberto]);
  const escolherObra = (id) => {
    const obra = obras.find((o) => String(o.id) === id);
    setF((atual) => ({ ...atual, obra_id: id, codigo: obra?.ss || atual.codigo, titulo: atual.titulo || obra?.descricao?.slice(0, 200) || '' }));
  };
  return (
    <ModalBase aberto={aberto} titulo="Nova frente de serviço" onFechar={onFechar} tamanho="md">
      <div className="space-y-3">
        <div>
          <label className="rotulo">Tipo</label>
          <select className="campo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
          </select>
        </div>
        {f.tipo === 'OBRA' ? (
          <div>
            <label className="rotulo">Obra em andamento</label>
            <select className="campo" value={f.obra_id} onChange={(e) => escolherObra(e.target.value)}>
              <option value="">Selecione a obra</option>
              {obras.map((o) => <option key={o.id} value={o.id}>{rotuloObra(o)}</option>)}
            </select>
            {obras.length === 0 ? <p className="mt-1 text-xs text-red-600">Nenhuma obra em andamento cadastrada em Obras.</p> : null}
          </div>
        ) : null}
        <div><label className="rotulo">Título</label><input className="campo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          {f.tipo === 'OBRA' ? (
            <div><label className="rotulo">SS</label><input className="campo" value={f.codigo} disabled placeholder="vem da obra" /></div>
          ) : (
            <div><label className="rotulo">Código</label><input className="campo" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="ITINERANTE" /></div>
          )}
          <div><label className="rotulo">Responsável</label><input className="campo" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-neutro" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={!f.titulo.trim() || (f.tipo === 'OBRA' && !f.obra_id)} onClick={() => onSalvar(f)}>Adicionar</button>
        </div>
      </div>
    </ModalBase>
  );
}

/**
 * Programação S+1: a programação semanal de mão de obra da semana seguinte, montada na reunião
 * semanal (substitui a planilha "Programação_S+1_Sem_NN revNN.xlsx").
 */
export default function ProgramacaoS1() {
  const { usuario } = useAuth();
  const toast = useToast();
  const [programacoes, setProgramacoes] = useState(null);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [prog, setProg] = useState(null);
  const [obras, setObras] = useState([]);
  const [efetivo, setEfetivo] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState('programacao');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [modalSemana, setModalSemana] = useState(false);
  const [modalFrente, setModalFrente] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const podeExcluir = ['SUPERVISOR', 'ADMIN'].includes(usuario?.perfil);

  const carregarLista = useCallback(async (manterId) => {
    const lista = await listarProgramacoes();
    setProgramacoes(lista);
    setSelecionadaId((atual) => manterId ?? (lista.some((p) => p.id === atual) ? atual : lista[0]?.id ?? null));
  }, []);

  const recarregar = useCallback(async (id = selecionadaId) => {
    if (!id) { setProg(null); return; }
    setProg(await obterProgramacao(id));
  }, [selecionadaId]);

  useEffect(() => {
    carregarLista().catch((err) => { toast.erro(err.message); setProgramacoes([]); });
    listarObrasProgramacao().then(setObras).catch(() => setObras([]));
    listarEfetivoProgramacao().then(setEfetivo).catch(() => setEfetivo([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selecionadaId) { setProg(null); return; }
    setCarregando(true);
    obterProgramacao(selecionadaId).then(setProg).catch((err) => toast.erro(err.message)).finally(() => setCarregando(false));
  }, [selecionadaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const efetivoPorMatricula = useMemo(() => new Map(efetivo.filter((c) => c.matricula).map((c) => [c.matricula, c])), [efetivo]);

  /** Executa uma alteração e recarrega a programação. Retorna true se deu certo. */
  const executar = useCallback(async (operacao) => {
    try {
      await operacao();
      await recarregar();
      return true;
    } catch (err) {
      toast.erro(err.message);
      return false;
    }
  }, [recarregar, toast]);

  const mudarStatus = async (operacao, mensagem) => {
    try {
      const p = await operacao(prog.id);
      setProg(p);
      await carregarLista(p.id);
      toast.sucesso(mensagem(p));
    } catch (err) {
      toast.erro(err.message);
    }
  };

  /** Início da reunião: cria a semana seguinte à última, copiando tudo dela. */
  const copiarSemanaAnterior = async () => {
    const ultima = programacoes?.[0];
    const aviso = ultima
      ? `Criar a semana seguinte à ${nomeSemana(ultima)}, copiando frentes, equipes, pessoas, atividades e premissas?`
      : 'Criar a programação desta semana (em branco)?';
    if (!window.confirm(aviso)) return;
    setOcupado('copiar');
    try {
      const p = await criarProximaProgramacao();
      await carregarLista(p.id);
      setProg(p);
      toast.sucesso(`${nomeSemana(p)} criada${ultima ? ` a partir da semana ${ultima.semana}` : ''}.`);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setOcupado('');
    }
  };

  const exportar = async () => {
    setOcupado('exportar');
    try {
      const { blob, nome } = await baixarExportacaoProgramacao(prog.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setOcupado('');
    }
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir a programação da ${nomeSemana(prog)}? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirProgramacao(prog.id);
      toast.sucesso('Programação excluída.');
      await carregarLista(null);
    } catch (err) {
      toast.erro(err.message);
    }
  };

  const datas = useMemo(() => (prog ? datasDaSemana(prog.data_inicio) : []), [prog]);
  const editavel = prog?.status === 'EM_ELABORACAO';

  const frentesFiltradas = useMemo(() => {
    if (!prog) return [];
    const termo = busca.trim().toUpperCase();
    return prog.frentes
      .filter((f) => !filtroTipo || f.tipo === filtroTipo)
      .map((f) => (termo ? {
        ...f,
        equipes: f.equipes.map((e) => ({ ...e, alocacoes: e.alocacoes.filter((a) => `${a.nome} ${a.matricula || ''} ${a.funcao || ''}`.toUpperCase().includes(termo)) })).filter((e) => e.alocacoes.length > 0),
      } : f))
      .filter((f) => !termo || f.equipes.length > 0 || f.titulo.toUpperCase().includes(termo));
  }, [prog, filtroTipo, busca]);

  if (programacoes === null) return <div className="flex justify-center py-10"><Spinner /></div>;

  const resumo = prog?.resumo;
  const contagemTipo = (tipo) => prog?.frentes.filter((f) => f.tipo === tipo).length ?? 0;
  const semObra = prog?.frentes.filter((f) => f.tipo === 'OBRA' && !f.obra_id).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Lista do efetivo do contrato para os campos de matrícula. */}
      <datalist id={ID_LISTA_EFETIVO}>
        {efetivo.filter((c) => c.matricula).map((c) => <option key={c.id} value={c.matricula}>{`${c.nome} · ${c.funcao || ''}`}</option>)}
      </datalist>

      {/* Barra da semana */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <CalendarRange className="h-5 w-5 text-omega-600" aria-hidden="true" />
        {programacoes.length > 0 ? (
          <select className="campo !w-auto font-semibold" value={selecionadaId || ''} onChange={(e) => setSelecionadaId(Number(e.target.value))} aria-label="Semana">
            {programacoes.map((p) => <option key={p.id} value={p.id}>{nomeSemana(p)}</option>)}
          </select>
        ) : <span className="text-sm text-slate-500">Nenhuma programação ainda.</span>}
        {prog ? <SeloStatus status={prog.status} /> : null}
        {prog?.status === 'EMITIDA' && prog.emitida_em ? <span className="text-xs text-slate-500">emitida em {formatarDataHora(prog.emitida_em)}</span> : null}
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-primario" disabled={Boolean(ocupado)} onClick={copiarSemanaAnterior}
            title="Cria a semana seguinte à última programação, copiando tudo dela">
            <Copy className="h-4 w-4" /> {ocupado === 'copiar' ? 'Copiando...' : programacoes.length ? 'Copiar semana anterior' : 'Criar semana atual'}
          </button>
          <button type="button" className="btn-neutro !px-2" title="Criar outra semana (escolher data ou origem)" aria-label="Criar outra semana" onClick={() => setModalSemana(true)}>
            <CalendarPlus className="h-4 w-4" />
          </button>
          {prog ? (
            <button type="button" className="btn-neutro" disabled={Boolean(ocupado)} onClick={exportar}>
              <Download className="h-4 w-4" /> {ocupado === 'exportar' ? 'Gerando...' : 'Exportar .xlsx'}
            </button>
          ) : null}
          {prog && editavel ? (
            <button type="button" className="btn-neutro" onClick={() => window.confirm(`Emitir a ${nomeSemana(prog)}? A edição fica travada até abrir uma nova revisão.`) && mudarStatus(emitirProgramacao, (p) => `${nomeSemana(p)} emitida.`)}>
              <Lock className="h-4 w-4" /> Emitir {rev(prog.revisao)}
            </button>
          ) : null}
          {prog && !editavel ? (
            <button type="button" className="btn-neutro" onClick={() => mudarStatus(novaRevisaoProgramacao, (p) => `Revisão ${rev(p.revisao)} aberta.`)}>
              <Unlock className="h-4 w-4" /> Nova revisão ({rev((prog.revisao ?? 0) + 1)})
            </button>
          ) : null}
          {prog && podeExcluir ? (
            <button type="button" className="btn-neutro !px-2" aria-label="Excluir programação" title="Excluir programação" onClick={excluir}><Trash2 className="h-4 w-4" /></button>
          ) : null}
        </span>
      </div>

      {!prog && !carregando ? (
        <div className="card space-y-2 p-8 text-center text-sm text-slate-500">
          <p>Nenhuma programação. Clique em <strong>Criar semana atual</strong> para começar.</p>
        </div>
      ) : null}
      {carregando && !prog ? <div className="flex justify-center py-10"><Spinner /></div> : null}

      {prog && resumo ? (
        <>
          {/* Dias da semana com programados */}
          <div className="grid grid-cols-7 gap-2">
            {DIAS.map((d, i) => (
              <div key={d} className="card px-2 py-2 text-center">
                <p className="text-[11px] font-bold uppercase text-slate-500">{d} <span className="font-normal">{datas[i]}</span></p>
                <p className="text-lg font-extrabold text-omega-700">{resumo.programados_por_dia[i]}</p>
                <p className="text-[10px] text-slate-500">programados</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <CartaoNumero titulo="Efetivo do contrato" valor={efetivo.length || resumo.efetivo_ativo}
              detalhe={efetivo.length ? `${efetivo.filter((c) => c.situacao === 'DISPONIVEL').length} disponíveis` : `${resumo.total_pessoas} na lista`} />
            <CartaoNumero titulo="Frentes de obra" valor={contagemTipo('OBRA')} detalhe={`${contagemTipo('APOIO')} itinerantes`} />
            <CartaoNumero titulo="Sem programação" valor={resumo.saldo_pelo_efetivo ? resumo.nao_programados.length : resumo.por_tipo.DISPONIVEL[0]}
              detalhe={resumo.saldo_pelo_efetivo ? 'disponíveis fora da semana' : 'sem frente (segunda)'} />
            <CartaoNumero titulo="Férias / INSS" valor={resumo.afastados} />
            <CartaoNumero titulo="Conflitos" valor={resumo.conflitos.length} detalhe="mesma pessoa, mesmo dia" alerta={resumo.conflitos.length > 0} />
          </div>

          {semObra > 0 ? (
            <div className="card flex items-center gap-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {semObra} frente(s) de obra sem vínculo com obra em andamento. Use <strong>Editar frente</strong> para escolher a obra.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {[
                ['programacao', 'Programação', CalendarRange],
                ['efetivo', 'Efetivo do contrato', HardHat],
                ['saldo', 'Saldo por função', Users],
                ['conflitos', `Conflitos (${resumo.conflitos.length})`, AlertTriangle],
              ].map(([id, rotulo, Icone]) => (
                <button key={id} type="button" className={`rounded-md px-3 py-1.5 text-sm font-semibold ${aba === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => setAba(id)}>
                  <Icone className="mr-1 inline h-4 w-4" aria-hidden="true" /> {rotulo}
                </button>
              ))}
            </div>
            {!editavel ? <span className="text-xs text-slate-500"><Lock className="mr-1 inline h-3.5 w-3.5" />Emitida: abra uma nova revisão para alterar.</span> : null}
          </div>

          {aba === 'programacao' ? (
            <div className="space-y-3">
              <div className="card flex flex-wrap items-center gap-2 p-3">
                {[['', 'Todas'], ...Object.entries(TIPOS).map(([v, t]) => [v, t.label])].map(([v, rotulo]) => (
                  <button key={v || 'todas'} type="button" onClick={() => setFiltroTipo(v)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtroTipo === v ? 'border-omega-600 bg-omega-600 text-white' : 'border-slate-200 text-slate-600 hover:border-omega-300'}`}>
                    {rotulo}{v ? ` (${contagemTipo(v)})` : ''}
                  </button>
                ))}
                <span className="relative ml-auto">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <input className="campo !w-64 !pl-8" placeholder="Buscar pessoa, matrícula ou função" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </span>
                {editavel ? <button type="button" className="btn-primario" onClick={() => setModalFrente(true)}><Plus className="h-4 w-4" /> Frente</button> : null}
              </div>
              {frentesFiltradas.map((f) => (
                <Frente key={f.id} frente={f} editavel={editavel} obras={obras} executar={executar} totais={resumo.total_por_frente[f.id]} efetivoPorMatricula={efetivoPorMatricula} />
              ))}
              {frentesFiltradas.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">Nenhuma frente encontrada.</div> : null}
            </div>
          ) : null}
          {aba === 'efetivo' ? <EfetivoContrato efetivo={efetivo} prog={prog} /> : null}
          {aba === 'saldo' ? <SaldoPorFuncao resumo={resumo} datas={datas} /> : null}
          {aba === 'conflitos' ? <Conflitos conflitos={resumo.conflitos} datas={datas} /> : null}
        </>
      ) : null}

      <ModalNovaSemana aberto={modalSemana} onFechar={() => setModalSemana(false)} programacoes={programacoes}
        onCriada={async (p) => { setModalSemana(false); await carregarLista(p.id); setProg(p); }} />
      <ModalNovaFrente aberto={modalFrente} onFechar={() => setModalFrente(false)} obras={obras}
        onSalvar={async (f) => { if (await executar(() => criarFrente(prog.id, f))) setModalFrente(false); }} />
    </div>
  );
}
