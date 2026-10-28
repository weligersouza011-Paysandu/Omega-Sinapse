import { useEffect, useState } from 'react';
import { CircleAlert, KeyRound } from 'lucide-react';
import Dropdown from './Dropdown.jsx';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { atualizarUsuario, criarUsuario } from '../hooks/useUsuarios.js';
import { obterPerfil, OPCOES_PERFIL } from '../utils/perfis.js';

/** Estado inicial do formulário de cadastro. */
const FORMULARIO_VAZIO = {
  nome: '',
  email: '',
  matricula: '',
  perfil: 'ORCAMENTISTA',
  ativo: true,
  senha: '',
  confirmarSenha: '',
};

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MIN_CARACTERES = 4;

/**
 * Modal de cadastro/edição de colaborador (Gestão de Usuários).
 *
 * Regras de segurança refletidas na interface:
 * - o próprio administrador não pode desativar o seu acesso nem trocar o seu
 *   perfil por esta tela (evita perda de acesso ao sistema);
 * - a senha é obrigatória apenas na criação; a redefinição tem fluxo próprio.
 */
export default function ModalUsuario({
  aberto,
  usuario,
  usuarioAtualId,
  onFechar,
  onSalvo,
}) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const editando = Boolean(usuario?.id);
  const ehProprioUsuario = Boolean(usuario?.id && usuario.id === usuarioAtualId);
  const perfilSelecionado = obterPerfil(formulario.perfil);

  useEffect(() => {
    if (!aberto) return;

    setErro('');
    setSalvando(false);

    if (usuario) {
      setFormulario({
        nome: usuario.nome || '',
        email: usuario.email || '',
        matricula: usuario.matricula || '',
        perfil: usuario.perfil || 'ORCAMENTISTA',
        ativo: usuario.ativo !== false,
        senha: '',
        confirmarSenha: '',
      });
    } else {
      setFormulario(FORMULARIO_VAZIO);
    }
  }, [aberto, usuario]);

  function alterarCampo(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  /** Validação local espelhando as regras do back-end. */
  function validarFormulario() {
    if (!formulario.nome.trim()) {
      return 'Informe o nome completo do colaborador.';
    }
    if (!formulario.email.trim()) {
      return 'Informe o e-mail corporativo do colaborador.';
    }
    if (!EMAIL_VALIDO.test(formulario.email.trim())) {
      return 'Informe um e-mail válido (ex.: nome@omega.com).';
    }
    if (!formulario.perfil) {
      return 'Selecione o perfil de acesso.';
    }
    if (!editando) {
      if (formulario.senha.length < SENHA_MIN_CARACTERES) {
        return `A senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`;
      }
      if (formulario.senha !== formulario.confirmarSenha) {
        return 'A confirmação de senha não confere.';
      }
    }
    return '';
  }

  async function salvar(evento) {
    evento.preventDefault();

    const mensagem = validarFormulario();
    if (mensagem) {
      setErro(mensagem);
      return;
    }

    setErro('');
    setSalvando(true);

    const dados = {
      nome: formulario.nome.trim(),
      email: formulario.email.trim().toLowerCase(),
      matricula: formulario.matricula.trim() || null,
      perfil: formulario.perfil,
      ativo: formulario.ativo,
    };

    try {
      const salvo = editando
        ? await atualizarUsuario(usuario.id, dados)
        : await criarUsuario({ ...dados, senha: formulario.senha });

      toast.sucesso(
        editando
          ? `Usuário "${salvo?.nome || dados.nome}" atualizado com sucesso.`
          : `Usuário "${salvo?.nome || dados.nome}" cadastrado com sucesso.`
      );

      onSalvo?.(salvo, { criacao: !editando });
      onFechar();
    } catch (err) {
      const texto = err.message || 'Não foi possível salvar o usuário.';
      setErro(texto);
      toast.erro(texto);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      aberto={aberto}
      titulo={editando ? 'Editar usuário' : 'Novo usuário'}
      subtitulo={
        editando
          ? `Cadastro de ${usuario?.nome || 'colaborador'} · matrícula ${usuario?.matricula || '—'}`
          : 'Cadastre um colaborador e defina o perfil de acesso ao sistema.'
      }
      onFechar={onFechar}
      tamanho="lg"
    >
      <form onSubmit={salvar} noValidate>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
          {erro ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="rotulo" htmlFor="usuarioNome">
                Nome completo *
              </label>
              <input
                id="usuarioNome"
                className="campo"
                value={formulario.nome}
                onChange={(e) => alterarCampo('nome', e.target.value)}
                placeholder="Ex.: Ana Souza"
                autoComplete="off"
                disabled={salvando}
                autoFocus
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="usuarioEmail">
                E-mail corporativo *
              </label>
              <input
                id="usuarioEmail"
                type="email"
                className="campo"
                value={formulario.email}
                onChange={(e) => alterarCampo('email', e.target.value)}
                placeholder="nome@omega.com"
                autoComplete="off"
                disabled={salvando}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="usuarioMatricula">
                Matrícula
              </label>
              <input
                id="usuarioMatricula"
                className="campo"
                value={formulario.matricula}
                onChange={(e) => alterarCampo('matricula', e.target.value)}
                placeholder="Ex.: 23574"
                inputMode="numeric"
                maxLength={30}
                autoComplete="off"
                disabled={salvando}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Identificador usado no login (opcional, porém único).
              </p>
            </div>

            <div>
              <label className="rotulo" htmlFor="usuarioPerfil">
                Perfil de acesso *
              </label>
              <Dropdown
                id="usuarioPerfil"
                value={formulario.perfil}
                onChange={(valor) => alterarCampo('perfil', valor)}
                opcoes={OPCOES_PERFIL}
                disabled={salvando || ehProprioUsuario}
                placeholder="Selecione o perfil"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {ehProprioUsuario
                  ? 'Seu próprio perfil não pode ser alterado por esta tela.'
                  : perfilSelecionado.descricao}
              </p>
            </div>

            <div>
              <span className="rotulo">Status do acesso</span>
              <div
                className="grid grid-cols-2 gap-1 rounded-md border border-slate-300 bg-slate-100 p-1"
                role="group"
                aria-label="Status do usuário"
              >
                <button
                  type="button"
                  onClick={() => alterarCampo('ativo', true)}
                  aria-pressed={formulario.ativo}
                  disabled={salvando}
                  className={[
                    'rounded px-3 py-1.5 text-sm font-semibold transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
                    formulario.ativo
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white',
                  ].join(' ')}
                >
                  Ativo
                </button>
                <button
                  type="button"
                  onClick={() => alterarCampo('ativo', false)}
                  aria-pressed={!formulario.ativo}
                  disabled={salvando || ehProprioUsuario}
                  className={[
                    'rounded px-3 py-1.5 text-sm font-semibold transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    !formulario.ativo
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white',
                  ].join(' ')}
                >
                  Inativo
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {ehProprioUsuario
                  ? 'Você não pode desativar o próprio acesso.'
                  : 'Usuários inativos permanecem cadastrados, mas não conseguem fazer login.'}
              </p>
            </div>
          </div>

          {!editando ? (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Senha inicial
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="rotulo" htmlFor="usuarioSenha">
                    Senha *
                  </label>
                  <input
                    id="usuarioSenha"
                    type="password"
                    className="campo"
                    value={formulario.senha}
                    onChange={(e) => alterarCampo('senha', e.target.value)}
                    placeholder={`Mínimo de ${SENHA_MIN_CARACTERES} caracteres`}
                    autoComplete="new-password"
                    disabled={salvando}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor="usuarioConfirmarSenha">
                    Confirmar senha *
                  </label>
                  <input
                    id="usuarioConfirmarSenha"
                    type="password"
                    className="campo"
                    value={formulario.confirmarSenha}
                    onChange={(e) => alterarCampo('confirmarSenha', e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    disabled={salvando}
                  />
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
              A senha não é alterada por este formulário. Para definir uma nova senha, feche a
              edição e use a ação <strong>Redefinir senha</strong> na listagem.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primario" disabled={salvando}>
            {salvando ? <Spinner tamanho="sm" /> : null}
            {editando ? 'Salvar alterações' : 'Cadastrar usuário'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}
