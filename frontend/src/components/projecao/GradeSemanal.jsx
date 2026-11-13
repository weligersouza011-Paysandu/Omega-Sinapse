import { Fragment } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatarMoeda } from '../../utils/formatters.js';
import { diaMes } from '../../hooks/useProjecaoBmm.js';
import { ROTULO_UNIDADE } from '../medicao/qqpRotulos.js';

const SEM_NOME = '(sem nome)';

/** Linha da grade → formato do payload da API (só semanas preenchidas; as omitidas valem zero). */
export function linhasParaPayload(linhas) {
  return linhas.map((linha) => ({
    item_qqp_id: linha.item_qqp_id,
    ...(linha.horas_dia !== undefined && linha.horas_dia !== '' ? { horas_dia: String(linha.horas_dia).replace(',', '.') } : {}),
    semanas: Object.entries(linha.semanas || {})
      .filter(([, v]) => String(v.dias ?? '').trim() !== '' || String(v.pessoas ?? '').trim() !== '')
      .map(([semana_inicio, v]) => ({
        semana_inicio,
        dias: String(v.dias ?? '').trim() === '' ? 0 : Number(v.dias),
        pessoas: String(v.pessoas ?? '').trim() === '' ? '0' : String(v.pessoas).replace(',', '.'),
      })),
  }));
}

/** Projeção gravada (ou rascunho da API) → linhas editáveis da grade. */
export function linhasDaProjecao(itens = []) {
  return itens.map((item) => ({
    item_qqp_id: item.item_qqp_id,
    horas_dia: item.horas_dia ?? '',
    semanas: Object.fromEntries(
      (item.semanas || []).map((s) => [s.semana_inicio, { dias: String(s.dias ?? ''), pessoas: String(s.pessoas ?? '') }])
    ),
  }));
}

function CampoNumero({ valor, onAlterar, desabilitado, rotulo, largura = 'w-12', passo = '1' }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step={passo}
      aria-label={rotulo}
      title={rotulo}
      value={valor ?? ''}
      disabled={desabilitado}
      onChange={(e) => onAlterar(e.target.value)}
      className={`${largura} rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-xs tabular-nums focus:border-omega-500 focus:outline-none focus:ring-1 focus:ring-omega-500 disabled:bg-slate-100 disabled:text-slate-400`}
    />
  );
}

