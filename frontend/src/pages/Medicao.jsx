import { useEffect, useState } from 'react';
import { AlertTriangle, FilePlus2, FileSignature, FileSpreadsheet, Link2, ReceiptText, RefreshCw, Table2, Trash2 } from 'lucide-react';
import ModalBase from '../components/ModalBase.jsx';
import Spinner from '../components/Spinner.jsx';
import ArvoreMedicao from '../components/medicao/ArvoreMedicao.jsx';
import CurvaSFinanceira from '../components/medicao/CurvaSFinanceira.jsx';
import GaugeAderencia from '../components/medicao/GaugeAderencia.jsx';
import KpisMedicao from '../components/medicao/KpisMedicao.jsx';
import ModalBoletim from '../components/medicao/ModalBoletim.jsx';
import HistoricoBoletins from '../components/medicao/HistoricoBoletins.jsx';
import HistoricoContratos from '../components/medicao/HistoricoContratos.jsx';
import ModalContrato from '../components/medicao/ModalContrato.jsx';
import ModalItemBoletim from '../components/medicao/ModalItemBoletim.jsx';
import ModalImportarPlanilhas from '../components/medicao/ModalImportarPlanilhas.jsx';
import ModalQqp from '../components/medicao/ModalQqp.jsx';
import ModalTac from '../components/medicao/ModalTac.jsx';
import ModalVincularObras from '../components/medicao/ModalVincularObras.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PERFIS_QUE_GEREM_MEDICAO,
  atualizarStatusBoletim,
  excluirBoletim,
  removerItemBoletim,
  useDashboardMedicao,
} from '../hooks/useMedicao.js';
import { formatarData, formatarMoeda } from '../utils/formatters.js';

const ROTULO_STATUS = { APROVADO: 'aprovado', REJEITADO: 'rejeitado', EM_ANALISE: 'voltou para análise' };

/**
 * Dashboard de Medição: contrato (ex.: CT-251), TACs, boletins de medição (BMM)
 * por SS e Curva S financeira. SUPERVISOR e ADMIN também cadastram contratos,
 * registram TACs, vinculam obras e lançam/aprovam boletins.
 */
