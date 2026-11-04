import { Link } from 'react-router-dom';
import { CalendarRange, Construction, ExternalLink } from 'lucide-react';
import { StatusRestricaoBadge } from '../dashboard/DashboardBadges.jsx';
import { formatarData, semanaISO } from '../../utils/formatters.js';

const SEMANAS = 6;
const ABERTAS = ['PENDENTE', 'EM_ANDAMENTO'];
const DIA_MS = 24 * 60 * 60 * 1000;

/** Segunda-feira (00:00 local) da semana de `data`. */
function inicioDaSemana(data) {
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diaSemana = (inicio.getDay() + 6) % 7; // 0 = segunda
  inicio.setDate(inicio.getDate() - diaSemana);
  return inicio;
}

/** Prazo AAAA-MM-DD (coluna DATE) como data local, sem deslocamento de fuso. */
function dataLocal(valor) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Aba "Programação de 6 Semanas (6WLA)".
 *
 * Estrutura inicial do lookahead: janela das próximas seis semanas com as
 * restrições abertas da obra distribuídas pelo prazo de remoção. A programação
 * semanal de atividades será implementada sobre esta mesma grade.
 */
export default function AbaProgramacao6Semanas({ obra }) {
  const restricoes = obra.restricoes || [];
  const abertas = restricoes.filter((restricao) => ABERTAS.includes(restricao.status));

  const hoje = new Date();
  const primeiraSegunda = inicioDaSemana(hoje);
  const semanas = Array.from({ length: SEMANAS }, (_, indice) => {
    const inicio = new Date(primeiraSegunda.getTime() + indice * 7 * DIA_MS);
    const fim = new Date(inicio.getTime() + 6 * DIA_MS);
    return { indice, inicio, fim, numero: semanaISO(inicio), itens: [] };
  });

  const atrasadas = [];
  const semPrazo = [];
  abertas.forEach((restricao) => {
    const prazo = dataLocal(restricao.prazo);
    if (!prazo) {
      semPrazo.push(restricao);
      return;
    }
    if (prazo < primeiraSegunda) {
      atrasadas.push(restricao);
      return;
    }
    const indice = Math.floor((prazo - primeiraSegunda) / (7 * DIA_MS));
    if (indice < SEMANAS) semanas[indice].itens.push(restricao);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <Construction className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-amber-900">Programação semanal em preparação</p>
            <p className="text-xs text-amber-800">
              A grade abaixo já mostra as restrições abertas por prazo. O planejamento de atividades por semana será
              adicionado aqui.
            </p>
          </div>
        </div>
        <Link to="/planejamento" className="btn-neutro shrink-0">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Gerenciar restrições
        </Link>
      </div>

      <section className="card p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <CalendarRange className="h-4 w-4 text-omega-600" aria-hidden="true" />
            Janela de 6 semanas
          </h2>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{atrasadas.length} atrasada(s)</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{semPrazo.length} sem prazo</span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {semanas.map((semana) => (
            <div
              key={semana.indice}
              className={`flex min-h-[9rem] flex-col rounded-lg border p-2 ${
                semana.indice === 0 ? 'border-omega-500/50 bg-omega-50/40' : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Sem. {semana.numero}
                {semana.indice === 0 ? <span className="ml-1 text-omega-700">· atual</span> : null}
              </p>
              <p className="mb-2 text-[10px] text-slate-400">
                {formatarData(semana.inicio)} – {formatarData(semana.fim)}
              </p>
              <ul className="space-y-1.5">
                {semana.itens.map((restricao) => (
                  <li
                    key={restricao.id}
                    className="rounded border border-amber-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                    title={restricao.descricao}
                  >
                    <p className="line-clamp-2 font-semibold">{restricao.atividade}</p>
                    <p className="text-[10px] text-slate-400">Prazo {formatarData(restricao.prazo)}</p>
                  </li>
                ))}
              </ul>
              {semana.itens.length === 0 ? (
                <p className="mt-auto text-[10px] italic text-slate-400">Sem restrições com prazo</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Mapeamento de restrições</h2>
          <p className="text-xs text-slate-500">{restricoes.length} restrição(ões) cadastrada(s) para esta obra.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Atividade', 'Restrição', 'Responsável', 'Prazo', 'Status'].map((titulo) => (
                  <th
                    key={titulo}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {restricoes.map((restricao) => (
                <tr key={restricao.id} className="align-top">
                  <td className="px-3 py-2 font-semibold text-slate-700">
                    {restricao.atividade}
                    {restricao.etapa ? <p className="text-[11px] font-normal text-slate-400">{restricao.etapa}</p> : null}
                  </td>
                  <td className="min-w-[14rem] px-3 py-2 text-slate-600">{restricao.descricao}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {restricao.responsavel || '—'}
                    {restricao.empresa_responsavel ? (
                      <p className="text-[11px] text-slate-400">{restricao.empresa_responsavel}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {restricao.prazo ? formatarData(restricao.prazo) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusRestricaoBadge status={restricao.status} />
                  </td>
                </tr>
              ))}
              {restricoes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Nenhuma restrição mapeada para esta obra.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