/** Seletor de item do QQP (agrupado por Categoria › Grupo › Subgrupo), sem os já adicionados. */
export function SeletorItemQqp({ grupos, onEscolher, rotulo = 'Adicionar item do QQP…', compacto = false }) {
  const vazio = grupos.every((g) => !g.itens.length);
  return (
    <select
      aria-label={rotulo}
      className={compacto ? 'max-w-[14rem] rounded border border-dashed border-omega-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-omega-700' : 'campo'}
      value=""
      disabled={vazio}
      onChange={(e) => e.target.value && onEscolher(Number(e.target.value))}
    >
      <option value="">{vazio ? 'Todos os itens já foram adicionados' : rotulo}</option>
      {grupos
        .filter((g) => g.itens.length)
        .map((g) => (
          <optgroup key={g.chave} label={g.rotulo}>
            {g.itens.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} — {item.descricao} ({formatarMoeda(item.preco_unitario)}/{ROTULO_UNIDADE[item.unidade]})
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

/**
 * Subgrupos do QQP (na ordem da árvore) com os itens ativos ainda fora da projeção.
 * `arvore` vem de GET /qqp; `usados` é o conjunto de ids já na grade.
 */
export function gruposDisponiveis(arvore, usados) {
  return arvore.flatMap((categoria) =>
    categoria.grupos.flatMap((grupo) =>
      grupo.subgrupos.map((sub) => ({
        chave: `${categoria.categoria}›${grupo.grupo}›${sub.subgrupo}`,
        rotulo: [categoria.categoria, grupo.grupo, sub.subgrupo].filter(Boolean).join(' › ') || SEM_NOME,
        itens: sub.itens.filter((item) => item.ativo && !usados.has(item.id)),
      }))
    )
  );
}

/**
 * Grade semanal da Projeção de BMM: para cada item e semana (rotulada pela sexta-feira),
 * Dias, Pessoas/Quantidade e o valor calculado pelo back-end (`calculo`). Horas/dia só nos
 * itens por HORA; nos itens por UNIDADE os dias não entram na conta.
 */
export default function GradeSemanal({ arvore, itensPorId, semanas, linhas, calculo, somenteLeitura, onAlterar }) {
  const usados = new Set(linhas.map((l) => l.item_qqp_id));
  const temHora = linhas.some((l) => itensPorId.get(l.item_qqp_id)?.unidade === 'HORA');
  const calculoPorItem = new Map((calculo?.itens || []).map((i) => [i.item_qqp_id, i]));
  const totalSemana = new Map((calculo?.semanas || []).map((s) => [s.semana_inicio, s.total]));

  const alterarLinha = (itemId, mudanca) => onAlterar(linhas.map((l) => (l.item_qqp_id === itemId ? mudanca(l) : l)));
  const alterarSemana = (itemId, semana, campo, valor) =>
    alterarLinha(itemId, (l) => ({ ...l, semanas: { ...l.semanas, [semana]: { ...(l.semanas[semana] || {}), [campo]: valor } } }));
  const adicionar = (itemId) => onAlterar([...linhas, { item_qqp_id: itemId, horas_dia: itensPorId.get(itemId)?.unidade === 'HORA' ? '8' : '', semanas: {} }]);
  const remover = (itemId) => onAlterar(linhas.filter((l) => l.item_qqp_id !== itemId));

  /** Preenche todas as semanas do item com os dias úteis de cada uma (atalho "mês cheio"). */
  const preencherMes = (itemId) =>
    alterarLinha(itemId, (l) => ({
      ...l,
      semanas: Object.fromEntries(
        semanas.map((s) => [s.semana_inicio, { dias: String(s.dias_uteis), pessoas: l.semanas[s.semana_inicio]?.pessoas || '1' }])
      ),
    }));

  // Linhas agrupadas por subgrupo, na ordem da árvore do QQP.
  const blocos = [];
  const disponiveis = gruposDisponiveis(arvore, usados);
  arvore.forEach((categoria) =>
    categoria.grupos.forEach((grupo) =>
      grupo.subgrupos.forEach((sub) => {
        const ids = new Set(sub.itens.map((i) => i.id));
        const doBloco = linhas.filter((l) => ids.has(l.item_qqp_id));
        if (!doBloco.length) return;
        const chave = `${categoria.categoria}›${grupo.grupo}›${sub.subgrupo}`;
        blocos.push({
          chave,
          rotulo: [categoria.categoria, grupo.grupo, sub.subgrupo].filter(Boolean).join(' › ') || SEM_NOME,
          linhas: doBloco,
          disponiveis: disponiveis.find((d) => d.chave === chave)?.itens || [],
        });
      })
    )
  );
  // Itens que não estão mais na árvore do escopo (ex.: desativados depois): ficam num bloco à parte.
  const naArvore = new Set(blocos.flatMap((b) => b.linhas.map((l) => l.item_qqp_id)));
  const orfas = linhas.filter((l) => !naArvore.has(l.item_qqp_id));
  if (orfas.length) blocos.push({ chave: '__orfas', rotulo: 'Itens fora do QQP atual', linhas: orfas, disponiveis: [] });

  const colunas = 2 + (temHora ? 1 : 0) + semanas.length + 2;

  return (
    <div className="space-y-3">
      {!somenteLeitura ? <SeletorItemQqp grupos={disponiveis} onEscolher={adicionar} /> : null}

      {!linhas.length ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Adicione os itens do QQP que entram nesta projeção.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 min-w-[16rem] bg-slate-50 px-3 py-2 text-left font-bold">Item</th>
                <th rowSpan={2} className="px-2 py-2 text-right font-bold">Preço</th>
                {temHora ? <th rowSpan={2} className="px-2 py-2 text-center font-bold">Horas/dia</th> : null}
                {semanas.map((s) => (
                  <th key={s.semana_inicio} className="border-l border-slate-200 px-2 pt-2 text-center font-bold" title={`${diaMes(s.inicio)} a ${diaMes(s.fim)}`}>
                    Sex {diaMes(s.sexta)}
                    <span className="block text-[10px] font-medium normal-case text-slate-400">{s.dias_uteis} dia(s) útil(eis)</span>
                  </th>
                ))}
                <th rowSpan={2} className="border-l border-slate-200 px-3 py-2 text-right font-bold">Total</th>
                <th rowSpan={2} className="px-2 py-2" aria-label="Ações" />
              </tr>
              <tr>
                {semanas.map((s) => (
                  <th key={s.semana_inicio} className="border-l border-slate-200 px-2 pb-1.5 text-center text-[10px] font-semibold normal-case text-slate-400">
                    dias · qtd · R$
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {blocos.map((bloco) => (
                <Fragment key={bloco.chave}>
                  <tr className="bg-omega-50/60">
                    <td colSpan={colunas} className="sticky left-0 px-3 py-1.5 text-[11px] font-bold text-omega-800">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{bloco.rotulo}</span>
                        {!somenteLeitura && bloco.disponiveis.length ? (
                          <span className="inline-flex items-center gap-1">
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            <SeletorItemQqp
                              compacto
                              rotulo="item neste subgrupo"
                              grupos={[{ chave: bloco.chave, rotulo: bloco.rotulo, itens: bloco.disponiveis }]}
                              onEscolher={adicionar}
                            />
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {bloco.linhas.map((linha) => {
                    const item = itensPorId.get(linha.item_qqp_id);
                    const calculado = calculoPorItem.get(linha.item_qqp_id);
                    const valorSemana = new Map((calculado?.semanas || []).map((s) => [s.semana_inicio, s.valor]));
                    const unidade = item?.unidade || calculado?.unidade;
                    return (
                      <tr key={linha.item_qqp_id} className="hover:bg-slate-50/60">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                          <p className="font-semibold text-omega-700">{item?.codigo || calculado?.codigo || `#${linha.item_qqp_id}`}</p>
                          <p className="max-w-[18rem] truncate text-slate-600" title={item?.descricao}>{item?.descricao || calculado?.descricao}</p>
                          <p className="text-[10px] text-slate-400">por {ROTULO_UNIDADE[unidade] || '—'}{item && !item.ativo ? ' · desativado no QQP' : ''}</p>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatarMoeda(item?.preco_unitario ?? calculado?.preco_unitario)}</td>
                        {temHora ? (
                          <td className="px-2 py-1.5 text-center">
                            {unidade === 'HORA' ? (
                              <CampoNumero
                                rotulo="Horas por dia"
                                passo="0.5"
                                valor={linha.horas_dia}
                                desabilitado={somenteLeitura}
                                onAlterar={(v) => alterarLinha(linha.item_qqp_id, (l) => ({ ...l, horas_dia: v }))}
                              />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        ) : null}
                        {semanas.map((s) => {
                          const atual = linha.semanas[s.semana_inicio] || {};
                          return (
                            <td key={s.semana_inicio} className="whitespace-nowrap border-l border-slate-100 px-1.5 py-1.5">
                              <div className="flex items-center gap-1">
                                <CampoNumero
                                  rotulo={`Dias na semana de ${diaMes(s.sexta)} (até ${s.dias_uteis})`}
                                  valor={unidade === 'UNIDADE' ? '' : atual.dias}
                                  desabilitado={somenteLeitura || unidade === 'UNIDADE' || s.dias_uteis === 0}
                                  largura="w-10"
                                  onAlterar={(v) => alterarSemana(linha.item_qqp_id, s.semana_inicio, 'dias', v)}
                                />
                                <CampoNumero
                                  rotulo={`${unidade === 'UNIDADE' ? 'Quantidade' : 'Pessoas/quantidade'} na semana de ${diaMes(s.sexta)}`}
                                  valor={atual.pessoas}
                                  passo="any"
                                  largura="w-14"
                                  desabilitado={somenteLeitura}
                                  onAlterar={(v) => alterarSemana(linha.item_qqp_id, s.semana_inicio, 'pessoas', v)}
                                />
                              </div>
                              <p className="mt-0.5 text-right text-[10px] tabular-nums text-slate-500">
                                {valorSemana.get(s.semana_inicio) ? formatarMoeda(valorSemana.get(s.semana_inicio)) : '—'}
                              </p>
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap border-l border-slate-100 px-3 py-1.5 text-right font-semibold tabular-nums">
                          {calculado ? formatarMoeda(calculado.total) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          {!somenteLeitura ? (
                            <div className="inline-flex gap-1">
                              {unidade !== 'UNIDADE' ? (
                                <button type="button" className="btn-neutro !px-1.5 !py-0.5 text-[10px]" onClick={() => preencherMes(linha.item_qqp_id)} title="Preencher todas as semanas com os dias úteis">
                                  mês
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn-neutro !px-1.5 !py-0.5 hover:!border-red-300 hover:!text-red-600"
                                onClick={() => remover(linha.item_qqp_id)}
                                aria-label={`Tirar ${item?.codigo || 'item'} da projeção`}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <tr>
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2" colSpan={2 + (temHora ? 1 : 0)}>Total por semana</td>
                {semanas.map((s) => (
                  <td key={s.semana_inicio} className="whitespace-nowrap border-l border-slate-200 px-2 py-2 text-right tabular-nums">
                    {totalSemana.has(s.semana_inicio) ? formatarMoeda(totalSemana.get(s.semana_inicio)) : '—'}
                  </td>
                ))}
                <td className="whitespace-nowrap border-l border-slate-200 px-3 py-2 text-right tabular-nums text-omega-800">{calculo ? formatarMoeda(calculo.total) : '—'}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
