/**
 * Registro central dos módulos da aplicação (Plug-and-Play).
 *
 * Para adicionar um novo módulo no futuro (ex.: "Medições", "RDO"):
 *   1. crie a página em src/pages/;
 *   2. adicione uma entrada aqui;
 *   3. registre a <Route> correspondente em src/App.jsx.
 * O menu lateral e os placeholders leem desta lista — nenhum componente precisa mudar.
 */
export const MODULOS = [
  {
    id: 'orcamentos',
    rota: '/orcamentos',
    label: 'Orçamentos',
    descricao: 'Abertura, listagem e revisões de valor.',
    ativo: true,
    icone: 'M8 3h8a1 1 0 0 1 1 1v16l-5-3-5 3V4a1 1 0 0 1 1-1Z',
  },
  {
    id: 'obras',
    rota: '/obras',
    label: 'Obras',
    descricao: 'Projetos aprovados e em execução (OSI).',
    ativo: true,
    icone: 'M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5',
  },
  {
    id: 'planejamento',
    rota: '/planejamento',
    label: 'Planejamento / 6WLA',
    descricao: 'Tabela de restrições e 6 Week Lookahead (MS Project).',
    ativo: false,
    icone: 'M4 6h16v14H4V6Zm0 4h16M9 3v4M15 3v4M8 14h8',
  },
  {
    id: 'curva-s',
    rota: '/curva-s',
    label: 'Curva S & BI',
    descricao: 'Avanço físico e financeiro acumulado.',
    ativo: false,
    icone: 'M4 19h16M6 16l4-6 3 3 5-8',
  },
  {
    id: 'mapa',
    rota: '/mapa',
    label: 'Mapa de Obras',
    descricao: 'Geolocalização das obras em execução.',
    ativo: false,
    icone: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Zm0-9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  },
  {
    id: 'usuarios',
    rota: '/usuarios',
    label: 'Gestão de Usuários',
    descricao: 'Cadastro de colaboradores, perfis e permissões (RBAC).',
    ativo: true,
    // Módulo restrito: só aparece no menu (e na rota) para o perfil ADMIN.
    perfis: ['ADMIN'],
    icone:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
];

export default MODULOS;
