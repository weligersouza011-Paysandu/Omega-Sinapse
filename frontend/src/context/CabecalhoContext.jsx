import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Espaço da barra superior do layout que uma página pode ocupar com o próprio
 * conteúdo (ex.: o detalhamento da obra exibe SS/PEP, status e ações ali, no
 * lugar do título do módulo).
 */
const CabecalhoContext = createContext({ conteudo: null, definirConteudo: () => {} });

export function CabecalhoProvider({ children }) {
  const [conteudo, definirConteudo] = useState(null);
  return (
    <CabecalhoContext.Provider value={{ conteudo, definirConteudo }}>{children}</CabecalhoContext.Provider>
  );
}

/** Conteúdo personalizado atual da barra superior (ou `null`). */
export function useConteudoCabecalho() {
  return useContext(CabecalhoContext).conteudo;
}

/**
 * Ocupa a barra superior com `conteudo` enquanto a página estiver montada.
 * Passe em `dependencias` os valores que alteram o conteúdo renderizado.
 */
export function useCabecalhoPagina(conteudo, dependencias) {
  const { definirConteudo } = useContext(CabecalhoContext);

  useEffect(() => {
    definirConteudo(conteudo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  useEffect(() => () => definirConteudo(null), [definirConteudo]);
}
