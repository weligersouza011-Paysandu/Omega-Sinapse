import api from '../services/api.js';

/** Dados do usuário logado (Meu perfil). */
export async function obterMeuPerfil() {
  const { data } = await api.get('/auth/perfil');
  return data;
}

/** Atualiza nome, telefone, cargo e setor do próprio usuário. */
export async function atualizarMeuPerfil(dados) {
  const { data } = await api.put('/auth/perfil', dados);
  return data;
}

/** Envia a nova foto de perfil (uma imagem). */
export async function enviarMinhaFoto(arquivo) {
  const formulario = new FormData();
  formulario.append('foto', arquivo);
  const { data } = await api.post('/auth/perfil/foto', formulario, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Remove a foto de perfil. */
export async function removerMinhaFoto() {
  const { data } = await api.delete('/auth/perfil/foto');
  return data;
}

/** Redefine a própria senha (exige a senha atual). */
export async function alterarMinhaSenha(senhaAtual, novaSenha) {
  const { data } = await api.put('/auth/perfil/senha', { senha_atual: senhaAtual, nova_senha: novaSenha });
  return data;
}
