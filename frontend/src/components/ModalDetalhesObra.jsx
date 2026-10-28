import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  FileText,
  Paperclip,
  Printer,
  Upload,
} from 'lucide-react';
import Dropdown from './Dropdown.jsx';
import EtiquetasPendencia from './EtiquetasPendencia.jsx';
import ModalBase from './ModalBase.jsx';
import ModalOsi from './ModalOsi.jsx';
import Spinner from './Spinner.jsx';
import StatusBadge from './StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  atualizarObra,
  enviarDocumento,
  obterObra,
  registrarOsi,
  usePlanejadores,
} from '../hooks/useObras.js';
import { STATUS_OBRA_OPCOES } from '../utils/status.js';
import { formatarDataHora, formatarMoeda, rotuloRevisao } from '../utils/formatters.js';

/** Perfis autorizados a atribuir o planejador responsável (espelha o back-end). */
const PERFIS_QUE_ATRIBUEM = ['SUPERVISOR', 'ADMIN'];

/** Perfis autorizados a emitir a OSI e anexar a documentação de partida. */
const PERFIS_QUE_DOCUMENTAM = ['PLANEJADOR', 'SUPERVISOR', 'ADMIN'];

function Linha({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="truncate text-sm font-medium text-slate-700">{valor || '—'}</p>
    </div>
  );
}

