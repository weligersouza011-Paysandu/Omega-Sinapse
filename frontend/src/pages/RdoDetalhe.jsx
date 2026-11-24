import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Loader2, Plus, Save, Send, Trash2, Undo2 } from 'lucide-react';
import EditorAtividade from '../components/rdo/EditorAtividade.jsx';
import { Secao, SecaoDesvios, SecaoEquipamentos, SecaoPts } from '../components/rdo/SecoesRdo.jsx';
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
  obterAtividadesObraRdo,
  obterObrasRdo,
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
  formParaPayload,
  formVazio,
  rdoParaForm,
} from '../utils/rdo.js';

const CATALOGOS_VAZIOS = { funcoes: [], colaboradores: [], equipamentos: [], motivos: [] };

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

/** Formulário do RDO: lançamento do encarregado (mobile-first) e validação do planejamento. */
export default function RdoDetalhe({ novo = false }) {
  const { id } = useParams();
  const navegar = useNavigate();
  const toast = useToast();
  const { usuario } = useAuth();

  const [rdo, setRdo] = useState(null);
  const [form, setForm] = useState(() => formVazio(dataLocalISO()));
  const [obras, setObras] = useState([]);
  const [catalogos, setCatalogos] = useState(CATALOGOS_VAZIOS);
  const [atividadesPorObra, setAtividadesPorObra] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(null); // 'salvar' | 'finalizar' | 'aprovar' | 'devolver' | 'excluir' | 'pdf'
  const [validacoes, setValidacoes] = useState({});
  const [conflitos, setConflitos] = useState([]);
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const status = rdo?.status || 'RASCUNHO';
  const ehDono = novo || usuario?.perfil === 'ADMIN' || rdo?.encarregado?.id === usuario?.id;
  const editavel = PERFIS_CAMPO.includes(usuario?.perfil) && ehDono && ['RASCUNHO', 'DEVOLVIDO'].includes(status);
  const modoValidacao = PERFIS_VALIDADORES.includes(usuario?.perfil) && status === 'FINALIZADO';

  const aplicarRdo = useCallback((r) => {
    setRdo(r);
    setForm(rdoParaForm(r));
    setValidacoes(Object.fromEntries(r.atividades.map((a) => [a.id, String(a.percentual_declarado)])));
  }, []);

  // Carga inicial: obras do escopo, catálogos ativos e (se existir) o RDO.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [listaObras, funcoes, colaboradores, equipamentos, motivos, existente] = await Promise.all([
          obterObrasRdo(),
          listarCadastroRdo('funcoes', { ativos: true }),
          listarCadastroRdo('colaboradores', { ativos: true }),
          listarCadastroRdo('equipamentos', { ativos: true }),
          listarCadastroRdo('motivos', { ativos: true }),
          novo ? null : obterRdo(id),
        ]);
        if (!ativo) return;
        setObras(listaObras);
        setCatalogos({ funcoes, colaboradores, equipamentos, motivos });
        if (existente) aplicarRdo(existente);
      } catch (err) {
        if (ativo) setErro(err.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [id, novo, aplicarRdo]);

  // Atividades do cronograma de cada obra citada (para os seletores e o % vigente).
  const carregarAtividadesDaObra = useCallback(async (obraId) => {
    if (!obraId) return;
    setAtividadesPorObra((atual) => (atual[obraId] ? atual : { ...atual, [obraId]: { carregando: true, atividades: [] } }));
    try {
      const dados = await obterAtividadesObraRdo(obraId);
      setAtividadesPorObra((atual) => ({ ...atual, [obraId]: { carregando: false, ...dados } }));
    } catch (err) {
      toast.erro(err.message);
    }
  }, [toast]);

  const obrasCitadas = [...new Set(form.atividades.map((a) => a.obra_id).filter(Boolean))].join(',');
  useEffect(() => {
    obrasCitadas.split(',').filter(Boolean).forEach((obraId) => {
      if (!atividadesPorObra[obraId]) carregarAtividadesDaObra(obraId);
    });
  }, [obrasCitadas, atividadesPorObra, carregarAtividadesDaObra]);

  const usados = useMemo(() => new Set(form.atividades.filter((a) => a.codigo_atividade).map((a) => `${a.obra_id}|${a.codigo_atividade}`)), [form.atividades]);
  const alterarForm = (campos) => setForm((atual) => ({ ...atual, ...campos }));
  const totalHH = form.atividades.reduce((soma, a) => soma + a.mao_obra.reduce((s, m) => s + (m.tipo === 'FUNCAO' ? Number(m.quantidade) || 0 : 1) * (Number(m.horas) || 0), 0), 0);

  /** Executa uma ação com indicador de ocupado e toast de erro. */
  async function executar(nome, acao, mensagemOk) {
    setOcupado(nome);
    setConflitos([]);
    try {
      const resultado = await acao();
      if (mensagemOk) toast.sucesso(mensagemOk);
      return resultado;
    } catch (err) {
      if (err.detalhes?.codigo === 'CONFLITO_AVANCO') setConflitos(err.detalhes.conflitos || []);
      toast.erro(err.message);
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function salvar({ silencioso = false } = {}) {
    const payload = formParaPayload(form);
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
      .filter((a) => !a.fora_de_escopo)
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
    if (feito) navegar('/rdo', { replace: true });
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

  if (carregando) return <div className="flex justify-center py-16"><Spinner tamanho="lg" /></div>;
  if (erro) return <div className="card p-6 text-sm text-red-700">{erro}</div>;

  const selo = STATUS_RDO[status];
  const bloqueado = Boolean(ocupado);

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/rdo" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para RDOs
        </Link>
        <div className="flex items-center gap-2">
          {rdo ? <span className="text-xs text-slate-500">RDO nº {rdo.id}</span> : null}
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${selo.cor}`}>{rdo ? selo.label : "Novo RDO"}</span>
          {!novo && status !== 'RASCUNHO' ? (
            <button type="button" className="btn-neutro !px-3 !py-1.5 text-xs" onClick={baixarPdf} disabled={bloqueado}>
              {ocupado === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} PDF
            </button>
          ) : null}
        </div>
      </div>

      {status === 'DEVOLVIDO' && rdo?.motivo_devolucao ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>Devolvido pelo planejamento:</strong> {rdo.motivo_devolucao}
          <p className="mt-1 text-xs text-red-600">Corrija o que foi pedido e finalize novamente.</p>
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

      <Secao titulo="Identificação e clima">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="rotulo">Data *</label>
            <input type="date" className="campo" disabled={!editavel} value={form.data} onChange={(e) => alterarForm({ data: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <label className="rotulo">Encarregado</label>
            <p className="campo bg-slate-50 text-slate-600">{rdo?.encarregado?.nome || usuario?.nome}</p>
          </div>
          <SeletorClima rotulo="Clima — manhã" valor={form.clima_manha} editavel={editavel} onChange={(v) => alterarForm({ clima_manha: v })} />
          <SeletorClima rotulo="Clima — tarde" valor={form.clima_tarde} editavel={editavel} onChange={(v) => alterarForm({ clima_tarde: v })} />
          <SeletorClima rotulo="Clima — noite" valor={form.clima_noite} editavel={editavel} onChange={(v) => alterarForm({ clima_noite: v })} />
        </div>
      </Secao>

      <Secao
        titulo={`Atividades (${form.atividades.length})`}
        resumo={`${totalHH.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} HH`}
      >
        <div className="space-y-3">
          {form.atividades.length === 0 ? <p className="text-sm text-slate-500">Nenhuma atividade lançada ainda.</p> : null}
          {form.atividades.map((a, indice) => (
            <EditorAtividade
              key={a.chave}
              atividade={a}
              indice={indice}
              editavel={editavel}
              obras={obras}
              opcoesAtividade={atividadesPorObra[a.obra_id]?.atividades || []}
              usados={usados}
              catalogos={catalogos}
              modoValidacao={modoValidacao}
              valorValidado={validacoes[a.id]}
              onValidado={(valor) => setValidacoes((atual) => ({ ...atual, [a.id]: valor }))}
              onObraMudou={carregarAtividadesDaObra}
              onChange={(nova) => alterarForm({ atividades: form.atividades.map((x) => (x.chave === a.chave ? nova : x)) })}
              onRemover={() => alterarForm({ atividades: form.atividades.filter((x) => x.chave !== a.chave) })}
              onEnviarFotos={enviarFotos}
              onRemoverFoto={removerFoto}
            />
          ))}
          {editavel ? (
            <button type="button" className="btn-neutro w-full" onClick={() => alterarForm({ atividades: [...form.atividades, { ...atividadeVazia(), obra_id: obras.length === 1 ? String(obras[0].id) : '' }] })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar atividade
            </button>
          ) : null}
          {editavel && obras.length === 0 ? <p className="text-xs text-amber-700">Você ainda não está vinculado a nenhuma obra. Peça ao planejamento para vincular.</p> : null}
        </div>
      </Secao>

      <Secao titulo={`Equipamentos (${form.equipamentos.length})`} aberta={form.equipamentos.length > 0}>
        <SecaoEquipamentos itens={form.equipamentos} editavel={editavel} catalogo={catalogos.equipamentos} onChange={(equipamentos) => alterarForm({ equipamentos })} />
      </Secao>

      <Secao titulo={`PTS — Permissão de Trabalho (${form.pts.length})`} aberta={form.pts.length > 0}>
        <SecaoPts itens={form.pts} editavel={editavel} onChange={(pts) => alterarForm({ pts })} />
      </Secao>

      <Secao
        titulo={`Desvios e improdutividades (${form.desvios.length})`}
        resumo={rdo ? `${(rdo.totais?.desvios?.total ?? 0).toLocaleString('pt-BR')} h` : null}
        aberta={form.desvios.length > 0}
      >
        <SecaoDesvios itens={form.desvios} editavel={editavel} catalogo={catalogos.motivos} onChange={(desvios) => alterarForm({ desvios })} />
      </Secao>

      <Secao titulo="DSS e comentário geral">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="rotulo">Tema do DSS</label>
            <input className="campo" disabled={!editavel} maxLength={200} value={form.dss_tema} onChange={(e) => alterarForm({ dss_tema: e.target.value })} />
          </div>
          <div>
            <label className="rotulo">Participantes</label>
            <input type="number" inputMode="numeric" min="0" className="campo" disabled={!editavel} value={form.dss_participantes} onChange={(e) => alterarForm({ dss_participantes: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <label className="rotulo">Comentário geral</label>
            <textarea className="campo" rows={3} maxLength={5000} disabled={!editavel} value={form.comentario_geral} onChange={(e) => alterarForm({ comentario_geral: e.target.value })} />
          </div>
        </div>
      </Secao>

      {rdo?.historico?.length ? (
        <Secao titulo="Histórico" aberta={false}>
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
                {!novo && status === 'RASCUNHO' ? (
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
