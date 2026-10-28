import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFlutuante } from '../hooks/useFlutuante.js';

/** Normaliza texto para busca: sem acentos e em minúsculas. */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Campo de texto com sugestões (combobox editável) — usado para o nome do
 * fiscal. Diferente do `Dropdown`, aceita digitação livre e permite escolher
 * uma sugestão para preencher automaticamente o contato correspondente.
 *
 * O painel usa o mesmo posicionamento flutuante (portal + `position: fixed`).
 *
 * @param {object} props
 * @param {string} props.value texto atual
 * @param {(texto:string) => void} props.onChange digitação livre
 * @param {(opcao:{nome:string,contato:string|null}) => void} props.onSelecionar sugestão escolhida
 * @param {{nome:string,contato:string|null}[]} props.opcoes histórico de fiscais
 */
export default function Autocomplete({
  id,
  value,
  onChange,
  onSelecionar,
  opcoes = [],
  placeholder = 'Selecione ou digite...',
  textoVazio = 'Nenhum registro encontrado',
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

  const filtradas = useMemo(() => {
    const termo = normalizar(value);
    if (!termo) return opcoes;
    return opcoes.filter((opcao) => normalizar(opcao.nome).includes(termo));
  }, [opcoes, value]);

  const semOpcoes = filtradas.length === 0;

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
  // não fechar também o modal que hospeda o campo.
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
      }
    }

    document.addEventListener('mousedown', aoClicarFora);
    window.addEventListener('keydown', aoTeclar, true);

    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      window.removeEventListener('keydown', aoTeclar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto || indice < 0) return;
    painelRef.current?.children[indice]?.scrollIntoView({ block: 'nearest' });
  }, [aberto, indice]);

  function escolher(opcao) {
    onSelecionar(opcao);
    setAberto(false);
  }

  function aoTeclar(evento) {
    if (disabled) return;

    if (!aberto) {
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault();
        setIndice(-1);
        setAberto(true);
      }
      return;
    }

    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        setIndice((anterior) => (semOpcoes ? -1 : (anterior + 1) % filtradas.length));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        setIndice((anterior) => (semOpcoes ? -1 : (anterior <= 0 ? filtradas.length : anterior) - 1));
        break;
      case 'Enter':
        if (indice >= 0 && indice < filtradas.length) {
          evento.preventDefault();
          escolher(filtradas[indice]);
        } else {
          setAberto(false);
        }
        break;
      case 'Tab':
      case 'Escape':
        setAberto(false);
        break;
      default:
        break;
    }
  }

  return (
    <>
      <div className="relative" ref={registrarGatilho}>
        <input
          id={identificador}
          className="campo pr-9"
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${identificador}-painel`}
          aria-autocomplete="list"
          aria-activedescendant={indice >= 0 ? `${identificador}-opcao-${indice}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(evento) => {
            onChange(evento.target.value);
            setIndice(-1);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
        />

        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
        >
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

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
                filtradas.map((opcao, posicao) => (
                  <button
                    key={opcao.nome}
                    type="button"
                    id={`${identificador}-opcao-${posicao}`}
                    role="option"
                    aria-selected={posicao === indice}
                    onClick={() => escolher(opcao)}
                    onMouseEnter={() => setIndice(posicao)}
                    className={[
                      'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors',
                      posicao === indice ? 'bg-slate-100' : '',
                    ].join(' ')}
                  >
                    <span className="w-full truncate text-sm font-medium text-slate-700">{opcao.nome}</span>
                    {opcao.contato ? (
                      <span className="w-full truncate text-xs text-slate-400">{opcao.contato}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
