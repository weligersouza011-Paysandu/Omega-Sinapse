import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, CircleAlert, FileSpreadsheet, Loader2, MapPin } from 'lucide-react';
import { CurvaS, IndicadoresPrazo } from './AbaCronograma.jsx';
import MapaObraVisaoGeral from './MapaObraVisaoGeral.jsx';
import CategoriaObraBadge from '../CategoriaObraBadge.jsx';
import { obterCurvaS } from '../../services/cronogramaApi.js';
import { formatarDataHora, formatarMoeda } from '../../utils/formatters.js';
import { resumirOrcamento } from '../../utils/financeiroObra.js';


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
 * documentação de partida, resumo orçamentário, indicadores de prazo e a Curva S
 * (previsto × real × tendência) da revisão vigente do cronograma — os mesmos da
 * aba Cronograma.
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

  // Curva S e indicadores da revisão vigente (mesma fonte da aba Cronograma).
  const [curva, setCurva] = useState(null);
  const [carregandoCurva, setCarregandoCurva] = useState(true);
  const [erroCurva, setErroCurva] = useState(null);
  useEffect(() => {
    let ativo = true;
    setCarregandoCurva(true);
    obterCurvaS(obra.id)
      .then((dados) => {
        if (ativo) {
          setCurva(dados);
          setErroCurva(null);
        }
      })
      .catch((err) => ativo && setErroCurva(err.message))
      .finally(() => ativo && setCarregandoCurva(false));
    return () => {
      ativo = false;
    };
  }, [obra.id]);

  const realAcumulado = curva?.indicadores?.fisico?.real_acumulado ?? 0;
  const medidoAcumulado = (orcamento.vigente * realAcumulado) / 100;
  const semDados = curva && (curva.fonte === 'sem_dados' || !curva.pontos?.length);

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
            <MapaObraVisaoGeral localizacoes={localizacoes} altura="h-80" />
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
            <div className="col-span-2 min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Categoria da obra</dt>
              <dd className="mt-0.5">
                <CategoriaObraBadge categoria={obra.categoria} />
              </dd>
            </div>
          </dl>

          <h3 className="mb-2 mt-4 border-t border-slate-100 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Documentação de partida
          </h3>
          <ul className="space-y-2">
            <SituacaoDocumento
              rotulo="OSI assinada"
              ok={Boolean(obra.osi_anexo_url)}
              detalhe={
                obra.osi_anexo_url
                  ? `Anexada${obra.osi_anexada_em ? ` em ${formatarDataHora(obra.osi_anexada_em)}` : ''}${obra.osi_numero ? ` · nº ${obra.osi_numero}` : ''}`
                  : obra.osi_emitida_em
                    ? `Emitida em ${formatarDataHora(obra.osi_emitida_em)} — aguardando a via assinada.`
                    : 'Ainda não anexada.'
              }
              link={obra.osi_anexo_url}
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
          detalhe="Vigente − medido (estimado pelo avanço físico do cronograma)"
        />
      </section>

      {/* ------------------------------- Indicadores de prazo e Curva S */}
      {carregandoCurva && !curva ? (
        <div className="card flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando Curva S…
        </div>
      ) : null}

      {erroCurva ? <div className="card px-4 py-3 text-sm text-red-700">{erroCurva}</div> : null}

      {semDados ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
          <BarChart3 className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">Sem Curva S para esta obra</p>
          <p className="max-w-md text-xs text-slate-500">
            Importe o cronograma do MS Project na aba Cronograma para ver o previsto, o real e a tendência.
          </p>
          {podeEditar && onIrParaAba ? (
            <button type="button" className="btn-primario mt-1" onClick={() => onIrParaAba('cronograma')}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Ir para a aba Cronograma
            </button>
          ) : null}
        </div>
      ) : null}

      {curva && !semDados ? (
        <>
          <IndicadoresPrazo curva={curva} />
          <CurvaS curva={curva} />
        </>
      ) : null}
    </div>
  );
}
