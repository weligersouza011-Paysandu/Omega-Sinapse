import { useEffect, useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';

/** Pede um texto (motivo/comentário) antes de uma ação: solicitar, aprovar ou recusar exclusão. */
export default function ModalMotivo({ aberto, titulo, subtitulo, rotulo, obrigatorio = true, textoBotao, perigo = false, onCancelar, onConfirmar }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (aberto) {
      setTexto('');
      setErro('');
    }
  }, [aberto]);

  async function confirmar(evento) {
    evento.preventDefault();
    if (obrigatorio && !texto.trim()) return setErro('Preencha este campo.');
    setEnviando(true);
    setErro('');
    try {
      await onConfirmar(texto.trim());
    } catch (err) {
      setErro(err.message || 'Não foi possível concluir.');
    } finally {
      setEnviando(false);
    }
    return undefined;
  }

  return (
    <ModalBase aberto={aberto} titulo={titulo} subtitulo={subtitulo} onFechar={enviando ? () => {} : onCancelar} tamanho="md">
      <form onSubmit={confirmar} noValidate>
        <div className="space-y-2 px-5 py-5">
          <label className="rotulo" htmlFor="motivo-texto">{rotulo}{obrigatorio ? ' *' : ''}</label>
          <textarea id="motivo-texto" rows={4} maxLength={2000} className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} autoFocus />
          {erro ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onCancelar} disabled={enviando}>Cancelar</button>
          <button type="submit" className={perigo ? 'btn-primario !bg-red-600 hover:!bg-red-700' : 'btn-primario'} disabled={enviando}>
            {enviando ? <Spinner tamanho="sm" /> : null}
            {textoBotao}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}
