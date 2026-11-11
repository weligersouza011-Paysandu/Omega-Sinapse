import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, ClipboardList, Loader2, MapPin, ReceiptText } from 'lucide-react';
import MapaObraVisaoGeral from './MapaObraVisaoGeral.jsx';
import CategoriaObraBadge from '../CategoriaObraBadge.jsx';
import StatusBadge from '../StatusBadge.jsx';
import { obterMedicaoObra } from '../../hooks/useMedicao.js';
import { formatarData, formatarDataHora, formatarMoeda, formatarPercentual } from '../../utils/formatters.js';
import { resumirOrcamento } from '../../utils/financeiroObra.js';

function Metadado({ rotulo, valor, destaque = false, largo = false, children }) {
  return (
    <div className={`min-w-0 ${largo ? 'col-span-2' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className={`text-sm ${largo ? '' : 'truncate'} ${destaque ? 'font-bold text-slate-800' : 'font-semibold text-slate-700'}`}>
        {children ?? (valor || '—')}
      </dd>
    </div>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
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

function CartaoValor({ rotulo, valor, detalhe, tom = 'text-slate-800', children }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tom}`}>{valor}</p>
      {children}
      {detalhe ? <p className="mt-0.5 text-[11px] text-slate-500">{detalhe}</p> : null}
    </div>
  );
}

/**
 * Aba "Visão Geral" do detalhamento da obra.
 *
 * Cards financeiros (base, aditivos, vigente e saldo) e cards de avanço pela MEDIÇÃO REAL: só os
 * boletins (BMM) aprovados com itens desta SS contam — nenhuma projeção do cronograma entra aqui.
 * Abaixo, o mapa e os dados cadastrais do projeto.
 */
