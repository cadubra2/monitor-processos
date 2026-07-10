// src/services/sheetsService.js
// Lê a lista de processos da planilha e atualiza as datas em lote (batch update).
//
// Layout esperado (a linha 1 é cabeçalho e é ignorada):
//   A: Número do Processo | B: Nome do Cliente | C: Data Última Movimentação | D: Sigla do Tribunal

import { getSheetsClient } from '../config/sheetsAuth.js';
import { config } from '../config/env.js';

/**
 * Lê todas as linhas de dados da planilha e devolve um objeto por processo.
 * @returns {Promise<Array<{ rowIndex: number, numero: string, cliente: string, dataUltimaMovimentacao: string, tribunal: string }>>}
 */
export async function readProcesses() {
  const sheets = await getSheetsClient();

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: config.sheets.range,
  });

  const rows = data.values || [];
  // Pula o cabeçalho (linha 1). rowIndex = linha REAL na planilha (1-based),
  // para podermos endereçar a célula correta no update.
  const dataRows = rows.slice(1);

  return dataRows
    .map((row, i) => ({
      rowIndex: i + 2, // +2: +1 porque slice(1) já pulou a linha 1, +1 pois planilha é 1-based
      numero: (row[0] ?? '').toString().trim(),
      cliente: (row[1] ?? '').toString().trim(),
      dataUltimaMovimentacao: (row[2] ?? '').toString().trim(),
      tribunal: (row[3] ?? '').toString().trim().toLowerCase(),
    }))
    .filter((p) => p.numero !== ''); // ignora linhas totalmente em branco
}

/**
 * Atualiza a coluna C (Data Última Movimentação) em lote para várias linhas.
 *
 * @param {Array<{ rowIndex: number, novaData: string }>} updates
 */
export async function updateDates(updates) {
  if (!updates || updates.length === 0) return;

  const sheets = await getSheetsClient();

  // Extrai o nome da aba ("Página1") a partir do range configurado, ex.: "Página1!A:D" -> "Página1".
  const sheetName = config.sheets.range.split('!')[0] || 'Página1';

  // Cada update vira um ValueRange endereçando UMA célula (C da linha correspondente).
  const dataPayload = updates.map((u) => ({
    range: `${sheetName}!C${u.rowIndex}:C${u.rowIndex}`,
    values: [[u.novaData]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.sheets.spreadsheetId,
    requestBody: {
      // RAW preserva a string ISO exatamente como enviada (sem o Sheets tentar
      // convertê-la para número serial de data). Assim o que escrevemos é o que
      // lemos de volta na próxima rodada, mantendo a comparação de datas confiável.
      valueInputOption: 'RAW',
      data: dataPayload,
    },
  });
}
