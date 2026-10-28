import { useEffect, useState } from 'react';
import { CircleAlert, KeyRound } from 'lucide-react';
import ModalBase from './ModalBase.jsx';
import Spinner from './Spinner.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { atualizarSenha } from '../hooks/useUsuarios.js';

const SENHA_MIN_CARACTERES = 4;

/**
 * Redefinição de senha de um colaborador (ação exclusiva do ADMIN).
 * Fluxo separado da edição cadastral para não misturar dados públicos e
 * credenciais na mesma operação.
 */
export default function ModalSenhaUsuario({ aberto, usuario, onFechar }) {
  const toast = useToast();
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setSenha('');
    setConfirmarSenha('');
    setErro('');
    setSalvando(false);
  }, [aberto, usuario]);

  async function salvar(evento) {
    evento.preventDefault();

    if (senha.length < SENHA_MIN_CARACTERES) {
      setErro(`A nova senha deve ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
      return;
    }
    if (senha !== confirmarSenha) {
      setErro('A confirmação de senha não confere.');
      return;
    }

    setErro('');
    setSalvando(true);

    try {
      await atualizarSenha(usuario.id, senha);
      toast.sucesso(`Senha de "${usuario?.nome || 'colaborador'}" redefinida com sucesso.`);
      onFechar();
    } catch (err) {
      const texto = err.message || 'Não foi possível redefinir a senha.';
      setErro(texto);
      toast.erro(texto);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      aberto={aberto}
      titulo="Redefinir senha"
      subtitulo={
        usuario
          ? `${usuario.nome} · ${usuario.email}${usuario.matricula ? ` · ${usuario.matricula}` : ''}`
          : ''
      }
      onFechar={onFechar}
      tamanho="md"
    >
      <form onSubmit={salvar} noValidate>
        <div className="space-y-4 px-5 py-5">
          {erro ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              A nova senha passa a valer imediatamente. Comunique o colaborador por um canal
              seguro e oriente a troca no primeiro acesso.
            </p>
          </div>

          <div>
            <label className="rotulo" htmlFor="novaSenha">
              Nova senha *
            </label>
            <input
              id="novaSenha"
              type="password"
              className="campo"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={`Mínimo de ${SENHA_MIN_CARACTERES} caracteres`}
              autoComplete="new-password"
              disabled={salvando}
              autoFocus
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="confirmarNovaSenha">
              Confirmar nova senha *
            </label>
            <input
              id="confirmarNovaSenha"
              type="password"
              className="campo"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              disabled={salvando}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className="btn-primario" disabled={salvando}>
            {salvando ? <Spinner tamanho="sm" /> : null}
            Redefinir senha
          </button>
        </div>
      </form>
    </ModalBase>
  );
}
