import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  Loader2,
  Map as MapIcon,
  MapPin,
  MousePointerClick,
  Pencil,
  Plus,
  Route,
  Trash2,
  X,
} from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarLocalizacaoObra,
  criarLocalizacaoObra,
  removerLocalizacaoObra,
} from '../../hooks/useObras.js';
import { geocodificarReverso } from '../../utils/geocodificacao.js';
import { coordenadasDe } from '../../utils/coordenadas.js';

const MapaLocalizacoes = lazy(() => import('./MapaLocalizacoes.jsx'));

const FORM_VAZIO = {
  tipo: 'PONTO',
  descricao: '',
  latitude: '',
  longitude: '',
  km_inicial: '',
  km_final: '',
  referencia: '',
};

function formatarNumero(valor, casas = 3) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });
}

/** Placeholder exibido enquanto o chunk do Leaflet é carregado. */
function MapaCarregando({ altura = 'h-72' }) {
  return (
    <div
      className={`${altura} flex w-full items-center justify-center gap-2 bg-slate-100 text-xs font-medium text-slate-500`}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Carregando mapa…
    </div>
  );
}

/**
 * Gestão de múltiplas localizações da obra: pontos geográficos (lat/long) e
 * trechos lineares (quilometragem), com inclusão, edição e remoção.
 */
