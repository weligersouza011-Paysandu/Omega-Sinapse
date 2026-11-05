import { useRef, useState } from 'react';
import { Check, FileText, Paperclip, Upload } from 'lucide-react';
import Spinner from './Spinner.jsx';
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

/** Mesmos limites do servidor (src/config/multer.js), avisados antes do envio. */
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
const FORMATOS_ACEITOS = /\.(pdf|jpe?g|png|webp)$/i;

function formatarTamanho(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Anexo da OSI assinada em duas etapas: escolher o arquivo e confirmar. Só na
 * confirmação o arquivo é enviado e `onAnexar(url)` grava o anexo na obra; a
 * função devolve `false` quando a gravação falha.
 */
export default function AnexoOsiAssinada({ obra, podeDocumentar, onAnexar, idCampo = 'arquivoOsiAssinada' }) {
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  // Evita reenviar o arquivo quando só a gravação na obra precisa ser repetida.
  const urlEnviada = useRef(null);
  const anexada = Boolean(obra?.osi_anexo_url);

  function selecionar(evento) {
    const escolhido = evento.target.files?.[0];
    // Limpa o campo para que o mesmo arquivo possa ser escolhido de novo.
    evento.target.value = '';
    if (!escolhido) return;

    urlEnviada.current = null;
    if (!FORMATOS_ACEITOS.test(escolhido.name)) {
      setArquivo(null);
      setErro(`"${escolhido.name}" não é um formato aceito. Envie um PDF ou uma imagem JPG, PNG ou WEBP.`);
      return;
    }
    if (escolhido.size > TAMANHO_MAXIMO_BYTES) {
      setArquivo(null);
      setErro(`"${escolhido.name}" tem ${formatarTamanho(escolhido.size)}. O limite é de 10 MB: reduza o arquivo e tente de novo.`);
      return;
    }
    setErro('');
    setArquivo(escolhido);
  }

  function cancelar() {
    urlEnviada.current = null;
    setArquivo(null);
    setErro('');
  }

  async function confirmar() {
    setEnviando(true);
    setErro('');
    try {
      if (!urlEnviada.current) {
        const documento = await enviarDocumento(arquivo);
        urlEnviada.current = documento.url;
      }
      const salvou = await onAnexar(urlEnviada.current);
      if (salvou === false) {
        setErro('O arquivo foi enviado, mas não foi salvo na obra. Clique em "Confirmar e salvar" para tentar de novo.');
        return;
      }
      urlEnviada.current = null;
      setArquivo(null);
    } catch (err) {
      setErro(err.message || 'Não foi possível enviar a OSI assinada.');
    } finally {
      setEnviando(false);
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
            id={idCampo}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={selecionar}
            disabled={enviando}
          />
          <label
            htmlFor={idCampo}
            className={`${anexada || arquivo ? 'btn-neutro' : 'btn-primario'} cursor-pointer ${enviando ? 'pointer-events-none opacity-60' : ''}`}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {arquivo ? 'Trocar arquivo' : anexada ? 'Substituir OSI assinada' : 'Anexar OSI assinada'}
          </label>

          {arquivo ? (
            <div className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600">Confira o arquivo e confirme para salvar na obra:</p>
              <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                <FileText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="truncate" title={arquivo.name}>{arquivo.name}</span>
                <span className="shrink-0 text-xs font-normal text-slate-500">{formatarTamanho(arquivo.size)}</span>
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-neutro" onClick={cancelar} disabled={enviando}>
                  Cancelar
                </button>
                <button type="button" className="btn-primario" onClick={confirmar} disabled={enviando}>
                  {enviando ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  {enviando ? 'Enviando...' : 'Confirmar e salvar'}
                </button>
              </div>
            </div>
          ) : null}

          {erro ? (
            <p role="alert" className="w-full text-xs font-medium text-red-600">
              {erro}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
