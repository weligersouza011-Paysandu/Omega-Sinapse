'use strict';

const { formatarDataHoraLocal } = require('../utils/fusoOperacional');
const { rotuloTipo, escaparHtml } = require('./pendenciasDiariasService');

/**
 * E-mail enviado ao responsável quando uma atividade nova é criada para ele.
 * A montagem é pura (testável); o envio nunca lança, para não afetar a criação.
 */

const ROTULO_PRIORIDADE = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica' };

function montarEmailNovaAtividade({ tarefa, responsavel, criador }) {
  const primeiroNome = String(responsavel.nome || '').split(' ')[0] || 'colaborador(a)';
  const vencimento = formatarDataHoraLocal(tarefa.data_vencimento);
  const tipo = rotuloTipo(tarefa);
  const prioridade = ROTULO_PRIORIDADE[tarefa.prioridade] || tarefa.prioridade;
  const criadoPor = criador?.nome && criador.id !== responsavel.id ? criador.nome : null;

  const assunto = `Omega Sinapse · Nova atividade: ${tarefa.titulo}`;

  const linhas = [
    ['Atividade', tarefa.titulo],
    ['Tipo', tipo],
    ['Vencimento', vencimento],
    ['Prioridade', prioridade],
    ...(criadoPor ? [['Criada por', criadoPor]] : []),
  ];

  const texto = [
    `Olá, ${primeiroNome}! Uma nova atividade foi criada para você no Omega Sinapse.`,
    '',
    ...linhas.map(([rotulo, valor]) => `${rotulo}: ${valor}`),
    ...(tarefa.descricao ? ['', 'Detalhes:', tarefa.descricao] : []),
    '',
    'Acesse a Gestão de Demandas para acompanhar e atualizar o andamento.',
  ].join('\n');

  const tabela = linhas
    .map(
      ([rotulo, valor]) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;white-space:nowrap;">${escaparHtml(rotulo)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600;">${escaparHtml(valor)}</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;">Omega Sinapse · Gestão de Demandas</p>
      <h2 style="margin:0 0 6px;font-size:20px;color:#0f172a;">Nova atividade para você</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;">Olá, ${escaparHtml(primeiroNome)}! Uma nova atividade foi criada para você.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">${tabela}</table>
      ${
        tarefa.descricao
          ? `<h3 style="margin:20px 0 6px;font-size:14px;color:#0f172a;">Detalhes</h3>
      <p style="margin:0;font-size:13px;color:#334155;white-space:pre-line;">${escaparHtml(tarefa.descricao)}</p>`
          : ''
      }
      <p style="margin:24px 0 0;font-size:12px;color:#64748b;">Entregas após o prazo reduzem a aderência em 0,5% a cada 30 minutos e exigem justificativa.</p>
    </div>
  </body>
</html>`;

  return { assunto, texto, html };
}

/**
 * Avisa o responsável de que há uma atividade nova. Nunca lança: sem SMTP,
 * sem e-mail cadastrado ou com falha de envio, apenas registra no log.
 *
 * @returns {Promise<{enviado:boolean, motivo?:string}>}
 */
async function notificarNovaAtividade({
  tarefa,
  criador,
  repositorio = require('../repositories/tarefaRepository'),
  email = require('./emailService'),
}) {
  try {
    const responsavel = await repositorio.buscarUsuario(tarefa.usuario_id);
    if (!responsavel || !responsavel.email) {
      return { enviado: false, motivo: 'SEM_EMAIL' };
    }
    const conteudo = montarEmailNovaAtividade({ tarefa, responsavel, criador });
    return await email.enviar({ para: responsavel.email, ...conteudo });
  } catch (erro) {
    console.error('[notificacao] Falha ao avisar sobre a nova atividade:', erro.message);
    return { enviado: false, motivo: 'FALHA_NOTIFICACAO' };
  }
}

module.exports = { montarEmailNovaAtividade, notificarNovaAtividade };
