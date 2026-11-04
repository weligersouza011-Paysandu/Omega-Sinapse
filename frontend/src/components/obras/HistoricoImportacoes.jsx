import { useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Loader2, Trash2, XCircle } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import { formatarDataHora } from '../../utils/formatters.js';

const ACOES = {
  IMPORTADO: { rotulo: 'Importado', classe: 'bg-emerald-100 text-emerald-700', Icone: CheckCircle2 },
  FALHA: { rotulo: 'Recusado', classe: 'bg-amber-100 text-amber-800', Icone: AlertTriangle },
  EXCLUIDO: { rotulo: 'Excluído', classe: 'bg-red-100 text-red-700', Icone: XCircle },
};

/** Texto curto com o que importa em cada evento. */
function resumoDetalhes(evento) {
  const d = evento.detalhes || {};
  if (evento.acao === 'EXCLUIDO') {
    const partes = [d.motivo ? `Motivo: ${d.motivo}` : 'Sem motivo informado'];
    if (d.restricoes_transferidas) partes.push(`${d.restricoes_transferidas} restrição(ões) transferida(s) para ${d.transferidas_para}`);
    if (d.restricoes_removidas) partes.push(`${d.restricoes_removidas} restrição(ões) removida(s)`);
    return partes.join(' · ');
  }
  if (evento.acao === 'FALHA') {
    return d.motivo === 'DUPLICADO' ? `Arquivo repetido (já importado como ${d.versao_existente})` : d.mensagem || 'Falha na leitura';
  }
  const partes = [];
  if (d.observacao) partes.push(d.observacao);
  if (d.reimportacao_de) partes.push(`Reimportação do mesmo arquivo da ${d.reimportacao_de}`);
  if (d.avisos?.length) partes.push(`${d.avisos.length} aviso(s)`);
  return partes.join(' · ') || '—';
}

/** Tabela do histórico de importações, falhas e exclusões de revisões. */
export function HistoricoImportacoes({ eventos, carregando }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? eventos : eventos.slice(0, 8);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <History className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Histórico de importações
          </h2>
          <p className="text-xs text-slate-500">Cada envio, recusa (arquivo repetido ou fora do modelo) e exclusão de revisão fica registrado.</p>
        </div>
        {carregando ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Carregando" /> : null}
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Data', 'Evento', 'Revisão', 'Arquivo', 'Usuário', 'Atividades', 'Detalhes'].map((titulo) => (
                <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {lista.map((evento) => {
              const acao = ACOES[evento.acao] || ACOES.IMPORTADO;
              return (
                <tr key={evento.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatarDataHora(evento.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${acao.classe}`}>
                      <acao.Icone className="h-3 w-3" aria-hidden="true" />
                      {acao.rotulo}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{evento.versao || '—'}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-xs" title={evento.arquivo_nome || ''}>
                    {evento.arquivo_url ? (
                      <a href={evento.arquivo_url} target="_blank" rel="noreferrer" className="font-semibold text-omega-700 hover:underline">
                        {evento.arquivo_nome || 'Arquivo'}
                      </a>
                    ) : (
                      <span className="text-slate-600">{evento.arquivo_nome || '—'}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{evento.usuario_nome || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{evento.total_atividades ?? '—'}</td>
                  <td className="min-w-[16rem] px-3 py-2 text-xs text-slate-600">{resumoDetalhes(evento)}</td>
                </tr>
              );
            })}
            {!eventos.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Nenhuma importação registrada para esta obra.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {eventos.length > 8 ? (
        <div className="border-t border-slate-100 px-4 py-2 text-right">
          <button type="button" className="text-xs font-bold text-omega-700 hover:underline" onClick={() => setTodos(!todos)}>
            {todos ? 'Mostrar menos' : `Ver todos (${eventos.length})`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Confirmação de exclusão de uma revisão, com motivo opcional. */
export function ModalExcluirRevisao({ versao, onCancelar, onConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  async function confirmar() {
    setExcluindo(true);
    try {
      await onConfirmar(motivo);
      setMotivo('');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <ModalBase
      aberto={Boolean(versao)}
      titulo={versao ? `Excluir ${versao.versao}?` : ''}
      subtitulo={versao ? `${versao.arquivo_nome || 'Arquivo'} · ${versao.total_atividades} atividades` : ''}
      onFechar={() => (excluindo ? null : onCancelar())}
      tamanho="md"
    >
      {versao ? (
        <div className="space-y-3 p-5">
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              A revisão e todas as atividades dela serão removidas e não aparecerão mais na Curva S, no caminho crítico, no lookahead
              e na carga de trabalho. As restrições cadastradas passam para a revisão mais recente que permanecer (mesmo EDT).
              A exclusão fica registrada no histórico e não pode ser desfeita.
            </p>
          </div>
          <div>
            <label className="rotulo" htmlFor="motivo-exclusao">
              Motivo (opcional)
            </label>
            <textarea
              id="motivo-exclusao"
              className="campo min-h-[5rem]"
              maxLength={500}
              placeholder="Ex.: Arquivo enviado errado (revisão desatualizada)"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              disabled={excluindo}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={onCancelar} disabled={excluindo}>
              Cancelar
            </button>
            <button type="button" className="btn-perigo" onClick={confirmar} disabled={excluindo}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              Excluir revisão
            </button>
          </div>
        </div>
      ) : null}
    </ModalBase>
  );
}

/** Pergunta se o mesmo arquivo deve ser importado de novo. */
export function ModalArquivoRepetido({ duplicado, onCancelar, onConfirmar, enviando }) {
  return (
    <ModalBase
      aberto={Boolean(duplicado)}
      titulo="Este arquivo já foi importado"
      subtitulo={duplicado?.versao_existente ? `Mesmo arquivo da ${duplicado.versao_existente.versao}` : ''}
      onFechar={() => (enviando ? null : onCancelar())}
      tamanho="md"
    >
      {duplicado ? (
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-700">{duplicado.mensagem}</p>
          <p className="text-xs text-slate-500">
            Importar de novo cria uma revisão idêntica à anterior. Se o objetivo é corrigir algo, ajuste o cronograma no MS Project antes de enviar ou
            exclua a revisão errada.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={onCancelar} disabled={enviando}>
              Cancelar
            </button>
            <button type="button" className="btn-primario" onClick={onConfirmar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Importar mesmo assim
            </button>
          </div>
        </div>
      ) : null}
    </ModalBase>
  );
}
