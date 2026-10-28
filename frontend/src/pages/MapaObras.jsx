import PlaceholderModulo from '../components/PlaceholderModulo.jsx';

/** Módulo de Geolocalização das obras (estrutura pronta, ainda sem API). */
export default function MapaObras() {
  return (
    <PlaceholderModulo
      titulo="Mapa de Obras"
      descricao="Geolocalização das obras e frentes de serviço em execução."
      recursos={[
        'Mapa interativo com marcação das obras por coordenadas',
        'Agrupamento de obras por cliente, PEP e status',
        'Filtro por região, status e período de execução',
        'Detalhe rápido da obra ao clicar no marcador',
        'Camadas de mapa (satélite, ruas, terreno)',
        'Captura de geolocalização no cadastro do orçamento',
      ]}
    />
  );
}
