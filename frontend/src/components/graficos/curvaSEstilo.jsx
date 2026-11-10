import { Line, ReferenceDot } from 'recharts';
import { formatarData } from '../../utils/formatters.js';
import { CG } from '../../utils/coresGrafico.js';

/**
 * Padrão visual único das Curvas S do Synapse (Cronograma, Visão Geral,
 * Dashboard de Planejamento e Projeção Financeira):
 *
 *  - Previsto (LB): AMARELO contínuo enquanto acumula até 100%; depois de
 *    atingir 100% segue AZUL pontilhado (prazo da linha de base já vencido);
 *  - Real: VERDE contínuo;
 *  - Tendência: CINZA pontilhado;
 *  - Marcos: um ponto claro onde o previsto chega a 100% e outro onde a
 *    tendência chega a 100% — a leitura imediata de "quando deveria terminar"
 *    × "quando vai terminar".
 */
export const CORES_CURVA_S = {
  previsto: '#eab308',
  previstoConcluido: 'rgb(var(--g-azul))',
  real: 'rgb(var(--g-verde))',
  tendencia: '#94a3b8',
  base: '#a855f7',
  marcoPrevisto: 'rgb(var(--g-azul))',
  marcoTendencia: 'rgb(var(--g-neutro))',
};

const CHAVE_ATE = '__previsto_ate_100';
const CHAVE_APOS = '__previsto_apos_100';

function numero(valor) {
  const n = Number(valor);
  return valor === null || valor === undefined || Number.isNaN(n) ? null : n;
}

/**
 * Divide a série prevista no trecho até 100% e no trecho depois de 100% (os
 * dois se encontram no ponto de 100%) e localiza os marcos de chegada.
 *
 * @param {object[]} pontos dados do gráfico (uma linha por semana)
 * @param {{ previsto?: string, tendencia?: string, rotulo?: string, data?: string, alvo?: number|null }} opcoes
 *   `alvo` = valor que representa 100% (100 em %; em R$, o padrão é o maior previsto).
 */
export function prepararCurvaS(pontos = [], opcoes = {}) {
  const { previsto = 'previsto', tendencia = 'tendencia', rotulo = 'rotulo', data = 'data' } = opcoes;
  const valoresPrevistos = pontos.map((p) => numero(p[previsto])).filter((v) => v !== null);
  const alvo = opcoes.alvo ?? (valoresPrevistos.length ? Math.max(...valoresPrevistos) : null);
  const tolerancia = alvo ? Math.abs(alvo) * 0.0005 : 0;
  const atingiu = (valor) => alvo !== null && valor !== null && valor >= alvo - tolerancia;

  const indicePrevisto = pontos.findIndex((p) => atingiu(numero(p[previsto])));
  const indiceTendencia = pontos.findIndex((p) => atingiu(numero(p[tendencia])));

  const dados = pontos.map((p, i) => {
    const valor = numero(p[previsto]);
    return {
      ...p,
      [CHAVE_ATE]: indicePrevisto < 0 || i <= indicePrevisto ? valor : null,
      [CHAVE_APOS]: indicePrevisto >= 0 && i >= indicePrevisto ? valor : null,
    };
  });

  const marco = (indice, campo) =>
    indice < 0
      ? null
      : {
          x: pontos[indice][rotulo],
          y: numero(pontos[indice][campo]),
          rotulo: pontos[indice][rotulo],
          data: pontos[indice][data],
          // Último ponto do eixo: o rótulo vai para a esquerda para não ser cortado.
          naBorda: indice === pontos.length - 1,
        };

  return {
    dados,
    alvo,
    marcos: { previsto: marco(indicePrevisto, previsto), tendencia: marco(indiceTendencia, tendencia) },
  };
}

/** As duas linhas do previsto (amarelo até 100% e azul pontilhado depois). */
export function linhasPrevisto({ nome = 'Previsto (LB)', curva = 'monotone' } = {}) {
  return [
    <Line
      key="previsto-ate"
      type={curva}
      dataKey={CHAVE_ATE}
      name={nome}
      stroke={CORES_CURVA_S.previsto}
      strokeWidth={2.5}
      dot={false}
      activeDot={{ r: 4 }}
      connectNulls
      isAnimationActive={false}
    />,
    <Line
      key="previsto-apos"
      type={curva}
      dataKey={CHAVE_APOS}
      name={`${nome} após 100%`}
      stroke={CORES_CURVA_S.previstoConcluido}
      strokeWidth={2}
      strokeDasharray="6 4"
      dot={false}
      activeDot={{ r: 4 }}
      connectNulls
      isAnimationActive={false}
    />,
  ];
}

