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
    // Pode ser liberado para usuários do perfil Cliente.
    liberavelCliente: true,
    icone: 'M8 3h8a1 1 0 0 1 1 1v16l-5-3-5 3V4a1 1 0 0 1 1-1Z',
  },
  {
    id: 'obras',
    rota: '/obras',
    label: 'Obras',
    descricao: 'Projetos aprovados e em execução (OSI).',
    ativo: true,
    // Pode ser liberado para usuários do perfil Cliente.
    liberavelCliente: true,
    icone: 'M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5',
  },
  {
    id: 'planejamento',
    rota: '/planejamento',
    label: 'Dashboard de Planejamento',
    descricao: 'Indicadores, mapa, Curva S e restrições 6WLA.',
    ativo: true,
    // Pode ser liberado para usuários do perfil Cliente.
    liberavelCliente: true,
    icone: 'M4 5h7v6H4V5Zm9 0h7v6h-7V5ZM4 13h7v6H4v-6Zm9 0h7v6h-7v-6Z',
  },
  {
    id: 'demandas',
    rota: '/demandas',
    label: 'Gestão de Demandas',
    descricao: 'Rotinas e demandas da equipe, com farol de prazo.',
    ativo: true,
    // Pode ser liberado para usuários do perfil Cliente.
    liberavelCliente: true,
    icone: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  },
  {
    id: 'medicao',
    rota: '/medicao',
    label: 'Medição',
    descricao: 'Contrato, TACs, boletins de medição e Curva S financeira.',
    ativo: true,
    // Pode ser liberado para usuários do perfil Cliente.
    liberavelCliente: true,
    icone: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 5h6M9 12h6M9 16h3',
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

/** Módulos que o administrador pode liberar para um usuário do perfil Cliente. */
export const PAGINAS_CLIENTE = MODULOS.filter((modulo) => modulo.liberavelCliente);

/**
 * O usuário pode abrir o módulo? Perfis internos seguem a regra de `perfis` do módulo;
 * o Cliente só vê os módulos marcados como liberados no cadastro dele.
 */
export function moduloLiberado(usuario, modulo) {
  if (!modulo) return false;
  if (usuario?.perfil === 'CLIENTE') {
    return Boolean(modulo.liberavelCliente) && (usuario.paginas_permitidas || []).includes(modulo.id);
  }
  return !modulo.perfis || modulo.perfis.includes(usuario?.perfil);
}

/** Primeira página que o usuário pode abrir (destino do login e dos redirecionamentos). */
export function rotaInicial(usuario) {
  if (usuario?.perfil !== 'CLIENTE') return '/orcamentos';
  const primeira = MODULOS.find((modulo) => modulo.ativo && moduloLiberado(usuario, modulo));
  return primeira ? primeira.rota : '/sem-acesso';
}

export default MODULOS;
