'use strict';

const {
  fimDoDiaLocal,
  formatarDataHoraLocal,
  formatarDataLocal,
} = require('../utils/fusoOperacional');

/**
 * E-mail diário de pendências dos planejadores. A montagem das listas e do
 * conteúdo é pura (testável); o acesso a dados e o envio são injetáveis.
 */

const STATUS_ATIVOS = ['A_FAZER', 'EM_ANDAMENTO'];
/** Quem recebe o e-mail: mesma equipe do painel de carga. */
const PERFIS_DESTINATARIOS = ['PLANEJADOR', 'SUPERVISOR'];

const ROTULO_STATUS = { A_FAZER: 'A fazer', EM_ANDAMENTO: 'Em andamento' };
const DIAS = {
  SEGUNDA: 'segunda',
  TERCA: 'terça',
  QUARTA: 'quarta',
  QUINTA: 'quinta',
  SEXTA: 'sexta',
  SABADO: 'sábado',
  DOMINGO: 'domingo',
};

function rotuloTipo(tarefa) {
  if (tarefa.tipo !== 'FIXA_RECORRENTE') return 'Avulsa';
  const dia = DIAS[tarefa.dia_recorrencia];
  if (!dia) return 'Rotina semanal';
  const hora = tarefa.hora_recorrencia ? ` às ${tarefa.hora_recorrencia}` : '';
  return `Rotina semanal (${dia}${hora})`;
}

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Separa as pendências de cada responsável em "vencidas" (prazo já passou) e
 * "para hoje" (vencem até o fim do dia local). Ignora o que não é pendente.
 * @returns {Array<{usuario:object, vencidas:object[], hoje:object[]}>} ordenado por nome
 */
function montarPendenciasPorPlanejador(tarefas, agora) {
  const fimDoDia = fimDoDiaLocal(agora).getTime();
  const grupos = new Map();

  for (const tarefa of tarefas) {
    if (!STATUS_ATIVOS.includes(tarefa.status) || !tarefa.usuario) continue;
    const vencimento = new Date(tarefa.data_vencimento).getTime();
    if (vencimento > fimDoDia) continue;

    if (!grupos.has(tarefa.usuario.id)) {
      grupos.set(tarefa.usuario.id, { usuario: tarefa.usuario, vencidas: [], hoje: [] });
    }
    const grupo = grupos.get(tarefa.usuario.id);
    (vencimento < agora.getTime() ? grupo.vencidas : grupo.hoje).push(tarefa);
  }

  const porVencimento = (a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento) || a.id - b.id;
  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      vencidas: grupo.vencidas.sort(porVencimento),
      hoje: grupo.hoje.sort(porVencimento),
    }))
    .sort((a, b) => a.usuario.nome.localeCompare(b.usuario.nome, 'pt-BR'));
}

function linhaTexto(tarefa) {
  return `- ${tarefa.titulo} | ${rotuloTipo(tarefa)} | ${formatarDataHoraLocal(tarefa.data_vencimento)} | ${
    ROTULO_STATUS[tarefa.status] || tarefa.status
  }`;
}

