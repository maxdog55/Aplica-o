/* =============================================================================
 *  Contas a Pagar — lógica da aplicação (PWA, sem build)
 *  Usa o Supabase (carregado por CDN em index.html) para dados + login.
 * ============================================================================= */
(function () {
  "use strict";

  // ---------- Elementos ----------
  const $ = (id) => document.getElementById(id);
  const screens = {
    setup: $("setup-notice"),
    auth: $("auth-screen"),
    app: $("app-screen"),
  };
  const loader = $("loader");

  // ---------- Estado ----------
  let sb = null;                 // cliente Supabase
  let session = null;            // sessão de autenticação
  let expenses = [];             // despesas do utilizador
  let authMode = "signin";       // "signin" | "signup"
  let calRef = todayParts();     // mês mostrado no calendário {y,m,d}
  let selectedDay = null;        // dia selecionado no calendário {y,m,d}

  // ===========================================================================
  //  Arranque
  // ===========================================================================
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const cfg = window.APP_CONFIG || {};
    const configured =
      cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes("SEU-PROJETO") &&
      !cfg.SUPABASE_ANON_KEY.includes("SUA_CHAVE");

    if (!configured) { show("setup"); registerSW(); return; }
    if (!window.supabase || !window.supabase.createClient) {
      show("auth");
      authError("Não foi possível carregar a biblioteca (sem ligação?). Tenta recarregar.");
      return;
    }

    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    wireEvents();
    registerSW();

    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((_e, s) => { session = s; onAuth(); });
    onAuth();
  }

  async function onAuth() {
    if (session) {
      $("settings-email").textContent = session.user.email || "—";
      show("app");
      await loadExpenses();
    } else {
      show("auth");
    }
  }

  // ===========================================================================
  //  Autenticação
  // ===========================================================================
  function wireAuth() {
    $("auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      authError("");
      const email = $("auth-email").value.trim();
      const password = $("auth-password").value;
      busy(true);
      try {
        if (authMode === "signup") {
          const { error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          // Se a confirmação de email estiver desligada, a sessão fica ativa logo.
          const { data } = await sb.auth.getSession();
          if (!data.session) authError("Conta criada. Confirma o email (ou desliga a confirmação no Supabase) e entra.");
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (err) {
        authError(traduzErro(err));
      } finally {
        busy(false);
      }
    });

    $("auth-toggle").addEventListener("click", () => {
      authMode = authMode === "signin" ? "signup" : "signin";
      $("auth-submit").textContent = authMode === "signup" ? "Criar conta" : "Entrar";
      $("auth-toggle").textContent = authMode === "signup" ? "Já tens conta? Entrar" : "Primeira vez? Criar conta";
      $("auth-password").setAttribute("autocomplete", authMode === "signup" ? "new-password" : "current-password");
      authError("");
    });
  }

  async function logout() {
    busy(true);
    await sb.auth.signOut();
    expenses = [];
    closeModal("modal-settings");
    busy(false);
  }

  // ===========================================================================
  //  Dados (CRUD)
  // ===========================================================================
  async function loadExpenses() {
    busy(true);
    const { data, error } = await sb
      .from("expenses").select("*").order("due_date", { ascending: true });
    busy(false);
    if (error) { alert("Erro a carregar: " + error.message); return; }
    expenses = data || [];
    renderAll();
  }

  async function saveExpense(payload, id) {
    busy(true);
    let res;
    if (id) res = await sb.from("expenses").update(payload).eq("id", id);
    else res = await sb.from("expenses").insert(payload);
    busy(false);
    if (res.error) { formError(res.error.message); return false; }
    await loadExpenses();
    return true;
  }

  async function removeExpense(id) {
    if (!confirm("Apagar este pagamento? Esta ação não pode ser anulada.")) return;
    busy(true);
    const { error } = await sb.from("expenses").delete().eq("id", id);
    busy(false);
    if (error) { formError(error.message); return; }
    closeModal("modal-form");
    await loadExpenses();
  }

  // ===========================================================================
  //  Render
  // ===========================================================================
  function renderAll() { renderList(); renderTotals(); renderCalendar(); }

  function renderTotals() {
    const t = todayParts();
    $("total-week").textContent = formatMoney(sumRange(t, addDays(t, 7)));
    $("total-month").textContent = formatMoney(sumRange(t, addDays(t, 30)));
  }

  function sumRange(start, end) {
    let cents = 0;
    for (const e of expenses) {
      if (!e.active) continue;
      for (const _ of occurrencesInRange(e, start, end)) cents += e.amount_cents;
    }
    return cents;
  }

  function renderList() {
    const t = todayParts();
    const end = addDays(t, 60);
    const rows = [];
    for (const e of expenses) {
      for (const occ of occurrencesInRange(e, t, end)) {
        rows.push({ e, occ, days: diffDays(t, occ) });
      }
    }
    rows.sort((a, b) => ymd(a.occ.y, a.occ.m, a.occ.d) - ymd(b.occ.y, b.occ.m, b.occ.d));

    const ul = $("lista");
    ul.innerHTML = "";
    $("lista-vazia").classList.toggle("hidden", rows.length > 0);
    for (const r of rows) ul.appendChild(itemEl(r.e, r.occ, r.days));
  }

  function itemEl(e, occ, days) {
    const li = document.createElement("li");
    li.className = "item" + (days === 0 ? " today" : days <= 7 ? " soon" : "") + (e.active ? "" : " inactive");
    let prazo;
    if (days === 0) prazo = `<span class="pill-today">É HOJE</span>`;
    else if (days === 1) prazo = `<span class="pill-soon">amanhã</span>`;
    else if (days <= 7) prazo = `<span class="pill-soon">faltam ${days} dias</span>`;
    else prazo = `faltam ${days} dias`;

    li.innerHTML = `
      <div class="when"><div class="day">${occ.d}</div><div class="mon">${shortMonth(occ.m)}</div></div>
      <div class="info">
        <div class="name">${escapeHtml(e.name)}${recBadge(e.recurrence)}</div>
        <div class="sub">${prazo}${e.category ? " · " + escapeHtml(e.category) : ""}${e.active ? "" : " · inativo"}</div>
      </div>
      <div class="amount">${formatMoney(e.amount_cents)}</div>`;
    li.addEventListener("click", () => openForm(e));
    return li;
  }

  function renderCalendar() {
    const { y, m } = calRef;
    $("cal-title").textContent = monthLabel(y, m);

    // ocorrências por dia neste mês
    const first = { y, m, d: 1 };
    const last = { y, m, d: daysInMonth(y, m) };
    const byDay = {};
    for (const e of expenses) {
      if (!e.active) continue;
      for (const occ of occurrencesInRange(e, first, last)) {
        (byDay[occ.d] = byDay[occ.d] || []).push(e);
      }
    }

    const grid = $("cal-grid");
    grid.innerHTML = "";
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // segunda = 0
    for (let i = 0; i < lead; i++) {
      const c = document.createElement("div");
      c.className = "cal-cell empty-cell";
      grid.appendChild(c);
    }
    const t = todayParts();
    for (let d = 1; d <= last.d; d++) {
      const cell = document.createElement("div");
      const has = byDay[d];
      cell.className = "cal-cell" + (has ? " has-pay" : "");
      if (t.y === y && t.m === m && t.d === d) cell.classList.add("today");
      if (selectedDay && selectedDay.y === y && selectedDay.m === m && selectedDay.d === d) cell.classList.add("selected");
      cell.innerHTML = `<span>${d}</span>` +
        (has ? `<span class="cal-dot"></span>${has.length > 1 ? `<span class="cal-count">${has.length}</span>` : ""}` : "");
      cell.addEventListener("click", () => { selectedDay = { y, m, d }; renderCalendar(); renderDayDetail(byDay[d] || []); });
      grid.appendChild(cell);
    }

    if (selectedDay && selectedDay.y === y && selectedDay.m === m) {
      renderDayDetail(byDay[selectedDay.d] || []);
    } else {
      $("cal-day-detail").classList.add("hidden");
    }
  }

  function renderDayDetail(list) {
    const box = $("cal-day-detail");
    if (!selectedDay) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    $("cal-day-title").textContent = fullDate(selectedDay);
    const ul = $("cal-day-list");
    ul.innerHTML = "";
    if (!list.length) {
      ul.innerHTML = `<li class="muted small">Sem pagamentos neste dia. Toca em ＋ para adicionar.</li>`;
      return;
    }
    for (const e of list) ul.appendChild(itemEl(e, selectedDay, diffDays(todayParts(), selectedDay)));
  }

  // ===========================================================================
  //  Modal de formulário
  // ===========================================================================
  function openForm(e) {
    formError("");
    const isEdit = !!e;
    $("form-title").textContent = isEdit ? "Editar pagamento" : "Novo pagamento";
    $("f-id").value = isEdit ? e.id : "";
    $("f-name").value = isEdit ? e.name : "";
    $("f-amount").value = isEdit ? (e.amount_cents / 100).toFixed(2) : "";
    $("f-date").value = isEdit ? e.due_date : toISO(selectedDay || todayParts());
    $("f-recurrence").value = isEdit ? e.recurrence : "yearly";
    $("f-reminder").value = isEdit ? e.reminder_days_before : 7;
    $("f-category").value = isEdit ? (e.category || "") : "";
    $("f-notes").value = isEdit ? (e.notes || "") : "";
    $("f-active").checked = isEdit ? e.active : true;
    $("form-delete").classList.toggle("hidden", !isEdit);
    $("form-delete").onclick = isEdit ? () => removeExpense(e.id) : null;
    openModal("modal-form");
    setTimeout(() => $("f-name").focus(), 50);
  }

  async function submitForm(ev) {
    ev.preventDefault();
    formError("");
    const cents = Math.round(parseFloat(String($("f-amount").value).replace(",", ".")) * 100);
    if (!isFinite(cents) || cents < 0) { formError("Indica um valor válido."); return; }
    const payload = {
      name: $("f-name").value.trim(),
      amount_cents: cents,
      due_date: $("f-date").value,
      recurrence: $("f-recurrence").value,
      reminder_days_before: Math.max(0, Math.min(60, parseInt($("f-reminder").value || "7", 10))),
      category: $("f-category").value.trim() || null,
      notes: $("f-notes").value.trim() || null,
      active: $("f-active").checked,
    };
    if (!payload.name) { formError("Indica um nome."); return; }
    if (!payload.due_date) { formError("Indica uma data."); return; }
    const ok = await saveExpense(payload, $("f-id").value || null);
    if (ok) closeModal("modal-form");
  }

  // ===========================================================================
  //  Eventos da UI
  // ===========================================================================
  function wireEvents() {
    wireAuth();
    $("expense-form").addEventListener("submit", submitForm);
    $("btn-add").addEventListener("click", () => openForm(null));
    $("form-close").addEventListener("click", () => closeModal("modal-form"));
    $("btn-settings").addEventListener("click", () => openModal("modal-settings"));
    $("settings-close").addEventListener("click", () => closeModal("modal-settings"));
    $("btn-logout").addEventListener("click", logout);
    $("cal-prev").addEventListener("click", () => { calRef = stepMonth(calRef, -1); selectedDay = null; renderCalendar(); });
    $("cal-next").addEventListener("click", () => { calRef = stepMonth(calRef, +1); selectedDay = null; renderCalendar(); });

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const name = tab.dataset.tab;
        $("tab-lista").classList.toggle("hidden", name !== "lista");
        $("tab-calendario").classList.toggle("hidden", name !== "calendario");
      });
    });

    // fechar modal ao tocar no fundo escuro
    document.querySelectorAll(".modal").forEach((m) => {
      m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
    });
  }

  // ===========================================================================
  //  Helpers de datas / recorrência  (espelhados em notifier/notify.mjs)
  // ===========================================================================
  function todayParts() { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
  function ymd(y, m, d) { return y * 10000 + m * 100 + d; }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function clampDay(y, m, d) { return Math.min(d, daysInMonth(y, m)); }
  function dateUTC(p) { return Date.UTC(p.y, p.m - 1, p.d); }
  function diffDays(a, b) { return Math.round((dateUTC(b) - dateUTC(a)) / 86400000); }
  function addDays(p, n) { const t = new Date(dateUTC(p) + n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function stepMonth(p, n) { let y = p.y, m = p.m + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return { y, m, d: 1 }; }
  function parseISO(s) { const a = s.split("-").map(Number); return { y: a[0], m: a[1], d: a[2] }; }
  function toISO(p) { return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }

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

  // ---------- Formatação ----------
  const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function shortMonth(m) { return MON[m - 1]; }
  function formatMoney(cents) { return (cents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" }); }
  function monthLabel(y, m) { return new Date(y, m - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" }); }
  function fullDate(p) { return new Date(p.y, p.m - 1, p.d).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }); }
  function recBadge(r) {
    const map = { once: "uma vez", monthly: "mensal", yearly: "anual" };
    return `<span class="badge">${map[r] || r}</span>`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- UI utils ----------
  function show(name) { Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name)); }
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }
  function busy(on) { loader.classList.toggle("hidden", !on); }
  function authError(msg) { const el = $("auth-error"); el.textContent = msg || ""; el.classList.toggle("hidden", !msg); }
  function formError(msg) { const el = $("form-error"); el.textContent = msg || ""; el.classList.toggle("hidden", !msg); }
  function traduzErro(err) {
    const m = (err && err.message) || String(err);
    if (/invalid login credentials/i.test(m)) return "Email ou palavra-passe errados.";
    if (/already registered|already exists/i.test(m)) return "Já existe uma conta com esse email. Entra normalmente.";
    if (/password should be at least/i.test(m)) return "A palavra-passe precisa de pelo menos 6 caracteres.";
    if (/email/i.test(m) && /valid/i.test(m)) return "Email inválido.";
    return m;
  }

  // ---------- Service worker ----------
  function registerSW() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
})();
