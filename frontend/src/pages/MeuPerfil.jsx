import { useEffect, useRef, useState } from 'react';
import { Camera, KeyRound, Lock, Save, Trash2, UserRound } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { alterarMinhaSenha, atualizarMeuPerfil, enviarMinhaFoto, obterMeuPerfil, removerMinhaFoto } from '../hooks/useMeuPerfil.js';
import { obterPerfil } from '../utils/perfis.js';
import { PAGINAS_CLIENTE } from '../config/modulos.js';

const SENHA_MIN = 4;
const TAMANHO_MAX_FOTO = 8 * 1024 * 1024;

function Campo({ id, rotulo, ajuda, children }) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {children}
      {ajuda ? <p className="mt-1 text-[11px] text-slate-500">{ajuda}</p> : null}
    </div>
  );
}

function SomenteLeitura({ rotulo, valor, ajuda }) {
  return (
    <div>
      <span className="rotulo">{rotulo}</span>
      <p className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate">{valor || '—'}</span>
      </p>
      {ajuda ? <p className="mt-1 text-[11px] text-slate-500">{ajuda}</p> : null}
    </div>
  );
}

/**
 * Meu perfil: o usuário logado troca a foto, edita nome, telefone, cargo e setor e redefine a
 * senha. Perfil de acesso, e-mail e matrícula aparecem só para consulta — mudam na Gestão de Usuários.
 */
