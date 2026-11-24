import { Plus, X } from 'lucide-react';
import { minutosParaTexto, novaChave } from '../../utils/rdo.js';

/** Cartão recolhível de seção (bom para tela de celular). */
export function Secao({ titulo, resumo, children, aberta = true, acao }) {
  return (
    <details open={aberta} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-bold text-slate-800">{titulo}</span>
        <span className="flex items-center gap-3">
          {resumo ? <span className="text-xs text-slate-500">{resumo}</span> : null}
          {acao}
        </span>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

function BotaoAdicionar({ onClick, rotulo }) {
  return (
    <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
    </button>
  );
}

function BotaoRemover({ onClick }) {
  return (
    <button type="button" className="mb-1 rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remover linha" onClick={onClick}>
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** Equipamentos do dia: horas trabalhadas e paradas. */
export function SecaoEquipamentos({ itens, editavel, catalogo, onChange }) {
  const alterar = (chave, campos) => onChange(itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)));
  return (
    <div className="space-y-2">
      {itens.length === 0 ? <p className="text-xs text-slate-400">Nenhum equipamento lançado.</p> : null}
      {itens.map((e) => (
        <div key={e.chave} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[1fr_100px_100px_1fr_32px] sm:items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo">Equipamento</label>
            <select className="campo" disabled={!editavel} value={e.equipamento_id} onChange={(ev) => alterar(e.chave, { equipamento_id: ev.target.value })}>
              <option value="">Selecione…</option>
              {catalogo.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.codigo ? ` (${c.codigo})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo">H trabalhadas</label>
            <input type="number" inputMode="decimal" min="0" max="24" step="0.5" className="campo" disabled={!editavel} value={e.horas_trabalhadas} onChange={(ev) => alterar(e.chave, { horas_trabalhadas: ev.target.value })} />
          </div>
          <div>
            <label className="rotulo">H paradas</label>
            <input type="number" inputMode="decimal" min="0" max="24" step="0.5" className="campo" disabled={!editavel} value={e.horas_paradas} onChange={(ev) => alterar(e.chave, { horas_paradas: ev.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo">Observação</label>
            <input className="campo" disabled={!editavel} value={e.observacao} onChange={(ev) => alterar(e.chave, { observacao: ev.target.value })} />
          </div>
          {editavel ? <BotaoRemover onClick={() => onChange(itens.filter((i) => i.chave !== e.chave))} /> : null}
        </div>
      ))}
      {editavel ? <BotaoAdicionar rotulo="Adicionar equipamento" onClick={() => onChange([...itens, { chave: novaChave(), equipamento_id: '', horas_trabalhadas: '', horas_paradas: '', observacao: '' }])} /> : null}
    </div>
  );
}

/** PTS: hora de solicitação e de liberação; a espera é calculada. */
export function SecaoPts({ itens, editavel, onChange }) {
  const alterar = (chave, campos) => onChange(itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)));
  const espera = (p) => {
    if (!p.solicitado_em || !p.liberado_em) return null;
    const m = Math.round((new Date(p.liberado_em) - new Date(p.solicitado_em)) / 60000);
    return m >= 0 ? m : null;
  };
  return (
    <div className="space-y-2">
      {itens.length === 0 ? <p className="text-xs text-slate-400">Nenhuma PTS lançada.</p> : null}
      {itens.map((p) => {
        const m = espera(p);
        const invalida = p.solicitado_em && p.liberado_em && m === null;
        return (
          <div key={p.chave} className="grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[120px_1fr_1fr_130px_32px] sm:items-end">
            <div>
              <label className="rotulo">Nº PTS</label>
              <input className="campo" disabled={!editavel} value={p.numero} onChange={(e) => alterar(p.chave, { numero: e.target.value })} />
            </div>
            <div>
              <label className="rotulo">Solicitada em *</label>
              <input type="datetime-local" className="campo" disabled={!editavel} value={p.solicitado_em} onChange={(e) => alterar(p.chave, { solicitado_em: e.target.value })} />
            </div>
            <div>
              <label className="rotulo">Liberada em</label>
              <input type="datetime-local" className="campo" disabled={!editavel} value={p.liberado_em} onChange={(e) => alterar(p.chave, { liberado_em: e.target.value })} />
            </div>
            <div>
              <label className="rotulo">Espera</label>
              <p className={`campo bg-white ${invalida ? 'text-red-600' : 'text-slate-600'}`}>{invalida ? 'inválida' : minutosParaTexto(m)}</p>
            </div>
            {editavel ? <BotaoRemover onClick={() => onChange(itens.filter((i) => i.chave !== p.chave))} /> : null}
          </div>
        );
      })}
      {editavel ? <BotaoAdicionar rotulo="Adicionar PTS" onClick={() => onChange([...itens, { chave: novaChave(), numero: '', solicitado_em: '', liberado_em: '' }])} /> : null}
    </div>
  );
}

/** Desvios e improdutividades, em horas, por motivo. */
export function SecaoDesvios({ itens, editavel, catalogo, onChange }) {
  const alterar = (chave, campos) => onChange(itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)));
  return (
    <div className="space-y-2">
      {itens.length === 0 ? <p className="text-xs text-slate-400">Nenhum desvio lançado.</p> : null}
      {itens.map((d) => (
        <div key={d.chave} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[1fr_100px_1fr_32px] sm:items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo">Motivo</label>
            <select className="campo" disabled={!editavel} value={d.motivo_id} onChange={(e) => alterar(d.chave, { motivo_id: e.target.value })}>
              <option value="">Selecione…</option>
              {catalogo.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo">Horas</label>
            <input type="number" inputMode="decimal" min="0.25" max="24" step="0.25" className="campo" disabled={!editavel} value={d.horas} onChange={(e) => alterar(d.chave, { horas: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo">Observação</label>
            <input className="campo" disabled={!editavel} value={d.observacao} onChange={(e) => alterar(d.chave, { observacao: e.target.value })} />
          </div>
          {editavel ? <BotaoRemover onClick={() => onChange(itens.filter((i) => i.chave !== d.chave))} /> : null}
        </div>
      ))}
      {editavel ? <BotaoAdicionar rotulo="Adicionar desvio" onClick={() => onChange([...itens, { chave: novaChave(), motivo_id: '', horas: '', observacao: '' }])} /> : null}
    </div>
  );
}
