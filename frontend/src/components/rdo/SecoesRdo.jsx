import { useState } from 'react';
import { Check, Lock, Pencil, Plus, UserPlus, Users, X } from 'lucide-react';
import { chaveEfetivo, esperaEntreHoras, formatarHHMM, hhmmParaMinutos, novaChave } from '../../utils/rdo.js';

/**
 * Cartão recolhível de seção (bom para tela de celular). Com `faixa`, o cabeçalho vira uma faixa
 * vermelha com o título em branco (modelo de campo usado em PTS e Desvios).
 */
export function Secao({ numero, titulo, resumo, children, aberta = true, acao, faixa = false }) {
  return (
    <details open={aberta} className="card group overflow-hidden">
      <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 ${faixa ? 'bg-omega-700 text-white' : ''}`}>
        <span className={`flex items-center gap-2 text-sm font-bold ${faixa ? 'text-white' : 'text-slate-800'}`}>
          {numero && !faixa ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-omega-600 text-xs text-white">{numero}</span> : null}
          {titulo}
        </span>
        <span className="flex items-center gap-3">
          {resumo ? <span className={`text-xs ${faixa ? 'text-white/80' : 'text-slate-500'}`}>{resumo}</span> : null}
          {acao}
        </span>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

function BotaoAdicionar({ onClick, rotulo, Icone = Plus, desabilitado = false }) {
  return (
    <button type="button" disabled={desabilitado} className="btn-neutro !px-2 !py-1 text-xs" onClick={onClick}>
      <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
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

/**
 * Efetivo do dia: quem esteve na obra (colaboradores nominais ou funções com quantidade).
 * As atividades só podem usar gente que está aqui.
 */
export function SecaoEfetivo({ itens, editavel, catalogos, usados, onChange }) {
  const nominaisNoEfetivo = new Set(itens.filter((e) => e.tipo === 'NOMINAL').map((e) => e.colaborador_id));
  const funcoesNoEfetivo = new Set(itens.filter((e) => e.tipo === 'FUNCAO').map((e) => e.funcao_id));
  const alterar = (chave, campos) => onChange(itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)));

  function adicionarColaborador(id) {
    const c = catalogos.colaboradores.find((x) => String(x.id) === id);
    if (!c) return;
    onChange([...itens, { chave: novaChave(), tipo: 'NOMINAL', funcao_id: '', colaborador_id: String(c.id), quantidade: '1', nome: c.nome }]);
  }
  function adicionarFuncao(id) {
    const f = catalogos.funcoes.find((x) => String(x.id) === id);
    if (!f) return;
    onChange([...itens, { chave: novaChave(), tipo: 'FUNCAO', funcao_id: String(f.id), colaborador_id: '', quantidade: '1', nome: f.nome }]);
  }

  const pessoas = itens.reduce((s, e) => s + (e.tipo === 'FUNCAO' ? Number(e.quantidade) || 0 : 1), 0);

  return (
    <div className="space-y-3">
      {itens.length === 0 ? <p className="text-sm text-slate-500">Comece pelas pessoas: quem esteve na obra hoje? Depois você escolhe quem trabalhou em cada atividade.</p> : null}
      <div className="space-y-2">
        {itens.map((e) => (
          <div key={e.chave} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{e.nome || (e.tipo === 'FUNCAO' ? 'Função' : 'Colaborador')}</p>
              <p className="text-xs text-slate-500">
                {e.tipo === 'FUNCAO' ? 'Por função' : 'Nominal'}
                {usados.has(chaveEfetivo(e)) ? ' · em atividade' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {e.tipo === 'FUNCAO' ? (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  Qtd.
                  <input type="number" inputMode="numeric" min="1" step="1" className="campo !w-16 !py-1" disabled={!editavel} value={e.quantidade} onChange={(ev) => alterar(e.chave, { quantidade: ev.target.value })} />
                </label>
              ) : null}
              {editavel ? <BotaoRemover onClick={() => onChange(itens.filter((i) => i.chave !== e.chave))} /> : null}
            </div>
          </div>
        ))}
      </div>

      {editavel ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="rotulo"><UserPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Adicionar colaborador</label>
            <select className="campo" value="" onChange={(ev) => adicionarColaborador(ev.target.value)}>
              <option value="">Selecione…</option>
              {catalogos.colaboradores.filter((c) => !nominaisNoEfetivo.has(String(c.id))).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` (${c.funcao.nome})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo"><Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Adicionar por função (quantidade)</label>
            <select className="campo" value="" onChange={(ev) => adicionarFuncao(ev.target.value)}>
              <option value="">Selecione…</option>
              {catalogos.funcoes.filter((f) => !funcoesNoEfetivo.has(String(f.id))).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-slate-500">Total no dia: <strong>{pessoas.toLocaleString('pt-BR')}</strong> pessoa(s)</p>
    </div>
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

/**
 * PTS (Permissão de Trabalho Seguro): a pergunta é se foi emitida. Se sim, a hora em que foi solicitada
 * ao cliente, a hora em que ele liberou a área e o nome de quem emitiu; o tempo de espera é calculado.
 * `pts` = { hora_solicitacao, hora_liberacao, emitente }.
 */
export function SecaoPts({ necessaria, pts, editavel, onNecessaria, onChange }) {
  const espera = esperaEntreHoras(pts.hora_solicitacao, pts.hora_liberacao);
  const invalida = Boolean(pts.hora_solicitacao && pts.hora_liberacao && espera === null);
  const botao = (valor, rotulo, Icone) => {
    const ativo = necessaria === valor;
    return (
      <label className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-bold transition ${ativo ? 'border-omega-600 bg-white text-omega-700' : 'border-slate-200 bg-slate-100 text-slate-500'} ${editavel ? 'cursor-pointer hover:border-omega-400' : 'cursor-default'}`}>
        <input type="radio" name="pts-necessaria" className="sr-only" disabled={!editavel} checked={ativo} onChange={() => onNecessaria(valor)} />
        <Icone className="h-4 w-4" aria-hidden="true" /> {rotulo}
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">{botao(true, 'PTS Emitida', Lock)}{botao(false, 'PTS Não Necessária', Check)}</div>
      {necessaria === null ? <p className="text-xs text-amber-700">Responda se foi necessária a emissão de PTS para poder finalizar o RDO.</p> : null}

      {necessaria ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="rotulo normal-case tracking-normal">Hora Solicitação PTS <span className="text-omega-600">*</span></label>
              <input type="time" className="campo" disabled={!editavel} value={pts.hora_solicitacao} onChange={(e) => onChange({ ...pts, hora_solicitacao: e.target.value })} />
            </div>
            <div>
              <label className="rotulo normal-case tracking-normal">Hora Liberação PTS <span className="text-omega-600">*</span></label>
              <input type="time" className="campo" disabled={!editavel} value={pts.hora_liberacao} onChange={(e) => onChange({ ...pts, hora_liberacao: e.target.value })} />
            </div>
            <div className="min-w-[8.5rem]">
              <p className="rotulo normal-case tracking-normal">{espera === null ? 'Aguardo (cálculo)' : 'Calculado'}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tempo de espera</p>
              <p className={`text-2xl font-extrabold ${invalida ? 'text-red-600' : 'text-omega-600'}`}>{invalida ? 'inválido' : formatarHHMM(espera ?? 0)}</p>
            </div>
          </div>
          <div>
            <label className="rotulo normal-case tracking-normal">Nome do Emitente PTS <span className="text-omega-600">*</span></label>
            <input className="campo" disabled={!editavel} maxLength={160} placeholder="Nome completo do emitente" value={pts.emitente} onChange={(e) => onChange({ ...pts, emitente: e.target.value })} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Desvios / improdutividades: tabela fixa de motivos com as horas (HH:MM) de cada um; o lápis edita a
 * linha. Mais a observação geral. Atividades fora de escopo entram como linhas automáticas.
 * `itens` = [{ motivo_id, descricao?, minutos }] (só os com horas > 0 vão para o servidor).
 */
export function SecaoDesvios({ itens, editavel, catalogo, automaticos = [], observacao, onObservacao, onChange }) {
  const [editando, setEditando] = useState(null);
  const minutosDe = (id) => itens.find((i) => i.motivo_id === String(id))?.minutos || 0;
  const definir = (id, descricao, minutos) => {
    const sem = itens.filter((i) => i.motivo_id !== String(id));
    onChange(minutos > 0 ? [...sem, { motivo_id: String(id), descricao, minutos }] : sem);
  };
  // Motivos já usados no RDO que saíram do catálogo ativo continuam aparecendo.
  const extras = itens
    .filter((i) => !catalogo.some((m) => String(m.id) === i.motivo_id))
    .map((i) => ({ id: i.motivo_id, descricao: i.descricao || `Motivo ${i.motivo_id}` }));
  const linhas = [...catalogo, ...extras];
  const total = itens.reduce((s, i) => s + i.minutos, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[1fr_auto_2.5rem] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
          <span>Motivo</span>
          <span>Horas</span>
          <span />
        </div>
        {linhas.map((m) => {
          const minutos = minutosDe(m.id);
          const emEdicao = editando === String(m.id);
          return (
            <div key={m.id} className="grid grid-cols-[1fr_auto_2.5rem] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
              <span className="text-sm text-slate-700">{m.descricao}</span>
              {emEdicao ? (
                <input
                  type="time"
                  autoFocus
                  className="campo !w-28 !py-1"
                  value={formatarHHMM(minutos)}
                  onChange={(e) => definir(m.id, m.descricao, hhmmParaMinutos(e.target.value))}
                  onBlur={() => setEditando(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditando(null)}
                />
              ) : (
                <span className={`text-sm font-bold tabular-nums ${minutos > 0 ? 'text-omega-600' : 'text-teal-600'}`}>{formatarHHMM(minutos)}</span>
              )}
              {editavel ? (
                <button type="button" className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800" aria-label={`Editar horas de ${m.descricao}`} onClick={() => setEditando(emEdicao ? null : String(m.id))}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : <span />}
            </div>
          );
        })}
        {automaticos.map((d) => (
          <div key={d.atividade_id} className="grid grid-cols-[1fr_auto_2.5rem] items-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2">
            <span className="text-sm text-amber-900">
              Atividade fora de escopo — {d.descricao}
              {d.justificativa ? <span className="block text-xs text-amber-700">{d.justificativa}</span> : null}
            </span>
            <span className="text-sm font-bold tabular-nums text-amber-800">{Number(d.horas).toLocaleString('pt-BR')} HH</span>
            <span />
          </div>
        ))}
        <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-sm">
          <span className="font-bold text-slate-700">Total lançado</span>
          <span className="font-extrabold tabular-nums text-omega-600">{formatarHHMM(total)}</span>
        </div>
      </div>

      <div>
        <label className="rotulo normal-case tracking-normal">Observações sobre Desvios</label>
        <textarea className="campo" rows={3} maxLength={2000} disabled={!editavel} placeholder="Descreva detalhes sobre as improdutividades..." value={observacao} onChange={(e) => onObservacao(e.target.value)} />
      </div>
    </div>
  );
}
