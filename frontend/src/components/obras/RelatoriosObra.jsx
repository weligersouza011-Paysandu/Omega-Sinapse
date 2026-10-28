import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  Image,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Video,
  X,
} from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarRelatorioObra,
  criarComentarioObra,
  criarOcorrenciaObra,
  criarRelatorioObra,
  removerComentarioObra,
  removerOcorrenciaObra,
  removerRelatorioObra,
} from '../../hooks/useObras.js';
import { formatarData, formatarDataHora } from '../../utils/formatters.js';
import { dataLocalISO, dataParaInput } from '../../utils/formatters.js';

const STATUS_RELATORIO = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  ENVIADO: { label: 'Enviado', cor: 'bg-blue-100 text-blue-700 border-blue-300' },
  APROVADO: { label: 'Aprovado', cor: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
};

const GRAVIDADE = {
  BAIXA: { label: 'Baixa', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  MEDIA: { label: 'Média', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
  ALTA: { label: 'Alta', cor: 'bg-orange-100 text-orange-800 border-orange-300' },
  CRITICA: { label: 'Crítica', cor: 'bg-red-100 text-red-700 border-red-300' },
};

const FORM_RELATORIO_VAZIO = {
  data: dataLocalISO(),
  titulo: '',
  resumo: '',
  status: 'RASCUNHO',
};

/** Formulário compacto de ocorrência ou comentário vinculado (ou não) a um RDO. */
function FormVinculo({ tipo, relatorios, salvando, onCancelar, onSalvar }) {
  const [descricao, setDescricao] = useState('');
  const [gravidade, setGravidade] = useState('MEDIA');
  const [relatorioId, setRelatorioId] = useState('');

  const ehOcorrencia = tipo === 'ocorrencia';

  function enviar(evento) {
    evento.preventDefault();
    onSalvar({
      texto: descricao.trim(),
      gravidade,
      relatorioId: relatorioId ? Number(relatorioId) : null,
    });
  }

  return (
    <form onSubmit={enviar} className="rounded-lg border border-omega-100 bg-omega-50/50 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px_180px]">
        <div>
          <label className="rotulo" htmlFor={`${tipo}Descricao`}>
            {ehOcorrencia ? 'Descrição da ocorrência *' : 'Comentário *'}
          </label>
          <input
            id={`${tipo}Descricao`}
            className="campo"
            placeholder={ehOcorrencia ? 'Ex.: Interferência de terceiros no KM 14' : 'Ex.: Alinhamento com a fiscalização'}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={salvando}
          />
        </div>

        {ehOcorrencia ? (
          <div>
            <label className="rotulo" htmlFor="ocorrenciaGravidade">Gravidade</label>
            <select
              id="ocorrenciaGravidade"
              className="campo"
              value={gravidade}
              onChange={(e) => setGravidade(e.target.value)}
              disabled={salvando}
            >
              {Object.entries(GRAVIDADE).map(([valor, dados]) => (
                <option key={valor} value={valor}>{dados.label}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="rotulo" htmlFor={`${tipo}Relatorio`}>RDO vinculado</label>
          <select
            id={`${tipo}Relatorio`}
            className="campo"
            value={relatorioId}
            onChange={(e) => setRelatorioId(e.target.value)}
            disabled={salvando}
          >
            <option value="">Sem vínculo</option>
            {relatorios.map((relatorio) => (
              <option key={relatorio.id} value={relatorio.id}>
                #{relatorio.id} · {relatorio.titulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn-neutro" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" className="btn-primario" disabled={salvando || !descricao.trim()}>
          {salvando ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {ehOcorrencia ? 'Registrar ocorrência' : 'Publicar comentário'}
        </button>
      </div>
    </form>
  );
}

/**
 * Relatórios Diários de Obra (RDO), ocorrências e comentários.
 *
 * O RDO concentra as atividades, ocorrências, comentários e mídias vinculadas;
 * a lista lateral permite navegar entre os relatórios e abrir o detalhe.
 */
export default function RelatoriosObra({ obra, podeEditar = false, onObraAtualizada }) {
  const toast = useToast();
  const relatorios = useMemo(() => obra?.relatorios || [], [obra?.relatorios]);

  const [selecionadoId, setSelecionadoId] = useState(null);
  const [formRelatorio, setFormRelatorio] = useState(FORM_RELATORIO_VAZIO);
  const [editandoRelatorioId, setEditandoRelatorioId] = useState(null);
  const [formRelatorioAberto, setFormRelatorioAberto] = useState(false);
  const [formOcorrenciaAberto, setFormOcorrenciaAberto] = useState(false);
  const [formComentarioAberto, setFormComentarioAberto] = useState(false);
  const [salvando, setSalvando] = useState('');

  useEffect(() => {
    if (relatorios.length === 0) {
      setSelecionadoId(null);
      return;
    }
    if (!selecionadoId || !relatorios.some((relatorio) => relatorio.id === selecionadoId)) {
      setSelecionadoId(relatorios[0].id);
    }
  }, [relatorios, selecionadoId]);

  const selecionado = relatorios.find((relatorio) => relatorio.id === selecionadoId) || null;

  const atividadesDoRelatorio = (obra?.atividades || []).filter(
    (atividade) => atividade.relatorio_id === selecionadoId
  );
  const ocorrenciasDoRelatorio = (obra?.ocorrencias || []).filter(
    (ocorrencia) => ocorrencia.relatorio_id === selecionadoId
  );
  const comentariosDoRelatorio = (obra?.comentarios || []).filter(
    (comentario) => comentario.relatorio_id === selecionadoId
  );
  const midiasDoRelatorio = (obra?.midias || []).filter(
    (midia) => midia.relatorio_id === selecionadoId
  );

  function abrirNovoRelatorio() {
    setEditandoRelatorioId(null);
    setFormRelatorio(FORM_RELATORIO_VAZIO);
    setFormRelatorioAberto(true);
  }

  function fecharFormRelatorio() {
    setEditandoRelatorioId(null);
    setFormRelatorio(FORM_RELATORIO_VAZIO);
    setFormRelatorioAberto(false);
  }

  function iniciarEdicaoRelatorio(relatorio) {
    setEditandoRelatorioId(relatorio.id);
    setFormRelatorio({
      data: dataParaInput(relatorio.data),
      titulo: relatorio.titulo || '',
      resumo: relatorio.resumo || '',
      status: relatorio.status || 'RASCUNHO',
    });
    setFormRelatorioAberto(true);
  }

  async function salvarRelatorio(evento) {
    evento.preventDefault();
    if (!formRelatorio.titulo.trim()) {
      toast.aviso('Informe o título do relatório.');
      return;
    }

    const payload = {
      data: formRelatorio.data,
      titulo: formRelatorio.titulo.trim(),
      resumo: formRelatorio.resumo.trim() || null,
      status: formRelatorio.status,
    };

    setSalvando('relatorio');
    try {
      const atualizada = editandoRelatorioId
        ? await atualizarRelatorioObra(obra.id, editandoRelatorioId, payload)
        : await criarRelatorioObra(obra.id, payload);

      onObraAtualizada?.(atualizada);
      const alvo = editandoRelatorioId
        ? atualizada.relatorios.find((relatorio) => relatorio.id === editandoRelatorioId)
        : atualizada.relatorios.reduce(
            (maior, relatorio) => (!maior || relatorio.id > maior.id ? relatorio : maior),
            null
          );
      if (alvo) setSelecionadoId(alvo.id);

      toast.sucesso(editandoRelatorioId ? 'Relatório atualizado.' : 'Relatório criado.');
      fecharFormRelatorio();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível salvar o relatório.');
    } finally {
      setSalvando('');
    }
  }

  async function excluirRelatorio(relatorio) {
    if (!window.confirm(`Remover o relatório "${relatorio.titulo}" e seus vínculos?`)) return;

    setSalvando(`relatorio-${relatorio.id}`);
    try {
      const atualizada = await removerRelatorioObra(obra.id, relatorio.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Relatório removido.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover o relatório.');
    } finally {
      setSalvando('');
    }
  }

  async function salvarOcorrencia({ texto, gravidade, relatorioId }) {
    if (!texto) {
      toast.aviso('Descreva a ocorrência.');
      return;
    }

    setSalvando('ocorrencia');
    try {
      const atualizada = await criarOcorrenciaObra(obra.id, {
        descricao: texto,
        gravidade,
        relatorio_id: relatorioId,
      });
      onObraAtualizada?.(atualizada);
      toast.sucesso('Ocorrência registrada.');
      setFormOcorrenciaAberto(false);
    } catch (err) {
      toast.erro(err.message || 'Não foi possível registrar a ocorrência.');
    } finally {
      setSalvando('');
    }
  }

  async function excluirOcorrencia(ocorrencia) {
    if (!window.confirm('Remover esta ocorrência?')) return;

    try {
      const atualizada = await removerOcorrenciaObra(obra.id, ocorrencia.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Ocorrência removida.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a ocorrência.');
    }
  }

  async function salvarComentario({ texto, relatorioId }) {
    if (!texto) {
      toast.aviso('Escreva o comentário.');
      return;
    }

    setSalvando('comentario');
    try {
      const atualizada = await criarComentarioObra(obra.id, {
        texto,
        relatorio_id: relatorioId,
      });
      onObraAtualizada?.(atualizada);
      toast.sucesso('Comentário publicado.');
      setFormComentarioAberto(false);
    } catch (err) {
      toast.erro(err.message || 'Não foi possível publicar o comentário.');
    } finally {
      setSalvando('');
    }
  }

  async function excluirComentario(comentario) {
    if (!window.confirm('Remover este comentário?')) return;

    try {
      const atualizada = await removerComentarioObra(obra.id, comentario.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Comentário removido.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover o comentário.');
    }
  }

  const ocorrencias = obra?.ocorrencias || [];
  const comentarios = obra?.comentarios || [];

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <FileText className="h-5 w-5 text-omega-600" aria-hidden="true" />
            Relatórios Diários de Obra
          </h2>
          <p className="text-sm text-slate-500">
            Registros de campo, ocorrências, comentários e mídias vinculadas à obra.
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            className="btn-primario"
            onClick={() => (formRelatorioAberto ? fecharFormRelatorio() : abrirNovoRelatorio())}
          >
            {formRelatorioAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {formRelatorioAberto ? 'Cancelar' : 'Novo RDO'}
          </button>
        ) : null}
      </header>

      {formRelatorioAberto && podeEditar ? (
        <form onSubmit={salvarRelatorio} className="card space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_180px]">
            <div>
              <label className="rotulo" htmlFor="rdoData">Data *</label>
              <input
                id="rdoData"
                type="date"
                className="campo"
                value={formRelatorio.data}
                onChange={(e) => setFormRelatorio((atual) => ({ ...atual, data: e.target.value }))}
                disabled={salvando === 'relatorio'}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="rdoTitulo">Título *</label>
              <input
                id="rdoTitulo"
                className="campo"
                placeholder="Ex.: RDO 12 — Frente norte"
                value={formRelatorio.titulo}
                onChange={(e) => setFormRelatorio((atual) => ({ ...atual, titulo: e.target.value }))}
                disabled={salvando === 'relatorio'}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="rdoStatus">Situação</label>
              <select
                id="rdoStatus"
                className="campo"
                value={formRelatorio.status}
                onChange={(e) => setFormRelatorio((atual) => ({ ...atual, status: e.target.value }))}
                disabled={salvando === 'relatorio'}
              >
                {Object.entries(STATUS_RELATORIO).map(([valor, dados]) => (
                  <option key={valor} value={valor}>{dados.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="rotulo" htmlFor="rdoResumo">Resumo do dia</label>
            <textarea
              id="rdoResumo"
              className="campo min-h-[88px] resize-y"
              placeholder="Condições climáticas, efetivo, serviços executados e restrições."
              value={formRelatorio.resumo}
              onChange={(e) => setFormRelatorio((atual) => ({ ...atual, resumo: e.target.value }))}
              disabled={salvando === 'relatorio'}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={fecharFormRelatorio} disabled={salvando === 'relatorio'}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando === 'relatorio'}>
              {salvando === 'relatorio' ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {editandoRelatorioId ? 'Salvar alterações' : 'Criar relatório'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        {/* Lista de RDOs */}
        <div className="space-y-2">
          {relatorios.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <FileText className="h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">Nenhum relatório</p>
              <p className="text-xs text-slate-500">Crie o primeiro RDO para registrar a execução da obra.</p>
            </div>
          ) : (
            relatorios.map((relatorio) => {
              const dadosStatus = STATUS_RELATORIO[relatorio.status] || STATUS_RELATORIO.RASCUNHO;
              const ativo = relatorio.id === selecionadoId;

              return (
                <button
                  key={relatorio.id}
                  type="button"
                  onClick={() => setSelecionadoId(relatorio.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    ativo
                      ? 'border-omega-500 bg-omega-50/60 ring-2 ring-omega-500/15'
                      : 'border-slate-200 bg-white hover:border-omega-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{relatorio.titulo}</p>
                      <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarDays className="h-3 w-3" aria-hidden="true" />
                        {formatarData(relatorio.data)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${dadosStatus.cor}`}>
                      {dadosStatus.label}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>{relatorio.totais?.atividades ?? 0} atividades</span>
                    <span>{relatorio.totais?.ocorrencias ?? 0} ocorrências</span>
                    <span>{relatorio.totais?.midias ?? 0} mídias</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detalhe do RDO selecionado */}
        <div className="card min-h-[220px] p-4">
          {!selecionado ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <ClipboardList className="h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">Selecione um relatório</p>
              <p className="max-w-sm text-xs text-slate-500">
                O detalhe mostra o resumo e todos os registros vinculados ao RDO.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800">{selecionado.titulo}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${(STATUS_RELATORIO[selecionado.status] || STATUS_RELATORIO.RASCUNHO).cor}`}>
                      {(STATUS_RELATORIO[selecionado.status] || STATUS_RELATORIO.RASCUNHO).label}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" aria-hidden="true" />
                      {formatarData(selecionado.data)}
                    </span>
                    {selecionado.autor_nome ? (
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" aria-hidden="true" />
                        {selecionado.autor_nome}
                      </span>
                    ) : null}
                  </p>
                </div>

                {podeEditar ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => iniciarEdicaoRelatorio(selecionado)}
                      title="Editar relatório"
                      className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-omega-700"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => excluirRelatorio(selecionado)}
                      title="Remover relatório"
                      disabled={salvando === `relatorio-${selecionado.id}`}
                      className="rounded p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </header>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resumo</p>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {selecionado.resumo || 'Sem resumo informado.'}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Atividades ({atividadesDoRelatorio.length})
                  </p>
                  {atividadesDoRelatorio.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma atividade vinculada.</p>
                  ) : (
                    <ul className="space-y-1">
                      {atividadesDoRelatorio.map((atividade) => (
                        <li key={atividade.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                          <span className="font-semibold">{atividade.titulo}</span>
                          {atividade.responsavel ? <span className="text-slate-500"> · {atividade.responsavel}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Ocorrências ({ocorrenciasDoRelatorio.length})
                  </p>
                  {ocorrenciasDoRelatorio.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma ocorrência vinculada.</p>
                  ) : (
                    <ul className="space-y-1">
                      {ocorrenciasDoRelatorio.map((ocorrencia) => (
                        <li key={ocorrencia.id} className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-slate-700">
                          <span className={`mr-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${(GRAVIDADE[ocorrencia.gravidade] || GRAVIDADE.MEDIA).cor}`}>
                            {(GRAVIDADE[ocorrencia.gravidade] || GRAVIDADE.MEDIA).label}
                          </span>
                          {ocorrencia.descricao}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Comentários ({comentariosDoRelatorio.length})
                  </p>
                  {comentariosDoRelatorio.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum comentário vinculado.</p>
                  ) : (
                    <ul className="space-y-1">
                      {comentariosDoRelatorio.map((comentario) => (
                        <li key={comentario.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                          {comentario.texto}
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            {comentario.autor_nome || 'Usuário'} · {formatarDataHora(comentario.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Fotos e vídeos ({midiasDoRelatorio.length})
                  </p>
                  {midiasDoRelatorio.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma mídia vinculada.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {midiasDoRelatorio.map((midia) => (
                        <a
                          key={midia.id}
                          href={midia.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                          title={midia.legenda || midia.url}
                        >
                          {midia.tipo === 'FOTO' ? (
                            <img src={midia.url} alt={midia.legenda || 'Foto do RDO'} loading="lazy" className="h-16 w-full object-cover" />
                          ) : (
                            <span className="flex h-16 w-full items-center justify-center text-rose-600">
                              <Video className="h-6 w-6" aria-hidden="true" />
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ocorrências e comentários gerais da obra */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Ocorrências ({ocorrencias.length})
            </h3>
            {podeEditar ? (
              <button type="button" className="btn-neutro" onClick={() => setFormOcorrenciaAberto((valor) => !valor)}>
                {formOcorrenciaAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                {formOcorrenciaAberto ? 'Cancelar' : 'Registrar'}
              </button>
            ) : null}
          </header>

          {formOcorrenciaAberto && podeEditar ? (
            <div className="mb-3">
              <FormVinculo
                tipo="ocorrencia"
                relatorios={relatorios}
                salvando={salvando === 'ocorrencia'}
                onCancelar={() => setFormOcorrenciaAberto(false)}
                onSalvar={salvarOcorrencia}
              />
            </div>
          ) : null}

          {ocorrencias.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
              Nenhuma ocorrência registrada.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ocorrencias.map((ocorrencia) => {
                const dadosGravidade = GRAVIDADE[ocorrencia.gravidade] || GRAVIDADE.MEDIA;
                return (
                  <li key={ocorrencia.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <span className={`mr-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${dadosGravidade.cor}`}>
                        {dadosGravidade.label}
                      </span>
                      <span className="text-xs text-slate-700">{ocorrencia.descricao}</span>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {formatarDataHora(ocorrencia.created_at)}
                        {ocorrencia.relatorio ? ` · RDO #${ocorrencia.relatorio.id}` : ' · sem vínculo'}
                      </p>
                    </div>
                    {podeEditar ? (
                      <button
                        type="button"
                        onClick={() => excluirOcorrencia(ocorrencia)}
                        title="Remover ocorrência"
                        className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <MessageSquare className="h-4 w-4 text-violet-600" aria-hidden="true" />
              Comentários ({comentarios.length})
            </h3>
            {podeEditar ? (
              <button type="button" className="btn-neutro" onClick={() => setFormComentarioAberto((valor) => !valor)}>
                {formComentarioAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                {formComentarioAberto ? 'Cancelar' : 'Comentar'}
              </button>
            ) : null}
          </header>

          {formComentarioAberto && podeEditar ? (
            <div className="mb-3">
              <FormVinculo
                tipo="comentario"
                relatorios={relatorios}
                salvando={salvando === 'comentario'}
                onCancelar={() => setFormComentarioAberto(false)}
                onSalvar={salvarComentario}
              />
            </div>
          ) : null}

          {comentarios.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
              Nenhum comentário registrado.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {comentarios.map((comentario) => (
                <li key={comentario.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-700">{comentario.texto}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {comentario.autor_nome || 'Usuário'} · {formatarDataHora(comentario.created_at)}
                      {comentario.relatorio ? ` · RDO #${comentario.relatorio.id}` : ' · sem vínculo'}
                    </p>
                  </div>
                  {podeEditar ? (
                    <button
                      type="button"
                      onClick={() => excluirComentario(comentario)}
                      title="Remover comentário"
                      className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
        <Image className="h-3 w-3" aria-hidden="true" />
        Fotos e vídeos são gerenciados na aba de configuração da obra.
      </p>
    </section>
  );
}
