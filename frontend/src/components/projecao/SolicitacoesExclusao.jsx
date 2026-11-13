import { useState } from 'react';
import { Check, ShieldAlert, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext.jsx';
import { decidirSolicitacaoExclusao, rotuloReferencia } from '../../hooks/useProjecaoBmm.js';
import { formatarDataHora, formatarMoeda } from '../../utils/formatters.js';
import ModalMotivo from './ModalMotivo.jsx';

const ROTULO_STATUS = { PENDENTE: 'Pendente', APROVADA: 'Aprovada', REJEITADA: 'Recusada' };
const COR_STATUS = {
  PENDENTE: 'bg-amber-50 text-amber-800 ring-amber-200',
  APROVADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJEITADA: 'bg-red-50 text-red-700 ring-red-200',
};

/**
 * Solicitações de exclusão de projeções. O ADMIN vê as pendentes do contrato e decide
 * (aprovar exclui a projeção; recusar exige o motivo); os demais acompanham as suas.
 */
export default function SolicitacoesExclusao({ solicitacoes, ehAdmin, onDecidido }) {
  const toast = useToast();
  const [decisao, setDecisao] = useState(null); // { solicitacao, aprovar }

  if (!solicitacoes.length) return null;
  const pendentes = solicitacoes.filter((s) => s.status === 'PENDENTE');
  const visiveis = ehAdmin ? pendentes : solicitacoes.slice(0, 10);
  if (!visiveis.length) return null;

  async function decidir(motivo) {
    const { solicitacao, aprovar } = decisao;
    const resultado = await decidirSolicitacaoExclusao(solicitacao.id, aprovar, motivo);
    toast.sucesso(aprovar ? `Projeção do BMM ${projecaoDe(solicitacao).numero_bmm} excluída.` : 'Solicitação recusada.');
    (resultado.curva || []).filter((c) => !c.atualizada).forEach((c) => toast.aviso(`Curva de ${c.referencia} não atualizada: ${c.motivo}`, 9000));
    setDecisao(null);
    onDecidido();
  }

  const projecaoDe = (s) => s.projecao || s.projecao_json || {};

  return (
    <section className={`card p-4 ${ehAdmin ? 'border-amber-300' : ''}`} aria-label="Solicitações de exclusão">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
        <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
        {ehAdmin ? `Solicitações de exclusão pendentes (${pendentes.length})` : 'Minhas solicitações de exclusão'}
      </h3>
      <ul className="divide-y divide-slate-100">
        {visiveis.map((s) => {
          const p = projecaoDe(s);
          return (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">
                  BMM {p.numero_bmm} · {rotuloReferencia(p.referencia)} · {p.obra?.ss || (p.obra_id ? `Obra ${p.obra_id}` : '')} · {formatarMoeda(p.total)}
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-medium">{s.solicitante_nome}</span> em {formatarDataHora(s.created_at)}: “{s.motivo}”
                </p>
                {s.status !== 'PENDENTE' ? (
                  <p className="text-xs text-slate-500">
                    {ROTULO_STATUS[s.status]} por {s.decidido_por_nome || '—'} em {formatarDataHora(s.decidido_em)}{s.motivo_decisao ? `: “${s.motivo_decisao}”` : ''}
                  </p>
                ) : null}
              </div>
              {ehAdmin ? (
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn-neutro" onClick={() => setDecisao({ solicitacao: s, aprovar: false })}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Recusar
                  </button>
                  <button type="button" className="btn-primario !bg-red-600 hover:!bg-red-700" onClick={() => setDecisao({ solicitacao: s, aprovar: true })}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Aprovar e excluir
                  </button>
                </div>
              ) : (
                <span className={`rounded px-2 py-0.5 text-[11px] font-bold ring-1 ${COR_STATUS[s.status]}`}>{ROTULO_STATUS[s.status]}</span>
              )}
            </li>
          );
        })}
      </ul>

      <ModalMotivo
        aberto={Boolean(decisao)}
        titulo={decisao?.aprovar ? 'Aprovar e excluir a projeção' : 'Recusar a solicitação'}
        subtitulo={decisao ? `BMM ${projecaoDe(decisao.solicitacao).numero_bmm} · ${rotuloReferencia(projecaoDe(decisao.solicitacao).referencia)}` : ''}
        rotulo={decisao?.aprovar ? 'Comentário (opcional)' : 'Motivo da recusa'}
        obrigatorio={!decisao?.aprovar}
        perigo={Boolean(decisao?.aprovar)}
        textoBotao={decisao?.aprovar ? 'Excluir a projeção' : 'Recusar'}
        onCancelar={() => setDecisao(null)}
        onConfirmar={decidir}
      />
    </section>
  );
}
