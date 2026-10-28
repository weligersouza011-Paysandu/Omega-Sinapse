import { useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, Image, Plus, Trash2, Upload, Video, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  criarMidiaObra,
  enviarFotosObra,
  removerMidiaObra,
} from '../../hooks/useObras.js';
import { formatarDataHora } from '../../utils/formatters.js';

const FORM_VAZIO = {
  tipo: 'FOTO',
  url: '',
  legenda: '',
  relatorioId: '',
};

/**
 * Galeria de fotos e vídeos da obra. Fotos podem ser enviadas como arquivo
 * (otimizado no back-end) ou informadas por URL; vídeos usam URL pública.
 */
export default function MidiasObra({ obra, podeEditar = false, onObraAtualizada }) {
  const toast = useToast();
  const arquivoRef = useRef(null);

  const [form, setForm] = useState(FORM_VAZIO);
  const [arquivo, setArquivo] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('TODAS');

  const midias = useMemo(() => {
    const lista = [...(obra?.midias || [])];
    if (filtro === 'TODAS') return lista;
    return lista.filter((midia) => midia.tipo === filtro);
  }, [obra?.midias, filtro]);

  const fotos = (obra?.midias || []).filter((midia) => midia.tipo === 'FOTO').length;
  const videos = (obra?.midias || []).filter((midia) => midia.tipo === 'VIDEO').length;

  function limpar() {
    setForm(FORM_VAZIO);
    setArquivo(null);
    setFormAberto(false);
    if (arquivoRef.current) arquivoRef.current.value = '';
  }

  function alterar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(evento) {
    evento.preventDefault();

    if (!form.url.trim() && !arquivo) {
      toast.aviso('Informe a URL da mídia ou envie um arquivo de foto.');
      return;
    }

    setSalvando(true);
    try {
      let url = form.url.trim();

      if (arquivo) {
        const enviado = await enviarFotosObra([arquivo]);
        url = enviado?.fotos?.[0]?.url || enviado?.foto_1;
        if (!url) throw new Error('O upload não retornou a URL da foto.');
      }

      const atualizada = await criarMidiaObra(obra.id, {
        tipo: form.tipo,
        url,
        legenda: form.legenda.trim() || null,
        relatorio_id: form.relatorioId ? Number(form.relatorioId) : null,
      });

      onObraAtualizada?.(atualizada);
      toast.sucesso(form.tipo === 'FOTO' ? 'Foto adicionada.' : 'Vídeo adicionado.');
      limpar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível adicionar a mídia.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(midia) {
    if (!window.confirm(`Remover esta ${midia.tipo === 'FOTO' ? 'foto' : 'vídeo'}?`)) return;

    try {
      const atualizada = await removerMidiaObra(obra.id, midia.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Mídia removida.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a mídia.');
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Image className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Fotos e vídeos
          </h3>
          <p className="text-xs text-slate-500">
            {fotos} foto{fotos === 1 ? '' : 's'} · {videos} vídeo{videos === 1 ? '' : 's'} na galeria da obra.
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            className="btn-primario"
            onClick={() => (formAberto ? limpar() : setFormAberto(true))}
          >
            {formAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {formAberto ? 'Cancelar' : 'Adicionar mídia'}
          </button>
        ) : null}
      </header>

      {formAberto && podeEditar ? (
        <form onSubmit={salvar} className="mb-4 rounded-lg border border-omega-100 bg-omega-50/50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_200px]">
            <div>
              <label className="rotulo" htmlFor="midiaTipo">Tipo</label>
              <select
                id="midiaTipo"
                className="campo"
                value={form.tipo}
                onChange={(e) => {
                  alterar('tipo', e.target.value);
                  setArquivo(null);
                  if (arquivoRef.current) arquivoRef.current.value = '';
                }}
                disabled={salvando}
              >
                <option value="FOTO">Foto</option>
                <option value="VIDEO">Vídeo</option>
              </select>
            </div>

            <div>
              <label className="rotulo" htmlFor="midiaUrl">
                URL {form.tipo === 'FOTO' ? '(ou envie um arquivo)' : '*'}
              </label>
              <input
                id="midiaUrl"
                className="campo"
                placeholder={form.tipo === 'FOTO' ? 'https://.../foto.webp' : 'https://youtube.com/...'}
                value={form.url}
                onChange={(e) => alterar('url', e.target.value)}
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="midiaRelatorio">RDO vinculado</label>
              <select
                id="midiaRelatorio"
                className="campo"
                value={form.relatorioId}
                onChange={(e) => alterar('relatorioId', e.target.value)}
                disabled={salvando}
              >
                <option value="">Sem vínculo</option>
                {(obra?.relatorios || []).map((relatorio) => (
                  <option key={relatorio.id} value={relatorio.id}>
                    #{relatorio.id} · {relatorio.titulo}
                  </option>
                ))}
              </select>
            </div>

            {form.tipo === 'FOTO' ? (
              <div className="sm:col-span-2">
                <label className="rotulo" htmlFor="midiaArquivo">Arquivo da foto</label>
                <input
                  ref={arquivoRef}
                  id="midiaArquivo"
                  type="file"
                  accept="image/*"
                  className="campo file:mr-3 file:rounded file:border-0 file:bg-omega-50 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-omega-700"
                  onChange={(e) => {
                    setArquivo(e.target.files?.[0] || null);
                    if (e.target.files?.[0]) alterar('url', '');
                  }}
                  disabled={salvando}
                />
              </div>
            ) : null}

            <div className={form.tipo === 'FOTO' ? '' : 'sm:col-span-2'}>
              <label className="rotulo" htmlFor="midiaLegenda">Legenda</label>
              <input
                id="midiaLegenda"
                className="campo"
                placeholder="Ex.: Travessia do KM 12+350"
                value={form.legenda}
                onChange={(e) => alterar('legenda', e.target.value)}
                disabled={salvando}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Upload className="h-3 w-3" aria-hidden="true" />
              {form.tipo === 'FOTO'
                ? 'A foto enviada é otimizada automaticamente (WebP).'
                : 'Informe a URL pública do vídeo (YouTube, Vimeo ou Cloudinary).'}
            </p>

            <div className="flex gap-2">
              <button type="button" className="btn-neutro" onClick={limpar} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={salvando}>
                {salvando ? <Spinner tamanho="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Adicionar
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {(obra?.midias || []).length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            ['TODAS', `Todas (${fotos + videos})`],
            ['FOTO', `Fotos (${fotos})`],
            ['VIDEO', `Vídeos (${videos})`],
          ].map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                filtro === valor
                  ? 'border-omega-600 bg-omega-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {midias.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Nenhuma mídia cadastrada. Adicione fotos de campo ou links de vídeos da execução.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {midias.map((midia) => (
            <article key={midia.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {midia.tipo === 'FOTO' ? (
                <a href={midia.url} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={midia.url}
                    alt={midia.legenda || 'Foto da obra'}
                    loading="lazy"
                    className="h-32 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                </a>
              ) : (
                <a
                  href={midia.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-32 w-full flex-col items-center justify-center gap-1 bg-slate-900 text-white"
                >
                  <Video className="h-8 w-8 text-rose-400" aria-hidden="true" />
                  <span className="line-clamp-1 px-2 text-[11px] font-semibold">Abrir vídeo</span>
                </a>
              )}

              <div className="px-2 py-1.5">
                <p className="line-clamp-1 text-[11px] font-semibold text-slate-700">
                  {midia.legenda || (midia.tipo === 'FOTO' ? 'Foto da obra' : 'Vídeo da obra')}
                </p>
                <p className="text-[10px] text-slate-400">
                  {formatarDataHora(midia.created_at)}
                  {midia.relatorio ? ` · RDO #${midia.relatorio.id}` : ''}
                </p>
              </div>

              <div className="absolute right-1 top-1 flex gap-1">
                <a
                  href={midia.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir mídia"
                  className="rounded-full bg-white/90 p-1 text-slate-600 shadow-sm transition hover:text-omega-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                {podeEditar ? (
                  <button
                    type="button"
                    onClick={() => remover(midia)}
                    title="Remover mídia"
                    className="rounded-full bg-white/90 p-1 text-slate-600 shadow-sm transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
