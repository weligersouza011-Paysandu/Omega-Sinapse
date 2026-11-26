import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Search, UserPlus, Users, X } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const DIAS_PADRAO = [true, true, true, true, true, false, false];
const MAX_LINHAS = 80;

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Onde cada matrícula está na semana: [{ frente, equipe, dias }]. */
export function mapaOndeEsta(prog) {
  const mapa = new Map();
  (prog?.frentes || []).forEach((f) => f.equipes.forEach((e) => e.alocacoes.forEach((a) => {
    if (!a.matricula) return;
    const lista = mapa.get(a.matricula) || [];
    lista.push({ frente: f, equipe: e, dias: a.dias || [] });
    mapa.set(a.matricula, lista);
  })));
  return mapa;
}

const rotuloLocal = (l) => `${l.frente.obra?.orcamento?.ss || l.frente.codigo || l.frente.titulo} · ${l.equipe.codigo || 'equipe'}`;

/**
 * Próximo código de equipe para a disciplina, no padrão da planilha (ELE-01, MEC-04...): prefixo com as
 * 3 primeiras letras da disciplina e o número seguinte ao maior já usado na semana.
 */
export function sugerirCodigo(prog, disciplina) {
  const prefixo = semAcento(disciplina).replace(/[^A-Z]/g, '').slice(0, 3);
  if (!prefixo) return '';
  let maior = 0;
  (prog?.frentes || []).forEach((f) => f.equipes.forEach((e) => {
    const m = new RegExp(`^${prefixo}-(\\d+)$`).exec(String(e.codigo || '').toUpperCase());
    if (m) maior = Math.max(maior, Number(m[1]));
  }));
  return `${prefixo}-${String(maior + 1).padStart(2, '0')}`;
}

