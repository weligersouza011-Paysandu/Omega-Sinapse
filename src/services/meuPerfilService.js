'use strict';

const bcrypt = require('bcryptjs');
const AppError = require('../errors/AppError');
const usuarioRepository = require('../repositories/usuarioRepository');
const uploadService = require('./uploadService');
const authService = require('./authService');

/**
 * "Meu perfil": o próprio usuário edita nome, telefone, cargo e setor, troca a foto e redefine a
 * senha. Perfil de acesso, e-mail, matrícula, status e páginas liberadas NÃO passam por aqui:
 * só a Gestão de Usuários (ADMIN) altera esses campos.
 */

const SALT_ROUNDS = 10;
const SENHA_MIN_CARACTERES = authService.SENHA_MIN_CARACTERES || 4;
/** Pasta do Cloudinary das fotos de perfil (separada das fotos de orçamento). */
const PASTA_FOTOS = 'synapse/usuarios';

const CAMPOS_EDITAVEIS = {
  nome: { rotulo: 'Nome', max: 255, obrigatorio: true },
  telefone: { rotulo: 'Telefone', max: 30 },
  cargo: { rotulo: 'Cargo / função', max: 120 },
  setor: { rotulo: 'Setor / área', max: 120 },
};

function exigirUsuario(usuario) {
  if (!usuario || !Number.isInteger(Number(usuario.id))) {
    throw new AppError(401, 'Usuário não autenticado.');
  }
  return Number(usuario.id);
}

async function carregar(id) {
  const registro = await usuarioRepository.findById(id);
  if (!registro) throw new AppError(404, 'Usuário não encontrado.');
  return registro;
}

/** GET /api/auth/perfil */
async function obterMeuPerfil(usuario) {
  return authService.obterUsuario(exigirUsuario(usuario));
}

/**
 * PUT /api/auth/perfil — { nome?, telefone?, cargo?, setor? }.
 * Qualquer outro campo (perfil, email, matricula, ativo, paginas_permitidas...) é recusado.
 */
async function atualizarMeuPerfil(usuario, payload = {}) {
  const id = exigirUsuario(usuario);
  await carregar(id);

  const proibidos = Object.keys(payload).filter((campo) => !CAMPOS_EDITAVEIS[campo]);
  if (proibidos.length > 0) {
    throw new AppError(
      403,
      `Pelo Meu perfil só dá para alterar nome, telefone, cargo e setor. Perfil de acesso, e-mail e demais dados são alterados na Gestão de Usuários (campo(s): ${proibidos.join(', ')}).`
    );
  }

  const dados = {};
  Object.entries(CAMPOS_EDITAVEIS).forEach(([campo, regra]) => {
    if (!Object.prototype.hasOwnProperty.call(payload, campo)) return;
    const texto = payload[campo] === null || payload[campo] === undefined ? '' : String(payload[campo]).trim();
    if (regra.obrigatorio && !texto) throw new AppError(400, `O campo "${regra.rotulo}" é obrigatório.`);
    if (texto.length > regra.max) throw new AppError(400, `"${regra.rotulo}" aceita no máximo ${regra.max} caracteres.`);
    dados[campo] = texto || null;
  });

  await usuarioRepository.update(id, dados);
  return authService.obterUsuario(id);
}

/** POST /api/auth/perfil/foto — multipart, campo "foto" (uma imagem). */
async function definirMinhaFoto(usuario, arquivo) {
  const id = exigirUsuario(usuario);
  await carregar(id);
  if (!arquivo) throw new AppError(400, 'Envie uma imagem no campo "foto".');
  const [foto] = await uploadService.processarFotos([arquivo], { pasta: PASTA_FOTOS });
  if (!foto?.url) throw new AppError(502, 'Não foi possível enviar a foto. Tente novamente.');
  await usuarioRepository.update(id, { foto_url: foto.url });
  return authService.obterUsuario(id);
}

/** DELETE /api/auth/perfil/foto */
async function removerMinhaFoto(usuario) {
  const id = exigirUsuario(usuario);
  await carregar(id);
  await usuarioRepository.update(id, { foto_url: null });
  return authService.obterUsuario(id);
}

/** PUT /api/auth/perfil/senha — { senha_atual, nova_senha }. Exige a senha atual. */
async function alterarMinhaSenha(usuario, payload = {}) {
  const id = exigirUsuario(usuario);
  const senhaAtual = payload.senha_atual === undefined || payload.senha_atual === null ? '' : String(payload.senha_atual);
  const novaSenha = payload.nova_senha === undefined || payload.nova_senha === null ? '' : String(payload.nova_senha);

  if (!senhaAtual || !novaSenha) {
    throw new AppError(400, 'Informe a senha atual e a nova senha.');
  }
  if (novaSenha.length < SENHA_MIN_CARACTERES) {
    throw new AppError(400, `A nova senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
  }
  if (novaSenha === senhaAtual) {
    throw new AppError(400, 'A nova senha precisa ser diferente da atual.');
  }

  const registro = await usuarioRepository.findByIdInterno(id);
  if (!registro) throw new AppError(404, 'Usuário não encontrado.');
  if (!(await bcrypt.compare(senhaAtual, registro.senha_hash))) {
    throw new AppError(400, 'A senha atual não confere.');
  }

  await usuarioRepository.updateSenha(id, await bcrypt.hash(novaSenha, SALT_ROUNDS));
  return { alterada: true };
}

module.exports = {
  obterMeuPerfil,
  atualizarMeuPerfil,
  definirMinhaFoto,
  removerMinhaFoto,
  alterarMinhaSenha,
};
