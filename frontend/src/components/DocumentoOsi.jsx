import { formatarData, formatarDataHora, formatarMoeda, rotuloRevisao } from '../utils/formatters.js';

/** Bloco de campo do documento (rótulo + valor). */
function Campo({ rotulo, valor, className = '' }) {
  return (
    <div className={className}>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{rotulo}</p>
      <p className="mt-0.5 whitespace-pre-line text-[11px] font-medium text-slate-900">{valor || '—'}</p>
    </div>
  );
}

/** Faixa de título de seção. */
function Secao({ numero, titulo }) {
  return (
    <div className="mt-5 flex items-center gap-2 border-b border-slate-900 pb-1">
      <span className="text-[10px] font-black text-slate-900">{numero}</span>
      <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-900">{titulo}</h2>
    </div>
  );
}

/**
 * Modelo estruturado da Ordem de Serviço Interna (OSI).
 *
 * Componente puramente apresentacional, formatado para uma folha A4 em
 * impressão (use com `ModalOsi`). Espelha o cabeçalho corporativo da Omega
 * Service e consolida os dados do orçamento aprovado que originou a obra.
 */
export default function DocumentoOsi({ obra, geradoEm }) {
  if (!obra) return null;

  const revisoes = obra.orcamento?.revisoes || [];
  const fiscais = obra.fiscais || [];

  return (
    <div className="px-8 py-7 text-slate-900">
      {/* ------------------------------------------------------------ Cabeçalho */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded border-2 border-slate-900">
            <span className="text-sm font-black tracking-tight">OS</span>
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-black uppercase tracking-[0.16em]">Omega Service</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Synapse · Gestão de Orçamentos e Obras
            </p>
            <p className="text-[9px] font-medium text-slate-500">
              Sistema de governança de engenharia — ISO 9001
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[13px] font-black uppercase tracking-[0.12em]">Ordem de Serviço Interna</p>
          <p className="mt-1 text-[11px] font-bold">
            Nº <span className="text-[13px]">{obra.osi_numero || '—'}</span>
          </p>
          <p className="text-[10px] font-medium text-slate-500">
            Emissão: {formatarDataHora(obra.osi_emitida_em)}
          </p>
        </div>
      </header>

      {/* ------------------------------------------------- 1. Identificação */}
      <Secao numero="1" titulo="Identificação da obra" />
      <div className="mt-3 grid grid-cols-4 gap-x-4 gap-y-3">
        <Campo rotulo="PEP (CC)" valor={obra.pep} className="col-span-2" />
        <Campo rotulo="Solicitação de Serviço (SS)" valor={obra.ss} className="col-span-2" />
        <Campo rotulo="Cliente / Área" valor={obra.cliente} className="col-span-2" />
        <Campo rotulo="ART" valor={obra.art} className="col-span-2" />
        <Campo rotulo="Endereço de execução" valor={obra.endereco} className="col-span-4" />
      </div>

      {/* ------------------------------------------------------- 2. Escopo */}
      <Secao numero="2" titulo="Escopo do serviço contratado" />
      <p className="mt-3 whitespace-pre-line text-[11px] leading-relaxed text-slate-900">
        {obra.descricao || 'Escopo não detalhado no orçamento.'}
      </p>

      {obra.documentos_referencia ? (
        <>
          <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Documentos de referência
          </p>
          <p className="mt-0.5 whitespace-pre-line text-[11px] text-slate-900">
            {obra.documentos_referencia}
          </p>
        </>
      ) : null}

      {/* ---------------------------------------------------- 3. Responsáveis */}
      <Secao numero="3" titulo="Responsáveis" />
      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
        <Campo rotulo="Orçamentista" valor={obra.orcamentista_nome} />
        <Campo rotulo="Técnico Planejador" valor={obra.planejador_nome} />
        <Campo rotulo="Emissor da OSI" valor={obra.osi_emitida_por_nome} />
      </div>

      {/* --------------------------------------------------------- 4. Fiscais */}
      <Secao numero="4" titulo="Fiscais / Contatos" />
      {fiscais.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {fiscais.map((fiscal, indice) => (
            <li key={fiscal.id ?? indice} className="flex gap-2 text-[11px]">
              <span className="w-4 font-bold text-slate-500">{indice + 1}.</span>
              <span className="font-semibold">{fiscal.nome}</span>
              <span className="text-slate-600">{fiscal.contato || 'sem contato informado'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-slate-500">Nenhum fiscal informado.</p>
      )}

      {/* ----------------------------------------------------------- 5. Valor */}
      <Secao numero="5" titulo="Valor do contrato" />
      <div className="mt-3 flex items-end justify-between gap-4 rounded border border-slate-400 bg-slate-100 px-3 py-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Valor aplicado (vigente)
          </p>
          <p className="text-[10px] font-medium text-slate-600">
            Base: {revisoes.length > 0 ? revisoes[revisoes.length - 1].rotulo || rotuloRevisao(revisoes[revisoes.length - 1].numero_revisao) : 'proposta original'}
          </p>
        </div>
        <p className="text-[17px] font-black">{formatarMoeda(obra.valor)}</p>
      </div>

      {revisoes.length > 0 ? (
        <table className="mt-3 w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1 text-left font-bold uppercase tracking-wide">
                Rev
              </th>
              <th className="border border-slate-300 px-2 py-1 text-left font-bold uppercase tracking-wide">
                Valor
              </th>
              <th className="border border-slate-300 px-2 py-1 text-left font-bold uppercase tracking-wide">
                Data
              </th>
              <th className="border border-slate-300 px-2 py-1 text-left font-bold uppercase tracking-wide">
                Justificativa
              </th>
            </tr>
          </thead>
          <tbody>
            {revisoes.map((revisao) => (
              <tr key={revisao.id}>
                <td className="border border-slate-300 px-2 py-1 font-semibold">
                  {revisao.rotulo || rotuloRevisao(revisao.numero_revisao)}
                </td>
                <td className="border border-slate-300 px-2 py-1">{formatarMoeda(revisao.valor)}</td>
                <td className="border border-slate-300 px-2 py-1">{formatarData(revisao.created_at)}</td>
                <td className="border border-slate-300 px-2 py-1">{revisao.observacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {/* ----------------------------------------------------- 6. Observações */}
      <Secao numero="6" titulo="Observações e condicionantes" />
      <p className="mt-3 min-h-[48px] whitespace-pre-line border border-slate-300 px-3 py-2 text-[11px] leading-relaxed">
        {obra.observacoes || 'Sem observações registradas.'}
      </p>

      {/* ------------------------------------------------------ 7. Assinaturas */}
      <Secao numero="7" titulo="Aprovações" />
      <div className="mt-10 grid grid-cols-2 gap-10">
        {['Técnico Planejador', 'Gestor / Supervisor'].map((papel) => (
          <div key={papel} className="text-center">
            <div className="border-t border-slate-900 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wide">{papel}</p>
              <p className="text-[9px] text-slate-500">Assinatura e matrícula</p>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-8 border-t border-slate-300 pt-2 text-[8px] font-medium uppercase tracking-[0.1em] text-slate-500">
        Documento gerado pelo Synapse em {formatarDataHora(geradoEm)} · Obra #{obra.id} · Orçamento #
        {obra.orcamento_id}
      </footer>
    </div>
  );
}
