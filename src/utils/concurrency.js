// src/utils/concurrency.js
// Limita paralelismo sem dependências externas (alternativa ao p-limit).
// Mantém a ordem dos resultados equivalente à ordem de entrada.

/**
 * Executa `asyncFn` sobre cada item com no máximo `limit` execuções simultâneas.
 *
 * @template T, R
 * @param {T[]} items - Itens a processar.
 * @param {number} limit - Máximo de execuções concorrentes.
 * @param {(item: T, index: number) => Promise<R>} asyncFn - Função por item.
 * @returns {Promise<R[]>} - Resultados na MESMA ordem dos itens de entrada.
 */
export async function mapWithConcurrency(items, limit, asyncFn) {
  const results = new Array(items.length);
  // Índice do próximo item a iniciar; compartilhado entre "workers".
  let cursor = 0;

  // Cada worker puxa trabalho do cursor até esgotar os itens.
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      // Guarda no mesmo índice para preservar a ordem.
      results[index] = await asyncFn(items[index], index);
    }
  }

  // Nº de workers = limite de concorrência (não mais que o nº de itens).
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}
