import PlaceholderModulo from '../components/PlaceholderModulo.jsx';

/** Módulo de Curva S & BI (estrutura pronta, ainda sem API). */
export default function CurvaS() {
  return (
    <PlaceholderModulo
      titulo="Curva S & BI"
      descricao="Acompanhamento do avanço físico e financeiro acumulado das obras."
      recursos={[
        'Curva S de avanço físico planejado x realizado',
        'Curva S financeira (previsto x medido x pago)',
        'Indicadores de desvio (SPI / CPI) por obra',
        'Comparativo entre orçamento aprovado e medições',
        'Painéis e gráficos analíticos por período e cliente',
        'Exportação de relatórios gerenciais (PDF/Excel)',
      ]}
    />
  );
}
