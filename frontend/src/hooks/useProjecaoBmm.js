import { useCallback, useEffect, useState } from 'react';
import api from '../services/api.js';

/* -------------------------------------------------------------------------- */
/* Projeção de BMM (receita prevista por obra e ciclo 16→15)                  */
/* -------------------------------------------------------------------------- */

/** Cadastram/editam (PLANEJADOR só nas suas obras; conferido no back-end). */
export const PERFIS_QUE_PROJETAM = ['ADMIN', 'SUPERVISOR', 'PLANEJADOR'];
export const PERFIS_QUE_EXCLUEM_PROJECAO = ['ADMIN'];

export async function listarProjecoesBmm(contratoId, filtros = {}) {
  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  const { data } = await api.get(`/contratos/${contratoId}/projecoes-bmm`, { params });
  return data;
}

export async function obterProjecaoBmm(id) {
  const { data } = await api.get(`/projecoes-bmm/${id}`);
  return data;
}

/** Semanas (segunda a domingo, recortadas ao ciclo) e dias úteis do mês de referência "AAAA-MM". */
export async function obterSemanasDoCiclo(contratoId, referencia) {
  const { data } = await api.get(`/contratos/${contratoId}/ciclos/${referencia}/semanas`);
  return data;
}

/** Prévia calculada pelo back-end (fonte única dos valores); não grava. */
export async function calcularProjecaoBmm(contratoId, payload) {
  const { data } = await api.post(`/contratos/${contratoId}/projecoes-bmm/calcular`, payload);
  return data;
}

export async function criarProjecaoBmm(contratoId, payload) {
  const { data } = await api.post(`/contratos/${contratoId}/projecoes-bmm`, payload);
  return data;
}

export async function atualizarProjecaoBmm(id, payload) {
  const { data } = await api.put(`/projecoes-bmm/${id}`, payload);
  return data;
}

export async function excluirProjecaoBmm(id) {
  const { data } = await api.delete(`/projecoes-bmm/${id}`);
  return data;
}

/** Rascunho calculado a partir de uma projeção anterior (não grava). */
export async function copiarProjecaoBmm(origemId, destino) {
  const { data } = await api.post(`/projecoes-bmm/${origemId}/copiar`, destino);
  return data;
}

/** Lista de projeções do contrato com recarga. */
export function useProjecoesBmm(contratoId, filtros) {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const chave = JSON.stringify(filtros || {});

  const recarregar = useCallback(async () => {
    if (!contratoId) {
      setLista([]);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      setLista(await listarProjecoesBmm(contratoId, JSON.parse(chave)));
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar as projeções.');
    } finally {
      setCarregando(false);
    }
  }, [contratoId, chave]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { lista, carregando, erro, recarregar };
}

/* ------------------------------ Datas do ciclo ------------------------------ */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const NOMES_MESES = MESES;

/** "2026-10" -> "Outubro de 2026". */
export function rotuloReferencia(referencia) {
  const [ano, mes] = String(referencia || '').split('-').map(Number);
  return ano && mes ? `${MESES[mes - 1]} de ${ano}` : '—';
}

/** "2026-09-18" -> "18/09". */
export function diaMes(iso) {
  const [, mes, dia] = String(iso || '').split('-');
  return dia && mes ? `${dia}/${mes}` : '—';
}

/** Referência do ciclo em andamento hoje (o ciclo termina no dia 15). */
export function referenciaAtual(hoje = new Date()) {
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth() + 1;
  if (hoje.getDate() >= 16) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}
