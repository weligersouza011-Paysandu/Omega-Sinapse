/**
 * Configuração de acesso do front-end.
 *
 * `MODO_DEMO` — enquanto `true`, o front NÃO chama a API real: usa os dados
 *   de exemplo de src/services/demoApi.js (somente em memória).
 *   Agora `false`: a aplicação consome o back-end (Neon + Cloudinary).
 *
 * `BYPASS_LOGIN` — acesso temporário, para a fase de validação dos dados reais:
 *   a tela de login é ignorada e o front injeta `USUARIO_BYPASS` na sessão.
 *   O back-end precisa estar com `AUTH_BYPASS=true` no .env para aceitar as
 *   requisições sem JWT.
 *
 * ATENÇÃO: `BYPASS_LOGIN` é provisório. Para voltar ao fluxo real de login,
 * troque para `false` (e remova `AUTH_BYPASS` do .env). Nenhuma outra
 * alteração é necessária.
 */
export const MODO_DEMO = false;

/** Acesso sem login (temporário). */
export const BYPASS_LOGIN = true;

/**
 * Usuário injetado na sessão quando `BYPASS_LOGIN` está ativo.
 * Espelha o usuário #1 (ADMIN) usado pelo back-end no bypass de autenticação.
 */
export const USUARIO_BYPASS = {
  id: 1,
  nome: 'Acesso Temporário',
  matricula: '23574',
  email: 'acesso.temporario@omega.local',
  perfil: 'ADMIN',
};

export default MODO_DEMO;
