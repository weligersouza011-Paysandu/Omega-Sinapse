import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import Autocomplete from './Autocomplete.jsx';

/** Texto comparável: sem acento, maiúsculo e sem espaços repetidos. */
export const comparavel = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Opção da lista equivalente ao texto digitado (ignora acento e caixa), ou null. */
export function opcaoDaLista(opcoes, valor) {
  const alvo = comparavel(valor);
  return alvo ? opcoes.find((o) => comparavel(o.nome) === alvo) || null : null;
}

/**
 * Campo de escolha com busca: a lista sugere o que já existe na base e o valor precisa ser um item dela
 * (a validação fica no formulário, com `opcaoDaLista`). Com `onAdicionar`, mostra o "+" ao lado para
 * cadastrar um item novo — desabilitado quando `podeAdicionar` é falso (com o motivo no `tituloAdicionar`).
 *
 * @param {{nome:string, contato?:string|null}[]} props.opcoes
 * @param {(nome:string) => Promise<string|void>} [props.onAdicionar] devolve o nome gravado
 */
export default function CampoLista({
  id, value, onChange, opcoes, placeholder = 'Buscar na lista...', invalido = false,
  onAdicionar, podeAdicionar = true, tituloAdicionar = 'Adicionar à lista', rotuloNovo = 'Novo item',
}) {
  const [novo, setNovo] = useState(null); // texto do item novo (null = fechado)
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    const nome = String(novo || '').trim();
    if (!nome) return;
    setSalvando(true);
    try {
      const gravado = await onAdicionar(nome);
      onChange(gravado || nome.toUpperCase());
      setNovo(null);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <div className={`min-w-0 flex-1 ${invalido ? '[&_input]:!border-red-400 [&_input]:!ring-red-200' : ''}`}>
          <Autocomplete id={id} value={value || ''} onChange={onChange} onSelecionar={(o) => onChange(o.nome)} opcoes={opcoes}
            placeholder={placeholder} textoVazio={onAdicionar ? 'Não está na lista. Use o + para adicionar.' : 'Nenhum registro encontrado na base'} />
        </div>
        {onAdicionar ? (
          <button type="button" className="btn-neutro !px-2.5" disabled={!podeAdicionar} title={tituloAdicionar} aria-label={tituloAdicionar}
            onClick={() => setNovo(opcaoDaLista(opcoes, value) ? '' : value || '')}>
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {novo !== null ? (
        <div className="flex gap-1.5 rounded-lg border border-omega-200 bg-omega-50/40 p-1.5">
          <input className="campo !py-1.5" autoFocus placeholder={rotuloNovo} value={novo} onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } if (e.key === 'Escape') { e.stopPropagation(); setNovo(null); } }} />
          <button type="button" className="btn-primario !px-2.5" disabled={salvando || !novo.trim()} onClick={confirmar} aria-label="Salvar item novo"><Check className="h-4 w-4" /></button>
          <button type="button" className="btn-neutro !px-2.5" onClick={() => setNovo(null)} aria-label="Cancelar item novo"><X className="h-4 w-4" /></button>
        </div>
      ) : null}
    </div>
  );
}
