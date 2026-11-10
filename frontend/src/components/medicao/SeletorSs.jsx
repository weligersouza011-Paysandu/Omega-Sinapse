import { useEffect, useId, useState } from 'react';
import { listarQuadroObras } from '../../hooks/useObras.js';

/** Texto de uma obra na lista: "SS128/25 — descrição". */
export function rotuloSs(obra) {
  const codigo = obra.ss || obra.osi_numero || obra.osi || `Obra #${obra.id}`;
  return obra.descricao ? `${codigo} — ${obra.descricao}` : codigo;
}

/**
 * Obras (SS) que podem entrar em um boletim: todas as obras aprovadas que ainda não têm
 * contrato ou que já são deste contrato. A que não está no contrato é vinculada
 * automaticamente ao lançar o valor.
 */
export function useSsDisponiveis(ativo, contratoId) {
  const [obras, setObras] = useState([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    setErro('');
    listarQuadroObras()
      .then((lista) => {
        if (vivo) setObras(lista);
      })
      .catch((err) => {
        if (vivo) setErro(err.message || 'Não foi possível carregar as obras.');
      });
    return () => {
      vivo = false;
    };
  }, [ativo]);

  const disponiveis = obras.filter((obra) => !obra.contrato_id || obra.contrato_id === contratoId);
  return { disponiveis, emOutroContrato: obras.length - disponiveis.length, erro };
}

/**
 * Campo de SS com busca: dá para digitar (SS, OSI, PEP ou parte da descrição) e escolher na lista.
 * `valor` é o id da obra escolhida ('' quando nenhuma); `onChange` recebe o id.
 */
export default function SeletorSs({ obras, contratoId, valor, onChange, ignorar = new Set(), disabled = false, rotulo = 'SS', id }) {
  const gerado = useId();
  const listaId = `${id || gerado}-lista`;
  const [texto, setTexto] = useState('');

  const escolhida = obras.find((obra) => obra.id === Number(valor));

  // Sincroniza o texto quando a escolha muda por fora (ex.: limpar a linha).
  useEffect(() => {
    if (escolhida) setTexto(rotuloSs(escolhida));
    else if (!valor) setTexto((atual) => (obras.some((o) => rotuloSs(o) === atual) ? '' : atual));
  }, [valor, escolhida, obras]);

  const opcoes = obras.filter((obra) => !ignorar.has(obra.id) || obra.id === Number(valor));

  function aoDigitar(evento) {
    const digitado = evento.target.value;
    setTexto(digitado);
    const termo = digitado.trim().toLowerCase();
    const achada =
      opcoes.find((obra) => rotuloSs(obra).toLowerCase() === termo) ||
      opcoes.find((obra) => [obra.ss, obra.osi_numero, obra.pep].filter(Boolean).some((c) => String(c).toLowerCase() === termo));
    onChange(achada ? achada.id : '');
  }

  const vincularAoEscolher = escolhida && escolhida.contrato_id !== contratoId;

  return (
    <div>
      <input
        id={id}
        className="campo"
        list={listaId}
        value={texto}
        onChange={aoDigitar}
        placeholder="Digite a SS (ex.: SS128/25) ou escolha na lista"
        disabled={disabled}
        autoComplete="off"
        aria-label={rotulo}
      />
      <datalist id={listaId}>
        {opcoes.map((obra) => (
          <option key={obra.id} value={rotuloSs(obra)} />
        ))}
      </datalist>
      {texto && !escolhida ? <p className="mt-1 text-[11px] text-amber-700">Escolha uma SS da lista (ou digite o código completo).</p> : null}
      {vincularAoEscolher ? <p className="mt-1 text-[11px] text-emerald-700">Esta SS será vinculada ao contrato ao salvar.</p> : null}
    </div>
  );
}
