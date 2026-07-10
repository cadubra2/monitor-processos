// src/config/sheetsAuth.js
// Cria e reutiliza (singleton) um cliente autenticado da Google Sheets API,
// usando uma Service Account via JWT do google-auth-library.

import { google } from 'googleapis';
import { config } from './env.js';

let sheetsClient = null;

/**
 * Retorna um cliente `sheets.v4` autenticado.
 * Na primeira chamada instancia o JWT (com o escopo de spreadsheets) e o
 * autoriza; nas chamadas seguintes reutiliza a mesma instância.
 *
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>}
 */
export async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  // JWT com credenciais da service account. O escopo autoriza leitura/escrita.
  const auth = new google.auth.JWT({
    email: config.sheets.email,
    key: config.sheets.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  // authorize() troca o JWT por um access token (e cacheia internamente).
  await auth.authorize();

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}
