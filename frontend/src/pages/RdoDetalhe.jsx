import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, CheckCircle2, Download, Loader2, Plus, Save, Send, Trash2, Undo2, UserPlus } from 'lucide-react';
import EditorAtividade from '../components/rdo/EditorAtividade.jsx';
import { Secao, SecaoDesvios, SecaoEfetivo, SecaoEquipamentos, SecaoPts } from '../components/rdo/SecoesRdo.jsx';
import ModalBase from '../components/ModalBase.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  aprovarRdo,
  atualizarRdo,
  baixarPdfRdo,
  criarRdo,
  devolverRdo,
  enviarFotoRdo,
  excluirRdo,
  finalizarRdo,
  listarCadastroRdo,
  listarSupervisores,
  obterAtividadesObraRdo,
  obterObrasRdo,
  obterProgramacaoDoDiaRdo,
  obterRdo,
  removerFotoRdo,
} from '../services/rdoApi.js';
import { dataLocalISO, formatarData, formatarDataHora } from '../utils/formatters.js';
import {
  OPCOES_CLIMA,
  PERFIS_CAMPO,
  PERFIS_VALIDADORES,
  STATUS_RDO,
  atividadeVazia,
  chaveEfetivo,
  formParaPayload,
  novaChave,
  formVazio,
  rdoParaForm,
} from '../utils/rdo.js';

const CATALOGOS_VAZIOS = { funcoes: [], colaboradores: [], equipamentos: [], motivos: [] };
const revisao = (n) => `rev${String(n ?? 0).padStart(2, '0')}`;

/** Pessoas da programação que ainda não estão no efetivo do RDO (itens nominais prontos para o formulário). */
function faltandoNoEfetivo(programado, efetivo) {
  const ja = new Set(efetivo.filter((e) => e.tipo === 'NOMINAL').map((e) => String(e.colaborador_id)));
  return (programado?.pessoas || []).filter((p) => !ja.has(String(p.id)))
    .map((p) => ({ chave: novaChave(), tipo: 'NOMINAL', funcao_id: '', colaborador_id: String(p.id), quantidade: '1', nome: p.nome }));
}

