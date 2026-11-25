import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, CalendarRange, Copy, Download, HardHat, Link2, Lock, Plus, RefreshCw, Search, Trash2, Unlock, UserMinus, UserPlus, Users } from 'lucide-react';
import ModalBase from '../components/ModalBase.jsx';
import Spinner from '../components/Spinner.jsx';
import { Secao } from '../components/rdo/SecoesRdo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  atualizarAlocacao, atualizarEquipe, atualizarFrente, baixarExportacaoProgramacao, criarAlocacao, criarEquipe, criarFrente,
  criarProgramacao, criarProximaProgramacao, emitirProgramacao, excluirAlocacao, excluirEquipe, excluirFrente, excluirProgramacao,
  listarEfetivoProgramacao, listarObrasProgramacao, listarProgramacoes, novaRevisaoProgramacao, obterProgramacao,
  sincronizarEfetivoProgramacao, obterCronogramaDaObraProgramacao, criarItemAtividadeProgramacao, atualizarItemAtividadeProgramacao, excluirItemAtividadeProgramacao, mobilizarColaborador, desmobilizarColaborador, atualizarColaboradorEfetivo,
} from '../services/programacaoApi.js';
import { formatarData, formatarDataHora } from '../utils/formatters.js';

const ID_LISTA_EFETIVO = 'programacao-efetivo-contrato';
const ID_LISTA_FUNCOES = 'programacao-funcoes';

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