/** Item da régua de pendências documentais (ISO 9001). */
function ItemPendencia({ titulo, descricao, cumprido, children }) {
  return (
    <li className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {cumprido ? (
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{titulo}</p>
          <p className="text-xs text-slate-500">{descricao}</p>
        </div>
      </div>

      <div className="shrink-0 sm:max-w-[55%]">{children}</div>
    </li>
  );
}

/**
 * Detalhe operacional da obra — governança ISO 9001.
 *
 * Concentra o ciclo de vida da execução (status operacional), a atribuição do
 * técnico planejador, a régua de pendências documentais (emissão da OSI e Ata
 * de Reunião de Partida) e a rastreabilidade do orçamento aprovado.
 */
export default function ModalDetalhesObra({ obraId, aberto, onFechar, onAtualizado }) {
  const toast = useToast();
  const { usuario } = useAuth();

  const [obra, setObra] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState('');

  const [statusSelecionado, setStatusSelecionado] = useState('');
  const [numeroOsi, setNumeroOsi] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [osiAberta, setOsiAberta] = useState(false);

  const arquivoRef = useRef(null);

  const podeAtribuir = PERFIS_QUE_ATRIBUEM.includes(usuario?.perfil);
  const podeDocumentar = PERFIS_QUE_DOCUMENTAM.includes(usuario?.perfil);

  // A listagem de planejadores só é acessível a SUPERVISOR/ADMIN no back-end.
  const { planejadores, carregando: carregandoPlanejadores } = usePlanejadores(
    aberto && podeAtribuir
  );

  const carregar = useCallback(async () => {
    if (!obraId) return;

    setCarregando(true);
    setErro('');
    try {
      const dados = await obterObra(obraId);
      setObra(dados);
      setStatusSelecionado(dados.status);
      setObservacoes(dados.observacoes || '');
      setNumeroOsi(dados.osi_numero || '');
    } catch (err) {
      const mensagem = err.message || 'Não foi possível carregar a obra.';
      setErro(mensagem);
      toast.erro(mensagem);
    } finally {
      setCarregando(false);
    }
  }, [obraId, toast]);

  useEffect(() => {
    if (aberto && obraId) {
      setOsiAberta(false);
      carregar();
    }
  }, [aberto, obraId, carregar]);

  /** Centraliza a validação de sucesso das operações de escrita. */
  async function executar(chave, acao, mensagemSucesso) {
    setSalvando(chave);
    try {
      const atualizada = await acao();
      if (atualizada) {
        setObra(atualizada);
        setStatusSelecionado(atualizada.status);
        setObservacoes(atualizada.observacoes || '');
        setNumeroOsi(atualizada.osi_numero || '');
      }
      toast.sucesso(mensagemSucesso);
      if (onAtualizado) onAtualizado();
      return true;
    } catch (err) {
      toast.erro(err.message || 'Não foi possível concluir a operação.');
      // A régua ISO 9001 devolve 422: recarrega para refletir o estado real.
      if (err.status === 422) await carregar();
      return false;
    } finally {
      setSalvando('');
    }
  }

  function alterarStatus() {
    if (!statusSelecionado || statusSelecionado === obra?.status) return;
    return executar(
      'status',
      () => atualizarObra(obra.id, { status: statusSelecionado }),
      `Status da obra atualizado para "${STATUS_OBRA_OPCOES.find((o) => o.value === statusSelecionado)?.label}".`
    );
  }

  function atribuirPlanejador(valor) {
    return executar(
      'planejador',
      () => atualizarObra(obra.id, { planejador_id: valor === '' ? null : Number(valor) }),
      valor === '' ? 'Responsável removido da obra.' : 'Planejador responsável atribuído.'
    );
  }

  function salvarObservacoes() {
    return executar(
      'observacoes',
      () => atualizarObra(obra.id, { observacoes: observacoes.trim() }),
      'Observações salvas.'
    );
  }

  async function emitirOsi() {
    if (!numeroOsi.trim()) {
      toast.aviso('Informe o número da OSI antes de registrar a emissão.');
      return undefined;
    }

    const sucesso = await executar(
      'osi',
      () => registrarOsi(obra.id, numeroOsi.trim()),
      'OSI emitida e registrada.'
    );

    // Após registrar a emissão, abre imediatamente a pré-visualização A4 da
    // OSI — o usuário confere o documento e dispara a impressão/Salvar PDF.
    if (sucesso) {
      setOsiAberta(true);
    }

    return undefined;
  }

  async function anexarAta(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setSalvando('ata');
    try {
      const documento = await enviarDocumento(arquivo);
      setSalvando('');
      await executar(
        'ata',
        () => atualizarObra(obra.id, { ata_partida_url: documento.url }),
        'Ata de Reunião de Partida anexada.'
      );
    } catch (err) {
      setSalvando('');
      toast.erro(err.message || 'Não foi possível enviar o documento.');
    } finally {
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  const revisoes = obra?.orcamento?.revisoes || [];
  const fiscais = obra?.fiscais || [];
  const fotos = [obra?.foto_1, obra?.foto_2, obra?.foto_3].filter(Boolean);
  const osiEmitida = Boolean(obra?.osi_emitida_em);
  const ataAnexada = Boolean(obra?.ata_partida_url);
  const alterouStatus = Boolean(obra) && statusSelecionado !== obra.status;

  return (
    <>
      <ModalBase
        aberto={aberto}
        titulo={obra ? `Obra ${obra.pep}` : 'Detalhes da obra'}
        subtitulo={obra ? `SS ${obra.ss || '—'} · Orçamento #${obra.orcamento_id}` : ''}
        onFechar={onFechar}
        tamanho="xl"
      >
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          {carregando ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
              <Spinner tamanho="lg" className="text-omega-600" />
              <p className="text-sm">Carregando obra...</p>
            </div>
          ) : erro ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {erro}
            </div>
          ) : obra ? (
            <div className="space-y-6">
              {/* ------------------------------------- Status operacional */}
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={obra.status} />
                    <EtiquetasPendencia pendencias={obra.pendencias} />
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Valor do contrato
                    </p>
                    <p className="text-xl font-bold text-omega-700">{formatarMoeda(obra.valor)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="rotulo" htmlFor="statusObra">
                      Etapa de execução
                    </label>
                    <Dropdown
                      id="statusObra"
                      value={statusSelecionado}
                      onChange={setStatusSelecionado}
                      opcoes={STATUS_OBRA_OPCOES}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={alterarStatus}
                    disabled={!alterouStatus || salvando === 'status'}
                  >
                    {salvando === 'status' ? <Spinner tamanho="sm" /> : null}
                    Aplicar novo status
                  </button>
                </div>

                <p className="mt-2 text-[11px] text-slate-500">
                  Governança ISO 9001: a obra só assume <strong>Em Andamento</strong> ou{' '}
                  <strong>Concluída</strong> com a OSI emitida e a Ata de Partida anexada.
                </p>
              </section>

              {/* ------------------------------------------ Planejador */}
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Responsável pela execução
                </h3>

                {podeAtribuir ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Dropdown
                      value={obra.planejador_id ? String(obra.planejador_id) : ''}
                      onChange={atribuirPlanejador}
                      carregando={carregandoPlanejadores}
                      disabled={salvando === 'planejador'}
                      placeholder="Selecione um técnico planejador"
                      textoVazio="Nenhum técnico planejador ativo cadastrado"
                      opcoes={[
                        { value: '', label: 'Sem responsável' },
                        ...planejadores.map((p) => ({
                          value: String(p.id),
                          label: p.nome,
                          descricao: p.matricula ? `${p.nome} · ${p.matricula}` : p.nome,
                        })),
                      ]}
                    />
                    <span className="text-xs font-medium text-slate-500">
                      {salvando === 'planejador' ? 'Salvando...' : 'Atribuição imediata'}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-slate-700">
                    {obra.planejador_nome || 'Nenhum planejador atribuído.'}
                  </p>
                )}
              </section>

              {/* ------------------------------ Pendências documentais */}
              <section className="overflow-hidden rounded-lg border border-slate-200">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                      Documentação de partida
                    </h3>
                  </div>
                  <EtiquetasPendencia pendencias={obra.pendencias} />
                </header>

                <ul>
                  <ItemPendencia
                    titulo="1. Emissão da OSI"
                    descricao={
                      osiEmitida
                        ? `Emitida em ${formatarDataHora(obra.osi_emitida_em)} por ${
                            obra.osi_emitida_por_nome || 'usuário do sistema'
                          }.`
                        : 'Ordem de Serviço Interna ainda não emitida.'
                    }
                    cumprido={osiEmitida}
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        className="campo sm:w-40"
                        placeholder="Nº da OSI"
                        value={numeroOsi}
                        onChange={(e) => setNumeroOsi(e.target.value)}
                        disabled={!podeDocumentar || salvando === 'osi'}
                        aria-label="Número da OSI"
                      />

                      {osiEmitida ? (
                        <button
                          type="button"
                          className="btn-neutro"
                          onClick={() => setOsiAberta(true)}
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          Imprimir OSI
                        </button>
                      ) : null}

                      {podeDocumentar ? (
                        <button
                          type="button"
                          className={osiEmitida ? 'btn-neutro' : 'btn-primario'}
                          onClick={emitirOsi}
                          disabled={salvando === 'osi'}
                        >
                          {salvando === 'osi' ? <Spinner tamanho="sm" /> : null}
                          {osiEmitida ? 'Atualizar OSI' : 'Emitir OSI'}
                        </button>
                      ) : null}
                    </div>
                  </ItemPendencia>

                  <ItemPendencia
                    titulo="2. Ata de Reunião de Partida"
                    descricao={
                      ataAnexada
                        ? 'Documento comprobatório do kick-off anexado.'
                        : 'Anexe a ata assinada do kick-off da obra (imagem ou PDF).'
                    }
                    cumprido={ataAnexada}
                  >
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {ataAnexada ? (
                        <a
                          href={obra.ata_partida_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-neutro"
                        >
                          <Paperclip className="h-4 w-4" aria-hidden="true" />
                          Ver documento
                        </a>
                      ) : null}

                      {podeDocumentar ? (
                        <>
                          <input
                            ref={arquivoRef}
                            id="arquivoAta"
                            type="file"
                            accept="application/pdf,image/*"
                            className="hidden"
                            onChange={anexarAta}
                            disabled={salvando === 'ata'}
                          />
                          <label
                            htmlFor="arquivoAta"
                            className={`btn-neutro cursor-pointer ${
                              salvando === 'ata' ? 'pointer-events-none opacity-60' : ''
                            }`}
                          >
                            {salvando === 'ata' ? <Spinner tamanho="sm" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                            {ataAnexada ? 'Substituir ata' : 'Anexar ata'}
                          </label>
                        </>
                      ) : null}
                    </div>
                  </ItemPendencia>
                </ul>
              </section>

              {/* ---------------------------------------- Dados do projeto */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Linha rotulo="PEP (CC)" valor={obra.pep} />
                <Linha rotulo="SS" valor={obra.ss} />
                <Linha rotulo="Cliente / Área" valor={obra.cliente} />
                <Linha rotulo="Endereço" valor={obra.endereco} />
                <Linha rotulo="Orçamentista" valor={obra.orcamentista_nome} />
                <Linha rotulo="ART" valor={obra.art} />
                <Linha rotulo="Criado em" valor={formatarDataHora(obra.created_at)} />
                <Linha rotulo="Última atualização" valor={formatarDataHora(obra.updated_at)} />
              </section>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Detalhamento do Serviço
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-700">{obra.descricao || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Documentos de Referência
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-700">
                    {obra.documentos_referencia || '—'}
                  </p>
                </div>
              </section>

              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Fiscais / Contatos
                </p>
                {fiscais.length > 0 ? (
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                    {fiscais.map((fiscal, indice) => (
                      <li
                        key={fiscal.id ?? indice}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-slate-700">{fiscal.nome}</span>
                        <span className="text-xs text-slate-500">
                          {fiscal.contato || 'sem contato informado'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Nenhum fiscal informado.</p>
                )}
              </section>

              {fotos.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    Fotos da obra
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {fotos.map((url, indice) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-slate-200"
                      >
                        <img
                          src={url}
                          alt={`Foto ${indice + 1} da obra`}
                          loading="lazy"
                          className="h-32 w-full object-cover transition hover:scale-[1.03]"
                        />
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Histórico de revisões de valor
                </h3>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Rev
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Valor
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Autor
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Data
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Observação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {revisoes.map((revisao) => (
                        <tr key={revisao.id} className="align-top">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-omega-700">
                            {revisao.rotulo || rotuloRevisao(revisao.numero_revisao)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                            {formatarMoeda(revisao.valor)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {revisao.usuario_nome || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                            {formatarDataHora(revisao.created_at)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{revisao.observacao}</td>
                        </tr>
                      ))}
                      {revisoes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                            Nenhuma revisão registrada.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Observações da obra
                </h3>

                <textarea
                  className="campo min-h-[88px] resize-y"
                  placeholder="Restrições, condicionantes e alinhamentos da obra"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  disabled={salvando === 'observacoes'}
                />

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={salvarObservacoes}
                    disabled={salvando === 'observacoes'}
                  >
                    {salvando === 'observacoes' ? <Spinner tamanho="sm" /> : null}
                    Salvar observações
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </ModalBase>

      <ModalOsi aberto={osiAberta} obra={obra} onFechar={() => setOsiAberta(false)} />
    </>
  );
}
