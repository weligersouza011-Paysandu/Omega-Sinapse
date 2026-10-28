import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFlutuante } from '../hooks/useFlutuante.js';

/** Chevron indicador de abertura (gira quando o painel abre). */
function Chevron({ aberto }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
    >
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Marca do item selecionado. */
function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4 shrink-0 text-omega-600">
      <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Dropdown customizado — substitui o `<select>` nativo.
 *
 * O painel é montado em um portal com posicionamento fixo (ver `useFlutuante`),
 * o que evita o corte pelo `overflow` dos containers do modal e permite
 * animação de abertura, sombra refinada e itens com área de clique generosa.
 *
 * @param {object} props
 * @param {string} props.value valor selecionado
 * @param {(valor:string) => void} props.onChange
 * @param {{value:string,label:string,descricao?:string,cor?:string}[]} props.opcoes
 */
export default function Dropdown({
  id,
  value,
  onChange,
  opcoes = [],
  placeholder = 'Selecione...',
  textoVazio = 'Nenhuma opção disponível',
  carregando = false,
  disabled = false,
}) {
  const idGerado = useId();
  const identificador = id || idGerado;

  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [indice, setIndice] = useState(-1);

  const gatilhoRef = useRef(null);
  const painelRef = useRef(null);
  const { gatilhoRef: registrarNoFlutuante, estilo } = useFlutuante(montado);

  const selecionada = opcoes.find((opcao) => opcao.value === value) || null;
  const semOpcoes = opcoes.length === 0;

  /** Registra o gatilho nos dois consumidores (clique-fora e posicionamento). */
  const registrarGatilho = useCallback(
    (no) => {
      gatilhoRef.current = no;
      registrarNoFlutuante(no);
    },
    [registrarNoFlutuante]
  );

  // Abertura/fechamento: mantém o nó no DOM durante a animação de saída.
  useEffect(() => {
    if (!aberto) {
      setVisivel(false);
      const temporizador = setTimeout(() => setMontado(false), 120);
      return () => clearTimeout(temporizador);
    }

    setMontado(true);
    const quadro = requestAnimationFrame(() => setVisivel(true));
    return () => cancelAnimationFrame(quadro);
  }, [aberto]);

  useEffect(() => {
    if (disabled) setAberto(false);
  }, [disabled]);

  // Fecha ao clicar fora. O ESC é capturado na fase de captura do window para
  // não fechar também o modal que hospeda o dropdown.
  useEffect(() => {
    if (!aberto) return undefined;

    function aoClicarFora(evento) {
      const alvo = evento.target;
      if (!(alvo instanceof Node)) return;
      if (gatilhoRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setAberto(false);
    }

    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        evento.stopPropagation();
        setAberto(false);
        gatilhoRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', aoClicarFora);
    window.addEventListener('keydown', aoTeclar, true);

    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      window.removeEventListener('keydown', aoTeclar, true);
    };
  }, [aberto]);

  // Mantém o item ativo visível durante a navegação por teclado.
  useEffect(() => {
    if (!aberto || indice < 0) return;
    painelRef.current?.children[indice]?.scrollIntoView({ block: 'nearest' });
  }, [aberto, indice]);

  function selecionar(opcao) {
    onChange(opcao.value);
    setAberto(false);
    gatilhoRef.current?.focus();
  }

  function abrir(posicao) {
    setIndice(posicao);
    setAberto(true);
  }

  function aoTeclar(evento) {
    if (disabled) return;

    if (!aberto) {
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault();
        abrir(opcoes.findIndex((opcao) => opcao.value === value));
      }
      return;
    }

    const atual = opcoes.findIndex((opcao) => opcao.value === value);

    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        setIndice((anterior) => (semOpcoes ? -1 : (Math.max(anterior, -1) + 1) % opcoes.length));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        setIndice((anterior) => (semOpcoes ? -1 : (anterior <= 0 ? opcoes.length : anterior) - 1));
        break;
      case 'Home':
        evento.preventDefault();
        setIndice(semOpcoes ? -1 : 0);
        break;
      case 'End':
        evento.preventDefault();
        setIndice(opcoes.length - 1);
        break;
      case 'Enter':
        evento.preventDefault();
        if (indice >= 0 && indice < opcoes.length) {
          selecionar(opcoes[indice]);
        } else if (indice < 0 && atual >= 0) {
          setAberto(false);
        }
        break;
      case 'Tab':
        setAberto(false);
        break;
      default:
        break;
    }
  }

  return (
    <>
      <button
        type="button"
        ref={registrarGatilho}
        id={identificador}
        className={[
          'campo flex items-center justify-between gap-2 text-left',
          aberto ? 'border-omega-500 ring-2 ring-omega-500/25' : '',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-slate-400',
        ].join(' ')}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={`${identificador}-painel`}
        aria-activedescendant={indice >= 0 ? `${identificador}-opcao-${indice}` : undefined}
        disabled={disabled}
        onClick={() => (aberto ? setAberto(false) : abrir(opcoes.findIndex((opcao) => opcao.value === value)))}
        onKeyDown={aoTeclar}
      >
        <span className={`min-w-0 flex-1 truncate ${selecionada ? '' : 'text-slate-400'}`}>
          {selecionada
            ? selecionada.descricao || selecionada.label
            : carregando
              ? 'Carregando...'
              : placeholder}
        </span>
        <Chevron aberto={aberto} />
      </button>

      {montado && estilo
        ? createPortal(
            <div
              ref={painelRef}
              id={`${identificador}-painel`}
              role="listbox"
              aria-labelledby={identificador}
              style={{
                position: 'fixed',
                left: estilo.left,
                width: estilo.width,
                maxHeight: estilo.maxHeight,
                ...(estilo.top !== undefined ? { top: estilo.top } : { bottom: estilo.bottom }),
              }}
              className={[
                'z-[60] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5',
                'shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5',
                'transition duration-150 ease-out',
                visivel ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
              ].join(' ')}
            >
              {semOpcoes ? (
                <p className="px-3 py-2 text-sm text-slate-400">{textoVazio}</p>
              ) : (
                opcoes.map((opcao, posicao) => {
                  const ativo = posicao === indice;
                  const escolhido = opcao.value === value;

                  return (
                    <button
                      key={opcao.value}
                      type="button"
                      id={`${identificador}-opcao-${posicao}`}
                      role="option"
                      aria-selected={escolhido}
                      onClick={() => selecionar(opcao)}
                      onMouseEnter={() => setIndice(posicao)}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        escolhido ? 'font-semibold text-omega-700' : 'text-slate-700',
                        ativo ? 'bg-slate-100' : '',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {opcao.cor ? (
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${opcao.cor}`} />
                        ) : null}
                        <span className="truncate">{opcao.descricao || opcao.label}</span>
                      </span>
                      {escolhido ? <Check /> : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
