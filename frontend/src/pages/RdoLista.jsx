import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Camera, ClipboardList, Settings2 } from 'lucide-react';
import CadastrosRdo from '../components/rdo/CadastrosRdo.jsx';
import GaleriaFotos from '../components/rdo/GaleriaFotos.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { listarFotosRdo, listarRdos, obterObrasRdo } from '../services/rdoApi.js';
import { formatarData } from '../utils/formatters.js';
import { PERFIS_CADASTRO, PERFIS_VALIDADORES, STATUS_RDO } from '../utils/rdo.js';

const LIMITE = 20;
const LIMITE_FOTOS = 60;

export function SeloStatusRdo({ status }) {
  const s = STATUS_RDO[status] || { label: status, cor: 'bg-slate-100 text-slate-700 border-slate-300' };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${s.cor}`}>{s.label}</span>;
}

/** Filtros de obra, situação e período compartilhados pelas abas RDOs e Fotos. */
function Filtros({ obras, obraId, setObraId, status, setStatus, dataDe, setDataDe, dataAte, setDataAte, comStatus = true }) {
  return (
    <div className="card grid grid-cols-1 gap-3 p-3 sm:grid-cols-4">
      <div>
        <label className="rotulo">Obra</label>
        <select className="campo" value={obraId} onChange={(e) => setObraId(e.target.value)}>
          <option value="">Todas</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.ss || `Obra ${o.id}`} · {o.descricao?.slice(0, 40) || o.pep}</option>)}
        </select>
      </div>
      {comStatus ? (
        <div>
          <label className="rotulo">Situação</label>
          <select className="campo" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS_RDO).map(([valor, { label }]) => <option key={valor} value={valor}>{label}</option>)}
          </select>
        </div>
      ) : null}
      <div>
        <label className="rotulo">De</label>
        <input type="date" className="campo" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
      </div>
      <div>
        <label className="rotulo">Até</label>
        <input type="date" className="campo" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
      </div>
    </div>
  );
}

/** Visão do encarregado: as obras em andamento a que está vinculado. O RDO nasce de dentro da obra. */
function MinhasObras() {
  const [obras, setObras] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    obterObrasRdo().then(setObras).catch((err) => setErro(err.message));
  }, []);

  if (erro) return <div className="card p-4 text-sm text-red-700">{erro}</div>;
  if (!obras) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-800">Minhas obras em andamento</h2>
        <p className="text-sm text-slate-500">Toque na obra para ver os RDOs dela e lançar o de hoje.</p>
      </div>
      {obras.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Nenhuma obra em andamento vinculada a você. Peça ao planejamento para vincular.</div>
      ) : null}
      {obras.map((o) => (
        <Link key={o.id} to={`/rdo/obra/${o.id}`} className="card flex items-center gap-3 p-4 transition hover:border-omega-300 hover:shadow">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-omega-600/10 text-omega-700"><Building2 className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-800">{o.ss || `Obra ${o.id}`}{o.pep ? ` · PEP ${o.pep}` : ''}</span>
            <span className="block truncate text-sm text-slate-500">{o.descricao}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function AbaRdos({ obras }) {
  const ehValidador = true;
  const [obraId, setObraId] = useState('');
  const [status, setStatus] = useState(ehValidador ? 'FINALIZADO' : '');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async (deslocamento = 0) => {
    setCarregando(true);
    setErro(null);
    try {
      const params = { limite: LIMITE, deslocamento };
      if (obraId) params.obra_id = obraId;
      if (status) params.status = status;
      if (dataDe) params.data_de = dataDe;
      if (dataAte) params.data_ate = dataAte;
      const resposta = await listarRdos(params);
      setTotal(resposta.total);
      setItens((atual) => (deslocamento ? [...atual, ...resposta.itens] : resposta.itens));
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [obraId, status, dataDe, dataAte]);

  useEffect(() => {
    carregar(0);
  }, [carregar]);

  return (
    <div className="space-y-3">
      <Filtros obras={obras} obraId={obraId} setObraId={setObraId} status={status} setStatus={setStatus} dataDe={dataDe} setDataDe={setDataDe} dataAte={dataAte} setDataAte={setDataAte} />
      {erro ? <div className="card p-4 text-sm text-red-700">{erro}</div> : null}
      <div className="space-y-2">
        {itens.map((r) => (
          <Link key={r.id} to={`/rdo/${r.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-3 transition hover:border-omega-300 hover:shadow">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">{r.obra?.orcamento?.ss || `Obra ${r.obra_id}`} · {formatarData(r.data)} · RDO nº {r.id}</p>
              <p className="text-xs text-slate-500">Encarregado {r.encarregado?.nome} · Supervisor {r.supervisor?.nome || '—'} · {r._count?.atividades ?? 0} atividade(s)</p>
            </div>
            <SeloStatusRdo status={r.status} />
          </Link>
        ))}
        {!carregando && itens.length === 0 && !erro ? (
          <div className="card p-8 text-center text-sm text-slate-500">{status === 'FINALIZADO' ? 'Nenhum RDO aguardando validação.' : 'Nenhum RDO encontrado.'}</div>
        ) : null}
        {carregando ? <div className="flex justify-center py-6"><Spinner /></div> : null}
      </div>
      {!carregando && itens.length < total ? (
        <div className="flex justify-center"><button type="button" className="btn-neutro" onClick={() => carregar(itens.length)}>Carregar mais ({total - itens.length})</button></div>
      ) : null}
    </div>
  );
}

