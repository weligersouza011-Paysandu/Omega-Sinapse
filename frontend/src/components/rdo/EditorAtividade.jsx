import { useRef, useState } from 'react';
import { Camera, Loader2, Plus, Trash2, X } from 'lucide-react';
import { maoObraVazia } from '../../utils/rdo.js';
import { formatarPercentual } from '../../utils/formatters.js';

const arredondar = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const hhDe = (m) => arredondar((m.tipo === 'FUNCAO' ? Number(String(m.quantidade).replace(',', '.')) || 0 : 1) * (Number(String(m.horas).replace(',', '.')) || 0));

/**
 * Uma atividade do RDO: escolha no cronograma (ou fora de escopo), % declarado, observação,
 * mão de obra (gera HH) e fotos de evidência. Também mostra o campo de % validado ao planejador.
 */
export default function EditorAtividade({
  atividade,
  indice,
  editavel,
  obras,
  opcoesAtividade,
  usados,
  catalogos,
  modoValidacao,
  valorValidado,
  onValidado,
  onObraMudou,
  onChange,
  onRemover,
  onEnviarFotos,
  onRemoverFoto,
}) {
  const entradaFoto = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const a = atividade;
  const alterar = (campos) => onChange({ ...a, ...campos });
  const declarado = a.percentual_declarado === '' ? null : Number(String(a.percentual_declarado).replace(',', '.'));
  const regride = !a.fora_de_escopo && declarado !== null && declarado < a.percentual_anterior;
  const avanca = !a.fora_de_escopo && declarado !== null && declarado > a.percentual_anterior;
  const hhTotal = arredondar(a.mao_obra.reduce((s, m) => s + hhDe(m), 0));

  function escolherAtividade(codigo) {
    const opcao = opcoesAtividade.find((o) => o.codigo_atividade === codigo);
    if (!opcao) {
      alterar({ codigo_atividade: '', descricao_snapshot: '', percentual_anterior: 0 });
      return;
    }
    alterar({
      codigo_atividade: codigo,
      descricao_snapshot: opcao.descricao,
      percentual_anterior: opcao.percentual_vigente,
      percentual_declarado: a.percentual_declarado === '' ? String(opcao.percentual_vigente) : a.percentual_declarado,
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

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-slate-800">
          {indice + 1}. {a.fora_de_escopo ? 'Atividade fora de escopo' : a.codigo_atividade ? `${a.codigo_atividade} — ${a.descricao_snapshot}` : 'Nova atividade'}
        </p>
        {editavel ? (
          <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={onRemover} aria-label="Remover atividade" title="Remover atividade">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="rotulo">Obra / SS</label>
          <select className="campo" value={a.obra_id} disabled={!editavel || Boolean(a.id)} onChange={(e) => { alterar({ obra_id: e.target.value, codigo_atividade: '', descricao_snapshot: '' }); onObraMudou(e.target.value); }}>
            <option value="">Selecione…</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.ss || `Obra ${o.id}`} · {o.descricao?.slice(0, 50) || o.pep}</option>
            ))}
          </select>
        </div>

        {editavel && !a.id ? (
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={a.fora_de_escopo} onChange={(e) => alterar({ fora_de_escopo: e.target.checked, codigo_atividade: '', descricao_snapshot: '', percentual_declarado: '' })} />
              Atividade fora de escopo
            </label>
          </div>
        ) : null}

        {a.fora_de_escopo ? (
          <div className="sm:col-span-2">
            <label className="rotulo">Descrição do serviço executado *</label>
            <input className="campo" value={a.descricao_snapshot} disabled={!editavel} maxLength={500} onChange={(e) => alterar({ descricao_snapshot: e.target.value })} />
          </div>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="rotulo">Atividade do cronograma *</label>
              <select className="campo" value={a.codigo_atividade} disabled={!editavel || Boolean(a.id) || !a.obra_id} onChange={(e) => escolherAtividade(e.target.value)}>
                <option value="">{a.obra_id ? 'Selecione a atividade…' : 'Escolha a obra primeiro'}</option>
                {a.codigo_atividade && !opcoesAtividade.some((o) => o.codigo_atividade === a.codigo_atividade) ? (
                  <option value={a.codigo_atividade}>{a.codigo_atividade} — {a.descricao_snapshot}</option>
                ) : null}
                {opcoesAtividade.filter((o) => o.codigo_atividade === a.codigo_atividade || !usados.has(`${a.obra_id}|${o.codigo_atividade}`)).map((o) => (
                  <option key={o.codigo_atividade} value={o.codigo_atividade}>
                    {o.codigo_atividade} — {o.descricao} ({formatarPercentual(o.percentual_vigente, 0)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="rotulo">% anterior (vigente)</label>
              <p className="campo bg-slate-50 text-slate-600">{formatarPercentual(a.percentual_anterior)}</p>
            </div>
            <div>
              <label className="rotulo">% declarado hoje *</label>
              <input type="number" inputMode="decimal" min="0" max="100" step="0.5" className="campo" disabled={!editavel} value={a.percentual_declarado} onChange={(e) => alterar({ percentual_declarado: e.target.value })} />
              {avanca && editavel ? <p className="mt-1 text-xs text-emerald-700">+{formatarPercentual(declarado - a.percentual_anterior)} no dia — anexe foto de evidência.</p> : null}
              {regride && editavel ? <p className="mt-1 text-xs text-red-600">Menor que o anterior: explique na observação.</p> : null}
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className="rotulo">Observação{regride ? ' *' : ''}</label>
          <textarea className="campo" rows={2} maxLength={2000} disabled={!editavel} value={a.observacao} onChange={(e) => alterar({ observacao: e.target.value })} />
        </div>

        {modoValidacao && !a.fora_de_escopo ? (
          <div className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2">
            <label className="rotulo text-amber-800">% validado pelo planejamento</label>
            <input type="number" inputMode="decimal" min="0" max="100" step="0.5" className="campo" value={valorValidado ?? ''} onChange={(e) => onValidado(e.target.value)} />
          </div>
        ) : null}
        {!modoValidacao && a.percentual_validado !== null && a.percentual_validado !== undefined ? (
          <p className="sm:col-span-2 text-sm text-emerald-700">% validado: <strong>{formatarPercentual(a.percentual_validado)}</strong></p>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ Mão de obra */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mão de obra · {hhTotal.toLocaleString('pt-BR')} HH</p>
          {editavel ? (
            <button type="button" className="btn-neutro !px-2 !py-1 text-xs" onClick={() => alterar({ mao_obra: [...a.mao_obra, maoObraVazia()] })}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar
            </button>
          ) : null}
        </div>
        {a.mao_obra.length === 0 ? <p className="text-xs text-slate-400">Nenhuma mão de obra lançada.</p> : null}
        <div className="space-y-2">
          {a.mao_obra.map((m) => (
            <div key={m.chave} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[110px_1fr_80px_80px_32px] sm:items-end">
              <div>
                <label className="rotulo">Tipo</label>
                <select className="campo" disabled={!editavel} value={m.tipo} onChange={(e) => alterarMaoObra(m.chave, { tipo: e.target.value })}>
                  <option value="FUNCAO">Por função</option>
                  <option value="NOMINAL">Nominal</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="rotulo">{m.tipo === 'FUNCAO' ? 'Função' : 'Colaborador'}</label>
                {m.tipo === 'FUNCAO' ? (
                  <select className="campo" disabled={!editavel} value={m.funcao_id} onChange={(e) => alterarMaoObra(m.chave, { funcao_id: e.target.value })}>
                    <option value="">Selecione…</option>
                    {catalogos.funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                ) : (
                  <select className="campo" disabled={!editavel} value={m.colaborador_id} onChange={(e) => alterarMaoObra(m.chave, { colaborador_id: e.target.value })}>
                    <option value="">Selecione…</option>
                    {catalogos.colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.funcao ? ` (${c.funcao.nome})` : ''}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="rotulo">Qtd.</label>
                <input type="number" inputMode="decimal" min="1" step="1" className="campo" disabled={!editavel || m.tipo === 'NOMINAL'} value={m.tipo === 'NOMINAL' ? 1 : m.quantidade} onChange={(e) => alterarMaoObra(m.chave, { quantidade: e.target.value })} />
              </div>
              <div>
                <label className="rotulo">Horas</label>
                <input type="number" inputMode="decimal" min="0" max="24" step="0.5" className="campo" disabled={!editavel} value={m.horas} onChange={(e) => alterarMaoObra(m.chave, { horas: e.target.value })} />
              </div>
              {editavel ? (
                <button type="button" className="mb-1 rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remover linha" onClick={() => alterar({ mao_obra: a.mao_obra.filter((x) => x.chave !== m.chave) })}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
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
