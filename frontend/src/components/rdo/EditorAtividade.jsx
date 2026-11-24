import { useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { chaveEfetivo, maoObraVazia } from '../../utils/rdo.js';
import { formatarPercentual } from '../../utils/formatters.js';

const arredondar = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => Number(String(v).replace(',', '.')) || 0;

/**
 * Uma atividade do RDO. Duas naturezas:
 *  - do cronograma: escolhe a atividade, declara o % (se já está em 100% fica travada: só observação,
 *    mão de obra e fotos);
 *  - fora de escopo: descrição e justificativa obrigatórias; entra como desvio.
 * A mão de obra só oferece as pessoas do efetivo do dia. Mostra o % validado ao planejador.
 */
export default function EditorAtividade({
  atividade,
  indice,
  editavel,
  opcoesAtividade,
  usados,
  efetivo,
  modoValidacao,
  valorValidado,
  onValidado,
  onChange,
  onRemover,
  onEnviarFotos,
  onRemoverFoto,
}) {
  const entradaFoto = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const a = atividade;
  const alterar = (campos) => onChange({ ...a, ...campos });
  const declarado = a.percentual_declarado === '' ? null : num(a.percentual_declarado);
  const regride = !a.fora_de_escopo && !a.concluida && declarado !== null && declarado < a.percentual_anterior;
  const avanca = !a.fora_de_escopo && !a.concluida && declarado !== null && declarado > a.percentual_anterior;

  const horasDe = (m) => {
    const pessoa = efetivo.find((e) => chaveEfetivo(e) === m.pessoa);
    return arredondar((pessoa?.tipo === 'FUNCAO' ? num(m.quantidade) : 1) * num(m.horas));
  };
  const hhTotal = arredondar(a.mao_obra.reduce((s, m) => s + horasDe(m), 0));
  const natureza = a.fora_de_escopo ? 'FORA' : 'CRONOGRAMA';

  function trocarNatureza(nova) {
    if (nova === natureza) return;
    alterar(nova === 'FORA'
      ? { fora_de_escopo: true, codigo_atividade: '', descricao_snapshot: '', concluida: false, percentual_anterior: 0, percentual_declarado: '' }
      : { fora_de_escopo: false, descricao_snapshot: '', justificativa: '' });
  }

  function escolherAtividade(codigo) {
    const opcao = opcoesAtividade.find((o) => o.codigo_atividade === codigo);
    if (!opcao) {
      alterar({ codigo_atividade: '', descricao_snapshot: '', percentual_anterior: 0, concluida: false });
      return;
    }
    alterar({
      codigo_atividade: codigo,
      descricao_snapshot: opcao.descricao,
      percentual_anterior: opcao.percentual_vigente,
      concluida: opcao.concluida,
      percentual_declarado: opcao.concluida ? '100' : a.percentual_declarado === '' ? String(opcao.percentual_vigente) : a.percentual_declarado,
    });
  }

  function alterarMaoObra(chave, campos) {
    alterar({ mao_obra: a.mao_obra.map((m) => (m.chave === chave ? { ...m, ...campos } : m)) });
  }

  async function fotosEscolhidas(evento) {
    const arquivos = [...evento.target.files];
    evento.target.value = '';
    if (!arquivos.length) return;
    setEnviando(true);
    try {
      await onEnviarFotos(a, arquivos);
    } finally {
      setEnviando(false);
    }
  }

  const titulo = a.fora_de_escopo
    ? `Fora de escopo${a.descricao_snapshot ? ` — ${a.descricao_snapshot}` : ''}`
    : a.codigo_atividade ? `${a.codigo_atividade} — ${a.descricao_snapshot}` : 'Nova atividade';

  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm ${a.concluida ? 'border-emerald-300' : a.fora_de_escopo ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{indice + 1}. {titulo}</p>
          {a.concluida ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Atividade concluída (100%) — sem lançamento de avanço
            </p>
          ) : null}
        </div>
        {editavel ? (
          <button type="button" className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={onRemover} aria-label="Remover atividade" title="Remover atividade">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {editavel && !a.id ? (
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1 text-sm font-semibold">
          <button type="button" className={`rounded-md px-3 py-1 ${natureza === 'CRONOGRAMA' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`} onClick={() => trocarNatureza('CRONOGRAMA')}>Do cronograma</button>
          <button type="button" className={`rounded-md px-3 py-1 ${natureza === 'FORA' ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-600'}`} onClick={() => trocarNatureza('FORA')}>Fora de escopo</button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {a.fora_de_escopo ? (
          <>
            <div className="sm:col-span-2">
              <label className="rotulo">Serviço executado *</label>
              <input className="campo" value={a.descricao_snapshot} disabled={!editavel} maxLength={500} onChange={(e) => alterar({ descricao_snapshot: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="rotulo">Justificativa * <span className="normal-case text-amber-700">(entra como desvio no RDO)</span></label>
              <textarea className="campo" rows={2} maxLength={2000} disabled={!editavel} placeholder="Por que esse serviço não está no cronograma?" value={a.justificativa} onChange={(e) => alterar({ justificativa: e.target.value })} />
            </div>
          </>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="rotulo">Atividade do cronograma *</label>
              <select className="campo" value={a.codigo_atividade} disabled={!editavel || Boolean(a.id)} onChange={(e) => escolherAtividade(e.target.value)}>
                <option value="">Selecione a atividade…</option>
                {a.codigo_atividade && !opcoesAtividade.some((o) => o.codigo_atividade === a.codigo_atividade) ? (
                  <option value={a.codigo_atividade}>{a.codigo_atividade} — {a.descricao_snapshot}</option>
                ) : null}
                {opcoesAtividade.filter((o) => o.codigo_atividade === a.codigo_atividade || !usados.has(o.codigo_atividade)).map((o) => (
                  <option key={o.codigo_atividade} value={o.codigo_atividade}>
                    {o.concluida ? '✔ ' : ''}{o.codigo_atividade} — {o.descricao} ({formatarPercentual(o.percentual_vigente, 0)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="rotulo">% anterior (vigente)</label>
              <p className={`campo ${a.concluida ? 'bg-emerald-50 font-bold text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>{formatarPercentual(a.percentual_anterior)}</p>
            </div>
            <div>
              <label className="rotulo">% declarado hoje {a.concluida ? '' : '*'}</label>
              <input type="number" inputMode="decimal" min="0" max="100" step="0.5" className="campo" disabled={!editavel || a.concluida} value={a.concluida ? 100 : a.percentual_declarado} onChange={(e) => alterar({ percentual_declarado: e.target.value })} />
              {avanca && editavel ? <p className="mt-1 text-xs text-emerald-700">+{formatarPercentual(declarado - a.percentual_anterior)} no dia — anexe foto de evidência.</p> : null}
              {regride && editavel ? <p className="mt-1 text-xs text-red-600">Menor que o anterior: explique na observação.</p> : null}
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className="rotulo">Observação{regride ? ' *' : ''}</label>
          <textarea className="campo" rows={2} maxLength={2000} disabled={!editavel} value={a.observacao} onChange={(e) => alterar({ observacao: e.target.value })} />
        </div>

        {modoValidacao && !a.fora_de_escopo && !a.concluida ? (
          <div className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2">
            <label className="rotulo text-amber-800">% validado pelo planejamento</label>
            <input type="number" inputMode="decimal" min="0" max="100" step="0.5" className="campo" value={valorValidado ?? ''} onChange={(e) => onValidado(e.target.value)} />
          </div>
        ) : null}
        {!modoValidacao && !a.concluida && a.percentual_validado !== null && a.percentual_validado !== undefined ? (
          <p className="text-sm text-emerald-700 sm:col-span-2">% validado: <strong>{formatarPercentual(a.percentual_validado)}</strong></p>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ Mão de obra */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Quem trabalhou · {hhTotal.toLocaleString('pt-BR')} HH</p>
          {editavel ? (
            <button type="button" disabled={efetivo.length === 0} title={efetivo.length === 0 ? 'Adicione o efetivo do dia primeiro' : ''} className="btn-neutro !px-2 !py-1 text-xs" onClick={() => alterar({ mao_obra: [...a.mao_obra, maoObraVazia()] })}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar pessoa
            </button>
          ) : null}
        </div>
        {efetivo.length === 0 && editavel ? <p className="text-xs text-amber-700">Preencha o efetivo do dia para escolher quem trabalhou nesta atividade.</p> : null}
        {a.mao_obra.length === 0 && efetivo.length > 0 ? <p className="text-xs text-slate-400">Ninguém lançado nesta atividade.</p> : null}
        <div className="space-y-2">
          {a.mao_obra.map((m) => {
            const pessoa = efetivo.find((e) => chaveEfetivo(e) === m.pessoa);
            const porFuncao = pessoa?.tipo === 'FUNCAO';
            // Cada pessoa nominal só aparece uma vez por atividade.
            const jaNaAtividade = new Set(a.mao_obra.filter((x) => x.chave !== m.chave).map((x) => x.pessoa));
            return (
              <div key={m.chave} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[1fr_80px_80px_32px] sm:items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="rotulo">Pessoa / função</label>
                  <select className="campo" disabled={!editavel} value={m.pessoa} onChange={(e) => alterarMaoObra(m.chave, { pessoa: e.target.value })}>
                    <option value="">Selecione do efetivo…</option>
                    {m.pessoa && !pessoa ? <option value={m.pessoa}>(fora do efetivo — remova)</option> : null}
                    {efetivo.filter((e) => !jaNaAtividade.has(chaveEfetivo(e))).map((e) => (
                      <option key={e.chave} value={chaveEfetivo(e)}>{e.nome}{e.tipo === 'FUNCAO' ? ` (até ${e.quantidade})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="rotulo">Qtd.</label>
                  <input type="number" inputMode="numeric" min="1" step="1" className="campo" disabled={!editavel || !porFuncao} value={porFuncao ? m.quantidade : 1} onChange={(e) => alterarMaoObra(m.chave, { quantidade: e.target.value })} />
                </div>
                <div>
                  <label className="rotulo">Horas</label>
                  <input type="number" inputMode="decimal" min="0" max="24" step="0.5" className="campo" disabled={!editavel} value={m.horas} onChange={(e) => alterarMaoObra(m.chave, { horas: e.target.value })} />
                </div>
                {editavel ? (
                  <button type="button" className="mb-1 rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remover pessoa" onClick={() => alterar({ mao_obra: a.mao_obra.filter((x) => x.chave !== m.chave) })}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ Fotos */}
      {!a.fora_de_escopo ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Fotos de evidência ({a.fotos.length})</p>
          <div className="flex flex-wrap gap-2">
            {a.fotos.map((f) => (
              <div key={f.id} className="relative h-20 w-20 overflow-hidden rounded-md border border-slate-200">
                <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="Evidência" className="h-full w-full object-cover" loading="lazy" /></a>
                {editavel ? (
                  <button type="button" className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remover foto" onClick={() => onRemoverFoto(a, f)}>
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
            {editavel ? (
              <>
                <button type="button" disabled={!a.id || enviando} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50" onClick={() => entradaFoto.current?.click()}>
                  {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
                  {enviando ? 'Enviando' : 'Foto'}
                </button>
                <input ref={entradaFoto} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={fotosEscolhidas} />
              </>
            ) : null}
          </div>
          {editavel && !a.id ? <p className="mt-1 text-xs text-slate-400">Salve o rascunho para poder anexar fotos.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
