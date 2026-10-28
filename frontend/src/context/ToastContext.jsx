import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ToastContainer from '../components/ToastContainer.jsx';

const ToastContext = createContext(null);

const DURACAO_PADRAO = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const proximoId = useRef(1);

  const remover = useCallback((id) => {
    setToasts((atuais) => atuais.filter((toast) => toast.id !== id));
  }, []);

  const notificar = useCallback(
    (mensagem, tipo = 'info', duracao = DURACAO_PADRAO) => {
      const id = proximoId.current;
      proximoId.current += 1;

      setToasts((atuais) => [...atuais, { id, mensagem, tipo }]);

      if (duracao > 0) {
        setTimeout(() => remover(id), duracao);
      }
    },
    [remover]
  );

  const sucesso = useCallback((mensagem, duracao) => notificar(mensagem, 'sucesso', duracao), [notificar]);
  const erro = useCallback((mensagem, duracao) => notificar(mensagem, 'erro', duracao), [notificar]);
  const aviso = useCallback((mensagem, duracao) => notificar(mensagem, 'aviso', duracao), [notificar]);
  const info = useCallback((mensagem, duracao) => notificar(mensagem, 'info', duracao), [notificar]);

  // Valor estável: a lista de toasts é renderizada pelo ToastContainer e não
  // precisa vazar no contexto (evita re-renders e dependências instáveis).
  const valor = useMemo(
    () => ({ notificar, sucesso, erro, aviso, info }),
    [notificar, sucesso, erro, aviso, info]
  );

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <ToastContainer toasts={toasts} onFechar={remover} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const contexto = useContext(ToastContext);
  if (!contexto) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  }
  return contexto;
}