const STATUS_OBRA = {
  EM_ANDAMENTO: { label: 'Em andamento', cor: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  PARA_INICIAR: { label: 'Para iniciar', cor: 'border-slate-300 bg-slate-100 text-slate-600' },
  PARALISADA: { label: 'Paralisada', cor: 'border-amber-300 bg-amber-50 text-amber-700' },
  CONCLUIDA: { label: 'Concluída', cor: 'border-amber-300 bg-amber-50 text-amber-700' },
};

function SeloStatusObra({ status }) {
  const s = STATUS_OBRA[status];
  return s ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${s.cor}`}>{s.label}</span> : null;
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Seletor de obra com busca por SS, PEP/CC, OSI, descrição ou "Canteiro Central". Lista todas as obras
 * cadastradas; em andamento (e canteiro central) aparecem primeiro.
 */
function ListaBuscaObras({ obras, atualId, onEscolher, altura = 'max-h-[50vh]' }) {
  const [busca, setBusca] = useState('');
  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  const filtradas = obras.filter((o) => {
    const texto = semAcento(`${o.ss || ''} ${o.pep || ''} ${o.osi_numero || ''} ${o.descricao || ''} ${o.categoria === 'CANTEIRO_CENTRAL' ? 'CANTEIRO CENTRAL' : ''} ${STATUS_OBRA[o.status]?.label || ''}`);
    return termos.every((t) => texto.includes(t));
  });
  return (
    <div className="space-y-3">
        <span className="relative block">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input autoFocus className="campo !pl-8" placeholder="Ex.: SS113/24, 998, CEP, canteiro..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </span>
        <div className={`${altura} divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200`}>
          {filtradas.map((o) => (
            <button key={o.id} type="button" onClick={() => onEscolher(o)}
              className={`flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-omega-50 ${o.id === atualId ? 'bg-omega-50' : ''}`}>
              <span className="font-mono text-xs font-bold text-slate-800">{o.ss || `Obra ${o.id}`}</span>
              {o.categoria === 'CANTEIRO_CENTRAL' ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">Canteiro Central</span> : null}
              <SeloStatusObra status={o.status} />
              {o.id === atualId ? <span className="text-[11px] font-bold text-omega-700">vinculada</span> : null}
              <span className="w-full truncate text-xs text-slate-600">{o.descricao || '—'}</span>
              <span className="w-full text-[11px] text-slate-400">PEP {o.pep || '—'}{o.osi_numero ? ` · OSI ${o.osi_numero}` : ''}</span>
            </button>
          ))}
          {filtradas.length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma obra encontrada.</p> : null}
        </div>
    </div>
  );
}

function ModalSeletorObra({ aberto, obras, atualId, titulo = 'Vincular obra', onFechar, onEscolher }) {
  return (
    <ModalBase aberto={aberto} titulo={titulo} subtitulo="Busque por SS, PEP/CC, OSI, descrição ou Canteiro Central." onFechar={onFechar} tamanho="lg">
      <div className="p-5">{aberto ? <ListaBuscaObras obras={obras} atualId={atualId} onEscolher={onEscolher} /> : null}</div>
    </ModalBase>
  );
}

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
/** Cronograma (linhas-folha da revisão vigente) por obra, carregado uma vez por página. */
const cacheCronograma = new Map();
function useCronogramaDaObra(obraId) {
  const [dados, setDados] = useState(() => (obraId && cacheCronograma.get(obraId)?.valor) || null);
  useEffect(() => {
    if (!obraId) { setDados(null); return undefined; }
    let ativo = true;
    let item = cacheCronograma.get(obraId);
    if (!item) {
      item = { promessa: obterCronogramaDaObraProgramacao(obraId).then((r) => { item.valor = r; return r; }).catch(() => ({ versao: null, atividades: [] })) };
      cacheCronograma.set(obraId, item);
    }
    item.promessa.then((r) => ativo && setDados(r));
    return () => { ativo = false; };
  }, [obraId]);
  return dados;
}

const rotuloLinha = (l) => `${l.codigo_atividade} — ${l.descricao}`;

/**
 * Atividades programadas da equipe: cada item é uma linha do cronograma da obra (com observação)
 * ou um serviço escrito. No RDO, a atividade lançada já vem com a mão de obra da equipe.
 */
function AtividadesProgramadas({ equipe, obraId, editavel, executar }) {
  const cronograma = useCronogramaDaObra(obraId);
  const [texto, setTexto] = useState('');
  const [observacao, setObservacao] = useState('');
  const idLista = `cronograma-obra-${obraId || 'nenhuma'}`;
  const linhas = cronograma?.atividades || [];
  const itens = equipe.itens_atividade || [];

  const adicionar = async () => {
    const t = texto.trim();
    if (!t) return;
    const linha = linhas.find((l) => rotuloLinha(l) === t || l.codigo_atividade === t);
    const corpo = linha ? { codigo_atividade: linha.codigo_atividade, observacao } : { descricao: t, observacao };
    if (await executar(() => criarItemAtividadeProgramacao(equipe.id, corpo))) { setTexto(''); setObservacao(''); }
  };

  return (
    <div className="border-t border-slate-100 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="rotulo !mb-0">Atividades programadas</p>
        <span className="text-[11px] text-slate-500">
          linha do cronograma ou serviço escrito · no RDO, ao lançar a atividade a mão de obra desta equipe já vem preenchida
        </span>
      </div>
      {itens.length ? (
        <ul className="mb-2 space-y-1.5">
          {itens.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
              {i.codigo_atividade
                ? <span className="rounded border border-omega-300 bg-omega-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-omega-700" title="Linha do cronograma">{i.codigo_atividade}</span>
                : <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700" title="Vira atividade fora de escopo no RDO">Escrita</span>}
              <span className="min-w-[12rem] flex-1 font-medium text-slate-800">{i.descricao}</span>
              <span className="w-full sm:w-72">
                <CampoSalvo editavel={editavel} className="campo !py-1 text-xs" valor={i.observacao} placeholder="Observação"
                  onSalvar={(v) => executar(() => atualizarItemAtividadeProgramacao(i.id, { observacao: v }))} />
              </span>
              {editavel ? (
                <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Remover ${i.descricao}`}
                  onClick={() => executar(() => excluirItemAtividadeProgramacao(i.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="mb-2 text-xs text-slate-400">Nenhuma atividade programada nesta equipe.</p>}
      {editavel ? (
        <div className="flex flex-wrap items-center gap-2">
          <datalist id={idLista}>{linhas.map((l) => <option key={l.codigo_atividade} value={rotuloLinha(l)} />)}</datalist>
          <input className="campo !w-auto min-w-[18rem] flex-1 !py-1 text-xs" list={idLista} value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            placeholder={obraId ? (linhas.length ? 'Busque a linha do cronograma (código ou descrição) ou escreva o serviço' : 'Escreva o serviço (obra sem cronograma importado)') : 'Escreva o serviço (frente sem obra vinculada)'} />
          <input className="campo !w-56 !py-1 text-xs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional)"
            onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
          <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={adicionar}><Plus className="h-3.5 w-3.5" /> Adicionar atividade</button>
        </div>
      ) : null}
    </div>
  );
}

function Equipe({ equipe, editavel, executar, efetivoPorMatricula, obraId }) {
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

      <AtividadesProgramadas equipe={equipe} obraId={obraId} editavel={editavel} executar={executar} />

      <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2">
        <div>
          <p className="rotulo">Principais atividades (texto)</p>
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

/** Informações da obra vinculada para a faixa da frente: descrição, PEP, OSI, responsáveis e local. */
function infoDaObra(obra) {
  if (!obra) return [];
  const o = obra.orcamento || {};
  const nomes = (lista) => [...new Set(lista.filter(Boolean))].join(', ');
  const planejadores = nomes([...(obra.planejadores || []).map((p) => p.usuario?.nome), obra.planejador?.nome]);
  const campos = [
    ['Obra', o.descricao],
    ['PEP', o.pep],
    ['OSI', obra.osi_numero],
    ['Planejador', planejadores],
    ['Fiscal', nomes((o.fiscais || []).map((f) => f.nome))],
    ['Encarregado', nomes((obra.encarregados || []).map((e) => e.usuario?.nome))],
    ['Local', o.endereco],
    ['Contrato', obra.contrato?.id_vale],
    ['Situação', obra.status !== 'EM_ANDAMENTO' ? STATUS_OBRA[obra.status]?.label || obra.status : null],
  ];
  return campos.filter(([, v]) => v);
}

function Frente({ frente, editavel, obras, executar, totais, efetivoPorMatricula }) {
  const [editando, setEditando] = useState(false);
  // Seletor de obra: null (fechado) ou o tipo a gravar junto com a obra escolhida.
  const [seletor, setSeletor] = useState(null);
  const pessoas = frente.equipes.reduce((s, e) => s + e.alocacoes.length, 0);
  const vincular = async (obra) => {
    const ok = await executar(() => atualizarFrente(frente.id, { tipo: 'OBRA', obra_id: obra.id }));
    if (ok) setSeletor(null);
  };
  const ss = frente.obra?.orcamento?.ss || frente.codigo;
  const dadosObra = infoDaObra(frente.obra);
  const titulo = (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        {ss ? <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs">{ss}</span> : null}
        <span>{frente.titulo}</span>
      </span>
      {dadosObra.length ? (
        <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-normal text-white/85">
          {dadosObra.map(([rotulo, valor]) => (
            <span key={rotulo}><span className="text-white/60">{rotulo}:</span> <span className="font-semibold text-white">{valor}</span></span>
          ))}
        </span>
      ) : null}
    </span>
  );
  const resumo = `${frente.responsavel ? `Resp. ${frente.responsavel} · ` : ''}${pessoas} pessoa(s) · ${DIAS.map((d, i) => totais?.[i] ?? 0).slice(0, 6).join('/')}`;

  return (
    <Secao faixa titulo={titulo} resumo={resumo} aberta={frente.tipo === 'OBRA'}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2 py-0.5 font-bold ${TIPOS[frente.tipo]?.cor}`}>{TIPOS[frente.tipo]?.label}</span>
          {frente.obra ? (
            <>
              <span className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5" title={frente.obra.orcamento?.descricao || ''}>
                <span className="font-semibold text-slate-500">Obra</span>
                <span className="font-mono font-bold text-slate-800">{frente.obra.orcamento?.ss || `#${frente.obra.id}`}</span>
                <span className="max-w-[22rem] truncate text-slate-600">{frente.obra.orcamento?.descricao}</span>
              </span>
              {frente.obra.categoria === 'CANTEIRO_CENTRAL' ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 font-bold text-slate-700">Canteiro Central</span> : null}
              {frente.obra.status !== 'EM_ANDAMENTO' ? <SeloStatusObra status={frente.obra.status} /> : null}
              <Link to={`/obras/${frente.obra.id}`} className="font-semibold text-omega-700 hover:underline">Abrir obra</Link>
              <Link to={`/rdo/obra/${frente.obra.id}`} className="font-semibold text-omega-700 hover:underline">RDOs da obra</Link>
              {editavel ? <button type="button" className="font-semibold text-slate-500 underline-offset-2 hover:underline" onClick={() => setSeletor('OBRA')}>Trocar obra</button> : null}
            </>
          ) : frente.tipo === 'OBRA' ? (
            <>
              <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-bold text-red-700">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Frente sem obra vinculada
              </span>
              {editavel ? <button type="button" className="btn-primario !px-2 !py-1 text-xs" onClick={() => setSeletor('OBRA')}><Link2 className="h-3.5 w-3.5" /> Vincular obra</button> : null}
            </>
          ) : frente.tipo === 'APOIO' ? <span className="text-slate-500">Atende todas as frentes</span> : null}
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
              {/* Virar frente de obra exige escolher a obra: abre o seletor. */}
              <select className="campo" value={frente.tipo} onChange={(e) => (e.target.value === 'OBRA' && !frente.obra_id
                ? setSeletor('OBRA')
                : executar(() => atualizarFrente(frente.id, { tipo: e.target.value })))}>
                {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
              </select>
            </div>
          </div>
        ) : null}

        <ModalSeletorObra aberto={Boolean(seletor)} obras={obras} atualId={frente.obra_id}
          titulo={`Vincular obra · ${frente.titulo}`} onFechar={() => setSeletor(null)} onEscolher={vincular} />

        {frente.equipes.map((e) => <Equipe key={e.id} equipe={e} editavel={editavel} executar={executar} efetivoPorMatricula={efetivoPorMatricula} obraId={frente.obra_id} />)}
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
/** Faixa SEG..DOM com os dias programados (pessoa pode estar em mais de uma equipe). */
/**
 * Faixa SEG..DOM. `contagem[i]` = em quantos lugares a pessoa está no dia (2+ = conflito, em âmbar).
 */
function DiasProgramados({ contagem, tamanho = 'h-5 w-6 text-[10px]' }) {
  return (
    <span className="inline-flex gap-0.5" aria-label="Dias programados">
      {DIAS.map((d, i) => {
        const n = contagem[i] || 0;
        const cor = n > 1 ? 'bg-amber-500 text-white' : n === 1 ? 'bg-omega-600 text-white' : 'bg-slate-100 text-slate-300';
        return <span key={d} title={n > 1 ? `${d}: em ${n} lugares` : d} className={`flex items-center justify-center rounded font-bold ${tamanho} ${cor}`}>{d[0]}</span>;
      })}
    </span>
  );
}

const rotuloFrente = (f) => `${f.obra?.orcamento?.ss || f.codigo || TIPOS[f.tipo]?.label || ''} · ${f.titulo}`;

/**
 * Distribui uma ou mais pessoas do efetivo numa frente/equipe da semana, nos dias escolhidos.
 * A equipe pode ser uma existente da frente ou uma nova (código e disciplina).
 */
function ModalDistribuir({ aberto, pessoas, prog, ondeEsta, onFechar, onConfirmar }) {
  const [frenteId, setFrenteId] = useState('');
  const [equipeId, setEquipeId] = useState('');
  const [novaEquipe, setNovaEquipe] = useState({ codigo: '', disciplina: '' });
  const [dias, setDias] = useState([true, true, true, true, true, false, false]);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setFrenteId('');
    setEquipeId('');
    setNovaEquipe({ codigo: '', disciplina: '' });
    setDias([true, true, true, true, true, false, false]);
  }, [aberto]);

  const frente = prog.frentes.find((f) => String(f.id) === String(frenteId));
  const grupos = Object.entries(TIPOS).map(([tipo, t]) => [t.label, prog.frentes.filter((f) => f.tipo === tipo)]).filter(([, l]) => l.length);
  // Quem já está programado em algum dos dias escolhidos (vai ficar em dois lugares).
  const conflitos = pessoas.filter((p) => (ondeEsta.get(p.matricula) || []).some((l) => dias.some((v, i) => v && l.dias?.[i])));

  const confirmar = async () => {
    setSalvando(true);
    const ok = await onConfirmar({ frente, equipeId: equipeId === 'nova' ? null : Number(equipeId), novaEquipe, dias });
    setSalvando(false);
    if (ok) onFechar();
  };

  const pronto = frente && equipeId && (equipeId !== 'nova' || novaEquipe.disciplina.trim() || novaEquipe.codigo.trim()) && dias.some(Boolean);
  return (
    <ModalBase aberto={aberto} titulo={`Distribuir ${pessoas.length === 1 ? pessoas[0].nome : `${pessoas.length} pessoas`}`}
      subtitulo="Escolha a obra/frente, a equipe e os dias da semana." onFechar={onFechar} tamanho="lg">
      <div className="space-y-4 p-5">
        {pessoas.length > 1 ? (
          <p className="max-h-20 overflow-y-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{pessoas.map((p) => p.nome).join(' · ')}</p>
        ) : null}
        <div>
          <label className="rotulo" htmlFor="distribuir-frente">Obra / frente</label>
          <select id="distribuir-frente" className="campo" value={frenteId} onChange={(e) => { setFrenteId(e.target.value); setEquipeId(''); }}>
            <option value="">Selecione...</option>
            {grupos.map(([rotulo, lista]) => (
              <optgroup key={rotulo} label={rotulo}>
                {lista.map((f) => <option key={f.id} value={f.id}>{rotuloFrente(f)}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {frente ? (
          <div>
            <label className="rotulo" htmlFor="distribuir-equipe">Equipe</label>
            <select id="distribuir-equipe" className="campo" value={equipeId} onChange={(e) => setEquipeId(e.target.value)}>
              <option value="">Selecione...</option>
              {frente.equipes.map((e) => <option key={e.id} value={e.id}>{e.codigo || 'Equipe'} · {e.disciplina || '—'} ({e.alocacoes.length})</option>)}
              <option value="nova">+ Nova equipe nesta frente</option>
            </select>
            {equipeId === 'nova' ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input className="campo" placeholder="Código (ex.: MEC-04)" value={novaEquipe.codigo} onChange={(e) => setNovaEquipe({ ...novaEquipe, codigo: e.target.value })} />
                <input className="campo" placeholder="Disciplina (ex.: MECÂNICA)" value={novaEquipe.disciplina} onChange={(e) => setNovaEquipe({ ...novaEquipe, disciplina: e.target.value })} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div>
          <p className="rotulo">Dias</p>
          <div className="flex gap-1">
            {DIAS.map((d, i) => (
              <button key={d} type="button" aria-pressed={dias[i]} onClick={() => setDias(dias.map((v, j) => (j === i ? !v : v)))}
                className={`h-8 w-12 rounded text-xs font-bold ${dias[i] ? 'bg-omega-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{d}</button>
            ))}
          </div>
        </div>
        {conflitos.length ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Já programado(s) em algum desses dias: {conflitos.map((p) => p.nome).join(', ')}. Vai aparecer em Conflitos; ajuste os dias na outra frente se for troca.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-neutro" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={!pronto || salvando} onClick={confirmar}>{salvando ? 'Distribuindo...' : 'Distribuir'}</button>
        </div>
      </div>
    </ModalBase>
  );
}

/**
 * Efetivo do contrato: TODO o efetivo (cadastro de colaboradores, o mesmo da mão de obra do RDO) e quem
 * foi programado fora dele, no mesmo formato do efetivo da obra — onde cada pessoa está e os dias SEG–DOM.
 * É daqui que o efetivo é distribuído nas obras.
 */
const hojeIso = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

/**
 * Mobilizar (entrar no efetivo do contrato, pessoa nova ou que volta) ou desmobilizar (sair).
 * `pessoa` preenchida = ação sobre alguém da lista; vazia = mobilizar uma pessoa nova.
 */
function ModalMobilizacao({ modo, pessoa, efetivo, onFechar, onConcluido }) {
  const toast = useToast();
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!modo) return;
    setForm({
      matricula: pessoa?.matricula || '', nome: pessoa?.nome || '', funcao: pessoa?.funcao || '', cargo: pessoa?.cargo || '',
      disciplina: pessoa?.disciplina || '', supervisor: pessoa?.supervisor || '', encarregado: pessoa?.encarregado || '', data: hojeIso(),
    });
  }, [modo, pessoa]);
  const campo = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });

  // Matrícula de alguém desmobilizado: traz o cadastro dele.
  const aoSairDaMatricula = () => {
    if (pessoa || !form.matricula) return;
    const c = efetivo.find((x) => x.matricula === form.matricula.trim());
    if (c) {
      setForm((f) => ({
        ...f, nome: f.nome || c.nome, funcao: f.funcao || c.funcao || '', cargo: f.cargo || c.cargo || '',
        disciplina: f.disciplina || c.disciplina || '', supervisor: f.supervisor || c.supervisor || '', encarregado: f.encarregado || c.encarregado || '',
      }));
    }
  };
  const jaCadastrado = !pessoa && efetivo.find((x) => x.matricula && x.matricula === String(form.matricula || '').trim());

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (modo === 'desmobilizar') {
        await desmobilizarColaborador(pessoa.id, { data: form.data });
        toast.sucesso(`${pessoa.nome} desmobilizado(a).`);
      } else {
        const r = await mobilizarColaborador(form);
        toast.sucesso(`${form.nome || pessoa?.nome} ${r.reativado ? 'mobilizado(a) de volta' : 'mobilizado(a)'}. Agora programe em uma frente.`);
      }
      await onConcluido();
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const desmobilizar = modo === 'desmobilizar';
  return (
    <ModalBase aberto={Boolean(modo)} onFechar={onFechar} titulo={desmobilizar ? `Desmobilizar · ${pessoa?.nome || ''}` : pessoa ? `Mobilizar · ${pessoa.nome}` : 'Mobilizar pessoa no contrato'}>
      <form className="space-y-3" onSubmit={salvar}>
        {desmobilizar ? (
          <>
            <p className="text-sm text-slate-600">A pessoa sai do efetivo do contrato: deixa de aparecer para a programação e para o RDO. O histórico continua.</p>
            {pessoa?.locais?.length ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                <AlertTriangle className="mr-1 inline h-4 w-4" />Ela está programada nesta semana em {pessoa.locais.length} equipe(s). Retire-a da programação se ela não for trabalhar.
              </p>
            ) : null}
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="rotulo">Matrícula *</label><input className="campo" required disabled={Boolean(pessoa)} onBlur={aoSairDaMatricula} {...campo('matricula')} /></div>
            <div><label className="rotulo">Nome {pessoa || jaCadastrado ? '' : '*'}</label><input className="campo" required={!pessoa && !jaCadastrado} {...campo('nome')} /></div>
            <div><label className="rotulo">Função (planejamento)</label><input className="campo" list={ID_LISTA_FUNCOES} {...campo('funcao')} /></div>
            <div><label className="rotulo">Função Omega (cargo)</label><input className="campo" {...campo('cargo')} /></div>
            <div><label className="rotulo">Disciplina</label><input className="campo" {...campo('disciplina')} /></div>
            <div><label className="rotulo">Supervisor</label><input className="campo" {...campo('supervisor')} /></div>
            <div><label className="rotulo">Encarregado</label><input className="campo" {...campo('encarregado')} /></div>
            {jaCadastrado ? <p className="self-end text-xs text-slate-500">Matrícula já cadastrada ({jaCadastrado.nome}): ela volta ao efetivo.</p> : null}
          </div>
        )}
        <div className="max-w-[12rem]"><label className="rotulo">{desmobilizar ? 'Data da desmobilização' : 'Data da mobilização'}</label><input type="date" className="campo" required {...campo('data')} /></div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-neutro" onClick={onFechar}>Cancelar</button>
          <button type="submit" className={desmobilizar ? 'btn-neutro !border-red-300 !text-red-700' : 'btn-primario'} disabled={salvando}>
            {salvando ? 'Salvando...' : desmobilizar ? 'Desmobilizar' : 'Mobilizar'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

const FILTROS_EFETIVO = [
  ['mobilizados', 'Mobilizados'],
  ['sem', 'Precisam de programação'],
  ['programados', 'Programados'],
  ['indisponiveis', 'Férias / INSS / indisponíveis'],
  ['desmobilizados', 'Desmobilizados'],
  ['todos', 'Todos'],
];

function EfetivoContrato({ efetivo, prog, editavel, executar, onSincronizar, sincronizando, onEfetivoAlterado, filtro, setFiltro }) {
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [distribuindo, setDistribuindo] = useState(null); // lista de pessoas
  const [movimento, setMovimento] = useState(null); // { modo, pessoa }

  // Onde cada matrícula está na semana (frente, equipe, dias).
  const ondeEsta = useMemo(() => {
    const mapa = new Map();
    prog.frentes.forEach((f) => f.equipes.forEach((e) => e.alocacoes.forEach((a) => {
      if (!a.matricula) return;
      const lista = mapa.get(a.matricula) || [];
      lista.push({ frente: f, equipe: e, dias: a.dias || [] });
      mapa.set(a.matricula, lista);
    })));
    return mapa;
  }, [prog]);

  // Todo o efetivo do contrato (mobilizados e desmobilizados) + quem foi programado com matrícula fora do cadastro.
  const pessoas = useMemo(() => {
    const doCadastro = efetivo.map((c) => ({ ...c, chave: `c${c.id}`, foraDoEfetivo: false }));
    const noCadastro = new Set(efetivo.map((c) => c.matricula).filter(Boolean));
    const fora = (prog.resumo?.fora_do_efetivo || []).filter((p) => p.matricula && !noCadastro.has(p.matricula))
      .map((p) => ({ chave: `m${p.matricula}`, matricula: p.matricula, nome: p.nome, funcao: p.funcao, situacao: 'DISPONIVEL', mobilizado: true, foraDoEfetivo: true }));
    return [...doCadastro, ...fora].map((c) => ({ ...c, locais: ondeEsta.get(c.matricula) || [] }));
  }, [efetivo, prog, ondeEsta]);

  const precisa = (c) => c.mobilizado && c.situacao === 'DISPONIVEL' && c.locais.length === 0;
  const regra = {
    mobilizados: (c) => c.mobilizado,
    sem: precisa,
    programados: (c) => c.locais.length > 0,
    indisponiveis: (c) => c.mobilizado && c.situacao === 'INDISPONIVEL',
    desmobilizados: (c) => !c.mobilizado,
    todos: () => true,
  };
  const contar = (f) => pessoas.filter(regra[f]).length;
  const contagemDias = (c) => DIAS.map((_, i) => c.locais.filter((l) => l.dias[i]).length);
  const termo = busca.trim().toUpperCase();
  const linhas = pessoas
    .filter(regra[filtro] || regra.mobilizados)
    .filter((c) => !termo || `${c.nome} ${c.matricula || ''} ${c.funcao || ''} ${c.cargo || ''} ${c.disciplina || ''} ${c.supervisor || ''} ${c.encarregado || ''}`.toUpperCase().includes(termo))
    // Quem precisa de programação primeiro; depois por nome.
    .sort((a, b) => Number(precisa(b)) - Number(precisa(a)) || a.nome.localeCompare(b.nome));
  const foraDoEfetivo = contar('todos') - efetivo.length;

  const alternar = (chave) => setSelecionados((atual) => {
    const novo = new Set(atual);
    if (novo.has(chave)) novo.delete(chave); else novo.add(chave);
    return novo;
  });
  const marcaveis = linhas.filter((c) => c.mobilizado && c.matricula);
  const todosVisiveisMarcados = marcaveis.length > 0 && marcaveis.every((c) => selecionados.has(c.chave));
  const marcarVisiveis = () => setSelecionados((atual) => {
    const novo = new Set(atual);
    marcaveis.forEach((c) => (todosVisiveisMarcados ? novo.delete(c.chave) : novo.add(c.chave)));
    return novo;
  });
  const listaSelecionada = pessoas.filter((c) => selecionados.has(c.chave));

  const distribuir = ({ frente, equipeId, novaEquipe, dias }) => executar(async () => {
    let destino = equipeId;
    if (!destino) destino = (await criarEquipe(frente.id, { codigo: novaEquipe.codigo, disciplina: novaEquipe.disciplina })).id;
    for (const p of distribuindo) {
      // eslint-disable-next-line no-await-in-loop
      await criarAlocacao(destino, { matricula: p.matricula, nome: p.nome, funcao: p.funcao || '', dias });
    }
    setSelecionados(new Set());
  });

  const mudarSituacao = async (c, situacao) => {
    try {
      await atualizarColaboradorEfetivo(c.id, { situacao });
      await onEfetivoAlterado();
    } catch (err) {
      toast.erro(err.message);
    }
  };

  const th = 'whitespace-nowrap px-2 py-2';
  const td = 'px-2 py-1.5';
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        {FILTROS_EFETIVO.map(([v, rotulo]) => (
          <button key={v} type="button" onClick={() => setFiltro(v)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === v ? 'border-omega-600 bg-omega-600 text-white' : v === 'sem' && contar('sem') > 0 ? 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400' : 'border-slate-200 text-slate-600 hover:border-omega-300'}`}>
            {rotulo} ({contar(v)})
          </button>
        ))}
        <span className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input className="campo !w-64 !pl-8" placeholder="Buscar no efetivo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </span>
        <button type="button" className="btn-primario" onClick={() => setMovimento({ modo: 'mobilizar', pessoa: null })}>
          <UserPlus className="h-4 w-4" /> Mobilizar pessoa
        </button>
        <button type="button" className="btn-neutro" disabled={sincronizando} onClick={onSincronizar}
          title="Cadastra no efetivo quem foi programado com matrícula e ainda não está nele, e liga cada pessoa programada ao seu cadastro">
          <RefreshCw className={`h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} /> Atualizar efetivo
        </button>
      </div>

      {editavel && listaSelecionada.length ? (
        <div className="card flex flex-wrap items-center gap-3 border-omega-300 p-3 text-sm">
          <span className="font-semibold text-slate-800">{listaSelecionada.length} selecionado(s)</span>
          <button type="button" className="btn-primario" onClick={() => setDistribuindo(listaSelecionada)}><HardHat className="h-4 w-4" /> Distribuir nas obras</button>
          <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
        </div>
      ) : null}

      {foraDoEfetivo > 0 ? (
        <div className="card border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          {foraDoEfetivo} pessoa(s) programada(s) ainda fora do efetivo do contrato (marcadas na lista). Use <strong>Atualizar efetivo</strong> para cadastrá-las.
        </div>
      ) : null}

      {pessoas.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">Nenhum colaborador no efetivo do contrato. Use <strong>Mobilizar pessoa</strong>.</div> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                {editavel ? (
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" aria-label="Selecionar todos da lista" checked={todosVisiveisMarcados} onChange={marcarVisiveis} />
                  </th>
                ) : null}
                <th className={th}>Mat.</th><th className={th}>Nome</th><th className={th}>Função Omega</th><th className={th}>Função planej.</th>
                <th className={th}>Disciplina</th><th className={th}>Supervisor</th><th className={th}>Encarregado</th>
                <th className={th}>Situação</th><th className={th}>Mobilização</th><th className={th}>Programação da semana</th><th className={th}>SEG–DOM</th>
                <th className={`${th} sticky right-0 bg-slate-50`} />
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                const alerta = precisa(c);
                return (
                  <tr key={c.chave} className={`border-t border-slate-100 ${!c.mobilizado ? 'text-slate-400' : ''} ${selecionados.has(c.chave) ? 'bg-omega-50/60' : alerta ? 'bg-amber-50/70' : ''}`}>
                    {editavel ? (
                      <td className={td}>
                        {c.mobilizado && c.matricula ? <input type="checkbox" aria-label={`Selecionar ${c.nome}`} checked={selecionados.has(c.chave)} onChange={() => alternar(c.chave)} /> : null}
                      </td>
                    ) : null}
                    <td className={`${td} font-mono text-xs`}>{c.matricula || '—'}</td>
                    <td className={`${td} font-medium ${c.mobilizado ? 'text-slate-800' : ''}`}>
                      {c.nome}
                      {c.foraDoEfetivo ? <span className="ml-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">fora do efetivo</span> : null}
                    </td>
                    <td className={`${td} text-xs`}>{c.cargo || '—'}</td>
                    <td className={`${td} text-xs`}>{c.funcao || '—'}</td>
                    <td className={`${td} text-xs`}>{c.disciplina || '—'}</td>
                    <td className={`${td} text-xs`}>{c.supervisor || '—'}</td>
                    <td className={`${td} text-xs`}>{c.encarregado || '—'}</td>
                    <td className={td}>
                      {!c.mobilizado ? (
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Desmobilizado</span>
                      ) : c.foraDoEfetivo ? '—' : (
                        <select aria-label={`Situação de ${c.nome}`} value={c.situacao} onChange={(e) => mudarSituacao(c, e.target.value)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${c.situacao === 'INDISPONIVEL' ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                          <option value="DISPONIVEL">Disponível</option>
                          <option value="INDISPONIVEL">Indisponível</option>
                        </select>
                      )}
                      {c.ferias_inicio ? <span className="block text-[10px] text-slate-500">férias {formatarData(c.ferias_inicio)}–{formatarData(c.ferias_fim)}</span> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs`}>
                      {c.data_mobilizacao ? <span className="block">entrou {formatarData(c.data_mobilizacao)}</span> : null}
                      {!c.mobilizado && c.data_desmobilizacao ? <span className="block">saiu {formatarData(c.data_desmobilizacao)}</span> : null}
                      {!c.data_mobilizacao && c.mobilizado ? '—' : null}
                    </td>
                    <td className={`${td} text-xs`}>
                      {c.locais.length
                        ? c.locais.map((l) => <span key={l.equipe.id} className="block">{l.frente.obra?.orcamento?.ss || l.frente.codigo || TIPOS[l.frente.tipo]?.label} · {l.equipe.codigo || '—'}</span>)
                        : alerta
                          ? <span className="inline-flex items-center gap-1 font-bold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Sem programação: programar</span>
                          : <span className="text-slate-400">—</span>}
                    </td>
                    <td className={td}>{c.mobilizado ? <DiasProgramados contagem={contagemDias(c)} /> : null}</td>
                    <td className={`${td} sticky right-0 whitespace-nowrap bg-white text-right shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.25)]`}>
                      {c.mobilizado && !c.foraDoEfetivo ? (
                        <span className="inline-flex gap-1">
                          {editavel ? <button type="button" className={`${alerta ? 'btn-primario' : 'btn-neutro'} !px-2 !py-1 text-xs`} disabled={!c.matricula} onClick={() => setDistribuindo([c])}>Distribuir</button> : null}
                          <button type="button" className="btn-neutro !px-2 !py-1 text-xs" title="Tirar do efetivo do contrato" onClick={() => setMovimento({ modo: 'desmobilizar', pessoa: c })}>
                            <UserMinus className="h-3.5 w-3.5" /> Desmobilizar
                          </button>
                        </span>
                      ) : !c.mobilizado ? (
                        <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={() => setMovimento({ modo: 'mobilizar', pessoa: c })}>
                          <UserPlus className="h-3.5 w-3.5" /> Mobilizar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 ? <tr><td colSpan={13} className="px-3 py-6 text-center text-sm text-slate-500">Ninguém encontrado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      <ModalDistribuir aberto={Boolean(distribuindo)} pessoas={distribuindo || []} prog={prog} ondeEsta={ondeEsta}
        onFechar={() => setDistribuindo(null)} onConfirmar={distribuir} />
      <ModalMobilizacao modo={movimento?.modo} pessoa={movimento?.pessoa} efetivo={efetivo}
        onFechar={() => setMovimento(null)} onConcluido={async () => { setMovimento(null); await onEfetivoAlterado(); }} />
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
  const escolherObra = (obra) => {
    setF((atual) => ({ ...atual, obra_id: obra.id, codigo: obra.ss || atual.codigo, titulo: atual.titulo || obra.descricao?.slice(0, 200) || '' }));
  };
  const obraEscolhida = obras.find((o) => o.id === f.obra_id);
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
            <label className="rotulo">Obra {obraEscolhida ? '' : '(busque por SS, PEP/CC, OSI, descrição ou Canteiro Central)'}</label>
            {obraEscolhida ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-omega-300 bg-omega-50 px-3 py-2 text-sm">
                <span className="font-mono font-bold text-slate-800">{obraEscolhida.ss || `Obra ${obraEscolhida.id}`}</span>
                <SeloStatusObra status={obraEscolhida.status} />
                <span className="min-w-0 flex-1 truncate text-slate-600">{obraEscolhida.descricao}</span>
                <button type="button" className="text-xs font-semibold text-omega-700 hover:underline" onClick={() => setF({ ...f, obra_id: '' })}>Trocar</button>
              </div>
            ) : <ListaBuscaObras obras={obras} atualId={null} onEscolher={escolherObra} altura="max-h-56" />}
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
  const [efetivoCompleto, setEfetivoCompleto] = useState([]);
  const efetivo = useMemo(() => efetivoCompleto.filter((c) => c.mobilizado !== false), [efetivoCompleto]);
  const [filtroEfetivo, setFiltroEfetivo] = useState('mobilizados');
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
    listarEfetivoProgramacao({ todos: true }).then(setEfetivoCompleto).catch(() => setEfetivoCompleto([]));
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

  /** Efetivo nominal: cadastra quem foi programado e não está no efetivo, e liga as pessoas ao cadastro. */
  const sincronizarEfetivo = async () => {
    setOcupado('efetivo');
    try {
      const r = await sincronizarEfetivoProgramacao(prog.id);
      setEfetivoCompleto(await listarEfetivoProgramacao({ todos: true }));
      await recarregar();
      toast.sucesso(`Efetivo atualizado: ${r.criados} colaborador(es) novo(s), ${r.vinculadas} pessoa(s) ligada(s) ao cadastro.`);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setOcupado('');
    }
  };

  /** Depois de mobilizar/desmobilizar ou mudar a situação: recarrega o efetivo e o resumo da semana. */
  const efetivoAlterado = useCallback(async () => {
    setEfetivoCompleto(await listarEfetivoProgramacao({ todos: true }));
    await recarregar();
  }, [recarregar]);

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
    <div className="w-full space-y-4">
      {/* Lista do efetivo do contrato para os campos de matrícula. */}
      <datalist id={ID_LISTA_EFETIVO}>
        {efetivo.filter((c) => c.matricula).map((c) => <option key={c.id} value={c.matricula}>{`${c.nome} · ${c.funcao || ''}`}</option>)}
      </datalist>
      <datalist id={ID_LISTA_FUNCOES}>
        {[...new Set(efetivoCompleto.map((c) => c.funcao).filter(Boolean))].sort().map((f) => <option key={f} value={f} />)}
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
            <CartaoNumero titulo="Efetivo mobilizado" valor={efetivo.length || resumo.efetivo_ativo}
              detalhe={efetivo.length ? `${efetivo.filter((c) => c.situacao === 'DISPONIVEL').length} disponíveis` : `${resumo.total_pessoas} na lista`} />
            <CartaoNumero titulo="Frentes de obra" valor={contagemTipo('OBRA')} detalhe={`${contagemTipo('APOIO')} itinerantes`} />
            <CartaoNumero titulo="Sem programação" valor={resumo.saldo_pelo_efetivo ? resumo.nao_programados.length : resumo.por_tipo.DISPONIVEL[0]}
              detalhe={resumo.saldo_pelo_efetivo ? 'mobilizados fora da semana' : 'sem frente (segunda)'} alerta={Boolean(resumo.saldo_pelo_efetivo && resumo.nao_programados.length)} />
            <CartaoNumero titulo="Férias / INSS" valor={resumo.afastados} />
            <CartaoNumero titulo="Conflitos" valor={resumo.conflitos.length} detalhe="mesma pessoa, mesmo dia" alerta={resumo.conflitos.length > 0} />
          </div>

          {resumo.saldo_pelo_efetivo && resumo.nao_programados.length > 0 ? (
            <div className="card flex flex-wrap items-center gap-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{resumo.nao_programados.length} pessoa(s) mobilizada(s) sem programação</strong> nesta semana. Programe cada uma em uma frente de serviço ou desmobilize.
              </span>
              <button type="button" className="btn-primario ml-auto !py-1 text-xs" onClick={() => { setFiltroEfetivo('sem'); setAba('efetivo'); }}>
                <HardHat className="h-3.5 w-3.5" /> Ver e programar
              </button>
            </div>
          ) : null}

          {semObra > 0 ? (
            <div className="card flex items-center gap-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {semObra} frente(s) de obra sem obra vinculada. Use <strong>Vincular obra</strong> no card da frente.
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
          {aba === 'efetivo' ? <EfetivoContrato efetivo={efetivoCompleto} prog={prog} editavel={editavel} executar={executar} onSincronizar={sincronizarEfetivo} sincronizando={ocupado === 'efetivo'}
            onEfetivoAlterado={efetivoAlterado} filtro={filtroEfetivo} setFiltro={setFiltroEfetivo} /> : null}
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
