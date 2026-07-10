// src/services/aiService.js
// Usa o Google Gemini (@google/genai, novo SDK unificado) para resumir o andamento
// processual em linguagem simples.
//
// API verificada (SDK novo — NÃO usar @google/generative-ai, que está deprecated):
//   const ai = new GoogleGenAI({ apiKey });
//   const res = await ai.models.generateContent({ model, contents, config });
//   res.text  // propriedade (getter), não método

import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

// Cliente singleton — uma instância reutiliza conexões e é mais eficiente.
let aiClient = null;

function getClient() {
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey: config.ai.apiKey });
  return aiClient;
}

// Instrução de sistema: define o "papel" e o estilo do modelo de forma estável.
const SYSTEM_INSTRUCTION = [
  'Você é um assistente jurídico brasileiro, especializado em traduzir jargão de andamentos processuais.',
  'Sua tarefa: resumir o andamento informado em, no MÁXIMO, 2 linhas, em linguagem direta e fácil de entender para um cliente leigo.',
  'Regras:',
  '- Não invente fatos; use só o que está no andamento.',
  '- Não use jargão (ex.: "conclusos", "vista ministerial") sem traduzir.',
  '- Não cite números de processo nem datas no resumo.',
  '- Responda em português do Brasil.',
].join('\n');

/**
 * Gera um resumo em linguagem simples do nome/descrição do movimento.
 *
 * @param {string} movimento - Texto do andamento (ex.: "Conclusos para despacho / decisão").
 * @returns {Promise<string>} - Resumo de até 2 linhas. Em caso de falha, retorna um fallback.
 */
export async function summarizeMovement(movimento) {
  if (!movimento) return 'Movimentação sem descrição.';

  try {
    const response = await getClient().models.generateContent({
      model: config.ai.model,
      contents: `Andamento processual: "${movimento}".\nEscreva o resumo.`,
      config: {
        // temperature baixa = resumos mais estáveis e literais.
        temperature: 0.3,
        // Desliga o "thinking" do modelo para reduzir latência e custo no ETL.
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    // .text é uma propriedade (getter) no novo SDK.
    const texto = response.text?.trim();
    return texto || 'Não foi possível gerar o resumo automaticamente.';
  } catch (err) {
    // Não deixa um erro de IA quebrar o fluxo do processo — retorna fallback.
    console.warn(
      `[aiService] Falha ao resumir movimento (${movimento}): ${err.message}`,
    );
    return `Resumo indisponível. Andamento original: ${movimento}`;
  }
}
