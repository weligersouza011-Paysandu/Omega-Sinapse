import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CircleAlert,
  CircleCheck,
  FileText,
  Paperclip,
  Printer,
  Settings,
  Upload,
} from 'lucide-react';
import Dropdown from '../Dropdown.jsx';
import EtiquetasPendencia from '../EtiquetasPendencia.jsx';
import ModalOsi from '../ModalOsi.jsx';
import Spinner from '../Spinner.jsx';
import StatusBadge from '../StatusBadge.jsx';
import AvancoFisicoEditor from './AvancoFisicoEditor.jsx';
import LocalizacoesObra from './LocalizacoesObra.jsx';
import MidiasObra from './MidiasObra.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarObra,
  enviarDocumento,
  obterObra,
  registrarOsi,
  usePlanejadores,
} from '../../hooks/useObras.js';
import { STATUS_OBRA_OPCOES } from '../../utils/status.js';
import { formatarDataHora, formatarMoeda, rotuloRevisao } from '../../utils/formatters.js';

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
 * Aba de edição/configuração da obra: ciclo operacional, responsável,
 * documentação de partida (OSI/Ata), localizações, avanço físico, galeria e
 * observações — com RBAC espelhando o back-end.
 */
export default function ConfiguracaoObra({
  obra,
  podeEditar = false,
  podeAtribuir = false,
  podeDocumentar = false,
  onObraAtualizada,
}) {
  const toast = useToast();
  const arquivoRef = useRef(null);

  const [statusSelecionado, setStatusSelecionado] = useState(obra?.status || '');
  const [numeroOsi, setNumeroOsi] = useState(obra?.osi_numero || '');
  const [observacoes, setObservacoes] = useState(obra?.observacoes || '');
  const [osiAberta, setOsiAberta] = useState(false);
  const [salvando, setSalvando] = useState('');

  const { planejadores, carregando: carregandoPlanejadores } = usePlanejadores(podeAtribuir);

  useEffect(() => {
    setStatusSelecionado(obra?.status || '');
    setNumeroOsi(obra?.osi_numero || '');
    setObservacoes(obra?.observacoes || '');
  }, [obra?.id, obra?.status, obra?.osi_numero, obra?.observacoes]);

  const osiEmitida = Boolean(obra?.osi_emitida_em);
  const ataAnexada = Boolean(obra?.ata_partida_url);
  const alterouStatus = Boolean(obra) && statusSelecionado !== obra.status;

  async function executar(chave, acao, mensagemSucesso) {
    setSalvando(chave);
    try {
      const atualizada = await acao();
      if (atualizada) onObraAtualizada?.(atualizada);
      toast.sucesso(mensagemSucesso);
      return true;
    } catch (err) {
      toast.erro(err.message || 'Não foi possível concluir a operação.');
      if (err.status === 422) {
        try {
          const atual = await obterObra(obra.id);
          onObraAtualizada?.(atual);
        } catch {
          // Mantém o estado atual quando a recarga também falha.
        }
      }
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
      `Status da obra atualizado para "${
        STATUS_OBRA_OPCOES.find((opcao) => opcao.value === statusSelecionado)?.label || statusSelecionado
      }".`
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
      return;
    }

    const sucesso = await executar(
      'osi',
      () => registrarOsi(obra.id, numeroOsi.trim()),
      'OSI emitida e registrada.'
    );
    if (sucesso) setOsiAberta(true);
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

  return (
    <section className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <Settings className="h-5 w-5 text-omega-600" aria-hidden="true" />
          Edição / Configuração da Obra
        </h2>
        <p className="text-sm text-slate-500">
          Governança da execução, documentação de partida, localizações, avanço físico e mídias.
        </p>
      </header>

      {/* ------------------------------------------- Etapa e responsável */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={obra.status} />
            <EtiquetasPendencia pendencias={obra.pendencias} />
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Valor do contrato</p>
            <p className="text-xl font-bold text-omega-700">{formatarMoeda(obra.valor)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="rotulo" htmlFor="statusObraConfig">Etapa de execução</label>
            <Dropdown
              id="statusObraConfig"
              value={statusSelecionado}
              onChange={setStatusSelecionado}
              opcoes={STATUS_OBRA_OPCOES}
              disabled={!podeEditar || salvando === 'status'}
            />
          </div>
          <button
            type="button"
            className="btn-primario"
            onClick={alterarStatus}
            disabled={!podeEditar || !alterouStatus || salvando === 'status'}
          >
            {salvando === 'status' ? <Spinner tamanho="sm" /> : null}
            Aplicar novo status
          </button>
        </div>

        <p className="mt-2 text-[11px] text-slate-500">
          Governança ISO 9001: a obra só assume <strong>Em Andamento</strong> ou <strong>Concluída</strong> com a
          OSI emitida e a Ata de Partida anexada.
        </p>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Responsável pela execução</h3>

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
                  ...planejadores.map((planejador) => ({
                    value: String(planejador.id),
                    label: planejador.nome,
                    descricao: planejador.matricula
                      ? `${planejador.nome} · ${planejador.matricula}`
                      : planejador.nome,
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
        </div>
      </section>

      {/* ------------------------------------ Pendências documentais */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Documentação de partida</h3>
          </div>
          <EtiquetasPendencia pendencias={obra.pendencias} />
        </header>

        <ul>
          <ItemPendencia
            titulo="1. Emissão da OSI"
            descricao={
              osiEmitida
                ? `Emitida em ${formatarDataHora(obra.osi_emitida_em)} por ${obra.osi_emitida_por_nome || 'usuário do sistema'}.`
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
                <button type="button" className="btn-neutro" onClick={() => setOsiAberta(true)}>
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
                <a href={obra.ata_partida_url} target="_blank" rel="noreferrer" className="btn-neutro">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  Ver documento
                </a>
              ) : null}

              {podeDocumentar ? (
                <>
                  <input
                    ref={arquivoRef}
                    id="arquivoAtaConfig"
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={anexarAta}
                    disabled={salvando === 'ata'}
                  />
                  <label
                    htmlFor="arquivoAtaConfig"
                    className={`btn-neutro cursor-pointer ${salvando === 'ata' ? 'pointer-events-none opacity-60' : ''}`}
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

      <LocalizacoesObra obra={obra} podeEditar={podeEditar} onObraAtualizada={onObraAtualizada} />

      <AvancoFisicoEditor obra={obra} podeEditar={podeEditar} onObraAtualizada={onObraAtualizada} />

      <MidiasObra obra={obra} podeEditar={podeEditar} onObraAtualizada={onObraAtualizada} />

      {/* ------------------------------------------------ Observações */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Observações da obra</h3>

        <textarea
          className="campo min-h-[96px] resize-y"
          placeholder="Restrições, condicionantes e alinhamentos da obra"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          disabled={!podeEditar || salvando === 'observacoes'}
        />

        {podeEditar ? (
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
        ) : null}
      </section>

      {/* ------------------------------------------ Dados do projeto */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          Dados do projeto
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Linha rotulo="PEP (CC)" valor={obra.pep} />
          <Linha rotulo="SS" valor={obra.ss} />
          <Linha rotulo="Cliente / Área" valor={obra.cliente} />
          <Linha rotulo="Endereço" valor={obra.endereco} />
          <Linha rotulo="Orçamentista" valor={obra.orcamentista_nome} />
          <Linha rotulo="ART" valor={obra.art} />
          <Linha rotulo="Criado em" valor={formatarDataHora(obra.created_at)} />
          <Linha rotulo="Última atualização" valor={formatarDataHora(obra.updated_at)} />
        </div>

        {revisoes.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Rev', 'Valor', 'Autor', 'Data', 'Observação'].map((titulo) => (
                    <th
                      key={titulo}
                      className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      {titulo}
                    </th>
                  ))}
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
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{revisao.usuario_nome || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {formatarDataHora(revisao.created_at)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{revisao.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <ModalOsi aberto={osiAberta} obra={obra} onFechar={() => setOsiAberta(false)} />
    </section>
  );
}
