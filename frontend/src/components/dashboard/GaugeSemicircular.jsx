/**
 * Gauge semicircular em SVG puro (sem dependência de gráficos).
 *
 * O arco vai de 0% (esquerda) a 100% (direita). O valor é desenhado com
 * `pathLength="100"`, o que permite usar o próprio percentual no dasharray.
 */
export default function GaugeSemicircular({
  percentual = 0,
  cor = '#164b7d',
  textoPrincipal = '—',
  textoSecundario = '',
  meta = null,
  rotuloInicio = '0%',
  rotuloFim = '100%',
  ariaLabel,
  className = '',
}) {
  const CENTRO_X = 110;
  const CENTRO_Y = 112;
  const RAIO = 86;

  const valor = Math.max(0, Math.min(100, Number(percentual) || 0));
  const temMeta = Number.isFinite(Number(meta));
  const metaSegura = temMeta ? Math.max(0, Math.min(100, Number(meta))) : null;

  const anguloMeta = metaSegura !== null ? Math.PI * (1 - metaSegura / 100) : 0;
  const metaX1 = CENTRO_X + (RAIO - 8) * Math.cos(anguloMeta);
  const metaY1 = CENTRO_Y - (RAIO - 8) * Math.sin(anguloMeta);
  const metaX2 = CENTRO_X + (RAIO + 6) * Math.cos(anguloMeta);
  const metaY2 = CENTRO_Y - (RAIO + 6) * Math.sin(anguloMeta);

  return (
    <div className={className}>
      <svg
        viewBox="0 0 220 145"
        className="mx-auto block w-full max-w-[330px]"
        role="img"
        aria-label={ariaLabel || `Indicador em ${valor.toLocaleString('pt-BR')} por cento`}
      >
        {/* Trilha do arco. */}
        <path
          d={`M ${CENTRO_X - RAIO} ${CENTRO_Y} A ${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Valor preenchido. */}
        <path
          d={`M ${CENTRO_X - RAIO} ${CENTRO_Y} A ${RAIO} ${RAIO} 0 0 1 ${CENTRO_X + RAIO} ${CENTRO_Y}`}
          fill="none"
          stroke={cor}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${valor} 100`}
          style={{ transition: 'stroke-dasharray 500ms ease-out' }}
        />

        {/* Marca da meta (opcional). */}
        {metaSegura !== null ? (
          <line
            x1={metaX1}
            y1={metaY1}
            x2={metaX2}
            y2={metaY2}
            stroke="#334155"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}

        <text
          x={CENTRO_X}
          y="92"
          textAnchor="middle"
          fontSize="30"
          fontWeight="800"
          fill="#0f172a"
          letterSpacing="-1"
        >
          {textoPrincipal}
        </text>

        {textoSecundario ? (
          <text x={CENTRO_X} y="111" textAnchor="middle" fontSize="11" fill="#64748b">
            {textoSecundario}
          </text>
        ) : null}

        <text x="18" y="136" fontSize="10" fill="#94a3b8">
          {rotuloInicio}
        </text>
        <text x="202" y="136" textAnchor="end" fontSize="10" fill="#94a3b8">
          {rotuloFim}
        </text>
      </svg>
    </div>
  );
}
