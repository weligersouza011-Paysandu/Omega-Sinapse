import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { importarPlanilhasMedicao } from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda, formatarPercentual } from '../../utils/formatters.js';

/**
 * Importação do histórico de medição pelas duas planilhas CSV (medição bmm.csv e
 * Curva tendencia.csv). Primeiro simula e mostra o que será gravado; só depois de
 * conferir o administrador confirma a importação.
 */
export default function ModalImportarPlanilhas({ aberto, onFechar, onImportado }) {
  const toast = useToast();
  const [medicao, setMedicao] = useState(null);
  const [curva, setCurva] = useState(null);
  const [idVale, setIdVale] = useState('CT-251');
  const [valorContrato, setValorContrato] = useState('157087293.70');
  const [simulacao, setSimulacao] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    if (aberto) {
      setMedicao(null);
      setCurva(null);
      setSimulacao(null);
      setErro('');
      setOcupado('');
    }
  }, [aberto]);

  const pronto = Boolean(medicao && curva);
  const campos = { id_vale: idVale, valor_inicial: valorContrato };

  function trocarArquivo(definir) {
    return (evento) => {
      definir(evento.target.files?.[0] || null);
      setSimulacao(null);
      setErro('');
    };
  }

  async function simular() {
    setOcupado('simulando');
    setErro('');
    try {
      setSimulacao(await importarPlanilhasMedicao({ medicao, curva, aplicar: false, campos }));
    } catch (err) {
      setSimulacao(null);
      setErro(err.message || 'Não foi possível ler as planilhas.');
    } finally {
      setOcupado('');
    }
  }

  async function importar() {
    setOcupado('importando');
    setErro('');
    try {
      const resposta = await importarPlanilhasMedicao({ medicao, curva, aplicar: true, campos });
      if (resposta.aplicado) {
        toast.sucesso(
          `Importação concluída: ${resposta.resultado.boletins_criados} boletim(ns) novo(s), ${resposta.resultado.itens} item(ns).`
        );
        onImportado(resposta.resultado);
        onFechar();
      } else {
        setSimulacao(resposta);
        setErro('A importação não foi concluída: corrija os erros apontados.');
      }
    } catch (err) {
      setErro(err.message || 'Não foi possível importar.');
      toast.erro(err.message || 'Não foi possível importar.');
    } finally {
      setOcupado('');
    }
  }

  const plano = simulacao?.plano;
  const comErros = Boolean(simulacao?.erros?.length);

  return (
    <ModalBase
      aberto={aberto}
      titulo="Importar histórico de medição"
      subtitulo="Envie as duas planilhas (CSV) da pasta de medição. Você confere o resumo antes de gravar."
      onFechar={() => (ocupado ? null : onFechar())}
      tamanho="xl"
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="imp-medicao">Planilha de medição (medição bmm.csv) *</label>
            <input id="imp-medicao" type="file" accept=".csv,text/csv" className="campo" onChange={trocarArquivo(setMedicao)} disabled={Boolean(ocupado)} />
          </div>
          <div>
            <label className="rotulo" htmlFor="imp-curva">Planilha da curva (Curva tendencia.csv) *</label>
            <input id="imp-curva" type="file" accept=".csv,text/csv" className="campo" onChange={trocarArquivo(setCurva)} disabled={Boolean(ocupado)} />
          </div>
          <div>
            <label className="rotulo" htmlFor="imp-contrato">Contrato</label>
            <input id="imp-contrato" className="campo" value={idVale} onChange={(e) => setIdVale(e.target.value)} disabled={Boolean(ocupado)} />
            <p className="mt-1 text-[11px] text-slate-500">Se o contrato já existir, ele é mantido e os boletins entram nele.</p>
          </div>
          <div>
            <label className="rotulo" htmlFor="imp-valor">Valor do contrato (R$), só ao criar</label>
            <input id="imp-valor" type="number" min="0" step="0.01" className="campo" value={valorContrato} onChange={(e) => setValorContrato(e.target.value)} disabled={Boolean(ocupado)} />
          </div>
        </section>

        {erro ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div>
        ) : null}

        {simulacao ? (
          <section className="space-y-3">
            {comErros ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="mb-1 flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Não é possível importar: corrija as planilhas
                </p>
                <ul className="list-disc pl-5 text-xs">
                  {simulacao.erros.slice(0, 12).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {simulacao.erros.length > 12 ? <li>... e mais {simulacao.erros.length - 12}</li> : null}
                </ul>
              </div>
            ) : null}

            {plano ? (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    ['Boletins', `${plano.totais.boletins}`],
                    ['Total medido', formatarMoeda(plano.totais.total_medido)],
                    ['Itens (SS × BMM)', `${plano.totais.itens}`],
                    ['Ciclos da curva', `${plano.curva_ciclos}`],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
                      <p className="text-base font-black tabular-nums text-slate-800">{valor}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-600">
                  Contrato <strong>{plano.contrato.id_vale}</strong> · {formatarMoeda(plano.contrato.valor_inicial)} · vigência{' '}
                  {formatarData(plano.contrato.data_inicio)} a {formatarData(plano.contrato.data_fim)}.{' '}
                  <strong>{plano.codigos.com_obra}</strong> de {plano.codigos.total} códigos de SS casam com obras do
                  Synapse ({plano.vinculos.length} obra(s) serão vinculadas ao contrato); os outros{' '}
                  {plano.codigos.sem_obra.length} entram só como código da SS.
                </p>

                {plano.avisos.length ? (
                  <ul className="list-disc rounded-md border border-amber-200 bg-amber-50 px-3 py-2 pl-7 text-xs text-amber-900">
                    {plano.avisos.map((aviso) => (
                      <li key={aviso}>{aviso}</li>
                    ))}
                  </ul>
                ) : null}

                {plano.obras_acima_do_orcamento.length ? (
                  <details className="rounded-md border border-slate-200 text-xs">
                    <summary className="cursor-pointer px-3 py-2 font-semibold text-slate-700">
                      {plano.obras_acima_do_orcamento.length} obra(s) com medido acima do valor do orçamento (confira os aditivos)
                    </summary>
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {plano.obras_acima_do_orcamento.map((obra) => (
                        <li key={obra.obra_id} className="flex justify-between gap-3 px-3 py-1.5">
                          <span className="font-semibold">{obra.ss}</span>
                          <span className="tabular-nums text-slate-600">
                            {formatarMoeda(obra.medido)} de {formatarMoeda(obra.valor_orcamento)} ({formatarPercentual(obra.percentual, 0)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        {['BMM', 'Ciclo', 'Valor medido', 'SS'].map((t) => (
                          <th key={t} className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {plano.boletins.map((b) => (
                        <tr key={b.numero_bmm}>
                          <td className="px-3 py-1.5 font-semibold text-omega-700">{b.numero_bmm}</td>
                          <td className="px-3 py-1.5 text-slate-600">{formatarData(b.ciclo_inicio)} a {formatarData(b.ciclo_fim)}</td>
                          <td className="px-3 py-1.5 tabular-nums">{formatarMoeda(b.valor_medido)}</td>
                          <td className="px-3 py-1.5 tabular-nums text-slate-600">{b.itens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!comErros ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Planilhas válidas. Boletins que já existem no contrato são mantidos; nada é apagado.
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
        <button type="button" className="btn-neutro" onClick={onFechar} disabled={Boolean(ocupado)}>
          Cancelar
        </button>
        <button type="button" className="btn-neutro" onClick={simular} disabled={!pronto || Boolean(ocupado)}>
          {ocupado === 'simulando' ? <Spinner tamanho="sm" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
          Conferir planilhas
        </button>
        <button type="button" className="btn-primario" onClick={importar} disabled={!plano || comErros || Boolean(ocupado)}>
          {ocupado === 'importando' ? <Spinner tamanho="sm" /> : null}
          Importar agora
        </button>
      </div>
    </ModalBase>
  );
}