export default function Medicao() {
  const toast = useToast();
  const { usuario } = useAuth();
  const podeGerir = PERFIS_QUE_GEREM_MEDICAO.includes(usuario?.perfil);

  const { contratos, contratoId, selecionarContrato, dados, carregando, carregandoContratos, erro, recarregar } =
    useDashboardMedicao();

  // Diálogos: 'contrato' | 'tac' | 'obras' | 'boletim' | 'qqp' | 'importar' | 'editar' | null.
  const [dialogo, setDialogo] = useState(null);
  const [aba, setAba] = useState('dashboard');
  const [contratoEmEdicao, setContratoEmEdicao] = useState(null);
  const [boletimOcupadoId, setBoletimOcupadoId] = useState(null);
  const [excluir, setExcluir] = useState(null);
  // SS de um boletim: { boletim, item } para incluir (item nulo) ou corrigir; e a remoção pedida.
  const [itemEmEdicao, setItemEmEdicao] = useState(null);
  const [itemParaRemover, setItemParaRemover] = useState(null);
  const [removendoItem, setRemovendoItem] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const anterior = document.title;
    document.title = 'Medição · Synapse';
    return () => {
      document.title = anterior;
    };
  }, []);

  const contrato = contratos.find((item) => item.id === contratoId) || null;

  async function alterarStatus(boletim, status) {
    setBoletimOcupadoId(boletim.id);
    try {
      await atualizarStatusBoletim(contratoId, boletim.id, status);
      toast.sucesso(`${boletim.numero_bmm} ${ROTULO_STATUS[status]}.`);
      recarregar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível alterar o boletim.');
    } finally {
      setBoletimOcupadoId(null);
    }
  }

  async function confirmarRemocaoItem() {
    setRemovendoItem(true);
    try {
      const atualizado = await removerItemBoletim(contratoId, itemParaRemover.boletim.id, itemParaRemover.item.id);
      toast.sucesso(`${itemParaRemover.item.ss || 'SS'} tirada de ${atualizado.numero_bmm}. Total: ${formatarMoeda(atualizado.valor_medido)}.`);
      setItemParaRemover(null);
      recarregar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível tirar a SS do boletim.');
    } finally {
      setRemovendoItem(false);
    }
  }

  async function confirmarExclusao() {
    setExcluindo(true);
    try {
      await excluirBoletim(contratoId, excluir.id);
      toast.sucesso(`${excluir.numero_bmm} excluído.`);
      setExcluir(null);
      recarregar();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível excluir o boletim.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 pb-4 sm:space-y-5">
      <header className="card flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Medição e projeção financeira</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-800">
            {contrato ? `${contrato.id_vale} · ${contrato.descricao}` : 'Dashboard de Medição'}
          </h2>
          {contrato ? (
            <p className="mt-0.5 text-xs text-slate-500">
              Vigência {formatarData(contrato.data_inicio)} a {formatarData(contrato.data_fim)}
              {contrato.em_vigencia ? '' : ' (fora da vigência)'} · {contrato.obras.length} obra(s) vinculada(s)
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {contratos.length > 1 ? (
            <label className="min-w-[220px]">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Contrato</span>
              <select
                className="campo w-full"
                value={contratoId ?? ''}
                onChange={(evento) => selecionarContrato(Number(evento.target.value))}
              >
                {contratos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id_vale} — {item.descricao}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {usuario?.perfil === 'ADMIN' ? (
            <button type="button" className="btn-neutro" onClick={() => setDialogo('importar')}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Importar planilhas
            </button>
          ) : null}

          {podeGerir ? (
            <>
              <button type="button" className="btn-neutro" onClick={() => setDialogo('contrato')}>
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                Novo contrato
              </button>
              {contrato ? (
                <>
                  <button type="button" className="btn-neutro" onClick={() => setDialogo('tac')}>
                    <FileSignature className="h-4 w-4" aria-hidden="true" />
                    Registrar TAC
                  </button>
                  <button type="button" className="btn-neutro" onClick={() => setDialogo('obras')}>
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    Vincular obras
                  </button>
                  <button type="button" className="btn-primario" onClick={() => setDialogo('boletim')}>
                    <ReceiptText className="h-4 w-4" aria-hidden="true" />
                    Lançar boletim
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {contrato ? (
            <button type="button" className="btn-neutro" onClick={() => setDialogo('qqp')}>
              <Table2 className="h-4 w-4" aria-hidden="true" />
              Matriz QQP
            </button>
          ) : null}

          <button type="button" className="btn-neutro" onClick={recarregar} disabled={carregando}>
            {carregando ? <Spinner tamanho="sm" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Atualizar
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="Seções da medição" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {[
          ['dashboard', 'Dashboard de medição'],
          ['medicoes', `Histórico de medições (${dados?.boletins?.length ?? 0})`],
          ['historico', `Histórico de contratos (${contratos.length})`],
        ].map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              aba === id ? 'bg-white text-omega-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-red-800">Não foi possível carregar a medição</p>
              <p className="mt-0.5 text-xs text-red-700">{erro}</p>
            </div>
          </div>
          <button type="button" onClick={recarregar} className="btn-neutro shrink-0">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      ) : null}

      {aba === 'medicoes' ? (
        <HistoricoBoletins
          contratoId={contratoId}
          boletins={dados?.boletins || []}
          podeGerir={podeGerir}
          onAtualizado={recarregar}
          onExcluir={setExcluir}
        />
      ) : aba === 'historico' ? (
        <HistoricoContratos
          contratos={contratos}
          contratoAbertoId={contratoId}
          podeGerir={podeGerir}
          ehAdmin={usuario?.perfil === 'ADMIN'}
          onAbrir={(id) => {
            selecionarContrato(id);
            setAba('dashboard');
          }}
          onEditar={(item) => {
            setContratoEmEdicao(item);
            setDialogo('editar');
          }}
          onExcluido={recarregar}
          onRecarregar={recarregar}
        />
      ) : carregandoContratos && !contratos.length ? (
        <div className="card flex min-h-[260px] items-center justify-center gap-2 text-sm text-slate-500">
          <Spinner tamanho="md" className="text-omega-600" />
          Carregando contratos...
        </div>
      ) : !contratos.length && !erro ? (
        <div className="card flex min-h-[260px] flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <FileSignature className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Nenhum contrato cadastrado</p>
          <p className="max-w-md text-xs text-slate-500">
            Cadastre o contrato com a Vale (ex.: CT-251), seus termos aditivos e os boletins de medição para acompanhar
            o saldo contratual e a Curva S financeira aqui.
          </p>
          {usuario?.perfil === 'ADMIN' ? (
            <button type="button" className="btn-primario mt-2" onClick={() => setDialogo('importar')}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Importar planilhas de medição
            </button>
          ) : null}
          {podeGerir ? (
            <button type="button" className="btn-neutro mt-1" onClick={() => setDialogo('contrato')}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Cadastrar contrato
            </button>
          ) : (

            <p className="mt-1 text-xs text-slate-400">O cadastro é feito por um supervisor ou administrador.</p>
          )}
        </div>
      ) : dados ? (
        <div className={carregando ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <div className="space-y-4 sm:space-y-5">
            <KpisMedicao kpis={dados.kpis} />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <GaugeAderencia aderencia={dados.aderencia_financeira} />
              <ArvoreMedicao
                key={dados.contrato.id}
                boletins={dados.boletins}
                podeGerir={podeGerir}
                boletimOcupadoId={boletimOcupadoId}
                onAlterarStatus={alterarStatus}
                onExcluir={setExcluir}
                onLancar={() => setDialogo('boletim')}
                onAdicionarItem={(boletim) => setItemEmEdicao({ boletim, item: null })}
                onEditarItem={(boletim, item) => setItemEmEdicao({ boletim, item })}
                onRemoverItem={(boletim, item) => setItemParaRemover({ boletim, item })}
              />
            </div>

            <CurvaSFinanceira curva={dados.curva_s} fonte={dados.curva_s_fonte} />
          </div>
        </div>
      ) : null}

      <ModalContrato
        aberto={dialogo === 'contrato'}
        onFechar={() => setDialogo(null)}
        onCriado={(novo) => {
          selecionarContrato(novo.id);
          recarregar();
        }}
      />
      <ModalTac aberto={dialogo === 'tac'} contrato={contrato} onFechar={() => setDialogo(null)} onSalvo={recarregar} />
      <ModalVincularObras
        aberto={dialogo === 'obras'}
        contrato={contrato}
        onFechar={() => setDialogo(null)}
        onSalvo={recarregar}
      />
      <ModalContrato
        aberto={dialogo === 'editar'}
        contrato={contratoEmEdicao}
        onFechar={() => setDialogo(null)}
        onCriado={recarregar}
      />
      <ModalImportarPlanilhas
        aberto={dialogo === 'importar'}
        onFechar={() => setDialogo(null)}
        onImportado={recarregar}
      />
      <ModalQqp aberto={dialogo === 'qqp'} contrato={contrato} podeGerir={podeGerir} onFechar={() => setDialogo(null)} />
      <ModalBoletim
        aberto={dialogo === 'boletim'}
        contrato={contrato}
        boletins={dados?.boletins || []}
        onFechar={() => setDialogo(null)}
        onSalvo={recarregar}
      />

      <ModalItemBoletim
        aberto={Boolean(itemEmEdicao)}
        contratoId={contratoId}
        boletim={itemEmEdicao?.boletim || null}
        item={itemEmEdicao?.item || null}
        onFechar={() => setItemEmEdicao(null)}
        onSalvo={recarregar}
      />

      <ModalBase
        aberto={Boolean(itemParaRemover)}
        titulo="Tirar SS do boletim?"
        subtitulo={itemParaRemover ? `${itemParaRemover.boletim.numero_bmm} · ${itemParaRemover.item.ss || 'SS'} · ${formatarMoeda(itemParaRemover.item.valor)}` : ''}
        onFechar={() => (removendoItem ? null : setItemParaRemover(null))}
        tamanho="md"
      >
        {itemParaRemover ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-slate-700">
              O valor de {formatarMoeda(itemParaRemover.item.valor)} sai do total do boletim
              {itemParaRemover.boletim.status === 'APROVADO' ? ' e dos acumulados do dashboard' : ''}. Você pode adicionar a
              SS de novo depois.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setItemParaRemover(null)} disabled={removendoItem}>Cancelar</button>
              <button type="button" className="btn-perigo" onClick={confirmarRemocaoItem} disabled={removendoItem}>
                {removendoItem ? <Spinner tamanho="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Tirar do boletim
              </button>
            </div>
          </div>
        ) : null}
      </ModalBase>

      <ModalBase
        aberto={Boolean(excluir)}
        titulo="Excluir boletim?"
        subtitulo={excluir ? `${excluir.numero_bmm} · ${formatarMoeda(excluir.valor_medido)}` : ''}
        onFechar={() => (excluindo ? null : setExcluir(null))}
        tamanho="md"
      >
        {excluir ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-slate-700">
              O boletim e o detalhamento por SS serão removidos
              {excluir.status === 'APROVADO' ? ', e o total acumulado e a Curva S serão recalculados' : ''}. Esta ação
              não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-neutro" onClick={() => setExcluir(null)} disabled={excluindo}>
                Cancelar
              </button>
              <button type="button" className="btn-perigo" onClick={confirmarExclusao} disabled={excluindo}>
                {excluindo ? <Spinner tamanho="sm" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                Excluir boletim
              </button>
            </div>
          </div>
        ) : null}
      </ModalBase>
    </div>
  );
}
