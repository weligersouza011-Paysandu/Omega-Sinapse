import { useEffect, useMemo, useState } from 'react';
import { Plus, UserRound, X } from 'lucide-react';
import Dropdown from './Dropdown.jsx';
import Spinner from './Spinner.jsx';

/** Tamanho máximo da equipe de planejamento (espelha MAX_PLANEJADORES do back-end). */
export const MAX_PLANEJADORES = 2;

const ROTULOS_POSICAO = ['Planejador principal', 'Planejador secundário'];

/** IDs da equipe atual da obra (com fallback para o planejador único legado). */
function idsDaObra(obra) {
  if (Array.isArray(obra?.planejadores_ids) && obra.planejadores_ids.length > 0) {
    return obra.planejadores_ids.map(String);
  }
  return obra?.planejador_id ? [String(obra.planejador_id)] : [];
}

/**
 * Seletor inline da equipe de planejadores responsáveis por uma obra.
 *
 * O primeiro seletor define o planejador principal; o botão "+ Adicionar
 * planejador" abre o seletor do secundário. Usado nos cards e no Kanban de
 * Obras e nas telas de edição da obra (perfis SUPERVISOR/ADMIN).
 *
 * Cada alteração é persistida por `onAtribuir(obra, ids)` com a lista completa
 * em ordem (o principal primeiro); o componente só reflete a mudança quando o
 * callback não devolve `false`. Os eventos são isolados para não abrir o modal
 * de detalhes do card.
 */
export default function SeletorPlanejador({
  obra,
  planejadores = [],
  carregando = false,
  onAtribuir,
  className = '',
}) {
  const chaveObra = idsDaObra(obra).join(',');
  const [ids, setIds] = useState(() => idsDaObra(obra));
  const [adicionando, setAdicionando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setIds(chaveObra ? chaveObra.split(',') : []);
    setAdicionando(false);
  }, [chaveObra]);

  // Preserva a exibição de quem já está na equipe mesmo que tenha sido
  // desativado depois da atribuição (a API não o devolve entre os ativos).
  const todos = useMemo(() => {
    const lista = planejadores.map((planejador) => ({
      value: String(planejador.id),
      label: planejador.nome,
      descricao: planejador.matricula ? `${planejador.nome} · ${planejador.matricula}` : planejador.nome,
    }));
    const equipe = obra?.planejadores?.length
      ? obra.planejadores
      : obra?.planejador_id
        ? [{ id: obra.planejador_id, nome: obra.planejador_nome }]
        : [];
    equipe.forEach((membro) => {
      if (!lista.some((opcao) => opcao.value === String(membro.id))) {
        const nome = membro.nome || `Usuário #${membro.id}`;
        lista.push({ value: String(membro.id), label: nome, descricao: `${nome} · atribuição atual` });
      }
    });
    return lista;
  }, [planejadores, obra?.planejadores, obra?.planejador_id, obra?.planejador_nome]);

  /**
   * Opções de uma posição: não oferece quem já ocupa a outra posição. Só o
   * principal tem a opção "Sem responsável"; o secundário é removido pelo X
   * (assim o seletor vazio exibe o placeholder).
   */
  function opcoesDa(posicao) {
    const ocupados = ids.filter((_, indice) => indice !== posicao);
    const disponiveis = todos.filter((opcao) => !ocupados.includes(opcao.value));
    return posicao === 0
      ? [{ value: '', label: 'Sem responsável', descricao: 'Sem responsável' }, ...disponiveis]
      : disponiveis;
  }

  async function persistir(novos) {
    if (salvando || novos.join(',') === ids.join(',')) {
      setAdicionando(false);
      return;
    }

    setSalvando(true);
    try {
      const sucesso = await onAtribuir?.(obra, novos.map(Number));
      if (sucesso !== false) {
        setIds(novos);
        setAdicionando(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  function alterar(posicao, valor) {
    const novos = [...ids];
    if (valor === '') {
      // Sem principal, o secundário (se houver) é promovido.
      novos.splice(posicao, 1);
    } else {
      novos[posicao] = valor;
    }
    persistir(novos.filter(Boolean));
  }

  const posicoes = ids.length + (adicionando ? 1 : 0) || 1;
  const podeAdicionar = !adicionando && ids.length > 0 && ids.length < MAX_PLANEJADORES;

  return (
    <div
      className={className}
      onClick={(evento) => evento.stopPropagation()}
      onKeyDown={(evento) => evento.stopPropagation()}
      onDragStart={(evento) => evento.stopPropagation()}
    >
      <div className="space-y-2">
        {Array.from({ length: posicoes }).map((_, posicao) => (
          <div key={posicao}>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
              {ROTULOS_POSICAO[posicao] || `Planejador ${posicao + 1}`}
              {salvando && posicao === 0 ? <Spinner tamanho="sm" /> : null}
            </p>

            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <Dropdown
                  value={ids[posicao] || ''}
                  onChange={(valor) => alterar(posicao, valor)}
                  opcoes={opcoesDa(posicao)}
                  carregando={carregando}
                  disabled={salvando || carregando}
                  placeholder={posicao === 0 ? 'Atribuir planejador' : 'Selecione o secundário'}
                  textoVazio="Nenhum técnico planejador ativo cadastrado"
                />
              </div>

              {posicao > 0 ? (
                <button
                  type="button"
                  onClick={() => (ids[posicao] ? persistir(ids.slice(0, posicao)) : setAdicionando(false))}
                  disabled={salvando}
                  title="Remover planejador secundário"
                  aria-label="Remover planejador secundário"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {podeAdicionar ? (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          disabled={salvando || carregando}
          className="mt-1.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-semibold text-omega-700 transition hover:bg-omega-50 hover:underline disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Adicionar planejador
        </button>
      ) : null}

      {salvando ? (
        <p className="mt-1 text-[10px] font-medium text-omega-700">Salvando atribuição...</p>
      ) : null}
    </div>
  );
}
