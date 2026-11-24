import { useState } from 'react';
import ModalBase from '../ModalBase.jsx';
import { formatarData } from '../../utils/formatters.js';

/**
 * Grade de miniaturas de fotos de evidência; clicar abre a foto grande com a identificação
 * (obra, atividade, data, encarregado) quando ela vier junto.
 * `fotos`: [{ id, url, legenda?, data?, obra?, atividade?, encarregado? }]
 */
export default function GaleriaFotos({ fotos, tamanho = 'h-20 w-20', vazio = 'Nenhuma foto.' }) {
  const [aberta, setAberta] = useState(null);
  if (!fotos.length) return <p className="text-xs text-slate-400">{vazio}</p>;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fotos.map((f) => (
          <button key={f.id} type="button" onClick={() => setAberta(f)} className={`${tamanho} overflow-hidden rounded-md border border-slate-200 transition hover:ring-2 hover:ring-omega-500/50`} title={f.atividade?.descricao || f.legenda || 'Ver foto'}>
            <img src={f.url} alt={f.legenda || 'Foto de evidência'} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <ModalBase aberto={Boolean(aberta)} titulo="Foto de evidência" subtitulo={aberta ? [aberta.obra?.ss, aberta.atividade ? `${aberta.atividade.codigo_atividade || 'Fora de escopo'} — ${aberta.atividade.descricao}` : null].filter(Boolean).join(' · ') : ''} tamanho="xl" onFechar={() => setAberta(null)}>
        {aberta ? (
          <div className="space-y-2 p-4">
            <img src={aberta.url} alt={aberta.legenda || 'Foto de evidência'} className="mx-auto max-h-[70vh] rounded-md object-contain" />
            <p className="text-center text-xs text-slate-500">
              {[aberta.data ? formatarData(aberta.data) : null, aberta.encarregado?.nome, aberta.legenda].filter(Boolean).join(' · ')}
            </p>
          </div>
        ) : null}
      </ModalBase>
    </>
  );
}
