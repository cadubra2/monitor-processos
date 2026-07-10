# Monitor de Movimentações Processuais

ETL em Node.js que monitora processos judiciais brasileiros automaticamente:

1. Lê a lista de processos de uma planilha do **Google Sheets**.
2. Consulta o histórico de cada processo na **API pública do Datajud (CNJ)**.
3. Detecta **movimentações novas** comparando a data mais recente do tribunal com a data registrada na planilha.
4. Usa o **Google Gemini** para traduzir o jargão jurídico em um resumo de até 2 linhas.
5. **Dispara um alerta** (console + webhook opcional) e **atualiza a planilha** com a nova data.
6. Repete tudo automaticamente via **cron**.

## Pré-requisitos

- Node.js 18+
- Uma planilha no Google Sheets compartilhada com uma Service Account
- Chave pública do Datajud (CNJ)
- Chave de API do Google Gemini (AI Studio)

## Layout da planilha

| A | B | C | D |
|---|---|---|---|
| Número do Processo | Nome do Cliente | Data Última Movimentação | Sigla do Tribunal |

- A **linha 1** é o cabeçalho (ignorada). Os dados começam na **linha 2**.
- O número pode vir formatado (`0001234-56.2018.1.13.0024`) ou só dígitos — o código normaliza.
- A **sigla do tribunal** (coluna D) define o endpoint do Datajud: `api_publica_<sigla>/_search` (ex.: `tjrj`, `tjsp`, `trf3`). É obrigatória porque a API é dividida por tribunal.
- A coluna C é escrita em formato **ISO 8601** (`2026-07-09T14:30:00.000Z`) para permitir comparação precisa.

## Setup

```bash
npm install
cp .env.example .env
# edite o .env com suas credenciais
```

### 1. Google Sheets (Service Account)
1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e habilite a **Google Sheets API**.
2. Crie uma **Service Account** e gere uma chave JSON.
3. Compartilhe sua planilha com o e-mail da service account (`...@...iam.gserviceaccount.com`) com permissão de **Editor**.
4. Copie o `client_email` e a `private_key` para o `.env`.

### 2. Datajud (CNJ)
Pegue a chave pública em: https://datajud-wiki.cnj.jus.br/api-publica/acesso/

### 3. Gemini
Crie uma chave em: https://aistudio.google.com/app/apikey

## Uso

```bash
# Modo contínuo (cron) — produção
npm start

# Roda uma única vez (útil p/ teste)
npm run once

# Modo desenvolvimento (reinicia ao salvar)
npm run dev
```

Ajuste a frequência com `CRON_EXPRESSION` no `.env` (padrão: a cada 30 min).

## Estrutura

```
src/
├── config/   (env.js, sheetsAuth.js)
├── utils/    (concurrency.js, processNumber.js)
├── services/ (sheetsService, datajudService, aiService, alertService)
└── index.js  (orquestrador + cron)
```