/** Pontos de chegada a 100% (previsto e tendência). */
export function marcosCurvaS(marcos) {
  const itens = [];
  if (marcos?.previsto) {
    itens.push(
      <ReferenceDot
        key="marco-previsto"
        x={marcos.previsto.x}
        y={marcos.previsto.y}
        r={6}
        fill={CORES_CURVA_S.marcoPrevisto}
        stroke={CG.superficie}
        strokeWidth={2}
        ifOverflow="extendDomain"
        label={{
          value: 'Previsto 100%',
          position: marcos.previsto.naBorda ? 'left' : 'top',
          fill: CORES_CURVA_S.marcoPrevisto,
          fontSize: 10,
          fontWeight: 700,
        }}
      />
    );
  }
  if (marcos?.tendencia) {
    itens.push(
      <ReferenceDot
        key="marco-tendencia"
        x={marcos.tendencia.x}
        y={marcos.tendencia.y}
        r={6}
        fill={CORES_CURVA_S.marcoTendencia}
        stroke={CG.superficie}
        strokeWidth={2}
        ifOverflow="extendDomain"
        label={{
          value: `Tendência 100%`,
          // Abaixo do ponto (o rótulo do previsto fica acima); na borda, à esquerda.
          position: marcos.tendencia.naBorda && !marcos.previsto?.naBorda ? 'left' : 'bottom',
          fill: CORES_CURVA_S.marcoTendencia,
          fontSize: 10,
          fontWeight: 700,
        }}
      />
    );
  }
  return itens;
}

/**
 * Série do tooltip sem a duplicidade do previsto no ponto de 100%, com o
 * nome normalizado ("Previsto (LB)").
 */
export function seriesTooltip(payload = []) {
  const vistos = new Set();
  return payload
    .filter((serie) => serie.value !== null && serie.value !== undefined)
    .map((serie) =>
      serie.dataKey === CHAVE_APOS || serie.dataKey === CHAVE_ATE
        ? { ...serie, name: String(serie.name).replace(/ após 100%$/, ''), chave: 'previsto' }
        : { ...serie, chave: serie.dataKey }
    )
    .filter((serie) => {
      if (vistos.has(serie.chave)) return false;
      vistos.add(serie.chave);
      return true;
    });
}

function Amostra({ cor, tracejado = false, ponto = false }) {
  if (ponto) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: cor }} aria-hidden="true" />;
  }
  return (
    <span
      className="inline-block h-0 w-5"
      style={{ borderTop: `${tracejado ? 2 : 3}px ${tracejado ? 'dashed' : 'solid'} ${cor}` }}
      aria-hidden="true"
    />
  );
}

/** Legenda padrão (com as datas dos marcos de 100%). */
export function LegendaCurvaS({ marcos, comBase = false, rotuloReal = 'Real', rotuloPrevisto = 'Previsto (LB)' }) {
  const quando = (m) => (m ? `${m.rotulo}${m.data ? ` · ${formatarData(m.data)}` : ''}` : '—');
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <Amostra cor={CORES_CURVA_S.previsto} /> {rotuloPrevisto} até 100%
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Amostra cor={CORES_CURVA_S.previstoConcluido} tracejado /> {rotuloPrevisto} após 100%
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Amostra cor={CORES_CURVA_S.real} /> {rotuloReal}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Amostra cor={CORES_CURVA_S.tendencia} tracejado /> Tendência
      </span>
      {comBase ? (
        <span className="inline-flex items-center gap-1.5">
          <Amostra cor={CORES_CURVA_S.base} tracejado /> Linha de base Rev 00
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: CORES_CURVA_S.marcoPrevisto }}>
        <Amostra cor={CORES_CURVA_S.marcoPrevisto} ponto /> Previsto 100%: {quando(marcos?.previsto)}
      </span>
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: CORES_CURVA_S.marcoTendencia }}>
        <Amostra cor={CORES_CURVA_S.marcoTendencia} ponto /> Tendência 100%: {quando(marcos?.tendencia)}
      </span>
    </div>
  );
}
