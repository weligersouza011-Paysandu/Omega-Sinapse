/** Utilitários visuais compartilhados pelos componentes do dashboard. */

const BASE_BADGE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide';

export const ESTILOS_STATUS_OBRA = {
  PARA_INICIAR: {
    label: 'Para Iniciar',
    classe: `${BASE_BADGE} border-slate-200 bg-slate-100 text-slate-600`,
    hex: '#64748b',
  },
  EM_ANDAMENTO: {
    label: 'Em Andamento',
    classe: `${BASE_BADGE} border-sky-200 bg-sky-50 text-sky-700`,
    hex: '#0284c7',
  },
  PARALISADA: {
    label: 'Paralisada',
    classe: `${BASE_BADGE} border-amber-200 bg-amber-50 text-amber-700`,
    hex: '#d97706',
  },
  CONCLUIDA: {
    label: 'Concluída',
    classe: `${BASE_BADGE} border-emerald-200 bg-emerald-50 text-emerald-700`,
    hex: '#059669',
  },
};

export const ESTILOS_CATEGORIA = {
  CADEIA_DE_AJUDA: {
    label: 'Cadeia de Ajuda',
    classe: `${BASE_BADGE} border-violet-200 bg-violet-50 text-violet-700`,
    ponto: 'bg-violet-500',
    hex: '#8b5cf6',
  },
  CARTEIRA_DA_COORDENACAO: {
    label: 'Carteira da Coordenação',
    classe: `${BASE_BADGE} border-cyan-200 bg-cyan-50 text-cyan-700`,
    ponto: 'bg-cyan-500',
    hex: '#0891b2',
  },
};

export const ESTILOS_RESTRICAO = {
  PENDENTE: {
    label: 'Pendente',
    classe: `${BASE_BADGE} border-red-200 bg-red-50 text-red-700`,
  },
  EM_ANDAMENTO: {
    label: 'Em Andamento',
    classe: `${BASE_BADGE} border-amber-200 bg-amber-50 text-amber-700`,
  },
  RESOLVIDA: {
    label: 'Resolvida',
    classe: `${BASE_BADGE} border-emerald-200 bg-emerald-50 text-emerald-700`,
  },
  CANCELADA: {
    label: 'Cancelada',
    classe: `${BASE_BADGE} border-slate-200 bg-slate-100 text-slate-600`,
  },
};

const ESTILO_RESTRICAO_PADRAO = {
  label: 'Pendente',
  classe: `${BASE_BADGE} border-slate-200 bg-slate-100 text-slate-600`,
};

export const ESTILOS_ORIGEM_RESTRICAO = {
  CADASTRADA: {
    label: 'Restrição 6WLA',
    classe: `${BASE_BADGE} border-omega-100 bg-omega-50 text-omega-700`,
  },
  DERIVADA: {
    label: 'Pendência documental',
    classe: `${BASE_BADGE} border-amber-200 bg-amber-50 text-amber-700`,
  },
  ATIVIDADE: {
    label: 'Atividade em aberto',
    classe: `${BASE_BADGE} border-sky-200 bg-sky-50 text-sky-700`,
  },
};

const ESTILO_ORIGEM_PADRAO = {
  label: 'Restrição',
  classe: `${BASE_BADGE} border-slate-200 bg-slate-100 text-slate-600`,
};

export function estiloStatusObra(status) {
  return ESTILOS_STATUS_OBRA[status] || {
    label: status || '—',
    classe: `${BASE_BADGE} border-slate-200 bg-slate-100 text-slate-600`,
    hex: '#64748b',
  };
}

export function estiloCategoria(categoria) {
  return ESTILOS_CATEGORIA[categoria] || {
    label: categoria || '—',
    classe: `${BASE_BADGE} border-slate-200 bg-slate-100 text-slate-600`,
    ponto: 'bg-slate-400',
    hex: '#64748b',
  };
}

export function estiloRestricao(status) {
  return ESTILOS_RESTRICAO[status] || ESTILO_RESTRICAO_PADRAO;
}

export function estiloOrigemRestricao(tipo) {
  return ESTILOS_ORIGEM_RESTRICAO[tipo] || ESTILO_ORIGEM_PADRAO;
}

/** Formata um desvio em pontos percentuais (com sinal positivo explícito). */
export function formatarPp(valor, casas = 2) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';

  const sinal = numero > 0 ? '+' : '';
  return `${sinal}${numero.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })} p.p.`;
}

/** Paleta de aderência: verde ≥ 90%, âmbar ≥ 70%, vermelho abaixo disso. */
export function corAderencia(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return {
      texto: 'text-slate-500',
      barra: 'bg-slate-400',
      fundo: 'bg-slate-100 text-slate-600 ring-slate-200',
      hex: '#94a3b8',
    };
  }
  if (numero >= 90) {
    return {
      texto: 'text-emerald-700',
      barra: 'bg-emerald-500',
      fundo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      hex: '#059669',
    };
  }
  if (numero >= 70) {
    return {
      texto: 'text-amber-700',
      barra: 'bg-amber-500',
      fundo: 'bg-amber-50 text-amber-700 ring-amber-200',
      hex: '#d97706',
    };
  }
  return {
    texto: 'text-red-700',
    barra: 'bg-red-500',
    fundo: 'bg-red-50 text-red-700 ring-red-200',
    hex: '#dc2626',
  };
}

/** Paleta do desvio: tolerância de 2 p.p. e linha crítica de 10 p.p. */
export function corDesvio(valor) {
  const numero = Number(valor);
  if (Number.isFinite(numero)) {
    if (numero >= -2) {
      return {
        texto: 'text-emerald-700',
        fundo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        hex: '#059669',
      };
    }
    if (numero >= -10) {
      return {
        texto: 'text-amber-700',
        fundo: 'bg-amber-50 text-amber-700 ring-amber-200',
        hex: '#d97706',
      };
    }
  }
  return {
    texto: 'text-red-700',
    fundo: 'bg-red-50 text-red-700 ring-red-200',
    hex: '#dc2626',
  };
}

/** Separa o primeiro fiscal dos demais (a tabela mostra o principal + contador). */
export function resumirFiscais(fiscais = []) {
  const lista = Array.isArray(fiscais) ? fiscais.filter(Boolean) : [];
  if (lista.length === 0) return { principal: '—', extras: 0 };
  return { principal: lista[0], extras: Math.max(0, lista.length - 1) };
}

/** Iniciais do nome, usadas em avatares compactos. */
export function iniciaisDe(nome) {
  return String(nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

/** Soma os totais de uma lista de opções do payload (`opcoes.status`). */
export function totalDeOpcoes(opcoes = []) {
  return opcoes.reduce((total, opcao) => total + (Number(opcao.total) || 0), 0);
}
