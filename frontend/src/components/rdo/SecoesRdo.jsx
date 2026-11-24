import { Plus, UserPlus, Users, X } from 'lucide-react';
import { chaveEfetivo, esperaEntreHoras, minutosParaTexto, novaChave } from '../../utils/rdo.js';

/** Cartão recolhível de seção (bom para tela de celular). */
export function Secao({ numero, titulo, resumo, children, aberta = true, acao }) {
  return (
    <details open={aberta} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {numero ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-omega-600 text-xs text-white">{numero}</span> : null}
          {titulo}
        </span>
        <span className="flex items-center gap-3">
          {resumo ? <span className="text-xs text-slate-500">{resumo}</span> : null}
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
 * PTS (Permissão de Trabalho Seguro): a pergunta é se foi necessária a emissão. Se sim, a hora em que
 * foi solicitada e a hora em que o cliente liberou a área; a espera entre as duas é calculada.
 */
export function SecaoPts({ necessaria, itens, editavel, onNecessaria, onChange }) {
  const alterar = (chave, campos) => onChange(itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)));
  const opcao = (valor, rotulo) => (
    <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${necessaria === valor ? 'border-omega-600 bg-omega-600 text-white' : 'border-slate-300 bg-white text-slate-700'} ${editavel ? '' : 'cursor-default opacity-70'}`}>
      <input type="radio" name="pts-necessaria" className="sr-only" disabled={!editavel} checked={necessaria === valor} onChange={() => onNecessaria(valor)} />
      {rotulo}
    </label>
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="rotulo">Foi necessária a emissão de PTS? *</p>
        <div className="flex gap-2">{opcao(true, 'Sim')}{opcao(false, 'Não')}</div>
        {necessaria === null ? <p className="mt-1 text-xs text-amber-700">Responda para poder finalizar o RDO.</p> : null}
      </div>

      {necessaria ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Informe só as horas: a solicitação ao cliente e a liberação da área. Se ainda não liberou, deixe a liberação em branco.</p>
          {itens.map((p) => {
            const espera = esperaEntreHoras(p.hora_solicitacao, p.hora_liberacao);
            const invalida = p.hora_solicitacao && p.hora_liberacao && espera === null;
            return (
              <div key={p.chave} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_32px] sm:items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="rotulo">Nº da PTS</label>
                  <input className="campo" disabled={!editavel} value={p.numero} onChange={(e) => alterar(p.chave, { numero: e.target.value })} />
                </div>
                <div>
                  <label className="rotulo">Solicitada às *</label>
                  <input type="time" className="campo" disabled={!editavel} value={p.hora_solicitacao} onChange={(e) => alterar(p.chave, { hora_solicitacao: e.target.value })} />
                </div>
                <div>
                  <label className="rotulo">Liberada às</label>
                  <input type="time" className="campo" disabled={!editavel} value={p.hora_liberacao} onChange={(e) => alterar(p.chave, { hora_liberacao: e.target.value })} />
                </div>
                <div>
                  <label className="rotulo">Espera</label>
                  <p className={`campo bg-white ${invalida ? 'text-red-600' : espera > 60 ? 'font-bold text-amber-700' : 'text-slate-600'}`}>{invalida ? 'inválida' : minutosParaTexto(espera)}</p>
                </div>
                {editavel ? <BotaoRemover onClick={() => onChange(itens.filter((i) => i.chave !== p.chave))} /> : null}
              </div>
            );
          })}
          {editavel ? <BotaoAdicionar rotulo="Adicionar PTS" onClick={() => onChange([...itens, { chave: novaChave(), numero: '', hora_solicitacao: '', hora_liberacao: '' }])} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Desvios e improdutividades, em horas, por motivo. */
export function SecaoDesvios({ itens, editavel, catalogo, automaticos = [], onChange }) {
  const alterar = (chave, campos) => onChange(itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)));
  return (
    <div className="space-y-2">
      {itens.length === 0 && automaticos.length === 0 ? <p className="text-xs text-slate-400">Nenhum desvio lançado.</p> : null}
      {automaticos.map((d) => (
        <div key={d.atividade_id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          <strong>Atividade fora de escopo</strong> — {d.descricao} · {Number(d.horas).toLocaleString('pt-BR')} HH
          {d.justificativa ? <p className="text-xs text-amber-700">Justificativa: {d.justificativa}</p> : null}
        </div>
      ))}
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
