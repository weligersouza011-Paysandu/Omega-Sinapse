import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatarMoeda } from '../../utils/formatters.js';
import { ROTULO_CATEGORIA, ROTULO_UNIDADE, decimalBr } from './qqpRotulos.js';

const SEM_NOME = '(sem nome)';

function Alternador({ aberto, onClick, children, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={aberto} className={`flex min-w-0 items-center gap-1.5 text-left ${className}`}>
      {aberto ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * Árvore do QQP: Categoria › Grupo › Subgrupo › itens, com o total (quantidade × preço)
 * de cada nível. `filtro` restringe aos itens cujo código/descrição contém o texto.
 */
export default function ArvoreQqp({ arvore, filtro, podeGerir, ocupadoId, onAdicionar, onEditar, onExcluir, onAlternarAtivo }) {
  const [fechados, setFechados] = useState(() => new Set());
  const alternar = (chave) =>
    setFechados((anterior) => {
      const novo = new Set(anterior);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  const termo = filtro.trim().toLowerCase();
  const casa = (item) => !termo || item.codigo.toLowerCase().includes(termo) || item.descricao.toLowerCase().includes(termo);

  const visiveis = arvore
    .map((categoria) => ({
      ...categoria,
      grupos: categoria.grupos
        .map((grupo) => ({
          ...grupo,
          subgrupos: grupo.subgrupos.map((sub) => ({ ...sub, itens: sub.itens.filter(casa) })).filter((sub) => sub.itens.length),
        }))
        .filter((grupo) => grupo.subgrupos.length),
    }))
    .filter((categoria) => categoria.grupos.length);

  if (!visiveis.length) {
    return <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Nenhum item encontrado.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {['Código', 'Descrição', 'Unid.', 'Cobrança', 'Quantidade', 'Valor unitário', 'Total', 'Em uso', 'Situação', ''].map((titulo) => (
              <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</th>
            ))}
          </tr>
        </thead>
        {visiveis.map((categoria) => {
          const chaveCat = categoria.categoria;
          const catAberta = !fechados.has(chaveCat) || Boolean(termo);
          return (
            <tbody key={chaveCat} className="divide-y divide-slate-100 border-t border-slate-200">
              <tr className="bg-omega-50">
                <td colSpan={6} className="px-3 py-2 font-bold text-omega-800">
                  <Alternador aberto={catAberta} onClick={() => alternar(chaveCat)}>{categoria.categoria || SEM_NOME}</Alternador>
                </td>
                <td colSpan={4} className="whitespace-nowrap px-3 py-2 font-bold tabular-nums text-omega-800">{formatarMoeda(categoria.total)}</td>
              </tr>
              {catAberta
                ? categoria.grupos.map((grupo) => {
                    const chaveGrupo = `${chaveCat}›${grupo.grupo}`;
                    const grupoAberto = !fechados.has(chaveGrupo) || Boolean(termo);
                    return [
                      <tr key={chaveGrupo} className="bg-slate-50">
                        <td colSpan={6} className="py-1.5 pl-7 pr-3 font-semibold text-slate-700">
                          <Alternador aberto={grupoAberto} onClick={() => alternar(chaveGrupo)}>{grupo.grupo || SEM_NOME}</Alternador>
                        </td>
                        <td colSpan={4} className="whitespace-nowrap px-3 py-1.5 font-semibold tabular-nums text-slate-700">{formatarMoeda(grupo.total)}</td>
                      </tr>,
                      ...(grupoAberto
                        ? grupo.subgrupos.flatMap((sub) => {
                            const chaveSub = `${chaveGrupo}›${sub.subgrupo}`;
                            const subAberto = !fechados.has(chaveSub) || Boolean(termo);
                            return [
                              <tr key={chaveSub} className="bg-white">
                                <td colSpan={6} className="py-1.5 pl-12 pr-3 text-[13px] font-medium text-slate-600">
                                  <div className="flex items-center gap-2">
                                    <Alternador aberto={subAberto} onClick={() => alternar(chaveSub)}>{sub.subgrupo || SEM_NOME}</Alternador>
                                    {podeGerir ? (
                                      <button
                                        type="button"
                                        className="inline-flex shrink-0 items-center gap-1 rounded border border-dashed border-omega-300 px-1.5 py-0.5 text-[11px] font-semibold text-omega-700 hover:bg-omega-50"
                                        onClick={() => onAdicionar({ categoria_planilha: categoria.categoria, grupo: grupo.grupo, subgrupo: sub.subgrupo })}
                                        title="Adicionar item neste subgrupo"
                                      >
                                        <Plus className="h-3 w-3" aria-hidden="true" />
                                        item
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                                <td colSpan={4} className="whitespace-nowrap px-3 py-1.5 text-[13px] font-medium tabular-nums text-slate-600">{formatarMoeda(sub.total)}</td>
                              </tr>,
                              ...(subAberto
                                ? sub.itens.map((item) => (
                                    <tr key={item.id} className={item.ativo ? '' : 'bg-slate-50/70 text-slate-400'}>
                                      <td className="whitespace-nowrap py-2 pl-16 pr-3 font-semibold text-omega-700">{item.codigo}</td>
                                      <td className="min-w-[16rem] px-3 py-2">
                                        {item.descricao}
                                        <span className="ml-1.5 text-[11px] text-slate-400">{ROTULO_CATEGORIA[item.categoria]}</span>
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2">{item.unidade_planilha || '—'}</td>
                                      <td className="whitespace-nowrap px-3 py-2">por {ROTULO_UNIDADE[item.unidade]}</td>
                                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.quantidade === null ? '—' : decimalBr(item.quantidade)}</td>
                                      <td className="whitespace-nowrap px-3 py-2 tabular-nums" title={`R$ ${decimalBr(item.preco_unitario_exato)}`}>{formatarMoeda(item.preco_unitario)}</td>
                                      <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums">{item.total === null ? '—' : formatarMoeda(item.total)}</td>
                                      <td className="whitespace-nowrap px-3 py-2 tabular-nums" title="Recursos de obra / projeções de BMM">
                                        {item.recursos_em_uso}/{item.projecoes_em_uso}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2">
                                        {podeGerir ? (
                                          <button
                                            type="button"
                                            role="switch"
                                            aria-checked={item.ativo}
                                            aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.codigo}`}
                                            onClick={() => onAlternarAtivo(item)}
                                            disabled={ocupadoId === item.id}
                                            className={`relative h-5 w-9 rounded-full transition ${item.ativo ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-60`}
                                          >
                                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${item.ativo ? 'left-[1.1rem]' : 'left-0.5'}`} />
                                          </button>
                                        ) : (
                                          <span className="text-xs font-semibold">{item.ativo ? 'Ativo' : 'Inativo'}</span>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right">
                                        {podeGerir ? (
                                          <div className="inline-flex gap-1.5">
                                            <button type="button" className="btn-neutro !px-2 !py-1" onClick={() => onEditar(item)} aria-label={`Editar ${item.codigo}`} title="Editar">
                                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-neutro !px-2 !py-1 hover:!border-red-300 hover:!text-red-600"
                                              onClick={() => onExcluir(item)}
                                              disabled={ocupadoId === item.id}
                                              aria-label={`Excluir ${item.codigo}`}
                                              title={item.recursos_em_uso + item.projecoes_em_uso > 0 ? 'Em uso: desative em vez de excluir' : 'Excluir'}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))
                                : []),
                            ];
                          })
                        : []),
                    ];
                  })
                : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
