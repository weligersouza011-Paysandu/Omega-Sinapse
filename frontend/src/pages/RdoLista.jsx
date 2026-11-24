import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, Settings2 } from 'lucide-react';
import CadastrosRdo from '../components/rdo/CadastrosRdo.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { listarRdos } from '../services/rdoApi.js';
import { formatarData } from '../utils/formatters.js';
import { PERFIS_CADASTRO, PERFIS_CAMPO, PERFIS_VALIDADORES, STATUS_RDO } from '../utils/rdo.js';

const LIMITE = 20;

export function SeloStatusRdo({ status }) {
  const s = STATUS_RDO[status] || { label: status, cor: 'bg-slate-100 text-slate-700 border-slate-300' };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${s.cor}`}>{s.label}</span>;
}

/** Lista de RDOs: o encarregado vê os seus; o planejamento vê os da sua carteira (padrão: aguardando validação). */
export default function RdoLista() {
  const { usuario } = useAuth();
  const ehValidador = PERFIS_VALIDADORES.includes(usuario?.perfil);
  const [aba, setAba] = useState('rdos');
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
  }, [status, dataDe, dataAte]);

  useEffect(() => {
    carregar(0);
  }, [carregar]);

  const podeLancar = PERFIS_CAMPO.includes(usuario?.perfil);
  const podeCadastrar = PERFIS_CADASTRO.includes(usuario?.perfil);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button type="button" className={`rounded-md px-3 py-1.5 text-sm font-semibold ${aba === 'rdos' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`} onClick={() => setAba('rdos')}>
            <ClipboardList className="mr-1 inline h-4 w-4" aria-hidden="true" /> RDOs
          </button>
          {podeCadastrar ? (
            <button type="button" className={`rounded-md px-3 py-1.5 text-sm font-semibold ${aba === 'cadastros' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`} onClick={() => setAba('cadastros')}>
              <Settings2 className="mr-1 inline h-4 w-4" aria-hidden="true" /> Cadastros
            </button>
          ) : null}
        </div>
        {podeLancar && aba === 'rdos' ? (
          <Link to="/rdo/novo" className="btn-primario">
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo RDO
          </Link>
        ) : null}
      </div>

      {aba === 'cadastros' ? (
        <CadastrosRdo />
      ) : (
        <>
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

          {erro ? <div className="card p-4 text-sm text-red-700">{erro}</div> : null}

          <div className="space-y-2">
            {itens.map((r) => (
              <Link key={r.id} to={`/rdo/${r.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-3 transition hover:border-omega-300 hover:shadow">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">RDO nº {r.id} · {formatarData(r.data)}</p>
                  <p className="text-xs text-slate-500">{r.encarregado?.nome} · {r._count?.atividades ?? 0} atividade(s)</p>
                </div>
                <SeloStatusRdo status={r.status} />
              </Link>
            ))}
            {!carregando && itens.length === 0 && !erro ? (
              <div className="card p-8 text-center text-sm text-slate-500">
                {ehValidador && status === 'FINALIZADO' ? 'Nenhum RDO aguardando validação.' : 'Nenhum RDO encontrado.'}
              </div>
            ) : null}
            {carregando ? <div className="flex justify-center py-6"><Spinner /></div> : null}
          </div>

          {!carregando && itens.length < total ? (
            <div className="flex justify-center">
              <button type="button" className="btn-neutro" onClick={() => carregar(itens.length)}>Carregar mais ({total - itens.length})</button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
