import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ClipboardList, Clock, History, Plus, ShieldCheck, Timer, Users } from 'lucide-react';
import RelatoriosObra from './RelatoriosObra.jsx';
import GaleriaFotos from '../rdo/GaleriaFotos.jsx';
import Spinner from '../Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { obterResumoObraRdo } from '../../services/rdoApi.js';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';
import { PERFIS_CAMPO, STATUS_RDO, minutosParaTexto } from '../../utils/rdo.js';

const num = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function Indicador({ Icone, rotulo, valor, destaque = false }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'}`}>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Icone className="h-3.5 w-3.5" aria-hidden="true" />{rotulo}</p>
      <p className="mt-1 text-lg font-bold text-slate-800">{valor}</p>
    </div>
  );
}

function CartaoRdo({ r, aberto }) {
  const s = STATUS_RDO[r.status];
  const fotos = r.atividades.flatMap((a) => a.fotos.map((f) => ({ ...f, data: r.data, encarregado: r.encarregado, atividade: { codigo_atividade: a.codigo_atividade, descricao: a.descricao_snapshot } })));
  return (
    <details open={aberto} className="card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{formatarData(r.data)} · RDO nº {r.id}</p>
          <p className="text-xs text-slate-500">
            Encarregado {r.encarregado?.nome} · Supervisor {r.supervisor?.nome || '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{num(r.totais.pessoas)} {r.totais.pessoas === 1 ? "pessoa" : "pessoas"} · {num(r.totais.hh)} HH</span>
          {fotos.length ? <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" aria-hidden="true" />{fotos.length}</span> : null}
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${s.cor}`}>{s.label}</span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${r.pts_necessaria ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
            PTS: {r.pts_necessaria === null ? 'não informada' : r.pts_necessaria ? `necessária${r.totais.espera_pts_minutos ? ` · espera ${minutosParaTexto(r.totais.espera_pts_minutos)}` : ''}` : 'não necessária'}
          </span>
          {r.totais.desvios.total > 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Desvios: {num(r.totais.desvios.total)} h</span> : null}
          {r.dss_tema ? <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">DSS: {r.dss_tema}</span> : null}
        </div>

        {r.atividades.map((a) => {
          const concluida = !a.fora_de_escopo && Number(a.percentual_anterior) >= 100;
          return (
            <div key={a.id} className="rounded-md border border-slate-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {a.fora_de_escopo ? <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">FORA DE ESCOPO</span> : <span className="font-mono text-xs text-slate-500">{a.codigo_atividade} </span>}
                  {a.descricao_snapshot}
                </p>
                <p className="shrink-0 text-xs text-slate-500">
                  {a.fora_de_escopo ? `${num(a.hh)} HH` : concluida ? 'Concluída (100%)' : (
                    <>{formatarPercentual(a.percentual_anterior, 0)} → <strong className="text-emerald-700">{formatarPercentual(a.percentual_validado ?? a.percentual_declarado, 0)}</strong>{a.percentual_validado === null ? ' (declarado)' : ''} · {num(a.hh)} HH</>
                  )}
                </p>
              </div>
              {a.justificativa ? <p className="mt-1 text-xs text-amber-700">Justificativa: {a.justificativa}</p> : null}
              {a.fotos.length ? (
                <div className="mt-2">
                  <GaleriaFotos fotos={a.fotos.map((f) => ({ ...f, data: r.data, encarregado: r.encarregado, atividade: { codigo_atividade: a.codigo_atividade, descricao: a.descricao_snapshot } }))} />
                </div>
              ) : null}
            </div>
          );
        })}

        {r.comentario_geral ? <p className="text-sm text-slate-600"><strong>Comentário:</strong> {r.comentario_geral}</p> : null}
        {r.motivo_devolucao ? <p className="text-sm text-red-700"><strong>Devolvido:</strong> {r.motivo_devolucao}</p> : null}
        <div className="flex justify-end">
          <Link to={`/rdo/${r.id}`} className="text-sm font-semibold text-omega-700 hover:underline">Abrir RDO completo</Link>
        </div>
      </div>
    </details>
  );
}

/**
 * Aba RDO da obra: o resumo de todos os RDOs da obra (indicadores, um cartão por dia com atividades,
 * efetivo, PTS e fotos organizadas por atividade). O botão "Novo RDO" aparece para quem lança RDO,
 * e só com a obra em andamento. Os registros do RDO antigo ficam recolhidos no fim (`obra.relatorios`).
 */
export default function AbaRdoObra({ obra, podeEditar, onObraAtualizada }) {
  const { usuario } = useAuth();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [status, setStatus] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const params = {};
    if (status) params.status = status;
    if (dataDe) params.data_de = dataDe;
    if (dataAte) params.data_ate = dataAte;
    obterResumoObraRdo(obra.id, params)
      .then((resposta) => {
        if (!ativo) return;
        setDados(resposta);
        setErro(null);
      })
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [obra.id, status, dataDe, dataAte]);

  const podeLancar = PERFIS_CAMPO.includes(usuario?.perfil) && obra.status === 'EM_ANDAMENTO';
  const legado = (obra.relatorios?.length || 0) + (obra.ocorrencias?.length || 0) + (obra.comentarios?.length || 0) + (obra.midias?.length || 0);
  const ind = dados?.indicadores;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
          <ClipboardList className="h-5 w-5 text-omega-600" aria-hidden="true" /> RDOs da obra
        </h3>
        {podeLancar ? (
          <Link to={`/rdo/novo?obra=${obra.id}`} className="btn-primario">
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo RDO
          </Link>
        ) : null}
      </div>
      {PERFIS_CAMPO.includes(usuario?.perfil) && obra.status !== 'EM_ANDAMENTO' ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">O RDO só pode ser lançado em obra em andamento.</p>
      ) : null}

      {ind ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Indicador Icone={ClipboardList} rotulo="RDOs" valor={`${ind.rdos}${ind.aguardando_validacao ? ` (${ind.aguardando_validacao} p/ validar)` : ''}`} />
          <Indicador Icone={ShieldCheck} rotulo="Aprovados" valor={ind.aprovados} />
          <Indicador Icone={Users} rotulo="Homens-hora" valor={num(ind.hh)} />
          <Indicador Icone={Camera} rotulo="Fotos" valor={ind.fotos} />
          <Indicador Icone={Clock} rotulo="Desvios (h)" valor={num(ind.desvios_horas)} destaque={ind.desvios_horas > 0} />
          <Indicador Icone={Timer} rotulo="PTS necessárias" valor={ind.pts_necessarias} />
          <Indicador Icone={Timer} rotulo="Espera de PTS" valor={minutosParaTexto(ind.espera_pts_minutos).replace('aguardando liberação', '0h00')} destaque={ind.espera_pts_minutos > 0} />
        </div>
      ) : null}

      <div className="card grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div>
          <label className="rotulo">Situação</label>
          <select className="campo" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS_RDO).map(([valor, { label }]) => <option key={valor} value={valor}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo">De</label>
          <input type="date" className="campo" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </div>
        <div>
          <label className="rotulo">Até</label>
          <input type="date" className="campo" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>
      </div>

      {carregando ? <div className="flex justify-center py-6"><Spinner /></div> : null}
      {erro ? <p className="card p-4 text-sm text-red-700">{erro}</p> : null}
      {!carregando && !erro && dados?.itens.length === 0 ? <p className="card p-6 text-center text-sm text-slate-500">Nenhum RDO encontrado para esta obra.</p> : null}
      <div className="space-y-2">
        {(dados?.itens || []).map((r, i) => <CartaoRdo key={r.id} r={r} aberto={i === 0} />)}
      </div>
      {dados?.truncado ? <p className="text-xs text-slate-500">Mostrando os 100 RDOs mais recentes. Use os filtros de data para ver os anteriores.</p> : null}

      {legado > 0 ? (
        <details className="card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-slate-600">
            <History className="h-4 w-4" aria-hidden="true" /> Registros anteriores (RDO antigo · {legado})
          </summary>
          <div className="border-t border-slate-100 p-4">
            <RelatoriosObra obra={obra} podeEditar={podeEditar} onObraAtualizada={onObraAtualizada} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
