import { lazy, Suspense } from 'react';
import { CheckCircle2, CircleAlert, Loader2, MapPin, Settings } from 'lucide-react';
import AvancoFisicoTabela from './AvancoFisicoTabela.jsx';
import CurvaSChart from './CurvaSChart.jsx';
import IndicadoresAvanco from './IndicadoresAvanco.jsx';
import { formatarDataHora, formatarMoeda } from '../../utils/formatters.js';
import { projetarFinanceiro, resumirOrcamento } from '../../utils/financeiroObra.js';

// Leaflet só é baixado quando a aba é aberta.
const MapaLocalizacoes = lazy(() => import('./MapaLocalizacoes.jsx'));

function Metadado({ rotulo, valor, destaque = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className={`truncate text-sm ${destaque ? 'font-bold text-slate-800' : 'font-semibold text-slate-700'}`}>
        {valor || '—'}
      </dd>
    </div>
  );
}

function SituacaoDocumento({ rotulo, ok, detalhe, link }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
      <div className="flex min-w-0 items-start gap-2">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700">{rotulo}</p>
          <p className="truncate text-[11px] text-slate-500">{detalhe}</p>
        </div>
      </div>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] font-bold text-omega-700 hover:underline">
          Ver
        </a>
      ) : (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {ok ? 'OK' : 'Pendente'}
        </span>
      )}
    </li>
  );
}

function CartaoValor({ rotulo, valor, detalhe, tom = 'text-slate-800' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

/**
 * Aba "Visão Geral" do detalhamento da obra: localização, dados do projeto e
 * documentação de partida, resumo orçamentário e avanço físico / Curva S.
 */
export default function AbaVisaoGeral({ obra, podeEditar, onIrParaAba }) {
  const localizacoes = obra.localizacoes || [];
  const comCoordenadas = localizacoes.filter((item) => item.latitude != null && item.longitude != null);
  const equipe = obra.planejadores?.length
    ? obra.planejadores
    : obra.planejador_nome
      ? [{ id: obra.planejador_id, nome: obra.planejador_nome }]
      : [];

  const orcamento = resumirOrcamento(obra.revisoes, obra.valor);
  const { medidoAcumulado } = projetarFinanceiro(obra.avanco_fisico, obra.valor);

  return (
    <div className="space-y-4">
      {/* ------------------------------------ Localização + dados do projeto */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="card overflow-hidden lg:col-span-3">
          <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <MapPin className="h-4 w-4 text-omega-600" aria-hidden="true" />
                Localização da obra
              </h2>
              <p className="text-xs text-slate-500">
                {localizacoes.length} ponto(s)/trecho(s) cadastrado(s)
                {comCoordenadas.length !== localizacoes.length ? ` · ${comCoordenadas.length} no mapa` : ''}
              </p>
            </div>
            {podeEditar ? (
              <button
                type="button"
                className="text-xs font-bold text-omega-700 hover:underline"
                onClick={() => onIrParaAba('configuracao')}
              >
                Gerenciar localizações
              </button>
            ) : null}
          </header>

          {comCoordenadas.length > 0 ? (
            <Suspense
              fallback={
                <div className="flex h-80 items-center justify-center gap-2 bg-slate-100 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Carregando mapa…
                </div>
              }
            >
              <MapaLocalizacoes localizacoes={localizacoes} altura="h-80" />
            </Suspense>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-6 text-center">
              <MapPin className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">Nenhuma localização com coordenadas</p>
              <p className="max-w-xs text-xs text-slate-500">
                Cadastre pontos ou trechos em <strong>Edição / Configuração</strong> para vê-los no mapa.
              </p>
            </div>
          )}
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold text-slate-800">Dados do projeto</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Metadado rotulo="SS" valor={obra.ss} destaque />
            <Metadado rotulo="PEP (CC)" valor={obra.pep} destaque />
            <Metadado rotulo="OSI" valor={obra.osi_numero || 'Pendente'} />
            <Metadado rotulo="Cliente / Área" valor={obra.cliente} />
            <Metadado rotulo="Planejador principal" valor={equipe[0]?.nome || 'Sem responsável'} />
            <Metadado rotulo="Planejador secundário" valor={equipe[1]?.nome || '—'} />
          </dl>

          <h3 className="mb-2 mt-4 border-t border-slate-100 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Documentação de partida
          </h3>
          <ul className="space-y-2">
            <SituacaoDocumento
              rotulo="Emissão da OSI"
              ok={Boolean(obra.osi_emitida_em)}
              detalhe={
                obra.osi_emitida_em
                  ? `${formatarDataHora(obra.osi_emitida_em)} · ${obra.osi_emitida_por_nome || 'sistema'}`
                  : 'Ainda não emitida.'
              }
            />
            <SituacaoDocumento
              rotulo="Ata de Reunião de Partida"
              ok={Boolean(obra.ata_partida_url)}
              detalhe={obra.ata_partida_url ? 'Documento anexado.' : 'Ainda não anexada.'}
              link={obra.ata_partida_url}
            />
          </ul>

          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Documentos de referência</p>
            <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-600">
              {obra.documentos_referencia || '—'}
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- Resumo orçamentário */}
      <section aria-label="Resumo orçamentário" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoValor
          rotulo="Valor base"
          valor={formatarMoeda(orcamento.base)}
          detalhe={`Revisão base: ${orcamento.revisaoBase}`}
        />
        <CartaoValor
          rotulo="Aditivos aprovados"
          valor={`+ ${formatarMoeda(orcamento.aditivos)}`}
          detalhe={`${orcamento.quantidadeAditivos} aditivo(s) após a revisão base`}
          tom="text-violet-700"
        />
        <CartaoValor
          rotulo="Revisão vigente"
          valor={formatarMoeda(orcamento.vigente)}
          detalhe={
            orcamento.pendentes > 0
              ? `${orcamento.pendentes} revisão(ões) aguardando aprovação`
              : 'Valor contratado atual'
          }
          tom="text-omega-700"
        />
        <CartaoValor
          rotulo="Saldo"
          valor={formatarMoeda(orcamento.vigente - medidoAcumulado)}
          detalhe="Vigente − medido (estimado pelo avanço físico)"
        />
      </section>

      {/* ---------------------------------------- Avanço físico e Curva S */}
      <IndicadoresAvanco resumo={obra.avanco_resumo} />

      <section className="card p-4">
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Curva S — Previsto x Real x Tendência</h2>
            <p className="text-xs text-slate-500">Avanço físico acumulado ao longo das semanas lançadas.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {obra.avanco_resumo?.semanas || 0} medição(ões)
          </span>
        </header>
        <CurvaSChart linhas={obra.avanco_fisico || []} />
      </section>

      <section className="card p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Avanço Físico Geral</h2>
            <p className="text-xs text-slate-500">Histórico de medições com previsão, linha de base e realizado.</p>
          </div>
          {podeEditar ? (
            <button type="button" className="btn-neutro" onClick={() => onIrParaAba('configuracao')}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Editar medições
            </button>
          ) : null}
        </header>
        <AvancoFisicoTabela linhas={obra.avanco_fisico || []} />
      </section>
    </div>
  );
}
