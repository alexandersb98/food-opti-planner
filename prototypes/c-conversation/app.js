/* Prototype C: Planning as a conversation. Throwaway code: one state object, string
   templates, a tiny keyed patcher for the thread so old cards keep their focus and
   don't re-animate. Nothing persists. */
(function () {
  "use strict";

  const D = window.MEAL_DATA;
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const attr = (id) => D.attributes.find((a) => a.id === id);
  const recipeById = (id) => D.recipes.find((r) => r.id === id);
  const fmtN = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("en-GB").replace(/,/g, " ");
  const fmtPortion = (p) => (p === 0.5 ? "½" : p === 1.5 ? "1½" : String(p)) + "×";

  /* ---------- icons ---------- */
  const IC = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
    sliders: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1"/><circle cx="16" cy="6" r="2.4"/><circle cx="10" cy="12" r="2.4"/><circle cx="18" cy="18" r="2.4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5V21h16"/>',
    leaf: '<path d="M11 20A7 7 0 014 13c0-6 7-10 16-10 0 9-4 16-10 16"/><path d="M4 21c4-6 8-9 12-11"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    basket: '<path d="M5 11l2 9h10l2-9"/><path d="M3 11h18M9 11l3-7 3 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  };
  const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
  const MARK = (cls = "who") => `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="10" fill="var(--accent)"/><path d="M8 15h16v2a7 7 0 01-7 7h-2a7 7 0 01-7-7z" fill="var(--on-accent)"/><rect x="6" y="12.5" width="20" height="3" rx="1.5" fill="var(--on-accent)"/><path d="M13 10c0-1.6 1.6-1.6 1.6-3.4M18 10c0-1.6 1.6-1.6 1.6-3.4" stroke="var(--on-accent)" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`;

  /* ---------- dates ---------- */
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  }
  const TODAY = parseDate("2026-11-19");
  const NEXT_MONDAY = parseDate("2026-11-23");

  /* ---------- state ---------- */
  const S = {
    view: "home",
    stack: [],
    sched: clone(D.plan.schedule),
    goals: clone(D.plan.goals),
    filters: clone(D.plan.tagFilters),
    maxSeconds: D.plan.maxSeconds,
    clashDemo: false,
    answered: { days: false, goals: false, recipes: false },
    active: "days",
    goalsChanged: false,
    goalsEditMode: false,
    editing: null, // { id, ctx }
    deck: { order: [], pos: 0, yes: new Set(), no: new Set(), history: [], skippedAll: false },
    tail: [],
    sheet: null,
    sheetDirty: false,
    search: "",
    catSearch: "",
    editor: null,
    imp: null,
    week: { expanded: null },
    saved: false,
  };
  let seq = 0;
  const nid = () => ++seq;
  const seen = new Set();

  const dayDate = (i, start = S.sched.start) => addDays(parseDate(start), i);
  const dayShort = (i, start) => { const d = dayDate(i, start); return `${DOW[d.getDay()]} ${d.getDate()}`; };
  const weekNo = () => isoWeek(parseDate(S.sched.start));
  function rangeLabel() {
    const a = dayDate(0), b = dayDate(S.sched.days - 1);
    const am = a.getMonth() !== b.getMonth() ? " " + MON[a.getMonth()] : "";
    return `${DOW[a.getDay()]} ${a.getDate()}${am} – ${DOW[b.getDay()]} ${b.getDate()} ${MON[b.getMonth()]}`;
  }
  const isSkipped = (i, meal) => (S.sched.skipped[i] || []).includes(meal);
  const plannedOn = (i) => S.sched.meals.filter((m) => !isSkipped(i, m)).length;
  function mealCount() { let n = 0; for (let i = 0; i < S.sched.days; i++) n += plannedOn(i); return n; }
  function skippedCount() { let n = 0; for (let i = 0; i < S.sched.days; i++) n += S.sched.meals.length - plannedOn(i); return n; }

  const neverTags = () => S.filters.filter((f) => f.mode === "never").map((f) => f.tag);
  const pool = () => D.recipes.filter((r) => !r.tags.some((t) => neverTags().includes(t)));

  /* ---------- goals ---------- */
  const SCOPE = { day: "each day", daily_average: "daily average", plan_total: "plan total" };
  const SCOPE_BTN = { day: "Each day", daily_average: "Daily average", plan_total: "Plan total" };
  function goalRange(g) {
    const u = attr(g.attribute).unit;
    if (g.min != null && g.max != null) return `${fmtN(g.min)}–${fmtN(g.max)} ${u}`;
    if (g.min != null) return `at least ${fmtN(g.min)} ${u}`;
    if (g.max != null) return `at most ${fmtN(g.max)} ${u}`;
    return "no limit yet";
  }
  const impDots = (n) => `<span class="imp" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</span>`;
  const strictBadge = (g) => g.strictness === "must"
    ? `<span class="badge must">Must</span>`
    : `<span class="badge prefer" title="Importance ${g.importance} of 5">Prefer ${impDots(g.importance || 3)}<span class="sr-only">, importance ${g.importance || 3} of 5</span></span>`;
  const mustCount = () => S.goals.filter((g) => g.strictness === "must").length;
  const isClash = () => {
    const e = S.goals.find((g) => g.id === "g1"), c = S.goals.find((g) => g.id === "g5");
    return S.clashDemo && e && c && e.strictness === "must" && c.strictness === "must";
  };
  function setClashDemo(on) {
    S.clashDemo = on;
    const c = S.goals.find((g) => g.id === "g5");
    if (c) {
      if (on) { c.strictness = "must"; c.max = 450; }
      else { c.strictness = "prefer"; c.max = 650; c.importance = c.importance || 5; }
    }
  }

  function evalGoal(g) {
    const R = D.result, n = R.days.length, a = g.attribute, u = attr(a).unit;
    const ok = (v) => (g.min == null || v >= g.min - 1e-9) && (g.max == null || v <= g.max + 1e-9);
    const nm = attr(a).name;
    if (g.scope === "day") {
      const vals = R.days.map((d) => d.totals[a]);
      const bad = vals.map((v, i) => ({ v, i })).filter((x) => !ok(x.v));
      const met = bad.length === 0;
      let plain = "";
      if (!met) {
        const under = g.min != null && bad.some((x) => x.v < g.min);
        const worst = bad.reduce((w, x) => (under ? (x.v < w.v ? x : w) : (x.v > w.v ? x : w)), bad[0]);
        plain = `${nm} was ${under ? "under " + fmtN(g.min) : "over " + fmtN(g.max)} ${u} on ${bad.length} of ${n} days. ${under ? "Lowest" : "Highest"}: ${DOW_LONG[dayDate(worst.i).getDay()]}, ${fmtN(worst.v)} ${u}.`;
      }
      return { met, short: `${n - bad.length} of ${n} days`, plain };
    }
    const v = g.scope === "plan_total" ? R.planTotals[a] : R.planTotals[a] / n;
    const met = ok(v);
    const per = g.scope === "daily_average" ? " a day" : " in total";
    let plain = "";
    if (!met) plain = `${nm} came to ${fmtN(v)} ${u}${per}; the goal is ${goalRange(g)}.`;
    return { met, short: `${fmtN(v)} ${u}${g.scope === "daily_average" ? "/day" : ""}`, plain };
  }

  /* ---------- rendering helpers ---------- */
  function patchList(container, items) {
    const existing = new Map();
    for (const n of container.children) existing.set(n.dataset.key, n);
    let prev = null;
    const fresh = [];
    for (const it of items) {
      let node = existing.get(it.key);
      if (!node || node._html !== it.html) {
        const t = document.createElement("template");
        t.innerHTML = it.html.trim();
        const nn = t.content.firstElementChild;
        nn.dataset.key = it.key;
        nn._html = it.html;
        if (!seen.has(it.key)) { seen.add(it.key); if (!RM) nn.classList.add("enter"); fresh.push(nn); }
        if (node) node.replaceWith(nn);
        node = nn;
      }
      existing.delete(it.key);
      const want = prev ? prev.nextElementSibling : container.firstElementChild;
      if (want !== node) container.insertBefore(node, want);
      prev = node;
    }
    existing.forEach((n) => n.remove());
    return fresh;
  }
  function keepFocus(fn) {
    const a = document.activeElement;
    const id = a && a.id;
    const sel = a && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
    fn();
    if (id) {
      const el = document.getElementById(id);
      if (el && el !== document.activeElement) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange && el.type !== "number" && el.type !== "date" && el.type !== "range") { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } }
      }
    }
  }
  function scrollToNode(n) {
    if (!n) return;
    requestAnimationFrame(() => n.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }));
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const bot = (inner, ghost = false) => `<div class="bot">${MARK("who" + (ghost ? " ghost" : ""))}<div>${inner}</div></div>`;
  const stepper = (id, act, value, label, min, max, extra = "") =>
    `<span class="stepper" role="group" aria-label="${esc(label)}">
      <button type="button" id="${id}-dec" data-action="${act}" data-d="-1" ${extra} aria-label="Fewer: ${esc(label)}" ${value <= min ? "disabled" : ""}>${icon("minus")}</button>
      <output aria-live="polite">${esc(value)}</output>
      <button type="button" id="${id}-inc" data-action="${act}" data-d="1" ${extra} aria-label="More: ${esc(label)}" ${value >= max ? "disabled" : ""}>${icon("plus")}</button>
    </span>`;

  /* ---------- top bar ---------- */
  function renderTopbar() {
    const tb = $("#topbar");
    const avatar = `<button class="avatar" type="button" data-action="menu" aria-label="Menu: recipes, ingredients, tags, settings" aria-haspopup="dialog"><span>A</span></button>`;
    const backBtn = (label = "Back") => `<button class="icon-btn" type="button" data-action="back" aria-label="${label}">${icon("back")}</button>`;
    let html = "";
    switch (S.view) {
      case "home":
        html = `<div class="brand title">${MARK("mark")}<span>Meal plan</span></div>${avatar}`;
        break;
      case "thread":
        html = `${backBtn("Back to home")}<div class="title">Plan week ${weekNo()}<small>${esc(rangeLabel())}</small></div>
          <button class="pill-btn" type="button" data-action="open-plan-sheet" aria-haspopup="dialog">${icon("sliders")}<span>Edit directly</span></button>${avatar}`;
        break;
      case "editor":
        html = `<button class="icon-btn" type="button" data-action="editor-close" aria-label="Close without saving">${icon("close")}</button>
          <div class="title">Edit recipe<small>${esc(S.editor.r.name || "New recipe")}</small></div>
          <button class="btn primary small" type="button" data-action="editor-save">Save</button>`;
        break;
      case "import":
        html = `${backBtn()}<div class="title">Import from link<small>The assistant reads the page for you</small></div>${avatar}`;
        break;
      case "week":
        html = `${backBtn()}<div class="title">Week 47<small>In use · Mon 16 – Sun 22 Nov</small></div>${avatar}`;
        break;
      default: {
        const t = { recipes: "Recipes", ingredients: "Ingredients", tags: "Tags", settings: "Settings", saved: "Saved plans" }[S.view];
        html = `${backBtn()}<div class="title">${t}</div>${avatar}`;
      }
    }
    tb.innerHTML = html;
  }

  /* ---------- home ---------- */
  function renderHome() {
    const greet = "Good evening"; // made-up "now": Thursday evening, on the couch
    const started = Object.values(S.answered).some(Boolean) || S.tail.length;
    const today = D.result.days[3]; // Thursday of week 47
    const results = homeSearchResults();
    return `
      <section class="home-greet">
        <h1>${greet}.<br><em>What's cooking</em> next week?</h1>
        <p>Thursday 19 November. Week 48 is still empty.</p>
      </section>

      <section class="hero" aria-labelledby="heroTitle">
        <svg class="plates" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="rgba(255,255,255,.12)"/><circle cx="60" cy="60" r="38" fill="rgba(255,255,255,.14)"/><circle cx="60" cy="60" r="20" fill="rgba(255,240,210,.35)"/></svg>
        <div class="eyebrow">Week ${weekNo()} · ${esc(rangeLabel())}</div>
        <h2 id="heroTitle">${started ? "Pick up where<br>you left off" : "Plan next week"}</h2>
        <p>Three quick questions, then the planner picks recipes and portions.</p>
        <div class="steps" aria-hidden="true"><span>Days</span><span>Goals</span><span>Recipes</span><span>Your week</span></div>
        <button class="btn" type="button" data-action="start-plan">${started ? "Continue planning" : "Plan next week"} ${icon("right")}</button>
      </section>

      <form class="search" role="search" data-action="noop" onsubmit="return false">
        <label class="sr-only" for="homeSearch">Search recipes and ingredients</label>
        ${icon("search")}
        <input id="homeSearch" type="search" placeholder="Search recipes, ingredients, tags" autocomplete="off" value="${esc(S.search)}" data-bind="search">
      </form>
      <div id="homeResults">${results}</div>

      <div class="section-h"><h2>This week</h2><button class="link-btn" type="button" data-action="go" data-view="saved">Saved plans</button></div>
      <article class="card week-card">
        <div class="row1"><h3>Week 47</h3><span class="chip-status">In use</span></div>
        <ul class="today-meals" aria-label="Today, Thursday 19">
          ${S.sched.meals.map((m, k) => {
            const slot = today.meals[k];
            if (!slot) return `<li><span class="meal-label">${esc(m)}</span><span class="hint">Eating out</span></li>`;
            const r = recipeById(slot[0]);
            return `<li><span class="meal-label">${esc(m)}</span><span class="swatch" style="--h:${r.hue}"></span><span>${esc(r.name)}${slot[1] !== 1 ? ` <b>${fmtPortion(slot[1])}</b>` : ""}</span></li>`;
          }).join("")}
        </ul>
        <div class="btn-row"><button class="btn soft small" type="button" data-action="go" data-view="week">Open week 47</button></div>
      </article>

      <div class="section-h"><h2>Kitchen</h2></div>
      <div class="quick">
        <button type="button" data-action="go" data-view="recipes"><span class="qi">${icon("book")}</span><span>Recipes<small>${D.recipes.length} recipes</small></span></button>
        <button type="button" data-action="go-import"><span class="qi">${icon("link")}</span><span>Import from link<small>The assistant reads it</small></span></button>
        <button type="button" data-action="go" data-view="ingredients"><span class="qi">${icon("basket")}</span><span>Ingredients<small>${D.ingredients.length} ingredients</small></span></button>
        <button type="button" data-action="go" data-view="tags"><span class="qi">${icon("tag")}</span><span>Tags<small>${D.tags.length} tags</small></span></button>
      </div>`;
  }
  function homeSearchResults() {
    const q = S.search.trim().toLowerCase();
    if (!q) return "";
    const rs = D.recipes.filter((r) => r.name.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q))).slice(0, 5);
    const is = D.ingredients.filter((i) => i.toLowerCase().includes(q)).slice(0, 3);
    if (!rs.length && !is.length) return `<p class="hint" style="padding:8px 6px">Nothing matches “${esc(S.search)}”.</p>`;
    return `<ul class="search-results" aria-label="Search results">
      ${rs.map((r) => `<li><button type="button" data-action="open-recipe" data-id="${r.id}"><span class="swatch" style="--h:${r.hue}"></span>${esc(r.name)}<span class="kind">Recipe</span></button></li>`).join("")}
      ${is.map((i) => `<li><button type="button" data-action="go" data-view="ingredients" data-q="${esc(i)}"><span class="qi">${icon("basket")}</span>${esc(i)}<span class="kind">Ingredient</span></button></li>`).join("")}
    </ul>`;
  }

  /* ---------- thread ---------- */
  const STEPS = ["days", "goals", "recipes"];
  const QUESTION = { days: "Which days?", goals: "Same goals as last week?", recipes: "Which recipes this week?" };

  function replyText(step) {
    if (step === "days") {
      const k = skippedCount();
      return `${rangeLabel()} · ${mealCount()} meals${k ? `, ${k} out` : ""}`;
    }
    if (step === "goals") return S.goalsChanged ? `Use my changes · ${S.goals.length} goals, ${mustCount()} Must` : `Keep them · ${S.goals.length} goals`;
    const n = pool().length, y = deckYesCount();
    return S.deck.skippedAll || y === n ? `Use all ${n} recipes` : `${y} of ${n} recipes`;
  }
  const deckYesCount = () => pool().filter((r) => S.deck.yes.has(r.id)).length;

  function threadItems() {
    const items = [];
    items.push({ key: "intro", html: bot(`<div class="bot-line">Let's plan <b>week ${weekNo()}</b>. Three quick questions, then I'll cook up the best mix of recipes and portions.</div>`) });
    for (const step of STEPS) {
      if (S.answered[step] && S.active !== step) {
        items.push({ key: step + "-q", html: bot(`<div class="collapsed-q">${QUESTION[step]}</div>`, true) });
        items.push({ key: step + "-a", html: `<div class="from-me"><button class="reply" type="button" data-action="jump" data-step="${step}" aria-label="${esc(QUESTION[step])} Your answer: ${esc(replyText(step))}. Tap to change."><span>${esc(replyText(step))}</span><span class="edit-hint">${icon("pencil")}Change</span></button></div>` });
      } else if (S.active === step) {
        const card = step === "days" ? daysCard() : step === "goals" ? goalsCard() : recipesCard();
        items.push({ key: step + "-card", html: bot(card) });
        return items;
      } else return items;
    }
    S.tail.forEach((ev, i) => items.push({ key: "ev" + ev.id, html: renderEvent(ev, i === S.tail.length - 1) }));
    return items;
  }

  function renderThread() {
    let th = $("#thread");
    if (!th) return;
    let fresh;
    keepFocus(() => { fresh = patchList(th, threadItems()); });
    if (fresh.length) scrollToNode(fresh[0]);
  }

  /* step 1: days */
  function daysCard() {
    const weeks = [0, 7, 14].map((off) => {
      const d = addDays(NEXT_MONDAY, off), e = addDays(d, 6);
      const am = d.getMonth() !== e.getMonth() ? " " + MON[d.getMonth()] : "";
      return { iso: iso(d), label: `Week ${isoWeek(d)}`, sub: `${d.getDate()}${am}–${e.getDate()} ${MON[e.getMonth()]}` };
    });
    return `<section class="qcard" aria-labelledby="q-days">
      <div class="step-tag">${icon("cal")} 1 of 3 · Days</div>
      <h2 id="q-days">Which days?</h2>
      <p class="sub">Tap a meal to skip it (eating out, not home). Tap a day to let the planner leave a meal empty.</p>
      <div class="week-pick" role="group" aria-label="Week">
        ${weeks.map((w, k) => `<button type="button" id="wk-${k}" data-action="pick-week" data-start="${w.iso}" aria-pressed="${S.sched.start === w.iso}">${w.label}<small>${w.sub}</small></button>`).join("")}
      </div>
      <div class="inline-fields">
        <label class="field-inline">Starts <input type="date" id="t-start" data-bind="start" value="${S.sched.start}"></label>
        <span class="field-inline">Days ${stepper("t-days", "days-step", S.sched.days, "Number of days", 1, 14)}</span>
      </div>
      ${schedGrid("t")}
      <div class="btn-row"><button class="btn primary" type="button" id="t-days-ok" data-action="answer" data-step="days">These days · ${mealCount()} meals</button></div>
    </section>`;
  }
  function schedGrid(p) {
    const m = S.sched.meals;
    let rows = "";
    for (let i = 0; i < S.sched.days; i++) {
      const al = S.sched.atLeast[i];
      const d = dayDate(i);
      rows += `<div class="sched-row" role="group" aria-label="${DOW_LONG[d.getDay()]} ${d.getDate()}">
        <button type="button" class="sched-day" id="${p}-day-${i}" data-action="cycle-atleast" data-day="${i}" aria-label="${DOW_LONG[d.getDay()]} ${d.getDate()}: ${al ? "at least " + al + " meals" : "all planned meals"}. Tap to change.">${dayShort(i)}${al ? `<small>at least ${al}</small>` : ""}</button>
        ${m.map((meal) => {
          const out = isSkipped(i, meal);
          return `<button type="button" class="slot${out ? " out" : ""}" id="${p}-s-${i}-${meal}" data-action="toggle-slot" data-day="${i}" data-meal="${esc(meal)}" aria-pressed="${!out}" aria-label="${esc(meal)} on ${DOW_LONG[d.getDay()]}: ${out ? "skipped" : "planned"}">${out ? "out" : icon("check")}</button>`;
        }).join("")}
      </div>`;
    }
    return `<div class="sched" style="--cols:${m.length}">
      <div class="sched-head" aria-hidden="true"><span></span>${m.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      ${rows}
      <div class="legend"><span><i class="l-in"></i>Plan this meal</span><span><i class="l-out"></i>Skip</span><span>${mealCount()} meals planned</span></div>
    </div>`;
  }

  /* step 2: goals */
  function goalChip(g, ctx) {
    const a = attr(g.attribute);
    const open = S.editing && S.editing.id === g.id && S.editing.ctx === ctx;
    return `<button type="button" class="goal-chip" id="${ctx}-gc-${g.id}" data-action="goal-open" data-id="${g.id}" data-ctx="${ctx}" aria-expanded="${open}">
      <span class="dot" style="--c:${a.colour}"></span>
      <span class="gtext"><b>${esc(g.name)}</b><small>${esc(a.name)} ${esc(goalRange(g))} · ${SCOPE[g.scope]}</small></span>
      ${strictBadge(g)}
    </button>`;
  }
  function goalEditor(g, ctx) {
    const p = `${ctx}-ge-${g.id}`;
    const bad = g.min != null && g.max != null && g.min > g.max;
    const none = g.min == null && g.max == null;
    const seg = (field, opts, cls = "") => `<div class="seg ${cls}" role="group">${opts.map(([v, l]) => `<button type="button" id="${p}-${field}-${v}" data-action="goal-set" data-id="${g.id}" data-field="${field}" data-val="${v}" aria-pressed="${g[field] === v}">${l}</button>`).join("")}</div>`;
    return `<div class="goal-editor" role="group" aria-label="Edit goal ${esc(g.name)}">
      <div class="fld"><label for="${p}-name">Goal name</label><input type="text" id="${p}-name" data-goal="${g.id}" data-field="name" value="${esc(g.name)}"></div>
      <div class="fld"><label for="${p}-attr">What to track</label><select id="${p}-attr" data-goal="${g.id}" data-field="attribute">${D.attributes.map((a) => `<option value="${a.id}" ${a.id === g.attribute ? "selected" : ""}>${a.name} (${a.unit})</option>`).join("")}</select></div>
      <div class="two">
        <div class="fld"><label for="${p}-min">Min</label><input type="number" inputmode="decimal" id="${p}-min" data-goal="${g.id}" data-field="min" value="${g.min ?? ""}" placeholder="none"></div>
        <div class="fld"><label for="${p}-max">Max</label><input type="number" inputmode="decimal" id="${p}-max" data-goal="${g.id}" data-field="max" value="${g.max ?? ""}" placeholder="none"></div>
      </div>
      ${bad ? `<div class="err" role="alert">Min must be at most the maximum.</div>` : ""}${none ? `<div class="err" role="alert">Give a minimum, a maximum or both.</div>` : ""}
      <div class="fld"><span class="lbl">Applies to</span>${seg("scope", [["day", "Each day"], ["daily_average", "Daily average"], ["plan_total", "Plan total"]])}</div>
      <div class="fld"><span class="lbl">How strict</span>${seg("strictness", [["must", "Must"], ["prefer", "Prefer"]], "strict")}
        <span class="hint">${g.strictness === "must" ? "A hard rule: no plan breaks it, even if that means no plan." : "A wish: the planner trades it off against the others by importance."}</span></div>
      ${g.strictness === "prefer" ? `<div class="fld range-wrap"><label for="${p}-imp">Importance · <span id="${p}-impv">${g.importance || 3}</span> of 5</label>
        <input type="range" min="1" max="5" step="1" id="${p}-imp" data-goal="${g.id}" data-field="importance" value="${g.importance || 3}">
        <div class="range-ticks" aria-hidden="true"><span>Nice to have</span><span>Very important</span></div></div>` : ""}
      <div class="btn-row" style="margin-top:0">
        <button type="button" class="btn dark small" id="${p}-done" data-action="goal-done">Done</button>
        <button type="button" class="btn danger small" data-action="goal-remove" data-id="${g.id}">${icon("trash")}Remove</button>
      </div>
    </div>`;
  }
  function goalsList(ctx) {
    return S.goals.map((g) => goalChip(g, ctx) + (S.editing && S.editing.id === g.id && S.editing.ctx === ctx ? goalEditor(g, ctx) : "")).join("");
  }
  function goalsCard() {
    const edit = S.goalsEditMode;
    return `<section class="qcard" aria-labelledby="q-goals">
      <div class="step-tag">${icon("sparkle")} 2 of 3 · Goals</div>
      <h2 id="q-goals">Same goals as last week?</h2>
      <p class="sub"><b>Must</b> is a hard rule. <b>Prefer</b> is a wish, weighed by importance.${edit ? " Tap a goal to change it." : ""}</p>
      <div class="goal-list">${goalsList("t")}</div>
      ${edit ? `<button type="button" class="link-btn" data-action="goal-add" data-ctx="t">+ Add goal</button>` : ""}
      <label class="check" style="margin-top:12px"><input type="checkbox" id="t-clash" data-bind="clash" ${S.clashDemo ? "checked" : ""}>
        <span>Prototype: make “Weekly budget” a Must at most 450 kr, so the next plan has a clash.</span></label>
      <div class="btn-row">
        ${edit
          ? `<button type="button" class="btn primary" data-action="answer" data-step="goals" data-changed="1">Use these goals</button>`
          : `<button type="button" class="btn primary" data-action="answer" data-step="goals">Keep them</button>
             <button type="button" class="btn ghost" data-action="goals-change">Change…</button>`}
      </div>
    </section>`;
  }

  /* step 3: recipes (swipe deck) */
  function syncDeck() {
    const ids = pool().map((r) => r.id);
    if (ids.join() !== S.deck.order.join()) {
      S.deck = { order: ids, pos: 0, yes: new Set(), no: new Set(), history: [], skippedAll: false };
    }
  }
  function recipesCard() {
    syncDeck();
    const P = pool();
    const nv = neverTags();
    const hidden = D.recipes.length - P.length;
    const only = S.filters.filter((f) => f.mode === "only");
    const d = S.deck;
    const done = d.pos >= d.order.length;
    const note = `<div class="note">${icon("ban")}<span>${nv.length ? `<b>Never: ${nv.map(esc).join(", ")}</b>, so ${hidden} recipe${hidden === 1 ? " isn't" : "s aren't"} shown.` : "No Never filters."}${only.map((f) => ` <b>Only: ${esc(f.tag)}</b>${f.note ? ` for ${esc(f.note)}` : ""}.`).join("")}</span></div>`;
    const dots = `<span class="count-dots" aria-hidden="true">${d.order.map((id) => `<i class="${d.yes.has(id) ? "y" : d.no.has(id) ? "n" : ""}"></i>`).join("")}</span>`;
    let body;
    if (!done) {
      const cards = d.order.slice(d.pos, d.pos + 3).map((id, k) => swipeCard(recipeById(id), k)).reverse().join("");
      const cur = recipeById(d.order[d.pos]);
      body = `<div class="deck-wrap">
        <div class="deck-meta">${dots}<span>${d.pos + 1} of ${d.order.length}</span></div>
        <div class="deck" id="deck" tabindex="0" role="group" aria-roledescription="card deck" aria-label="Recipe ${d.pos + 1} of ${d.order.length}: ${esc(cur.name)}. Right arrow: yes, this week. Left arrow: not this week.">${cards}</div>
        <div class="deck-ctrl">
          <button type="button" class="round no" id="deck-no" data-action="deck" data-dir="no" aria-label="Not this week: ${esc(cur.name)}">${icon("close")}</button>
          <button type="button" class="round undo" id="deck-undo" data-action="deck-undo" aria-label="Undo last card" ${d.history.length ? "" : "disabled"}>${icon("undo")}</button>
          <button type="button" class="round yes" id="deck-yes" data-action="deck" data-dir="yes" aria-label="Yes, this week: ${esc(cur.name)}">${icon("check")}</button>
        </div>
        <div style="text-align:center"><button type="button" class="link-btn" data-action="deck-all">Skip, use all ${d.order.length}</button></div>
      </div>`;
    } else {
      const ys = d.order.filter((id) => d.yes.has(id)), ns = d.order.filter((id) => !d.yes.has(id));
      const chip = (id, on) => `<button type="button" class="chip" id="pk-${id}" data-action="deck-toggle" data-id="${id}" aria-pressed="${on}">${on ? icon("check", "x") : ""}${esc(recipeById(id).name)}</button>`;
      body = `<div class="picked">
        <div class="deck-meta">${dots}<span><b>${ys.length} of ${d.order.length}</b> in</span></div>
        ${ys.length ? `<h3>In this week</h3><div class="chips">${ys.map((id) => chip(id, true)).join("")}</div>` : ""}
        ${ns.length ? `<h3>Not this week · tap to bring back</h3><div class="chips">${ns.map((id) => chip(id, false)).join("")}</div>` : ""}
        ${ys.length < 4 ? `<div class="note warn">${icon("alert")}<span>Few recipes means a repetitive week, and the goals may not fit.</span></div>` : ""}
        <div class="btn-row">
          <button type="button" class="btn primary" data-action="answer" data-step="recipes" ${ys.length ? "" : "disabled"}>Use these ${ys.length}</button>
          <button type="button" class="btn ghost" data-action="deck-reset">Go through again</button>
        </div>
      </div>`;
    }
    return `<section class="qcard" aria-labelledby="q-rec">
      <div class="step-tag">${icon("book")} 3 of 3 · Recipes</div>
      <h2 id="q-rec">Which recipes this week?</h2>
      <p class="sub">Swipe right for yes, left for not this week. Or use the buttons.</p>
      ${note}
      <div style="height:12px"></div>
      ${body}
    </section>`;
  }
  function swipeCard(r, depth) {
    const per = r.per;
    return `<article class="swipe-card${depth === 0 ? " top" : ""}" data-depth="${depth}" data-id="${r.id}" style="--h:${r.hue}" ${depth ? 'aria-hidden="true"' : ""}>
      <div class="sc-art"><span class="letter" aria-hidden="true">${esc(r.name[0])}</span>
        <div class="meta"><span>${r.minutes} min</span><span>Serves ${r.serves}</span></div></div>
      <div class="sc-body">
        <h3>${esc(r.name)}</h3>
        <div class="sc-tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
        <dl class="per" aria-label="Per portion">
          <div><dt>kcal</dt><dd>${per.energy}</dd></div>
          <div><dt>Protein</dt><dd>${per.protein} g</dd></div>
          <div><dt>Fibre</dt><dd>${per.fibre} g</dd></div>
          <div><dt>Cost</dt><dd>${per.cost} kr</dd></div>
        </dl>
      </div>
      <div class="stamp yes" aria-hidden="true">Yes</div>
      <div class="stamp no" aria-hidden="true">Not this week</div>
    </article>`;
  }
  function deckDecide(dir) {
    const d = S.deck;
    if (d.pos >= d.order.length) return;
    const id = d.order[d.pos];
    (dir === "yes" ? d.yes : d.no).add(id);
    d.history.push(id);
    d.pos++;
    renderThread();
    const deck = $("#deck");
    if (deck && document.activeElement === document.body) deck.focus({ preventScroll: true });
  }
  function fling(dir) {
    const card = $("#deck .swipe-card.top");
    if (!card || RM) return deckDecide(dir);
    card.classList.remove("dragging");
    card.style.transition = "transform .28s ease-in, opacity .28s";
    card.style.setProperty(dir === "yes" ? "--yes" : "--no", 1);
    card.style.transform = `translate(${dir === "yes" ? 140 : -140}%, 20px) rotate(${dir === "yes" ? 18 : -18}deg)`;
    card.style.opacity = "0";
    setTimeout(() => deckDecide(dir), 260);
  }
  // pointer drag on the top card (touch + mouse)
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const card = e.target.closest && e.target.closest("#deck .swipe-card.top");
    if (!card || e.button > 0) return;
    drag = { card, x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, moved: false };
    try { card.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // let the page scroll
    drag.moved = true;
    drag.dx = dx;
    const c = drag.card;
    c.classList.add("dragging");
    c.style.transform = `translate(${dx}px, ${dy * 0.15}px) rotate(${dx / 16}deg)`;
    c.style.setProperty("--yes", Math.max(0, Math.min(1, dx / 110)));
    c.style.setProperty("--no", Math.max(0, Math.min(1, -dx / 110)));
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { card, dx, moved } = drag;
    drag = null;
    if (!moved) return;
    if (Math.abs(dx) > 100) fling(dx > 0 ? "yes" : "no");
    else {
      card.classList.remove("dragging");
      card.style.transform = "";
      card.style.setProperty("--yes", 0);
      card.style.setProperty("--no", 0);
    }
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  /* ---------- the run (thinking) ---------- */
  let runTimer = null;
  const SIM_MS = 380; // one simulated solver second
  function thinkMessages() {
    const g1 = S.goals[0];
    return [
      `Reading ${deckYesCount() || pool().length} recipes and ${S.goals.length} goals…`,
      `Trying portion sizes from ½× to 1½×…`,
      g1 ? `Keeping ${attr(g1.attribute).name.toLowerCase()} at ${goalRange(g1)}…` : "Weighing the goals…",
      `Balancing protein across the week…`,
      `Working around ${skippedCount()} meals out…`,
      `Squeezing the week under budget…`,
      `Polishing the best mix…`,
    ];
  }
  function stopRun() { clearInterval(runTimer); runTimer = null; }
  function runPlan() {
    stopRun();
    const clash = isClash();
    const solve = D.result.solvedIn;
    const ev = { type: "thinking", id: nid(), state: "running", elapsed: 0, max: S.maxSeconds, msg: 0 };
    ev.endAt = clash ? Math.min(2.5, S.maxSeconds) : Math.min(solve, S.maxSeconds);
    ev.outcome = clash ? "clash" : S.maxSeconds < solve ? "time_ran_out" : "optimal";
    S.tail.push(ev);
    renderThread();
    const msgs = thinkMessages();
    runTimer = setInterval(() => {
      ev.elapsed = Math.min(ev.endAt, ev.elapsed + 100 / SIM_MS);
      const k = Math.floor(ev.elapsed / 1.7) % msgs.length;
      const st = document.getElementById("think-status-" + ev.id);
      if (k !== ev.msg) { ev.msg = k; if (st) st.innerHTML = `<span>${esc(msgs[k])}</span>`; }
      const bar = document.getElementById("think-bar-" + ev.id);
      if (bar) bar.style.width = (100 * ev.elapsed) / ev.max + "%";
      const el = document.getElementById("think-el-" + ev.id);
      if (el) el.textContent = `${Math.floor(ev.elapsed)} of ${ev.max} s`;
      if (ev.elapsed >= ev.endAt) {
        stopRun();
        ev.state = "done";
        if (ev.outcome === "clash") S.tail.push({ type: "clash", id: nid() });
        else S.tail.push({ type: "result", id: nid(), status: ev.outcome, secs: Math.round(ev.elapsed), expanded: null, confirm: false });
        renderAll();
      }
    }, 100);
  }
  function cancelRun() {
    const ev = S.tail[S.tail.length - 1];
    if (!ev || ev.type !== "thinking" || ev.state !== "running") return;
    stopRun();
    ev.state = "cancelled";
    S.tail.push({ type: "reply", id: nid(), text: "Cancel" });
    if (ev.elapsed >= 4 && ev.outcome !== "clash") S.tail.push({ type: "result", id: nid(), status: "stopped", secs: Math.floor(ev.elapsed), expanded: null, confirm: false });
    else S.tail.push({ type: "stopped", id: nid(), secs: Math.floor(ev.elapsed) });
    renderAll();
  }

  /* ---------- tail events ---------- */
  function renderEvent(ev, last) {
    const dis = last ? "" : "disabled";
    switch (ev.type) {
      case "reply":
        return `<div class="from-me"><div class="reply">${esc(ev.text)}</div></div>`;
      case "thinking": {
        if (ev.state !== "running") {
          const t = ev.state === "cancelled" ? `Stopped after ${Math.floor(ev.elapsed)} s` : ev.outcome === "clash" ? `Checked the rules in ${Math.round(ev.elapsed)} s` : `Worked for ${Math.round(ev.elapsed)} s`;
          return bot(`<div class="bot-line small">${icon(ev.state === "cancelled" ? "stop" : "clock")}${t}</div>`);
        }
        const msgs = thinkMessages();
        return bot(`<section class="qcard" aria-labelledby="th-${ev.id}" aria-busy="true">
          <div class="step-tag">${icon("clock")} Working</div>
          <h2 id="th-${ev.id}">Making your plan…</h2>
          <div class="thinking">
            <div class="pot" aria-hidden="true"><div class="orbit">${D.attributes.map((a) => `<i style="background:${a.colour}"></i>`).join("")}</div><div class="bowl"></div><i class="steam"></i><i class="steam s2"></i><i class="steam s3"></i></div>
            <div>
              <div class="think-status" id="think-status-${ev.id}"><span>${esc(msgs[ev.msg])}</span></div>
              <div class="progress" role="progressbar" aria-label="Solving time used" aria-valuemin="0" aria-valuemax="${ev.max}"><i id="think-bar-${ev.id}" style="width:${(100 * ev.elapsed) / ev.max}%"></i></div>
              <div class="think-meta"><span id="think-el-${ev.id}">${Math.floor(ev.elapsed)} of ${ev.max} s</span><span>max solving time</span></div>
            </div>
          </div>
          <div class="btn-row"><button type="button" class="btn ghost" id="cancel-${ev.id}" data-action="cancel-run">Cancel</button></div>
        </section>`);
      }
      case "result":
        return bot(`<section class="qcard" aria-labelledby="res-${ev.id}">
          <div class="step-tag">${icon("sparkle")} Your week</div>
          <h2 id="res-${ev.id}">Here's your week</h2>
          ${resultBody(ev, S.sched.start, `ev-${ev.id}`)}
          ${ev.confirm ? `<div class="confirm" role="alert"><p>Discard this plan?</p><span class="hint">This can't be undone.</span>
            <div class="btn-row"><button type="button" class="btn primary small" data-action="res-discard-yes" ${dis}>Discard</button><button type="button" class="btn ghost small" id="keep-${ev.id}" data-action="res-discard-no" ${dis}>Keep it</button></div></div>`
          : `<div class="btn-row">
            <button type="button" class="btn primary" data-action="res-save" ${dis}>Save</button>
            <button type="button" class="btn ghost" data-action="res-adjust" ${dis}>Adjust</button>
            <button type="button" class="btn ghost" data-action="res-discard" ${dis}>Discard</button>
          </div>`}
        </section>`);
      case "clash": {
        const musts = S.goals.filter((g) => g.strictness === "must");
        return bot(`<section class="qcard alert" aria-labelledby="cl-${ev.id}">
          <div class="step-tag">${icon("alert")} Can't be done</div>
          <h2 id="cl-${ev.id}">No plan possible</h2>
          <p class="sub">These rules can't all be met. Even the cheapest week that keeps energy at 1 500 kcal a day costs more than 450 kr.</p>
          <ul class="clash-list">
            ${musts.map((g) => `<li><div class="ct"><span><b>${esc(g.name)}</b><small>${esc(attr(g.attribute).name)} ${esc(goalRange(g))} · ${SCOPE[g.scope]}</small></span><span class="badge must">Must</span></div>
              <button type="button" class="btn soft small" data-action="clash-prefer" data-id="${g.id}" ${dis}>Make Prefer</button></li>`).join("")}
            <li><div class="ct"><span><b>Meals each day</b><small>All planned meals are served</small></span></div>
              <button type="button" class="btn soft small" data-action="jump" data-step="days" ${dis}>Edit schedule</button></li>
          </ul>
          <p class="hint">Clashes over the whole plan. Fixing these may show another clash.</p>
          <div class="btn-row">
            <button type="button" class="btn primary" data-action="retry" ${dis}>Try again</button>
            <button type="button" class="btn ghost" data-action="open-plan-sheet" ${dis}>Edit directly</button>
          </div>
        </section>`);
      }
      case "stopped":
        return bot(`<section class="qcard"><h2>Stopped before any plan was found.</h2>
          <p class="sub">Nothing was changed. Try again, or give it more time under Edit directly.</p>
          <div class="btn-row"><button type="button" class="btn primary" data-action="retry" ${dis}>Try again</button><button type="button" class="btn ghost" data-action="open-plan-sheet" ${dis}>Edit directly</button></div></section>`);
      case "saved":
        return bot(`<section class="qcard"><div class="step-tag">${icon("check")} Saved</div><h2>Saved as week ${weekNo()}</h2>
          <p class="sub">It starts ${DOW_LONG[dayDate(0).getDay()]} ${dayDate(0).getDate()} ${MON[dayDate(0).getMonth()]}. You'll find it on the home screen.</p>
          <div class="btn-row"><button type="button" class="btn primary" data-action="go-home" ${dis}>Back home</button><button type="button" class="btn ghost" data-action="use-today" ${dis}>Use for today</button></div></section>`);
      case "adjust":
        return bot(`<section class="qcard"><h2>What should change?</h2><p class="sub">I'll keep everything else and make the plan again.</p>
          <div class="chips">
            <button type="button" class="chip" data-action="jump" data-step="days" ${dis}>${icon("cal", "x")}Days and meals</button>
            <button type="button" class="chip" data-action="jump" data-step="goals" ${dis}>${icon("sparkle", "x")}Goals</button>
            <button type="button" class="chip" data-action="jump" data-step="recipes" ${dis}>${icon("book", "x")}Recipes</button>
            <button type="button" class="chip" data-action="open-plan-sheet" ${dis}>${icon("sliders", "x")}One number…</button>
            <button type="button" class="chip" data-action="retry" ${dis}>Just remake it</button>
          </div></section>`);
      case "discarded":
        return bot(`<section class="qcard"><h2>Discarded.</h2><p class="sub">Nothing was saved. Your answers are still here if you want another go.</p>
          <div class="btn-row"><button type="button" class="btn primary" data-action="retry" ${dis}>Make a new plan</button><button type="button" class="btn ghost" data-action="go-home" ${dis}>Home</button></div></section>`);
      case "changed":
        return bot(`<section class="qcard"><h2>Settings changed.</h2><p class="sub">The plan above was made with the old settings.</p>
          <div class="btn-row"><button type="button" class="btn primary" data-action="retry" ${dis}>Make the plan again</button></div></section>`);
      default:
        return `<div></div>`;
    }
  }

  function resultBody(ev, start, idp) {
    const R = D.result;
    const st = ev.status;
    const statusTxt = { optimal: `Best possible plan · found in ${ev.secs} s`, time_ran_out: `Time ran out at ${ev.secs} s: may not be the best plan`, stopped: `Stopped early: may not be the best plan` }[st];
    const evals = S.goals.map((g) => ({ g, r: evalGoal(g) }));
    const missed = evals.filter((x) => !x.r.met);
    const mustNames = S.goals.filter((g) => g.strictness === "must").map((g) => g.name);
    const dayGoals = S.goals.filter((g) => g.scope === "day");
    const days = R.days.map((d, i) => {
      const open = ev.expanded === i;
      const flags = dayGoals.filter((g) => { const v = d.totals[g.attribute]; return (g.min != null && v < g.min) || (g.max != null && v > g.max); });
      const names = d.meals.map((m) => (m ? recipeById(m[0]).name : "out")).join(" · ");
      const label = `${DOW_LONG[dayDate(i, start).getDay()]} ${dayDate(i, start).getDate()}`;
      return `<li>
        <button type="button" class="day-head" id="${idp}-d${i}" data-action="day-toggle" data-ev="${ev.id}" data-i="${i}" aria-expanded="${open}" aria-controls="${idp}-db${i}" aria-label="${label}: ${esc(names)}. ${d.totals.energy} kcal${flags.length ? ". Missed: " + flags.map((g) => g.name).join(", ") : ""}">
          <span class="dn">${DOW[dayDate(i, start).getDay()]}<small>${dayDate(i, start).getDate()} ${MON[dayDate(i, start).getMonth()]}</small></span>
          <span class="mid"><span class="toks">${d.meals.map((m) => (m ? `<span class="tok" style="--h:${recipeById(m[0]).hue}">${m[1] !== 1 ? `<b>${fmtPortion(m[1])}</b>` : ""}</span>` : `<span class="tok out"></span>`)).join("")}</span>
            <span class="names">${esc(names)}</span></span>
          <span class="kc">${fmtN(d.totals.energy)}<small>kcal</small>${flags.length ? `<small class="flag">${flags.length} missed</small>` : ""}</span>
          ${icon("chev", "chev")}
        </button>
        ${open ? `<div class="day-body" id="${idp}-db${i}">
          ${S.sched.meals.map((mn, k) => {
            const m = d.meals[k];
            if (!m) return `<div class="meal-row"><span class="ml">${esc(mn)}</span><span class="out-txt">Skipped · eating out</span><span></span></div>`;
            const r = recipeById(m[0]);
            return `<div class="meal-row"><span class="ml">${esc(mn)}</span>
              <button type="button" class="mr" data-action="open-recipe" data-id="${r.id}"><span class="swatch" style="--h:${r.hue}"></span><span>${esc(r.name)}</span></button>
              <span class="portion${m[1] > 1 ? " up" : ""}" title="Portion size">${fmtPortion(m[1])}</span></div>`;
          }).join("")}
          <div class="bars" aria-label="Day totals">
            ${D.attributes.map((a) => {
              const v = d.totals[a.id];
              const g = dayGoals.find((x) => x.attribute === a.id) || S.goals.find((x) => x.attribute === a.id);
              const target = g && g.scope !== "plan_total" ? (g.min != null ? g.min : g.max) : null;
              const scaleMax = Math.max(v, target || 0) * 1.15 || 1;
              const miss = g && g.scope === "day" && ((g.min != null && v < g.min) || (g.max != null && v > g.max));
              return `<div class="bar"><span>${a.name}</span><span class="track"><span class="fill" style="--c:${a.colour};width:${(100 * v) / scaleMax}%"></span>${target != null ? `<span class="goalmark" style="left:${(100 * target) / scaleMax}%"></span>` : ""}</span><span class="v${miss ? " miss" : ""}">${fmtN(v)} ${a.unit}</span></div>`;
            }).join("")}
          </div>
        </div>` : ""}
      </li>`;
    }).join("");
    return `<div class="res-status${st === "optimal" ? "" : " warn"}">${icon(st === "optimal" ? "check" : "alert")}${statusTxt}</div>
      <div class="goal-strip" role="list" aria-label="Goals">
        ${evals.map(({ g, r }) => `<div class="gs${r.met ? "" : " miss"}" role="listitem"><span class="ok">${icon(r.met ? "check" : "minus")}</span><b>${esc(attr(g.attribute).name)}</b><small>${esc(r.short)} · ${r.met ? "met" : "missed"}${g.strictness === "must" ? " · Must" : ""}</small></div>`).join("")}
      </div>
      ${missed.length ? `<div class="missed"><h3>Missed ${missed.length === 1 ? "1 goal" : missed.length + " goals"}</h3><ul>
        ${missed.map(({ g, r }) => `<li>${esc(r.plain)}<small>${g.strictness === "must"
          ? `“${esc(g.name)}” is a Must goal. The real planner never breaks a Must; this prototype's result is made up.`
          : `“${esc(g.name)}” is a Prefer goal, importance ${g.importance} of 5${mustNames.length ? `, so the planner let it slip to keep ${mustNames.map((n) => "“" + esc(n) + "”").join(" and ")} (Must)` : ""}.`}</small></li>`).join("")}
      </ul></div>` : `<div class="note">${icon("check")}<span>All goals met.</span></div>`}
      <ul class="days" aria-label="Days">${days}</ul>
      <p class="hint" style="margin:8px 2px 0">Week total: ${fmtN(R.planTotals.energy)} kcal · ${fmtN(R.planTotals.protein)} g protein · ${fmtN(R.planTotals.cost)} kr. Tap a day for meals and portions.</p>`;
  }

  /* ---------- thread actions ---------- */
  function answer(step, el) {
    if (step === "goals") { S.goalsChanged = !!(el && el.dataset.changed) || S.goalsChanged; S.goalsEditMode = false; S.editing = null; }
    if (step === "recipes") S.deck.skippedAll = false;
    S.answered[step] = true;
    advance();
  }
  function advance() {
    const next = STEPS.find((s) => !S.answered[s]);
    S.active = next || null;
    if (!next) {
      renderThread();
      runPlan();
    } else renderThread();
    renderTopbar();
  }
  function jumpBack(step) {
    stopRun();
    S.tail = [];
    S.answered[step] = false;
    S.active = step;
    seen.delete(step + "-card");
    seen.delete(step + "-a");
    if (step === "goals") S.goalsEditMode = true;
    renderThread();
    const card = $(`[data-key="${step}-card"]`);
    scrollToNode(card);
  }
  function startPlanFromSheet() {
    closeSheet(false);
    syncDeck();
    if (!S.answered.recipes && S.deck.pos < S.deck.order.length) { S.deck.order.forEach((id) => S.deck.yes.add(id)); S.deck.pos = S.deck.order.length; S.deck.skippedAll = true; }
    STEPS.forEach((s) => (S.answered[s] = true));
    S.active = null;
    S.tail = [];
    if (S.view !== "thread") go("thread");
    renderThread();
    runPlan();
  }

  /* ---------- week view (saved, in use) ---------- */
  function renderWeekView() {
    const ev = { id: "w", status: "optimal", secs: D.result.solvedIn, expanded: S.week.expanded };
    return `<div style="padding-top:8px"><section class="qcard" style="border-radius:var(--r-lg)">
      <div class="step-tag">${icon("check")} In use · saved Sun 15 Nov</div>
      <h2>Week 47</h2>
      ${resultBody(ev, "2026-11-16", "wk")}
      <div class="btn-row"><button type="button" class="btn primary" data-action="use-today">Use for today</button><button type="button" class="btn ghost" data-action="start-plan">Plan next week</button></div>
    </section></div>`;
  }

  /* ---------- catalogue ---------- */
  function renderCatalog() {
    const q = S.catSearch.trim().toLowerCase();
    const search = (ph) => `<form class="search" role="search" onsubmit="return false" style="margin-top:6px"><label class="sr-only" for="catSearch">${ph}</label>${icon("search")}<input id="catSearch" type="search" placeholder="${ph}" value="${esc(S.catSearch)}" data-bind="catSearch" autocomplete="off"></form>`;
    if (S.view === "recipes") {
      const nv = neverTags();
      const list = D.recipes.filter((r) => !q || r.name.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)));
      return `${search("Search recipes")}
        <div class="btn-row" style="margin:8px 0 4px"><button type="button" class="btn primary small" data-action="open-recipe" data-id="new">${icon("plus")}New recipe</button><button type="button" class="btn ghost small" data-action="go-import">${icon("link")}Import from link</button></div>
        <ul class="cat-list" id="catList">${list.map((r) => {
          const blocked = r.tags.some((t) => nv.includes(t));
          return `<li><button type="button" class="cat-item${blocked ? " blocked" : ""}" data-action="open-recipe" data-id="${r.id}"><span class="swatch lg" style="--h:${r.hue}"></span>
            <span class="lbl"><b>${esc(r.name)}</b><small>${r.minutes} min · serves ${r.serves} · ${r.tags.map(esc).join(", ")}${blocked ? " · filtered out (Never)" : ""}</small></span>
            <span class="num">${r.per.energy}<br><small>kcal</small></span></button></li>`;
        }).join("") || `<li class="hint">No recipes match.</li>`}</ul>`;
    }
    if (S.view === "ingredients") {
      const list = D.ingredients.filter((i) => !q || i.toLowerCase().includes(q));
      return `${search("Search ingredients")}<ul class="list" style="margin-top:10px">${list.map((i) => `<li><button type="button" class="row btnrow" data-action="toast" data-msg="Ingredient pages aren't part of this prototype."><span class="lbl">${esc(i)}<small>per 100 g · used in ${1 + (i.length % 3)} recipes</small></span>${icon("right")}</button></li>`).join("") || `<li class="row hint">No ingredients match.</li>`}</ul>`;
    }
    if (S.view === "tags") {
      return `<p class="page-intro">Tags group recipes. Some come from the ingredients by a rule, such as “Vegetarian”.</p>
        <ul class="list">${D.tags.map((t) => {
          const n = D.recipes.filter((r) => r.tags.includes(t)).length;
          const f = S.filters.find((x) => x.tag === t);
          return `<li class="row"><span class="lbl"><b>${esc(t)}</b><small>${n} recipe${n === 1 ? "" : "s"}${f ? ` · plan filter: ${f.mode === "never" ? "Never" : "Only"}` : ""}</small></span>${icon("tag")}</li>`;
        }).join("")}</ul>`;
    }
    if (S.view === "saved") {
      return `<ul class="saved-list" style="margin-top:8px">${D.savedPlans.slice().reverse().map((p) => `<li><button type="button" data-action="${p.today ? "go" : "toast"}" data-view="week" data-msg="Only week 47 opens in this prototype."><span class="lbl" style="flex:1"><b>${p.label}</b><small>${p.days} days from ${p.start} · saved ${p.savedAt}</small></span>${p.today ? `<span class="chip-status">In use</span>` : ""}${icon("right")}</button></li>`).join("")}</ul>`;
    }
    // settings
    return `<div class="list-group"><h3>Language</h3><ul class="list">
        <li class="row"><span class="lbl">Language<small>Prototype: English only</small></span><div class="seg tiny" role="group" aria-label="Language"><button type="button" aria-pressed="true">English</button><button type="button" aria-pressed="false" data-action="toast" data-msg="Svenska comes with the real app.">Svenska</button></div></li></ul></div>
      <div class="list-group"><h3>Planning</h3><ul class="list">
        <li class="row"><span class="lbl">Default max solving time<small>Used for new plans</small></span>${stepper("set-max", "max-step", S.maxSeconds, "Max solving time in seconds", 5, 300)}</li>
        <li class="row"><span class="lbl">Meals each day<small>${S.sched.meals.map(esc).join(", ")}</small></span></li></ul></div>
      <div class="list-group"><h3>Look</h3><ul class="list"><li class="row"><span class="lbl">Light or dark<small>Follows your phone</small></span></li></ul></div>`;
  }

  /* ---------- recipe editor ---------- */
  const UNITS = ["g", "kg", "dl", "ml", "l", "tbsp", "tsp", "pcs", "cloves", "bunch"];
  function openEditor(id, opts = {}) {
    const r = clone(D.recipeDetail);
    let banner = null;
    if (id === "new") { r.name = ""; r.sections = [{ name: "Ingredients", lines: [] }]; r.instructions = [""]; r.tags = []; r.derivedTags = []; r.source = ""; }
    else if (id && id !== r.id) banner = `Prototype: every recipe opens the chickpea curry's contents. You tapped “${recipeById(id).name}”.`;
    if (opts.imported) banner = "Imported from example.com. The assistant matched 9 of 10 lines; check the one marked below.";
    S.editor = { r, editing: null, addTag: false, banner, isNew: id === "new" };
    go("editor");
  }
  function renderEditor() {
    const E = S.editor, r = E.r;
    const base = D.recipes.find((x) => x.id === "r9").per;
    const scale = 4 / r.serves;
    const lineHtml = (l, s, k) => {
      const key = `${s}-${k}`;
      const editing = E.editing === key;
      return `<li class="line${l.needsReview ? " review" : ""}">
        <button type="button" class="amt" id="ed-amt-${key}" data-action="line-edit" data-key="${key}" aria-expanded="${editing}" aria-label="Amount of ${esc(l.ingredient || "new line")}: ${l.amount} ${l.unit}. Tap to change."><b>${fmtN(l.amount)}</b> <span>${esc(l.unit)}</span></button>
        <input class="ing" id="ed-ing-${key}" list="ingList" value="${esc(l.ingredient)}" placeholder="Ingredient" aria-label="Ingredient" data-ed="ing" data-key="${key}">
        <button type="button" class="rm" data-action="line-remove" data-key="${key}" aria-label="Remove ${esc(l.ingredient || "line")}">${icon("close")}</button>
        ${l.note && !editing ? `<span class="conv">${esc(l.note)}</span>` : ""}
        ${editing ? `<div class="amt-edit">
            <label class="sr-only" for="ed-n-${key}">Amount</label><input type="number" inputmode="decimal" id="ed-n-${key}" value="${l.amount}" data-ed="amount" data-key="${key}" step="any" min="0">
            <label class="sr-only" for="ed-u-${key}">Unit</label><select id="ed-u-${key}" data-ed="unit" data-key="${key}">${UNITS.concat(UNITS.includes(l.unit) ? [] : [l.unit]).map((u) => `<option ${u === l.unit ? "selected" : ""}>${u}</option>`).join("")}</select>
            <button type="button" class="btn dark small" data-action="line-done">Done</button>
            <span class="hint">${convHint(l)}</span>
          </div>` : ""}
        ${l.needsReview ? `<div class="review-box"><p>${icon("alert")} <b>Needs review.</b> “${esc(l.unit)}” has no weight yet, so this line isn't in the totals.</p>
          <button type="button" class="btn dark small" data-action="fix-review" data-key="${key}">Use 1 ${esc(l.unit)} = 30 g</button>
          <button type="button" class="btn ghost small" data-action="line-edit" data-key="${key}">Change unit</button></div>` : ""}
      </li>`;
    };
    const allTags = [...new Set([...r.tags, ...r.derivedTags])];
    return `<datalist id="ingList">${D.ingredients.map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
      <form class="editor" onsubmit="return false" aria-label="Recipe editor">
        ${E.banner ? `<div class="ed-banner">${icon("info")}<span>${esc(E.banner)}</span></div>` : ""}
        <label class="sr-only" for="ed-name">Recipe name</label>
        <textarea class="name-input" id="ed-name" data-ed="name" rows="2" placeholder="Recipe name">${esc(r.name)}</textarea>
        <div class="meta-row">
          <span class="fld-inline">Serves ${stepper("ed-serves", "serves-step", r.serves, "Serves", 1, 20)}</span>
          <span class="fld-inline">${icon("clock")} ${r.minutes} min</span>
        </div>
        <p class="hint" style="margin:-6px 2px 0">Amounts are for the whole recipe.</p>

        ${r.sections.map((sec, s) => `<section class="ed-card" aria-label="Section ${esc(sec.name)}">
          <div class="sec-head"><label class="sr-only" for="ed-sec-${s}">Section name</label><input id="ed-sec-${s}" value="${esc(sec.name)}" data-ed="section" data-s="${s}">
            ${r.sections.length > 1 ? `<button type="button" class="icon-btn" data-action="section-remove" data-s="${s}" aria-label="Remove section ${esc(sec.name)}">${icon("trash")}</button>` : ""}</div>
          <ul class="lines">${sec.lines.map((l, k) => lineHtml(l, s, k)).join("") || `<li class="hint" style="padding:8px 0">No ingredients yet.</li>`}</ul>
          <button type="button" class="link-btn add-line" data-action="line-add" data-s="${s}">+ Add ingredient</button>
        </section>`).join("")}
        <button type="button" class="btn ghost" data-action="section-add">+ Add section</button>

        <section class="ed-card"><h2>Instructions</h2>
          <ol class="steps">${r.instructions.map((t, k) => `<li><label class="sr-only" for="ed-st-${k}">Step ${k + 1}</label><textarea id="ed-st-${k}" data-ed="step" data-k="${k}" rows="2">${esc(t)}</textarea></li>`).join("")}</ol>
          <button type="button" class="link-btn" data-action="step-add">+ Add step</button>
        </section>

        <section class="ed-card"><h2>Tags</h2>
          <div class="chips">${allTags.map((t) => r.derivedTags.includes(t)
            ? `<span class="chip derived" title="From the ingredients">${icon("leaf", "leaf")}${esc(t)}</span>`
            : `<button type="button" class="chip" data-action="tag-remove" data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">${esc(t)}${icon("close", "x")}</button>`).join("")}
            <button type="button" class="chip" id="ed-tag-add" data-action="tag-add-toggle" aria-expanded="${E.addTag}">${icon("plus", "x")}Tag</button></div>
          ${E.addTag ? `<div class="chips" style="margin-top:8px">${D.tags.filter((t) => !allTags.includes(t)).map((t) => `<button type="button" class="chip" data-action="tag-add" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
          <div class="tag-legend">${icon("leaf", "leaf")} From the ingredients, by each tag's rule. On automatically.</div>
        </section>

        <section class="ed-card"><h2>Portion size</h2>
          <div class="portion-row">
            ${["from", "to", "step"].map((f) => `<div class="fld"><span class="lbl">${{ from: "From", to: "To", step: "In steps of" }[f]}</span>${stepper("ed-p-" + f, "portion-step", r.portion[f] + "×", "Portion " + f, -1, 99, `data-f="${f}"`)}</div>`).join("")}
          </div>
          <p class="hint" style="margin:8px 0 0">The planner may serve ${fmtPortion(r.portion.from)} to ${fmtPortion(r.portion.to)} of a portion, in steps of ${r.portion.step}.</p>
        </section>

        <section class="ed-card"><h2>Per portion · 1 of ${r.serves}</h2>
          <dl class="totals">${D.attributes.map((a) => `<div style="--c:${a.colour}"><dt>${a.name}</dt><dd>${fmtN(Math.round(base[a.id] * scale * 10) / 10)} <small>${a.unit}</small></dd></div>`).join("")}
            <div style="--c:var(--ink-3)"><dt>Time</dt><dd>${r.minutes} <small>min</small></dd></div></dl>
          ${r.sections.some((s) => s.lines.some((l) => l.needsReview)) ? `<p class="hint" style="margin:8px 0 0">Not counted: 1 line that needs review.</p>` : ""}
        </section>

        <section class="ed-card"><h2>Source</h2>
          <div class="url-row"><label class="sr-only" for="ed-src">Source link</label><input type="url" id="ed-src" data-ed="source" value="${esc(r.source)}" placeholder="https://">
          ${r.source ? `<a class="btn ghost small" href="${esc(r.source)}" target="_blank" rel="noopener">Open</a>` : ""}</div>
        </section>

        <button type="button" class="btn danger" data-action="toast" data-msg="Prototype: deleting is not wired up.">${icon("trash")}Delete recipe</button>
      </form>`;
  }
  function convHint(l) {
    if (l.unit === "g" || l.unit === "kg") return "Weight: no conversion needed.";
    const m = l.note && l.note.match(/^1 (\S+) = /);
    if (m && (m[1] === l.unit || m[1] + "s" === l.unit)) return `Uses ${l.note}.`;
    if (["dl", "ml", "l"].includes(l.unit)) return "Uses 1 dl = 100 g (the ingredient's density).";
    return `No conversion for ${esc(l.unit)} yet. It will need review.`;
  }
  const lineAt = (key) => { const [s, k] = key.split("-").map(Number); return S.editor.r.sections[s].lines[k]; };

  /* ---------- import from link ---------- */
  const IMPORT_STEPS = [
    ["ok", "Opened example.com"],
    ["ok", "Found “Chickpea curry with brown rice”, serves 4"],
    ["ok", "10 ingredients in 2 sections, 4 steps"],
    ["ok", "Matched 9 lines to your ingredients"],
    ["warn", "1 line needs review: fresh coriander, 1 bunch"],
  ];
  function importItems() {
    const I = S.imp;
    const items = [{ key: "i-intro", html: bot(`<div class="bot-line">Paste a link to a recipe page. I'll read it and fill in a recipe for you to check. Nothing is saved until you press Save.</div>`) }];
    if (I.stage === "ask") {
      items.push({ key: "i-ask", html: bot(`<section class="qcard"><h2>Which page?</h2>
        <div class="url-row"><label class="sr-only" for="imp-url">Recipe link</label><input type="url" id="imp-url" value="${esc(I.url)}" data-bind="impUrl" placeholder="https://">
        <button type="button" class="btn primary" data-action="imp-read">Read</button></div></section>`) });
      return items;
    }
    items.push({ key: "i-url", html: `<div class="from-me"><div class="reply">${icon("link")}${esc(I.url)}</div></div>` });
    items.push({ key: "i-read", html: bot(`<section class="qcard" ${I.stage === "reading" ? 'aria-busy="true"' : ""}><h2>${I.stage === "reading" ? "Reading the page…" : "Read it."}</h2>
      <ul class="checklist">${IMPORT_STEPS.slice(0, I.n).map(([k, t]) => `<li><span class="ck${k === "warn" ? " warn" : ""}">${icon(k === "warn" ? "alert" : "check")}</span>${esc(t)}</li>`).join("")}
      ${I.stage === "reading" ? `<li><span class="ck spin"></span>Working…</li>` : ""}</ul></section>`) });
    if (I.stage === "done") {
      items.push({ key: "i-done", html: bot(`<section class="qcard"><div class="step-tag">${icon("sparkle")} Ready</div><h2>Have a look before saving</h2>
        <p class="sub">Amounts and units are as the page wrote them. Check the marked line.</p>
        <div class="btn-row"><button type="button" class="btn primary" data-action="imp-open">Open in the editor</button><button type="button" class="btn ghost" data-action="go-import">Another link</button></div></section>`) });
    }
    return items;
  }
  let impTimer;
  function renderImport() {
    const th = $("#impThread");
    if (!th) return;
    let fresh;
    keepFocus(() => { fresh = patchList(th, importItems()); });
    if (fresh.length) scrollToNode(fresh[0]);
  }

  /* ---------- sheets ---------- */
  function openSheet(kind) {
    S.sheet = kind;
    S.sheetDirty = false;
    S.sheetReturn = document.activeElement;
    $("#sheetLayer").hidden = false;
    renderSheet();
    const first = $("#sheet [data-autofocus]") || $("#sheet button");
    first && first.focus({ preventScroll: true });
  }
  function closeSheet(restore = true) {
    if (!S.sheet) return;
    const wasPlan = S.sheet === "plan";
    S.sheet = null;
    if (S.editing && S.editing.ctx === "sh") S.editing = null;
    $("#sheetLayer").hidden = true;
    $("#sheet").innerHTML = "";
    if (wasPlan && S.sheetDirty && S.view === "thread") {
      const last = S.tail[S.tail.length - 1];
      if (last && (last.type === "result" || last.type === "saved")) S.tail.push({ type: "changed", id: nid() });
      renderThread();
      renderTopbar();
    }
    if (restore && S.sheetReturn && document.contains(S.sheetReturn)) S.sheetReturn.focus({ preventScroll: true });
  }
  function renderSheet() {
    const sh = $("#sheet");
    if (!S.sheet) return;
    const body = sh.querySelector(".sheet-body");
    const st = body ? body.scrollTop : 0;
    keepFocus(() => { sh.innerHTML = S.sheet === "menu" ? sheetMenu() : sheetPlan(); });
    const nb = sh.querySelector(".sheet-body");
    if (nb) nb.scrollTop = st;
  }
  function sheetMenu() {
    const row = (act, view, ic, label, sub) => `<li><button type="button" class="row btnrow" data-action="${act}" ${view ? `data-view="${view}"` : ""}><span class="qi">${icon(ic)}</span><span class="lbl">${label}<small>${sub}</small></span>${icon("right")}</button></li>`;
    return `<div class="sheet-head"><h2 id="sheetTitle">Menu<small>Your kitchen</small></h2><button type="button" class="icon-btn" data-action="sheet-close" aria-label="Close menu" data-autofocus>${icon("close")}</button></div>
      <div class="sheet-body">
        <ul class="list menu-list" style="margin-top:8px">
          ${row("go", "recipes", "book", "Recipes", `${D.recipes.length} recipes`)}
          ${row("go", "ingredients", "basket", "Ingredients", `${D.ingredients.length} ingredients`)}
          ${row("go", "tags", "tag", "Tags", `${D.tags.length} tags`)}
          ${row("go", "saved", "cal", "Saved plans", "Week 46, week 47")}
          ${row("go", "settings", "gear", "Settings", "Language, defaults")}
        </ul>
        <ul class="list menu-list" style="margin-top:12px">
          ${row("start-plan", "", "sparkle", "Plan next week", `Week ${weekNo()}`)}
          ${row("go-import", "", "link", "Import from link", "The assistant reads a recipe page")}
          ${row("go-home", "", "right", "Home", "Greeting and this week")}
        </ul>
        <p class="hint" style="text-align:center;margin:14px 0 4px">Prototype C · made-up data · nothing is saved</p>
      </div>`;
  }
  function sheetPlan() {
    const P = pool();
    return `<div class="sheet-head"><h2 id="sheetTitle">Edit directly<small>Every setting as a plain list. The thread follows along.</small></h2>
        <button type="button" class="icon-btn" data-action="sheet-close" aria-label="Close" data-autofocus>${icon("close")}</button></div>
      <div class="sheet-body">
        <div class="list-group"><h3>Schedule</h3><ul class="list">
          <li class="row"><label class="lbl" for="sh-start">Starts<small>Week ${weekNo()}</small></label><input type="date" id="sh-start" data-bind="start" value="${S.sched.start}" style="min-height:44px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface);padding:0 8px"></li>
          <li class="row"><span class="lbl">Number of days<small>${esc(rangeLabel())}</small></span>${stepper("sh-days", "days-step", S.sched.days, "Number of days", 1, 14)}</li>
          <li class="row"><span class="lbl">Meals each day<small>${S.sched.meals.map(esc).join(", ")}</small></span><span class="val">${mealCount()} planned</span></li>
          <li class="row-block">${schedGrid("sh")}</li>
        </ul></div>

        <div class="list-group"><h3>Goals · ${S.goals.length}</h3><ul class="list">
          ${S.goals.map((g) => {
            const open = S.editing && S.editing.id === g.id && S.editing.ctx === "sh";
            return `<li><button type="button" class="row btnrow" id="sh-gc-${g.id}" data-action="goal-open" data-id="${g.id}" data-ctx="sh" aria-expanded="${open}">
              <span class="dot" style="width:10px;height:10px;border-radius:50%;background:${attr(g.attribute).colour}"></span>
              <span class="lbl">${esc(g.name)}<small>${esc(attr(g.attribute).name)} ${esc(goalRange(g))} · ${SCOPE[g.scope]}</small></span>${strictBadge(g)}</button>
              ${open ? `<div class="row-block">${goalEditor(g, "sh")}</div>` : ""}</li>`;
          }).join("")}
          <li><button type="button" class="row btnrow" data-action="goal-add" data-ctx="sh"><span class="lbl" style="color:var(--accent);font-weight:700">+ Add goal</span></button></li>
        </ul></div>

        <div class="list-group"><h3>Recipe filters</h3><ul class="list">
          ${D.tags.map((t) => {
            const f = S.filters.find((x) => x.tag === t);
            const mode = f ? f.mode : "any";
            return `<li class="row"><span class="lbl">${esc(t)}${f && f.note ? `<small>${esc(f.note)}</small>` : ""}</span>
              <div class="seg tiny" role="group" aria-label="Filter for ${esc(t)}">${["any", "only", "never"].map((m) => `<button type="button" id="sh-f-${t.replace(/\W/g, "")}-${m}" data-action="filter-set" data-tag="${esc(t)}" data-val="${m}" aria-pressed="${mode === m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div></li>`;
          }).join("")}
          <li class="row"><span class="lbl"><small>${P.length} of ${D.recipes.length} recipes can be used</small></span></li>
        </ul></div>

        <div class="list-group"><h3>Solving</h3><ul class="list">
          <li class="row"><span class="lbl">Max solving time<small>Stops here and keeps the best plan so far. Under 11 s, time runs out in this prototype.</small></span>${stepper("sh-max", "max-step", S.maxSeconds, "Max solving time in seconds", 5, 300)}</li>
        </ul></div>

        <div class="list-group"><h3>Prototype</h3><ul class="list">
          <li class="row"><label class="lbl" for="sh-clash">Next plan has a clash<small>Makes “Weekly budget” a Must at most 450 kr</small></label><span class="switch"><input type="checkbox" role="switch" id="sh-clash" data-bind="clash" ${S.clashDemo ? "checked" : ""}><span></span></span></li>
        </ul></div>
      </div>
      <div class="sheet-foot"><button type="button" class="btn primary block" data-action="sheet-make">Make plan</button></div>`;
  }

  /* ---------- navigation ---------- */
  function go(view) {
    if (view === S.view) return renderAll();
    S.stack.push(S.view);
    S.view = view;
    S.catSearch = "";
    renderAll(true);
  }
  function back() {
    const v = S.stack.pop() || "home";
    S.view = v === S.view ? "home" : v;
    renderAll(true);
  }
  function renderAll(fresh) {
    renderTopbar();
    const v = $("#view");
    if (S.view === "thread") {
      if (!$("#thread")) {
        v.innerHTML = `<div class="thread" id="thread" role="log" aria-live="polite" aria-relevant="additions" aria-label="Planning conversation"></div>`;
      }
      renderThread();
    } else if (S.view === "import") {
      if (!$("#impThread")) v.innerHTML = `<div class="thread" id="impThread" role="log" aria-live="polite" aria-relevant="additions" aria-label="Import conversation"></div>`;
      renderImport();
    } else {
      keepFocus(() => {
        v.innerHTML = S.view === "home" ? renderHome() : S.view === "editor" ? renderEditor() : S.view === "week" ? renderWeekView() : renderCatalog();
      });
    }
    if (fresh) {
      window.scrollTo(0, 0);
      v.scrollTop = 0;
      if (S.view === "thread") {
        const th = $("#thread");
        const last = th && th.lastElementChild;
        if (last && th.children.length > 2) scrollToNode(last);
      }
      v.focus({ preventScroll: true });
    }
    if (S.sheet) renderSheet();
  }
  // re-render whatever is on screen without resetting scroll
  const rerender = () => {
    renderTopbar();
    if (S.view === "thread") renderThread();
    else if (S.view === "import") renderImport();
    else renderAll();
    if (S.sheet) renderSheet();
  };

  /* ---------- events ---------- */
  const actions = {
    noop() {},
    menu() { openSheet("menu"); },
    "sheet-close"() { closeSheet(); },
    "sheet-make"() { startPlanFromSheet(); },
    "open-plan-sheet"() { openSheet("plan"); },
    back() { back(); },
    go(el) { closeSheet(false); const q = el.dataset.q; go(el.dataset.view); if (q) { S.catSearch = q; renderAll(); } },
    "go-home"() { closeSheet(false); S.stack = []; S.view = "home"; renderAll(true); },
    "start-plan"() { closeSheet(false); S.stack = ["home"]; S.view = "thread"; renderAll(true); },
    "go-import"() { closeSheet(false); clearInterval(impTimer); S.imp = { stage: "ask", url: "https://example.com/chickpea-curry", n: 0 }; ["i-ask", "i-url", "i-read", "i-done"].forEach((k) => seen.delete(k)); if (S.view === "import") { renderImport(); } else go("import"); },
    toast(el) { toast(el.dataset.msg); },
    "use-today"() { toast("Done. Today's meals now come from this plan."); },

    // days
    "pick-week"(el) { S.sched.start = el.dataset.start; S.sheetDirty = true; rerender(); },
    "days-step"(el) { S.sched.days = Math.max(1, Math.min(14, S.sched.days + Number(el.dataset.d))); S.sheetDirty = true; rerender(); },
    "toggle-slot"(el) {
      const i = Number(el.dataset.day), m = el.dataset.meal;
      const list = S.sched.skipped[i] || (S.sched.skipped[i] = []);
      const k = list.indexOf(m);
      if (k >= 0) list.splice(k, 1); else list.push(m);
      if (S.sched.atLeast[i] && S.sched.atLeast[i] >= plannedOn(i)) delete S.sched.atLeast[i];
      S.sheetDirty = true;
      rerender();
    },
    "cycle-atleast"(el) {
      const i = Number(el.dataset.day), p = plannedOn(i), cur = S.sched.atLeast[i];
      if (p <= 1) { toast("Plan at least two meals that day to use “at least”."); return; }
      const next = cur == null ? p - 1 : cur - 1;
      if (next < 1) delete S.sched.atLeast[i]; else S.sched.atLeast[i] = next;
      S.sheetDirty = true;
      rerender();
    },
    answer(el) { answer(el.dataset.step, el); },
    jump(el) { closeSheet(false); jumpBack(el.dataset.step); },

    // goals
    "goals-change"() { S.goalsEditMode = true; renderThread(); toast("Tap a goal to change it."); },
    "goal-open"(el) {
      const id = el.dataset.id, ctx = el.dataset.ctx;
      if (ctx === "t") S.goalsEditMode = true;
      S.editing = S.editing && S.editing.id === id && S.editing.ctx === ctx ? null : { id, ctx };
      rerender();
    },
    "goal-set"(el) {
      const g = S.goals.find((x) => x.id === el.dataset.id);
      g[el.dataset.field] = el.dataset.val;
      if (el.dataset.field === "strictness" && el.dataset.val === "prefer" && !g.importance) g.importance = 3;
      S.goalsChanged = true; S.sheetDirty = true;
      rerender();
    },
    "goal-done"() { const ctx = S.editing && S.editing.ctx; const id = S.editing && S.editing.id; S.editing = null; rerender(); const b = document.getElementById(`${ctx}-gc-${id}`); b && b.focus({ preventScroll: true }); },
    "goal-remove"(el) { const g = S.goals.find((x) => x.id === el.dataset.id); S.goals = S.goals.filter((x) => x !== g); S.editing = null; S.goalsChanged = true; S.sheetDirty = true; rerender(); toast(`Removed “${g.name}”.`); },
    "goal-add"(el) {
      const id = "g" + (100 + nid());
      S.goals.push({ id, name: "Less sugar", attribute: "energy", min: null, max: 2200, scope: "day", strictness: "prefer", importance: 3 });
      S.editing = { id, ctx: el.dataset.ctx }; S.goalsChanged = true; S.sheetDirty = true;
      rerender();
      const f = document.getElementById(`${el.dataset.ctx}-ge-${id}-name`); f && f.focus(); f && f.select();
    },

    // deck
    deck(el) { fling(el.dataset.dir); },
    "deck-undo"() { const d = S.deck; const id = d.history.pop(); if (!id) return; d.yes.delete(id); d.no.delete(id); d.pos--; renderThread(); },
    "deck-all"() { const d = S.deck; d.order.forEach((id) => { d.yes.add(id); d.no.delete(id); }); d.pos = d.order.length; d.skippedAll = true; S.answered.recipes = true; advance(); },
    "deck-toggle"(el) { const d = S.deck, id = el.dataset.id; if (d.yes.has(id)) { d.yes.delete(id); d.no.add(id); } else { d.no.delete(id); d.yes.add(id); } renderThread(); },
    "deck-reset"() { const ids = S.deck.order; S.deck = { order: ids, pos: 0, yes: new Set(), no: new Set(), history: [], skippedAll: false }; renderThread(); const k = $("#deck"); k && k.focus({ preventScroll: true }); },

    // run + result
    "cancel-run"() { cancelRun(); },
    retry(el) { S.tail.push({ type: "reply", id: nid(), text: el.textContent.trim() || "Try again" }); runPlan(); },
    "clash-prefer"(el) {
      const g = S.goals.find((x) => x.id === el.dataset.id);
      g.strictness = "prefer"; g.importance = g.importance || 5; S.goalsChanged = true;
      if (g.id === "g5" || g.id === "g1") S.clashDemo = false;
      S.tail.push({ type: "reply", id: nid(), text: `Make “${g.name}” Prefer` });
      runPlan();
    },
    "day-toggle"(el) {
      const id = el.dataset.ev, i = Number(el.dataset.i);
      if (id === "w") { S.week.expanded = S.week.expanded === i ? null : i; renderAll(); return; }
      const ev = S.tail.find((e) => String(e.id) === id);
      ev.expanded = ev.expanded === i ? null : i;
      renderThread();
    },
    "res-save"() { S.tail.push({ type: "reply", id: nid(), text: "Save it" }); S.tail.push({ type: "saved", id: nid() }); S.saved = true; renderThread(); toast(`Saved as week ${weekNo()}.`); },
    "res-adjust"() { S.tail.push({ type: "reply", id: nid(), text: "Adjust…" }); S.tail.push({ type: "adjust", id: nid() }); renderThread(); },
    "res-discard"() { const ev = S.tail[S.tail.length - 1]; ev.confirm = true; renderThread(); const k = document.getElementById("keep-" + ev.id); k && k.focus({ preventScroll: true }); },
    "res-discard-no"() { const ev = S.tail[S.tail.length - 1]; ev.confirm = false; renderThread(); },
    "res-discard-yes"() { S.tail.push({ type: "reply", id: nid(), text: "Discard" }); S.tail.push({ type: "discarded", id: nid() }); renderThread(); },

    // filters + max time
    "filter-set"(el) {
      const t = el.dataset.tag, m = el.dataset.val;
      S.filters = S.filters.filter((f) => f.tag !== t);
      if (m !== "any") S.filters.push({ tag: t, mode: m });
      S.sheetDirty = true;
      if (!S.answered.recipes || S.active === "recipes") syncDeck();
      rerender();
    },
    "max-step"(el) { S.maxSeconds = Math.max(5, Math.min(300, S.maxSeconds + 5 * Number(el.dataset.d))); S.sheetDirty = true; rerender(); },

    // recipes + editor
    "open-recipe"(el) { closeSheet(false); openEditor(el.dataset.id); },
    "editor-close"() { back(); },
    "editor-save"() { const n = S.editor.r.name.trim(); if (!n) { toast("Give the recipe a name first."); $("#ed-name").focus(); return; } back(); toast(`Saved “${n}”.`); },
    "serves-step"(el) { const r = S.editor.r; r.serves = Math.max(1, Math.min(20, r.serves + Number(el.dataset.d))); renderAll(); },
    "portion-step"(el) {
      const p = S.editor.r.portion, f = el.dataset.f, d = Number(el.dataset.d) * (f === "step" ? 0.25 : p.step);
      p[f] = Math.max(f === "step" ? 0.25 : p.step, Math.round((p[f] + d) * 100) / 100);
      if (p.from > p.to) p.to = p.from;
      renderAll();
    },
    "line-edit"(el) { const k = el.dataset.key; S.editor.editing = S.editor.editing === k ? null : k; renderAll(); const n = document.getElementById("ed-n-" + k); if (S.editor.editing && n) { n.focus(); n.select(); } },
    "line-done"() { const k = S.editor.editing; S.editor.editing = null; renderAll(); const b = document.getElementById("ed-amt-" + k); b && b.focus({ preventScroll: true }); },
    "line-remove"(el) { const [s, k] = el.dataset.key.split("-").map(Number); const l = S.editor.r.sections[s].lines.splice(k, 1)[0]; S.editor.editing = null; renderAll(); toast(`Removed ${l.ingredient || "line"}.`); },
    "line-add"(el) { const s = Number(el.dataset.s); const lines = S.editor.r.sections[s].lines; lines.push({ ingredient: "", amount: 1, unit: "pcs" }); renderAll(); const f = document.getElementById(`ed-ing-${s}-${lines.length - 1}`); f && f.focus(); },
    "fix-review"(el) { const l = lineAt(el.dataset.key); l.needsReview = false; l.note = `1 ${l.unit} = 30 g`; S.editor.editing = null; if (S.editor.banner && S.editor.banner.startsWith("Imported")) S.editor.banner = "Imported from example.com. All lines checked."; renderAll(); toast(`${l.ingredient} now counts as 30 g.`); },
    "section-add"() { S.editor.r.sections.push({ name: `Section ${S.editor.r.sections.length + 1}`, lines: [] }); renderAll(); const s = S.editor.r.sections.length - 1; const f = document.getElementById("ed-sec-" + s); f && (f.focus(), f.select()); },
    "section-remove"(el) { S.editor.r.sections.splice(Number(el.dataset.s), 1); renderAll(); },
    "step-add"() { S.editor.r.instructions.push(""); renderAll(); const f = document.getElementById("ed-st-" + (S.editor.r.instructions.length - 1)); f && f.focus(); },
    "tag-remove"(el) { S.editor.r.tags = S.editor.r.tags.filter((t) => t !== el.dataset.tag); renderAll(); },
    "tag-add-toggle"() { S.editor.addTag = !S.editor.addTag; renderAll(); },
    "tag-add"(el) { S.editor.r.tags.push(el.dataset.tag); S.editor.addTag = false; renderAll(); },

    // import
    "imp-read"() {
      const u = S.imp.url.trim();
      if (!/^https?:\/\//.test(u)) { toast("Enter a link that starts with http:// or https://."); return; }
      S.imp.stage = "reading"; S.imp.n = 0;
      renderImport();
      clearInterval(impTimer);
      impTimer = setInterval(() => {
        S.imp.n++;
        if (S.imp.n >= IMPORT_STEPS.length) { clearInterval(impTimer); S.imp.stage = "done"; }
        renderImport();
      }, RM ? 300 : 750);
    },
    "imp-open"() { S.stack = S.stack.filter((v) => v !== "import"); openEditor("r9", { imported: true }); },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    if (el.tagName === "FORM") return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });

  // inputs bound to state
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.goal) {
      const g = S.goals.find((x) => x.id === t.dataset.goal);
      const f = t.dataset.field;
      if (f === "min" || f === "max") g[f] = t.value === "" ? null : Number(t.value);
      else if (f === "importance") { g.importance = Number(t.value); const v = document.getElementById(t.id.replace(/-imp$/, "-impv")); v && (v.textContent = t.value); }
      else g[f] = t.value;
      S.goalsChanged = true; S.sheetDirty = true;
      return;
    }
    if (t.dataset.bind === "search") { S.search = t.value; $("#homeResults").innerHTML = homeSearchResults(); return; }
    if (t.dataset.bind === "catSearch") { S.catSearch = t.value; keepFocus(() => { $("#view").innerHTML = renderCatalog(); }); return; }
    if (t.dataset.bind === "impUrl") { S.imp.url = t.value; return; }
    if (t.dataset.ed && S.editor) {
      const r = S.editor.r;
      if (t.dataset.ed === "name") r.name = t.value;
      else if (t.dataset.ed === "ing") lineAt(t.dataset.key).ingredient = t.value;
      else if (t.dataset.ed === "amount") lineAt(t.dataset.key).amount = Number(t.value) || 0;
      else if (t.dataset.ed === "section") r.sections[Number(t.dataset.s)].name = t.value;
      else if (t.dataset.ed === "step") r.instructions[Number(t.dataset.k)] = t.value;
      else if (t.dataset.ed === "source") r.source = t.value;
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.goal) { if (t.dataset.field !== "importance") rerender(); return; }
    if (t.dataset.bind === "start") { if (t.value) { S.sched.start = t.value; S.sheetDirty = true; rerender(); } return; }
    if (t.dataset.bind === "clash") { setClashDemo(t.checked); S.goalsChanged = true; S.sheetDirty = true; rerender(); toast(t.checked ? "“Weekly budget” is now a Must, at most 450 kr." : "“Weekly budget” is back to Prefer, at most 650 kr."); return; }
    if (t.dataset.ed === "unit") { const l = lineAt(t.dataset.key); l.unit = t.value; if (l.needsReview && t.value === "g") l.needsReview = false; renderAll(); return; }
    if (t.dataset.ed === "amount" || t.dataset.ed === "ing") renderAll();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.sheet) { closeSheet(); return; }
    if (e.target.id === "deck" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); fling(e.key === "ArrowRight" ? "yes" : "no"); }
    if (e.key === "Tab" && S.sheet) { // keep focus inside the sheet
      const f = [...$("#sheet").querySelectorAll("button:not([disabled]), input, select, textarea, [tabindex]")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // hairline under the top bar once scrolled
  const onScroll = () => { const y = window.scrollY || $("#view").scrollTop; $("#topbar").classList.toggle("scrolled", y > 4); };
  window.addEventListener("scroll", onScroll, { passive: true });
  $("#view").addEventListener("scroll", onScroll, { passive: true });

  renderAll(true);
})();
