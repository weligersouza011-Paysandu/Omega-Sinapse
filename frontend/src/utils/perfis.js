/**
 * Perfis de acesso (RBAC) — espelham o enum PerfilUsuario do back-end.
 *
 * `label`    nomenclatura oficial exibida na Gestão de Usuários.
 * `descricao` resumo da responsabilidade do perfil no processo ISO 9001.
 * `cor`      classes Tailwind da badge.
 */
export const PERFIS_OPCOES = [
  {
    value: 'ORCAMENTISTA',
    label: 'Orçamentista',
    descricao: 'Levantamento em campo, abertura e envio de orçamentos.',
    cor: 'bg-sky-100 text-sky-700 border-sky-300',
  },
  {
    value: 'PLANEJADOR',
    label: 'Técnico Planejador',
    descricao: 'Emissão da OSI, programação e acompanhamento da execução.',
    cor: 'bg-violet-100 text-violet-700 border-violet-300',
  },
  {
    value: 'SUPERVISOR',
    label: 'Gestor / Supervisor',
    descricao: 'Atribui planejadores e libera as obras para execução.',
    cor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    value: 'ADMIN',
    label: 'Administrador',
    descricao: 'Gestão de usuários e acesso irrestrito ao sistema.',
    cor: 'bg-slate-800 text-white border-slate-900',
  },
];

/** Opções no formato consumido pelo Dropdown customizado. */
export const OPCOES_PERFIL = PERFIS_OPCOES.map(({ value, label, cor }) => ({
  value,
  label,
  descricao: label,
  cor,
}));

/** Retorna o rótulo oficial do perfil (fallback: valor bruto). */
export function rotuloPerfil(valor) {
  return PERFIS_OPCOES.find((perfil) => perfil.value === valor)?.label || valor || '—';
}

/** Dados visuais do perfil (rótulo + classes da badge). */
export function obterPerfil(valor) {
  return (
    PERFIS_OPCOES.find((perfil) => perfil.value === valor) || {
      value: valor,
      label: valor || '—',
      descricao: '',
      cor: 'bg-slate-100 text-slate-600 border-slate-300',
    }
  );
}
