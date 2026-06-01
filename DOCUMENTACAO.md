# 💶 Contas a Pagar — Documentação

App pessoal (uso próprio, **não** para distribuição) para gerir **contas a pagar** num
calendário, com **avisos automáticos no Telegram** mesmo com a app fechada.

> **Última atualização:** 2026-06-01
> **Estado:** ✅ **Em funcionamento (publicado).** App online, dados no Supabase e avisos no Telegram a funcionar.
>
> **Acessos rápidos:**
> - 🌐 App (telemóvel/PC): **https://maxdog55.github.io/Aplica-o/**
> - 💻 Código (GitHub): **github.com/maxdog55/Aplica-o**
> - 🤖 Bot de Telegram: **@MaxLuaBot**
> - 📲 Destinatários dos avisos: **2 pessoas** (geridas no Secret `TELEGRAM_CHAT_ID` — ver secção 6)
> - 🧪 Teste local no PC: `python -m http.server 8080` → abrir `localhost:8080`

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
- **Avisos para uma ou várias pessoas** (ex.: tu + um familiar), todas pelo mesmo bot.
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
                                  📲 Telegram (1 ou + pessoas)
```

- **PWA** = página web instalável. Não tem passo de compilação ("build"); são ficheiros simples.
  A biblioteca do Supabase é carregada por CDN.
- **Supabase** (plano gratuito) guarda os dados e trata do login. As regras **RLS** garantem que só
  tu vês os teus dados.
- **GitHub Actions** corre o script `notify.mjs` uma vez por dia (cron) e envia os avisos ao Telegram.
- **Telegram** é onde tu (e quem mais quiseres) recebem as notificações.

**Tudo gratuito.** Precisas de **2 contas** (GitHub e Supabase) + um **bot de Telegram**.

---

## 3. Estrutura dos ficheiros

```
Aplicação/
├── index.html              ← estrutura da app (login, calendário, lista, formulários)
├── app.js                  ← lógica: login, CRUD, calendário, recorrência, totais
├── config.js               ← ⚙️ as TUAS chaves PÚBLICAS do Supabase (já preenchido)
├── styles.css              ← aspeto visual (mobile-first, claro/escuro)
├── manifest.webmanifest    ← torna a app instalável (nome, ícones, cores)
├── sw.js                   ← service worker (abre rápido / offline) — versão atual: contas-v2
├── icons/                  ← ícones (icon.svg + PNGs gerados por make_icons.py)
├── db/
│   └── schema.sql          ← criar a tabela + segurança no Supabase (colar no SQL Editor)
├── notifier/
│   ├── notify.mjs          ← script de avisos (corre no GitHub Actions; sem dependências)
│   ├── .env.example        ← modelo de variáveis para testar localmente
│   └── .env                ← (LOCAL, não versionado) as tuas chaves para testes no PC
├── .github/workflows/
│   └── notify.yml          ← agenda diária (cron) que corre o notify.mjs
├── .gitignore
└── DOCUMENTACAO.md         ← este documento
```

---

## 4. 🔧 Configuração inicial (já feita — referência)

> Isto **já está tudo feito**. Fica aqui para referência / se um dia precisares de recriar.

### Passo A — Bot de Telegram
1. No Telegram, conversa com **@BotFather** → `/newbot` → escolhe nome e username (termina em `bot`).
2. Guarda o **token** (tipo `123456789:AAE...`).
3. Abre a conversa com o teu bot e envia `/start`.
4. Chat id: fala com **@userinfobot** (dá o `Id`) — esse número é o **TELEGRAM_CHAT_ID**.

### Passo B — Projeto no Supabase
1. **https://supabase.com** → conta → **New project** (região europeia; guarda a password da BD).
2. **SQL Editor → New query** → cola **todo** o `db/schema.sql` → **Run**.
3. **Criar o utilizador** (login): **Authentication → Users → Add user** → email + password +
   **Auto Confirm**. *(Alternativa: desligar "Confirm email" em Authentication → Providers → Email.)*
4. **Project Settings → API** → copia: **Project URL**, chave **anon public**, chave **service_role**.

### Passo C — Preencher o `config.js`
```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://gpdofpeignsnfbtxrhft.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...(chave anon longa)...",
};
```
> ⚠️ **Importante:** o `SUPABASE_URL` tem de terminar em **`.supabase.co`** — **sem** `/rest/v1/` nem
> barra a mais no fim. (Pôr `/rest/v1/` causou o erro *"Invalid path specified in request URL"* ao entrar.)
> As duas chaves do `config.js` são **públicas** e seguras (os dados ficam protegidos por login + RLS).

### Passo D — App online (GitHub Pages)
1. Conta em **github.com** + repositório (o nosso é **`Aplica-o`**, público — o código não tem segredos).
2. Enviar os ficheiros (ver secção 8, "Enviar para o GitHub").
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. Endereço final: **https://maxdog55.github.io/Aplica-o/**

### Passo E — Avisos (Secrets do GitHub Actions)
**Settings → Secrets and variables → Actions → New repository secret** — criar estes **4** (nome exato):

| Secret                  | Valor                                                      |
|-------------------------|------------------------------------------------------------|
| `SUPABASE_URL`          | a Project URL (termina em `.supabase.co`)                  |
| `SUPABASE_SERVICE_KEY`  | a chave **service_role** (secreta)                         |
| `TELEGRAM_BOT_TOKEN`    | o token do BotFather                                       |
| `TELEGRAM_CHAT_ID`      | chat id(s) — **vários separados por vírgula** (ver secção 6) |

Testar: **Actions → "Avisos de pagamentos" → Run workflow**.

### Passo F — Instalar no telemóvel (Android)
1. Abre **https://maxdog55.github.io/Aplica-o/** no **Chrome**.
2. Menu (⋮) → **Adicionar ao ecrã principal** / **Instalar app**.
3. Abre pelo ícone e **entra** com o email + password do Passo B.3.

---

## 5. Usar no dia-a-dia

- **➕ (canto inferior direito)** — adicionar pagamento.
- Tocar num item da lista ou num dia do calendário — **editar** ou ver detalhes.
- **Repetição**: *Todos os anos* (seguro, IUC, IMI), *Todos os meses* (renda, água, luz) ou *Uma só vez*.
- **Avisar quantos dias antes**: por omissão 7; recebes **sempre** também um aviso no próprio dia.
- **Ativo**: desliga para guardar a despesa mas deixar de receber avisos dela.

---

## 6. Quem recebe os avisos — adicionar / remover pessoas

Os avisos são enviados pelo bot **@MaxLuaBot** para um ou mais "chat ids", definidos no Secret
**`TELEGRAM_CHAT_ID`** (separados por **vírgula**, sem espaços). **Atualmente: 2 destinatários.**

**Adicionar uma pessoa:**
1. Essa pessoa abre o Telegram, procura **@MaxLuaBot** e carrega em **Iniciar/Start**
   *(obrigatório — um bot só pode escrever a quem falou com ele primeiro)*.
2. Descobrir o chat id dela: ela fala com **@userinfobot** (dá o `Id`), **ou** abre-se no navegador
   `https://api.telegram.org/bot<TOKEN>/getUpdates` e procura-se o `"chat":{"id":...}` dela.