export default function LocalizacoesObra({ obra, podeEditar = false, onObraAtualizada }) {
  const toast = useToast();
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const [sugestaoEndereco, setSugestaoEndereco] = useState('');
  const requisicaoEndereco = useRef(null);

  const localizacoes = obra?.localizacoes || [];

  const localizacoesComCoordenadas = useMemo(
    () => localizacoes.filter((localizacao) => coordenadasDe(localizacao) !== null).length,
    [localizacoes]
  );

  useEffect(
    () => () => {
      requisicaoEndereco.current?.abort();
    },
    []
  );

  function alterar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function cancelarBuscaEndereco() {
    requisicaoEndereco.current?.abort();
    requisicaoEndereco.current = null;
    setBuscandoEndereco(false);
    setSugestaoEndereco('');
  }

  function limparFormulario() {
    cancelarBuscaEndereco();
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setFormAberto(false);
    setErro('');
  }

  function iniciarEdicao(localizacao) {
    cancelarBuscaEndereco();
    setEditandoId(localizacao.id);
    setForm({
      tipo: localizacao.tipo || 'PONTO',
      descricao: localizacao.descricao || '',
      latitude: localizacao.latitude ?? '',
      longitude: localizacao.longitude ?? '',
      km_inicial: localizacao.km_inicial ?? '',
      km_final: localizacao.km_final ?? '',
      referencia: localizacao.referencia || '',
    });
    setFormAberto(true);
    setErro('');
  }

  /**
   * Clique (ou arraste) no mapa: atualiza as coordenadas do formulário e
   * consulta o endereço aproximado no Nominatim. A sugestão só preenche a
   * descrição automaticamente quando o campo ainda está vazio.
   */
  function selecionarNoMapa({ latitude, longitude }) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const descricaoEstavaVazia = !form.descricao.trim();
    setForm((atual) => ({
      ...atual,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
    setSugestaoEndereco('');

    requisicaoEndereco.current?.abort();
    const controlador = new AbortController();
    requisicaoEndereco.current = controlador;
    setBuscandoEndereco(true);

    geocodificarReverso(latitude, longitude, { signal: controlador.signal })
      .then((resultado) => {
        if (!resultado.endereco || controlador.signal.aborted) return;

        setSugestaoEndereco(resultado.endereco);
        if (descricaoEstavaVazia) {
          setForm((atual) =>
            atual.descricao.trim() ? atual : { ...atual, descricao: resultado.endereco }
          );
        }
      })
      .catch((falha) => {
        // A geocodificação é opcional: falhas não bloqueiam o cadastro.
        if (falha.name !== 'AbortError') {
          setSugestaoEndereco('');
        }
      })
      .finally(() => {
        if (requisicaoEndereco.current === controlador) {
          setBuscandoEndereco(false);
        }
      });
  }

  function aplicarSugestao() {
    if (!sugestaoEndereco) return;
    setForm((atual) => ({ ...atual, descricao: sugestaoEndereco }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    setErro('');

    if (!form.descricao.trim()) {
      setErro('Informe a descrição do ponto ou trecho.');
      return;
    }
    if (form.tipo === 'PONTO' && (form.latitude === '' || form.longitude === '')) {
      setErro('Para localizações do tipo Ponto, informe latitude e longitude.');
      return;
    }

    const payload = {
      tipo: form.tipo,
      descricao: form.descricao.trim(),
      referencia: form.referencia.trim() || null,
      latitude: form.tipo === 'PONTO' || form.latitude !== '' ? form.latitude || null : null,
      longitude: form.tipo === 'PONTO' || form.longitude !== '' ? form.longitude || null : null,
      km_inicial: form.tipo === 'TRECHO' || form.km_inicial !== '' ? form.km_inicial || null : null,
      km_final: form.tipo === 'TRECHO' || form.km_final !== '' ? form.km_final || null : null,
    };

    setSalvando(true);
    try {
      const atualizada = editandoId
        ? await atualizarLocalizacaoObra(obra.id, editandoId, payload)
        : await criarLocalizacaoObra(obra.id, payload);

      onObraAtualizada?.(atualizada);
      toast.sucesso(editandoId ? 'Localização atualizada.' : 'Localização adicionada.');
      limparFormulario();
    } catch (err) {
      setErro(err.message || 'Não foi possível salvar a localização.');
      toast.erro(err.message || 'Não foi possível salvar a localização.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(localizacao) {
    if (!window.confirm(`Remover a localização "${localizacao.descricao}"?`)) return;

    try {
      const atualizada = await removerLocalizacaoObra(obra.id, localizacao.id);
      onObraAtualizada?.(atualizada);
      toast.sucesso('Localização removida.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a localização.');
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <MapPin className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Múltiplas localizações
          </h3>
          <p className="text-xs text-slate-500">
            Pontos geográficos e trechos lineares (quilometragem) vinculados à obra.
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            className="btn-neutro"
            onClick={() => (formAberto ? limparFormulario() : setFormAberto(true))}
          >
            {formAberto ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {formAberto ? 'Cancelar' : 'Adicionar localização'}
          </button>
        ) : null}
      </header>

      {formAberto && podeEditar ? (
        <form onSubmit={salvar} className="mb-4 rounded-lg border border-omega-100 bg-omega-50/50 p-3">
          <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Suspense fallback={<MapaCarregando altura="h-64 sm:h-80" />}>
              <MapaLocalizacoes
                localizacoes={localizacoes}
                selecionada={form}
                onSelecionar={selecionarNoMapa}
                chaveFoco={editandoId ?? 'novo'}
                altura="h-64 sm:h-80"
              />
            </Suspense>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <MousePointerClick className="h-3.5 w-3.5 text-omega-600" aria-hidden="true" />
                Clique no mapa para marcar o ponto e arraste o marcador para ajustar.
              </span>
              {form.latitude !== '' && form.longitude !== '' ? (
                <span className="font-mono text-[10px] font-semibold text-slate-600">
                  {formatarNumero(form.latitude, 6)}, {formatarNumero(form.longitude, 6)}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Nenhum ponto selecionado</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="rotulo" htmlFor="locTipo">Tipo</label>
              <select
                id="locTipo"
                className="campo"
                value={form.tipo}
                onChange={(e) => alterar('tipo', e.target.value)}
                disabled={salvando}
              >
                <option value="PONTO">Ponto geográfico</option>
                <option value="TRECHO">Trecho linear (km)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="locDescricao">Descrição do ponto *</label>
              <input
                id="locDescricao"
                className="campo"
                placeholder="Ex.: Travessia do rio, Portão Norte, KM 12+350"
                value={form.descricao}
                onChange={(e) => alterar('descricao', e.target.value)}
                disabled={salvando}
              />
              {buscandoEndereco ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Buscando endereço do ponto…
                </p>
              ) : null}
              {sugestaoEndereco ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Sugestão do mapa:{' '}
                  <button
                    type="button"
                    onClick={aplicarSugestao}
                    className="text-left font-semibold text-omega-700 hover:underline"
                    title="Usar esta descrição"
                  >
                    {sugestaoEndereco}
                  </button>
                </p>
              ) : null}
            </div>

            <div>
              <label className="rotulo" htmlFor="locReferencia">Referência</label>
              <input
                id="locReferencia"
                className="campo"
                placeholder="Ex.: KM 12+350"
                value={form.referencia}
                onChange={(e) => alterar('referencia', e.target.value)}
                disabled={salvando}
              />
            </div>

            {form.tipo === 'PONTO' || form.latitude !== '' || form.longitude !== '' ? (
              <>
                <div>
                  <label className="rotulo" htmlFor="locLatitude">Latitude</label>
                  <input
                    id="locLatitude"
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    className="campo"
                    placeholder="-1.455800"
                    value={form.latitude}
                    onChange={(e) => alterar('latitude', e.target.value)}
                    disabled={salvando}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor="locLongitude">Longitude</label>
                  <input
                    id="locLongitude"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    className="campo"
                    placeholder="-48.490200"
                    value={form.longitude}
                    onChange={(e) => alterar('longitude', e.target.value)}
                    disabled={salvando}
                  />
                </div>
              </>
            ) : null}

            {form.tipo === 'TRECHO' ? (
              <>
                <div>
                  <label className="rotulo" htmlFor="locKmInicial">KM inicial</label>
                  <input
                    id="locKmInicial"
                    type="number"
                    step="any"
                    min="0"
                    className="campo"
                    placeholder="12.350"
                    value={form.km_inicial}
                    onChange={(e) => alterar('km_inicial', e.target.value)}
                    disabled={salvando}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor="locKmFinal">KM final</label>
                  <input
                    id="locKmFinal"
                    type="number"
                    step="any"
                    min="0"
                    className="campo"
                    placeholder="18.900"
                    value={form.km_final}
                    onChange={(e) => alterar('km_final', e.target.value)}
                    disabled={salvando}
                  />
                </div>
              </>
            ) : null}
          </div>

          {erro ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{erro}</p>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-neutro" onClick={limparFormulario} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? <Spinner tamanho="sm" /> : null}
              {editandoId ? 'Salvar alterações' : 'Adicionar'}
            </button>
          </div>
        </form>
      ) : null}

      {!formAberto && localizacoesComCoordenadas > 0 ? (
        <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <MapIcon className="h-3.5 w-3.5 text-omega-600" aria-hidden="true" />
              Mapa da obra
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-omega-500" aria-hidden="true" />
                Pontos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" aria-hidden="true" />
                Trechos
              </span>
              <span className="font-semibold text-slate-600">
                {localizacoesComCoordenadas} no mapa
              </span>
            </div>
          </div>
          <Suspense fallback={<MapaCarregando />}>
            <MapaLocalizacoes localizacoes={localizacoes} altura="h-72" />
          </Suspense>
        </div>
      ) : null}

      {localizacoes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Nenhuma localização cadastrada. Adicione pontos geográficos ou trechos por quilometragem.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {localizacoes.map((localizacao) => {
            const ehTrecho = localizacao.tipo === 'TRECHO';
            const temCoordenadas =
              localizacao.latitude !== null &&
              localizacao.latitude !== undefined &&
              localizacao.longitude !== null &&
              localizacao.longitude !== undefined;

            return (
              <article key={localizacao.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                        ehTrecho
                          ? 'bg-violet-50 text-violet-700 ring-violet-100'
                          : 'bg-omega-50 text-omega-700 ring-omega-100'
                      }`}
                    >
                      {ehTrecho ? <Route className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{localizacao.descricao}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {ehTrecho ? 'Trecho linear' : 'Ponto geográfico'}
                      </p>
                    </div>
                  </div>

                  {podeEditar ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(localizacao)}
                        title="Editar localização"
                        className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-omega-700"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(localizacao)}
                        title="Remover localização"
                        className="rounded p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <dl className="mt-2 space-y-1 text-xs text-slate-600">
                  {localizacao.km_inicial !== null && localizacao.km_inicial !== undefined ? (
                    <div className="flex gap-1">
                      <dt className="font-semibold text-slate-500">KM:</dt>
                      <dd>
                        {formatarNumero(localizacao.km_inicial)}
                        {localizacao.km_final !== null && localizacao.km_final !== undefined
                          ? ` ao ${formatarNumero(localizacao.km_final)}`
                          : ''}
                      </dd>
                    </div>
                  ) : null}

                  {temCoordenadas ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <dt className="font-semibold text-slate-500">Coordenadas:</dt>
                      <dd>
                        {formatarNumero(localizacao.latitude, 7)}, {formatarNumero(localizacao.longitude, 7)}
                      </dd>
                      <a
                        href={`https://www.google.com/maps?q=${localizacao.latitude},${localizacao.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 font-semibold text-omega-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        Mapa
                      </a>
                    </div>
                  ) : null}

                  {localizacao.referencia ? (
                    <div className="flex gap-1">
                      <dt className="font-semibold text-slate-500">Referência:</dt>
                      <dd className="truncate">{localizacao.referencia}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
