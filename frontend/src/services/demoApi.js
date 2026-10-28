import { rotuloRevisao } from '../utils/formatters.js';
import { STATUS_COMERCIAL, STATUS_OBRAS } from '../utils/status.js';

/** Autor exibido nos dados de exemplo (nenhum dado real é usado). */
const NOME_USUARIO_DEMO = 'Usuário Demonstração';

/**
 * API de demonstração (somente em memória).
 *
 * Reproduz o contrato dos endpoints reais de /api/orcamentos para que as telas
 * funcionem sem back-end. Nada é gravado em disco/rede e o estado é perdido ao
 * recarregar a página. Quando o PostgreSQL entrar, basta MODO_DEMO = false.
 */

const LATENCIA_MS = 380;

function espera(ms = LATENCIA_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dados de exemplo — nenhuma informação real de cliente/obra. */
const SEED = [
  {
    id: 6,
    pep: 'DEMO-CC-1006',
    ss: 'SS-2026-006',
    cliente: 'Obra de exemplo 6',
    descricao: 'Recuperação estrutural de pilar e reconstrução de base de equipamento.',
    endereco: 'Endereço de exemplo, s/n — Área industrial',
    fiscais: [{ nome: 'Fiscal de Exemplo', contato: '(00) 00000-0000' }],
    documentos_referencia: 'PR-1006 / Desenho 1006-A',
    status: 'VISITA_TECNICA',
    valor: 48250.9,
    art: null,
    orcamentista_nome: 'Usuário Demonstração',
    planejador_nome: null,
    foto_1: null,
    foto_2: null,
    foto_3: null,
    created_at: '2026-10-24T13:20:00.000Z',
    updated_at: '2026-10-24T13:20:00.000Z',
    revisoes: [
      {
        id: 1,
        numero_revisao: 0,
        valor: 48250.9,
        observacao: 'Revisão inicial (Rev 00)',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-10-24T13:20:00.000Z',
      },
    ],
  },
  {
    id: 5,
    pep: 'DEMO-CC-1005',
    ss: 'SS-2026-005',
    cliente: 'Obra de exemplo 5',
    descricao: 'Montagem de tubulação de aço carbono e pintura industrial.',
    endereco: 'Endereço de exemplo, 500 — Área industrial',
    fiscais: [{ nome: 'Fiscal de Exemplo', contato: '(00) 00000-0000' }],
    documentos_referencia: 'PR-1005',
    status: 'AGUARDANDO_APROVACAO',
    valor: 137400.0,
    art: 'ART-2026-0005',
    orcamentista_nome: 'Usuário Demonstração',
    planejador_nome: 'Planejador de Exemplo',
    foto_1: null,
    foto_2: null,
    foto_3: null,
    created_at: '2026-10-20T09:05:00.000Z',
    updated_at: '2026-10-22T16:40:00.000Z',
    revisoes: [
      {
        id: 2,
        numero_revisao: 1,
        valor: 137400.0,
        observacao: 'Acréscimo de 42 m de tubulação por interferência de campo.',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-10-22T16:40:00.000Z',
      },
      {
        id: 3,
        numero_revisao: 0,
        valor: 128900.0,
        observacao: 'Revisão inicial (Rev 00)',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-10-20T09:05:00.000Z',
      },
    ],
  },
  {
    id: 4,
    pep: 'DEMO-CC-1004',
    ss: 'SS-2026-004',
    cliente: 'Obra de exemplo 4',
    descricao: 'Impermeabilização de reservatório e tratamento de juntas.',
    endereco: 'Endereço de exemplo, 400',
    fiscais: [{ nome: 'Fiscal de Exemplo', contato: '(00) 00000-0000' }],
    documentos_referencia: null,
    status: 'APROVADO',
    valor: 76500.0,
    art: 'ART-2026-0004',
    orcamentista_nome: 'Usuário Demonstração',
    planejador_nome: 'Planejador de Exemplo',
    foto_1: null,
    foto_2: null,
    foto_3: null,
    created_at: '2026-10-14T11:30:00.000Z',
    updated_at: '2026-10-18T08:15:00.000Z',
    revisoes: [
      {
        id: 4,
        numero_revisao: 0,
        valor: 76500.0,
        observacao: 'Revisão inicial (Rev 00)',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-10-14T11:30:00.000Z',
      },
    ],
  },
  {
    id: 3,
    pep: 'DEMO-CC-1003',
    ss: 'SS-2026-003',
    cliente: 'Obra de exemplo 3',
    descricao: 'Reforma de sala elétrica com substituição de painéis e cabeamento.',
    endereco: 'Endereço de exemplo, 300',
    fiscais: [{ nome: 'Fiscal de Exemplo', contato: '(00) 00000-0000' }],
    documentos_referencia: 'PR-1003 / Diagrama unifilar',
    status: 'AGUARDANDO_APROVACAO',
    valor: 211300.45,
    art: null,
    orcamentista_nome: 'Usuário Demonstração',
    planejador_nome: null,
    foto_1: null,
    foto_2: null,
    foto_3: null,
    created_at: '2026-10-09T15:50:00.000Z',
    updated_at: '2026-10-09T15:50:00.000Z',
    revisoes: [
      {
        id: 5,
        numero_revisao: 0,
        valor: 211300.45,
        observacao: 'Revisão inicial (Rev 00)',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-10-09T15:50:00.000Z',
      },
    ],
  },
  {
    id: 2,
    pep: 'DEMO-CC-1002',
    ss: 'SS-2026-002',
    cliente: 'Obra de exemplo 2',
    descricao: 'Escavação, base de concreto e montagem de skid de processo.',
    endereco: 'Endereço de exemplo, 200',
    fiscais: [{ nome: 'Fiscal de Exemplo', contato: '(00) 00000-0000' }],
    documentos_referencia: null,
    status: 'DESATIVADO',
    valor: 58900.0,
    art: null,
    orcamentista_nome: 'Usuário Demonstração',
    planejador_nome: null,
    foto_1: null,
    foto_2: null,
    foto_3: null,
    created_at: '2026-10-02T10:10:00.000Z',
    updated_at: '2026-10-06T17:00:00.000Z',
    revisoes: [
      {
        id: 6,
        numero_revisao: 0,
        valor: 58900.0,
        observacao: 'Revisão inicial (Rev 00)',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-10-02T10:10:00.000Z',
      },
    ],
  },
  {
    id: 1,
    pep: 'DEMO-CC-1001',
    ss: 'SS-2026-001',
    cliente: 'Obra de exemplo 1',
    descricao: 'Manutenção preventiva em ponte rolante: troca de cabos e revisão de redutores.',
    endereco: 'Endereço de exemplo, 100',
    fiscais: [{ nome: 'Fiscal de Exemplo', contato: '(00) 00000-0000' }],
    documentos_referencia: 'PR-1001',
    status: 'DESATIVADO',
    valor: 32480.0,
    art: null,
    orcamentista_nome: 'Usuário Demonstração',
    planejador_nome: null,
    foto_1: null,
    foto_2: null,
    foto_3: null,
    created_at: '2026-09-28T08:00:00.000Z',
    updated_at: '2026-09-30T14:25:00.000Z',
    revisoes: [
      {
        id: 7,
        numero_revisao: 0,
        valor: 32480.0,
        observacao: 'Revisão inicial (Rev 00)',
        usuario_nome: 'Usuário Demonstração',
        created_at: '2026-09-28T08:00:00.000Z',
      },
    ],
  },
];

let orcamentos = SEED.map((item) => ({
  ...item,
  revisoes: item.revisoes.map((revisao) => ({ ...revisao })),
}));

let proximoId = SEED.length + 1;
let proximoIdRevisao = 100;

function clonar(orcamento) {
  return {
    ...orcamento,
    revisoes: orcamento.revisoes.map((revisao) => ({
      ...revisao,
      rotulo: rotuloRevisao(revisao.numero_revisao),
    })),
  };
}

function textoOuNulo(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** Lê a lista de fiscais enviada como JSON no FormData (mesmo contrato do back-end). */
function parseFiscais(valor) {
  const bruto = textoOuNulo(valor);
  if (!bruto) return [];

  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];

    return lista
      .filter((item) => item && textoOuNulo(item.nome))
      .map((item) => ({ nome: String(item.nome).trim(), contato: textoOuNulo(item.contato) }));
  } catch {
    return [];
  }
}

