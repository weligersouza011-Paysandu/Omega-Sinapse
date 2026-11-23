'use strict';

// O repositório carrega o Prisma Client, que exige a variável (não conecta no require).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://t:t@localhost:5432/t';

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/tarefaService');

const { proximoVencimento, aplicarStatus, normalizarPayload, montarProximaOcorrencia } = service;

/** Instante no fuso operacional (-03:00). */
const em = (texto) => new Date(`${texto}-03:00`);

/* ------------------------------ Rotina com hora ------------------------------ */

test('rotina semanal vence no dia e na hora configurados', () => {
  // 2026-11-23 é segunda-feira.
  const venc = proximoVencimento('QUINTA', em('2026-11-23T09:00:00'), { hora: '14:30' });
  assert.equal(venc.toISOString(), em('2026-11-26T14:30:00').toISOString());
});

test('sem hora, a rotina continua vencendo no fim do dia', () => {
  const venc = proximoVencimento('QUINTA', em('2026-11-23T09:00:00'));
  assert.equal(venc.toISOString(), em('2026-11-26T23:59:59.999').toISOString());
});

test('no próprio dia, antes do horário, vence hoje', () => {
  const venc = proximoVencimento('SEGUNDA', em('2026-11-23T09:00:00'), { hora: '18:00' });
  assert.equal(venc.toISOString(), em('2026-11-23T18:00:00').toISOString());
});

test('no próprio dia, depois do horário, vai para a semana seguinte', () => {
  const venc = proximoVencimento('SEGUNDA', em('2026-11-23T19:00:00'), { hora: '18:00' });
  assert.equal(venc.toISOString(), em('2026-11-30T18:00:00').toISOString());
});

test('próxima ocorrência mantém dia e hora da rotina concluída', () => {
  const concluida = {
    titulo: 'Programação semanal',
    descricao: null,
    dia_recorrencia: 'SEXTA',
    hora_recorrencia: '16:00',
    data_vencimento: em('2026-11-27T16:00:00'),
    prioridade: 'MEDIA',
    usuario_id: 1,
    obra_id: null,
  };
  const proxima = montarProximaOcorrencia(concluida, em('2026-11-27T15:00:00'));
  assert.equal(proxima.hora_recorrencia, '16:00');
  assert.equal(proxima.tipo, 'FIXA_RECORRENTE');
  assert.equal(proxima.data_vencimento.toISOString(), em('2026-12-04T16:00:00').toISOString());
});

test('hora inválida é rejeitada; vazia vira null', () => {
  assert.throws(() => normalizarPayload({ hora_recorrencia: '25:00' }), /HH:mm/);
  assert.throws(() => normalizarPayload({ hora_recorrencia: '9:00' }), /HH:mm/);
  assert.equal(normalizarPayload({ hora_recorrencia: '' }).hora_recorrencia, null);
  assert.equal(normalizarPayload({ hora_recorrencia: '08:05' }).hora_recorrencia, '08:05');
});

/* ------------------------- Aderência e justificativa ------------------------- */

const tarefaAtiva = (extra = {}) => ({
  id: 10,
  status: 'EM_ANDAMENTO',
  data_vencimento: em('2026-11-23T18:00:00'),
  concluido_em: null,
  justificativa_atraso: null,
  justificativa_categoria: null,
  justificativa_tarefa_id: null,
  aderencia: null,
  ...extra,
});

test('concluir no prazo grava 100% e não guarda justificativa', () => {
  const dados = { status: 'CONCLUIDO', justificativa_atraso: 'não precisava' };
  aplicarStatus(dados, tarefaAtiva(), em('2026-11-23T17:59:00'));
  assert.equal(dados.aderencia, 100);
  assert.equal(dados.justificativa_atraso, null);
  assert.equal(dados.justificativa_categoria, null);
});

test('concluir com 1h de atraso grava 99% quando há justificativa e categoria', () => {
  const dados = {
    status: 'CONCLUIDO',
    justificativa_atraso: 'Chegou uma solicitação extra da diretoria.',
    justificativa_categoria: 'SOLICITACAO_EXTRA',
    justificativa_tarefa_id: 7,
  };
  aplicarStatus(dados, tarefaAtiva(), em('2026-11-23T19:00:00'));
  assert.equal(dados.aderencia, 99);
  assert.equal(dados.justificativa_tarefa_id, 7);
});

test('atraso sem justificativa é recusado, apontando o campo', () => {
  const dados = { status: 'CONCLUIDO' };
  assert.throws(
    () => aplicarStatus(dados, tarefaAtiva(), em('2026-11-23T18:30:00')),
    (erro) => erro.status === 400 && erro.details?.campo === 'justificativa_atraso'
  );
});

test('atraso com texto mas sem categoria é recusado', () => {
  const dados = { status: 'CONCLUIDO', justificativa_atraso: 'Motivo qualquer' };
  assert.throws(
    () => aplicarStatus(dados, tarefaAtiva(), em('2026-11-23T18:30:00')),
    (erro) => erro.status === 400 && erro.details?.campo === 'justificativa_categoria'
  );
});

test('vínculo com outra atividade é opcional', () => {
  const dados = {
    status: 'CONCLUIDO',
    justificativa_atraso: 'Dependência de campo.',
    justificativa_categoria: 'DEPENDENCIA_EXTERNA',
  };
  assert.doesNotThrow(() => aplicarStatus(dados, tarefaAtiva(), em('2026-11-23T18:30:00')));
  assert.equal(dados.aderencia, 99.5);
});

test('reabrir uma tarefa concluída limpa aderência e justificativa', () => {
  const concluida = tarefaAtiva({
    status: 'CONCLUIDO',
    concluido_em: em('2026-11-23T19:00:00'),
    justificativa_atraso: 'x',
    justificativa_categoria: 'OUTROS',
    aderencia: 99,
  });
  const dados = { status: 'EM_ANDAMENTO' };
  aplicarStatus(dados, concluida, em('2026-11-24T08:00:00'));
  assert.equal(dados.concluido_em, null);
  assert.equal(dados.aderencia, null);
  assert.equal(dados.justificativa_atraso, null);
  assert.equal(dados.justificativa_categoria, null);
  assert.equal(dados.justificativa_tarefa_id, null);
});

test('categoria desconhecida é rejeitada', () => {
  assert.throws(() => normalizarPayload({ justificativa_categoria: 'INVENTADA' }), /Categoria/);
  assert.equal(
    normalizarPayload({ justificativa_categoria: 'solicitacao_extra' }).justificativa_categoria,
    'SOLICITACAO_EXTRA'
  );
});

test('tarefa vencida expõe a aderência projetada', () => {
  const info = service.avaliarPrazo(tarefaAtiva(), em('2026-11-23T19:00:00'));
  assert.equal(info.situacao_prazo, 'VENCIDA');
  assert.equal(info.aderencia_projetada, 99);
});
