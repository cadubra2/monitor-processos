// src/services/alertService.js
// Dispara o alerta de nova movimentação.
// Sempre imprime no console e envia para o Telegram (canal principal).
// Opcionalmente envia também para um webhook genérico.

import axios from 'axios';
import { config } from '../config/env.js';

const GRAU_DESC = { G1: '1ª Instância (início do processo)', G2: '2ª Instância (recursos e apelações)', JE: 'Juizado Especial Cível', TR: 'Turma Recursal' };

function nomeTribunal(sigla) {
  if (!sigla) return '—';
  const nomes = {
    stf: 'Supremo Tribunal Federal',
    stj: 'Superior Tribunal de Justiça',
    tst: 'Tribunal Superior do Trabalho',
    tse: 'Tribunal Superior Eleitoral',
    trf1: 'Tribunal Regional Federal da 1ª Região (DF, MG, GO, MT, BA, PI, MA, PA, AM, RR, AC, RO, TO)',
    trf2: 'Tribunal Regional Federal da 2ª Região (RJ, ES)',
    trf3: 'Tribunal Regional Federal da 3ª Região (SP, MS)',
    trf4: 'Tribunal Regional Federal da 4ª Região (RS, SC, PR)',
    trf5: 'Tribunal Regional Federal da 5ª Região (PE, CE, RN, PB, SE, AL)',
    trf6: 'Tribunal Regional Federal da 6ª Região (MG)',
  };
  if (nomes[sigla]) return nomes[sigla];
  // Infere pela sigla
  if (sigla.startsWith('trf')) return `Justiça Federal — ${sigla.toUpperCase()}`;
  if (sigla.startsWith('trt')) return `Justiça do Trabalho — ${sigla.toUpperCase()}`;
  if (sigla.startsWith('tre')) return `Justiça Eleitoral — ${sigla.toUpperCase()}`;
  if (sigla.startsWith('tjm')) return `Justiça Militar Estadual — ${sigla.toUpperCase()}`;
  if (sigla.startsWith('tj')) return `Tribunal de Justiça — ${sigla.toUpperCase()}`;
  return `Justiça ${sigla.toUpperCase()}`;
}

function montarMensagem({ cliente, numero, tribunal, data, resumo, novas, classe, assuntoPrincipal, orgaoJulgador, dataAjuizamento, grau }) {
  const dataLegivel = formatarData(data);
  const dataAjuizamentoLegivel = formatarData(dataAjuizamento);
  const municipio = orgaoJulgador?.municipio ? ` — ${orgaoJulgador.municipio}` : '';
  const grauDesc = GRAU_DESC[grau] || grau || '—';

  let msg =
    `🔔 *ATUALIZAÇÃO NO SEU PROCESSO*\n` +
    `\n👤 *Cliente:* ${cliente || '(sem nome)'}\n` +
    `📁 *Processo:* ${numero}\n` +
    `　　*Tribunal:* ${nomeTribunal(tribunal)}\n`;

  if (classe?.nome) msg += `\n⚖️ *Classe:* ${classe.nome}\n　　(Tipo da ação — como a Justiça classifica seu caso)\n`;
  if (assuntoPrincipal?.nome) msg += `📋 *Assunto:* ${assuntoPrincipal.nome}\n　　(Motivo principal do processo)\n`;
  if (orgaoJulgador?.nome) msg += `🏛️ *Vara:* ${orgaoJulgador.nome}${municipio}\n　　(Cartório onde o processo está)\n`;
  if (grau) msg += `🔰 *Instância:* ${grauDesc}\n`;
  if (dataAjuizamento) msg += `📄 *Início do processo:* ${dataAjuizamentoLegivel}\n　　(Data em que a ação foi protocolada)\n`;

  msg += `\n📅 *Última movimentação:* ${dataLegivel}\n` +
    `🆕 *${novas} nova(s) desde a última consulta*\n` +
    (cliente ? `\n📝 *O que aconteceu no processo de ${cliente}:*\n` : `\n📝 *O que aconteceu:*\n`) +
    `${resumo}`;

  return msg;
}

/** Converte data ISO (ex.: 2025-12-03T00:39:44.000Z) ou YYYYMMDDHHmmss em DD/MM/AAAA HH:mm legível. */
function formatarData(raw) {
  if (!raw) return '—';
  // Tenta parsear ISO (new Date() nativo)
  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  // Tenta parsear YYYYMMDDHHmmss (formato comum do Datajud)
  const match = String(raw).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
  }
  return raw; // fallback: mostra como veio
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
