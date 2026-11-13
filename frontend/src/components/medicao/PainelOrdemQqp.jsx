import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { chaveSubgrupos } from './qqpRotulos.js';

function mover(lista, indice, passo) {
  const destino = indice + passo;
  if (destino < 0 || destino >= lista.length) return lista;
  const nova = [...lista];
  [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
  return nova;
}

/** Ordem atual (a da árvore exibida) no formato salvo pela API. */
function ordemDaArvore(arvore) {
  return {
    categorias: arvore.map((c) => c.categoria),
    grupos: Object.fromEntries(arvore.map((c) => [c.categoria, c.grupos.map((g) => g.grupo)])),
    subgrupos: Object.fromEntries(
      arvore.flatMap((c) => c.grupos.map((g) => [chaveSubgrupos(c.categoria, g.grupo), g.subgrupos.map((s) => s.subgrupo)]))
    ),
  };
}

function Linha({ rotulo, indice, total, onMover, recuo = 0, forte = false }) {
  return (
    <li className="flex items-center gap-2 py-1" style={{ paddingLeft: recuo }}>
      <span className={`min-w-0 flex-1 truncate text-sm ${forte ? 'font-bold text-omega-800' : 'text-slate-700'}`}>{rotulo || '(sem nome)'}</span>
      <button type="button" className="btn-neutro !px-1.5 !py-0.5" onClick={() => onMover(indice, -1)} disabled={indice === 0} aria-label={`Subir ${rotulo}`}>
        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" className="btn-neutro !px-1.5 !py-0.5" onClick={() => onMover(indice, 1)} disabled={indice === total - 1} aria-label={`Descer ${rotulo}`}>
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Personalizar a ordem de categorias, grupos e subgrupos do QQP (vale para o contrato inteiro). */
export default function PainelOrdemQqp({ arvore, onSalvar, onFechar }) {
  const [ordem, setOrdem] = useState(() => ordemDaArvore(arvore));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar(ordem);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-lg border border-omega-100 bg-omega-50/50 p-4" aria-label="Personalizar visualização do QQP">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Personalizar visualização</p>
          <p className="mt-0.5 text-xs text-slate-500">A ordem vale para todas as telas, PDFs e TACs deste contrato.</p>
        </div>
        <button type="button" className="btn-neutro !px-2 !py-1" onClick={onFechar} aria-label="Fechar personalização" disabled={salvando}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 bg-white px-3">
        {ordem.categorias.map((categoria, ic) => (
          <li key={categoria} className="py-1">
            <ul>
              <Linha
                rotulo={categoria}
                indice={ic}
                total={ordem.categorias.length}
                forte
                onMover={(i, passo) => setOrdem((o) => ({ ...o, categorias: mover(o.categorias, i, passo) }))}
              />
              {(ordem.grupos[categoria] || []).map((grupo, ig, grupos) => (
                <li key={grupo}>
                  <ul>
                    <Linha
                      rotulo={grupo}
                      indice={ig}
                      total={grupos.length}
                      recuo={16}
                      onMover={(i, passo) => setOrdem((o) => ({ ...o, grupos: { ...o.grupos, [categoria]: mover(o.grupos[categoria], i, passo) } }))}
                    />
                    {(ordem.subgrupos[chaveSubgrupos(categoria, grupo)] || []).map((sub, is, subs) => (
                      <Linha
                        key={sub}
                        rotulo={sub}
                        indice={is}
                        total={subs.length}
                        recuo={32}
                        onMover={(i, passo) =>
                          setOrdem((o) => {
                            const chave = chaveSubgrupos(categoria, grupo);
                            return { ...o, subgrupos: { ...o.subgrupos, [chave]: mover(o.subgrupos[chave], i, passo) } };
                          })
                        }
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? <Spinner tamanho="sm" /> : null}
          Salvar ordem
        </button>
      </div>
    </section>
  );
}