/** Status permitidos por escopo (espelha o service do back-end). */
const ESCOPOS_DEMO = { comercial: STATUS_COMERCIAL, obras: STATUS_OBRAS };

/** Emula GET /api/orcamentos (o escopo recorta o ciclo exibido). */
async function listarOrcamentos({ busca, status, escopo, page = 1, limit = 12 } = {}) {
  await espera();

  const termo = textoOuNulo(busca)?.toLowerCase();
  // `todos` não recorta nada; qualquer outro escopo cai no ciclo comercial
  // (padrão do back-end). Um status explícito tem precedência sobre o escopo.
  const permitidos = status || escopo === 'todos' ? null : ESCOPOS_DEMO[escopo] || STATUS_COMERCIAL;

  const filtrados = orcamentos
    .filter((item) => (status ? item.status === status : true))
    .filter((item) => (permitidos ? permitidos.includes(item.status) : true))
    .filter((item) => {
      if (!termo) return true;
      return [item.pep, item.ss, item.descricao, item.cliente]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo));
    })
    .sort((a, b) => b.id - a.id);

  const total = filtrados.length;
  const inicio = (page - 1) * limit;

  return {
    data: filtrados.slice(inicio, inicio + limit).map(clonar),
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/** Emula GET /api/orcamentos/:id */
async function obterOrcamento(id) {
  await espera(220);

  const orcamento = orcamentos.find((item) => item.id === Number(id));
  if (!orcamento) {
    throw new Error('Orçamento não encontrado.');
  }

  return clonar(orcamento);
}

/** Emula POST /api/orcamentos (recebe FormData, igual ao back-end). */
async function criarOrcamento(formData) {
  await espera(700);

  const arquivo = (campo) => {
    const valor = formData.get(campo);
    return valor instanceof File && valor.size > 0 ? URL.createObjectURL(valor) : null;
  };

  const agora = new Date().toISOString();
  const valor = Number(formData.get('valor')) || 0;
  const id = proximoId++;

  const novo = {
    id,
    pep: textoOuNulo(formData.get('pep')),
    ss: textoOuNulo(formData.get('ss')),
    cliente: textoOuNulo(formData.get('cliente')),
    descricao: textoOuNulo(formData.get('descricao')),
    endereco: textoOuNulo(formData.get('endereco')),
    fiscais: parseFiscais(formData.get('fiscais')),
    documentos_referencia: textoOuNulo(formData.get('documentos_referencia')),
    status: textoOuNulo(formData.get('status')) || 'VISITA_TECNICA',
    valor,
    art: null,
    orcamentista_nome: NOME_USUARIO_DEMO,
    planejador_nome: null,
    foto_1: arquivo('foto_1'),
    foto_2: arquivo('foto_2'),
    foto_3: arquivo('foto_3'),
    created_at: agora,
    updated_at: agora,
    revisoes: [
      {
        id: proximoIdRevisao++,
        numero_revisao: 0,
        valor,
        observacao: textoOuNulo(formData.get('observacao_inicial')) || 'Revisão inicial (Rev 00)',
        usuario_nome: NOME_USUARIO_DEMO,
        created_at: agora,
      },
    ],
  };

  orcamentos = [novo, ...orcamentos];
  return clonar(novo);
}

/** Emula POST /api/orcamentos/:id/revisoes */
async function adicionarRevisao(id, { valor, observacao }) {
  await espera(600);

  const orcamento = orcamentos.find((item) => item.id === Number(id));
  if (!orcamento) {
    throw new Error('Orçamento não encontrado.');
  }
  if (!textoOuNulo(observacao)) {
    throw new Error('A observação é obrigatória para registrar uma revisão.');
  }

  const numero = orcamento.revisoes.reduce((maior, revisao) => Math.max(maior, revisao.numero_revisao), 0) + 1;
  const agora = new Date().toISOString();

  orcamento.revisoes.unshift({
    id: proximoIdRevisao++,
    numero_revisao: numero,
    valor: Number(valor) || 0,
    observacao: textoOuNulo(observacao),
    usuario_nome: NOME_USUARIO_DEMO,
    created_at: agora,
  });
  orcamento.valor = Number(valor) || 0;
  orcamento.updated_at = agora;

  return clonar(orcamento);
}

/** Emula PUT /api/orcamentos/:id */
async function atualizarOrcamento(id, dados = {}) {
  await espera(500);

  const orcamento = orcamentos.find((item) => item.id === Number(id));
  if (!orcamento) {
    throw new Error('Orçamento não encontrado.');
  }

  Object.assign(orcamento, dados, { updated_at: new Date().toISOString() });
  return clonar(orcamento);
}

const demoApi = {
  listarOrcamentos,
  obterOrcamento,
  criarOrcamento,
  adicionarRevisao,
  atualizarOrcamento,
};

export default demoApi;