function tabelaHtml(titulo, cor, tarefas) {
  if (tarefas.length === 0) return '';
  const linhas = tarefas
    .map(
      (tarefa) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escaparHtml(tarefa.titulo)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escaparHtml(rotuloTipo(tarefa))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escaparHtml(
          formatarDataHoraLocal(tarefa.data_vencimento)
        )}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escaparHtml(
          ROTULO_STATUS[tarefa.status] || tarefa.status
        )}</td>
      </tr>`
    )
    .join('');
  return `
    <h3 style="margin:22px 0 8px;font-size:15px;color:${cor};">${escaparHtml(titulo)} (${tarefas.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;color:#1e293b;">
      <thead>
        <tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px 10px;">Atividade</th>
          <th style="padding:8px 10px;">Tipo</th>
          <th style="padding:8px 10px;">Vencimento</th>
          <th style="padding:8px 10px;">Status</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

/** Conteúdo do e-mail (assunto, texto puro e HTML) de um planejador. */
function renderizarEmail(grupo, agora) {
  const { usuario, vencidas, hoje } = grupo;
  const data = formatarDataLocal(agora);
  const primeiroNome = String(usuario.nome || '').split(' ')[0] || 'colaborador(a)';

  const assunto = `Omega Sinapse · Pendências de ${data}: ${vencidas.length} vencida(s), ${hoje.length} para hoje`;

  const partesTexto = [`Bom dia, ${primeiroNome}! Suas pendências de ${data}:`];
  if (vencidas.length > 0) partesTexto.push('', `VENCIDAS (${vencidas.length})`, ...vencidas.map(linhaTexto));
  if (hoje.length > 0) partesTexto.push('', `PARA HOJE (${hoje.length})`, ...hoje.map(linhaTexto));
  partesTexto.push('', 'Acesse a Gestão de Demandas do Omega Sinapse para atualizar o andamento.');

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;">Omega Sinapse · Gestão de Demandas</p>
      <h2 style="margin:0 0 6px;font-size:20px;color:#0f172a;">Bom dia, ${escaparHtml(primeiroNome)}!</h2>
      <p style="margin:0;font-size:14px;color:#475569;">Suas pendências de ${escaparHtml(data)}.</p>
      ${tabelaHtml('Vencidas', '#b91c1c', vencidas)}
      ${tabelaHtml('Para hoje', '#b45309', hoje)}
      <p style="margin:24px 0 0;font-size:12px;color:#64748b;">Entregas após o prazo reduzem a aderência em 0,5% a cada 30 minutos e exigem justificativa.</p>
    </div>
  </body>
</html>`;

  return { assunto, texto: partesTexto.join('\n'), html };
}

/**
 * Monta e envia o e-mail de cada planejador com pendências.
 *
 * @param {object} [opcoes]
 * @param {Date}    [opcoes.agora]
 * @param {number}  [opcoes.apenasUsuarioId] restringe a um destinatário (teste manual)
 * @param {boolean} [opcoes.enviarVazio]     envia mesmo sem pendências (valida o SMTP)
 * @param {boolean} [opcoes.simular]         monta tudo, mas não envia
 * @param {object}  [opcoes.repositorio]     injeção para testes
 * @param {object}  [opcoes.email]           injeção para testes
 */
async function enviarPendenciasDiarias({
  agora = new Date(),
  apenasUsuarioId,
  enviarVazio = false,
  simular = false,
  repositorio = require('../repositories/tarefaRepository'),
  email = require('./emailService'),
} = {}) {
  const tarefas = await repositorio.listarPendentesParaEmail({
    ate: fimDoDiaLocal(agora),
    statusAtivos: STATUS_ATIVOS,
    perfis: PERFIS_DESTINATARIOS,
    usuarioId: apenasUsuarioId,
  });

  const grupos = montarPendenciasPorPlanejador(tarefas, agora);

  // Teste manual de um destinatário sem pendências: ainda assim envia um e-mail vazio.
  if (enviarVazio && apenasUsuarioId && grupos.length === 0 && typeof repositorio.buscarUsuario === 'function') {
    const usuario = await repositorio.buscarUsuario(apenasUsuarioId);
    if (usuario) grupos.push({ usuario, vencidas: [], hoje: [] });
  }

  const resultados = [];
  for (const grupo of grupos) {
    const { usuario } = grupo;
    const base = {
      usuario_id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      vencidas: grupo.vencidas.length,
      hoje: grupo.hoje.length,
    };

    if (!usuario.email) {
      resultados.push({ ...base, enviado: false, motivo: 'SEM_EMAIL' });
      continue;
    }
    if (simular) {
      resultados.push({ ...base, enviado: false, motivo: 'SIMULADO' });
      continue;
    }
    const conteudo = renderizarEmail(grupo, agora);
    const envio = await email.enviar({
      para: usuario.email,
      assunto: conteudo.assunto,
      texto: conteudo.texto,
      html: conteudo.html,
    });
    resultados.push({ ...base, enviado: envio.enviado, ...(envio.motivo ? { motivo: envio.motivo } : {}) });
  }

  return {
    gerado_em: agora.toISOString(),
    simulado: simular,
    smtp_configurado: typeof email.configurado === 'function' ? email.configurado() : null,
    planejadores: resultados.length,
    enviados: resultados.filter((item) => item.enviado).length,
    resultados,
  };
}

module.exports = {
  montarPendenciasPorPlanejador,
  renderizarEmail,
  enviarPendenciasDiarias,
  rotuloTipo,
  escaparHtml,
  STATUS_ATIVOS,
  PERFIS_DESTINATARIOS,
};