3. No GitHub: **Settings → Secrets → Actions →** editar **`TELEGRAM_CHAT_ID`** e meter os ids
   separados por vírgula, ex.: `111111111,222222222`. (Atualizar também `notifier/.env` se testas no PC.)

**Remover uma pessoa:** tirar o id dela do `TELEGRAM_CHAT_ID` (no Secret e no `.env`).

> O código já trata disto: `notify.mjs` divide o `TELEGRAM_CHAT_ID` pelas vírgulas e envia a cada um.
> Quem só quer **receber** os avisos **não precisa** da app nem de login.

---

## 7. Funciona sempre e em qualquer lado?

**Em qualquer lugar / qualquer rede?** ✅ **Sim.** A app está na Internet (GitHub Pages) e os dados na
nuvem (Supabase), por isso abre em **qualquer Wi-Fi ou dados móveis**, em qualquer sítio. Só precisa de
**ligação à Internet** (para abrir, entrar e guardar). Sem Internet, a app abre mas não carrega os dados.
Os avisos do Telegram são enviados **a partir da nuvem** (GitHub) — chegam ao telemóvel
independentemente da rede e **mesmo com a app fechada**.

**Para sempre?** Na prática sim, sozinha, desde que não apagues o repositório/projeto. Pormenores honestos:
- Assenta em **serviços gratuitos** (GitHub, Supabase, Telegram). O aviso diário mantém o GitHub e o
  Supabase "ativos" (o GitHub desativa agendamentos após 60 dias parados; o Supabase suspende projetos
  após ~7 dias sem uso — a verificação diária evita os dois).