function SeletorClima({ rotulo, valor, editavel, onChange }) {
  return (
    <div>
      <label className="rotulo">{rotulo}</label>
      <select className="campo" disabled={!editavel} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {OPCOES_CLIMA.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

/** Formulário do RDO de uma obra: lançamento do encarregado (mobile-first) e validação do planejamento. */
export default function RdoDetalhe({ novo = false }) {
  const { id } = useParams();
  const [busca] = useSearchParams();
  const obraDaUrl = busca.get('obra') || '';
  const navegar = useNavigate();
  const toast = useToast();
  const { usuario } = useAuth();

  const [rdo, setRdo] = useState(null);
  const [form, setForm] = useState(() => ({ ...formVazio(dataLocalISO()), obra_id: obraDaUrl }));
  const [obras, setObras] = useState([]);
  const [supervisores, setSupervisores] = useState([]);
  const [catalogos, setCatalogos] = useState(CATALOGOS_VAZIOS);
  const [cronograma, setCronograma] = useState({ carregando: true, atividades: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(null); // 'salvar' | 'finalizar' | 'aprovar' | 'devolver' | 'excluir' | 'pdf'
  const [validacoes, setValidacoes] = useState({});
  const [conflitos, setConflitos] = useState([]);
  const [duplicadoId, setDuplicadoId] = useState(null);
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [programado, setProgramado] = useState(null); // Programação S+1 da obra no dia
  const [aplicouProgramacao, setAplicouProgramacao] = useState(false);

  const status = rdo?.status || 'RASCUNHO';
  const ehDono = novo || usuario?.perfil === 'ADMIN' || rdo?.encarregado?.id === usuario?.id;
  const editavel = PERFIS_CAMPO.includes(usuario?.perfil) && ehDono && ['RASCUNHO', 'DEVOLVIDO'].includes(status);
  const modoValidacao = PERFIS_VALIDADORES.includes(usuario?.perfil) && status === 'FINALIZADO';
  const obra = obras.find((o) => String(o.id) === String(form.obra_id)) || rdo?.obra || null;

  const aplicarRdo = useCallback((r) => {
    setRdo(r);
    setForm(rdoParaForm(r));
    setValidacoes(Object.fromEntries(r.atividades.map((a) => [a.id, String(a.percentual_declarado)])));
  }, []);

  // Carga inicial: obras do escopo, supervisores, catálogos ativos e (se existir) o RDO.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [listaObras, listaSupervisores, funcoes, colaboradores, equipamentos, motivos, existente] = await Promise.all([
          obterObrasRdo(),
          listarSupervisores(),
          listarCadastroRdo('funcoes', { ativos: true }),
          listarCadastroRdo('colaboradores', { ativos: true }),
          listarCadastroRdo('equipamentos', { ativos: true }),
          listarCadastroRdo('motivos', { ativos: true }),
          novo ? null : obterRdo(id),
        ]);
        if (!ativo) return;
        setObras(listaObras);
        setSupervisores(listaSupervisores);
        setCatalogos({ funcoes, colaboradores, equipamentos, motivos });
        if (existente) aplicarRdo(existente);
        else {
          // RDO novo: sugere o supervisor do último RDO da obra.
          const daObra = listaObras.find((o) => String(o.id) === String(obraDaUrl));
          if (daObra?.supervisor_padrao) setForm((atual) => ({ ...atual, supervisor_id: String(daObra.supervisor_padrao.id) }));
        }
      } catch (err) {
        if (ativo) setErro(err.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [id, novo, obraDaUrl, aplicarRdo]);

  // Atividades do cronograma da obra (seletor e % vigente).
  useEffect(() => {
    if (!form.obra_id) return undefined;
    let ativo = true;
    obterAtividadesObraRdo(form.obra_id)
      .then((dados) => ativo && setCronograma({ carregando: false, ...dados }))
      .catch((err) => ativo && toast.erro(err.message));
    return () => {
      ativo = false;
    };
  }, [form.obra_id, toast]);

  // Programação S+1 da obra na data do RDO (efetivo programado e supervisor sugerido).
  useEffect(() => {
    if (!form.obra_id || !form.data || !editavel) { setProgramado(null); return undefined; }
    let ativo = true;
    obterProgramacaoDoDiaRdo(form.obra_id, form.data)
      .then((r) => ativo && setProgramado(r))
      .catch(() => ativo && setProgramado(null));
    return () => {
      ativo = false;
    };
  }, [form.obra_id, form.data, editavel]);

  // RDO novo: já começa com quem foi programado e com o supervisor da programação.
  useEffect(() => {
    if (!novo || aplicouProgramacao || carregando || !programado?.programacao) return;
    setAplicouProgramacao(true);
    setForm((atual) => ({
      ...atual,
      efetivo: [...atual.efetivo, ...faltandoNoEfetivo(programado, atual.efetivo)],
      supervisor_id: programado.supervisor_sugerido ? String(programado.supervisor_sugerido.id) : atual.supervisor_id,
    }));
  }, [novo, aplicouProgramacao, carregando, programado]);

  /** Efetivo com as pessoas indicadas (as que faltam entram como nominais) e a mão de obra delas na atividade. */
  const comMaoObraDaEquipe = (efetivo, ids) => {
    const ja = new Set(efetivo.filter((e) => e.tipo === 'NOMINAL').map((e) => String(e.colaborador_id)));
    const nomes = new Map((programado?.pessoas || []).map((p) => [p.id, p.nome]));
    const novos = ids.filter((id) => !ja.has(String(id)))
      .map((id) => ({ chave: novaChave(), tipo: 'NOMINAL', funcao_id: '', colaborador_id: String(id), quantidade: '1', nome: nomes.get(id) || '' }));
    return {
      efetivo: [...efetivo, ...novos],
      mao_obra: ids.map((id) => ({ chave: novaChave(), pessoa: `N${id}`, quantidade: '1', horas: '8' })),
    };
  };

  const normalizarTexto = (t) => String(t || '').trim().toUpperCase();
  const jaLancada = (item) => form.atividades.some((a) => (item.codigo_atividade
    ? a.codigo_atividade === item.codigo_atividade
    : a.fora_de_escopo && normalizarTexto(a.descricao_snapshot) === normalizarTexto(item.descricao).slice(0, 500)));

  /** Lança no RDO uma atividade da Programação S+1, já com a mão de obra da equipe programada no dia. */
  function lancarProgramada(item) {
    const base = atividadeVazia();
    let atividade;
    if (item.codigo_atividade) {
      const opcao = cronograma.atividades.find((o) => o.codigo_atividade === item.codigo_atividade);
      if (!opcao) {
        toast.erro(`A linha ${item.codigo_atividade} não está no cronograma vigente da obra.`);
        return;
      }
      atividade = {
        ...base,
        codigo_atividade: opcao.codigo_atividade,
        descricao_snapshot: opcao.descricao,
        percentual_anterior: opcao.percentual_vigente,
        concluida: opcao.concluida,
        percentual_declarado: opcao.concluida ? '100' : String(opcao.percentual_vigente),
        observacao: item.observacao || '',
      };
    } else {
      // Serviço escrito na programação: entra como fora de escopo.
      atividade = {
        ...base,
        fora_de_escopo: true,
        descricao_snapshot: item.descricao.slice(0, 500),
        justificativa: `Programada na Programação S+1${item.observacao ? `: ${item.observacao}` : ''}`.slice(0, 1000),
        observacao: item.observacao || '',
      };
    }
    setForm((atual) => {
      const r = comMaoObraDaEquipe(atual.efetivo, item.colaboradores || []);
      return { ...atual, efetivo: r.efetivo, atividades: [...atual.atividades, { ...atividade, mao_obra: r.mao_obra }] };
    });
  }

  /** Ao relacionar uma linha do cronograma programada, a mão de obra da equipe já vem preenchida. */
  function alterarAtividade(antiga, nova) {
    setForm((atual) => {
      let atividade = nova;
      let { efetivo } = atual;
      if (nova.codigo_atividade && nova.codigo_atividade !== antiga.codigo_atividade && nova.mao_obra.length === 0) {
        const itens = (programado?.atividades || []).filter((i) => i.codigo_atividade === nova.codigo_atividade);
        const ids = [...new Set(itens.flatMap((i) => i.colaboradores || []))];
        if (ids.length) {
          const r = comMaoObraDaEquipe(efetivo, ids);
          efetivo = r.efetivo;
          atividade = { ...nova, mao_obra: r.mao_obra, observacao: nova.observacao || itens.map((i) => i.observacao).filter(Boolean).join(' · ') };
        }
      }
      return { ...atual, efetivo, atividades: atual.atividades.map((x) => (x.chave === antiga.chave ? atividade : x)) };
    });
  }

  const faltandoProgramados = useMemo(() => faltandoNoEfetivo(programado, form.efetivo), [programado, form.efetivo]);
  const adicionarProgramados = () => alterarEfetivo([...form.efetivo, ...faltandoProgramados]);

  const usadosNoCronograma = useMemo(() => new Set(form.atividades.filter((a) => a.codigo_atividade).map((a) => a.codigo_atividade)), [form.atividades]);
  const pessoasUsadas = useMemo(() => new Set(form.atividades.flatMap((a) => a.mao_obra.map((m) => m.pessoa).filter(Boolean))), [form.atividades]);
  const efetivoValido = form.efetivo.filter((e) => (e.tipo === 'FUNCAO' ? e.funcao_id : e.colaborador_id));
  const alterarForm = (campos) => setForm((atual) => ({ ...atual, ...campos }));

  const horasPessoa = (m) => {
    const p = form.efetivo.find((e) => chaveEfetivo(e) === m.pessoa);
    return (p?.tipo === 'FUNCAO' ? Number(m.quantidade) || 0 : 1) * (Number(m.horas) || 0);
  };
  const totalHH = form.atividades.reduce((soma, a) => soma + a.mao_obra.reduce((s, m) => s + horasPessoa(m), 0), 0);

  /** Remove da mão de obra das atividades quem saiu do efetivo (mantém o formulário consistente). */
  function alterarEfetivo(efetivo) {
    const chaves = new Set(efetivo.map(chaveEfetivo));
    setForm((atual) => ({
      ...atual,
      efetivo,
      atividades: atual.atividades.map((a) => ({ ...a, mao_obra: a.mao_obra.filter((m) => !m.pessoa || chaves.has(m.pessoa)) })),
    }));
  }

  /** Executa uma ação com indicador de ocupado e toast de erro. */
  async function executar(nome, acao, mensagemOk) {
    setOcupado(nome);
    setConflitos([]);
    setDuplicadoId(null);
    try {
      const resultado = await acao();
      if (mensagemOk) toast.sucesso(mensagemOk);
      return resultado;
    } catch (err) {
      if (err.detalhes?.rdo_id) setDuplicadoId(err.detalhes.rdo_id);
      if (err.detalhes?.codigo === 'CONFLITO_AVANCO') setConflitos(err.detalhes.conflitos || []);
      toast.erro(err.message);
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function salvar({ silencioso = false } = {}) {
    const payload = formParaPayload({ ...form, efetivo: efetivoValido });
    const resultado = await executar('salvar', () => (novo ? criarRdo(payload) : atualizarRdo(id, payload)), silencioso ? null : 'RDO salvo.');
    if (!resultado) return null;
    if (novo) navegar(`/rdo/${resultado.id}`, { replace: true });
    else aplicarRdo(resultado);
    return resultado;
  }

  async function finalizar() {
    const salvo = await salvar({ silencioso: true });
    if (!salvo) return;
    const finalizado = await executar('finalizar', () => finalizarRdo(salvo.id), 'RDO finalizado e enviado para validação.');
    if (finalizado) aplicarRdo(finalizado);
  }

  async function aprovar() {
    const atividades = rdo.atividades
      .filter((a) => !a.fora_de_escopo && Number(a.percentual_anterior) < 100)
      .map((a) => ({ id: a.id, percentual_validado: validacoes[a.id] }));
    const aprovado = await executar('aprovar', () => aprovarRdo(rdo.id, { atividades }), 'RDO aprovado: o avanço entrou no cronograma.');
    if (aprovado) aplicarRdo(aprovado);
  }

  async function devolver() {
    if (!motivo.trim()) {
      toast.erro('Informe o motivo da devolução.');
      return;
    }
    const devolvido = await executar('devolver', () => devolverRdo(rdo.id, motivo.trim()), 'RDO devolvido ao encarregado.');
    if (devolvido) {
      setDevolvendo(false);
      setMotivo('');
      aplicarRdo(devolvido);
    }
  }

  async function excluir() {
    if (!window.confirm('Excluir este rascunho? Esta ação não pode ser desfeita.')) return;
    const feito = await executar('excluir', () => excluirRdo(rdo.id), 'Rascunho excluído.');
    if (feito) navegar(`/rdo/obra/${rdo.obra_id}`, { replace: true });
  }

  async function baixarPdf() {
    const blob = await executar('pdf', () => baixarPdfRdo(rdo.id));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RDO-${rdo.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function enviarFotos(atividade, arquivos) {
    for (const arquivo of arquivos) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const foto = await enviarFotoRdo(rdo.id, atividade.id, arquivo);
        setForm((atual) => ({ ...atual, atividades: atual.atividades.map((a) => (a.id === atividade.id ? { ...a, fotos: [...a.fotos, foto] } : a)) }));
      } catch (err) {
        toast.erro(`Falha ao enviar "${arquivo.name}": ${err.message}`);
      }
    }
  }

  async function removerFoto(atividade, foto) {
    try {
      await removerFotoRdo(rdo.id, foto.id);
      setForm((atual) => ({ ...atual, atividades: atual.atividades.map((a) => (a.id === atividade.id ? { ...a, fotos: a.fotos.filter((f) => f.id !== foto.id) } : a)) }));
    } catch (err) {
      toast.erro(err.message);
    }
  }

  // RDO novo precisa saber a obra: ele sempre nasce de dentro de uma obra em andamento.
  if (novo && !obraDaUrl) return <Navigate to="/rdo" replace />;
  if (carregando) return <div className="flex justify-center py-16"><Spinner tamanho="lg" /></div>;
  if (erro) return <div className="card p-6 text-sm text-red-700">{erro}</div>;
  if (novo && !obra) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-sm text-slate-700">
        Esta obra não está disponível para lançar RDO: ela precisa estar <strong>em andamento</strong> e você precisa estar vinculado a ela.
        <div className="mt-3"><Link to="/rdo" className="btn-neutro">Voltar</Link></div>
      </div>
    );
  }

  const selo = STATUS_RDO[status];
  const bloqueado = Boolean(ocupado);
  const voltarPara = `/rdo/obra/${form.obra_id}`;
  const desviosAutomaticos = rdo?.desvios_automaticos || [];
  const identObra = obra?.orcamento || obra;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={voltarPara} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para a obra
        </Link>
        <div className="flex items-center gap-2">
          {rdo ? <span className="text-xs text-slate-500">RDO nº {rdo.id}</span> : null}
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${selo.cor}`}>{rdo ? selo.label : 'Novo RDO'}</span>
          {rdo && status !== 'RASCUNHO' ? (
            <button type="button" className="btn-neutro !px-3 !py-1.5 text-xs" onClick={baixarPdf} disabled={bloqueado}>
              {ocupado === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} PDF
            </button>
          ) : null}
        </div>
      </div>

      {identObra ? (
        <div className="card border-l-4 border-l-omega-600 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Obra</p>
          <p className="text-sm font-bold text-slate-800">{identObra.ss || `Obra ${form.obra_id}`} · {identObra.pep ? `PEP ${identObra.pep}` : ''}</p>
          <p className="text-sm text-slate-600">{identObra.descricao}</p>
        </div>
      ) : null}

      {status === 'DEVOLVIDO' && rdo?.motivo_devolucao ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>Devolvido pelo planejamento:</strong> {rdo.motivo_devolucao}
          <p className="mt-1 text-xs text-red-600">Corrija o que foi pedido e finalize novamente.</p>
        </div>
      ) : null}
      {duplicadoId ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Você já tem o RDO nº {duplicadoId} desta obra nesta data. <Link to={`/rdo/${duplicadoId}`} className="font-bold underline">Abrir o RDO existente</Link> ou escolha outra data.
        </div>
      ) : null}
      {conflitos.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Avanço abaixo do % vigente</strong> (outro RDO ou o cronograma já avançou):
          <ul className="mt-1 list-disc pl-5">
            {conflitos.map((c) => <li key={c.id}>{c.codigo_atividade}: vigente {c.percentual_anterior}% · validado {c.percentual_validado}% — ajuste o % validado.</li>)}
          </ul>
        </div>
      ) : null}

      <Secao faixa titulo="01 — Identificação">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="rotulo">Data *</label>
            <input type="date" className="campo" disabled={!editavel} value={form.data} onChange={(e) => alterarForm({ data: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <label className="rotulo">Encarregado</label>
            <p className="campo bg-slate-50 text-slate-600">{rdo?.encarregado?.nome || usuario?.nome}</p>
          </div>
          <div className="sm:col-span-4">
            <label className="rotulo">Supervisor da obra *</label>
            <select className="campo" disabled={!editavel} value={form.supervisor_id} onChange={(e) => alterarForm({ supervisor_id: e.target.value })}>
              <option value="">Selecione o supervisor…</option>
              {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-400">Indicador usado nas análises de acompanhamento da obra.</p>
            {editavel && programado?.programacao && (programado.supervisor_sugerido || programado.responsaveis.length) ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <CalendarRange className="h-3.5 w-3.5 text-omega-600" aria-hidden="true" />
                Na Programação S+1: <strong className="text-slate-700">{programado.supervisor_sugerido?.nome || programado.responsaveis[0]}</strong>
                {programado.supervisor_sugerido && String(programado.supervisor_sugerido.id) !== String(form.supervisor_id) ? (
                  <button type="button" className="font-semibold text-omega-700 hover:underline" onClick={() => alterarForm({ supervisor_id: String(programado.supervisor_sugerido.id) })}>Usar este supervisor</button>
                ) : null}
                {!programado.supervisor_sugerido ? <span className="text-amber-700">(sem usuário Supervisor com esse nome)</span> : null}
              </p>
            ) : null}
          </div>
          <SeletorClima rotulo="Clima — manhã" valor={form.clima_manha} editavel={editavel} onChange={(v) => alterarForm({ clima_manha: v })} />
          <SeletorClima rotulo="Clima — tarde" valor={form.clima_tarde} editavel={editavel} onChange={(v) => alterarForm({ clima_tarde: v })} />
          <SeletorClima rotulo="Clima — noite" valor={form.clima_noite} editavel={editavel} onChange={(v) => alterarForm({ clima_noite: v })} />
        </div>
      </Secao>

      <Secao faixa titulo="02 — DSS / Diálogo de Segurança">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="rotulo">Tema do DSS</label>
            <input className="campo" disabled={!editavel} maxLength={200} value={form.dss_tema} onChange={(e) => alterarForm({ dss_tema: e.target.value })} />
          </div>
          <div>
            <label className="rotulo">Participantes</label>
            <input type="number" inputMode="numeric" min="0" className="campo" disabled={!editavel} value={form.dss_participantes} onChange={(e) => alterarForm({ dss_participantes: e.target.value })} />
          </div>
        </div>
      </Secao>

      <Secao faixa titulo={`03 — Efetivo do Dia (${efetivoValido.length})`} resumo={`${efetivoValido.reduce((s, e) => s + (e.tipo === 'FUNCAO' ? Number(e.quantidade) || 0 : 1), 0)} pessoa(s)`}>
        {editavel && programado?.programacao ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-omega-200 bg-omega-50/60 p-3 text-sm text-slate-700">
            <CalendarRange className="h-4 w-4 shrink-0 text-omega-600" aria-hidden="true" />
            <span>
              Programação S+1 (semana {programado.programacao.semana}/{programado.programacao.ano} · {revisao(programado.programacao.revisao)}):
              {' '}<strong>{programado.pessoas.length} pessoa(s)</strong> programada(s) nesta obra em {formatarData(form.data)}
              {programado.sem_cadastro.length ? <span className="text-amber-700"> · {programado.sem_cadastro.length} sem cadastro no efetivo</span> : null}.
            </span>
            {faltandoProgramados.length ? (
              <button type="button" className="btn-primario ml-auto !py-1 text-xs" onClick={adicionarProgramados}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar programados ({faltandoProgramados.length})
              </button>
            ) : programado.pessoas.length ? <span className="ml-auto text-xs font-semibold text-emerald-700">Todos os programados já estão no efetivo.</span> : null}
          </div>
        ) : editavel && form.obra_id && programado && !programado.programacao ? (
          <p className="mb-3 text-xs text-slate-500">Esta semana ainda não tem Programação S+1 para puxar o efetivo.</p>
        ) : null}
        <SecaoEfetivo itens={form.efetivo} editavel={editavel} catalogos={catalogos} usados={pessoasUsadas} onChange={alterarEfetivo} />
      </Secao>

      <Secao faixa titulo={`04 — Atividades (${form.atividades.length})`} resumo={`${totalHH.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} HH`}>
        <div className="space-y-3">
          {editavel && programado?.atividades?.length ? (
            <div className="rounded-lg border border-omega-200 bg-omega-50/60 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                <CalendarRange className="h-4 w-4 text-omega-600" aria-hidden="true" /> Programado para esta obra (Programação S+1)
              </p>
              <ul className="space-y-1.5">
                {programado.atividades.map((item) => {
                  const lancada = jaLancada(item);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm shadow-sm">
                      {item.codigo_atividade
                        ? <span className="rounded border border-omega-300 bg-omega-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-omega-700">{item.codigo_atividade}</span>
                        : <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700" title="Entra como fora de escopo">Escrita</span>}
                      <span className="min-w-[10rem] flex-1">
                        <span className="font-medium text-slate-800">{item.descricao}</span>
                        <span className="block text-xs text-slate-500">
                          {item.equipe ? `Equipe ${item.equipe} · ` : ''}{item.colaboradores.length} pessoa(s) programada(s) hoje{item.observacao ? ` · ${item.observacao}` : ''}
                        </span>
                      </span>
                      {lancada
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> No RDO</span>
                        : (
                          <button type="button" className="btn-primario !px-2 !py-1 text-xs" onClick={() => lancarProgramada(item)}>
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Lançar com a mão de obra
                          </button>
                        )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {form.atividades.length === 0 ? <p className="text-sm text-slate-500">Nenhuma atividade lançada ainda.</p> : null}
          {form.atividades.map((a, indice) => (
            <EditorAtividade
              key={a.chave}
              atividade={a}
              indice={indice}
              editavel={editavel}
              opcoesAtividade={cronograma.atividades}
              usados={usadosNoCronograma}
              efetivo={efetivoValido}
              modoValidacao={modoValidacao}
              valorValidado={validacoes[a.id]}
              onValidado={(valor) => setValidacoes((atual) => ({ ...atual, [a.id]: valor }))}
              onChange={(nova) => alterarAtividade(a, nova)}
              onRemover={() => alterarForm({ atividades: form.atividades.filter((x) => x.chave !== a.chave) })}
              onEnviarFotos={enviarFotos}
              onRemoverFoto={removerFoto}
            />
          ))}
          {editavel ? (
            <button type="button" className="btn-neutro w-full" onClick={() => alterarForm({ atividades: [...form.atividades, atividadeVazia()] })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar atividade
            </button>
          ) : null}
          {editavel && !cronograma.carregando && cronograma.atividades.length === 0 ? <p className="text-xs text-amber-700">Esta obra ainda não tem cronograma importado: só dá para lançar atividades fora de escopo.</p> : null}
        </div>
      </Secao>

      <Secao faixa titulo={`05 — Equipamentos (${form.equipamentos.length})`} aberta={form.equipamentos.length > 0}>
        <SecaoEquipamentos itens={form.equipamentos} editavel={editavel} catalogo={catalogos.equipamentos} onChange={(equipamentos) => alterarForm({ equipamentos })} />
      </Secao>

      <Secao faixa titulo="06 — Permissão de Trabalho Seguro (PTS)" resumo={form.pts_necessaria === null ? 'não respondido' : form.pts_necessaria ? 'emitida' : 'não necessária'}>
        <SecaoPts necessaria={form.pts_necessaria} pts={form.pts} editavel={editavel} onNecessaria={(v) => alterarForm({ pts_necessaria: v })} onChange={(pts) => alterarForm({ pts })} />
      </Secao>

      <Secao faixa titulo="07 — Desvios / Improdutividades" resumo={rdo ? `${(rdo.totais?.desvios?.total ?? 0).toLocaleString('pt-BR')} h` : null}>
        <SecaoDesvios itens={form.desvios} automaticos={desviosAutomaticos} editavel={editavel} catalogo={catalogos.motivos} observacao={form.desvios_observacao} onObservacao={(v) => alterarForm({ desvios_observacao: v })} onChange={(desvios) => alterarForm({ desvios })} />
      </Secao>

      <Secao faixa titulo="08 — Comentário Geral" aberta={Boolean(form.comentario_geral) || editavel}>
        <textarea className="campo" rows={3} maxLength={5000} disabled={!editavel} value={form.comentario_geral} onChange={(e) => alterarForm({ comentario_geral: e.target.value })} />
      </Secao>

      {rdo?.historico?.length ? (
        <Secao faixa titulo="Histórico" aberta={false}>
          <ul className="space-y-1 text-sm text-slate-600">
            {rdo.historico.map((h) => (
              <li key={h.id}>
                {formatarDataHora(h.created_at)} — <strong>{STATUS_RDO[h.para]?.label || h.para}</strong>
                {h.usuario ? ` por ${h.usuario.nome}` : ''}{h.motivo ? ` (${h.motivo})` : ''}
              </li>
            ))}
          </ul>
          {rdo.decidido_em ? <p className="mt-2 text-xs text-slate-500">Decisão em {formatarData(rdo.decidido_em)}{rdo.decidido_por ? ` por ${rdo.decidido_por.nome}` : ''}.</p> : null}
        </Secao>
      ) : null}

      {/* ------------------------------------------------ barra de ações (fixa no celular) */}
      {editavel || modoValidacao ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:left-auto sm:right-6 sm:bottom-4 sm:w-auto sm:rounded-xl sm:border sm:shadow-lg">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-2">
            {editavel ? (
              <>
                {rdo && status === 'RASCUNHO' ? (
                  <button type="button" className="btn-perigo" onClick={excluir} disabled={bloqueado} aria-label="Excluir rascunho"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                ) : null}
                <button type="button" className="btn-neutro" onClick={() => salvar()} disabled={bloqueado}>
                  {ocupado === 'salvar' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Salvar rascunho
                </button>
                <button type="button" className="btn-primario" onClick={finalizar} disabled={bloqueado || form.atividades.length === 0}>
                  {ocupado === 'finalizar' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Finalizar e assinar
                </button>
              </>
            ) : null}
            {modoValidacao ? (
              <>
                <button type="button" className="btn-perigo" onClick={() => setDevolvendo(true)} disabled={bloqueado}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" /> Devolver
                </button>
                <button type="button" className="btn-primario" onClick={aprovar} disabled={bloqueado}>
                  {ocupado === 'aprovar' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Aprovar e lançar avanço
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <ModalBase aberto={devolvendo} titulo="Devolver RDO ao encarregado" subtitulo="Explique o que precisa ser corrigido." tamanho="md" onFechar={() => setDevolvendo(false)}>
        <div className="space-y-3 p-4">
          <textarea className="campo" rows={4} maxLength={2000} placeholder="Motivo da devolução…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={() => setDevolvendo(false)}>Cancelar</button>
            <button type="button" className="btn-perigo" onClick={devolver} disabled={bloqueado}>Devolver</button>
          </div>
        </div>
      </ModalBase>
    </div>
  );
}
