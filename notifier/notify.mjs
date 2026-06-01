/* =============================================================================
 *  Notificador de pagamentos — corre 1x/dia no GitHub Actions.
 *  Lê as despesas do Supabase e envia avisos para o Telegram:
 *    • "Faltam X dias" (X = reminder_days_before de cada despesa)
 *    • "É HOJE" no próprio dia
 *    • Resumo semanal às segundas-feiras (próximos 30 dias)
 *  Sem dependências (usa fetch nativo do Node 18+).  Testar:  DRY_RUN=1 node notifier/notify.mjs
 * ============================================================================= */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  DRY_RUN,
} = process.env;

const dry = DRY_RUN === "1" || DRY_RUN === "true";
// Vários destinatários: separa os chat ids por vírgula no TELEGRAM_CHAT_ID (ex.: "111,222")
const CHAT_IDS = (TELEGRAM_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);

// ---------- Datas / recorrência (espelhado de app.js) ----------
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const clampDay = (y, m, d) => Math.min(d, daysInMonth(y, m));
const dateUTC = (p) => Date.UTC(p.y, p.m - 1, p.d);
const diffDays = (a, b) => Math.round((dateUTC(b) - dateUTC(a)) / 86400000);
const addDays = (p, n) => { const t = new Date(dateUTC(p) + n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const parseISO = (s) => { const a = s.split("-").map(Number); return { y: a[0], m: a[1], d: a[2] }; };

function occurrencesInRange(exp, start, end) {
  const due = parseISO(exp.due_date);
  const startK = ymd(start.y, start.m, start.d), endK = ymd(end.y, end.m, end.d), dueK = ymd(due.y, due.m, due.d);
  const out = [];
  const pushIf = (p) => { const k = ymd(p.y, p.m, p.d); if (k >= startK && k <= endK && k >= dueK) out.push(p); };
  if (exp.recurrence === "once") {
    pushIf(due);
  } else if (exp.recurrence === "yearly") {
    for (let y = start.y; y <= end.y; y++) pushIf({ y, m: due.m, d: clampDay(y, due.m, due.d) });
  } else { // monthly
    let y = start.y, m = start.m;
    while (ymd(y, m, 1) <= endK) { pushIf({ y, m, d: clampDay(y, m, due.d) }); m++; if (m > 12) { m = 1; y++; } }
  }
  return out;
}

// "Hoje" e dia-da-semana no fuso de Portugal (o cron corre em UTC)
function lisbonToday() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date()); // YYYY-MM-DD
  return parseISO(s);
}
function lisbonWeekday() {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Lisbon", weekday: "short" }).format(new Date()); // "Mon".."Sun"
}

const eur = (cents) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);
const ddmm = (p) => `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}`;

// ---------- Telegram ----------
async function sendTelegram(text) {
  if (dry) { console.log("\n--- (DRY_RUN) Mensagem Telegram ---\n" + text + "\n-----------------------------------"); return; }
  for (const chat_id of CHAT_IDS) {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error("Telegram falhou (chat " + chat_id + "): " + JSON.stringify(data));
    console.log("Mensagem enviada para " + chat_id + ".");
  }
}

// ---------- Supabase ----------
async function fetchExpenses() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/expenses?active=eq.true&select=*`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error("Supabase falhou (" + res.status + "): " + (await res.text()));
  return res.json();
}

// ---------- Principal ----------
async function main() {
  for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
    if (!v) { console.error("Falta a variável de ambiente:", k); process.exit(1); }
  }
  if (!dry && (!TELEGRAM_BOT_TOKEN || CHAT_IDS.length === 0)) {
    console.error("Faltam TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (ou usa DRY_RUN=1)."); process.exit(1);
  }

  const today = lisbonToday();
  const isMonday = lisbonWeekday() === "Mon";
  const expenses = await fetchExpenses();
  console.log(`Hoje (Lisboa): ${ddmm(today)}/${today.y} · ${expenses.length} despesas ativas · segunda-feira: ${isMonday}`);

  // 1) Avisos: "faltam X dias" e "é hoje"
  const today0 = [], soon = [];
  for (const e of expenses) {
    const lead = Math.max(0, Math.min(60, e.reminder_days_before ?? 7));
    for (const occ of occurrencesInRange(e, today, addDays(today, lead))) {
      const days = diffDays(today, occ);
      if (days === 0) today0.push({ e, occ });
      else if (days === lead && lead > 0) soon.push({ e, occ, days });
    }
  }

  if (today0.length || soon.length) {
    let msg = "💶 <b>Pagamentos</b>\n";
    if (today0.length) {
      msg += "\n🔴 <b>É HOJE</b>\n";
      for (const { e } of today0) msg += `• ${esc(e.name)} — <b>${eur(e.amount_cents)}</b>${e.category ? " · " + esc(e.category) : ""}\n`;
    }
    if (soon.length) {
      msg += "\n⏰ <b>A aproximar-se</b>\n";
      for (const { e, occ, days } of soon) msg += `• ${esc(e.name)} — <b>${eur(e.amount_cents)}</b> · dia ${ddmm(occ)} (faltam ${days} dias)\n`;
    }
    await sendTelegram(msg.trim());
  } else {
    console.log("Sem avisos para hoje.");
  }

  // 2) Resumo semanal (segundas)
  if (isMonday) {
    const rows = [];
    for (const e of expenses) for (const occ of occurrencesInRange(e, today, addDays(today, 30))) rows.push({ e, occ });
    rows.sort((a, b) => ymd(a.occ.y, a.occ.m, a.occ.d) - ymd(b.occ.y, b.occ.m, b.occ.d));
    let msg = "🗓️ <b>Resumo da semana</b>\nPróximos 30 dias:\n\n";
    if (!rows.length) {
      msg += "Sem pagamentos previstos. 🎉";
    } else {
      let total = 0;
      for (const { e, occ } of rows) { total += e.amount_cents; msg += `• ${ddmm(occ)} — ${esc(e.name)}: <b>${eur(e.amount_cents)}</b>\n`; }
      msg += `\n<b>Total: ${eur(total)}</b>`;
    }
    await sendTelegram(msg.trim());
  }
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

main().catch((err) => { console.error("ERRO:", err.message || err); process.exit(1); });