- As chaves do Supabase são válidas **~10 anos** (até ~2036); depois disso seria preciso renová-las.
- Políticas dos planos gratuitos podem mudar no futuro (improvável afetar um uso pessoal tão leve).

**Avisa sempre às segundas, 7 dias antes e no próprio dia?** ✅ **Sim:**
- **Segunda-feira:** resumo dos próximos 30 dias (sempre — funciona como rede de segurança).
- **7 dias antes** e **no próprio dia** de cada pagamento: aviso pontual.
- A verificação corre **1x/dia** de manhã (~08:00 PT). Pode haver pequenos atrasos do GitHub; se um dia
  falhar, o resumo de segunda cobre na mesma o que está a chegar.

---

## 8. Testar / mexer no código

### Correr a app localmente (no PC)
```powershell
python -m http.server 8080
```
Abre **http://localhost:8080**.

### Testar o notificador localmente
Com as chaves em `notifier/.env`, e (opcional) uma linha `DRY_RUN=1` para **não** enviar:
```powershell
node --env-file=notifier/.env notifier/notify.mjs
```

### Enviar alterações para o GitHub
O repositório já está ligado a **github.com/maxdog55/Aplica-o**. Para publicar mudanças:
```powershell
git add . ; git commit -m "descrição" ; git push
```
> Se alterares `index.html`, `app.js`, `styles.css` ou `config.js`, **sobe o número da versão** em
> `sw.js` (ex.: `const CACHE = "contas-v3";`) para os dispositivos buscarem a versão nova.

---

## 9. Alterações comuns

| Quero...                                   | Onde mexer                                                                 |
|--------------------------------------------|---------------------------------------------------------------------------|
| Adicionar/remover quem recebe os avisos    | Secret `TELEGRAM_CHAT_ID` com ids separados por vírgula (ver secção 6).    |
| Mudar a hora do aviso diário               | `.github/workflows/notify.yml` → linha `cron: "0 7 * * *"` (está em UTC).  |
| Mudar a antecedência por omissão (7 dias)  | `index.html` (`value="7"` no campo) e `app.js` (`openForm`, valor 7).      |
| Mudar o dia do resumo semanal              | `notifier/notify.mjs` → `lisbonWeekday() === "Mon"`.                        |
| Não enviar resumo em semanas sem pagamentos| `notify.mjs`, no bloco do resumo: só enviar se `rows.length > 0`.          |
| Mudar cores / aspeto                       | `styles.css` (variáveis no topo, ex.: `--primary`).                        |
| Mudar o ícone                              | editar `icons/icon.svg` e correr `python icons/make_icons.py`.            |
| Adicionar "a receber" (receitas)           | coluna `kind` em `db/schema.sql` + adaptar `app.js`/`notify.mjs` (secção 13). |

---

## 10. Segurança — onde fica cada chave

| Chave / segredo            | Onde vive                          | Pode ser pública? |
|----------------------------|-------------------------------------|-------------------|
| Supabase **URL**           | `config.js` + Secret `SUPABASE_URL` | Sim               |
| Supabase **anon public**   | `config.js`                         | Sim (protegido por RLS) |
| Supabase **service_role**  | **só** Secret `SUPABASE_SERVICE_KEY` e `notifier/.env` local | ❌ Nunca expor |
| Telegram **bot token**     | **só** Secret `TELEGRAM_BOT_TOKEN` e `notifier/.env` local   | ❌ Não         |
| Telegram **chat id(s)**    | Secret `TELEGRAM_CHAT_ID` e `notifier/.env` local            | Não crítico    |

O ficheiro `notifier/.env` (com os segredos) está em `.gitignore` → **nunca** é enviado para o GitHub.
Os teus dados (as despesas) **não** estão no GitHub — estão no Supabase, protegidos por login + RLS.

