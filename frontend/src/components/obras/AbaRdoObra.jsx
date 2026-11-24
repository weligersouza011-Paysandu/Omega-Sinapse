import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, History } from 'lucide-react';
import RelatoriosObra from './RelatoriosObra.jsx';
import Spinner from '../Spinner.jsx';
import { SeloStatusRdo } from '../../pages/RdoLista.jsx';
import { listarRdos } from '../../services/rdoApi.js';
import { formatarData } from '../../utils/formatters.js';

/**
 * Aba RDO da obra: lista os RDOs do novo módulo que lançaram atividades nesta obra (cada um abre
 * a tela do RDO). Os registros do RDO antigo continuam acessíveis, recolhidos, em "Registros anteriores".
 */
export default function AbaRdoObra({ obra, podeEditar, onObraAtualizada }) {
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    listarRdos({ obra_id: obra.id, limite: 30 })
      .then((resposta) => {
        if (!ativo) return;
        setItens(resposta.itens);
        setTotal(resposta.total);
      })
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [obra.id]);

  const legado = (obra.relatorios?.length || 0) + (obra.ocorrencias?.length || 0) + (obra.comentarios?.length || 0) + (obra.midias?.length || 0);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <ClipboardList className="h-4 w-4 text-omega-600" aria-hidden="true" /> RDOs desta obra
          </h3>
          <Link to="/rdo" className="text-xs font-semibold text-omega-700 hover:underline">Abrir módulo RDO</Link>
        </div>
        {carregando ? <div className="flex justify-center py-4"><Spinner /></div> : null}
        {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
        {!carregando && !erro && itens.length === 0 ? <p className="text-sm text-slate-500">Nenhum RDO lançou atividades nesta obra ainda.</p> : null}
        <div className="divide-y divide-slate-100">
          {itens.map((r) => (
            <Link key={r.id} to={`/rdo/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-slate-50">
              <span className="text-sm text-slate-800">
                <strong>RDO nº {r.id}</strong> · {formatarData(r.data)} · {r.encarregado?.nome}
                <span className="text-xs text-slate-500"> · {r._count?.atividades ?? 0} atividade(s)</span>
              </span>
              <SeloStatusRdo status={r.status} />
            </Link>
          ))}
        </div>
        {total > itens.length ? <p className="mt-2 text-xs text-slate-500">Mostrando {itens.length} de {total}. Veja todos no módulo RDO.</p> : null}
      </section>

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
