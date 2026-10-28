import { useEffect, useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import Dropdown from './Dropdown.jsx';
import Spinner from './Spinner.jsx';

/**
 * Seletor inline do técnico planejador responsável por uma obra.
 *
 * Usado nos cards e no Kanban do módulo de Obras (perfis SUPERVISOR/ADMIN).
 * A alteração é persistida pelo callback `onAtribuir`; o componente trabalha
 * com o valor confirmado pela API e mantém o dropdown bloqueado durante a
 * gravação. Os eventos são isolados para não abrir o modal de detalhes do card.
 */
export default function SeletorPlanejador({
  obra,
  planejadores = [],
  carregando = false,
  onAtribuir,
  className = '',
}) {
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setValor(obra?.planejador_id ? String(obra.planejador_id) : '');
  }, [obra?.planejador_id]);

  const opcoes = useMemo(() => {
    const lista = [
      { value: '', label: 'Sem responsável', descricao: 'Sem responsável' },
      ...planejadores.map((planejador) => ({
        value: String(planejador.id),
        label: planejador.nome,
        descricao: planejador.matricula
          ? `${planejador.nome} · ${planejador.matricula}`
          : planejador.nome,
      })),
    ];

    // Preserva a exibição do responsável atual mesmo que ele tenha sido
    // desativado depois da atribuição (a API não o devolve entre os ativos).
    if (obra?.planejador_id && !lista.some((opcao) => opcao.value === String(obra.planejador_id))) {
      lista.push({
        value: String(obra.planejador_id),
        label: obra.planejador_nome || `Usuário #${obra.planejador_id}`,
        descricao: `${obra.planejador_nome || `Usuário #${obra.planejador_id}`} · atribuição atual`,
      });
    }

    return lista;
  }, [planejadores, obra?.planejador_id, obra?.planejador_nome]);

  async function alterar(novoValor) {
    if (novoValor === valor || salvando) return;

    setSalvando(true);
    try {
      const sucesso = await onAtribuir?.(obra, novoValor === '' ? null : Number(novoValor));
      if (sucesso !== false) {
        setValor(novoValor);
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className={className}
      onClick={(evento) => evento.stopPropagation()}
      onKeyDown={(evento) => evento.stopPropagation()}
      onDragStart={(evento) => evento.stopPropagation()}
    >
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
        Planejador responsável
        {salvando ? <Spinner tamanho="sm" /> : null}
      </p>

      <Dropdown
        value={valor}
        onChange={alterar}
        opcoes={opcoes}
        carregando={carregando}
        disabled={salvando || carregando}
        placeholder="Atribuir planejador"
        textoVazio="Nenhum técnico planejador ativo cadastrado"
      />

      {salvando ? (
        <p className="mt-1 text-[10px] font-medium text-omega-700">Salvando atribuição...</p>
      ) : null}
    </div>
  );
}
