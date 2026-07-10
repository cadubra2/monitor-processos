// src/config/env.js
// Centraliza leitura, normalização e validação das variáveis de ambiente.
// Importar este módulo é o suficiente para garantir que as config obrigatórias existem.

import dotenv from 'dotenv';

// Carrega o .env (silencioso se não existir — útil quando as vars vêm do ambiente,
// ex.: `node --env-file=.env`). O `path` default é o diretório de onde o processo roda.
dotenv.config();

/** Converte strings "true"/"false"/"1"/"0" em booleano (default = fallback). */
function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

/** Garante um inteiro válido, ou o fallback. */
function parseIntSafe(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Valida que todas as chaves obrigatórias estão presentes.
 * Lança erro único e descritivo já listando tudo que falta (fail-fast no boot).
 */
function assertRequired(required) {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes no .env: ${missing.join(', ')}. ` +
        `Veja o .env.example.`,
    );
  }
}

// Validamos antes de montar o objeto para que o boot falhe cedo e com clareza.
assertRequired([
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
  'DATAJUD_API_KEY',
  'GEMINI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
]);

/**
 * Objeto de configuração da aplicação, agrupado por domínio.
 * @type {{
 *   sheets: { email: string, privateKey: string, spreadsheetId: string, range: string },
 *   datajud: { apiKey: string, baseUrl: string },
 *   ai: { apiKey: string, model: string },
 *   runtime: { concurrency: number, cronExpression: string, runOnStart: boolean, alertWebhookUrl: string|null },
 * }}
 */
export const config = {
  sheets: {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // As quebras de linha da chave costumam vir escapadas ("\n") quando coladas;
    // garantimos que viram quebras reais para o JWT aceitar.
    privateKey: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: process.env.GOOGLE_SHEETS_RANGE || 'Página1!A:D',
  },
  datajud: {
    apiKey: process.env.DATAJUD_API_KEY,
    baseUrl:
      process.env.DATAJUD_BASE_URL || 'https://api-publica.datajud.cnj.jus.br',
  },
  ai: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  runtime: {
    concurrency: parseIntSafe(process.env.CONCURRENCY, 2),
    cronExpression: process.env.CRON_EXPRESSION || '*/30 * * * *',
    runOnStart: parseBool(process.env.RUN_ON_START, true),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || null,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
};