---

## 11. Resolução de problemas

- **Ao entrar dá "Invalid path specified in request URL".** O `SUPABASE_URL` (no `config.js` e/ou no
  Secret) tem `/rest/v1/` ou uma barra a mais. Tem de terminar em **`.supabase.co`**.
- **Corrigi a app mas o navegador (PC) continua a mostrar a versão antiga.** É a "memória" do service
  worker. Soluções: **janela anónima** (Ctrl+Shift+N); **ou** `F12 → Application → Service workers →
  Unregister` + **Storage → Clear site data**; **ou** servir noutra porta (`python -m http.server 8090`
  → `localhost:8090`). No telemóvel não acontece (instalação de raiz).
- **Não recebo avisos no Telegram.** 1) A pessoa enviou `/start` ao @MaxLuaBot? 2) Os 4 Secrets estão
  certos (nomes exatos; `TELEGRAM_CHAT_ID` com vírgula entre ids)? 3) **Actions** → abre a última
  execução e lê o registo. 4) Fora das janelas (7 dias / dia / segunda) é **normal** não chegar nada.
- **"⚙️ Falta configurar" ao abrir a app.** O `config.js` tem os valores de exemplo — Passo C.
- **Não consigo entrar.** Confirma o utilizador em Supabase → Authentication → Users (ou desliga
  "Confirm email").
- **O cron deixou de correr.** O GitHub desativa agendamentos após 60 dias sem atividade; o workflow já
  faz um commit "keepalive" para evitar isso. Se parar, **Actions → Enable workflow / Run workflow**.

---

## 12. Limitações conhecidas (decisões para manter simples)

- A **edição** de dados precisa de Internet (os dados vivem no Supabase). O service worker só faz a app
  **abrir** depressa/offline.
- O aviso diário usa **a antecedência de cada despesa + o próprio dia** (ex.: 7 e 0 dias); não envia em
  todos os dias intermédios. O resumo de segunda cobre o resto.
- Sem deduplicação: correr o workflow à mão várias vezes no mesmo dia repete o aviso.
- Moeda assumida **EUR**. Regista **só despesas a pagar** (ver Ideias para acrescentar receitas).
- O cron corre às ~08:00 de Portugal; pode ter pequenos atrasos (normal no GitHub Actions).

---

## 13. Ideias / próximos passos (opcional)

- **"A receber" (receitas):** coluna `kind text default 'pay'`, mostrar a verde + saldo.
- **Marcar como pago** numa ocorrência (histórico) — exige uma tabela de pagamentos efetuados.
- **Segundo aviso** (ex.: 7 dias **e** 3 dias) — guardar uma lista de antecedências por despesa.
- **Valor variável** por ocorrência (ex.: conta da luz que muda todos os meses).

---

## 14. Resumo técnico rápido (para retomar depressa)

- **Publicado:** app em **https://maxdog55.github.io/Aplica-o/** · código em **github.com/maxdog55/Aplica-o**
  · bot **@MaxLuaBot** · **2 destinatários** no Secret `TELEGRAM_CHAT_ID`.
- **Frontend:** PWA estática (`index.html`, `app.js`, `styles.css`) — sem build; Supabase via CDN.
  Service worker em cache `contas-v2` (subir versão ao alterar).
- **Dados:** Supabase Postgres, tabela `public.expenses`, RLS por `user_id = auth.uid()`.
- **Recorrência:** `occurrencesInRange()` (igual em `app.js` e `notify.mjs`) — `once` / `monthly`
  (clamp de dias) / `yearly` (clamp de 29/fev).
- **Avisos:** `notifier/notify.mjs` (Node, sem dependências, `fetch`) → Telegram, **vários destinatários**
  (`TELEGRAM_CHAT_ID` separado por vírgula); corre via `.github/workflows/notify.yml` (cron diário
  07:00 UTC + `workflow_dispatch` + commit *keepalive*).
- **Datas:** "hoje" calculado em `Europe/Lisbon` no servidor; no cliente usa a hora local.
- **Estado:** Em produção desde 2026-06-01 — app publicada, login e avisos a funcionar (testado ponta a ponta).
