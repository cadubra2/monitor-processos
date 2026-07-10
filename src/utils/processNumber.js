// src/utils/processNumber.js
// Normaliza o Número Único de processo (CNJ) para o formato que o Datajud espera.

/**
 * Converte um número de processo (com ou sem máscara) para a forma de 20 dígitos.
 * O campo `numeroProcesso` do Datajud armazena SÓ dígitos, ex.: "13668284120218130024".
 *
 * @param {string} raw - Número como vem da planilha (ex.: "0001234-56.2018.1.13.0024").
 * @returns {string|null} - 20 dígitos, ou `null` se inválido.
 */
export function normalizeProcessNumber(raw) {
  if (!raw) return null;
  // Remove tudo que não for dígito.
  const digits = String(raw).replace(/\D/g, '');
  // Número Único CNJ tem sempre 20 dígitos.
  if (digits.length !== 20) return null;
  return digits;
}

/**
 * Formata 20 dígitos no padrão de exibição NNNNNNN-DD.AAAA.J.TR.OOOO.
 * Usado apenas para logs/alertas legíveis — não vai para a API.
 *
 * @param {string} digits - 20 dígitos.
 * @returns {string}
 */
export function formatProcessNumber(digits) {
  if (!digits || digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}
