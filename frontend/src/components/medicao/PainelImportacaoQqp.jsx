import { useRef, useState } from 'react';
import { AlertTriangle, FileUp, X } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { importarPlanilhaQqp } from '../../hooks/useMedicao.js';
import { ROTULO_CATEGORIA, decimalBr } from './qqpRotulos.js';

const ROTULO_CAMPO = {
  descricao: 'Descrição',
  categoria_planilha: 'Categoria',
  grupo: 'Grupo',
  subgrupo: 'Subgrupo',
  unidade_planilha: 'Unidade',
  quantidade: 'Quantidade',
  preco_unitario: 'Valor unitário',
  unidade: 'Tipo de unidade',
  categoria: 'Categoria Synapse',
};

/**
 * Importação do QQP por planilha .xlsx: primeiro a prévia (novos, substituídos, iguais,
 * erros e o que foi deduzido), depois a confirmação, que grava tudo de uma vez.
 */
export default function PainelImportacaoQqp({ contratoId, tac, rotuloEscopo, revisao, onConcluido, onConflito, onFechar }) {
  const entrada = useRef(null);
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  async function analisar(escolhido) {
    setArquivo(escolhido);
    setPrevia(null);
    setErro('');
    if (!escolhido) return;
    setOcupado(true);
    try {
      setPrevia(await importarPlanilhaQqp(contratoId, tac, escolhido));
    } catch (err) {
      setErro(err.message || 'Não foi possível ler a planilha.');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    setOcupado(true);
    setErro('');
    try {
      const resultado = await importarPlanilhaQqp(contratoId, tac, arquivo, { confirmar: true, revisao: previa?.qqp_revisao ?? revisao });
      onConcluido(resultado);
    } catch (err) {
      if (err.status === 409 || err.status === 428) onConflito(err.message);
      setErro(err.message || 'Não foi possível importar a planilha.');
    } finally {
      setOcupado(false);
    }
  }

  const resumo = previa?.resumo;
  const alteracoes = previa ? previa.linhas.filter((l) => l.acao !== 'igual' || l.reativar) : [];
  const revisar = previa ? previa.linhas.filter((l) => l.unidade_deduzida || l.categoria_deduzida || l.avisos.length) : [];
  const podeConfirmar = previa && !previa.erros.length && alteracoes.length > 0;

  return (
    <section className="rounded-lg border border-omega-100 bg-omega-50/50 p-4" aria-label="Importar planilha do QQP">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Importar planilha · {rotuloEscopo}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Itens com código já existente neste contrato/TAC são substituídos; os demais são incluídos. Itens fora da planilha não mudam.
          </p>
        </div>
        <button type="button" className="btn-neutro !px-2 !py-1" onClick={onFechar} aria-label="Fechar importação" disabled={ocupado}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => analisar(e.target.files?.[0] || null)}
        />
        <button type="button" className="btn-neutro" onClick={() => entrada.current?.click()} disabled={ocupado}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          {arquivo ? 'Escolher outra planilha' : 'Escolher planilha .xlsx'}
        </button>
        {arquivo ? <span className="truncate text-sm text-slate-600">{arquivo.name}</span> : null}
        {ocupado ? <Spinner tamanho="sm" className="text-omega-600" /> : null}
      </div>

      {erro ? <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</div> : null}

      {previa ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['Novos', resumo.novos, 'text-emerald-700'],
              ['Substituídos', resumo.substituidos, 'text-amber-700'],
              ['Sem mudança', resumo.iguais, 'text-slate-600'],
              ['Para revisar', revisar.length, 'text-sky-700'],
              ['Com erro', resumo.com_erro, 'text-red-700'],
            ].map(([rotulo, valor, cor]) => (
              <div key={rotulo} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</p>
                <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
              </div>
            ))}
          </div>

          {!previa.colunas_synapse.temTipo || !previa.colunas_synapse.temCategoria ? (
            <p className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              A planilha não tem as colunas {!previa.colunas_synapse.temTipo ? '"Tipo de unidade"' : ''}
              {!previa.colunas_synapse.temTipo && !previa.colunas_synapse.temCategoria ? ' e ' : ''}
              {!previa.colunas_synapse.temCategoria ? '"Categoria Synapse"' : ''}: os valores foram deduzidos do texto. Confira a lista &quot;Para revisar&quot;.
            </p>
          ) : null}

          {previa.erros.length ? (
            <div className="max-h-48 overflow-y-auto rounded-md border border-red-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-red-50 text-red-800">
                  <tr><th className="px-3 py-1.5 text-left">Linha</th><th className="px-3 py-1.5 text-left">Código</th><th className="px-3 py-1.5 text-left">Problema</th></tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {previa.erros.map((e) => (
                    <tr key={e.linha}>
                      <td className="px-3 py-1.5 tabular-nums">{e.linha}</td>
                      <td className="px-3 py-1.5 font-semibold">{e.codigo || '—'}</td>
                      <td className="px-3 py-1.5">{e.mensagens.join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {revisar.length ? (
            <details className="rounded-md border border-sky-200 bg-white" open={revisar.length <= 20}>
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-sky-800">Classificação deduzida ({revisar.length})</summary>
              <div className="max-h-56 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-sky-50 text-sky-900">
                    <tr><th className="px-3 py-1.5 text-left">Linha</th><th className="px-3 py-1.5 text-left">Código</th><th className="px-3 py-1.5 text-left">Unidade → tipo</th><th className="px-3 py-1.5 text-left">Categoria Synapse</th><th className="px-3 py-1.5 text-left">Avisos</th></tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100">
                    {revisar.map((l) => (
                      <tr key={l.linha}>
                        <td className="px-3 py-1.5 tabular-nums">{l.linha}</td>
                        <td className="px-3 py-1.5 font-semibold">{l.codigo}</td>
                        <td className="px-3 py-1.5">{l.unidade_planilha} → {l.unidade}{l.unidade_deduzida ? ' (deduzido)' : ''}</td>
                        <td className="px-3 py-1.5">{ROTULO_CATEGORIA[l.categoria]}{l.categoria_deduzida ? ' (deduzida)' : ''}</td>
                        <td className="px-3 py-1.5 text-slate-500">{l.avisos.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          {alteracoes.some((l) => l.acao === 'substituir') ? (
            <details className="rounded-md border border-amber-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-amber-800">
                Itens que serão substituídos ({alteracoes.filter((l) => l.acao === 'substituir').length})
              </summary>
              <ul className="max-h-56 divide-y divide-amber-100 overflow-y-auto text-xs">
                {alteracoes
                  .filter((l) => l.acao === 'substituir')
                  .map((l) => (
                    <li key={l.linha} className="px-3 py-1.5">
                      <span className="font-semibold">{l.codigo}</span>:{' '}
                      {l.mudancas
                        .map((campo) => {
                          const formatar = (v) => (campo === 'preco_unitario' || campo === 'quantidade' ? decimalBr(v) : v || '—');
                          return `${ROTULO_CAMPO[campo]} ${formatar(l.antes[campo])} → ${formatar(l[campo])}`;
                        })
                        .join('; ')}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {previa.erros.length ? <span className="text-xs font-semibold text-red-700">Corrija as linhas com erro e escolha a planilha de novo.</span> : null}
            {!previa.erros.length && !alteracoes.length ? <span className="text-xs text-slate-500">Nada a importar: o QQP já está igual à planilha.</span> : null}
            <button type="button" className="btn-primario" onClick={confirmar} disabled={!podeConfirmar || ocupado}>
              {ocupado ? <Spinner tamanho="sm" /> : null}
              Importar ({resumo.novos} novos, {resumo.substituidos} substituídos)
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
