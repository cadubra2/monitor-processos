// src/services/alertService.js
// Dispara o alerta de nova movimentação.
// Sempre imprime no console e envia para o Telegram (canal principal).
// Opcionalmente envia também para um webhook genérico.

import axios from 'axios';
import { config } from '../config/env.js';

/**
 * Monta o texto do alerta, com formatação leve para terminal e Telegram.
 * @param {{ cliente: string, numero: string, tribunal: string, data: string, resumo: string, novas: number }} info
 */
function montarMensagem({ cliente, numero, tribunal, data, resumo, novas }) {
  const dataLegivel = formatarData(data);
  return (
    `🔔 *NOVA MOVIMENTAÇÃO*\n` +
    `\n👤 *Cliente:* ${cliente || '(sem nome)'}\n` +
    `📁 *Processo:* ${numero} [${tribunal || '?'}]\n` +
    `📅 *Data:* ${dataLegivel}\n` +
    `🆕 *Novidades:* ${novas}\n` +
    `\n📝 *Resumo:*\n${resumo}`
  );
}

/** Converte data ISO (ex.: 2025-12-03T00:39:44.000Z) em DD/MM/AAAA HH:mm legível. */
function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // fallback: mostra como veio
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Envia o alerta para o Telegram (console.log sempre; Telegram se configurado).
 *
 * @param {{ cliente: string, numero: string, tribunal: string, data: string, resumo: string, novas: number }} info
 */
export async function sendAlert(info) {
  const mensagem = montarMensagem(info);

  // 1. Sempre loga no console (debug local).
  console.log('\n' + mensagem + '\n');

  // 2. Envia para o Telegram (canal principal de notificação).
  await enviarTelegram(mensagem);

  // 3. Webhook opcional (Slack/Discord/n8n) — se configurado.
  if (config.runtime.alertWebhookUrl) {
    await enviarWebhook(info, mensagem);
  }
}

/** Envia a mensagem via Bot API do Telegram (Markdown). */
async function enviarTelegram(mensagem) {
  const { botToken, chatId } = config.telegram;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      text: mensagem,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    // Se o Markdown falhar (caractere especial), reenvia sem formatação.
    if (err.response?.status === 400) {
      try {
        await axios.post(url, {
          chat_id: chatId,
          // Limpa asteriscos caso o Markdown tenha sido o problema.
          text: mensagem.replace(/\*/g, ''),
        });
        return;
      } catch (err2) {
        console.warn(`[alertService] Telegram (fallback) falhou: ${err2.message}`);
        return;
      }
    }
    console.warn(`[alertService] Telegram falhou: ${err.message}`);
  }
}

/** Envia o payload bruto para o webhook genérico configurado. */
async function enviarWebhook(info, mensagem) {
  try {
    await axios.post(config.runtime.alertWebhookUrl, {
      text: mensagem, // Slack
      content: mensagem, // Discord
      ...info,
    });
  } catch (err) {
    console.warn(`[alertService] Webhook falhou: ${err.message}`);
  }
}
