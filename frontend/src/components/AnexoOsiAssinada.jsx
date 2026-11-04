import { useRef, useState } from 'react';
import { Paperclip, Upload } from 'lucide-react';
import Spinner from './Spinner.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { enviarDocumento } from '../hooks/useObras.js';
import { formatarDataHora } from '../utils/formatters.js';

/**
 * Texto de situação da OSI. A pendência só é cumprida com a OSI assinada
 * anexada; emitir no sistema serve para imprimir e colher as assinaturas.
 */
export function descricaoOsi(obra) {
  if (obra?.osi_anexo_url) {
    return `OSI assinada anexada${obra.osi_anexada_em ? ` em ${formatarDataHora(obra.osi_anexada_em)}` : ''}${
      obra.osi_numero ? ` · nº ${obra.osi_numero}` : ''
    }.`;
  }
  if (obra?.osi_emitida_em) {
    return `Emitida em ${formatarDataHora(obra.osi_emitida_em)} por ${
      obra.osi_emitida_por_nome || 'usuário do sistema'
    }. Imprima, colha as assinaturas e anexe a OSI assinada para concluir.`;
  }
  return 'Emita a OSI para assinatura ou anexe a OSI já assinada (imagem ou PDF). Só a OSI anexada conclui a pendência.';
}

/**
 * Botões "Ver OSI assinada" e "Anexar/Substituir OSI assinada". Envia o arquivo
 * e chama `onAnexar(url)`, que grava o anexo na obra.
 */
export default function AnexoOsiAssinada({ obra, podeDocumentar, onAnexar, idCampo = 'arquivoOsiAssinada' }) {
  const toast = useToast();
  const entrada = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const anexada = Boolean(obra?.osi_anexo_url);

  async function anexar(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    try {
      const documento = await enviarDocumento(arquivo);
      await onAnexar(documento.url);
    } catch (err) {
      toast.erro(err.message || 'Não foi possível enviar a OSI assinada.');
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <>
      {anexada ? (
        <a href={obra.osi_anexo_url} target="_blank" rel="noreferrer" className="btn-neutro">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          Ver OSI assinada
        </a>
      ) : null}
      {podeDocumentar ? (
        <>
          <input
            ref={entrada}
            id={idCampo}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={anexar}
            disabled={enviando}
          />
          <label
            htmlFor={idCampo}
            className={`${anexada ? 'btn-neutro' : 'btn-primario'} cursor-pointer ${enviando ? 'pointer-events-none opacity-60' : ''}`}
          >
            {enviando ? <Spinner tamanho="sm" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {anexada ? 'Substituir OSI assinada' : 'Anexar OSI assinada'}
          </label>
        </>
      ) : null}
    </>
  );
}
