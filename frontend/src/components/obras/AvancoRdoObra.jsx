import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { obterAvancoRdoObra } from '../../services/rdoApi.js';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';

/** Avanço físico da obra com o que os RDOs aprovados já apuraram, ao lado do % do cronograma. */
export default function AvancoRdoObra({ obraId }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let ativo = true;
    obterAvancoRdoObra(obraId)
      .then((resposta) => ativo && setDados(resposta))
      .catch(() => ativo && setDados(null)); // complementar: falha não bloqueia a aba
    return () => {
      ativo = false;
    };
  }, [obraId]);

  if (!dados?.versao || !dados.atividades_com_rdo) return null;

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <h3 className="text-sm font-bold text-slate-800">Avanço apurado por RDO</h3>
        <span className="text-xs text-slate-500">
          {dados.atividades_com_rdo} de {dados.atividades_total} atividades · último RDO aprovado em {formatarData(dados.ultimo_rdo_aprovado_em)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Cronograma ({dados.versao.versao})</p>
          <p className="text-xl font-bold text-slate-800">{formatarPercentual(dados.percentual_cronograma)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Com RDOs aprovados</p>
          <p className="text-xl font-bold text-emerald-700">{formatarPercentual(dados.percentual_com_rdo)}</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {dados.atualizadas.map((a) => (
          <li key={a.codigo_atividade} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate text-slate-700">
              <span className="font-mono text-xs text-slate-500">{a.codigo_atividade}</span> {a.descricao}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              {formatarPercentual(a.percentual_cronograma)} → <strong className="text-emerald-700">{formatarPercentual(a.percentual_vigente)}</strong> · {formatarData(a.data)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
