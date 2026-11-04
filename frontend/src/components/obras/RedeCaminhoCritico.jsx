import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, X, Zap } from 'lucide-react';
import { formatarData, formatarPercentual } from '../../utils/formatters.js';

/**
 * Diagrama de rede do caminho crítico ("mapa mental" da lógica do cronograma).
 *
 * As atividades são caixas ligadas pelas predecessoras, fluindo de cima para
 * baixo (linha = profundidade na rede). A cadeia crítica fica em vermelho com
 * fluxo animado; clicar numa atividade destaca tudo o que vem antes e depois
 * dela e abre os detalhes. A roda do mouse rola o mapa (Ctrl + roda aproxima),
 * arrastar move e os botões aproximam, afastam ou ajustam à largura.
 */

const NO_LARGURA = 264;
const NO_ALTURA = 82;
const ESPACO_X = 28;
const ESPACO_Y = 74;
const MARGEM = 40;

const PALETA = ['#2563eb', '#0d9488', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#ca8a04', '#4f46e5', '#059669'];
const ROTULO_TIPO = { FS: 'TI', SS: 'II', FF: 'TT', SF: 'IT' };

const MODOS = [
  { id: 'critico', rotulo: 'Só críticas' },
  { id: 'contexto', rotulo: 'Críticas + vizinhas' },
  { id: 'completo', rotulo: 'Rede completa' },
];

function dataCurta(valor) {
  const texto = formatarData(valor);
  return texto === '—' ? '—' : texto.slice(0, 5);
}

/** Quebra o texto em até `linhas` linhas de ~`largura` caracteres (com reticências). */
function quebrarTexto(texto, largura = 34, linhas = 2) {
  const palavras = String(texto || '').trim().split(/\s+/);
  const resultado = [];
  let atual = '';
  for (const palavra of palavras) {
    if ((atual ? `${atual} ${palavra}` : palavra).length <= largura) {
      atual = atual ? `${atual} ${palavra}` : palavra;
    } else {
      if (atual) resultado.push(atual);
      atual = palavra.length > largura ? `${palavra.slice(0, largura - 1)}…` : palavra;
      if (resultado.length === linhas) break;
    }
  }
  if (resultado.length < linhas && atual) resultado.push(atual);
  if (resultado.length === linhas && palavras.join(' ').length > resultado.join(' ').length) {
    const ultima = resultado[linhas - 1];
    resultado[linhas - 1] = `${ultima.slice(0, Math.max(largura - 1, 1)).replace(/\s+\S*$/, '')}…`;
  }
  return resultado.slice(0, linhas);
}

/** Seleciona nós/arestas do modo e calcula o layout em colunas (profundidade). */
function montarLayout(rede, modo, ocultarConcluidas) {
  const todos = new Map(rede.nos.map((n) => [n.codigo, n]));
  const criticos = new Set(rede.nos.filter((n) => n.caminho_critico).map((n) => n.codigo));

  let visiveis;
  if (modo === 'critico') {
    visiveis = new Set(criticos);
  } else if (modo === 'contexto') {
    visiveis = new Set(criticos);
    rede.arestas.forEach((a) => {
      if (criticos.has(a.de)) visiveis.add(a.para);
      if (criticos.has(a.para)) visiveis.add(a.de);
    });
  } else {
    visiveis = new Set(todos.keys());
  }
  if (ocultarConcluidas) {
    visiveis.forEach((c) => {
      if (todos.get(c)?.situacao === 'CONCLUIDA' && !criticos.has(c)) visiveis.delete(c);
    });
  }

  const arestas = rede.arestas.filter((a) => visiveis.has(a.de) && visiveis.has(a.para));
  const sucessoras = new Map([...visiveis].map((c) => [c, []]));
  const predecessoras = new Map([...visiveis].map((c) => [c, []]));
  arestas.forEach((a) => {
    sucessoras.get(a.de).push(a.para);
    predecessoras.get(a.para).push(a.de);
  });

  // Profundidade = maior caminho a partir das origens (Kahn; ciclos ficam na coluna 0).
  const grau = new Map([...visiveis].map((c) => [c, predecessoras.get(c).length]));
  const rank = new Map([...visiveis].map((c) => [c, 0]));
  const fila = [...visiveis].filter((c) => grau.get(c) === 0);
  while (fila.length) {
    const c = fila.shift();
    sucessoras.get(c).forEach((s) => {
      rank.set(s, Math.max(rank.get(s), rank.get(c) + 1));
      grau.set(s, grau.get(s) - 1);
      if (grau.get(s) === 0) fila.push(s);
    });
  }

  // Linhas ordenadas pelo baricentro das predecessoras e depois por data (menos cruzamentos).
  const colunas = [];
  [...visiveis].forEach((c) => {
    const r = rank.get(c);
    if (!colunas[r]) colunas[r] = [];
    colunas[r].push(c);
  });
  const inicio = (c) => new Date(todos.get(c).inicio || 0).getTime();
  const posicao = new Map();
  colunas.forEach((coluna, r) => {
    if (!coluna) return;
    coluna.sort((a, b) => {
      if (r > 0) {
        const media = (c) => {
          const ps = predecessoras.get(c).filter((p) => posicao.has(p));
          return ps.length ? ps.reduce((s, p) => s + posicao.get(p), 0) / ps.length : Number.MAX_SAFE_INTEGER;
        };
        const diferenca = media(a) - media(b);
        if (diferenca) return diferenca;
      }
      return inicio(a) - inicio(b) || a.localeCompare(b, 'pt-BR', { numeric: true });
    });
    coluna.forEach((c, i) => posicao.set(c, i));
  });

  const larguraMax = Math.max(...colunas.filter(Boolean).map((c) => c.length), 1);
  const nos = [];
  colunas.forEach((linha, r) => {
    if (!linha) return;
    const deslocamento = ((larguraMax - linha.length) * (NO_LARGURA + ESPACO_X)) / 2;
    linha.forEach((c, i) => {
      nos.push({
        ...todos.get(c),
        x: MARGEM + deslocamento + i * (NO_LARGURA + ESPACO_X),
        y: MARGEM + r * (NO_ALTURA + ESPACO_Y),
      });
    });
  });
  const largura = MARGEM * 2 + larguraMax * (NO_LARGURA + ESPACO_X) - ESPACO_X;
  const altura = MARGEM * 2 + Math.max(colunas.length, 1) * (NO_ALTURA + ESPACO_Y) - ESPACO_Y;

  return { nos, arestas, sucessoras, predecessoras, largura, altura, criticos };
}

function corDaFrente(frente, frentes) {
  const i = frentes.indexOf(frente);
  return i < 0 ? '#94a3b8' : PALETA[i % PALETA.length];
}

export default function RedeCaminhoCritico({ rede }) {
  const [modo, setModo] = useState('contexto');
  const [ocultarConcluidas, setOcultarConcluidas] = useState(true);
  const [selecionado, setSelecionado] = useState(null);
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const container = useRef(null);
  const arrasto = useRef(null);

  const layout = useMemo(() => montarLayout(rede, modo, ocultarConcluidas), [rede, modo, ocultarConcluidas]);
  const frentes = useMemo(() => [...new Set(layout.nos.map((n) => n.frente).filter(Boolean))], [layout]);
  const porCodigo = useMemo(() => new Map(layout.nos.map((n) => [n.codigo, n])), [layout]);

  /** Antecessoras + sucessoras (transitivas) do nó selecionado. */
  const destaque = useMemo(() => {
    if (!selecionado || !porCodigo.has(selecionado)) return null;
    const conjunto = new Set([selecionado]);
    const andar = (mapa, inicio) => {
      const pilha = [inicio];
      while (pilha.length) {
        const c = pilha.pop();
        (mapa.get(c) || []).forEach((v) => {
          if (!conjunto.has(v)) {
            conjunto.add(v);
            pilha.push(v);
          }
        });
      }
    };
    andar(layout.predecessoras, selecionado);
    andar(layout.sucessoras, selecionado);
    return conjunto;
  }, [selecionado, layout, porCodigo]);

  const ajustar = useCallback(() => {
    const el = container.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // Cabe na largura (sem passar de 100%); a altura pode crescer e é percorrida rolando.
    const k = Math.max(Math.min(width / layout.largura, 1), 0.35);
    setVista({ k, x: (width - layout.largura * k) / 2, y: Math.max((height - layout.altura * k) / 2, 0) });
  }, [layout]);

  useEffect(() => {
    ajustar();
    setSelecionado(null);
  }, [ajustar]);

  // Vista e tamanho atuais acessíveis no handler nativo da roda.
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const alturaRef = useRef(layout.altura);
  alturaRef.current = layout.altura;

  // Roda: rola o mapa (Shift = horizontal) e devolve a rolagem à página nas
  // extremidades; Ctrl/⌘ + roda aproxima centrado no cursor.
  useEffect(() => {
    const el = container.current;
    if (!el) return undefined;
    const aoRolar = (evento) => {
      if (!evento.ctrlKey && !evento.metaKey) {
        const horizontal = evento.shiftKey ? evento.deltaY : evento.deltaX;
        const vertical = evento.shiftKey ? 0 : evento.deltaY;
        const v = vistaRef.current;
        const alturaVisivel = el.getBoundingClientRect().height;
        const minimoY = Math.min(alturaVisivel - alturaRef.current * v.k - 24, 0);
        const novoY = Math.min(Math.max(v.y - vertical, minimoY), Math.max(v.y, 0));
        // Já no topo/fim do mapa: deixa a página rolar normalmente.
        if (!horizontal && novoY === v.y) return;
        evento.preventDefault();
        const proxima = { ...v, x: v.x - horizontal, y: novoY };
        vistaRef.current = proxima; // rolagens rápidas em sequência usam a posição já atualizada
        setVista(proxima);
        return;
      }
      evento.preventDefault();
      const caixa = el.getBoundingClientRect();
      const mx = evento.clientX - caixa.left;
      const my = evento.clientY - caixa.top;
      setVista((v) => {
        const k = Math.min(Math.max(v.k * (evento.deltaY < 0 ? 1.12 : 1 / 1.12), 0.15), 3);
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', aoRolar, { passive: false });
    return () => el.removeEventListener('wheel', aoRolar);
  }, []);

  const zoom = (fator) => {
    const el = container.current;
    const { width, height } = el.getBoundingClientRect();
    setVista((v) => {
      const k = Math.min(Math.max(v.k * fator, 0.15), 3);
      return { k, x: width / 2 - ((width / 2 - v.x) * k) / v.k, y: height / 2 - ((height / 2 - v.y) * k) / v.k };
    });
  };

  const aoPressionar = (evento) => {
    if (evento.button !== 0) return;
    arrasto.current = { x: evento.clientX, y: evento.clientY, vx: vista.x, vy: vista.y, moveu: false };
  };
  const aoMover = (evento) => {
    const a = arrasto.current;
    if (!a) return;
    const dx = evento.clientX - a.x;
    const dy = evento.clientY - a.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
    setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
  };
  const aoSoltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    return a?.moveu;
  };

  const no = selecionado ? porCodigo.get(selecionado) : null;
  const nomeDe = (c) => porCodigo.get(c)?.descricao || rede.nos.find((n) => n.codigo === c)?.descricao || c;
  const ligacoesDe = (codigo, sentido) =>
    rede.arestas.filter((a) => (sentido === 'pred' ? a.para === codigo : a.de === codigo));

  const caminhoAresta = (a) => {
    const o = porCodigo.get(a.de);
    const d = porCodigo.get(a.para);
    const x1 = o.x + NO_LARGURA / 2;
    const y1 = o.y + NO_ALTURA;
    const x2 = d.x + NO_LARGURA / 2;
    const y2 = d.y;
    if (y2 > y1) {
      const meio = (y2 - y1) / 2;
      return { d: `M${x1},${y1} C${x1},${y1 + meio} ${x2},${y2 - meio} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 };
    }
    // Ligação para cima (ciclo/ordem fora do fluxo): contorna pela direita.
    const direita = Math.max(o.x, d.x) + NO_LARGURA + 40;
    return { d: `M${x1},${y1} C${direita},${y1 + 40} ${direita},${y2 - 40} ${x2},${y2}`, lx: direita - 10, ly: (y1 + y2) / 2 };
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs font-semibold">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModo(m.id)}
              className={`rounded px-2.5 py-1 ${modo === m.id ? 'bg-omega-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={ocultarConcluidas} onChange={(e) => setOcultarConcluidas(e.target.checked)} />
            Ocultar concluídas
          </label>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-5 bg-red-500" aria-hidden="true" /> Ligação crítica
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded border-2 border-red-500 bg-white" aria-hidden="true" /> Atividade crítica
          </span>
          <span>{layout.nos.length} atividade(s) · {layout.arestas.length} ligação(ões)</span>
        </div>
      </div>

      <div
        ref={container}
        className="relative h-[78vh] min-h-[520px] w-full cursor-grab select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-50 active:cursor-grabbing"
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={() => {
          // Nós, painel e botões interrompem a propagação: aqui chega só o clique no fundo.
          if (!aoSoltar()) setSelecionado(null);
        }}
        onPointerLeave={aoSoltar}
      >
        <svg width="100%" height="100%" role="img" aria-label="Diagrama de rede do caminho crítico">
          <defs>
            <marker id="seta-critica" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
            </marker>
            <marker id="seta-normal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
            </marker>
            <pattern id="grade-rede" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#e2e8f0" />
            </pattern>
            <style>{`
              @keyframes fluxo-critico { to { stroke-dashoffset: -20; } }
              .aresta-critica { stroke-dasharray: 8 4; animation: fluxo-critico 1.1s linear infinite; }
              @media (prefers-reduced-motion: reduce) { .aresta-critica { animation: none; } }
            `}</style>
          </defs>
          <rect width="100%" height="100%" fill="url(#grade-rede)" />
          <g transform={`translate(${vista.x},${vista.y}) scale(${vista.k})`}>
            {layout.arestas.map((a) => {
              const critica = layout.criticos.has(a.de) && layout.criticos.has(a.para);
              const apagada = destaque && !(destaque.has(a.de) && destaque.has(a.para));
              const { d, lx, ly } = caminhoAresta(a);
              const rotulo = a.tipo !== 'FS' || a.latencia_dias ? `${ROTULO_TIPO[a.tipo] || a.tipo}${a.latencia_dias ? `${a.latencia_dias > 0 ? '+' : ''}${a.latencia_dias}d` : ''}` : null;
              return (
                <g key={`${a.de}>${a.para}`} opacity={apagada ? 0.12 : 1}>
                  <path
                    d={d}
                    fill="none"
                    stroke={critica ? '#ef4444' : '#94a3b8'}
                    strokeWidth={critica ? 2.6 : 1.4}
                    className={critica ? 'aresta-critica' : undefined}
                    markerEnd={`url(#${critica ? 'seta-critica' : 'seta-normal'})`}
                  />
                  {rotulo ? (
                    <text x={lx + 8} y={ly + 4} textAnchor="start" fontSize="11" fontWeight="700" fill={critica ? '#dc2626' : '#64748b'}>
                      {rotulo}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {layout.nos.map((n) => {
              const critica = n.caminho_critico;
              const concluida = n.situacao === 'CONCLUIDA';
              const apagado = destaque && !destaque.has(n.codigo);
              const ativo = selecionado === n.codigo;
              const linhas = quebrarTexto(n.descricao, 36, 2);
              const cor = corDaFrente(n.frente, frentes);
              const avanco = Math.min(Math.max(Number(n.avanco_fisico_real) || 0, 0), 100);
              return (
                <g
                  key={n.codigo}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={apagado ? 0.18 : 1}
                  className="cursor-pointer"
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (!aoSoltar()) setSelecionado(ativo ? null : n.codigo);
                  }}
                >
                  <title>{`${n.codigo} · ${n.descricao}\n${formatarData(n.inicio)} → ${formatarData(n.termino)} · folga ${n.folga_total_dias ?? '—'} d`}</title>
                  <rect
                    width={NO_LARGURA}
                    height={NO_ALTURA}
                    rx="10"
                    fill={concluida ? '#f8fafc' : '#ffffff'}
                    stroke={ativo ? '#1e3a8a' : critica ? '#ef4444' : '#cbd5e1'}
                    strokeWidth={ativo ? 3 : critica ? 2.2 : 1}
                    filter={critica ? 'drop-shadow(0 2px 4px rgba(239,68,68,0.25))' : undefined}
                  />
                  <rect width="7" height={NO_ALTURA} rx="3.5" fill={cor} />
                  <text x="16" y="18" fontSize="11" fontWeight="700" fill="#64748b" fontFamily="ui-monospace, monospace">
                    {n.codigo}
                  </text>
                  <text x={NO_LARGURA - 12} y="18" fontSize="11" fontWeight="700" textAnchor="end" fill={critica ? '#dc2626' : '#64748b'}>
                    {critica ? '⚡ ' : ''}Folga {n.folga_total_dias ?? '—'}d
                  </text>
                  {linhas.map((linha, i) => (
                    <text key={i} x="16" y={37 + i * 15} fontSize="13" fontWeight="600" fill={concluida ? '#94a3b8' : '#1e293b'}>
                      {linha}
                    </text>
                  ))}
                  <text x="16" y={NO_ALTURA - 10} fontSize="11" fill="#64748b">
                    {dataCurta(n.inicio)} → {dataCurta(n.termino)} · {Math.round(avanco)}%
                  </text>
                  <rect x="140" y={NO_ALTURA - 17} width={NO_LARGURA - 154} height="6" rx="3" fill="#e2e8f0" />
                  <rect
                    x="140"
                    y={NO_ALTURA - 17}
                    width={((NO_LARGURA - 154) * avanco) / 100}
                    height="6"
                    rx="3"
                    fill={concluida ? '#10b981' : avanco > 0 ? '#f59e0b' : '#e2e8f0'}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {[
            { Icone: Plus, rotulo: 'Aproximar', acao: () => zoom(1.25) },
            { Icone: Minus, rotulo: 'Afastar', acao: () => zoom(0.8) },
            { Icone: Maximize2, rotulo: 'Ajustar à largura', acao: ajustar },
          ].map(({ Icone, rotulo, acao }) => (
            <button
              key={rotulo}
              type="button"
              title={rotulo}
              aria-label={rotulo}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={acao}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>

        {frentes.length ? (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[60%] rounded-md border border-slate-200 bg-white/90 px-2 py-1.5 text-[10px] text-slate-600 shadow-sm">
            {frentes.map((f) => (
              <p key={f} className="flex items-center gap-1.5 truncate">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: corDaFrente(f, frentes) }} aria-hidden="true" />
                {f}
              </p>
            ))}
          </div>
        ) : null}

        {!layout.nos.length ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Nenhuma atividade para exibir neste modo.</div>
        ) : null}

        {no ? (
          <aside
            className="absolute right-3 top-3 max-h-[calc(100%-1.5rem)] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] text-slate-400">{no.codigo}{no.id_origem ? ` · Id ${no.id_origem}` : ''}</p>
                <p className="text-sm font-bold text-slate-800">{no.descricao}</p>
                {no.frente ? <p className="text-[11px] text-slate-500">{no.frente}</p> : null}
              </div>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setSelecionado(null)} aria-label="Fechar detalhes">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {no.caminho_critico ? (
              <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                <Zap className="h-3 w-3" aria-hidden="true" /> Caminho crítico
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <dt className="text-slate-400">Início</dt>
              <dd className="font-semibold text-slate-700">{formatarData(no.inicio)}</dd>
              <dt className="text-slate-400">Término</dt>
              <dd className="font-semibold text-slate-700">{formatarData(no.termino)}</dd>
              <dt className="text-slate-400">Término LB</dt>
              <dd className="text-slate-700">{formatarData(no.termino_lb)}</dd>
              <dt className="text-slate-400">Folga total</dt>
              <dd className={`font-bold ${no.folga_total_dias <= 0 ? 'text-red-600' : 'text-slate-700'}`}>{no.folga_total_dias ?? '—'} dia(s)</dd>
              <dt className="text-slate-400">Duração</dt>
              <dd className="text-slate-700">{no.duracao_dias ?? '—'} dia(s)</dd>
              <dt className="text-slate-400">Avanço</dt>
              <dd className="text-slate-700">{formatarPercentual(no.avanco_fisico_real, 0)} · {{ NAO_INICIADA: 'não iniciada', EM_ANDAMENTO: 'em andamento', CONCLUIDA: 'concluída' }[no.situacao]}</dd>
            </dl>
            {[
              ['Predecessoras', ligacoesDe(no.codigo, 'pred'), 'de'],
              ['Sucessoras', ligacoesDe(no.codigo, 'suc'), 'para'],
            ].map(([titulo, lista, campo]) => (
              <div key={titulo} className="mt-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{titulo} ({lista.length})</p>
                {lista.length ? (
                  <ul className="space-y-1">
                    {lista.map((a) => (
                      <li key={`${a.de}>${a.para}`}>
                        <button type="button" className="w-full rounded border border-slate-100 px-2 py-1 text-left hover:bg-slate-50" onClick={() => setSelecionado(a[campo])}>
                          <span className="font-mono text-[10px] text-slate-400">{a[campo]}</span>{' '}
                          <span className="text-slate-700">{nomeDe(a[campo])}</span>
                          <span className="ml-1 text-[10px] font-bold text-slate-500">
                            {ROTULO_TIPO[a.tipo] || a.tipo}
                            {a.latencia_dias ? `${a.latencia_dias > 0 ? '+' : ''}${a.latencia_dias}d` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
            ))}
          </aside>
        ) : null}
      </div>
      <p className="text-[11px] text-slate-500">
        Role o mouse para descer pelo mapa (Ctrl + roda aproxima ou afasta), arraste para mover e clique numa atividade para ver a
        cadeia dela (antes e depois) e os detalhes.
      </p>
    </div>
  );
}