export default function MeuPerfil() {
  const { usuario, atualizarUsuarioLocal } = useAuth();
  const toast = useToast();
  const entradaFoto = useRef(null);

  const [dados, setDados] = useState(usuario);
  const [form, setForm] = useState({ nome: '', telefone: '', cargo: '', setor: '' });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [senha, setSenha] = useState({ atual: '', nova: '', confirmar: '' });
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');

  function aplicar(registro) {
    setDados(registro);
    setForm({ nome: registro.nome || '', telefone: registro.telefone || '', cargo: registro.cargo || '', setor: registro.setor || '' });
    atualizarUsuarioLocal(registro);
  }

  useEffect(() => {
    let ativo = true;
    obterMeuPerfil()
      .then((registro) => {
        if (ativo) aplicar(registro);
      })
      .catch((err) => toast.erro(err.message || 'Não foi possível carregar o seu perfil.'))
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alterado =
    dados &&
    (form.nome.trim() !== (dados.nome || '') ||
      form.telefone.trim() !== (dados.telefone || '') ||
      form.cargo.trim() !== (dados.cargo || '') ||
      form.setor.trim() !== (dados.setor || ''));

  async function salvarDados(evento) {
    evento.preventDefault();
    if (!form.nome.trim()) {
      toast.erro('Informe o seu nome.');
      return;
    }
    setSalvando(true);
    try {
      aplicar(
        await atualizarMeuPerfil({
          nome: form.nome.trim(),
          telefone: form.telefone.trim(),
          cargo: form.cargo.trim(),
          setor: form.setor.trim(),
        })
      );
      toast.sucesso('Perfil atualizado.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível salvar o perfil.');
    } finally {
      setSalvando(false);
    }
  }

  async function escolherFoto(evento) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) {
      toast.erro('Escolha um arquivo de imagem (JPG, PNG, WEBP ou HEIC).');
      return;
    }
    if (arquivo.size > TAMANHO_MAX_FOTO) {
      toast.erro('A imagem passa de 8 MB. Escolha uma menor.');
      return;
    }
    setEnviandoFoto(true);
    try {
      aplicar(await enviarMinhaFoto(arquivo));
      toast.sucesso('Foto atualizada.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível enviar a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function tirarFoto() {
    setEnviandoFoto(true);
    try {
      aplicar(await removerMinhaFoto());
      toast.sucesso('Foto removida.');
    } catch (err) {
      toast.erro(err.message || 'Não foi possível remover a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function trocarSenha(evento) {
    evento.preventDefault();
    setErroSenha('');
    if (!senha.atual || !senha.nova) {
      setErroSenha('Preencha a senha atual e a nova senha.');
      return;
    }
    if (senha.nova.length < SENHA_MIN) {
      setErroSenha(`A nova senha deve ter pelo menos ${SENHA_MIN} caracteres.`);
      return;
    }
    if (senha.nova !== senha.confirmar) {
      setErroSenha('A confirmação não confere com a nova senha.');
      return;
    }
    setTrocandoSenha(true);
    try {
      await alterarMinhaSenha(senha.atual, senha.nova);
      setSenha({ atual: '', nova: '', confirmar: '' });
      toast.sucesso('Senha alterada. Use a nova senha no próximo login.');
    } catch (err) {
      setErroSenha(err.message || 'Não foi possível alterar a senha.');
    } finally {
      setTrocandoSenha(false);
    }
  }

  const infoPerfil = obterPerfil(dados?.perfil);
  const paginasCliente =
    dados?.perfil === 'CLIENTE'
      ? PAGINAS_CLIENTE.filter((pagina) => (dados.paginas_permitidas || []).includes(pagina.id)).map((pagina) => pagina.label)
      : [];

  if (carregando && !dados) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Spinner tamanho="lg" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Meu perfil</h2>
        <p className="text-sm text-slate-500">Sua foto, seus dados de contato e sua senha de acesso.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- Cartão */}
        <section className="card flex flex-col items-center p-6 text-center" aria-label="Foto e acesso">
          <div className="relative">
            <Avatar nome={dados?.nome} foto={dados?.foto_url} tamanho="lg" className="ring-4 ring-slate-100" />
            {enviandoFoto ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/50">
                <Spinner tamanho="sm" />
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-base font-bold text-slate-800">{dados?.nome}</p>
          <p className="text-xs text-slate-500">{[dados?.cargo, dados?.setor].filter(Boolean).join(' · ') || dados?.email}</p>
          <span
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${infoPerfil.cor}`}
          >
            {infoPerfil.label}
          </span>

          <input ref={entradaFoto} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primario !px-3 !py-1.5 !text-xs" onClick={() => entradaFoto.current?.click()} disabled={enviandoFoto}>
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              {dados?.foto_url ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {dados?.foto_url ? (
              <button type="button" className="btn-neutro !px-3 !py-1.5 !text-xs" onClick={tirarFoto} disabled={enviandoFoto}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remover
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">JPG, PNG, WEBP ou HEIC, até 8 MB.</p>
        </section>

        <div className="space-y-5">
          {/* ------------------------------------------------------------ Dados */}
          <form className="card p-5" onSubmit={salvarDados} aria-labelledby="dadosPerfilTitulo">
            <h3 id="dadosPerfilTitulo" className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800">
              <UserRound className="h-4 w-4 text-omega-600" aria-hidden="true" />
              Dados pessoais
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo id="perfilNome" rotulo="Nome completo *">
                <input
                  id="perfilNome"
                  className="campo"
                  value={form.nome}
                  maxLength={255}
                  onChange={(e) => setForm((atual) => ({ ...atual, nome: e.target.value }))}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="perfilTelefone" rotulo="Telefone / celular">
                <input
                  id="perfilTelefone"
                  className="campo"
                  type="tel"
                  value={form.telefone}
                  maxLength={30}
                  placeholder="(31) 99999-9999"
                  onChange={(e) => setForm((atual) => ({ ...atual, telefone: e.target.value }))}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="perfilCargo" rotulo="Cargo / função">
                <input
                  id="perfilCargo"
                  className="campo"
                  value={form.cargo}
                  maxLength={120}
                  placeholder="Ex.: Técnico de planejamento"
                  onChange={(e) => setForm((atual) => ({ ...atual, cargo: e.target.value }))}
                  disabled={salvando}
                />
              </Campo>
              <Campo id="perfilSetor" rotulo="Setor / área">
                <input
                  id="perfilSetor"
                  className="campo"
                  value={form.setor}
                  maxLength={120}
                  placeholder="Ex.: Engenharia"
                  onChange={(e) => setForm((atual) => ({ ...atual, setor: e.target.value }))}
                  disabled={salvando}
                />
              </Campo>
              <SomenteLeitura rotulo="E-mail (login)" valor={dados?.email} />
              <SomenteLeitura rotulo="Matrícula" valor={dados?.matricula} />
              <SomenteLeitura
                rotulo="Perfil de acesso"
                valor={infoPerfil.label}
                ajuda="O perfil de acesso só pode ser alterado por um administrador, na Gestão de Usuários."
              />
              {dados?.perfil === 'CLIENTE' ? (
                <SomenteLeitura rotulo="Páginas liberadas" valor={paginasCliente.join(', ') || 'Nenhuma'} />
              ) : null}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="submit" className="btn-primario" disabled={salvando || !alterado}>
                {salvando ? <Spinner tamanho="sm" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Salvar alterações
              </button>
            </div>
          </form>

          {/* ------------------------------------------------------------ Senha */}
          <form className="card p-5" onSubmit={trocarSenha} aria-labelledby="senhaPerfilTitulo">
            <h3 id="senhaPerfilTitulo" className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
              <KeyRound className="h-4 w-4 text-omega-600" aria-hidden="true" />
              Redefinir senha
            </h3>
            <p className="mb-4 text-[11px] text-slate-500">Para sua segurança, confirme a senha atual antes de definir a nova.</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Campo id="senhaAtual" rotulo="Senha atual">
                <input
                  id="senhaAtual"
                  type="password"
                  autoComplete="current-password"
                  className="campo"
                  value={senha.atual}
                  onChange={(e) => setSenha((atual) => ({ ...atual, atual: e.target.value }))}
                  disabled={trocandoSenha}
                />
              </Campo>
              <Campo id="senhaNova" rotulo="Nova senha" ajuda={`Mínimo de ${SENHA_MIN} caracteres.`}>
                <input
                  id="senhaNova"
                  type="password"
                  autoComplete="new-password"
                  className="campo"
                  value={senha.nova}
                  onChange={(e) => setSenha((atual) => ({ ...atual, nova: e.target.value }))}
                  disabled={trocandoSenha}
                />
              </Campo>
              <Campo id="senhaConfirmar" rotulo="Confirmar nova senha">
                <input
                  id="senhaConfirmar"
                  type="password"
                  autoComplete="new-password"
                  className="campo"
                  value={senha.confirmar}
                  onChange={(e) => setSenha((atual) => ({ ...atual, confirmar: e.target.value }))}
                  disabled={trocandoSenha}
                />
              </Campo>
            </div>
            {erroSenha ? (
              <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {erroSenha}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end">
              <button type="submit" className="btn-primario" disabled={trocandoSenha}>
                {trocandoSenha ? <Spinner tamanho="sm" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                Alterar senha
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
