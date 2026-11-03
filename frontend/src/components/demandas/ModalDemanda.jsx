import { useEffect, useMemo, useState } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { listarObras } from '../../hooks/useObras.js';
import { atualizarTarefa, criarTarefa } from '../../hooks/useTarefas.js';
import {
  DIAS_SEMANA,
  PERFIS_GESTORES,
  PRIORIDADES,
  dataInputLocal,
  obterStatusDemanda,
} from '../../utils/demandas.js';
import { formatarDataHora } from '../../utils/formatters.js';

const TIPOS = [
  { value: 'AVULSA', label: 'Avulsa', descricao: 'Demanda pontual com data própria' },
  { value: 'FIXA_RECORRENTE', label: 'Fixa / Rotina', descricao: 'Repete toda semana no mesmo dia' },
];

function formularioInicial(tarefa, usuario) {
  if (tarefa) {
    return {
      titulo: tarefa.titulo || '',
      descricao: tarefa.descricao || '',
      tipo: tarefa.tipo,
      dia_recorrencia: tarefa.dia_recorrencia || 'SEGUNDA',
      data_vencimento: dataInputLocal(tarefa.data_vencimento),
      prioridade: tarefa.prioridade,
      usuario_id: String(tarefa.usuario_id),
      obra_id: tarefa.obra_id ? String(tarefa.obra_id) : '',
    };
  }
  return {
    titulo: '',
    descricao: '',
    tipo: 'AVULSA',
    dia_recorrencia: 'SEGUNDA',
    data_vencimento: dataInputLocal(new Date()),
    prioridade: 'MEDIA',
    usuario_id: usuario?.id ? String(usuario.id) : '',
    obra_id: '',
  };
}

/** Rótulo da obra no seletor: OSI · SS · descrição. */
function rotuloObra(obra) {
  const partes = [obra.osi_numero, obra.ss || obra.pep].filter(Boolean);
  const referencia = partes.length > 0 ? partes.join(' · ') : `Obra #${obra.id}`;
  return obra.descricao ? `${referencia} — ${obra.descricao}` : referencia;
}

/**
 * Cadastro e edição de demandas. Rotinas fixas escolhem o dia da semana (o
 * vencimento é calculado pela API); demandas avulsas informam a data.
 */
