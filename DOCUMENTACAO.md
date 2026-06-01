# 💶 Contas a Pagar — Documentação

App pessoal (uso próprio, **não** para distribuição) para gerir **contas a pagar** num
calendário, com **avisos automáticos no Telegram** mesmo com a app fechada.

> **Última atualização:** 2026-06-01
> **Estado:** Código **completo e testado localmente**. Falta apenas a **configuração inicial**
> na nuvem (Supabase + Telegram + GitHub) — ver a secção [Configuração inicial](#-configuração-inicial-uma-vez).

---

## 1. O que a app faz

- **Calendário mensal** com marcas (ponto vermelho) nos dias com pagamentos.
- **Lista "Próximos"** — pagamentos dos próximos 60 dias, ordenados, com dias em falta e valor.
- **Adicionar/editar** despesa: nome, **valor (€)**, data, **repetição** (uma vez / mensal / anual),
  antecedência do aviso, categoria e notas.
- **Repetição anual**, conforme pedido: uma despesa de maio deste ano repete-se automaticamente
  em maio do próximo ano (e por aí em diante). Também há **mensal** e **uma só vez**.
- **Totais** dos próximos 7 e 30 dias.
- **Avisos no Telegram**: **7 dias antes** + **no próprio dia** de cada pagamento (a antecedência é
  configurável por despesa), e um **resumo semanal** todas as **segundas-feiras**.
- **Funciona no telemóvel (Android) e no PC**, instalável no ecrã principal, com dados
  **sincronizados** entre dispositivos.

---

## 2. Como funciona (arquitetura)

```
 ┌─────────────┐   abre/edita    ┌──────────────────────┐
 │ Telemóvel/PC │ ─────────────▶ │  PWA (GitHub Pages)   │
 │  (navegador) │ ◀───────────── │  HTML + CSS + JS       │
 └─────────────┘    mostra        └──────────┬───────────┘
                                              │ lê/escreve (com login)
                                              ▼
                                   ┌──────────────────────┐
                                   │ Supabase (Postgres)  │  ← guarda as despesas
                                   │  + login + RLS        │     (privado, sincronizado)
                                   └──────────┬───────────┘
                                              │ lê 1x/dia (chave service_role)
                                   ┌──────────▼───────────┐
                                   │ GitHub Actions (cron)│  → envia avisos
                                   │  notifier/notify.mjs  │
                                   └──────────┬───────────┘
                                              ▼
                                        📲 Telegram
```

- **PWA** = página web instalável. Não tem passo de compilação ("build"); são ficheiros simples.
  A biblioteca do Supabase é carregada por CDN.
- **Supabase** (plano gratuito) guarda os dados e trata do login. As regras **RLS** garantem que só
  tu vês os teus dados.
- **GitHub Actions** corre o script `notify.mjs` uma vez por dia (cron) e envia os avisos ao Telegram.
- **Telegram** é onde recebes as notificações.

**Tudo gratuito.** Precisas de **2 contas** (GitHub e Supabase) + um **bot de Telegram**.

---

## 3. Estrutura dos ficheiros

```
Aplicação/
├── index.html              ← estrutura da app (login, calendário, lista, formulários)
├── app.js                  ← lógica: login, CRUD, calendário, recorrência, totais
├── config.js               ← ⚙️ as TUAS chaves PÚBLICAS do Supabase (preencher)
├── styles.css              ← aspeto visual (mobile-first, claro/escuro)
├── manifest.webmanifest    ← torna a app instalável (nome, ícones, cores)
├── sw.js                   ← service worker (abre rápido / offline)
├── icons/
│   ├── icon.svg            ← ícone vetorial
│   ├── icon-192.png        ← ícones para Android (gerados)
│   ├── icon-512.png
│   ├── icon-512-maskable.png
│   └── make_icons.py       ← script que gera os PNGs (correr só se quiseres mudar o ícone)
├── db/
│   └── schema.sql          ← criar a tabela + segurança no Supabase (colar no SQL Editor)
├── notifier/
│   ├── notify.mjs          ← script de avisos (corre no GitHub Actions; sem dependências)
│   └── .env.example        ← variáveis para testar localmente
├── .github/workflows/
│   └── notify.yml          ← agenda diária (cron) que corre o notify.mjs
├── .gitignore
└── DOCUMENTACAO.md         ← este documento
```

---

## 4. 🔧 Configuração inicial (uma vez)

Segue por ordem. No fim, fica tudo a funcionar sozinho.

### Passo A — Criar o bot de Telegram
1. No Telegram, abre conversa com **@BotFather**.
2. Envia `/newbot`, escolhe um nome e um username (tem de terminar em `bot`).
3. O BotFather dá-te um **token** parecido com `123456789:AAE...`. **Guarda-o.**
4. **Abre a conversa com o teu novo bot e envia-lhe** `/start` (uma mensagem qualquer). Isto é preciso
   para o bot te poder escrever.
5. Descobre o teu **chat id**: abre conversa com **@userinfobot** e envia `/start` — ele responde com
   o teu `Id` (um número). Esse número é o **TELEGRAM_CHAT_ID**.
   - *(Alternativa: abre no navegador `https://api.telegram.org/bot<TOKEN>/getUpdates` depois de
     enviares mensagem ao teu bot, e procura `"chat":{"id": ...}`.)*

### Passo B — Criar o projeto no Supabase
1. Vai a **https://supabase.com** → cria conta → **New project** (escolhe uma região europeia,
   ex.: *West EU (London)*; guarda a password da base de dados).