/** Controle de fotos: todas as fotos de evidência dos RDOs, com obra, atividade e filtros. */
function AbaFotos({ obras }) {
  const [obraId, setObraId] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async (deslocamento = 0) => {
    setCarregando(true);
    setErro(null);
    try {
      const params = { limite: LIMITE_FOTOS, deslocamento };
      if (obraId) params.obra_id = obraId;
      if (dataDe) params.data_de = dataDe;
      if (dataAte) params.data_ate = dataAte;
      const resposta = await listarFotosRdo(params);
      setTotal(resposta.total);
      setItens((atual) => (deslocamento ? [...atual, ...resposta.itens] : resposta.itens));
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [obraId, dataDe, dataAte]);

  useEffect(() => {
    carregar(0);
  }, [carregar]);

  // Agrupa por obra e dia para a galeria ficar organizada.
  const grupos = [];
  itens.forEach((f) => {
    const chave = `${f.obra.id}|${String(f.data).slice(0, 10)}`;
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, obra: f.obra, data: f.data, fotos: [] };
      grupos.push(grupo);
    }
    grupo.fotos.push(f);
  });

  return (
    <div className="space-y-3">
      <Filtros comStatus={false} obras={obras} obraId={obraId} setObraId={setObraId} dataDe={dataDe} setDataDe={setDataDe} dataAte={dataAte} setDataAte={setDataAte} />
      {erro ? <div className="card p-4 text-sm text-red-700">{erro}</div> : null}
      {grupos.map((g) => (
        <section key={g.chave} className="card p-3">
          <p className="mb-2 text-sm font-bold text-slate-800">{g.obra.ss || `Obra ${g.obra.id}`} · {formatarData(g.data)} <span className="font-normal text-slate-500">· {g.fotos.length} foto(s)</span></p>
          <GaleriaFotos fotos={g.fotos} tamanho="h-24 w-24" />
        </section>
      ))}
      {!carregando && itens.length === 0 && !erro ? <div className="card p-8 text-center text-sm text-slate-500">Nenhuma foto encontrada.</div> : null}
      {carregando ? <div className="flex justify-center py-6"><Spinner /></div> : null}
      {!carregando && itens.length < total ? (
        <div className="flex justify-center"><button type="button" className="btn-neutro" onClick={() => carregar(itens.length)}>Carregar mais ({total - itens.length})</button></div>
      ) : null}
    </div>
  );
}

/**
 * Módulo RDO. Encarregado: "Minhas obras em andamento". Planejamento/gestão: visão geral de todas as
 * obras — RDOs (padrão: aguardando validação), controle de fotos e cadastros.
 */
export default function RdoLista() {
  const { usuario } = useAuth();
  const [aba, setAba] = useState('rdos');
  const [obras, setObras] = useState([]);
  const ehEncarregado = usuario?.perfil === 'ENCARREGADO';
  const podeCadastrar = PERFIS_CADASTRO.includes(usuario?.perfil);

  useEffect(() => {
    if (!ehEncarregado && PERFIS_VALIDADORES.includes(usuario?.perfil)) obterObrasRdo().then(setObras).catch(() => setObras([]));
  }, [ehEncarregado, usuario?.perfil]);

  if (ehEncarregado) return <MinhasObras />;

  const abas = [
    ['rdos', 'RDOs', ClipboardList],
    ['fotos', 'Fotos', Camera],
    ...(podeCadastrar ? [['cadastros', 'Cadastros', Settings2]] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {abas.map(([id, rotulo, Icone]) => (
          <button key={id} type="button" className={`rounded-md px-3 py-1.5 text-sm font-semibold ${aba === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => setAba(id)}>
            <Icone className="mr-1 inline h-4 w-4" aria-hidden="true" /> {rotulo}
          </button>
        ))}
      </div>
      {aba === 'rdos' ? <AbaRdos obras={obras} /> : null}
      {aba === 'fotos' ? <AbaFotos obras={obras} /> : null}
      {aba === 'cadastros' ? <CadastrosRdo /> : null}
    </div>
  );
}
