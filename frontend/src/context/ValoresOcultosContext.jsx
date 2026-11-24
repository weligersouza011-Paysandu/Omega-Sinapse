import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { definirMoedaOculta, moedaEstaOculta } from '../utils/formatters.js';

const CHAVE = 'sinapse-valores-ocultos';
const ValoresOcultosContext = createContext({ ocultos: false, alternar: () => {}, definir: () => {} });

function lerSalvo() {
  try {
    return window.localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

function salvar(ocultar) {
  try {
    window.localStorage.setItem(CHAVE, ocultar ? '1' : '0');
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/**
 * "Olho" do cabeçalho: oculta todos os valores em R$ do sistema. O estado vai para o módulo de
 * formatadores já na renderização (nenhum valor aparece nem por um instante) e fica salvo no navegador.
 */
export function ValoresOcultosProvider({ children }) {
  const [ocultos, setOcultos] = useState(() => {
    const inicial = lerSalvo();
    definirMoedaOculta(inicial);
    return inicial;
  });

  const definir = useCallback((ocultar) => {
    const novo = Boolean(ocultar);
    definirMoedaOculta(novo);
    salvar(novo);
    setOcultos(novo);
  }, []);
  const alternar = useCallback(() => definir(!moedaEstaOculta()), [definir]);
  const valor = useMemo(() => ({ ocultos, alternar, definir }), [ocultos, alternar, definir]);

  return <ValoresOcultosContext.Provider value={valor}>{children}</ValoresOcultosContext.Provider>;
}

export const useValoresOcultos = () => useContext(ValoresOcultosContext);
