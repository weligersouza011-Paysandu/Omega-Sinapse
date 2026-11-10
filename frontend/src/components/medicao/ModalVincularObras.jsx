import { useEffect, useMemo, useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listarQuadroObras } from '../../hooks/useObras.js';
import { vincularObrasAoContrato } from '../../hooks/useMedicao.js';
import { formatarMoeda } from '../../utils/formatters.js';

function rotuloObra(obra) {
  return obra.ss || obra.osi_numero || `Obra #${obra.id}`;
}

/** Vínculo de obras (SS) ao contrato-mãe, com busca e seleção múltipla. */
export default function ModalVincularObras({ aberto, contrato, onFechar, onSalvo }) {
  const toast = useToast();
  const [obras, setObras] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [busca, setBusca] = useState('');
  const [selecionadas, setSelecionadas] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return undefined;
    let ativo = true;
    setBusca('');
    setSelecionadas(new Set());
    setErroCarga('');
    setCarregando(true);

    listarQuadroObras()
      .then((lista) => {
        if (ativo) setObras(lista);
      })
      .catch((err) => {
        if (ativo) setErroCarga(err.message || 'Não foi possível carregar as obras.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto]);

  const jaVinculada = (obra) => obra.contrato_id === contrato?.id;

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return obras.filter((obra) => {
      if (!termo) return true;
      return [obra.ss, obra.osi_numero, obra.pep, obra.descricao]
        .filter(Boolean)
        .some((texto) => String(texto).toLowerCase().includes(termo));
    });
  }, [obras, busca]);

  const selecionaveis = visiveis.filter((obra) => !jaVinculada(obra));
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((obra) => selecionadas.has(obra.id));
  const movidas = obras.filter((obra) => selecionadas.has(obra.id) && obra.contrato_id && !jaVinculada(obra)).length;

  function alternar(id) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarTodas() {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      selecionaveis.forEach((obra) => (todasMarcadas ? proximo.delete(obra.id) : proximo.add(obra.id)));
      return proximo;
    });
  }

  async function confirmar() {
    setEnviando(true);
    try {
      const atualizado = await vincularObrasAoContrato(contrato.id, [...selecionadas]);
      toast.sucesso(`${selecionadas.size} obra(s) vinculada(s) ao ${contrato.id_vale}.`);
      onSalvo(atualizado);
      onFechar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível vincular as obras.');
    } finally {
      setEnviando(false);
    }
  }

  if (!contrato) return null;

  return (
    <ModalBase
      aberto={aberto}
      titulo="Vincular obras ao contrato"
      subtitulo={`${contrato.id_vale} · ${contrato.obras.length} obra(s) já vinculada(s)`}
      onFechar={() => (enviando ? null : onFechar())}
      tamanho="lg"
    >
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="campo min-w-[220px] flex-1"
            placeholder="Buscar por SS, OSI, PEP ou descrição"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar obras"
          />
          <button type="button" className="btn-neutro" onClick={alternarTodas} disabled={selecionaveis.length === 0}>
            {todasMarcadas ? 'Desmarcar visíveis' : 'Marcar visíveis'}
          </button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Spinner tamanho="md" className="text-omega-600" />
            Carregando obras...
          </div>
        ) : erroCarga ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {erroCarga}
          </div>
        ) : visiveis.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Nenhuma obra encontrada.</p>
        ) : (
          <ul className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {visiveis.map((obra) => {
              const vinculada = jaVinculada(obra);
              const marcada = vinculada || selecionadas.has(obra.id);
              const emOutro = obra.contrato_id && !vinculada ? obra.contrato : null;
              return (
                <li key={obra.id}>
                  <label
                    className={`flex items-start gap-3 px-3 py-2.5 text-sm ${
                      vinculada ? 'cursor-default bg-slate-50' : 'cursor-pointer hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={marcada}
                      disabled={vinculada || enviando}
                      onChange={() => alternar(obra.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">
                        {rotuloObra(obra)}
                        {obra.osi_numero && obra.ss ? (
                          <span className="font-normal text-slate-400"> · {obra.osi_numero}</span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-slate-500" title={obra.descricao || ''}>
                        {obra.descricao || 'Sem descrição'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <span className="text-xs font-semibold tabular-nums text-slate-600">{formatarMoeda(obra.valor)}</span>
                      {vinculada ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Vinculada</span>
                      ) : emOutro ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Está no {emOutro.id_vale}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {movidas > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {movidas} obra(s) marcada(s) já estão em outro contrato e passarão para o {contrato.id_vale} (cada obra tem
            um único contrato-mãe).
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-xs text-slate-500">{selecionadas.size} obra(s) selecionada(s)</p>
        <div className="flex gap-3">
          <button type="button" className="btn-neutro" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="btn-primario" onClick={confirmar} disabled={enviando || selecionadas.size === 0}>
            {enviando ? <Spinner tamanho="sm" /> : null}
            Vincular {selecionadas.size > 0 ? selecionadas.size : ''} obra(s)
          </button>
        </div>
      </div>
    </ModalBase>
  );
}
