import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/** Distância entre o gatilho e o painel flutuante. */
const ESPACO = 6;
/** Altura máxima do painel (a lista rola internamente acima disso). */
const ALTURA_MAXIMA = 288;
/** Altura mínima aceitável para não gerar listas inúteis. */
const ALTURA_MINIMA = 140;

/**
 * Posiciona um painel flutuante (dropdown/autocomplete) abaixo do elemento de
 * disparo, abrindo para cima quando não houver espaço suficiente embaixo.
 *
 * O cálculo usa coordenadas de viewport (`position: fixed`), o que permite
 * renderizar o painel em um portal e escapar do `overflow` dos containers
 * roláveis do modal. A posição é recalculada em rolagem/resize.
 *
 * @param {boolean} ativo o painel está montado?
 * @returns {{gatilhoRef: Function, estilo: object|null}}
 */
export function useFlutuante(ativo) {
  const [gatilho, setGatilho] = useState(null);
  const [estilo, setEstilo] = useState(null);

  const medir = useCallback(() => {
    if (!gatilho) return;

    const caixa = gatilho.getBoundingClientRect();
    const espacoAbaixo = window.innerHeight - caixa.bottom - ESPACO * 2;
    const espacoAcima = caixa.top - ESPACO * 2;
    const altura = Math.min(ALTURA_MAXIMA, Math.max(espacoAbaixo, espacoAcima));
    const paraCima = espacoAbaixo < altura && espacoAcima > espacoAbaixo;

    setEstilo({
      left: caixa.left,
      width: caixa.width,
      maxHeight: Math.max(ALTURA_MINIMA, altura),
      ...(paraCima
        ? { bottom: window.innerHeight - caixa.top + ESPACO }
        : { top: caixa.bottom + ESPACO }),
    });
  }, [gatilho]);

  useLayoutEffect(() => {
    if (ativo) {
      medir();
    } else {
      setEstilo(null);
    }
  }, [ativo, medir]);

  useEffect(() => {
    if (!ativo) return undefined;

    // `capture: true` também captura a rolagem de containers internos do modal.
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);

    return () => {
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
    };
  }, [ativo, medir]);

  return { gatilhoRef: setGatilho, estilo };
}

export default useFlutuante;
