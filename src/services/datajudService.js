// src/services/datajudService.js
// Consulta a API pública do Datajud (CNJ) pelo número do processo.
//
// Detalhes técnicos verificados:
// - Endpoint por tribunal: POST {baseUrl}/api_publica_<sigla>/_search
// - Auth: header Authorization: APIKey <chave>
// - Body (Elasticsearch Query DSL): match por "numeroProcesso" (20 dígitos), size:1.
// - A API ordena por "@timestamp" (data de indexação), NÃO pela data do movimento;
//   por isso ordenamos os movimentos client-side pela dataHora.
// - Movimentos: hits.hits[0]._source.movimentos[].{ nome, dataHora } (ISO 8601).

import axios from 'axios';
import { config } from '../config/env.js';

// A API pública do CNJ é naturalmente lenta (servidor público, sobrecarga):
// medidas reais mostram ~8-10s por consulta, com picos. Por isso usamos um
// timeout folgado (45s) e retry automático para tolerar oscilações.
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TENTATIVAS = 3;

/**
 * Executa UM POST ao Datajud, com retry. Só retorna erro se esgotar as tentativas.
 * Erros transitórios (timeout, 5xx, rede) são retentados; 4xx não (são finais).
 */
async function postarComRetry(url, body) {
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `APIKey ${config.datajud.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      });
      return response;
    } catch (err) {
      ultimoErro = err;
      const status = err.response?.status;
      // 4xx (ex.: 401 chave inválida, 404) são erros finais — não adianta retentar.
      const erroFinal = status && status >= 400 && status < 500;
      if (erroFinal || tentativa === MAX_TENTATIVAS) throw err;
      // Backoff simples: 1s, 2s, ... entre tentativas.
      const espera = 1000 * tentativa;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimoErro;
}

/**
 * Busca os movimentos de um processo no Datajud.
 *
 * @param {string} numeroProcesso - Número com 20 dígitos (sem máscara).
 * @param {string} tribunal - Sigla do tribunal (ex.: "tjrj", "tjsp", "trf3").
 * @returns {Promise<{ movimentos: Array<{ nome: string, dataHora: string }>, dataHoraUltimaMovimentacao: string } | null>}
 *   `null` quando o processo não é encontrado (ou sem movimentos).
 */
export async function fetchMovements(numeroProcesso, tribunal) {
  const url = `${config.datajud.baseUrl}/api_publica_${tribunal}/_search`;

  const body = {
    query: {
      match: { numeroProcesso },
    },
    size: 1,
    // Ordena o documento retornado pelo registro de indexação mais recente.
    sort: [{ '@timestamp': { order: 'desc' } }],
  };

  const response = await postarComRetry(url, body);

  const hits = response.data?.hits?.hits || [];
  if (hits.length === 0) return null;

  const source = hits[0]._source || {};
  const movimentos = Array.isArray(source.movimentos) ? source.movimentos : [];
  if (movimentos.length === 0) return null;

  // Ordena pela data do movimento (mais recente primeiro). Converte p/ data estável.
  const ordenados = [...movimentos]
    .map((m) => ({ nome: m.nome, dataHora: m.dataHora }))
    .filter((m) => m.dataHora)
    .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

  if (ordenados.length === 0) return null;

  // Extrai metadados do processo
  const classe = source.classe || null;
  const assuntos = Array.isArray(source.assuntos) ? source.assuntos : [];
  const orgaoJulgador = source.orgaoJulgador || null;
  const dataAjuizamento = source.dataAjuizamento || null;
  const grau = source.grau || null;
  const assuntoPrincipal = assuntos.find((a) => a.principal) || assuntos[0] || null;

  return {
    movimentos: ordenados,
    dataHoraUltimaMovimentacao: ordenados[0].dataHora,
    classe,
    assuntoPrincipal,
    orgaoJulgador,
    dataAjuizamento,
    grau,
  };
}
