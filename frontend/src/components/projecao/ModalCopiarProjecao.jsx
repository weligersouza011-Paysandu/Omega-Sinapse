import { useEffect, useMemo, useState } from 'react';
import { Copy, FilePlus2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { obterQqp } from '../../hooks/useMedicao.js';
import { NOMES_MESES, copiarProjecaoBmm, referenciaAtual, rotuloReferencia } from '../../hooks/useProjecaoBmm.js';
import { formatarMoeda } from '../../utils/formatters.js';

/**
 * "Nova projeção": escolhe obra, contrato/TAC, BMM e mês e pergunta se copia uma projeção
 * anterior da mesma obra e contrato/TAC (semanas casadas por ordem, preços atuais do QQP).
 * Devolve o rascunho para o editor; nada é gravado aqui.
 */
export default function ModalCopiarProjecao({ aberto, contrato, projecoes, onCancelar, onContinuar }) {
  const [escopos, setEscopos] = useState(null);
  const [tac, setTac] = useState(0);
  const [obraId, setObraId] = useState('');
  const [numeroBmm, setNumeroBmm] = useState('');
  const [referencia, setReferencia] = useState(referenciaAtual());
  const [origemId, setOrigemId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return undefined;
    setErro('');
    setOrigemId('');
    setNumeroBmm('');
    setReferencia(referenciaAtual());
    setObraId(contrato.obras?.length === 1 ? String(contrato.obras[0].id) : '');
    let ativo = true;
    // Pré-seleciona o QQP mais recente (último TAC com itens; senão o contrato original).
    obterQqp(contrato.id, 'todos')
      .then((dados) => {
        if (!ativo) return;
        setEscopos(dados.escopos);
        const comItens = new Set(dados.data.map((i) => i.escopo_tac));
        const recente = [...dados.escopos].reverse().find((e) => comItens.has(e.tac_id));
        setTac(recente ? recente.tac_id : 0);
      })
      .catch((err) => ativo && setErro(err.message || 'Não foi possível carregar o QQP.'));
    return () => {
      ativo = false;
    };
  }, [aberto, contrato]);

  const anteriores = useMemo(
    () =>
      projecoes
        .filter((p) => String(p.obra_id) === obraId && (p.termo_aditivo_id ?? 0) === tac)
        .sort((a, b) => b.referencia.localeCompare(a.referencia)),
    [projecoes, obraId, tac]
  );

  // Sugere a projeção mais recente da obra e o próximo BMM.
  useEffect(() => {
    setOrigemId(anteriores[0] ? String(anteriores[0].id) : '');
    const ultimo = /^(.*?)(\d+)\s*$/.exec(anteriores[0]?.numero_bmm || '');
    if (ultimo) setNumeroBmm(`${ultimo[1]}${String(Number(ultimo[2]) + 1).padStart(ultimo[2].length, '0')}`);
  }, [anteriores]);

  const [ano, mes] = referencia.split('-').map(Number);

  async function continuar(copiar) {
    if (!obraId) return setErro('Escolha a obra.');
    setErro('');
    const destino = { obra_id: Number(obraId), termo_aditivo_id: tac, numero_bmm: numeroBmm.trim(), referencia, itens: [] };
    if (!copiar || !origemId) return onContinuar(destino, []);
    setOcupado(true);
    try {
      const resposta = await copiarProjecaoBmm(Number(origemId), { referencia, numero_bmm: numeroBmm.trim() });
      onContinuar({ ...resposta.rascunho, numero_bmm: numeroBmm.trim() }, resposta.avisos || []);
    } catch (err) {
      setErro(err.message || 'Não foi possível copiar a projeção.');
    } finally {
      setOcupado(false);
    }
    return undefined;
  }

  return (
    <ModalBase aberto={aberto} titulo="Nova projeção de BMM" subtitulo={`${contrato.id_vale} · receita prevista por obra e ciclo 16→15`} onFechar={onCancelar} tamanho="lg">
      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="nova-obra">Obra (SS) *</label>
            <select id="nova-obra" className="campo" value={obraId} onChange={(e) => setObraId(e.target.value)}>
              <option value="">Escolha a obra…</option>
              {(contrato.obras || []).map((o) => (
                <option key={o.id} value={o.id}>{[o.ss, o.descricao].filter(Boolean).join(' — ') || `Obra ${o.id}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="nova-tac">Contrato / TAC (QQP)</label>
            <select id="nova-tac" className="campo" value={tac} onChange={(e) => setTac(Number(e.target.value))} disabled={!escopos}>
              {(escopos || [{ tac_id: 0, rotulo: 'Carregando…' }]).map((e) => (
                <option key={e.tac_id} value={e.tac_id}>{e.rotulo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="nova-bmm">BMM Nº</label>
            <input id="nova-bmm" className="campo" value={numeroBmm} maxLength={30} onChange={(e) => setNumeroBmm(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <div>
              <label className="rotulo" htmlFor="nova-mes">Mês</label>
              <select id="nova-mes" className="campo" value={mes} onChange={(e) => setReferencia(`${ano}-${String(e.target.value).padStart(2, '0')}`)}>
                {NOMES_MESES.map((nome, i) => (
                  <option key={nome} value={i + 1}>{nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="nova-ano">Ano</label>
              <input id="nova-ano" type="number" className="campo" value={ano} onChange={(e) => setReferencia(`${e.target.value}-${String(mes).padStart(2, '0')}`)} />
            </div>
          </div>
        </div>

        {obraId ? (
          anteriores.length ? (
            <div>
              <label className="rotulo" htmlFor="nova-origem">Copiar de projeção anterior? (mesma obra e contrato/TAC)</label>
              <select id="nova-origem" className="campo" value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
                {anteriores.map((p) => (
                  <option key={p.id} value={p.id}>
                    BMM {p.numero_bmm} · {rotuloReferencia(p.referencia)} · {formatarMoeda(p.total)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                As semanas são casadas por ordem, os dias ficam limitados aos dias úteis do novo ciclo e os preços são os atuais do QQP.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhuma projeção anterior desta obra neste contrato/TAC: a projeção começa em branco.</p>
          )
        ) : null}

        {erro ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <button type="button" className="btn-neutro" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        <button type="button" className="btn-neutro" onClick={() => continuar(false)} disabled={ocupado || !escopos}>
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          Começar em branco
        </button>
        {anteriores.length ? (
          <button type="button" className="btn-primario" onClick={() => continuar(true)} disabled={ocupado || !origemId}>
            {ocupado ? <Spinner tamanho="sm" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            Copiar e editar
          </button>
        ) : null}
      </div>
    </ModalBase>
  );
}
