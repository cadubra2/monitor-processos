// src/index.js
// Orquestrador do fluxo ETL + agendamento via cron.
//
// Fluxo de cada execução (runOnce):
//   1. Lê os processos da planilha (4 colunas).
//   2. Processa em paralelo com concorrência limitada (mapWithConcurrency).
//      Para cada processo:
//        a) normaliza o número;
//        b) busca movimentos no Datajud;
//        c) compara a data mais recente do tribunal com a data da coluna C;
//        d) se for NOVA (ou coluna C vazia): resume com Gemini + dispara alerta;
//        e) acumula a nova data para atualizar a planilha no fim.
//   3. Atualiza a coluna C de todos os processos alterados, em um único batch.
//   4. Loga um resumo final.
//
// O cron dispara runOnce periodicamente. Se RUN_ON_START=true, roda uma vez ao subir.

import cron from 'node-cron';
import { config } from './config/env.js';
import { mapWithConcurrency } from './utils/concurrency.js';
import { normalizeProcessNumber, formatProcessNumber } from './utils/processNumber.js';
import { readProcesses, updateDates } from './services/sheetsService.js';
import { fetchMovements } from './services/datajudService.js';
import { summarizeMovement } from './services/aiService.js';
import { sendAlert } from './services/alertService.js';

// Guarda contra execuções sobrepostas do cron (se uma rodada ainda estiver rodando).
let rodando = false;

/**
 * Decide se a data vinda do Datajud é "mais nova" que a data registrada na planilha.
 * Regra: processa quando a coluna C está VAZIA, ou quando a data do tribunal é
 * estritamente MAIOR (mais recente) que a registrada.
 *
 * @param {string} dataPlanilha - Data da coluna C (ISO ou vazia).
 * @param {string} dataTribunal - dataHora da última movimentação no Datajud (ISO).
 * @returns {boolean}
 */
function isMovimentoNovo(dataPlanilha, dataTribunal) {
  if (!dataPlanilha) return true; // primeira execução para esse processo
  const t = new Date(dataTribunal).getTime();
  const p = new Date(dataPlanilha).getTime();
  if (!Number.isFinite(p)) return true; // data inválida na planilha -> considera novo
  return t > p;
}

/**
 * Processa um único processo (uma unidade do paralelismo).
 * Tudo encapsulado em try/catch: um processo com erro não derruba os demais.
 *
 * @returns {Promise<{ rowIndex: number, novaData: string } | null>}
 *   Retorna update de data quando houve novidade; caso contrário `null`.
 */
async function processOne(processo) {
  const { rowIndex, numero, cliente, dataUltimaMovimentacao, tribunal } = processo;

  // 1. Normaliza e valida o número.
  const numeroNormalizado = normalizeProcessNumber(numero);
  if (!numeroNormalizado) {
    console.warn(`[pulando] Número inválido na linha ${rowIndex}: "${numero}"`);
    return null;
  }
  if (!tribunal) {
    console.warn(
      `[pulando] Tribunal ausente na linha ${rowIndex} (processo ${numero}).`,
    );
    return null;
  }

  // 2. Busca movimentos no Datajud.
  const resultado = await fetchMovements(numeroNormalizado, tribunal);
  if (!resultado) {
    console.log(
      `[sem dados] Processo ${formatProcessNumber(numeroNormalizado)} não encontrado no ${tribunal}.`,
    );
    return null;
  }

  const {
    movimentos,
    dataHoraUltimaMovimentacao,
    classe,
    assuntoPrincipal,
    orgaoJulgador,
    dataAjuizamento,
    grau,
  } = resultado;

  // 3. Compara datas — só prossegue se houver novidade.
  if (!isMovimentoNovo(dataUltimaMovimentacao, dataHoraUltimaMovimentacao)) {
    return null; // sem novidade, nada a fazer
  }

  // Conta quantas movimentações são realmente "novas" (posteriores à data da planilha).
  const novas = dataUltimaMovimentacao
    ? movimentos.filter(
        (m) => new Date(m.dataHora).getTime() > new Date(dataUltimaMovimentacao).getTime(),
      ).length
    : movimentos.length;

  // 4. Resume o andamento MAIS RECENTE (movimentos já vem ordenado desc).
  const movimentoRecente = movimentos[0];
  const resumo = await summarizeMovement(movimentoRecente.nome);

  // 5. Dispara o alerta (console + webhook opcional).
  await sendAlert({
    cliente,
    numero: formatProcessNumber(numeroNormalizado),
    tribunal,
    data: dataHoraUltimaMovimentacao,
    resumo,
    novas,
    classe,
    assuntoPrincipal,
    orgaoJulgador,
    dataAjuizamento,
    grau,
  });

  // 6. Retorna a nova data para o batch update da planilha.
  return { rowIndex, novaData: dataHoraUltimaMovimentacao };
}

/** Executa uma rodada completa do monitoramento. */
async function runOnce() {
  if (rodando) {
    console.log('[cron] Rodada anterior ainda em execução — pulando esta.');
    return;
  }
  rodando = true;
  const inicio = Date.now();

  try {
    console.log(`\n===== Iniciando monitoramento — ${new Date().toISOString()} =====`);

    // 1. Lê processos.
    const processos = await readProcesses();
    console.log(`${processos.length} processo(s) encontrado(s) na planilha.`);

    // 2. Processa em paralelo com concorrência controlada.
    const resultados = await mapWithConcurrency(
      processos,
      config.runtime.concurrency,
      async (p) => {
        try {
          return await processOne(p);
        } catch (err) {
          // Isola falhas: loga e segue para os próximos.
          console.error(`[erro] Processo linha ${p.rowIndex} (${p.numero}): ${err.message}`);
          return null;
        }
      },
    );

    // 3. Filtra apenas quem teve novidade e atualiza a planilha em lote.
    const updates = resultados.filter(Boolean);
    if (updates.length > 0) {
      await updateDates(updates);
    }

    // 4. Resumo final.
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(
      `\n===== Concluído em ${duracao}s — ` +
        `${processos.length} lido(s), ${updates.length} com novidade(s). =====\n`,
    );
  } catch (err) {
    // Erro estrutural (auth, rede, planilha) — loga mas não derruba o processo.
    console.error('[runOnce] Erro na rodada:', err.message);
  } finally {
    rodando = false;
  }
}

// -------- Bootstrap --------

// Encerramento limpo.
function shutdown(signal) {
  console.log(`\nRecebido ${signal}. Encerrando...`);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Rejeições não tratadas (bug) — apenas loga para não matar o processo silenciosamente.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// Agendamento periódico.
cron.schedule(config.runtime.cronExpression, () => {
  runOnce().catch((err) => console.error('[cron] runOnce falhou:', err.message));
});
console.log(`Cron agendado: "${config.runtime.cronExpression}"`);

// Execução opcional imediata ao iniciar.
if (config.runtime.runOnStart) {
  console.log('RUN_ON_START=true — executando uma rodada agora...');
  runOnce().catch((err) => console.error('[start] runOnce falhou:', err.message));
}
