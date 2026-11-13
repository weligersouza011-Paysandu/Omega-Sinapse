import { useEffect, useState } from 'react';
import { AlertTriangle, FilePlus2 } from 'lucide-react';
import Spinner from '../components/Spinner.jsx';
import EditorProjecao from '../components/projecao/EditorProjecao.jsx';
import ListaProjecoes from '../components/projecao/ListaProjecoes.jsx';
import ModalCopiarProjecao from '../components/projecao/ModalCopiarProjecao.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { obterQqp } from '../hooks/useMedicao.js';
import {
  PERFIS_QUE_EXCLUEM_PROJECAO,
  PERFIS_QUE_PROJETAM,
  excluirProjecaoBmm,
  obterProjecaoBmm,
  rotuloReferencia,
  useProjecoesBmm,
} from '../hooks/useProjecaoBmm.js';
import { formatarMoeda } from '../utils/formatters.js';

/**
 * Projeções de BMM do contrato (aba da Medição): lista com filtros, cadastro com cópia de
 * projeção anterior e a grade semanal de dias × pessoas sobre os preços do QQP.
 * A soma das projeções do mês vira o "Projetado" da Curva S financeira (`onCurvaAlterada`).
 */
export default function ProjecaoBmm({ contrato, onCurvaAlterada }) {
  const toast = useToast();
  const { usuario } = useAuth();
  const podeEditar = PERFIS_QUE_PROJETAM.includes(usuario?.perfil);
  const podeExcluir = PERFIS_QUE_EXCLUEM_PROJECAO.includes(usuario?.perfil);

  const [filtros, setFiltros] = useState({ obra: '', referencia: '', tac: 'todos' });
  const { lista, carregando, erro, recarregar } = useProjecoesBmm(contrato?.id, filtros);
  // Todas as projeções do contrato (para sugerir a cópia), independente dos filtros.
  const todas = useProjecoesBmm(contrato?.id, {});
  const [escopos, setEscopos] = useState(null);

  // 'lista' | { modo: 'novo' | 'editar' | 'ver', inicial }
  const [tela, setTela] = useState('lista');
  const [novaAberta, setNovaAberta] = useState(false);
  const [abrindoId, setAbrindoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);

  useEffect(() => {
    setTela('lista');
    setFiltros({ obra: '', referencia: '', tac: 'todos' });
    if (!contrato) return undefined;
    let ativo = true;
    obterQqp(contrato.id, 'todos')
      .then((dados) => ativo && setEscopos(dados.escopos))
      .catch(() => ativo && setEscopos(null));
    return () => {
      ativo = false;
    };
  }, [contrato?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!contrato) {
    return <div className="card flex min-h-[200px] items-center justify-center text-sm text-slate-500">Selecione um contrato.</div>;
  }

  async function abrir(projecao) {
    setAbrindoId(projecao.id);
    try {
      const completa = await obterProjecaoBmm(projecao.id);
      setTela({ modo: podeEditar ? 'editar' : 'ver', inicial: completa, avisos: [] });
    } catch (err) {
      toast.erro(err.message || 'Não foi possível abrir a projeção.');
    } finally {
      setAbrindoId(null);
    }
  }

  async function excluir(projecao) {
    if (!window.confirm(`Excluir a projeção do BMM ${projecao.numero_bmm} (${rotuloReferencia(projecao.referencia)}, ${formatarMoeda(projecao.total)})? O Projetado da curva do mês será recalculado.`)) return;
    setExcluindoId(projecao.id);
    try {
      const resultado = await excluirProjecaoBmm(projecao.id);
      toast.sucesso(`Projeção do BMM ${projecao.numero_bmm} excluída.`);
      (resultado.curva || []).filter((c) => !c.atualizada).forEach((c) => toast.aviso(`Curva de ${c.referencia} não atualizada: ${c.motivo}`, 9000));
      recarregar();
      todas.recarregar();
      onCurvaAlterada?.();
    } catch (err) {
      toast.erro(err.message || 'Não foi possível excluir a projeção.');
    } finally {
      setExcluindoId(null);
    }
  }

  if (tela !== 'lista') {
    return (
      <div className="space-y-3">
        {tela.avisos?.length ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <ul className="list-disc pl-4">{tela.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        ) : null}
        <EditorProjecao
          key={tela.inicial.id || `${tela.inicial.obra_id}-${tela.inicial.referencia}-${tela.modo}`}
          contrato={contrato}
          inicial={tela.inicial}
          emEdicao={tela.modo === 'editar'}
          somenteLeitura={tela.modo === 'ver'}
          onVoltar={() => setTela('lista')}
          onSalvo={() => {
            setTela('lista');
            recarregar();
            todas.recarregar();
            onCurvaAlterada?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Projeções de BMM</h2>
          <p className="text-xs text-slate-500">
            Receita prevista por obra e ciclo (16 a 15), em grade semanal de dias × pessoas sobre os preços do QQP. A soma do mês alimenta o
            Projetado da Curva S.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {abrindoId ? <Spinner tamanho="sm" className="text-omega-600" /> : null}
          {podeEditar ? (
            <button type="button" className="btn-primario" onClick={() => setNovaAberta(true)} disabled={!contrato.obras?.length}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Nova projeção
            </button>
          ) : null}
        </div>
      </div>
      {!contrato.obras?.length ? <p className="text-sm text-slate-500">Vincule obras a este contrato para cadastrar projeções.</p> : null}

      <ListaProjecoes
        lista={lista}
        carregando={carregando}
        erro={erro}
        filtros={filtros}
        onFiltrar={setFiltros}
        obras={contrato.obras || []}
        escopos={escopos}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        ocupadoId={excluindoId}
        onAbrir={abrir}
        onExcluir={excluir}
      />

      <ModalCopiarProjecao
        aberto={novaAberta}
        contrato={contrato}
        projecoes={todas.lista}
        onCancelar={() => setNovaAberta(false)}
        onContinuar={(inicial, avisos) => {
          setNovaAberta(false);
          setTela({ modo: 'novo', inicial, avisos });
        }}
      />
    </div>
  );
}
