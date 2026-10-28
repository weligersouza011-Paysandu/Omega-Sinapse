import { useEffect, useState } from 'react';
import {
  KeyRound,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import Dropdown from '../components/Dropdown.jsx';
import ModalSenhaUsuario from '../components/ModalSenhaUsuario.jsx';
import ModalUsuario from '../components/ModalUsuario.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUsuarios } from '../hooks/useUsuarios.js';
import { formatarData } from '../utils/formatters.js';
import { obterPerfil, OPCOES_PERFIL } from '../utils/perfis.js';

const LIMITE = 10;

const TH =
  'whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500';

const FILTRO_STATUS = [
  { value: '', label: 'Todos os status', descricao: 'Todos os status' },
  { value: 'true', label: 'Ativos', descricao: 'Somente ativos' },
  { value: 'false', label: 'Inativos', descricao: 'Somente inativos' },
];

/** Extrai até duas iniciais do nome para o avatar da listagem. */
function iniciaisDe(nome) {
  return (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

/** Selo de status do acesso (ativo/inativo). */
function StatusUsuario({ ativo }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        ativo
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-slate-300 bg-slate-100 text-slate-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ativo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  );
}

/**
 * Gestão de Usuários — cadastro, perfis de acesso e status (RBAC).
 *
 * A tela é exclusiva do perfil ADMIN (rota protegida em `App.jsx` e API
 * restrita no back-end). A listagem usa paginação, busca com debounce e filtros
 * por perfil/status; criação, edição e redefinição de senha têm modais próprios.
 */
export default function UsuariosPage() {
  const { usuario: usuarioAtual } = useAuth();

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [perfil, setPerfil] = useState('');
  const [status, setStatus] = useState('');
  const [pagina, setPagina] = useState(1);

  const [modalUsuarioAberto, setModalUsuarioAberto] = useState(false);
  const [usuarioEdicao, setUsuarioEdicao] = useState(null);
  const [usuarioSenha, setUsuarioSenha] = useState(null);

  const { itens, total, totalPaginas, carregando, erro, recarregar, atualizarItemLocal } =
    useUsuarios({ busca: buscaAplicada, perfil, ativo: status, pagina, limit: LIMITE });

  // Debounce da busca por nome, e-mail ou matrícula.
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaAplicada(busca.trim());
      setPagina(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca]);

  const ativosNaPagina = itens.filter((item) => item.ativo).length;
  const perfisNaPagina = new Set(itens.map((item) => item.perfil)).size;

  function abrirNovoUsuario() {
    setUsuarioEdicao(null);
    setModalUsuarioAberto(true);
  }

  function abrirEdicao(usuario) {
    setUsuarioEdicao(usuario);
    setModalUsuarioAberto(true);
  }

  function fecharModalUsuario() {
    setModalUsuarioAberto(false);
    setUsuarioEdicao(null);
  }

  function aoSalvarUsuario(salvo, { criacao } = {}) {
    if (criacao) {
      setPagina(1);
    } else if (salvo?.id) {
      atualizarItemLocal(salvo);
    }
    recarregar();
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Gestão de Usuários</h2>
            <p className="text-sm text-slate-500">
              Cadastro de colaboradores, perfis de acesso e controle de ativação (RBAC).
            </p>
          </div>

          <button type="button" className="btn-primario" onClick={abrirNovoUsuario}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Novo usuário
          </button>
        </div>

        {/* ------------------------------------------------------- Indicadores */}
        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card flex items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-omega-50 text-omega-700">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Colaboradores no filtro
              </p>
              <p className="text-2xl font-bold text-slate-800">{total}</p>
            </div>
          </div>

          <div className="card flex items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <UserCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Ativos nesta página
              </p>
              <p className="text-2xl font-bold text-emerald-600">{ativosNaPagina}</p>
            </div>
          </div>

          <div className="card flex items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Perfis representados
              </p>
              <p className="text-2xl font-bold text-violet-700">{perfisNaPagina}</p>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- Filtros */}
        <section className="card mb-5 grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1fr_240px_210px_auto] lg:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              className="campo pl-9"
              placeholder="Buscar por nome, e-mail ou matrícula..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar usuários"
            />
          </div>

          <Dropdown
            value={perfil}
            onChange={(valor) => {
              setPerfil(valor);
              setPagina(1);
            }}
            placeholder="Todos os perfis"
            opcoes={[
              { value: '', label: 'Todos os perfis', descricao: 'Todos os perfis' },
              ...OPCOES_PERFIL,
            ]}
          />

          <Dropdown
            value={status}
            onChange={(valor) => {
              setStatus(valor);
              setPagina(1);
            }}
            placeholder="Todos os status"
            opcoes={FILTRO_STATUS}
          />

          <button type="button" className="btn-neutro" onClick={recarregar} disabled={carregando}>
            <RefreshCw
              className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Atualizar
          </button>
        </section>

        {erro ? (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            <span>{erro}</span>
            <button type="button" className="btn-perigo" onClick={recarregar}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {/* ---------------------------------------------------------- Tabela */}
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${TH} text-left`}>Colaborador</th>
                  <th className={`${TH} text-left`}>Matrícula</th>
                  <th className={`${TH} text-left`}>Perfil</th>
                  <th className={`${TH} text-left`}>Status</th>
                  <th className={`${TH} text-left`}>Cadastro</th>
                  <th className={`${TH} text-right`}>Ações</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {carregando
                  ? Array.from({ length: 5 }).map((_, indice) => (
                      <tr key={`carregando-${indice}`}>
                        <td className="px-4 py-4" colSpan={6}>
                          <div className="h-9 animate-pulse rounded-md bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : itens.map((usuario) => {
                      const infoPerfil = obterPerfil(usuario.perfil);
                      const ehUsuarioAtual = usuario.id === usuarioAtual?.id;

                      return (
                        <tr key={usuario.id} className="transition hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-omega-600 text-xs font-bold text-white ring-1 ring-omega-700/20">
                                {iniciaisDe(usuario.nome)}
                              </span>
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                                  <span className="truncate">{usuario.nome}</span>
                                  {ehUsuarioAtual ? (
                                    <span className="rounded-full bg-omega-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-omega-700 ring-1 ring-omega-100">
                                      você
                                    </span>
                                  ) : null}
                                </p>
                                <p className="truncate text-xs text-slate-500">{usuario.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                            {usuario.matricula || '—'}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              title={infoPerfil.descricao}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${infoPerfil.cor}`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                              {infoPerfil.label}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusUsuario ativo={usuario.ativo} />
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            {formatarData(usuario.created_at)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => abrirEdicao(usuario)}
                                title={`Editar ${usuario.nome}`}
                                aria-label={`Editar ${usuario.nome}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-omega-500 hover:bg-omega-50 hover:text-omega-700 focus:outline-none focus:ring-2 focus:ring-omega-500/30"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setUsuarioSenha(usuario)}
                                title={`Redefinir senha de ${usuario.nome}`}
                                aria-label={`Redefinir senha de ${usuario.nome}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                              >
                                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                {!carregando && itens.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        Nenhum colaborador encontrado
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Ajuste os filtros de busca ou cadastre um novo usuário.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">
              {total} colaborador{total === 1 ? '' : 'es'} no filtro
              {totalPaginas > 0 ? ` · página ${pagina} de ${totalPaginas}` : ''}
            </p>

            {totalPaginas > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-neutro"
                  onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                  disabled={pagina <= 1 || carregando}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn-neutro"
                  onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
                  disabled={pagina >= totalPaginas || carregando}
                >
                  Próxima
                </button>
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-400">
                {carregando ? <Spinner tamanho="sm" /> : null}
              </span>
            )}
          </div>
        </section>
      </div>

      <ModalUsuario
        aberto={modalUsuarioAberto}
        usuario={usuarioEdicao}
        usuarioAtualId={usuarioAtual?.id}
        onFechar={fecharModalUsuario}
        onSalvo={aoSalvarUsuario}
      />

      <ModalSenhaUsuario
        aberto={Boolean(usuarioSenha)}
        usuario={usuarioSenha}
        onFechar={() => setUsuarioSenha(null)}
      />
    </>
  );
}