2. Quando o projeto estiver pronto, abre **SQL Editor** → **New query** → cola **todo** o conteúdo de
   `db/schema.sql` → **Run**. Deve dizer *Success*.
3. **Desligar a confirmação de email** (para entrares logo, sem clicar em links):
   **Authentication → Sign In / Providers → Email** → desliga **"Confirm email"** → **Save**.
   *(Em alternativa, podes criar o utilizador à mão em Authentication → Users → Add user.)*
4. Vai a **Project Settings → API** e copia:
   - **Project URL** → usado em `config.js` e nos Secrets (`SUPABASE_URL`).
   - **anon public** (Project API keys) → usado em `config.js` (`SUPABASE_ANON_KEY`).
   - **service_role** (Project API keys, *secret*) → **só** para os Secrets do GitHub
     (`SUPABASE_SERVICE_KEY`). **Nunca** colocar isto no `config.js`.

### Passo C — Preencher o `config.js`
Abre `config.js` e substitui os dois valores pela **Project URL** e pela chave **anon public**:
```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...(chave anon longa)...",
};
```
> Estas duas chaves são **públicas** e seguras de expor — os dados ficam protegidos pelo login + RLS.

### Passo D — Pôr a app online (GitHub Pages)
1. Cria conta em **https://github.com** e cria um **repositório novo** (ex.: `contas`).
   Podes deixá-lo **público** sem problema: o código não contém segredos.
2. Envia os ficheiros desta pasta para o repositório (ver [Enviar para o GitHub](#enviar-para-o-github)).
3. No repositório: **Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save**.
4. Passados 1–2 minutos aparece o endereço: **`https://<o-teu-utilizador>.github.io/contas/`**.
   Esse é o link da tua app.

### Passo E — Configurar os avisos (Secrets do GitHub Actions)
No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
Cria estes **4** secrets (nome exato → valor):

| Secret                  | Valor                                              |
|-------------------------|----------------------------------------------------|
| `SUPABASE_URL`          | a Project URL do Supabase                           |
| `SUPABASE_SERVICE_KEY`  | a chave **service_role** (secreta) do Supabase      |
| `TELEGRAM_BOT_TOKEN`    | o token do BotFather                                |
| `TELEGRAM_CHAT_ID`      | o teu chat id (do @userinfobot)                     |

Depois, testa já: **Actions → "Avisos de pagamentos" → Run workflow**. Deves receber mensagem no
Telegram (se tiveres alguma despesa a vencer hoje / daqui a 7 dias, ou se for segunda-feira).

### Passo F — Instalar no telemóvel (Android)
1. Abre o link do GitHub Pages no **Chrome**.
2. Menu (⋮) → **"Adicionar ao ecrã principal"** / **"Instalar app"**.
3. Abre pelo ícone, **entra** (na 1.ª vez carrega em *Criar conta* e define email + password).

✅ **Pronto.** Adicionas despesas na app; os avisos chegam ao Telegram automaticamente.

---

## 5. Usar no dia-a-dia

- **➕ (canto inferior direito)** — adicionar pagamento.
- Tocar num item da lista ou num dia do calendário — **editar** ou ver detalhes.
- **Repetição**: escolhe *Todos os anos* (ex.: seguro, IUC, IMI), *Todos os meses* (renda, água, luz)
  ou *Uma só vez*.
- **Avisar quantos dias antes**: por omissão 7; recebes **sempre** também um aviso no próprio dia.
- **Ativo**: desliga para guardar a despesa mas deixar de receber avisos dela.

---

## 6. Testar / mexer no código

### Correr a app localmente (no PC)
Na pasta do projeto:
```powershell
python -m http.server 8080
```
Abre **http://localhost:8080**. (Funciona contra o Supabase real, depois do Passo B/C.)

### Testar o notificador sem enviar nada
Cria um ficheiro `notifier/.env` (copia de `.env.example`) com as tuas chaves e corre:
```powershell
# PowerShell
$env:DRY_RUN="1"; node notifier/notify.mjs
```
Com `DRY_RUN=1` ele **imprime** as mensagens em vez de as enviar.

### Enviar para o GitHub
Com o Git já instalado, na pasta do projeto:
```powershell
git init
git add .
git commit -m "App Contas a Pagar"
git branch -M main
git remote add origin https://github.com/<o-teu-utilizador>/contas.git
git push -u origin main
```
Sempre que mudares algo na app, repete: `git add . ; git commit -m "..." ; git push`.
> Nota: se alterares `index.html`, `app.js` ou `styles.css`, sobe o número da versão em `sw.js`
> (`const CACHE = "contas-v2";`) para o telemóvel buscar a versão nova.

---

## 7. Alterações comuns

| Quero...                                   | Onde mexer                                                                 |
|--------------------------------------------|---------------------------------------------------------------------------|
| Mudar a hora do aviso diário               | `.github/workflows/notify.yml` → linha `cron: "0 7 * * *"` (está em UTC).  |
| Mudar a antecedência por omissão (7 dias)  | `index.html` (`value="7"` no campo) e `app.js` (`openForm`, valor 7).      |
| Mudar o dia do resumo semanal              | `notifier/notify.mjs` → `lisbonWeekday() === "Mon"`.                        |
| Mudar cores / aspeto                       | `styles.css` (variáveis no topo, ex.: `--primary`).                        |
| Mudar o ícone                              | edita `icons/icon.svg` e/ou `icons/make_icons.py` e corre `python icons/make_icons.py`. |
| Adicionar "a receber" (receitas) no futuro | acrescentar coluna `kind` em `db/schema.sql` e adaptar `app.js`/`notify.mjs` (ver Ideias). |

---

## 8. Segurança — onde fica cada chave

| Chave / segredo            | Onde vive                          | Pode ser pública? |
|----------------------------|-------------------------------------|-------------------|
| Supabase **URL**           | `config.js` + Secret `SUPABASE_URL` | Sim               |
| Supabase **anon public**   | `config.js`                         | Sim (protegido por RLS) |
| Supabase **service_role**  | **só** Secret `SUPABASE_SERVICE_KEY`| ❌ Nunca expor    |
| Telegram **bot token**     | **só** Secret `TELEGRAM_BOT_TOKEN`  | ❌ Não            |
| Telegram **chat id**       | **só** Secret `TELEGRAM_CHAT_ID`    | Não crítico       |

Os teus dados (as despesas) **não** estão no GitHub — estão no Supabase, protegidos por login + RLS.

---

## 9. Resolução de problemas

- **Não recebo avisos no Telegram.**
  1) Enviaste `/start` ao teu bot? 2) Os 4 Secrets estão certos (nomes exatos)? 3) Vai a **Actions**,
  abre a última execução e lê o registo. 4) Confirma que tens despesas a vencer **hoje** ou **daqui a
  7 dias** (fora dessas janelas, só há mensagem às segundas).
