import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Power } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  atualizarCadastroRdo,
  criarCadastroRdo,
  definirObrasEncarregado,
  listarCadastroRdo,
  listarEncarregados,
  obterObrasRdo,
} from '../../services/rdoApi.js';

/** Definição de cada cadastro: rótulo, campos do formulário e o que mostrar na lista. */
const CADASTROS = {
  funcoes: { rotulo: 'Funções', campos: [{ nome: 'nome', rotulo: 'Nome da função', obrigatorio: true }], titulo: (i) => i.nome },
  colaboradores: {
    rotulo: 'Colaboradores',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
      { nome: 'matricula', rotulo: 'Matrícula' },
      { nome: 'funcao_id', rotulo: 'Função', tipo: 'funcao' },
    ],
    titulo: (i) => i.nome,
    detalhe: (i) => [i.matricula && `mat. ${i.matricula}`, i.funcao?.nome].filter(Boolean).join(' · '),
  },
  equipamentos: {
    rotulo: 'Equipamentos',
    campos: [
      { nome: 'nome', rotulo: 'Nome do equipamento', obrigatorio: true },
      { nome: 'codigo', rotulo: 'Código / TAG' },
    ],
    titulo: (i) => i.nome,
    detalhe: (i) => i.codigo || '',
  },
  motivos: { rotulo: 'Motivos de desvio', campos: [{ nome: 'descricao', rotulo: 'Descrição do motivo', obrigatorio: true }], titulo: (i) => i.descricao },
};

function ListaCadastro({ tipo }) {
  const def = CADASTROS[tipo];
  const toast = useToast();
  const [itens, setItens] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setItens(await listarCadastroRdo(tipo));
      if (tipo === 'colaboradores') setFuncoes(await listarCadastroRdo('funcoes', { ativos: true }));
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [tipo, toast]);

  useEffect(() => {
    setForm({});
    carregar();
  }, [carregar]);

  async function adicionar(evento) {
    evento.preventDefault();
    setSalvando(true);
    try {
      await criarCadastroRdo(tipo, form);
      setForm({});
      toast.sucesso('Cadastro adicionado.');
      await carregar();
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(item) {
    try {
      await atualizarCadastroRdo(tipo, item.id, { ativo: !item.ativo });
      await carregar();
    } catch (err) {
      toast.erro(err.message);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={adicionar} className="card grid grid-cols-1 gap-3 p-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))_auto] sm:items-end">
        {def.campos.map((campo) => (
          <div key={campo.nome}>
            <label className="rotulo">{campo.rotulo}{campo.obrigatorio ? ' *' : ''}</label>
            {campo.tipo === 'funcao' ? (
              <select className="campo" value={form[campo.nome] || ''} onChange={(e) => setForm({ ...form, [campo.nome]: e.target.value })}>
                <option value="">—</option>
                {funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            ) : (
              <input className="campo" required={campo.obrigatorio} value={form[campo.nome] || ''} onChange={(e) => setForm({ ...form, [campo.nome]: e.target.value })} />
            )}
          </div>
        ))}
        <button type="submit" className="btn-primario" disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />} Adicionar
        </button>
      </form>

      {carregando ? <div className="flex justify-center py-6"><Spinner /></div> : (
        <div className="card divide-y divide-slate-100">
          {itens.length === 0 ? <p className="p-4 text-sm text-slate-500">Nada cadastrado ainda.</p> : null}
          {itens.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className={`min-w-0 ${item.ativo ? '' : 'opacity-50'}`}>
                <p className="truncate text-sm font-semibold text-slate-800">{def.titulo(item)}</p>
                {def.detalhe && def.detalhe(item) ? <p className="text-xs text-slate-500">{def.detalhe(item)}</p> : null}
              </div>
              <button type="button" onClick={() => alternarAtivo(item)} className={`btn-neutro !px-2 !py-1 text-xs ${item.ativo ? '' : 'text-emerald-700'}`} title={item.ativo ? 'Desativar' : 'Reativar'}>
                <Power className="h-3.5 w-3.5" aria-hidden="true" /> {item.ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vínculo encarregado ↔ obras (quem pode lançar RDO em quê). */
function VinculoEncarregados() {
  const toast = useToast();
  const { usuario } = useAuth();
  const podeEditar = ['SUPERVISOR', 'ADMIN'].includes(usuario?.perfil);
  const [encarregados, setEncarregados] = useState([]);
  const [obras, setObras] = useState([]);
  const [selecao, setSelecao] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [lista, listaObras] = await Promise.all([listarEncarregados(), obterObrasRdo()]);
        setEncarregados(lista);
        setObras(listaObras);
        setSelecao(Object.fromEntries(lista.map((e) => [e.id, e.obra_ids])));
      } catch (err) {
        toast.erro(err.message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [toast]);

  function alternar(encarregadoId, obraId) {
    setSelecao((atual) => {
      const ids = atual[encarregadoId] || [];
      return { ...atual, [encarregadoId]: ids.includes(obraId) ? ids.filter((i) => i !== obraId) : [...ids, obraId] };
    });
  }

  async function salvar(encarregado) {
    setSalvando(encarregado.id);
    try {
      await definirObrasEncarregado(encarregado.id, selecao[encarregado.id] || []);
      toast.sucesso(`Obras de ${encarregado.nome} atualizadas.`);
    } catch (err) {
      toast.erro(err.message);
    } finally {
      setSalvando(null);
    }
  }

  if (carregando) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (!encarregados.length) {
    return <div className="card p-4 text-sm text-slate-500">Nenhum encarregado cadastrado. Crie usuários com o perfil Encarregado em Gestão de Usuários.</div>;
  }

  return (
    <div className="space-y-3">
      {!podeEditar ? <p className="text-xs text-slate-500">Somente Supervisor e Administrador alteram os vínculos.</p> : null}
      {encarregados.map((e) => (
        <div key={e.id} className="card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">{e.nome}{e.matricula ? ` · mat. ${e.matricula}` : ''}{e.ativo ? '' : ' (inativo)'}</p>
            {podeEditar ? (
              <button type="button" className="btn-primario !py-1 text-xs" disabled={salvando === e.id} onClick={() => salvar(e)}>
                {salvando === e.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Salvar vínculos
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {obras.map((o) => (
              <label key={o.id} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" disabled={!podeEditar} checked={(selecao[e.id] || []).includes(o.id)} onChange={() => alternar(e.id, o.id)} />
                <span>{o.ss || `Obra ${o.id}`} · {o.descricao?.slice(0, 60) || o.pep}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cadastros do RDO: funções, colaboradores, equipamentos, motivos de desvio e vínculo dos encarregados. */
export default function CadastrosRdo() {
  const [tipo, setTipo] = useState('funcoes');
  const abas = [...Object.entries(CADASTROS).map(([id, d]) => [id, d.rotulo]), ['encarregados', 'Encarregados e obras']];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {abas.map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setTipo(id)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${tipo === id ? 'border-omega-600 bg-omega-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {rotulo}
          </button>
        ))}
      </div>
      {tipo === 'encarregados' ? <VinculoEncarregados /> : <ListaCadastro key={tipo} tipo={tipo} />}
    </div>
  );
}
