import { Fragment, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { obterComparativoProjecao, rotuloReferencia } from '../../hooks/useProjecaoBmm.js';
import { formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

const traco = <span className="text-slate-300">—</span>;
const moeda = (valor) => (valor === null || valor === undefined ? traco : formatarMoeda(valor));

function Sinal({ valor, children }) {
  if (valor === null || valor === undefined) return traco;
  return <span className={valor < 0 ? 'text-red-600' : 'text-emerald-700'}>{children ?? formatarMoeda(valor)}</span>;
}

/**
 * Projetado (Projeções de BMM) × Medido (boletins aprovados e em análise) por ciclo e obra,
 * com o custo planejado dos recursos do QQP (RecursoObraQqp) e as margens.
 */
export default function ComparativoProjecao({ contrato }) {
  const [obra, setObra] = useState('');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    obterComparativoProjecao(contrato.id, obra)
      .then((resposta) => ativo && setDados(resposta))
      .catch((err) => ativo && setErro(err.message || 'Não foi possível montar o comparativo.'))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [contrato.id, obra, versao]);

  const ciclos = dados?.ciclos || [];

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[16rem]">
          <label className="rotulo" htmlFor="comp-obra">Obra</label>
          <select id="comp-obra" className="campo" value={obra} onChange={(e) => setObra(e.target.value)}>
            <option value="">Todas</option>
            {(contrato.obras || []).map((o) => (
              <option key={o.id} value={o.id}>{[o.ss, o.descricao].filter(Boolean).join(' — ') || `Obra ${o.id}`}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-neutro" onClick={() => setVersao((v) => v + 1)} disabled={carregando}>
          {carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Atualizar
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Desvio = medido aprovado − projetado. Margem = receita − custo planejado dos recursos do QQP da obra no ciclo (dias úteis × quantidade × preço).
        Boletins recusados não entram.
      </p>

      {erro ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div> : null}

      {carregando && !dados ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spinner tamanho="md" className="text-omega-600" />
          Montando o comparativo…
        </div>
      ) : !ciclos.length ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Sem projeções nem medições por obra {obra ? 'para esta obra' : 'neste contrato'}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Obra (SS)', 'Projetado (BMM)', 'Medido aprovado', 'Em análise', 'Desvio', 'Custo planejado', 'Margem projetada', 'Margem medida'].map((t) => (
                  <th key={t} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ciclos.map((ciclo) => (
                <Fragment key={ciclo.referencia}>
                  <tr className="border-t border-slate-200 bg-omega-50/60 font-bold text-omega-800">
                    <td className="whitespace-nowrap px-3 py-2">{rotuloReferencia(ciclo.referencia)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{moeda(ciclo.totais.projetado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{moeda(ciclo.totais.medido_aprovado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{moeda(ciclo.totais.medido_em_analise)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums"><Sinal valor={ciclo.totais.desvio} /></td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{moeda(ciclo.totais.custo_planejado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums"><Sinal valor={ciclo.totais.margem_projetada} /></td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums"><Sinal valor={ciclo.totais.margem_medida} /></td>
                  </tr>
                  {ciclo.obras.map((linha) => (
                    <tr key={`${ciclo.referencia}-${linha.obra_id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 pl-6">
                        {linha.obra?.ss || `Obra ${linha.obra_id}`}
                        <span className="block max-w-[16rem] truncate text-xs text-slate-500">
                          {linha.bmms_medidos.length ? `Medido em ${linha.bmms_medidos.join(', ')}` : linha.obra?.descricao}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{moeda(linha.projetado)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{moeda(linha.medido_aprovado)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{moeda(linha.medido_em_analise)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        <Sinal valor={linha.desvio}>
                          {linha.desvio === null ? null : (
                            <>
                              {formatarMoeda(linha.desvio)}
                              {linha.desvio_percentual !== null ? <span className="ml-1 text-[11px]">({formatarPercentual(linha.desvio_percentual)})</span> : null}
                            </>
                          )}
                        </Sinal>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-orange-700">{moeda(linha.custo_planejado)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums"><Sinal valor={linha.margem_projetada} /></td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums"><Sinal valor={linha.margem_medida} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