- **"⚙️ Falta configurar" ao abrir a app.** O `config.js` ainda tem os valores de exemplo — Passo C.
- **Não consigo entrar / criar conta.** Desliga "Confirm email" no Supabase (Passo B.3) ou cria o
  utilizador em Authentication → Users.
- **Mudei a app mas o telemóvel mostra a versão antiga.** Sobe a versão do `CACHE` em `sw.js` e faz push.
- **O cron deixou de correr.** O GitHub desativa agendamentos após 60 dias sem atividade no repo; o
  workflow já faz um pequeno commit "keepalive" para evitar isso. Se mesmo assim parar, abre **Actions**
  e clica em **Enable workflow** / **Run workflow**.

---

## 10. Limitações conhecidas (decisões para manter simples)

- A **edição** de dados precisa de Internet (os dados vivem no Supabase). O service worker só faz a
  app **abrir** depressa/offline.
- O aviso diário usa **a antecedência de cada despesa + o próprio dia** (ex.: 7 dias e 0 dias). Não
  envia em todos os dias intermédios.
- Sem deduplicação: se correres o workflow à mão várias vezes no mesmo dia, recebes o aviso repetido.
- Moeda assumida **EUR**. Regista-se **só despesas a pagar** (ver Ideias para acrescentar receitas).
- O cron corre às ~08:00 de Portugal; pode ter pequenos atrasos (normal no GitHub Actions).

---

## 11. Ideias / próximos passos (opcional)

- **"A receber" (receitas):** adicionar coluna `kind text default 'pay'` e mostrar a verde + saldo.
- **Marcar como pago** numa ocorrência (histórico) — precisa de uma tabela de pagamentos efetuados.
- **Segundo aviso** (ex.: 7 dias **e** 3 dias) — guardar uma lista de antecedências por despesa.
- **Anexar valor variável** por ocorrência (ex.: conta da luz que muda todos os meses).

---

## 12. Resumo técnico rápido (para retomar depressa)

- **Frontend:** PWA estática (`index.html`, `app.js`, `styles.css`) — sem build; Supabase via CDN.
- **Dados:** Supabase Postgres, tabela `public.expenses`, RLS por `user_id = auth.uid()`.
- **Recorrência:** `occurrencesInRange()` (em `app.js` **e** `notify.mjs`, lógica idêntica) — `once` /
  `monthly` (com *clamp* de dias) / `yearly` (com *clamp* de 29/fev).
- **Avisos:** `notifier/notify.mjs` (Node, sem dependências, `fetch`) → Telegram; corre via
  `.github/workflows/notify.yml` (cron diário 07:00 UTC + `workflow_dispatch`).
- **Datas:** "hoje" calculado em `Europe/Lisbon` no servidor; no cliente usa a hora local.
- **Testado:** lógica de recorrência e notificador validados localmente em 2026-06-01.
