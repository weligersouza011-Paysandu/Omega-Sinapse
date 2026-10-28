const TAMANHOS = {
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

/** Indicador de carregamento circular. */
export default function Spinner({ tamanho = 'md', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent opacity-80 ${TAMANHOS[tamanho] || TAMANHOS.md} ${className}`}
    />
  );
}
