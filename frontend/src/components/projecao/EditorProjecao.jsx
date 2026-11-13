import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Save } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { obterQqp } from '../../hooks/useMedicao.js';
import {
  NOMES_MESES,
  atualizarProjecaoBmm,
  calcularProjecaoBmm,
  criarProjecaoBmm,
  diaMes,
  obterSemanasDoCiclo,
} from '../../hooks/useProjecaoBmm.js';
import { formatarMoeda } from '../../utils/formatters.js';
import GradeSemanal, { linhasDaProjecao, linhasParaPayload } from './GradeSemanal.jsx';

const ATRASO_PREVIA_MS = 450;

function dataBr(iso) {
  const [ano, mes, dia] = String(iso || '').split('-');
  return dia ? `${dia}/${mes}/${ano}` : '—';
}

/**
 * Cadastro/edição de uma Projeção de BMM. O cálculo é sempre do back-end: a cada alteração
 * a grade chama /calcular (com atraso) e mostra os valores devolvidos.
 * `inicial` = projeção gravada (edição) ou rascunho { obra_id, termo_aditivo_id, referencia, numero_bmm, itens }.
 */
export default function EditorProjecao({ contrato, inicial, emEdicao, somenteLeitura, onSalvo, onVoltar }) {
  const toast = useToast();
  const [tac, setTac] = useState(inicial.termo_aditivo_id ?? 0);
  const [obraId, setObraId] = useState(inicial.obra_id ? String(inicial.obra_id) : '');
  const [numeroBmm, setNumeroBmm] = useState(inicial.numero_bmm || '');
  const [ano, setAno] = useState(Number(String(inicial.referencia).slice(0, 4)));
  const [mes, setMes] = useState(Number(String(inicial.referencia).slice(5, 7)));
  const [observacao, setObservacao] = useState(inicial.observacao || '');
  const [linhas, setLinhas] = useState(() => linhasDaProjecao(inicial.itens));

  const [qqp, setQqp] = useState(null);
  const [ciclo, setCiclo] = useState(null);
  const [calculo, setCalculo] = useState(null);
  const [erroCalculo, setErroCalculo] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [salvando, setSalvando] = useState(false);
  const sequencia = useRef(0);

  const referencia = ano && mes ? `${ano}-${String(mes).padStart(2, '0')}` : '';
  const itensPorId = useMemo(() => new Map((qqp?.data || []).map((item) => [item.id, item])), [qqp]);
  const escopo = qqp?.escopos?.find((e) => e.tac_id === tac);

  // QQP do contrato/TAC escolhido.
  useEffect(() => {
    let ativo = true;
    setErroCarga('');
    obterQqp(contrato.id, tac)
      .then((dados) => ativo && setQqp(dados))
      .catch((err) => ativo && setErroCarga(err.message || 'Não foi possível carregar o QQP.'));
    return () => {
      ativo = false;
    };
  }, [contrato.id, tac]);

  // Semanas e dias úteis do ciclo.
  useEffect(() => {
    if (!referencia) return undefined;
    let ativo = true;
    obterSemanasDoCiclo(contrato.id, referencia)
      .then((dados) => ativo && setCiclo(dados))
      .catch((err) => ativo && setErroCarga(err.message || 'Não foi possível calcular as semanas do ciclo.'));
    return () => {
      ativo = false;
    };
  }, [contrato.id, referencia]);

  // Ao mudar de ciclo, as quantidades seguem a ordem das semanas (1ª → 1ª...), como na cópia,
  // com os dias limitados aos dias úteis da nova semana; semanas a mais no ciclo antigo saem.
  const semanasAnteriores = useRef(null);
  useEffect(() => {
    if (!ciclo) return;
    const anteriores = semanasAnteriores.current;
    semanasAnteriores.current = ciclo.semanas;
    const novas = ciclo.semanas;
    const indiceAntigo = new Map((anteriores || novas).map((s, i) => [s.semana_inicio, i]));
    setLinhas((atuais) =>
      atuais.map((l) => ({
        ...l,
        semanas: Object.fromEntries(
          Object.entries(l.semanas)
            .map(([chave, v]) => {
              const destino = novas[indiceAntigo.get(chave)];
              if (!destino) return null;
              const dias = v.dias === '' || v.dias === undefined ? '' : String(Math.min(Number(v.dias) || 0, destino.dias_uteis));
              return [destino.semana_inicio, { ...v, dias }];
            })
            .filter(Boolean)
        ),
      }))
    );
  }, [ciclo]);

  const payload = useMemo(
    () => ({
      obra_id: obraId ? Number(obraId) : undefined,
      termo_aditivo_id: tac,
      numero_bmm: numeroBmm.trim(),
      referencia,
      observacao: observacao.trim(),
      itens: linhasParaPayload(linhas),
    }),
    [obraId, tac, numeroBmm, referencia, observacao, linhas]
  );

  // Prévia com atraso (fonte única dos valores = back-end).
  useEffect(() => {
    if (!obraId || !referencia || !linhas.length || !ciclo) {
      setCalculo(null);
      setErroCalculo('');
      return undefined;
    }
    const minha = ++sequencia.current;
    const temporizador = setTimeout(async () => {
      setCalculando(true);
      try {
        const resultado = await calcularProjecaoBmm(contrato.id, { ...payload, ...(emEdicao ? { projecao_id: inicial.id } : {}) });
        if (minha === sequencia.current) {
          setCalculo(resultado);
          setErroCalculo('');
        }
      } catch (err) {
        if (minha === sequencia.current) {
          setCalculo(null);
          setErroCalculo(err.message || 'Não foi possível calcular a projeção.');
        }
      } finally {
        if (minha === sequencia.current) setCalculando(false);
      }
    }, ATRASO_PREVIA_MS);
    return () => clearTimeout(temporizador);
  }, [payload, ciclo, contrato.id, emEdicao, inicial.id, obraId, referencia, linhas.length]);

  async function salvar() {
    if (!obraId) return toast.erro('Escolha a obra.');
    if (!numeroBmm.trim()) return toast.erro('Informe o BMM Nº.');
    if (!linhas.length) return toast.erro('Adicione ao menos um item do QQP.');
    setSalvando(true);
    try {
      const salvo = emEdicao ? await atualizarProjecaoBmm(inicial.id, payload) : await criarProjecaoBmm(contrato.id, payload);
      toast.sucesso(`Projeção do BMM ${salvo.numero_bmm} salva: ${formatarMoeda(salvo.total)}.`);
      (salvo.curva || [])
        .filter((c) => !c.atualizada)
        .forEach((c) => toast.aviso(`O Projetado de ${c.referencia} na curva não foi atualizado: ${c.motivo}`, 9000));
      onSalvo(salvo);
    } catch (err) {
      toast.erro(err.message || 'Não foi possível salvar a projeção.');
    } finally {
      setSalvando(false);
    }
    return undefined;
  }

  const obras = contrato.obras || [];
  const semanas = ciclo?.semanas || [];
  const travado = somenteLeitura || salvando;

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-neutro" onClick={onVoltar} disabled={salvando}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar à lista
          </button>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total projetado</p>
            <p className="text-2xl font-bold tabular-nums text-omega-800">
              {calculo ? formatarMoeda(calculo.total) : '—'}
              {calculando ? <Spinner tamanho="sm" className="ml-2 inline text-omega-600" /> : null}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="rotulo" htmlFor="proj-tac">Contrato / TAC (QQP)</label>
            <select
              id="proj-tac"
              className="campo"
              value={tac}
              disabled={travado || emEdicao}
              onChange={(e) => {
                setTac(Number(e.target.value));
                setLinhas([]);
              }}
              title={emEdicao ? 'A edição mantém o contrato/TAC original' : undefined}
            >
              {(qqp?.escopos || [{ tac_id: tac, rotulo: 'Carregando…' }]).map((e) => (
                <option key={e.tac_id} value={e.tac_id}>{e.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="rotulo" htmlFor="proj-obra">Obra (SS) *</label>
            <select id="proj-obra" className="campo" value={obraId} disabled={travado || emEdicao} onChange={(e) => setObraId(e.target.value)}>
              <option value="">Escolha a obra…</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>{[o.ss, o.descricao].filter(Boolean).join(' — ') || `Obra ${o.id}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="proj-bmm">BMM Nº *</label>
            <input id="proj-bmm" className="campo" value={numeroBmm} maxLength={30} disabled={travado} onChange={(e) => setNumeroBmm(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_5.5rem] gap-2">
            <div>
              <label className="rotulo" htmlFor="proj-mes">Mês *</label>
              <select id="proj-mes" className="campo" value={mes} disabled={travado} onChange={(e) => setMes(Number(e.target.value))}>
                {NOMES_MESES.map((nome, i) => (
                  <option key={nome} value={i + 1}>{nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="proj-ano">Ano *</label>
              <input id="proj-ano" type="number" className="campo" min="2000" max="2100" value={ano} disabled={travado} onChange={(e) => setAno(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            Período:{' '}
            <strong className="text-slate-800">{ciclo ? `${dataBr(ciclo.ciclo_inicio)} a ${dataBr(ciclo.ciclo_fim)}` : '—'}</strong>
          </span>
          <span>
            Dias úteis do ciclo: <strong className="text-slate-800">{ciclo?.dias_uteis ?? '—'}</strong>
          </span>
          <span>{semanas.length} semana(s), rotuladas pela sexta-feira{semanas.length ? ` (${diaMes(semanas[0].sexta)} a ${diaMes(semanas[semanas.length - 1].sexta)})` : ''}</span>
          {escopo ? <span>QQP: <strong className="text-slate-800">{escopo.rotulo}</strong></span> : null}
        </div>

        <div>
          <label className="rotulo" htmlFor="proj-obs">Observação</label>
          <input id="proj-obs" className="campo" value={observacao} disabled={travado} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </div>

      {erroCarga ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erroCarga}</div> : null}
      {erroCalculo ? (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {erroCalculo}
        </div>
      ) : null}
      {!obraId && linhas.length ? <p className="text-sm text-slate-500">Escolha a obra para ver os valores calculados.</p> : null}

      <div className="card p-4">
        {!qqp || !ciclo ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Spinner tamanho="md" className="text-omega-600" />
            Carregando QQP e semanas do ciclo…
          </div>
        ) : (
          <GradeSemanal
            arvore={qqp.arvore}
            itensPorId={itensPorId}
            semanas={semanas}
            linhas={linhas}
            calculo={calculo}
            somenteLeitura={travado}
            onAlterar={setLinhas}
          />
        )}
      </div>

      {!somenteLeitura ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-slate-500">
            Ao salvar, a soma das projeções do contrato no mês substitui o &quot;Projetado&quot; da Curva S financeira (com histórico).
          </p>
          <button type="button" className="btn-neutro" onClick={onVoltar} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primario" onClick={salvar} disabled={salvando || !calculo}>
            {salvando ? <Spinner tamanho="sm" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {emEdicao ? 'Salvar alterações' : 'Cadastrar projeção'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
