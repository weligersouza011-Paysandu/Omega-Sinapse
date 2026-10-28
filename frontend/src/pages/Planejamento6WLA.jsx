import PlaceholderModulo from '../components/PlaceholderModulo.jsx';

/** Módulo de Planejamento / 6 Week Lookahead (estrutura pronta, ainda sem API). */
export default function Planejamento6WLA() {
  return (
    <PlaceholderModulo
      titulo="Planejamento / 6WLA"
      descricao="Tabela de restrições e 6 Week Lookahead integrada ao MS Project."
      recursos={[
        'Tabela de restrições (Constraints) por frente de serviço',
        'Importação/exportação de cronograma MS Project (XML/MPP)',
        'Lookahead de 6 semanas com percentual de conclusão',
        'Apontamento semanal de avanço físico por equipe',
        'Gestão de responsáveis e datas previstas por tarefa',
        'Alertas de restrições críticas que travam a programação',
      ]}
    />
  );
}
