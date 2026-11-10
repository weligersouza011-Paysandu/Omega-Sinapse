import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CHAVE = 'synapse-tema';
const TemaContext = createContext({ tema: 'claro', escuro: false, alternar: () => {}, definir: () => {} });

function temaInicial() {
  try {
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch {
    /* armazenamento indisponível: segue o sistema */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

/** Tema claro/escuro: escolha do usuário (salva no navegador) ou, na primeira visita, a do sistema. */
export function TemaProvider({ children }) {
  const [tema, setTema] = useState(temaInicial);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle('dark', tema === 'escuro');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'escuro' ? '#0c1321' : '#0a2138');
    try {
      window.localStorage.setItem(CHAVE, tema);
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }, [tema]);

  const definir = useCallback((novo) => setTema(novo === 'escuro' ? 'escuro' : 'claro'), []);
  const alternar = useCallback(() => setTema((atual) => (atual === 'escuro' ? 'claro' : 'escuro')), []);
  const valor = useMemo(() => ({ tema, escuro: tema === 'escuro', alternar, definir }), [tema, alternar, definir]);

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export const useTema = () => useContext(TemaContext);
