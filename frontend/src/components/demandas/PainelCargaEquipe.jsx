import { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import Spinner from '../Spinner.jsx';
import { CAPACIDADE_SEMANAL, iniciais } from '../../utils/demandas.js';
import { obterPerfil } from '../../utils/perfis.js';

const CHAVE_RECOLHIDO = 'synapse.demandas.cargaRecolhida';

function lerRecolhido() {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDO) === '1';
  } catch {
    return false;
  }
}

function salvarRecolhido(valor) {
  try {
    localStorage.setItem(CHAVE_RECOLHIDO, valor ? '1' : '0');
  } catch {
    // Preferência apenas de conveniência.
  }
}

/** Faixas da ocupação semanal: confortável, no limite e sobrecarregado. */
function nivelOcupacao(percentual) {
  if (percentual >= 100) return { rotulo: 'Sobrecarga', barra: 'bg-red-500', texto: 'text-red-700' };
  if (percentual >= 70) return { rotulo: 'No limite', barra: 'bg-amber-400', texto: 'text-amber-700' };
  return { rotulo: 'Confortável', barra: 'bg-emerald-500', texto: 'text-emerald-700' };
}

function Metrica({ rotulo, valor, alerta = false }) {
  return (
    <div className="min-w-0">
      <p className={`text-lg font-bold leading-none ${alerta && valor > 0 ? 'text-red-600' : 'text-slate-800'}`}>
        {valor}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
    </div>
  );
}

function MiniCardColaborador({ linha, selecionado, onSelecionar }) {
  const percentual = Math.round((linha.semana / CAPACIDADE_SEMANAL) * 100);
  const nivel = nivelOcupacao(percentual);

  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-pressed={selecionado}
      title={selecionado ? 'Mostrar toda a equipe' : `Filtrar demandas de ${linha.nome}`}
      className={[
        'w-56 shrink-0 rounded-lg border bg-white p-3 text-left shadow-sm transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-omega-500/40',
        selecionado ? 'border-omega-500 ring-2 ring-omega-500/20' : 'border-slate-200 hover:border-omega-500/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-omega-600 text-xs font-bold text-white">
          {iniciais(linha.nome)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{linha.nome}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{obterPerfil(linha.perfil).label}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metrica rotulo="Ativas" valor={linha.ativas} />
        <Metrica rotulo="Fixas" valor={linha.fixas} />
        <Metrica rotulo="Vencidas" valor={linha.vencidas} alerta />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold">
          <span className="uppercase tracking-wide text-slate-400">Ocupação na semana</span>
          <span className={nivel.texto}>{percentual}%</span>
        </div>
        <div
          className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(percentual, 100)}
          aria-label={`Ocupação de ${linha.nome} na semana`}
        >
          <div className={`h-full rounded-full ${nivel.barra} transition-all`} style={{ width: `${Math.min(percentual, 100)}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          {linha.semana} de {CAPACIDADE_SEMANAL} demandas até domingo · {nivel.rotulo}
        </p>
      </div>
    </button>
  );
}

/**
 * Painel retrátil com a síntese de carga da equipe (Workload Overview).
 * Clicar em um colaborador aplica o filtro de responsável na tela.
 */
export default function PainelCargaEquipe({ carga, carregando, erro, usuarioSelecionado, onSelecionar }) {
  const [recolhido, setRecolhido] = useState(lerRecolhido);

  function alternar() {
    setRecolhido((atual) => {
      salvarRecolhido(!atual);
      return !atual;
    });
  }

  const linhas = carga?.colaboradores || [];
  const totais = carga?.totais;

  return (
    <section className="card mb-4 overflow-hidden">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={!recolhido}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
      >
        <Users className="h-4 w-4 shrink-0 text-omega-600" aria-hidden="true" />
        <span className="text-sm font-bold text-slate-800">Carga de trabalho da equipe</span>
        {totais ? (
          <span className="text-xs font-medium text-slate-500">
            {linhas.length} colaborador{linhas.length === 1 ? '' : 'es'} · {totais.ativas} ativa
            {totais.ativas === 1 ? '' : 's'} · {totais.fixas} fixa{totais.fixas === 1 ? '' : 's'} ·{' '}
            <span className={totais.vencidas > 0 ? 'font-bold text-red-600' : ''}>
              {totais.vencidas} vencida{totais.vencidas === 1 ? '' : 's'}
            </span>
          </span>
        ) : null}
        {carregando ? <Spinner tamanho="sm" className="text-slate-400" /> : null}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${recolhido ? '-rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {recolhido ? null : (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {erro ? (
            <p className="text-sm font-medium text-red-600">{erro}</p>
          ) : !carga && carregando ? (
            <div className="flex gap-3">
              {Array.from({ length: 3 }).map((_, indice) => (
                <div key={indice} className="h-40 w-56 shrink-0 animate-pulse rounded-lg border border-slate-200 bg-white" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              Nenhum colaborador com demandas ainda. Planejadores e supervisores ativos aparecem aqui
              automaticamente.
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {linhas.map((linha) => {
                const selecionado = String(linha.usuario_id) === String(usuarioSelecionado);
                return (
                  <MiniCardColaborador
                    key={linha.usuario_id}
                    linha={linha}
                    selecionado={selecionado}
                    onSelecionar={() => onSelecionar(selecionado ? '' : String(linha.usuario_id))}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