export default function AbaVisaoGeral({ obra, podeEditar, onIrParaAba }) {
  const localizacoes = obra.localizacoes || [];
  const comCoordenadas = localizacoes.filter((item) => item.latitude != null && item.longitude != null);
  const equipe = obra.planejadores?.length
    ? obra.planejadores
    : obra.planejador_nome
      ? [{ id: obra.planejador_id, nome: obra.planejador_nome }]
      : [];
  const fiscais = obra.fiscais || [];

  const orcamento = resumirOrcamento(obra.revisoes, obra.valor);

  // Medição real da obra: itens desta SS nos boletins de medição do contrato.
  const [medicao, setMedicao] = useState(null);
  const [carregandoMedicao, setCarregandoMedicao] = useState(true);
  const [erroMedicao, setErroMedicao] = useState(null);
  useEffect(() => {
    let ativo = true;
    setCarregandoMedicao(true);
    obterMedicaoObra(obra.id)
      .then((dados) => {
        if (ativo) {
          setMedicao(dados);
          setErroMedicao(null);
        }
      })
      .catch((err) => ativo && setErroMedicao(err.message))
      .finally(() => ativo && setCarregandoMedicao(false));
    return () => {
      ativo = false;
    };
  }, [obra.id]);

  const resumo = medicao?.resumo;
  const medidoAprovado = Number(resumo?.medido_aprovado) || 0;
  const emAnalise = Number(resumo?.em_analise) || 0;
  const saldo = orcamento.vigente - medidoAprovado;
  const avancoMedido = orcamento.vigente > 0 ? (medidoAprovado / orcamento.vigente) * 100 : null;
  const boletinsAprovados = (medicao?.boletins || []).filter((boletim) => boletim.status === 'APROVADO');
  const ultimoAprovado = boletinsAprovados[boletinsAprovados.length - 1] || null;
  const textoMedicao = carregandoMedicao && !medicao ? '…' : null;

  return (
    <div className="space-y-4">
      {/* -------------------------------------------- Resumo financeiro */}
      <section aria-label="Resumo financeiro" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoValor rotulo="Valor base" valor={formatarMoeda(orcamento.base)} detalhe={`Revisão base: ${orcamento.revisaoBase}`} />
        <CartaoValor
          rotulo="Aditivos aprovados"
          valor={`+ ${formatarMoeda(orcamento.aditivos)}`}
          detalhe={`${orcamento.quantidadeAditivos} aditivo(s) após a revisão base`}
          tom="text-violet-700"
        />
        <CartaoValor
          rotulo="Revisão vigente"
          valor={formatarMoeda(orcamento.vigente)}
          detalhe={orcamento.pendentes > 0 ? `${orcamento.pendentes} revisão(ões) aguardando aprovação` : 'Valor contratado atual'}
          tom="text-omega-700"
        />
        <CartaoValor
          rotulo="Saldo a medir"
          valor={textoMedicao ?? formatarMoeda(saldo)}
          detalhe="Vigente − medido aprovado nos boletins"
          tom={saldo < 0 ? 'text-red-700' : 'text-slate-800'}
        />
      </section>

      {/* -------------------------------------- Avanço pela medição real */}
      <section aria-label="Avanço pela medição real" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <ReceiptText className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Avanço pela medição real
          </h2>
          {onIrParaAba ? (
            <button type="button" className="text-xs font-bold text-omega-700 hover:underline" onClick={() => onIrParaAba('medicao')}>
              Ver boletins da obra
            </button>
          ) : null}
        </div>

        {erroMedicao ? <div className="card px-4 py-3 text-sm text-red-700">{erroMedicao}</div> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CartaoValor
            rotulo="Avanço medido"
            valor={textoMedicao ?? (avancoMedido === null ? '—' : formatarPercentual(avancoMedido, 1))}
            detalhe="Medido aprovado ÷ revisão vigente"
            tom="text-emerald-700"
          >
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, avancoMedido || 0))}%` }}
              />
            </div>
          </CartaoValor>
          <CartaoValor
            rotulo="Medido aprovado"
            valor={textoMedicao ?? formatarMoeda(medidoAprovado)}
            detalhe={`${boletinsAprovados.length} boletim(ns) aprovado(s) com itens desta SS`}
          />
          <CartaoValor
            rotulo="Em análise"
            valor={textoMedicao ?? formatarMoeda(emAnalise)}
            detalhe="Lançado em boletim ainda não aprovado (fora do acumulado)"
            tom={emAnalise > 0 ? 'text-amber-700' : 'text-slate-800'}
          />
          <CartaoValor
            rotulo="Último boletim aprovado"
            valor={textoMedicao ?? (ultimoAprovado?.numero_bmm || '—')}
            detalhe={
              ultimoAprovado
                ? `Ciclo ${formatarData(ultimoAprovado.ciclo_inicio)} a ${formatarData(ultimoAprovado.ciclo_fim)} · ${formatarMoeda(ultimoAprovado.valor)}`
                : 'Nenhum boletim aprovado para esta SS'
            }
          />
        </div>
        {carregandoMedicao && !medicao ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Carregando boletins de medição…
          </p>
        ) : null}
      </section>

      {/* ------------------------------------ Localização + dados do projeto */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card overflow-hidden xl:col-span-3">
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
              <button type="button" className="text-xs font-bold text-omega-700 hover:underline" onClick={() => onIrParaAba('configuracao')}>
                Gerenciar localizações
              </button>
            ) : null}
          </header>

          {comCoordenadas.length > 0 ? (
            <MapaObraVisaoGeral localizacoes={localizacoes} altura="h-[34rem]" />
          ) : (
            <div className="flex h-[34rem] flex-col items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-6 text-center">
              <MapPin className="h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">Nenhuma localização com coordenadas</p>
              <p className="max-w-xs text-xs text-slate-500">
                Cadastre pontos ou trechos em <strong>Edição / Configuração</strong> para vê-los no mapa.
              </p>
            </div>
          )}
        </div>

        <div className="card space-y-4 p-4 xl:col-span-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <ClipboardList className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Dados do projeto
          </h2>

          <Grupo titulo="Identificação">
            <Metadado rotulo="SS" valor={obra.ss} destaque />
            <Metadado rotulo="PEP (CC)" valor={obra.pep} destaque />
            <Metadado rotulo="OSI" valor={obra.osi_numero || 'Pendente'} />
            <Metadado rotulo="ART" valor={obra.art} />
            <Metadado rotulo="Status da obra">
              <StatusBadge status={obra.status} />
            </Metadado>
            <Metadado rotulo="Categoria">
              <CategoriaObraBadge categoria={obra.categoria} />
            </Metadado>
            <Metadado rotulo="Descrição" valor={obra.descricao} largo />
          </Grupo>

          <Grupo titulo="Cliente e local">
            <Metadado rotulo="Cliente / Área" valor={obra.cliente} />
            <Metadado rotulo="Valor vigente" valor={formatarMoeda(orcamento.vigente)} />
            <Metadado rotulo="Endereço / local" valor={obra.endereco} largo />
          </Grupo>

          <Grupo titulo="Equipe">
            <Metadado rotulo="Planejador principal" valor={equipe[0]?.nome || 'Sem responsável'} />
            <Metadado rotulo="Planejador secundário" valor={equipe.slice(1).map((membro) => membro.nome).join(', ') || '—'} />
            <Metadado rotulo="Orçamentista" valor={obra.orcamentista_nome} />
            <Metadado rotulo={fiscais.length > 1 ? 'Fiscais' : 'Fiscal'}>
              {fiscais.length === 0 ? (
                '—'
              ) : (
                <span className="block space-y-0.5">
                  {fiscais.map((fiscal) => (
                    <span key={fiscal.id ?? fiscal.nome} className="block truncate" title={fiscal.contato || undefined}>
                      {fiscal.nome}
                      {fiscal.contato ? <span className="ml-1 text-xs font-normal text-slate-500">· {fiscal.contato}</span> : null}
                    </span>
                  ))}
                </span>
              )}
            </Metadado>
          </Grupo>

          <Grupo titulo="Datas">
            <Metadado
              rotulo="OSI emitida"
              valor={
                obra.osi_emitida_em
                  ? `${formatarDataHora(obra.osi_emitida_em)}${obra.osi_emitida_por_nome ? ` · ${obra.osi_emitida_por_nome}` : ''}`
                  : null
              }
            />
            <Metadado rotulo="Cadastro da obra" valor={obra.created_at ? formatarData(obra.created_at) : null} />
          </Grupo>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Documentação de partida</h3>
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
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Documentos de referência</p>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{obra.documentos_referencia || '—'}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
