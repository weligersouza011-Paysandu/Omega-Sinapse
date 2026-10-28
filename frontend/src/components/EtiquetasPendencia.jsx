import { CircleAlert, CircleCheck } from 'lucide-react';

/**
 * Etiqueta da régua de pendências documentais da obra (ISO 9001).
 *
 * Recebe o objeto `pendencias` calculado pelo back-end
 * (`{ osi, ata, total, completa }`) e resume, em um único selo, o que ainda
 * falta para a obra ser liberada para execução.
 */
export default function EtiquetasPendencia({ pendencias, className = '' }) {
  if (!pendencias) return null;

  if (pendencias.completa) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ${className}`}
      >
        <CircleCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
        Documentação completa
      </span>
    );
  }

  const itens = [];
  if (pendencias.osi) itens.push('OSI');
  if (pendencias.ata) itens.push('Ata de Partida');

  return (
    <span
      title={`Pendente: ${itens.join(' e ')}`}
      className={`inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 ${className}`}
    >
      <CircleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
      Documentação pendente
      <span className="font-semibold normal-case tracking-normal opacity-90">· {itens.join(' + ')}</span>
    </span>
  );
}
