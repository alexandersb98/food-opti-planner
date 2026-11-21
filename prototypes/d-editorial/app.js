/* Prototype D: Editorial / cookbook. Throwaway; nothing persists. */
(function () {
  "use strict";
  const D = window.MEAL_DATA;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- state ----------
  const state = {
    schedule: clone(D.plan.schedule),
    goals: clone(D.plan.goals),
    filters: clone(D.plan.tagFilters),
    maxSeconds: D.plan.maxSeconds,
    demo: "optimal", // optimal | time_ran_out | clash
    result: clone(D.result),
    hasResult: true,
    saved: false,
    archive: clone(D.savedPlans),
    recipe: clone(D.recipeDetail),
    editing: false,
    snapshot: null,
    clashPrefer: {},
    theme: "auto",
    q: "",
    iq: "",
  };

  const PAGES = [
    { id: "plan", title: "This week’s brief", desc: "Schedule, goals, rules, time", section: "The brief" },
    { id: "menu", title: "The Menu", desc: "The composed week, course by course", section: "The Menu" },
    { id: "recipes", title: "The recipe index", desc: "Every dish, A to Z", section: "Recipes" },
    { id: "archive", title: "The archive", desc: "Saved plans", section: "Archive" },
    { id: "ingredients", title: "Ingredients", desc: "The larder, alphabetically", section: "Ingredients" },
    { id: "settings", title: "Settings", desc: "Edition, language, units", section: "Settings" },
  ];

  // ---------- helpers ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const dayDate = (i) => { const d = parseDate(state.schedule.start); d.setDate(d.getDate() + i); return d; };
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  };
  const issueLine = () => {
    const a = dayDate(0), b = dayDate(state.schedule.days - 1);
    const range = a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]}`
      : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
    return `Week ${isoWeek(a)} · ${range}`;
  };
  const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("en-GB");
  const frac = (p) => {
    const whole = Math.floor(p), rest = p - whole;
    const f = rest === 0.5 ? "½" : rest === 0.25 ? "¼" : rest === 0.75 ? "¾" : rest ? String(rest).slice(1) : "";
    return (whole ? whole : "") + f || "0";
  };
  const attr = (id) => D.attributes.find((a) => a.id === id);
  const recipe = (id) => D.recipes.find((r) => r.id === id);
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const word = (n) => words[n] || String(n);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const plateClass = (r) => "plate p" + (parseInt(String(r.id).replace(/\D/g, ""), 10) % 4);

  function rangeText(g, u) {
    if (g.min != null && g.max != null) return g.min === g.max ? `exactly ${fmt(g.min)} ${u}` : `between ${fmt(g.min)} and ${fmt(g.max)} ${u}`;
    if (g.min != null) return `at least ${fmt(g.min)} ${u}`;
    if (g.max != null) return `at most ${fmt(g.max)} ${u}`;
    return "no limit yet";
  }
  const scopeText = { day: "each day", daily_average: "as a daily average", plan_total: "over the whole plan" };
  function goalSentence(g) {
    const a = attr(g.attribute);
    const r = rangeText(g, a.unit);
    // "At least **100 g** protein, each day"
    const m = r.match(/^(between|at least|at most|exactly) (.*)$/);
    const lead = m ? cap(m[1]) : "";
    const val = m ? m[2] : r;
    return `${lead} <b>${esc(val)}</b> <span class="attr">${esc(a.name.toLowerCase())}</span>, ${scopeText[g.scope]}`;
  }
  function impDots(n) {
    return `<span class="imp" aria-label="Importance ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  }
  function usableRecipes(filters = state.filters) {
    return D.recipes.filter((r) => filters.every((f) => (f.mode === "never" ? !r.tags.includes(f.tag) : f.mode === "only" ? r.tags.includes(f.tag) : true)));
  }
  function isSkipped(day, meal) { return (state.schedule.skipped[day] || []).includes(meal); }
  function mealsPlanned() {
    let n = 0;
    for (let d = 0; d < state.schedule.days; d++) n += state.schedule.meals.filter((m) => !isSkipped(d, m)).length;
    return n;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- routing ----------
  let current = "plan";
  function route() {
    const h = location.hash.replace(/^#\/?/, "") || "plan";
    const [id, arg] = h.split("/");
    const prevIdx = pageIndex(current);
    current = id;
    const page = $("#page");
    page.classList.remove("enter-next", "enter-prev");
    void page.offsetWidth;
    page.classList.add(pageIndex(id) < prevIdx ? "enter-prev" : "enter-next");
    render(id, arg);
    window.scrollTo(0, 0);
    const p = PAGES.find((x) => x.id === id) || (id === "recipe" ? { section: "Recipes" } : PAGES[0]);
    $("#mastheadSection").textContent = p.section;
  }
  function pageIndex(id) { const i = PAGES.findIndex((p) => p.id === id); return i < 0 ? (id === "recipe" ? 2.5 : 0) : i; }
  function go(id) { if (location.hash === "#" + id) route(); else location.hash = id; }

  function render(id, arg) {
    const page = $("#page");
    const views = { plan: viewPlan, menu: viewMenu, recipes: viewRecipes, recipe: () => viewRecipe(arg), archive: viewArchive, ingredients: viewIngredients, settings: viewSettings };
    page.innerHTML = (views[id] || viewPlan)();
    const binders = { plan: bindPlan, menu: bindMenu, recipes: bindRecipes, recipe: () => bindRecipe(arg), archive: bindArchive, ingredients: bindIngredients, settings: bindSettings };
    (binders[id] || bindPlan)();
  }
  function rerender() { const h = location.hash.replace(/^#\/?/, "") || "plan"; const [id, arg] = h.split("/"); const y = window.scrollY; render(id, arg); window.scrollTo(0, y); }

  function turnLinks(id) {
    const i = PAGES.findIndex((p) => p.id === id);
    const prev = PAGES[i - 1], next = PAGES[i + 1];
    return `<nav class="turn" aria-label="Turn the page">
      ${prev ? `<a class="prev" href="#${prev.id}"><span class="kicker">← Previous</span><span class="t">${prev.title}</span></a>` : ""}
      ${next ? `<a class="next" href="#${next.id}"><span class="kicker">Next page →</span><span class="t">${next.title}</span></a>` : ""}
    </nav><p class="folio">— ${i + 1} —</p>`;
  }

  // ---------- PLAN: this week's brief ----------
  function viewPlan() {
    const s = state.schedule;
    const usable = usableRecipes();
    const nMust = state.goals.filter((g) => g.strictness === "must").length;
    return `
      <header class="cover">
        <p class="kicker">${issueLine()}</p>
        <h1 class="cover-title display">This week’s <em>brief</em></h1>
        <p class="standfirst">${cap(word(s.days))} days, ${word(s.meals.length)} meals a day — ${mealsPlanned()} to plan. ${cap(word(state.goals.length))} goals, ${word(nMust)} of them firm. ${cap(word(usable.length))} recipes in play.</p>
        <div class="cover-meta"><span class="kicker">In this brief</span><span class="kicker">01 Schedule · 02 Goals · 03 Rules · 04 Time</span></div>
      </header>

      <section class="section" aria-labelledby="s1">
        <div class="section-head"><span class="section-no">01</span><h2 class="section-title" id="s1">The schedule</h2>
          <button class="text-btn" type="button" id="editSchedule">Change</button></div>
        <p class="sched-line">From <b>${DAYS[dayDate(0).getDay()]} ${dayDate(0).getDate()} ${MONTHS[dayDate(0).getMonth()]}</b>, for <b>${word(s.days)} days</b>: ${s.meals.map(esc).join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>
        <div class="sched" style="--cols:${s.meals.length}" role="grid" aria-label="Meals to plan. Tap a meal to skip it.">
          <div class="sched-h" role="columnheader"><span class="visually-hidden">Day</span></div>
          ${s.meals.map((m) => `<div class="sched-h" role="columnheader">${esc(m)}</div>`).join("")}
          ${Array.from({ length: s.days }, (_, d) => {
            const dt = dayDate(d);
            const al = s.atLeast[d];
            return `<button type="button" class="sched-day" data-day="${d}" aria-label="${DAYS[dt.getDay()]} ${dt.getDate()}: set at least">
                <span class="d">${DAYS[dt.getDay()].slice(0, 3)}<span class="n">${dt.getDate()}</span></span>
                ${al ? `<span class="al">at least ${al}</span>` : ""}
              </button>` +
              s.meals.map((m) => {
                const sk = isSkipped(d, m);
                return `<button type="button" class="cell ${sk ? "skipped" : ""}" data-day="${d}" data-meal="${esc(m)}" aria-pressed="${!sk}" aria-label="${esc(m)} on ${DAYS[dt.getDay()]}: ${sk ? "skipped" : "planned"}"><span class="mark"></span><span class="out" aria-hidden="true">out</span></button>`;
              }).join("");
          }).join("")}
        </div>
        <div class="legend"><span><i class="k-dot"></i>Plan this meal</span><span><i class="k-out"></i>Skip (eating out)</span></div>
        <p class="section-intro" style="margin-top:8px">Tap a meal to switch it. Tap a day for “at least”, which lets the planner leave some meals empty.</p>
      </section>

      <section class="section" aria-labelledby="s2">
        <div class="section-head"><span class="section-no">02</span><h2 class="section-title" id="s2">The goals</h2>
          <button class="text-btn" type="button" id="addGoal">+ Add</button></div>
        <ul class="goals">
          ${state.goals.map((g) => `<li><button type="button" class="goal ${g.strictness}" data-goal="${g.id}" aria-label="Edit goal: ${esc(g.name)}">
            <span class="goal-tag"><span class="strict">${g.strictness === "must" ? "Must" : "Preferred"}</span>${g.strictness === "prefer" ? impDots(g.importance || 3) : ""}</span>
            <p class="goal-text">${goalSentence(g)}.</p>
          </button></li>`).join("")}
        </ul>
        <p class="section-intro" style="margin-top:8px"><b>Must</b> goals are kept or there is no plan. <em>Preferred</em> goals are weighed by importance.</p>
      </section>

      <section class="section" aria-labelledby="s3">
        <div class="section-head"><span class="section-no">03</span><h2 class="section-title" id="s3">The pantry rules</h2>
          <button class="text-btn" type="button" id="editRules">Change</button></div>
        <ul class="rules">
          ${state.filters.filter((f) => f.mode !== "any").map((f) => `<li><button type="button" class="rule-tag ${f.mode}" data-rule="${esc(f.tag)}">
            <span class="mode">${f.mode === "never" ? "Never" : "Only"}</span><span class="tagname">${esc(f.tag)}</span>${f.note ? `<span class="note">${esc(f.note)}</span>` : ""}
          </button></li>`).join("") || `<li class="usable">No rules: every recipe may be used.</li>`}
        </ul>
        <p class="usable">${usable.length} of ${D.recipes.length} recipes can be used. <a href="#recipes" class="text-btn plain" style="min-height:0">See them</a></p>
      </section>

      <section class="section" aria-labelledby="s4">
        <div class="section-head"><span class="section-no">04</span><h2 class="section-title" id="s4">Time allowed</h2></div>
        <div class="time-row">
          <p class="time-text">Up to <b>${state.maxSeconds}</b> seconds to think it over.</p>
          <div class="stepper" role="group" aria-label="Max solving time">
            <button type="button" id="tMinus" aria-label="Less time" ${state.maxSeconds <= 5 ? "disabled" : ""}>−</button>
            <output class="val" aria-live="polite">${state.maxSeconds}s</output>
            <button type="button" id="tPlus" aria-label="More time" ${state.maxSeconds >= 300 ? "disabled" : ""}>+</button>
          </div>
        </div>
        <p class="section-intro" style="margin-top:8px">If time runs out, you still get the best plan found so far.</p>
      </section>

      <div class="compose">
        <button class="compose-btn" type="button" id="compose">Compose the week<span class="arrow" aria-hidden="true">→</span><small>Make plan</small></button>
        <p class="compose-note">Picks a recipe and a portion size for each of the ${mealsPlanned()} meals.</p>
      </div>
      ${turnLinks("plan")}`;
  }

  function bindPlan() {
    $$(".cell").forEach((c) => c.addEventListener("click", () => {
      const d = +c.dataset.day, m = c.dataset.meal;
      const list = state.schedule.skipped[d] || (state.schedule.skipped[d] = []);
      const i = list.indexOf(m);
      if (i >= 0) list.splice(i, 1); else list.push(m);
      const sk = i < 0;
      c.classList.toggle("skipped", sk);
      c.setAttribute("aria-pressed", String(!sk));
      c.setAttribute("aria-label", c.getAttribute("aria-label").replace(/(planned|skipped)$/, sk ? "skipped" : "planned"));
      const n = mealsPlanned();
      $(".compose-note").textContent = `Picks a recipe and a portion size for each of the ${n} meals.`;
      $(".standfirst").innerHTML = $(".standfirst").innerHTML.replace(/— \d+ to plan/, `— ${n} to plan`);
    }));
    $$(".sched-day").forEach((b) => b.addEventListener("click", () => sheetAtLeast(+b.dataset.day)));
    $("#editSchedule").addEventListener("click", sheetSchedule);
    $$(".goal").forEach((b) => b.addEventListener("click", () => sheetGoal(b.dataset.goal)));
    $("#addGoal").addEventListener("click", () => sheetGoal(null));
    $("#editRules").addEventListener("click", sheetRules);
    $$(".rule-tag").forEach((b) => b.addEventListener("click", sheetRules));
    $("#tMinus").addEventListener("click", () => { state.maxSeconds = Math.max(5, state.maxSeconds - (state.maxSeconds > 60 ? 30 : 5)); rerender(); $("#tMinus").focus(); });
    $("#tPlus").addEventListener("click", () => { state.maxSeconds = Math.min(300, state.maxSeconds + (state.maxSeconds >= 60 ? 30 : 5)); rerender(); $("#tPlus").focus(); });
    $("#compose").addEventListener("click", startSolving);
  }

  // ---------- sheets ----------
  let lastFocus = null;
  function openSheet(title, html, bind) {
    lastFocus = document.activeElement;
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false;
    bind && bind($("#sheetBody"));
    setTimeout(() => ($("#sheetBody").querySelector("input, button, select, textarea") || $("#sheetClose")).focus(), 50);
  }
  function closeSheet() {
    $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }

  function sheetAtLeast(d) {
    const s = state.schedule;
    const planned = s.meals.filter((m) => !isSkipped(d, m)).length;
    let v = s.atLeast[d] || planned;
    const dt = dayDate(d);
    const html = `
      <p class="sheet-preview" id="alPrev"></p>
      <div class="em-row" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="label">Meals served at least</span>
        <div class="stepper" role="group" aria-label="At least">
          <button type="button" id="alM" aria-label="Fewer">−</button><output class="val" id="alV"></output><button type="button" id="alP" aria-label="More">+</button>
        </div>
      </div>
      <p class="edit-hint">${planned} meal${planned === 1 ? "" : "s"} planned on ${DAYS[dt.getDay()]}. “At least” lets the planner leave some empty.</p>
      <div class="sheet-actions"><button class="btn primary" type="button" id="alSave">Done</button></div>`;
    openSheet(`${DAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`, html, (b) => {
      const upd = () => {
        $("#alV", b).textContent = v === planned ? "all" : v;
        $("#alPrev", b).innerHTML = v === planned ? `All <b>${planned}</b> planned meals are served.` : `At least <b>${v} of ${planned}</b> meals are served.`;
        $("#alM", b).disabled = v <= 0; $("#alP", b).disabled = v >= planned;
      };
      upd();
      $("#alM", b).onclick = () => { v--; upd(); };
      $("#alP", b).onclick = () => { v++; upd(); };
      $("#alSave", b).onclick = () => { if (v >= planned) delete s.atLeast[d]; else s.atLeast[d] = v; closeSheet(); rerender(); };
    });
  }

  function sheetSchedule() {
    const s = state.schedule;
    const draft = { start: s.start, days: s.days, meals: s.meals.slice() };
    const html = `
      <div class="field"><label for="sStart">Starts</label><input class="input serif" type="date" id="sStart" value="${draft.start}"></div>
      <div class="field"><span class="label" id="sDaysL">Number of days</span>
        <div class="stepper" role="group" aria-labelledby="sDaysL"><button type="button" id="sdM" aria-label="Fewer days">−</button><output class="val" id="sdV"></output><button type="button" id="sdP" aria-label="More days">+</button></div></div>
      <fieldset><legend>Meals each day</legend><div id="mealRows"></div>
        <button type="button" class="text-btn" id="addMeal">+ Add meal</button>
        <p class="edit-hint">Meal names are labels for you; the planner only counts meals.</p></fieldset>
      <div class="sheet-actions"><button class="btn ghost" type="button" id="sCancel">Cancel</button><button class="btn primary" type="button" id="sSave">Done</button></div>`;
    openSheet("The schedule", html, (b) => {
      const rows = () => {
        $("#mealRows", b).innerHTML = draft.meals.map((m, i) => `<div class="meal-name-row"><input class="input serif" aria-label="Name of meal ${i + 1}" value="${esc(m)}" data-i="${i}"><button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove ${esc(m)}" ${draft.meals.length <= 1 ? "disabled" : ""}>×</button></div>`).join("");
        $$("[data-i]", b).forEach((inp) => inp.addEventListener("input", () => (draft.meals[+inp.dataset.i] = inp.value)));
        $$("[data-rm]", b).forEach((x) => x.addEventListener("click", () => { draft.meals.splice(+x.dataset.rm, 1); rows(); }));
      };
      const days = () => { $("#sdV", b).textContent = draft.days; $("#sdM", b).disabled = draft.days <= 1; $("#sdP", b).disabled = draft.days >= 14; };
      rows(); days();
      $("#sdM", b).onclick = () => { draft.days--; days(); };
      $("#sdP", b).onclick = () => { draft.days++; days(); };
      $("#addMeal", b).onclick = () => { if (draft.meals.length >= 6) return toast("At most 6 meals a day."); draft.meals.push(`Meal ${draft.meals.length + 1}`); rows(); $$("[data-i]", b).pop().select(); };
      $("#sStart", b).onchange = (e) => (draft.start = e.target.value || draft.start);
      $("#sCancel", b).onclick = closeSheet;
      $("#sSave", b).onclick = () => {
        const names = draft.meals.map((m) => m.trim()).filter(Boolean);
        if (!names.length) return toast("Name at least one meal.");
        s.start = draft.start; s.days = draft.days; s.meals = names;
        closeSheet(); rerender(); toast("Schedule changed.");
      };
    });
  }

  function sheetGoal(id) {
    const existing = state.goals.find((g) => g.id === id);
    const g = existing ? clone(existing) : { id: "g" + Date.now(), name: "", attribute: "protein", min: null, max: null, scope: "day", strictness: "prefer", importance: 3 };
    const html = `
      <p class="sheet-preview" id="gPrev" aria-live="polite"></p>
      <fieldset><legend>What to track</legend><div class="chips" id="gAttr">
        ${D.attributes.map((a) => `<button type="button" class="chip" data-a="${a.id}">${a.name}</button>`).join("")}</div></fieldset>
      <div class="row2">
        <div class="field"><label for="gMin">Min <span id="uMin"></span></label><input class="input serif" id="gMin" inputmode="decimal" placeholder="none"></div>
        <div class="field"><label for="gMax">Max <span id="uMax"></span></label><input class="input serif" id="gMax" inputmode="decimal" placeholder="none"></div>
      </div>
      <fieldset><legend>Applies to</legend><div class="seg" id="gScope">
        <button type="button" data-s="day">Each day</button><button type="button" data-s="daily_average">Daily average</button><button type="button" data-s="plan_total">Plan total</button></div></fieldset>
      <fieldset><legend>How strict</legend><div class="seg" id="gStrict">
        <button type="button" data-t="must">Must</button><button type="button" data-t="prefer">Prefer</button></div></fieldset>
      <fieldset id="gImpF"><legend>Importance</legend><div class="imp-pick" id="gImp">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="Importance ${n} of 5">${n}</button>`).join("")}</div></fieldset>
      <div class="sheet-actions">
        ${existing ? `<button class="btn ghost" type="button" id="gDel">Remove</button>` : ""}
        <button class="btn primary" type="button" id="gSave">${existing ? "Done" : "Add goal"}</button>
      </div>`;
    openSheet(existing ? "Edit goal" : "Add goal", html, (b) => {
      $("#gMin", b).value = g.min ?? ""; $("#gMax", b).value = g.max ?? "";
      const upd = () => {
        const u = attr(g.attribute).unit;
        $("#uMin", b).textContent = `(${u})`; $("#uMax", b).textContent = `(${u})`;
        $$("#gAttr .chip", b).forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.a === g.attribute)));
        $$("#gScope button", b).forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.s === g.scope)));
        $$("#gStrict button", b).forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.t === g.strictness)));
        $$("#gImp button", b).forEach((c) => { c.classList.toggle("on", +c.dataset.n <= (g.importance || 3)); c.disabled = g.strictness === "must"; });
        $("#gImpF", b).style.opacity = g.strictness === "must" ? ".45" : "1";
        $("#gPrev", b).innerHTML = (g.min == null && g.max == null) ? `<em>Give a minimum, a maximum or both.</em>` :
          `${goalSentence(g)} — <em>${g.strictness === "must" ? "must" : `preferred, importance ${g.importance || 3}`}</em>.`;
      };
      const num = (v) => { v = v.replace(",", ".").trim(); return v === "" || isNaN(+v) ? null : +v; };
      $("#gMin", b).oninput = (e) => { g.min = num(e.target.value); upd(); };
      $("#gMax", b).oninput = (e) => { g.max = num(e.target.value); upd(); };
      $$("#gAttr .chip", b).forEach((c) => (c.onclick = () => { g.attribute = c.dataset.a; upd(); }));
      $$("#gScope button", b).forEach((c) => (c.onclick = () => { g.scope = c.dataset.s; upd(); }));
      $$("#gStrict button", b).forEach((c) => (c.onclick = () => { g.strictness = c.dataset.t; upd(); }));
      $$("#gImp button", b).forEach((c) => (c.onclick = () => { g.importance = +c.dataset.n; upd(); }));
      upd();
      $("#gSave", b).onclick = () => {
        if (g.min == null && g.max == null) return toast("Give a minimum, a maximum or both.");
        if (g.min != null && g.max != null && g.min > g.max) return toast("The minimum must be at most the maximum.");
        g.name = g.name || attr(g.attribute).name;
        if (existing) Object.assign(existing, g); else state.goals.push(g);
        closeSheet(); rerender(); toast(existing ? "Goal changed." : "Goal added.");
      };
      if (existing) $("#gDel", b).onclick = () => { state.goals = state.goals.filter((x) => x.id !== id); closeSheet(); rerender(); toast("Goal removed."); };
    });
  }

  function sheetRules() {
    const draft = D.tags.map((t) => { const f = state.filters.find((x) => x.tag === t); return { tag: t, mode: f ? f.mode : "any", note: f && f.note }; });
    const html = `
      <p class="sheet-preview" id="rPrev" aria-live="polite"></p>
      <div id="rRows">${draft.map((f, i) => `<div class="filter-row"><span class="tn" id="tn${i}">${esc(f.tag)}</span>
        <div class="seg" role="group" aria-labelledby="tn${i}">${["any", "only", "never"].map((m) => `<button type="button" data-i="${i}" data-m="${m}">${cap(m)}</button>`).join("")}</div></div>`).join("")}</div>
      <div class="sheet-actions"><button class="btn primary" type="button" id="rSave">Done</button></div>`;
    openSheet("The pantry rules", html, (b) => {
      const upd = () => {
        $$("[data-m]", b).forEach((x) => x.setAttribute("aria-pressed", String(draft[+x.dataset.i].mode === x.dataset.m)));
        const n = usableRecipes(draft.filter((f) => f.mode !== "any")).length;
        $("#rPrev", b).innerHTML = `<b>${n} of ${D.recipes.length}</b> recipes can be used.`;
      };
      $$("[data-m]", b).forEach((x) => (x.onclick = () => { draft[+x.dataset.i].mode = x.dataset.m; upd(); }));
      upd();
      $("#rSave", b).onclick = () => { state.filters = draft.filter((f) => f.mode !== "any"); closeSheet(); rerender(); };
    });
  }

  // ---------- solving ----------
  let solveTimer = null;
  const musings = [
    "Weighing protein against the budget…",
    "Trying salmon on Monday, then thinking better of it…",
    "Balancing the week’s fibre…",
    "Adjusting portions by halves…",
    "Checking the pantry rules…",
  ];
  function startSolving() {
    const el = $("#solving");
    const max = state.maxSeconds;
    const target = state.demo === "clash" ? 3 : state.demo === "time_ran_out" ? max : Math.min(D.result.solvedIn, max);
    let t = 0, stopping = false;
    el.innerHTML = `<div class="solving-inner">
      <p class="kicker">${issueLine()}</p>
      <h2 class="solving-title display" id="solvingTitle"><em>Composing</em> the week</h2>
      <div class="solving-count num" aria-live="off"><span id="sc">0</span><small>of ${max} s</small></div>
      <div class="solving-bar" role="progressbar" aria-label="Time used" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="0"><i id="sb"></i></div>
      <p class="solving-line" id="sl" aria-live="polite">${musings[0]}</p>
      <button class="btn block" type="button" id="sCancel">Cancel</button>
    </div>`;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    $("#sCancel").focus();
    const stepMs = 3200 / Math.max(target, 1); // demo: a whole solve takes ~3 s
    const tick = () => {
      t++;
      $("#sc").textContent = t;
      $("#sb").style.width = (t / max) * 100 + "%";
      $(".solving-bar").setAttribute("aria-valuenow", t);
      if (t % 2 === 0 && !stopping) { const l = $("#sl"); l.textContent = musings[(t / 2) % musings.length]; }
      if (t >= target) return finish();
      solveTimer = setTimeout(tick, stepMs);
    };
    solveTimer = setTimeout(tick, stepMs);
    $("#sCancel").onclick = () => {
      stopping = true; clearTimeout(solveTimer);
      $("#sCancel").textContent = "Stopping…"; $("#sCancel").disabled = true;
      $("#sl").textContent = "Putting the pencils down.";
      setTimeout(() => { el.hidden = true; document.body.style.overflow = ""; toast("Stopped before any plan was found."); }, 700);
    };
    function finish() {
      $("#sl").textContent = state.demo === "clash" ? "These rules can’t all be met." : "The menu is set.";
      setTimeout(() => {
        el.hidden = true; document.body.style.overflow = "";
        state.result = clone(D.result);
        state.result.status = state.demo === "time_ran_out" ? "time_ran_out" : "optimal";
        state.result.solvedIn = target;
        state.hasResult = true; state.saved = false; state.clashPrefer = {};
        go("menu");
      }, 500);
    }
  }

  // ---------- MENU ----------
  function goalVerdicts() {
    const days = state.result.days.slice(0, state.schedule.days);
    const n = days.length;
    return state.goals.map((g) => {
      const a = attr(g.attribute);
      const inRange = (v) => (g.min == null || v >= g.min - 1e-9) && (g.max == null || v <= g.max + 1e-9);
      let ok, text, sub = "";
      const name = a.name.toLowerCase();
      if (g.scope === "day") {
        const bad = days.map((d, i) => ({ i, v: d.totals[g.attribute] })).filter((x) => !inRange(x.v));
        ok = bad.length === 0;
        if (ok) text = `${cap(name)} stayed ${rangeText(g, a.unit)} every day.`;
        else {
          const worst = bad.reduce((w, x) => (g.min != null && x.v < g.min ? (x.v < w.v ? x : w) : (x.v > w.v ? x : w)), bad[0]);
          text = `${cap(name)} was ${g.min != null && worst.v < g.min ? "under" : "over"} ${fmt(g.min != null && worst.v < g.min ? g.min : g.max)} ${a.unit} on ${word(bad.length)} of ${word(n)} days.`;
          sub = `Furthest off: ${DAYS[dayDate(worst.i).getDay()]}, at ${fmt(worst.v)} ${a.unit}.`;
        }
      } else {
        const tot = days.reduce((s, d) => s + d.totals[g.attribute], 0);
        const v = g.scope === "plan_total" ? tot : tot / n;
        ok = inRange(v);
        const what = g.scope === "plan_total" ? `came to ${fmt(v)} ${a.unit} in total` : `averaged ${fmt(v)} ${a.unit} a day`;
        text = `${cap(name)} ${what}${ok ? "" : `; the goal was ${rangeText(g, a.unit)}`}.`;
      }
      return { g, ok, text, sub };
    });
  }

  function dayMisses(d) {
    const m = {};
    state.goals.filter((g) => g.scope === "day").forEach((g) => {
      const v = d.totals[g.attribute];
      if ((g.min != null && v < g.min) || (g.max != null && v > g.max)) m[g.attribute] = true;
    });
    return m;
  }

  function viewMenu() {
    const demo = `<div class="demo" role="group" aria-labelledby="demoL"><p class="label" id="demoL">Prototype only · show the result as</p>
      <div class="seg">${[["optimal", "Plan found"], ["time_ran_out", "Time ran out"], ["clash", "No plan possible"]].map(([k, l]) => `<button type="button" data-demo="${k}" aria-pressed="${state.demo === k}">${l}</button>`).join("")}</div></div>`;
    if (state.demo === "clash") return viewClash(demo);
    if (!state.hasResult) {
      return `<header class="cover"><p class="kicker">${issueLine()}</p><h1 class="cover-title display">The <em>Menu</em></h1>
        <p class="standfirst">No menu yet this week. Write the brief, then compose the week.</p></header>
        ${demo}<a class="btn primary block" href="#plan" style="margin-top:24px">Back to the brief</a>${turnLinks("menu")}`;
    }
    const r = state.result;
    const meals = state.schedule.meals;
    const days = r.days.slice(0, state.schedule.days);
    const verdicts = goalVerdicts();
    const missed = verdicts.filter((v) => !v.ok);
    const statusText = r.status === "optimal" ? "Best possible plan" : "Time ran out: may not be the best plan";
    return `
      <header class="cover" style="padding-bottom:0">
        <p class="kicker">${issueLine()}</p>
      </header>
      ${demo}
      <article class="menu-card" aria-labelledby="menuTitle"><div class="menu-card-inner">
        <div class="menu-head">
          <p class="ornament" aria-hidden="true">✦ ✦ ✦</p>
          <h1 class="menu-title display" id="menuTitle">The Menu</h1>
          <p class="kicker" style="margin-top:6px">${word(days.length)} days · ${days.reduce((s, d) => s + d.meals.filter(Boolean).length, 0)} dishes</p>
          <p class="menu-status">${state.saved ? "Saved to the archive" : "New, not saved"} <span class="badge ${r.status === "optimal" ? "" : "warn"}">${r.status === "optimal" ? "Best plan" : "Time ran out"}</span></p>
        </div>
        ${days.map((d, i) => {
          const dt = dayDate(i);
          const miss = dayMisses(d);
          return `<section class="day" aria-labelledby="d${i}">
            <div class="day-head"><h2 class="dname" id="d${i}">${DAYS[dt.getDay()]}</h2><span class="line"></span><span class="ddate">${dt.getDate()} ${MONTHS[dt.getMonth()].slice(0, 3)}</span></div>
            ${meals.map((m, j) => {
              const slot = d.meals[j];
              if (!slot) return `<div class="course skip"><span class="meal">${esc(m)}</span><span class="dish-skip">— dining out —</span></div>`;
              const rc = recipe(slot[0]), p = slot[1];
              return `<div class="course"><span class="meal">${esc(m)}</span>
                <a class="dish" href="#recipe/${rc.id}"><span class="dname-t">${esc(rc.name)}</span>${p !== 1 ? `<span class="portion">× ${frac(p)}</span>` : ""}</a>
                <span class="margin-note" aria-label="${fmt(rc.per.energy * p)} kcal, ${fmt(rc.per.protein * p)} g protein">${fmt(rc.per.energy * p)} kcal<br>${fmt(rc.per.protein * p)} g prot.</span>
              </div>`;
            }).join("")}
            <p class="day-totals"><span class="visually-hidden">Day totals:</span>
              ${D.attributes.map((a) => `<span class="${miss[a.id] ? "miss" : ""}">${fmt(d.totals[a.id])} ${a.unit}${a.id === "energy" || a.id === "cost" ? "" : " " + a.name.toLowerCase()}</span>`).join("")}
            </p>
          </section>`;
        }).join("")}
        <p class="ornament" aria-hidden="true" style="text-align:center;margin:32px 0 0;color:var(--accent);font-family:var(--serif)">❦</p>
      </div></article>

      <section class="colophon" aria-labelledby="colo">
        <p class="kicker">Colophon</p>
        <h3 id="colo">How the week turned out</h3>
        <p class="standfirst" style="margin-bottom:16px">${statusText}, composed in ${r.solvedIn} seconds. ${missed.length ? `${cap(word(missed.length))} preferred goal${missed.length > 1 ? "s were" : " was"} missed; everything else held.` : "All goals met."}</p>
        <ul class="verdicts">
          ${verdicts.map((v) => `<li class="${v.ok ? "ok" : "missed"}"><span class="v" aria-label="${v.ok ? "Met" : "Missed"}">${v.ok ? "✓" : "†"}</span><p>${esc(v.text)}${v.sub ? `<span class="sub">${esc(v.sub)}</span>` : ""}${v.ok ? "" : `<span class="sub">${v.g.strictness === "must" ? "Must" : `Preferred, importance ${v.g.importance}`}</span>`}</p></li>`).join("")}
        </ul>
        <table class="totals-table"><caption class="visually-hidden">Plan totals</caption>
          <thead><tr><th scope="col">For the week</th><th scope="col">Total</th><th scope="col">A day</th></tr></thead>
          <tbody>${D.attributes.map((a) => { const t = days.reduce((s, d) => s + d.totals[a.id], 0); return `<tr><th scope="row">${a.name}</th><td>${fmt(t)} ${a.unit}</td><td>${fmt(t / days.length)} ${a.unit}</td></tr>`; }).join("")}</tbody>
        </table>
        <div class="menu-actions">
          ${state.saved ? `<p class="saved-note">Filed in the archive as Week ${isoWeek(dayDate(0))}.</p>` : `<button class="btn primary block" type="button" id="mSave">Save to the archive</button>`}
          <div class="btn-row"><button class="btn" type="button" id="mToday">Use for today</button><button class="btn ghost" type="button" id="mDiscard">Discard</button></div>
        </div>
      </section>
      ${turnLinks("menu")}`;
  }

  function viewClash(demo) {
    const items = [
      { key: "g1", text: () => goalSentence(state.goals.find((g) => g.id === "g1") || D.plan.goals[0]), where: "Clashes over the whole plan" },
      { key: "g5", text: () => `At most <b>650 kr</b> <span class="attr">cost</span>, over the whole plan`, where: "Clashes over the whole plan" },
      { key: "sched", text: () => `All planned meals are served on <b>Friday</b>`, where: "Clashes on Fri 27 · Meals on Friday", schedule: true },
    ];
    return `
      <header class="cover" style="padding-bottom:0"><p class="kicker">${issueLine()}</p></header>
      ${demo}
      <article class="editors-note" aria-labelledby="enT">
        <div class="note-card">
          <p class="kicker" style="color:var(--accent)">Editor’s note</p>
          <h1 id="enT">No plan possible</h1>
          <p class="lede">These rules can’t all be met at once. Each one is a <b>Must</b>; loosen one and the week can be composed. Fixing these may show another clash.</p>
        </div>
        <ol class="clash-list">
          ${items.map((it) => {
            const pref = state.clashPrefer[it.key];
            return `<li class="clash-item ${pref ? "fixed" : ""}">
              <p class="where">${it.where}</p>
              <p class="ct">${it.text()}${pref ? ` — <em>will be preferred</em>` : " — <em>must</em>"}.</p>
              ${it.schedule ? `<a class="text-btn" href="#plan">Edit schedule</a>` : `<button type="button" class="btn ${pref ? "ghost" : ""}" data-prefer="${it.key}" aria-pressed="${!!pref}">${pref ? "Keep Must" : "Make Prefer"}</button>`}
            </li>`;
          }).join("")}
        </ol>
        <p class="signature">— The planner</p>
        <button class="btn primary block" type="button" id="tryAgain">Try again</button>
      </article>
      ${turnLinks("menu")}`;
  }

  function bindMenu() {
    $$("[data-demo]").forEach((b) => b.addEventListener("click", () => {
      state.demo = b.dataset.demo;
      if (state.demo !== "clash") { state.hasResult = true; state.result.status = state.demo; state.result.solvedIn = state.demo === "time_ran_out" ? state.maxSeconds : D.result.solvedIn; }
      rerender();
    }));
    $$("[data-prefer]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.prefer; state.clashPrefer[k] = !state.clashPrefer[k]; rerender(); }));
    const tr = $("#tryAgain");
    if (tr) tr.addEventListener("click", () => {
      Object.keys(state.clashPrefer).forEach((k) => { if (state.clashPrefer[k]) { const g = state.goals.find((x) => x.id === k); if (g) { g.strictness = "prefer"; g.importance = g.importance || 5; } } });
      if (Object.values(state.clashPrefer).some(Boolean)) state.demo = "optimal";
      else toast("Nothing changed; the same clash may come back.");
      startSolving();
    });
    const s = $("#mSave");
    if (s) s.addEventListener("click", () => {
      state.saved = true;
      const wk = isoWeek(dayDate(0));
      state.archive.unshift({ id: "p" + Date.now(), label: `Week ${wk}`, start: state.schedule.start, days: state.schedule.days, savedAt: "2026-11-19 21:30", today: false });
      rerender(); toast(`Saved to the archive as Week ${wk}.`);
    });
    const t = $("#mToday");
    if (t) t.addEventListener("click", () => {
      state.archive.forEach((p) => (p.today = false));
      if (!state.saved) $("#mSave") && $("#mSave").click();
      state.archive[0].today = true;
      toast("Today’s meals now come from this menu.");
    });
    const d = $("#mDiscard");
    if (d) d.addEventListener("click", () => openSheet("Discard this plan?", `<p class="standfirst">The Menu for ${issueLine()} will be thrown away. This can’t be undone.</p>
      <div class="sheet-actions"><button class="btn ghost" type="button" id="dNo">Keep it</button><button class="btn accent" type="button" id="dYes">Discard</button></div>`, (b) => {
      $("#dNo", b).onclick = closeSheet;
      $("#dYes", b).onclick = () => { state.hasResult = false; closeSheet(); rerender(); toast("Plan discarded."); };
    }));
  }

  // ---------- RECIPE INDEX ----------
  function viewRecipes() {
    return `
      <header class="cover"><p class="kicker">${D.recipes.length} dishes · A to Z</p>
        <h1 class="cover-title display">The recipe <em>index</em></h1>
        <p class="standfirst">Everything the planner may cook from, filed by name.</p></header>
      <div class="search"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="1.6"/></svg>
        <label class="visually-hidden" for="rq">Search recipes</label><input class="input" id="rq" type="search" placeholder="Search by name or tag" value="${esc(state.q)}"></div>
      <div id="idx"></div>
      <button class="btn block" type="button" id="newRecipe" style="margin-top:24px">+ New recipe</button>
      ${turnLinks("recipes")}`;
  }
  function renderIndex() {
    const q = state.q.trim().toLowerCase();
    const list = D.recipes.filter((r) => !q || r.name.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groups = {};
    list.forEach((r) => (groups[r.name[0].toUpperCase()] ||= []).push(r));
    const usable = usableRecipes().map((r) => r.id);
    $("#idx").innerHTML = Object.keys(groups).map((L) => `<h2 class="letter">${L}</h2><ul class="idx">${groups[L].map((r) => `<li>
      <a class="idx-entry" href="#recipe/${r.id}" style="text-decoration:none">
        <span class="swatch plate" style="--h:${r.hue}" aria-hidden="true"></span>
        <span><span class="n">${esc(r.name)}</span><span class="t">${r.tags.join(" · ")}${usable.includes(r.id) ? "" : " · <em style='text-transform:none;letter-spacing:0'>not this week</em>"}</span></span>
        <span class="m">${r.minutes} min</span>
      </a></li>`).join("")}</ul>`).join("") || `<p class="standfirst" style="margin-top:24px"><em>No recipes match.</em></p>`;
  }
  function bindRecipes() {
    renderIndex();
    $("#rq").addEventListener("input", (e) => { state.q = e.target.value; renderIndex(); });
    $("#newRecipe").addEventListener("click", () => toast("A blank spread would open here, ready to annotate."));
  }

  // ---------- RECIPE SPREAD ----------
  const UNITS = ["g", "kg", "dl", "ml", "l", "pcs", "cloves", "tbsp", "tsp", "bunch"];
  function viewRecipe(id) {
    const base = recipe(id) || recipe("r9");
    const full = base.id === state.recipe.id;
    const R = full ? state.recipe : null;
    const ed = state.editing && full;
    const name = full ? R.name : base.name;
    const serves = full ? R.serves : base.serves;
    const no = parseInt(base.id.slice(1), 10);
    const per = base.per;
    const tags = full ? R.tags : base.tags;
    return `
      <div class="spread-plate ${plateClass(base)}" style="--h:${base.hue}" role="img" aria-label="Colour plate for ${esc(name)}"><span class="plate-no">Plate ${["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][no - 1] || no}</span></div>
      ${full ? `<div class="spread-bar ${ed ? "editing" : ""}">
        <span class="hint">${ed ? "Annotating — tap anything underlined" : `<a href="#recipes" class="text-btn plain" style="min-height:0">← Index</a>`}</span>
        ${ed ? `<span class="btn-row" style="flex:0 0 auto"><button class="btn ghost" type="button" id="eCancel" style="min-height:44px">Cancel</button><button class="btn accent" type="button" id="eDone" style="min-height:44px">Save</button></span>`
             : `<button class="btn" type="button" id="eStart" style="min-height:44px">Edit</button>`}
      </div>` : ""}
      <header class="spread-head">
        <p class="kicker">Recipe No. ${no}${tags.length ? ` · ${esc(tags[0])}` : ""}</p>
        ${ed ? `<label class="visually-hidden" for="eName">Recipe name</label><input class="annot title-in display" id="eName" value="${esc(name)}">`
             : `<h1 class="spread-title display">${esc(name)}</h1>`}
        ${ed ? `<div class="edit-meta">
            <div class="em-row"><span class="label" id="servL">Serves</span>
              <div class="stepper" role="group" aria-labelledby="servL"><button type="button" id="svM" aria-label="Fewer servings">−</button><output class="val">${serves}</output><button type="button" id="svP" aria-label="More servings">+</button></div></div>
            <p class="edit-hint" style="margin-top:-8px">Amounts are for the whole recipe.</p>
            <div class="em-row"><span class="label">Portion size</span>
              <div class="portion-edit">${["from", "to", "step"].map((k) => `<label class="pe"><span class="kicker">${k}</span><input class="annot" style="width:64px;text-align:right" inputmode="decimal" data-portion="${k}" value="${R.portion[k]}"></label>`).join("")}</div></div>
          </div>`
        : `<div class="spread-meta">
            <div><span class="kicker">Serves</span><span class="v">${serves}</span></div>
            <div><span class="kicker">Time</span><span class="v">${base.minutes} min</span></div>
            ${full ? `<div><span class="kicker">Portions</span><span class="v">${frac(R.portion.from)}–${frac(R.portion.to)}</span></div>` : ""}
          </div>`}
      </header>

      <section aria-labelledby="ingT">
        <div class="section-head" style="margin-top:8px"><span class="section-no">i.</span><h2 class="section-title" id="ingT">Ingredients</h2></div>
        ${full ? R.sections.map((sec, si) => `<div class="ing-section"><h3>${esc(sec.name)}</h3>
          ${ed ? `<div>${sec.lines.map((l, li) => ingEditRow(l, si, li)).join("")}</div>
              <button type="button" class="text-btn add-line" data-add="${si}">+ Add a line to “${esc(sec.name)}”</button>`
               : `<ul class="ing-list">${sec.lines.map((l) => `<li class="ing ${l.needsReview ? "review" : ""}"><span class="amt">${fmt(l.amount)}<span class="u">${esc(l.unit)}</span></span>
                  <span class="nm">${esc(l.ingredient)}${l.note ? `<span class="cv">${esc(l.note)}</span>` : ""}${l.needsReview ? `<span class="cv" style="color:var(--accent)">Needs review: no weight for “${esc(l.unit)}”</span>` : ""}</span></li>`).join("")}</ul>`}
        </div>`).join("")
        : `<p class="standfirst" style="margin-top:12px"><em>In this prototype only the Chickpea curry has its full spread.</em> <a class="text-btn" href="#recipe/r9">Open it</a></p>`}
      </section>

      ${full ? `<section aria-labelledby="mT" style="margin-top:40px">
        <div class="section-head"><span class="section-no">ii.</span><h2 class="section-title" id="mT">Method</h2></div>
        <ol class="method ${ed ? "method-edit" : ""}">
          ${R.instructions.map((s, i) => ed
            ? `<li><span><label class="visually-hidden" for="st${i}">Step ${i + 1}</label><textarea class="annot" id="st${i}" data-step="${i}" rows="3">${esc(s)}</textarea></span><button type="button" class="icon-btn" data-rmstep="${i}" aria-label="Remove step ${i + 1}">×</button></li>`
            : `<li><p>${esc(s)}</p></li>`).join("")}
        </ol>
        ${ed ? `<button type="button" class="text-btn" id="addStep">+ Add a step</button>` : ""}
      </section>` : ""}

      <section aria-labelledby="tT" style="margin-top:40px">
        <div class="section-head"><span class="section-no">iii.</span><h2 class="section-title" id="tT">Notes</h2></div>
        <p class="kicker" style="margin-bottom:6px">Tags</p>
        ${ed ? `<div class="chips">${D.tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${R.tags.includes(t) || R.derivedTags.includes(t)}" ${R.derivedTags.includes(t) ? "disabled title='From the ingredients'" : ""}>${esc(t)}${R.derivedTags.includes(t) ? " ·auto" : ""}</button>`).join("")}</div>
              <p class="edit-hint">Tags from the ingredients are on already, by each tag’s rule.</p>`
             : `<div class="tags-line">${tags.map((t) => `<span class="tag-word">${esc(t)}</span>`).join("")}</div>
               ${full ? `<p class="tag-derived">From the ingredients: ${R.derivedTags.join(", ")}</p>` : ""}`}

        <table class="nutri" style="margin-top:24px"><caption>Per portion</caption>
          <tbody>${D.attributes.map((a) => `<tr><th scope="row">${a.name}</th><td>${fmt(per[a.id])} ${a.unit}</td></tr>`).join("")}</tbody></table>

        ${full ? (ed ? `<div class="field" style="margin-top:24px"><label for="eSrc">Source</label><input class="annot" id="eSrc" type="url" value="${esc(R.source)}" style="width:100%"></div>`
                     : `<p style="margin-top:24px"><span class="kicker">Source</span><br><a class="source-link" href="${esc(R.source)}" target="_blank" rel="noopener">${esc(R.source.replace(/^https?:\/\//, ""))}</a></p>`) : ""}
      </section>
      <nav class="turn" aria-label="Turn the page"><a class="prev" href="#recipes"><span class="kicker">← Back to</span><span class="t">The recipe index</span></a>
        <a class="next" href="#menu"><span class="kicker">On the menu →</span><span class="t">The Menu</span></a></nav>`;
  }
  function ingEditRow(l, si, li) {
    const id = `${si}-${li}`;
    const unitOpts = UNITS.concat(UNITS.includes(l.unit) ? [] : [l.unit]).map((u) => `<option ${u === l.unit ? "selected" : ""}>${esc(u)}</option>`).join("");
    const nonMass = !["g", "kg"].includes(l.unit);
    const conv = l.note ? l.note.match(/^1 (\S+) = ([\d.]+) g$/) : null;
    return `<div class="ing-edit ${l.needsReview ? "review" : ""}">
      <label class="visually-hidden" for="a${id}">Amount of ${esc(l.ingredient)}</label>
      <input class="annot amt-in" id="a${id}" inputmode="decimal" value="${l.amount ?? ""}" data-amt="${id}">
      <label class="visually-hidden" for="u${id}">Unit of ${esc(l.ingredient)}</label>
      <select class="annot" id="u${id}" data-unit="${id}">${unitOpts}</select>
      <span class="nm">${esc(l.ingredient)}</span>
      <button type="button" class="icon-btn" data-rm="${id}" aria-label="Remove ${esc(l.ingredient)}">×</button>
      ${l.needsReview ? `<div class="review-note"><strong>Needs review.</strong><span>We don’t know what 1 ${esc(l.unit)} of ${esc(l.ingredient.toLowerCase())} weighs, so it’s left out of the totals.</span>
          <span class="review-fix">1 ${esc(l.unit)} = <label class="visually-hidden" for="fx${id}">Grams in 1 ${esc(l.unit)}</label><input class="annot" id="fx${id}" inputmode="decimal" placeholder="25"> g
          <button class="btn" type="button" data-fix="${id}">Fix</button></span></div>`
        : nonMass ? `<span class="cv-edit">${conv ? `1 ${esc(conv[1])} = <label class="visually-hidden" for="c${id}">Grams in 1 ${esc(l.unit)}</label><input class="annot" id="c${id}" inputmode="decimal" value="${conv[2]}" data-conv="${id}"> g` : `<em>weighed by the ingredient’s own ${esc(l.unit)} rule</em>`}</span>` : ""}
    </div>`;
  }
  function bindRecipe(id) {
    const R = state.recipe;
    const line = (key) => { const [si, li] = key.split("-").map(Number); return R.sections[si].lines[li]; };
    const startEdit = () => { state.snapshot = clone(R); state.editing = true; rerender(); const n = $("#eName"); n && n.focus(); };
    const s = $("#eStart"); s && s.addEventListener("click", startEdit);
    if (!state.editing) return;
    $("#eCancel").addEventListener("click", () => { state.recipe = state.snapshot; state.editing = false; rerender(); toast("Changes thrown away."); });
    $("#eDone").addEventListener("click", () => {
      const left = R.sections.some((sec) => sec.lines.some((l) => l.needsReview));
      state.editing = false; rerender(); toast(left ? "Saved. One line still needs review." : "Recipe saved.");
    });
    $("#eName").addEventListener("input", (e) => (R.name = e.target.value));
    $("#svM").addEventListener("click", () => { R.serves = Math.max(1, R.serves - 1); $("#svM").nextElementSibling.textContent = R.serves; });
    $("#svP").addEventListener("click", () => { R.serves = Math.min(1000, R.serves + 1); $("#svM").nextElementSibling.textContent = R.serves; });
    $$("[data-portion]").forEach((i) => i.addEventListener("change", () => { const v = +i.value.replace(",", "."); if (v > 0) R.portion[i.dataset.portion] = v; }));
    $$("[data-amt]").forEach((i) => i.addEventListener("input", () => { const v = +i.value.replace(",", "."); line(i.dataset.amt).amount = isNaN(v) ? null : v; }));
    $$("[data-unit]").forEach((sel) => sel.addEventListener("change", () => {
      const l = line(sel.dataset.unit); l.unit = sel.value;
      if (!["g", "kg"].includes(l.unit) && !(l.note && l.note.startsWith(`1 ${l.unit} `)) && !["tbsp", "tsp", "ml", "l", "dl"].includes(l.unit)) l.needsReview = true;
      else if (["g", "kg"].includes(l.unit)) { l.needsReview = false; l.note = undefined; }
      rerender();
    }));
    $$("[data-conv]").forEach((i) => i.addEventListener("input", () => { const l = line(i.dataset.conv); l.note = `1 ${l.unit} = ${i.value} g`; }));
    $$("[data-fix]").forEach((b) => b.addEventListener("click", () => {
      const key = b.dataset.fix, inp = $("#fx" + key), v = +inp.value.replace(",", ".");
      if (!(v > 0)) { inp.focus(); return toast("Enter the grams in one " + line(key).unit + "."); }
      const l = line(key); l.needsReview = false; l.note = `1 ${l.unit} = ${v} g`;
      rerender(); toast("Conversion added. The line counts now.");
    }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const [si, li] = b.dataset.rm.split("-").map(Number);
      const [gone] = R.sections[si].lines.splice(li, 1); rerender(); toast(`Removed ${gone.ingredient}.`);
    }));
    $$("[data-add]").forEach((b) => b.addEventListener("click", () => sheetAddLine(+b.dataset.add)));
    $$("[data-step]").forEach((t) => t.addEventListener("input", () => (R.instructions[+t.dataset.step] = t.value)));
    $$("[data-rmstep]").forEach((b) => b.addEventListener("click", () => { R.instructions.splice(+b.dataset.rmstep, 1); rerender(); }));
    $("#addStep").addEventListener("click", () => { R.instructions.push(""); rerender(); const all = $$("[data-step]"); all[all.length - 1].focus(); });
    $$("[data-tag]").forEach((c) => c.addEventListener("click", () => {
      const t = c.dataset.tag, i = R.tags.indexOf(t);
      if (i >= 0) R.tags.splice(i, 1); else R.tags.push(t);
      c.setAttribute("aria-pressed", String(i < 0));
    }));
    $("#eSrc").addEventListener("input", (e) => (R.source = e.target.value));
  }
  function sheetAddLine(si) {
    const R = state.recipe;
    const html = `<div class="search" style="margin-top:0"><label class="visually-hidden" for="aq">Find an ingredient</label><input class="input" id="aq" type="search" placeholder="Find an ingredient"></div><ul class="picker-list" id="al"></ul>`;
    openSheet(`Add to “${R.sections[si].name}”`, html, (b) => {
      const draw = (q) => {
        $("#al", b).innerHTML = D.ingredients.filter((i) => i.toLowerCase().includes(q.toLowerCase())).sort().map((i) => `<li><button type="button" data-pick="${esc(i)}">${esc(i)}</button></li>`).join("") || `<li class="muted" style="padding:12px 0"><em>No ingredient by that name; add it on the Ingredients page.</em></li>`;
        $$("[data-pick]", b).forEach((x) => (x.onclick = () => {
          R.sections[si].lines.push({ ingredient: x.dataset.pick, amount: null, unit: "g" });
          closeSheet(); rerender();
          const li = R.sections[si].lines.length - 1; const inp = $(`#a${si}-${li}`); if (inp) { inp.focus(); inp.scrollIntoView({ block: "center" }); }
        }));
      };
      draw("");
      $("#aq", b).addEventListener("input", (e) => draw(e.target.value));
    });
  }

  // ---------- ARCHIVE ----------
  function viewArchive() {
    return `<header class="cover"><p class="kicker">Saved plans</p><h1 class="cover-title display">The <em>archive</em></h1>
      <p class="standfirst">Past menus, newest first. The one marked “Today” feeds today’s meals.</p></header>
      <ul class="idx">${state.archive.map((p) => {
        const d = parseDate(p.start), [day, time] = p.savedAt.split(" "), sd = parseDate(day);
        return `<li><button type="button" class="archive-entry" data-plan="${p.id}">
          <span class="wk">${isoWeek(d)}</span>
          <span><span class="lbl">${esc(p.label)}</span><span class="meta">${p.days} days from ${d.getDate()} ${MONTHS[d.getMonth()]} · saved ${sd.getDate()} ${MONTHS[sd.getMonth()].slice(0, 3)}, ${time}</span></span>
          ${p.today ? `<span class="today-mark">Today</span>` : `<span aria-hidden="true" class="muted">→</span>`}
        </button></li>`;
      }).join("")}</ul>
      ${turnLinks("archive")}`;
  }
  function bindArchive() {
    $$("[data-plan]").forEach((b) => b.addEventListener("click", () => {
      const p = state.archive.find((x) => x.id === b.dataset.plan);
      toast(`Opening ${p.label} (the sample shows this week’s menu).`);
      state.demo = "optimal"; state.hasResult = true; state.saved = true; go("menu");
    }));
  }

  // ---------- INGREDIENTS ----------
  function viewIngredients() {
    return `<header class="cover"><p class="kicker">${D.ingredients.length} in the larder</p><h1 class="cover-title display"><em>Ingredients</em></h1>
      <p class="standfirst">What recipes are made of: nutrition per 100 g, units and conversions.</p></header>
      <div class="search"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="1.6"/></svg>
        <label class="visually-hidden" for="iq">Search ingredients</label><input class="input" id="iq" type="search" placeholder="Search" value="${esc(state.iq)}"></div>
      <ul class="ingr-list" id="il"></ul>
      ${turnLinks("ingredients")}`;
  }
  function bindIngredients() {
    const draw = () => {
      const q = state.iq.toLowerCase();
      $("#il").innerHTML = D.ingredients.filter((i) => i.toLowerCase().includes(q)).sort().map((i) => `<li><button type="button" data-ing="${esc(i)}">${esc(i)}</button></li>`).join("");
      $$("[data-ing]").forEach((b) => b.addEventListener("click", () => toast(`${b.dataset.ing}: its own page isn’t in this prototype.`)));
    };
    draw();
    $("#iq").addEventListener("input", (e) => { state.iq = e.target.value; draw(); });
  }

  // ---------- SETTINGS ----------
  function viewSettings() {
    return `<header class="cover"><p class="kicker">The small print</p><h1 class="cover-title display"><em>Settings</em></h1></header>
      <div class="setting"><h3>Edition</h3><div class="seg" role="group" aria-label="Theme">
        ${[["auto", "Follow the device"], ["light", "Paper"], ["dark", "Evening"]].map(([k, l]) => `<button type="button" data-theme-pick="${k}" aria-pressed="${state.theme === k}">${l}</button>`).join("")}</div>
        <p class="edit-hint">The evening edition is a dark theme for the couch.</p></div>
      <div class="setting"><h3>Language</h3><div class="seg" role="group" aria-label="Language">
        <button type="button" aria-pressed="true">English</button><button type="button" data-sv aria-pressed="false">Svenska</button></div></div>
      <div class="setting"><h3>Units</h3><p class="standfirst" style="font-size:17px">g, kg, dl, ml, l, pcs, tbsp, tsp, bunch …</p><button type="button" class="text-btn" id="units">Edit the unit catalogue</button></div>
      <div class="setting"><h3>Attributes</h3><p class="standfirst" style="font-size:17px">${D.attributes.map((a) => `${a.name} (${a.unit})`).join(", ")}</p><button type="button" class="text-btn" id="attrs">Edit attributes</button></div>
      ${turnLinks("settings")}`;
  }
  function bindSettings() {
    $$("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => {
      state.theme = b.dataset.themePick;
      if (state.theme === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", state.theme);
      rerender();
    }));
    $("[data-sv]").addEventListener("click", () => toast("Swedish text isn’t in this prototype."));
    $("#units").addEventListener("click", () => toast("The unit catalogue isn’t in this prototype."));
    $("#attrs").addEventListener("click", () => toast("Attributes aren’t in this prototype."));
  }

  // ---------- contents overlay ----------
  function openContents() {
    $("#contentsIssue").textContent = issueLine();
    $("#contentsList").innerHTML = PAGES.map((p, i) => `<li><a href="#${p.id}" ${current === p.id || (current === "recipe" && p.id === "recipes") ? 'aria-current="page"' : ""}>
      <span class="no">${String(i + 1).padStart(2, "0")}</span><span><span class="ti">${p.title}</span><span class="de">${p.desc}</span></span><span class="pg">p. ${i * 4 + 2}</span></a></li>`).join("");
    $("#contents").hidden = false;
    document.body.style.overflow = "hidden";
    $("#contentsClose").focus();
    $$("#contentsList a").forEach((a) => a.addEventListener("click", closeContents));
  }
  function closeContents() { $("#contents").hidden = true; document.body.style.overflow = ""; $("#contentsBtn").focus(); }

  // ---------- global wiring ----------
  $("#contentsBtn").addEventListener("click", openContents);
  $("#contentsClose").addEventListener("click", closeContents);
  $("#sheetClose").addEventListener("click", closeSheet);
  $("#sheetBackdrop").addEventListener("click", closeSheet);
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#sheet").hidden) closeSheet(); else if (!$("#contents").hidden) closeContents();
  });
  window.addEventListener("scroll", () => $("#masthead").classList.toggle("scrolled", window.scrollY > 140), { passive: true });
  window.addEventListener("hashchange", () => { if (state.editing && !location.hash.startsWith("#recipe")) state.editing = false; route(); });

  // swipe to turn the page
  let sx = 0, sy = 0, st = 0, ok = false;
  const pageEl = $("#page");
  pageEl.addEventListener("touchstart", (e) => {
    const t = e.target;
    ok = !state.editing && !t.closest("input, textarea, select, .sched, .seg");
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  pageEl.addEventListener("touchend", (e) => {
    if (!ok) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50 || Date.now() - st > 600) return;
    const id = current === "recipe" ? "recipes" : current;
    const i = PAGES.findIndex((p) => p.id === id);
    const target = PAGES[i + (dx < 0 ? 1 : -1)];
    if (target) go(target.id);
  }, { passive: true });

  route();
})();