function SeletorDias({ dias, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DIAS.map((d, i) => (
        <button key={d} type="button" aria-pressed={dias[i]} onClick={() => onChange(dias.map((v, j) => (j === i ? !v : v)))}
          className={`h-8 w-12 rounded text-xs font-bold transition ${dias[i] ? 'bg-omega-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{d}</button>
      ))}
    </div>
  );
}

/**
 * Busca no efetivo do contrato e marca as pessoas (várias de uma vez). Mostra a função do cadastro
 * (não precisa lembrar o nome da função), a disciplina e onde a pessoa já está programada na semana.
 */
function SeletorPessoas({ efetivo, ondeEsta, dias, selecionadas, onChange, bloqueadas = new Set() }) {
  const [busca, setBusca] = useState('');
  const [soLivres, setSoLivres] = useState(false);
  const marcadas = new Set(selecionadas.map((p) => p.matricula));
  const conflita = (c) => (ondeEsta.get(c.matricula) || []).some((l) => dias.some((v, i) => v && l.dias?.[i]));

  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  const candidatos = efetivo
    .filter((c) => c.matricula && c.mobilizado !== false)
    .filter((c) => !soLivres || !(ondeEsta.get(c.matricula) || []).length)
    .filter((c) => {
      const texto = semAcento(`${c.nome} ${c.matricula} ${c.funcao || ''} ${c.cargo || ''} ${c.disciplina || ''} ${c.encarregado || ''}`);
      return termos.every((t) => texto.includes(t));
    })
    // Sem programação primeiro (quem precisa ser distribuído), depois por nome.
    .sort((a, b) => Number(Boolean((ondeEsta.get(a.matricula) || []).length)) - Number(Boolean((ondeEsta.get(b.matricula) || []).length)) || a.nome.localeCompare(b.nome));

  const alternar = (c) => onChange(marcadas.has(c.matricula)
    ? selecionadas.filter((p) => p.matricula !== c.matricula)
    : [...selecionadas, { matricula: c.matricula, nome: c.nome, funcao: c.funcao || '' }]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input className="campo !pl-8" autoFocus placeholder="Buscar por nome, matrícula, função, disciplina ou encarregado" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </span>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={soLivres} onChange={(e) => setSoLivres(e.target.checked)} /> Só quem está sem programação
        </label>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        {candidatos.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">Ninguém encontrado no efetivo do contrato.</p> : null}
        {candidatos.slice(0, MAX_LINHAS).map((c) => {
          const locais = ondeEsta.get(c.matricula) || [];
          const nestaEquipe = bloqueadas.has(c.matricula);
          const marcada = marcadas.has(c.matricula);
          return (
            <button key={c.matricula} type="button" disabled={nestaEquipe} onClick={() => alternar(c)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 ${marcada ? 'bg-omega-50' : 'hover:bg-slate-50'} ${nestaEquipe ? 'cursor-not-allowed opacity-50' : ''}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${marcada ? 'border-omega-600 bg-omega-600 text-white' : 'border-slate-300'}`}>
                {marcada ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{c.nome}</span>
                <span className="block truncate text-xs text-slate-500">
                  <span className="font-mono">{c.matricula}</span> · <span className="font-semibold text-slate-700">{c.funcao || 'sem função'}</span>
                  {c.disciplina ? ` · ${c.disciplina}` : ''}{c.encarregado ? ` · enc. ${c.encarregado}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px]">
                {nestaEquipe ? <span className="font-semibold text-slate-500">já nesta equipe</span>
                  : c.situacao === 'INDISPONIVEL' ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 font-bold text-slate-600">Indisponível</span>
                    : locais.length ? <span className={`font-semibold ${conflita(c) ? 'text-amber-700' : 'text-slate-500'}`}>{conflita(c) ? <AlertTriangle className="mr-0.5 inline h-3 w-3" /> : null}{locais.map(rotuloLocal).join(', ')}</span>
                      : <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Sem programação</span>}
              </span>
            </button>
          );
        })}
        {candidatos.length > MAX_LINHAS ? <p className="p-2 text-center text-xs text-slate-500">Mostrando {MAX_LINHAS} de {candidatos.length}. Refine a busca.</p> : null}
      </div>

      {selecionadas.length ? (
        <div className="rounded-lg border border-omega-200 bg-omega-50/40 p-2">
          <p className="mb-1.5 text-xs font-bold text-slate-700">{selecionadas.length} selecionada(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {selecionadas.map((p) => (
              <span key={p.matricula} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs">
                <span className="font-semibold text-slate-800">{p.nome}</span>
                <span className="text-slate-500">· {p.funcao || 'sem função'}</span>
                <button type="button" aria-label={`Tirar ${p.nome}`} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  onClick={() => onChange(selecionadas.filter((x) => x.matricula !== p.matricula))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AvisoConflito({ selecionadas, ondeEsta, dias }) {
  const lista = selecionadas.filter((p) => (ondeEsta.get(p.matricula) || []).some((l) => dias.some((v, i) => v && l.dias?.[i])));
  if (!lista.length) return null;
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
      Já programado(s) em algum desses dias: {lista.map((p) => p.nome).join(', ')}. Vai aparecer em Conflitos; ajuste os dias na outra equipe se for troca.
    </p>
  );
}

/**
 * Nova equipe na frente, já com as pessoas: disciplina, código (sugerido), dias, pessoas do efetivo
 * (ao menos uma) e, se quiser, as principais atividades e premissas.
 */
export function ModalNovaEquipe({ aberto, frente, prog, efetivo, onFechar, onCriar }) {
  const [disciplina, setDisciplina] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoManual, setCodigoManual] = useState(false);
  const [dias, setDias] = useState(DIAS_PADRAO);
  const [pessoas, setPessoas] = useState([]);
  const [atividades, setAtividades] = useState('');
  const [premissas, setPremissas] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ondeEsta = useMemo(() => mapaOndeEsta(prog), [prog]);

  useEffect(() => {
    if (!aberto) return;
    setDisciplina(''); setCodigo(''); setCodigoManual(false); setDias(DIAS_PADRAO); setPessoas([]); setAtividades(''); setPremissas('');
  }, [aberto]);

  // Disciplinas já usadas nas equipes da semana e no efetivo.
  const disciplinas = useMemo(() => [...new Set([
    ...(prog?.frentes || []).flatMap((f) => f.equipes.map((e) => e.disciplina)),
    ...efetivo.map((c) => c.disciplina),
  ].filter(Boolean).map((d) => String(d).trim().toUpperCase()))].sort(), [prog, efetivo]);

  const mudarDisciplina = (v) => {
    setDisciplina(v);
    if (!codigoManual) setCodigo(sugerirCodigo(prog, v));
  };
  // Disciplina vazia e pessoas escolhidas: sugere a disciplina mais comum entre elas.
  const mudarPessoas = (lista) => {
    setPessoas(lista);
    if (!disciplina && lista.length) {
      const c = efetivo.find((x) => x.matricula === lista[0].matricula);
      if (c?.disciplina) mudarDisciplina(String(c.disciplina).toUpperCase());
    }
  };

  const pronto = (disciplina.trim() || codigo.trim()) && pessoas.length > 0 && dias.some(Boolean);
  const criar = async () => {
    setSalvando(true);
    const ok = await onCriar({
      codigo: codigo.trim(), disciplina: disciplina.trim(), atividades: atividades.trim() || null, premissas: premissas.trim() || null,
      pessoas: pessoas.map((p) => ({ ...p, dias })),
    });
    setSalvando(false);
    if (ok) onFechar();
  };

  return (
    <ModalBase aberto={aberto} onFechar={onFechar} tamanho="xl" titulo={`Nova equipe · ${frente?.obra?.orcamento?.ss || frente?.codigo || ''} ${frente?.titulo || ''}`}
      subtitulo="Dê nome à equipe, escolha os dias e coloque ao menos uma pessoa do efetivo.">
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <div>
            <label className="rotulo" htmlFor="nova-equipe-disciplina">Disciplina / nome da equipe *</label>
            <input id="nova-equipe-disciplina" className="campo" list="nova-equipe-disciplinas" placeholder="Ex.: ELÉTRICA, ANDAIME, MECÂNICA"
              value={disciplina} onChange={(e) => mudarDisciplina(e.target.value.toUpperCase())} />
            <datalist id="nova-equipe-disciplinas">{disciplinas.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
          <div>
            <label className="rotulo" htmlFor="nova-equipe-codigo">Código</label>
            <input id="nova-equipe-codigo" className="campo font-mono font-bold" placeholder="ELE-01" value={codigo}
              onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setCodigoManual(true); }} />
          </div>
        </div>
        <div>
          <p className="rotulo">Dias da equipe</p>
          <SeletorDias dias={dias} onChange={setDias} />
        </div>
        <div>
          <p className="rotulo"><Users className="mr-1 inline h-3.5 w-3.5" />Pessoas da equipe * <span className="font-normal normal-case text-slate-500">(a função vem do cadastro)</span></p>
          <SeletorPessoas efetivo={efetivo} ondeEsta={ondeEsta} dias={dias} selecionadas={pessoas} onChange={mudarPessoas} />
        </div>
        <AvisoConflito selecionadas={pessoas} ondeEsta={ondeEsta} dias={dias} />
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="rotulo" htmlFor="nova-equipe-atividades">Principais atividades (opcional)</label>
            <textarea id="nova-equipe-atividades" className="campo min-h-[4.5rem]" placeholder="> Atividade programada..." value={atividades} onChange={(e) => setAtividades(e.target.value)} /></div>
          <div><label className="rotulo" htmlFor="nova-equipe-premissas">Premissas / pendências (opcional)</label>
            <textarea id="nova-equipe-premissas" className="campo min-h-[4.5rem]" placeholder="> Material, munck, PT, liberação..." value={premissas} onChange={(e) => setPremissas(e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {!pronto ? <span className="mr-auto text-xs text-slate-500">Falta: {[!(disciplina.trim() || codigo.trim()) && 'disciplina', !pessoas.length && 'ao menos uma pessoa', !dias.some(Boolean) && 'um dia'].filter(Boolean).join(', ')}.</span> : null}
          <button type="button" className="btn-neutro" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={!pronto || salvando} onClick={criar}>
            <Users className="h-4 w-4" /> {salvando ? 'Criando...' : `Criar equipe com ${pessoas.length} pessoa(s)`}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

/** Adicionar pessoas do efetivo a uma equipe existente (várias de uma vez), com os dias. */
export function ModalAdicionarPessoas({ aberto, equipe, prog, efetivo, onFechar, onAdicionar }) {
  const [dias, setDias] = useState(DIAS_PADRAO);
  const [pessoas, setPessoas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const ondeEsta = useMemo(() => mapaOndeEsta(prog), [prog]);
  const nestaEquipe = useMemo(() => new Set((equipe?.alocacoes || []).map((a) => a.matricula).filter(Boolean)), [equipe]);

  useEffect(() => {
    if (!aberto) return;
    // Mesmos dias da maioria da equipe (ou SEG–SEX).
    const primeira = equipe?.alocacoes?.[0]?.dias;
    setDias(Array.isArray(primeira) && primeira.length === 7 ? primeira.map(Boolean) : DIAS_PADRAO);
    setPessoas([]);
  }, [aberto, equipe]);

  const adicionar = async () => {
    setSalvando(true);
    const ok = await onAdicionar(pessoas.map((p) => ({ ...p, dias })));
    setSalvando(false);
    if (ok) onFechar();
  };

  return (
    <ModalBase aberto={aberto} onFechar={onFechar} tamanho="xl" titulo={`Adicionar pessoa · ${equipe?.codigo || 'Equipe'}${equipe?.disciplina ? ` · ${equipe.disciplina}` : ''}`}
      subtitulo="Busque no efetivo do contrato: a função vem do cadastro.">
      <div className="space-y-4 p-5">
        <SeletorPessoas efetivo={efetivo} ondeEsta={ondeEsta} dias={dias} selecionadas={pessoas} onChange={setPessoas} bloqueadas={nestaEquipe} />
        <div>
          <p className="rotulo">Dias</p>
          <SeletorDias dias={dias} onChange={setDias} />
        </div>
        <AvisoConflito selecionadas={pessoas} ondeEsta={ondeEsta} dias={dias} />
        <p className="text-xs text-slate-500">Não achou a pessoa? Ela precisa estar no efetivo: use <strong>Mobilizar pessoa</strong> na aba Efetivo do contrato.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-neutro" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primario" disabled={!pessoas.length || !dias.some(Boolean) || salvando} onClick={adicionar}>
            <UserPlus className="h-4 w-4" /> {salvando ? 'Adicionando...' : `Adicionar ${pessoas.length || ''} pessoa(s)`}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}
