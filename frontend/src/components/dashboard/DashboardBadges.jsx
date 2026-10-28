import {
  estiloCategoria,
  estiloOrigemRestricao,
  estiloRestricao,
  estiloStatusObra,
} from './dashboardUtils.js';

/** Badge do ciclo de vida operacional da obra. */
export function StatusObraBadge({ status, label, className = '' }) {
  const estilo = estiloStatusObra(status);

  return (
    <span className={`${estilo.classe} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label || estilo.label}
    </span>
  );
}

/** Badge da carteira de planejamento (Cadeia de Ajuda / Coordenação). */
export function CategoriaBadge({ categoria, label, className = '' }) {
  const estilo = estiloCategoria(categoria);
  const texto = label || estilo.label;

  return (
    <span className={`${estilo.classe} max-w-full ${className}`} title={texto}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${estilo.ponto}`} aria-hidden="true" />
      <span className="truncate">{texto}</span>
    </span>
  );
}

/** Badge da situação de uma restrição 6WLA. */
export function StatusRestricaoBadge({ status, label, className = '' }) {
  const estilo = estiloRestricao(status);

  return (
    <span className={`${estilo.classe} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label || estilo.label}
    </span>
  );
}

/** Badge da origem do registro na tabela de restrições. */
export function OrigemRestricaoBadge({ tipo, label, className = '' }) {
  const estilo = estiloOrigemRestricao(tipo);

  return <span className={`${estilo.classe} ${className}`}>{label || estilo.label}</span>;
}
