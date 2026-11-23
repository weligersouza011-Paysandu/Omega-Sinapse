'use strict';

/**
 * Diagnóstico do Brevo pela API (somente leitura): situação da conta, remetentes
 * verificados e eventos recentes de e-mail (entregue, bloqueado, adiado...).
 * Útil quando o painel web do Brevo não carrega. Não imprime a chave.
 *
 *   npm run email:diagnostico
 *   npm run email:diagnostico -- destinatario@exemplo.com
 */

require('dotenv').config();

const BASE = 'https://api.brevo.com/v3';
const chave = process.env.BREVO_API_KEY;

async function consultar(caminho) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: { 'api-key': chave, accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  let corpo = null;
  try {
    corpo = await resposta.json();
  } catch {
    // sem JSON
  }
  return { status: resposta.status, ok: resposta.ok, corpo };
}

async function main() {
  if (!chave) {
    console.error('BREVO_API_KEY não está no .env. Rode scripts/configurarChaveBrevo.ps1 primeiro.');
    process.exitCode = 1;
    return;
  }

  // Chaves restritas (só e-mails transacionais) não enxergam a conta: segue sem ela.
  const conta = await consultar('/account');
  if (conta.ok) {
    const planos = (conta.corpo.plan || []).map((p) => `${p.type}${p.credits !== undefined ? ` (créditos: ${p.credits})` : ''}`);
    console.log(`Conta: ${conta.corpo.companyName || conta.corpo.email} | planos: ${planos.join(', ') || '—'}`);
  } else if (conta.status === 401) {
    console.error('Chave de API inválida ou desativada (HTTP 401).');
    process.exitCode = 1;
    return;
  } else {
    console.log(`Conta: sem permissão para consultar (HTTP ${conta.status}); seguindo com o que a chave permite.`);
  }

  const remetentes = await consultar('/senders');
  console.log('\nRemetentes:');
  if (remetentes.ok) {
    for (const r of remetentes.corpo.senders || []) {
      console.log(`  - ${r.email} | ativo/verificado: ${r.active}`);
    }
    if (!(remetentes.corpo.senders || []).length) console.log('  (nenhum remetente cadastrado)');
  } else {
    console.log(`  HTTP ${remetentes.status} ${remetentes.corpo?.message || ''}`);
  }

  const destinatario = process.argv[2];
  const filtro = destinatario ? `&email=${encodeURIComponent(destinatario)}` : '';
  const eventos = await consultar(`/smtp/statistics/events?limit=15&days=2&sort=desc${filtro}`);
  console.log(`\nEventos recentes${destinatario ? ` para ${destinatario}` : ''}:`);
  if (!eventos.ok) {
    console.log(`  HTTP ${eventos.status} ${eventos.corpo?.message || ''}`);
    return;
  }
  const lista = eventos.corpo.events || [];
  if (lista.length === 0) console.log('  (nenhum evento nos últimos 2 dias)');
  for (const e of lista) {
    console.log(`  ${e.date} | ${e.event} | para ${e.email} | de ${e.from || '—'} | "${e.subject || ''}"${e.reason ? ` | motivo: ${e.reason}` : ''}`);
  }
}

main().catch((erro) => {
  console.error('Falha ao consultar o Brevo:', erro.message);
  process.exitCode = 1;
});