export default function ModalDemanda({ aberto, tarefa, equipe, usuario, onFechar, onSalvo, onRemover }) {
  const edicao = Boolean(tarefa);
  const gestor = PERFIS_GESTORES.includes(usuario?.perfil);

  const [form, setForm] = useState(() => formularioInicial(tarefa, usuario));
  const [obras, setObras] = useState([]);
  const [carregandoObras, setCarregandoObras] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setForm(formularioInicial(tarefa, usuario));
    setErro('');
  }, [aberto, tarefa, usuario]);

  // Obras para vínculo opcional (carregadas uma vez, ao abrir o modal).
  useEffect(() => {
    if (!aberto || obras.length > 0) return undefined;
    let ativo = true;
    setCarregandoObras(true);
    listarObras({ page: 1, limit: 100 })
      .then((resultado) => {
        if (ativo) setObras(resultado.data || []);
      })
      .catch(() => {
        // Vínculo com obra é opcional: sem a lista, o campo fica vazio.
      })
      .finally(() => {
        if (ativo) setCarregandoObras(false);
      });
    return () => {
      ativo = false;
    };
  }, [aberto, obras.length]);

  // Garante o responsável atual/logado na lista, mesmo que a equipe não o traga.
  const responsaveis = useMemo(() => {
    const lista = [...equipe];
    const garantir = (pessoa) => {
      if (pessoa?.id && !lista.some((item) => item.id === pessoa.id)) lista.push(pessoa);
    };
    garantir(tarefa?.usuario);
    garantir(usuario);
    return lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }, [equipe, tarefa, usuario]);

  function alterar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (!form.titulo.trim()) {
      setErro('Informe o título da demanda.');
      return;
    }
    if (form.tipo === 'AVULSA' && !form.data_vencimento) {
      setErro('Informe a data de vencimento.');
      return;
    }

    const dados = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      tipo: form.tipo,
      prioridade: form.prioridade,
      usuario_id: Number(form.usuario_id) || usuario.id,
      obra_id: form.obra_id ? Number(form.obra_id) : null,
    };
    if (form.tipo === 'FIXA_RECORRENTE') {
      dados.dia_recorrencia = form.dia_recorrencia;
    } else {
      dados.data_vencimento = form.data_vencimento;
    }

    setSalvando(true);
    setErro('');
    try {
      const salva = edicao ? await atualizarTarefa(tarefa.id, dados) : await criarTarefa(dados);
      onSalvo(salva, edicao);
      onFechar();
    } catch (falha) {
      setErro(falha.message || 'Não foi possível salvar a demanda.');
    } finally {
      setSalvando(false);
    }
  }

  const status = tarefa ? obterStatusDemanda(tarefa.status) : null;

  return (
    <ModalBase
      aberto={aberto}
      titulo={edicao ? 'Editar demanda' : 'Nova demanda'}
      subtitulo={
        edicao
          ? `Criada em ${formatarDataHora(tarefa.created_at)} · status ${status.label}`
          : 'Rotina semanal ou demanda avulsa da equipe de planejamento.'
      }
      tamanho="lg"
      onFechar={onFechar}
    >
      <form onSubmit={salvar}>
        <div className="space-y-4 px-5 py-5">
          {erro ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {erro}
            </p>
          ) : null}

          <div>
            <label className="rotulo" htmlFor="demanda-titulo">
              Demanda *
            </label>
            <input
              id="demanda-titulo"
              className="campo"
              maxLength={200}
              value={form.titulo}
              onChange={(evento) => alterar('titulo', evento.target.value)}
              placeholder="Ex.: Atualizar programação semanal da carteira"
              autoFocus
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="demanda-descricao">
              Descrição
            </label>
            <textarea
              id="demanda-descricao"
              className="campo min-h-[72px]"
              value={form.descricao}
              onChange={(evento) => alterar('descricao', evento.target.value)}
              placeholder="Detalhes, entregáveis ou critérios de pronto"
            />
          </div>

          <div>
            <span className="rotulo">Tipo *</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
              {TIPOS.map((tipo) => (
                <button
                  key={tipo.value}
                  type="button"
                  role="radio"
                  aria-checked={form.tipo === tipo.value}
                  onClick={() => alterar('tipo', tipo.value)}
                  className={[
                    'rounded-md border px-3 py-2 text-left transition',
                    form.tipo === tipo.value
                      ? 'border-omega-500 bg-omega-50 ring-2 ring-omega-500/20'
                      : 'border-slate-300 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    {tipo.value === 'FIXA_RECORRENTE' ? <Repeat className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    {tipo.label}
                  </span>
                  <span className="text-xs text-slate-500">{tipo.descricao}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form.tipo === 'FIXA_RECORRENTE' ? (
              <div>
                <label className="rotulo" htmlFor="demanda-dia">
                  Vence toda *
                </label>
                <select
                  id="demanda-dia"
                  className="campo"
                  value={form.dia_recorrencia}
                  onChange={(evento) => alterar('dia_recorrencia', evento.target.value)}
                >
                  {DIAS_SEMANA.map((dia) => (
                    <option key={dia.value} value={dia.value}>
                      {dia.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  O próximo vencimento é calculado automaticamente; ao concluir, a rotina da semana seguinte é criada.
                </p>
              </div>
            ) : (
              <div>
                <label className="rotulo" htmlFor="demanda-vencimento">
                  Vencimento *
                </label>
                <input
                  id="demanda-vencimento"
                  type="date"
                  className="campo"
                  value={form.data_vencimento}
                  onChange={(evento) => alterar('data_vencimento', evento.target.value)}
                />
              </div>
            )}

            <div>
              <label className="rotulo" htmlFor="demanda-prioridade">
                Prioridade
              </label>
              <select
                id="demanda-prioridade"
                className="campo"
                value={form.prioridade}
                onChange={(evento) => alterar('prioridade', evento.target.value)}
              >
                {PRIORIDADES.map((prioridade) => (
                  <option key={prioridade.value} value={prioridade.value}>
                    {prioridade.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="rotulo" htmlFor="demanda-responsavel">
                Responsável *
              </label>
              <select
                id="demanda-responsavel"
                className="campo disabled:bg-slate-50 disabled:text-slate-500"
                value={form.usuario_id}
                disabled={!gestor}
                onChange={(evento) => alterar('usuario_id', evento.target.value)}
              >
                {responsaveis.map((pessoa) => (
                  <option key={pessoa.id} value={String(pessoa.id)}>
                    {pessoa.nome}
                  </option>
                ))}
              </select>
              {!gestor ? (
                <p className="mt-1 text-[11px] text-slate-400">Somente Supervisor/Admin atribui a outros colaboradores.</p>
              ) : null}
            </div>

            <div>
              <label className="rotulo" htmlFor="demanda-obra">
                Obra / SS
              </label>
              <select
                id="demanda-obra"
                className="campo"
                value={form.obra_id}
                onChange={(evento) => alterar('obra_id', evento.target.value)}
              >
                <option value="">{carregandoObras ? 'Carregando obras...' : 'Sem vínculo com obra'}</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={String(obra.id)}>
                    {rotuloObra(obra)}
                  </option>
                ))}
                {/* Mantém a obra atual selecionável mesmo fora das 100 primeiras. */}
                {tarefa?.obra && !obras.some((obra) => obra.id === tarefa.obra_id) ? (
                  <option value={String(tarefa.obra_id)}>
                    {tarefa.obra.osi_numero || tarefa.obra.orcamento?.ss || `Obra #${tarefa.obra_id}`}
                  </option>
                ) : null}
              </select>
            </div>
          </div>

          {tarefa?.justificativa_atraso ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="text-[11px] font-bold uppercase tracking-wide">Justificativa de atraso</p>
              <p>{tarefa.justificativa_atraso}</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          {edicao && onRemover ? (
            <button type="button" className="btn-perigo" onClick={() => onRemover(tarefa)} disabled={salvando}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" className="btn-neutro" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? <Spinner tamanho="sm" /> : null}
              {edicao ? 'Salvar alterações' : 'Criar demanda'}
            </button>
          </div>
        </div>
      </form>
    </ModalBase>
  );
}
