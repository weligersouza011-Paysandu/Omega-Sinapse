'use strict';

const { horarioDoDiaLocal, DIA_MS, FUSO_NOME } = require('../utils/fusoOperacional');

/**
 * Agendador do e-mail diário de pendências. Sem dependência de cron: calcula o
 * próximo "HH:mm" no fuso America/Sao_Paulo (= America/Belem, UTC-3 fixo) e
 * dorme até lá. Rodar mais de uma instância da API duplicaria o envio; hoje o
 * deploy é de instância única (render.yaml).
 */

const HORA_PADRAO = '07:30';
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Próximo instante de `hora` ("HH:mm", fuso operacional) estritamente depois de `agora`. */
function proximaExecucao(agora, hora = HORA_PADRAO) {
  if (!REGEX_HORA.test(hora)) {
    throw new Error(`Horário de disparo inválido: "${hora}" (use HH:mm).`);
  }
  const hoje = horarioDoDiaLocal(agora, hora);
  return hoje.getTime() > agora.getTime() ? hoje : new Date(hoje.getTime() + DIA_MS);
}

/**
 * Inicia o disparo diário. Não faz nada com EMAIL_DIARIO_ATIVO=false.
 * Sem SMTP configurado o job apenas registra no log (não consulta o banco).
 * Erros do job são capturados: o servidor nunca cai por causa do e-mail.
 *
 * @returns {{parar: () => void, proxima: () => Date|null}}
 */
function iniciar({
  hora = process.env.EMAIL_DIARIO_HORA || HORA_PADRAO,
  relogio = () => new Date(),
  executar = () => require('./pendenciasDiariasService').enviarPendenciasDiarias(),
  smtpConfigurado = () => require('./emailService').configurado(),
} = {}) {
  if (process.env.EMAIL_DIARIO_ATIVO === 'false') {
    console.log('[agendador] E-mail diário de pendências desativado (EMAIL_DIARIO_ATIVO=false).');
    return { parar() {}, proxima: () => null };
  }

  let timer = null;
  let proxima = null;
  let parado = false;

  const agendar = () => {
    if (parado) return;
    proxima = proximaExecucao(relogio(), hora);
    const espera = Math.max(1000, proxima.getTime() - relogio().getTime());
    timer = setTimeout(disparar, espera);
    // Não segura o processo aberto no encerramento gracioso.
    timer.unref?.();
  };

  const disparar = async () => {
    try {
      if (!smtpConfigurado()) {
        console.warn('[agendador] SMTP não configurado: e-mail diário de pendências não enviado.');
      } else {
        const resumo = await executar();
        console.log(
          `[agendador] E-mail diário: ${resumo.enviados}/${resumo.planejadores} planejador(es) notificado(s).`
        );
      }
    } catch (erro) {
      console.error('[agendador] Falha no e-mail diário de pendências:', erro.message);
    } finally {
      agendar();
    }
  };

  agendar();
  console.log(
    `[agendador] E-mail diário de pendências agendado para ${hora} (${FUSO_NOME}); próxima execução: ${proxima.toISOString()}.`
  );

  return {
    parar() {
      parado = true;
      if (timer) clearTimeout(timer);
    },
    proxima: () => proxima,
  };
}

module.exports = { iniciar, proximaExecucao, HORA_PADRAO };
