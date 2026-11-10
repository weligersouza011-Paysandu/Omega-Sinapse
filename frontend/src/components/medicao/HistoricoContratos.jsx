import { useState } from 'react';
import { ExternalLink, FileSignature, Pencil, Trash2 } from 'lucide-react';
import ModalBase from '../ModalBase.jsx';
import Spinner from '../Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { excluirContrato } from '../../hooks/useMedicao.js';
import { formatarData, formatarMoeda } from '../../utils/formatters.js';

const Th = ({ children }) => (
  <th scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
    {children}
  </th>
);

/**
 * Histórico de contratos: todos os contratos cadastrados, com o que cada um tem
 * (TACs, boletins, obras) e as ações de abrir no dashboard, corrigir e excluir.
 */
export default function HistoricoContratos({ contratos, contratoAbertoId, podeGerir, ehAdmin, onAbrir, onEditar, onExcluido }) {
  const toast = useToast();
  const [excluir, setExcluir] = useState(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const temDados = (contrato) =>
    contrato.quantidade_boletins + contrato.aditivos.length + contrato.quantidade_itens_qqp > 0 || contrato.possui_curva;

  function pedirExclusao(contrato) {
    setConfirmacao('');
    setExcluir(contrato);
  }

  async function confirmarExclusao() {
    setExcluindo(true);
    try {
      const resultado = await excluirContrato(excluir.id, { forcar: temDados(excluir) });
      toast.sucesso(`Contrato ${resultado.id_vale} excluído.`);
      setExcluir(null);
      onExcluido(excluir.id);
    } catch (err) {
      toast.erro(err.message || 'Não foi possível excluir o contrato.');
    } finally {
      setExcluindo(false);
    }
  }

  const exigeDigitar = excluir ? temDados(excluir) : false;
  const podeConfirmar = excluir && (!exigeDigitar || confirmacao.trim().toUpperCase() === excluir.id_vale.toUpperCase());

  return (
    <section className="card overflow-hidden" aria-label="Histórico de contratos">
      <header className="px-5 py-4">
        <h3 className="text-sm font-bold text-slate-800">Histórico de contratos</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Todos os contratos cadastrados. Abra um no dashboard, corrija o identificador, o valor ou a vigência, ou exclua
          o que foi cadastrado por engano.
        </p>
      </header>

      {contratos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <FileSignature className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhum contrato cadastrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Contrato</Th>
                <Th>Vigência</Th>
                <Th>Valor inicial</Th>
                <Th>TACs</Th>
                <Th>Teto atual</Th>
                <Th>Boletins</Th>
                <Th>Obras</Th>
                <Th>Cadastrado em</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {contratos.map((contrato) => {
                const aberto = contrato.id === contratoAbertoId;
                return (
                  <tr key={contrato.id} className={aberto ? 'bg-omega-50/50' : ''}>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-slate-800">{contrato.id_vale}</p>
                      <p className="text-[11px] text-slate-500">{contrato.descricao}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {formatarData(contrato.data_inicio)} a {formatarData(contrato.data_fim)}
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          contrato.em_vigencia ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {contrato.em_vigencia ? 'vigente' : 'encerrado'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{formatarMoeda(contrato.valor_inicial)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">
                      {contrato.aditivos.length}
                      {contrato.aditivos.length ? ` (${formatarMoeda(contrato.consolidado.total_aditivos)})` : ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-slate-800">{formatarMoeda(contrato.consolidado.teto_atual)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{contrato.quantidade_boletins}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{contrato.obras.length}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatarData(contrato.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          className="btn-neutro !px-2 !py-1 !text-[11px]"
                          onClick={() => onAbrir(contrato.id)}
                          disabled={aberto}
                          title="Ver este contrato no dashboard"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          {aberto ? 'Aberto' : 'Abrir'}
                        </button>
                        {podeGerir ? (
                          <button
                            type="button"
                            className="btn-neutro !px-2 !py-1 !text-[11px]"
                            onClick={() => onEditar(contrato)}
                            aria-label={`Corrigir ${contrato.id_vale}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Corrigir
                          </button>
                        ) : null}
                        {ehAdmin ? (
                          <button
                            type="button"
                            className="btn-neutro !px-2 !py-1 !text-[11px] hover:!border-red-300 hover:!text-red-600"
                            onClick={() => pedirExclusao(contrato)}
                            aria-label={`Excluir ${contrato.id_vale}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ModalBase
        aberto={Boolean(excluir)}
        titulo="Excluir contrato?"
        subtitulo={excluir ? `${excluir.id_vale} · ${excluir.descricao}` : ''}
        onFechar={() => (excluindo ? null : setExcluir(null))}
        tamanho="md"
      >
        {excluir ? (
          <div className="space-y-3 p-5">
            {temDados(excluir) ? (
              <>
                <p className="text-sm text-slate-700">
                  Serão apagados junto com o contrato (<strong>não dá para desfazer</strong>):
                </p>
                <ul className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700">
                  <li className="flex justify-between py-0.5"><span>Boletins de medição</span><strong>{excluir.quantidade_boletins}</strong></li>
                  <li className="flex justify-between py-0.5"><span>Termos aditivos (TAC)</span><strong>{excluir.aditivos.length}</strong></li>
                  <li className="flex justify-between py-0.5"><span>Itens do QQP</span><strong>{excluir.quantidade_itens_qqp}</strong></li>
                  <li className="flex justify-between py-0.5"><span>Curva financeira</span><strong>{excluir.possui_curva ? 'sim' : 'não'}</strong></li>
                </ul>
                {excluir.obras.length ? (
                  <p className="text-xs text-slate-600">
                    As {excluir.obras.length} obra(s) vinculada(s) não são apagadas: só ficam sem contrato.
                  </p>
                ) : null}
                <div>
                  <label className="rotulo" htmlFor="ct-confirma">Digite {excluir.id_vale} para confirmar</label>
                  <input id="ct-confirma" className="campo" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoFocus />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-700">
                Este contrato está vazio (sem boletins, TACs ou QQP). Ele será removido e isso não pode ser desfeito.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setExcluir(null)} disabled={excluindo}>
                Cancelar
              </button>
              <button type="button" className="btn-perigo" onClick={confirmarExclusao} disabled={excluindo || !podeConfirmar}>
                {excluindo ? <Spinner tamanho="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Excluir contrato
              </button>
            </div>
          </div>
        ) : null}
      </ModalBase>
    </section>
  );
}
