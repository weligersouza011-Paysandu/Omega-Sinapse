import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AbaRdoObra from '../components/obras/AbaRdoObra.jsx';
import Spinner from '../components/Spinner.jsx';
import { obterObrasRdo } from '../services/rdoApi.js';

/**
 * RDOs de uma obra (rota do encarregado, que não abre o módulo Obras): cabeçalho da obra e o mesmo
 * resumo da aba RDO, com o botão "Novo RDO". Só aparecem obras do escopo do usuário.
 */
export default function RdoObra() {
  const { obraId } = useParams();
  const [obra, setObra] = useState(null);
  const [estado, setEstado] = useState('carregando');

  useEffect(() => {
    let ativo = true;
    obterObrasRdo()
      .then((lista) => {
        if (!ativo) return;
        const achada = lista.find((o) => String(o.id) === String(obraId));
        setObra(achada || null);
        setEstado(achada ? 'ok' : 'ausente');
      })
      .catch(() => ativo && setEstado('ausente'));
    return () => {
      ativo = false;
    };
  }, [obraId]);

  if (estado === 'carregando') return <div className="flex justify-center py-16"><Spinner tamanho="lg" /></div>;
  if (estado === 'ausente') {
    return (
      <div className="card mx-auto max-w-xl p-6 text-sm text-slate-700">
        Obra não encontrada, fora de andamento ou sem vínculo com você.
        <div className="mt-3"><Link to="/rdo" className="btn-neutro">Voltar</Link></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/rdo" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Minhas obras
      </Link>
      <div className="card border-l-4 border-l-omega-600 p-3">
        <p className="text-sm font-bold text-slate-800">{obra.ss || `Obra ${obra.id}`}{obra.pep ? ` · PEP ${obra.pep}` : ''}</p>
        <p className="text-sm text-slate-600">{obra.descricao}</p>
      </div>
      <AbaRdoObra obra={obra} podeEditar={false} />
    </div>
  );
}
