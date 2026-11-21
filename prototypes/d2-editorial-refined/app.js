/* Prototype D2: refined editorial / cookbook. Throwaway; nothing persists. */
(function () {
  "use strict";
  const D = window.MEAL_DATA;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    savedId: null,
    archive: clone(D.savedPlans),
    recipe: clone(D.recipeDetail),
    editing: false,
    snapshot: null,
    clashPrefer: {},
    theme: "auto",
    q: "",
    iq: "",
    justSolved: false,
  };

  // Folio = position in this list + 1, used by the contents, the running head and the page foot.
  const PAGES = [
    { id: "plan", title: "This week’s brief", desc: "Schedule, goals, rules and time", run: "This week’s brief" },
    { id: "menu", title: "The Menu", desc: "The composed week, day by day", run: "The Menu" },
    { id: "recipes", title: "The recipe index", desc: "Every dish, A to Z", run: "Recipes" },
    { id: "archive", title: "The archive", desc: "Saved plans", run: "The archive" },
    { id: "ingredients", title: "Ingredients", desc: "The larder, alphabetically", run: "Ingredients" },
    { id: "settings", title: "Settings", desc: "Edition, language and units", run: "Settings" },
  ];

  // ---------- helpers ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const dayDate = (i) => { const d = parseDate(state.schedule.start); d.setDate(d.getDate() + i); return d; };
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  };
  const dateRange = () => {
    const a = dayDate(0), b = dayDate(state.schedule.days - 1);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]}`
      : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
  };
  const issueLine = () => `Week ${isoWeek(dayDate(0))}, ${dateRange()}`;
  const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("en-GB");
  const frac = (p) => {
    const whole = Math.floor(p), rest = p - whole;
    const f = rest === 0.5 ? "½" : rest === 0.25 ? "¼" : rest === 0.75 ? "¾" : rest ? String(rest).slice(1) : "";
    return (whole ? whole : "") + f || "0";
  };
  const attr = (id) => D.attributes.find((a) => a.id === id);
  const recipe = (id) => D.recipes.find((r) => r.id === id);
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  const word = (n) => words[n] || String(n);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const idNum = (r) => parseInt(String(r.id).replace(/\D/g, ""), 10) || 0;
  const plural = (n, one, many) => (n === 1 ? one : many);

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
    const m = r.match(/^(between|at least|at most|exactly) (.*)$/);
    const lead = m ? cap(m[1]) : "";
    const val = m ? m[2] : r;
    return `${lead} <b>${esc(val)}</b> <span class="attr">${esc(a.name.toLowerCase())}</span>, ${scopeText[g.scope]}`;
  }
  function impDots(n) {
    return `<span class="imp" role="img" aria-label="Importance ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
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
  const SEARCH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="1.6"/></svg>`;

  // ---------- colour plates: a dish on a tablecloth, drawn from above ----------
  function plateSVG(r, kind) {
    const v = idNum(r) % 4;
    if (kind === "swatch") {
      return `<svg class="plate-svg swatch" viewBox="0 0 44 44" style="--h:${r.hue}" aria-hidden="true" focusable="false">
        <circle class="shade" cx="23.5" cy="23.5" r="20"/>
        ${v === 3 ? `<circle class="iron" cx="22" cy="22" r="20"/><circle class="iron-2" cx="22" cy="22" r="16.5"/>`
                  : `<circle class="china" cx="22" cy="22" r="20"/><circle class="rimline" cx="22" cy="22" r="15.5"/>`}
        <circle class="food" cx="22" cy="22" r="${v === 2 ? 13.5 : 10.5}"/>
        <circle class="food-2" cx="18.5" cy="19.5" r="3.6"/><circle class="food-2" cx="25.5" cy="18" r="2.2"/>
        <ellipse class="leaf" cx="25.5" cy="26" rx="3.4" ry="1.6" transform="rotate(-30 25.5 26)"/>
      </svg>`;
    }
    const pid = "cloth-" + r.id;
    const pattern = [
      `<pattern id="${pid}" width="28" height="28" patternUnits="userSpaceOnUse"><rect class="cloth" width="28" height="28"/><rect class="band" width="14" height="28" opacity=".5"/><rect class="band" width="28" height="14" opacity=".5"/></pattern>`,
      `<pattern id="${pid}" width="22" height="22" patternUnits="userSpaceOnUse"><rect class="cloth" width="22" height="22"/><rect class="band" x="3" width="3" height="22"/><rect class="band" x="9" width="1" height="22"/></pattern>`,
      `<pattern id="${pid}" width="22" height="22" patternUnits="userSpaceOnUse"><rect class="cloth" width="22" height="22"/><circle class="band" cx="5.5" cy="5.5" r="2.6"/><circle class="band" cx="16.5" cy="16.5" r="2.6"/></pattern>`,
      `<pattern id="${pid}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect class="cloth" width="9" height="9"/><rect class="band" width="2.5" height="9" opacity=".7"/></pattern>`,
    ][v];
    const leaves = (pts) => pts.map(([x, y, a]) => `<ellipse class="leaf" cx="${x}" cy="${y}" rx="9" ry="3.6" transform="rotate(${a} ${x} ${y})"/>`).join("");
    const dish = [
      // round plate with a napkin and fork
      `<g transform="rotate(-7 95 116)"><rect class="napkin" x="40" y="26" width="104" height="176"/><rect class="napkin-line" x="47" y="33" width="90" height="162"/>
         <rect class="cutlery" x="89" y="78" width="6" height="104" rx="3"/><path class="cutlery" d="M80 46h24v30a12 12 0 0 1-24 0z"/></g>
       <circle class="shade" cx="254" cy="128" r="96"/><circle class="china" cx="246" cy="120" r="96"/><circle class="rimline" cx="246" cy="120" r="72"/>
       <circle class="food" cx="246" cy="122" r="50"/><circle class="food-2" cx="224" cy="104" r="13"/><circle class="food-2" cx="266" cy="140" r="10"/>
       <circle class="food-2" cx="258" cy="96" r="7"/><circle class="cream" cx="236" cy="142" r="8"/>${leaves([[268, 112, -30], [228, 132, 40], [246, 92, 10]])}`,
      // oval platter with fillets
      `<ellipse class="shade" cx="210" cy="128" rx="136" ry="88"/><ellipse class="china" cx="202" cy="120" rx="136" ry="88"/><ellipse class="rimline" cx="202" cy="120" rx="112" ry="66"/>
       <ellipse class="food" cx="178" cy="112" rx="56" ry="24" transform="rotate(-14 178 112)"/><ellipse class="food" cx="226" cy="134" rx="52" ry="22" transform="rotate(-8 226 134)"/>
       <circle class="food-2" cx="150" cy="140" r="9"/><circle class="food-2" cx="166" cy="148" r="8"/><circle class="food-2" cx="260" cy="100" r="9"/>
       <circle class="cream" cx="246" cy="96" r="10"/>${leaves([[204, 100, -60], [212, 104, 20], [190, 142, 70], [140, 116, -20]])}`,
      // bowl of soup with a spoon
      `<g transform="rotate(18 80 120)"><ellipse class="cutlery" cx="80" cy="58" rx="16" ry="22"/><rect class="cutlery" x="76" y="76" width="8" height="110" rx="4"/></g>
       <circle class="shade" cx="258" cy="126" r="92"/><circle class="china" cx="250" cy="118" r="92"/><circle class="china-2" cx="250" cy="118" r="78"/>
       <circle class="food" cx="250" cy="118" r="70"/><path class="swirl" d="M222 106c10-22 52-22 58 6s-30 40-50 22"/>
       <circle class="food-2" cx="286" cy="150" r="5"/><circle class="food-2" cx="214" cy="146" r="4"/><circle class="food-2" cx="270" cy="84" r="4"/>${leaves([[244, 120, 30], [258, 128, -40]])}`,
      // cast-iron pan
      `<rect class="iron" x="0" y="110" width="170" height="20" rx="10"/><circle class="shade" cx="262" cy="128" r="100"/>
       <circle class="iron" cx="254" cy="120" r="100"/><circle class="iron-2" cx="254" cy="120" r="86"/>
       <circle class="food" cx="226" cy="98" r="24"/><circle class="food" cx="280" cy="108" r="22"/><circle class="food" cx="248" cy="150" r="26"/>
       <circle class="food-2" cx="204" cy="138" r="12"/><circle class="food-2" cx="292" cy="148" r="11"/><circle class="food-2" cx="262" cy="76" r="10"/>
       <circle class="cream" cx="254" cy="120" r="7"/>${leaves([[230, 128, 20], [276, 132, -50], [256, 96, 70]])}`,
    ][v];
    return `<svg class="plate-svg" viewBox="0 0 390 232" preserveAspectRatio="xMidYMid slice" style="--h:${r.hue}" aria-hidden="true" focusable="false">
      <defs>${pattern}</defs><rect width="390" height="232" fill="url(#${pid})"/>${dish}</svg>`;
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- overlays: open, animated close, focus trap ----------
  function hideAnimated(els, done) {
    if (RM.matches) { els.forEach((e) => (e.hidden = true)); done && done(); return; }
    let finished = false;
    const end = () => {
      if (finished) return; finished = true;
      els.forEach((e) => { e.hidden = true; e.classList.remove("closing"); });
      done && done();
    };
    els.forEach((e) => e.classList.add("closing"));
    els[0].addEventListener("animationend", end, { once: true });
    setTimeout(end, 320);
  }
  const lockScroll = () => document.body.classList.add("locked");
  const unlockScroll = () => { if ($("#sheet").hidden && $("#contents").hidden && $("#solving").hidden) document.body.classList.remove("locked"); };
  function activeModal() {
    if (!$("#solving").hidden) return $("#solving");
    if (!$("#sheet").hidden) return $("#sheet");
    if (!$("#contents").hidden) return $("#contents");
    return null;
  }
  function trapTab(e) {
    const m = activeModal(); if (!m) return;
    const f = $$("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])", m)
      .filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------- routing ----------
  let current = null;
  function parseHash() { const h = location.hash.replace(/^#\/?/, "") || "plan"; return h.split("/"); }
  function route() {
    const [id, arg] = parseHash();
    const page = $("#page");
    page.classList.remove("enter-next", "enter-prev");
    if (current !== null) {
      void page.offsetWidth;
      page.classList.add(pageIndex(id) < pageIndex(current) ? "enter-prev" : "enter-next");
    }
    current = id;
    render(id, arg);
    window.scrollTo(0, 0);
    setRunningHead(id);
  }
  function setRunningHead(id) {
    const i = Math.floor(pageIndex(id));
    const p = PAGES[i];
    const run = id === "recipe" ? (recipe(parseHash()[1]) || {}).name || "Recipes" : p.run;
    $("#runningHead").innerHTML = `<span class="folio-n">${i + 1}</span>${esc(run)}`;
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
  function rerender() { const [id, arg] = parseHash(); const y = window.scrollY; render(id, arg); window.scrollTo(0, y); }

  function turnLinks(id) {
    const i = PAGES.findIndex((p) => p.id === id);
    const prev = PAGES[i - 1], next = PAGES[i + 1];
    return `<nav class="turn" aria-label="Turn the page">
      ${prev ? `<a class="prev" href="#${prev.id}"><span class="kicker">Previous page</span><span class="t">${prev.title}</span></a>` : ""}
      ${next ? `<a class="next" href="#${next.id}"><span class="kicker">Next page</span><span class="t">${next.title}</span></a>` : ""}
    </nav><p class="folio" aria-label="Page ${i + 1}">${i + 1}</p>`;
  }

  // ---------- PLAN: this week's brief ----------
  function briefStandfirst() {
    const s = state.schedule;
    const usable = usableRecipes();
    const nMust = state.goals.filter((g) => g.strictness === "must").length;
    return `${cap(word(s.days))} days, ${word(s.meals.length)} ${plural(s.meals.length, "meal", "meals")} a day: <b>${mealsPlanned()} to plan</b>. ${cap(word(state.goals.length))} ${plural(state.goals.length, "goal", "goals")}, ${word(nMust)} of them firm. ${cap(word(usable.length))} ${plural(usable.length, "recipe", "recipes")} in play.`;
  }
  function viewPlan() {
    const s = state.schedule;
    const usable = usableRecipes();
    const many = s.meals.length >= 4;
    const d0 = dayDate(0);
    return `
      <header class="cover">
        <p class="kicker">${issueLine()}</p>
        <h1 class="cover-title display">This week’s <em>brief</em></h1>
        <p class="standfirst dropcap" id="standfirst">${briefStandfirst()}</p>
        <nav aria-label="In this brief"><ol class="brief-toc">
          ${[["s1", "The schedule"], ["s2", "The goals"], ["s3", "Pantry rules"], ["s4", "Time allowed"]].map(([id, t], i) => `<li><a href="#plan" data-jump="${id}"><span class="n">${i + 1}</span>${t}</a></li>`).join("")}
        </ol></nav>
      </header>

      <section class="section" id="sec-s1" aria-labelledby="s1">
        <div class="section-head"><span class="section-no" aria-hidden="true">1</span><h2 class="section-title" id="s1">The schedule</h2>
          <button class="text-btn" type="button" id="editSchedule" aria-label="Change the schedule">Change</button></div>
        <p class="serif-text sched-line">From <b>${DAYS[d0.getDay()]} ${d0.getDate()} ${MONTHS[d0.getMonth()]}</b>, for <b>${word(s.days)} ${plural(s.days, "day", "days")}</b>: ${s.meals.map(esc).join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>
        <div class="sched" style="--cols:${s.meals.length}" role="group" aria-label="Meals to plan. Tap a meal to skip it; tap a day to let the planner leave some meals empty.">
          <div class="sched-h" aria-hidden="true"></div>
          ${s.meals.map((m) => `<div class="sched-h" aria-hidden="true" title="${esc(m)}">${esc(many && m.length > 5 ? m.slice(0, 3) + "." : m)}</div>`).join("")}
          ${Array.from({ length: s.days }, (_, d) => {
            const dt = dayDate(d);
            const al = s.atLeast[d];
            return `<button type="button" class="sched-day" data-day="${d}" aria-label="${DAYS[dt.getDay()]} ${dt.getDate()}${al ? `, at least ${al} meals` : ""}. Set how many meals must be served">
                <span class="d">${DAYS[dt.getDay()].slice(0, 3)}<span class="n">${dt.getDate()}</span></span>
                ${al ? `<span class="al">at least ${al}</span>` : ""}
              </button>` +
              s.meals.map((m) => {
                const sk = isSkipped(d, m);
                return `<button type="button" class="cell ${sk ? "skipped" : ""}" data-day="${d}" data-meal="${esc(m)}" aria-pressed="${!sk}" aria-label="${esc(m)} on ${DAYS[dt.getDay()]}, ${sk ? "skipped" : "planned"}"><span class="mark"></span><span class="out" aria-hidden="true">out</span></button>`;
              }).join("");
          }).join("")}
        </div>
        <div class="legend" aria-hidden="true"><span><i class="k-dot"></i>A place is set</span><span><i class="k-out"></i>Skipped, eating out</span></div>
        <p class="section-intro">Tap a meal to skip it. Tap a day to say “at least”, which lets the planner leave some of that day’s meals empty.</p>
      </section>

      <section class="section" id="sec-s2" aria-labelledby="s2">
        <div class="section-head"><span class="section-no" aria-hidden="true">2</span><h2 class="section-title" id="s2">The goals</h2>
          <button class="text-btn" type="button" id="addGoal" aria-label="Add a goal">Add goal</button></div>
        <ul class="goals">
          ${state.goals.map((g) => `<li><button type="button" class="goal ${g.strictness}" data-goal="${g.id}">
            <span class="goal-tag"><span class="strict">${g.strictness === "must" ? "Must" : "Preferred"}</span>${g.strictness === "prefer" ? impDots(g.importance || 3) : ""}<span class="edit" aria-hidden="true">Edit</span></span>
            <span class="goal-text" style="display:block">${goalSentence(g)}.</span>
          </button></li>`).join("") || `<li class="usable" style="padding:16px 0">No goals yet. Add one, or the planner only fills the schedule.</li>`}
        </ul>
        <p class="section-intro"><b>Must</b> goals are kept or there is no plan. <em>Preferred</em> goals are weighed against each other by importance.</p>
      </section>

      <section class="section" id="sec-s3" aria-labelledby="s3">
        <div class="section-head"><span class="section-no" aria-hidden="true">3</span><h2 class="section-title" id="s3">Pantry rules</h2>
          <button class="text-btn" type="button" id="editRules" aria-label="Change the pantry rules">Change</button></div>
        <ul class="rules">
          ${state.filters.filter((f) => f.mode !== "any").map((f) => `<li><button type="button" class="rule-tag ${f.mode}" data-rule="${esc(f.tag)}" aria-label="${f.mode === "never" ? "Never" : "Only"} ${esc(f.tag)}${f.note ? `, ${esc(f.note)}` : ""}. Change">
            <span class="mode">${f.mode === "never" ? "Never" : "Only"}</span><span class="tagname">${esc(f.tag)}</span>${f.note ? `<span class="note">${esc(f.note)}</span>` : ""}
          </button></li>`).join("") || `<li class="usable">No rules: every recipe may be used.</li>`}
        </ul>
        <p class="usable"><span>${usable.length} of ${D.recipes.length} recipes can be used.</span><a href="#recipes" class="text-btn plain">See them</a></p>
      </section>

      <section class="section" id="sec-s4" aria-labelledby="s4">
        <div class="section-head"><span class="section-no" aria-hidden="true">4</span><h2 class="section-title" id="s4">Time allowed</h2></div>
        <div class="time-row">
          <p class="serif-text time-text">Up to <b>${state.maxSeconds}</b> seconds to think it over.</p>
          <div class="stepper" role="group" aria-label="Most time to spend">
            <button type="button" id="tMinus" aria-label="Less time" ${state.maxSeconds <= 5 ? "disabled" : ""}>−</button>
            <output class="val" aria-live="polite">${state.maxSeconds} s</output>
            <button type="button" id="tPlus" aria-label="More time" ${state.maxSeconds >= 300 ? "disabled" : ""}>+</button>
          </div>
        </div>
        <p class="section-intro">If time runs out, you still get the best plan found so far.</p>
      </section>

      <div class="compose">
        <button class="compose-btn" type="button" id="compose">Compose the week<small>Make plan</small></button>
        <p class="compose-note" id="composeNote">Picks a recipe and a portion size for each of the ${mealsPlanned()} meals.</p>
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
      // keep "at least" below the number of planned meals that day
      const planned = state.schedule.meals.filter((x) => !isSkipped(d, x)).length;
      if (state.schedule.atLeast[d] != null && state.schedule.atLeast[d] >= planned) { delete state.schedule.atLeast[d]; const al = $(`.sched-day[data-day="${d}"] .al`); al && al.remove(); }
      $("#composeNote").textContent = `Picks a recipe and a portion size for each of the ${mealsPlanned()} meals.`;
      $("#standfirst").innerHTML = briefStandfirst();
    }));
    $$("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const sec = $("#sec-" + a.dataset.jump);
      sec.scrollIntoView({ behavior: RM.matches ? "auto" : "smooth", block: "start" });
      sec.querySelector("h2").setAttribute("tabindex", "-1"); sec.querySelector("h2").focus({ preventScroll: true });
    }));
    $$(".sched-day").forEach((b) => b.addEventListener("click", () => sheetAtLeast(+b.dataset.day)));
    $("#editSchedule").addEventListener("click", sheetSchedule);
    $$(".goal").forEach((b) => b.addEventListener("click", () => sheetGoal(b.dataset.goal)));
    $("#addGoal").addEventListener("click", () => sheetGoal(null));
    $("#editRules").addEventListener("click", sheetRules);
    $$(".rule-tag").forEach((b) => b.addEventListener("click", sheetRules));
    $("#tMinus").addEventListener("click", () => { state.maxSeconds = Math.max(5, state.maxSeconds - (state.maxSeconds > 60 ? 30 : 5)); rerender(); $("#tMinus").disabled ? $("#tPlus").focus() : $("#tMinus").focus(); });
    $("#tPlus").addEventListener("click", () => { state.maxSeconds = Math.min(300, state.maxSeconds + (state.maxSeconds >= 60 ? 30 : 5)); rerender(); $("#tPlus").disabled ? $("#tMinus").focus() : $("#tPlus").focus(); });
    $("#compose").addEventListener("click", startSolving);
  }

  // ---------- sheets ----------
  let lastFocus = null;
  function openSheet(title, html, bind, opts = {}) {
    if ($("#sheet").hidden) lastFocus = document.activeElement;
    $("#sheet").classList.remove("closing"); $("#sheetBackdrop").classList.remove("closing");
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false;
    $("#sheet").scrollTop = 0;
    lockScroll();
    bind && bind($("#sheetBody"));
    const target = (opts.focus && $(opts.focus, $("#sheetBody"))) || $("#sheetTitle");
    setTimeout(() => target.focus(), 60);
  }
  function closeSheet(opts = {}) {
    if ($("#sheet").hidden) return;
    const back = lastFocus;
    hideAnimated([$("#sheet"), $("#sheetBackdrop")], () => {
      unlockScroll();
      if (!opts.noRefocus && back && document.body.contains(back)) back.focus({ preventScroll: true });
    });
  }

  function sheetAtLeast(d) {
    const s = state.schedule;
    const planned = s.meals.filter((m) => !isSkipped(d, m)).length;
    let v = Math.min(s.atLeast[d] ?? planned, planned);
    const dt = dayDate(d);
    const html = `
      <p class="sheet-preview" id="alPrev" aria-live="polite"></p>
      <div class="em-row">
        <span class="label" id="alL">Meals served, at least</span>
        <div class="stepper" role="group" aria-labelledby="alL">
          <button type="button" id="alM" aria-label="Fewer">−</button><output class="val" id="alV"></output><button type="button" id="alP" aria-label="More">+</button>
        </div>
      </div>
      <p class="edit-hint">${cap(word(planned))} ${plural(planned, "meal is", "meals are")} planned on ${DAYS[dt.getDay()]}. “At least” lets the planner leave some of them empty.</p>
      <div class="sheet-actions"><button class="btn primary" type="button" id="alSave">Done</button></div>`;
    openSheet(`${DAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`, html, (b) => {
      const upd = () => {
        $("#alV", b).textContent = v === planned ? "all" : v;
        $("#alPrev", b).innerHTML = planned === 0 ? `No meals are planned on ${DAYS[dt.getDay()]}.`
          : v === planned ? `All <b>${planned}</b> planned meals are served.` : `At least <b>${v} of ${planned}</b> meals are served.`;
        $("#alM", b).disabled = v <= 0; $("#alP", b).disabled = v >= planned;
      };
      upd();
      $("#alM", b).onclick = () => { v--; upd(); if ($("#alM", b).disabled) $("#alP", b).focus(); };
      $("#alP", b).onclick = () => { v++; upd(); if ($("#alP", b).disabled) $("#alM", b).focus(); };
      $("#alSave", b).onclick = () => { if (v >= planned) delete s.atLeast[d]; else s.atLeast[d] = v; closeSheet(); rerender(); };
    });
  }

  function sheetSchedule() {
    const s = state.schedule;
    const draft = { start: s.start, days: s.days, meals: s.meals.slice() };
    const html = `
      <div class="field"><label for="sStart">Starts on</label><input class="input serif" type="date" id="sStart" value="${draft.start}"></div>
      <div class="field"><span class="label" id="sDaysL">Number of days</span>
        <div class="stepper" role="group" aria-labelledby="sDaysL"><button type="button" id="sdM" aria-label="Fewer days">−</button><output class="val" id="sdV"></output><button type="button" id="sdP" aria-label="More days">+</button></div></div>
      <fieldset><legend>Meals each day</legend><div id="mealRows"></div>
        <button type="button" class="text-btn" id="addMeal">Add a meal</button>
        <p class="edit-hint">Meal names are labels for you; the planner only counts meals.</p></fieldset>
      <div class="sheet-actions"><button class="btn ghost" type="button" id="schCancel">Cancel</button><button class="btn primary" type="button" id="schSave">Done</button></div>`;
    openSheet("The schedule", html, (b) => {
      const rows = () => {
        $("#mealRows", b).innerHTML = draft.meals.map((m, i) => `<div class="meal-name-row"><input class="input serif" aria-label="Name of meal ${i + 1}" value="${esc(m)}" data-i="${i}"><button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove ${esc(m)}" ${draft.meals.length <= 1 ? "disabled" : ""}>×</button></div>`).join("");
        $$("[data-i]", b).forEach((inp) => inp.addEventListener("input", () => (draft.meals[+inp.dataset.i] = inp.value)));
        $$("[data-rm]", b).forEach((x) => x.addEventListener("click", () => { draft.meals.splice(+x.dataset.rm, 1); rows(); $("#addMeal", b).focus(); }));
      };
      const days = () => { $("#sdV", b).textContent = draft.days; $("#sdM", b).disabled = draft.days <= 1; $("#sdP", b).disabled = draft.days >= 14; };
      rows(); days();
      $("#sdM", b).onclick = () => { draft.days--; days(); };
      $("#sdP", b).onclick = () => { draft.days++; days(); };
      $("#addMeal", b).onclick = () => { if (draft.meals.length >= 6) return toast("At most 6 meals a day."); draft.meals.push(`Meal ${draft.meals.length + 1}`); rows(); $$("[data-i]", b).pop().select(); };
      $("#sStart", b).onchange = (e) => (draft.start = e.target.value || draft.start);
      $("#schCancel", b).onclick = closeSheet;
      $("#schSave", b).onclick = () => {
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
        <div class="field"><label for="gMin">Least <span id="uMin"></span></label><input class="input serif" id="gMin" inputmode="decimal" placeholder="none"></div>
        <div class="field"><label for="gMax">Most <span id="uMax"></span></label><input class="input serif" id="gMax" inputmode="decimal" placeholder="none"></div>
      </div>
      <fieldset><legend>Applies to</legend><div class="seg" id="gScope">
        <button type="button" data-s="day">Each day</button><button type="button" data-s="daily_average">Daily average</button><button type="button" data-s="plan_total">Plan total</button></div></fieldset>
      <fieldset><legend>How strict</legend><div class="seg" id="gStrict">
        <button type="button" data-t="must">Must</button><button type="button" data-t="prefer">Prefer</button></div></fieldset>
      <fieldset id="gImpF"><legend>Importance</legend><div class="imp-pick" id="gImp">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="Importance ${n} of 5">${n}</button>`).join("")}</div></fieldset>
      <div class="sheet-actions">
        ${existing ? `<button class="btn ghost" type="button" id="gDel">Remove goal</button>` : ""}
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
        $$("#gImp button", b).forEach((c) => { c.classList.toggle("on", +c.dataset.n <= (g.importance || 3)); c.setAttribute("aria-pressed", String(+c.dataset.n === (g.importance || 3))); c.disabled = g.strictness === "must"; });
        $("#gImpF", b).style.opacity = g.strictness === "must" ? ".45" : "1";
        $("#gPrev", b).innerHTML = (g.min == null && g.max == null) ? `<em>Give a least amount, a most amount or both.</em>` :
          `${goalSentence(g)}: <em>${g.strictness === "must" ? "must" : `preferred, importance ${g.importance || 3}`}</em>.`;
      };
      const num = (v) => { v = v.replace(",", ".").trim(); return v === "" || isNaN(+v) ? null : +v; };
      $("#gMin", b).oninput = (e) => { g.min = num(e.target.value); upd(); };
      $("#gMax", b).oninput = (e) => { g.max = num(e.target.value); upd(); };
      $$("#gAttr .chip", b).forEach((c) => (c.onclick = () => { g.attribute = c.dataset.a; upd(); }));
      $$("#gScope button", b).forEach((c) => (c.onclick = () => { g.scope = c.dataset.s; upd(); }));
      $$("#gStrict button", b).forEach((c) => (c.onclick = () => { g.strictness = c.dataset.t; if (c.dataset.t === "prefer") g.importance = g.importance || 3; upd(); }));
      $$("#gImp button", b).forEach((c) => (c.onclick = () => { g.importance = +c.dataset.n; upd(); }));
      upd();
      $("#gSave", b).onclick = () => {
        if (g.min == null && g.max == null) { $("#gMin", b).focus(); return toast("Give a least amount, a most amount or both."); }
        if (g.min != null && g.max != null && g.min > g.max) { $("#gMax", b).focus(); return toast("The least amount must not be more than the most."); }
        g.name = g.name || attr(g.attribute).name;
        if (existing) Object.assign(existing, g); else state.goals.push(g);
        closeSheet(); rerender(); toast(existing ? "Goal changed." : "Goal added.");
      };
      if (existing) $("#gDel", b).onclick = () => { state.goals = state.goals.filter((x) => x.id !== id); closeSheet({ noRefocus: true }); rerender(); $("#addGoal").focus({ preventScroll: true }); toast("Goal removed."); };
    });
  }

  function sheetRules() {
    const draft = D.tags.map((t) => { const f = state.filters.find((x) => x.tag === t); return { tag: t, mode: f ? f.mode : "any", note: f && f.note }; });
    const html = `
      <p class="sheet-preview" id="rPrev" aria-live="polite"></p>
      <div class="filter-list">${draft.map((f, i) => `<div class="filter-row"><span class="tn" id="tn${i}">${esc(f.tag)}</span>
        <div class="seg" role="group" aria-labelledby="tn${i}">${["any", "only", "never"].map((m) => `<button type="button" data-i="${i}" data-m="${m}">${cap(m)}</button>`).join("")}</div></div>`).join("")}</div>
      <div class="sheet-actions"><button class="btn primary" type="button" id="rSave">Done</button></div>`;
    openSheet("Pantry rules", html, (b) => {
      const upd = () => {
        $$("[data-m]", b).forEach((x) => x.setAttribute("aria-pressed", String(draft[+x.dataset.i].mode === x.dataset.m)));
        const n = usableRecipes(draft.filter((f) => f.mode !== "any")).length;
        $("#rPrev", b).innerHTML = n ? `<b>${n} of ${D.recipes.length}</b> recipes can be used.` : `<b>No recipe</b> fits these rules. Loosen one, or there will be no plan.`;
      };
      $$("[data-m]", b).forEach((x) => (x.onclick = () => { draft[+x.dataset.i].mode = x.dataset.m; upd(); }));
      upd();
      $("#rSave", b).onclick = () => { state.filters = draft.filter((f) => f.mode !== "any"); closeSheet(); rerender(); };
    });
  }

  // ---------- solving: the week is typeset line by line ----------
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
    const clash = state.demo === "clash";
    const target = clash ? 3 : state.demo === "time_ran_out" ? max : Math.min(D.result.solvedIn, max);
    const pool = (usableRecipes().length ? usableRecipes() : D.recipes).map((r) => r.name);
    const nDays = state.schedule.days;
    const lastMeal = state.schedule.meals.length - 1;
    let t = 0, stopping = false;
    lastFocus = document.activeElement;
    el.innerHTML = `<div class="solving-inner">
      <p class="kicker">${issueLine()}</p>
      <h2 class="solving-title display" id="solvingTitle"><em>Composing</em> the week</h2>
      <div class="solving-count"><span class="big" id="sc">0</span><small>of ${max} seconds</small></div>
      <div class="ruler" role="progressbar" aria-label="Time used" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="0"><i id="sb"></i></div>
      <ol class="galley" aria-hidden="true">${Array.from({ length: nDays }, (_, i) => `<li data-g="${i}"><span class="gd sc">${DAYS[dayDate(i).getDay()].slice(0, 3)}</span><span class="gx">…</span></li>`).join("")}</ol>
      <p class="solving-line" id="sl" aria-live="polite">${musings[0]}</p>
      <button class="btn block" type="button" id="solveCancel">Cancel</button>
    </div>`;
    el.classList.remove("closing");
    el.hidden = false;
    lockScroll();
    $("#solveCancel").focus();
    const rows = $$(".galley li", el);
    const stepMs = 3200 / Math.max(target, 1); // demo: a whole solve takes ~3 s
    const shuffle = () => {
      if (RM.matches) return;
      for (let k = 0; k < 2; k++) {
        const row = rows[Math.floor(Math.random() * rows.length)];
        if (!row) return;
        row.classList.remove("flick"); void row.offsetWidth; row.classList.add("flick");
        $(".gx", row).textContent = pool[Math.floor(Math.random() * pool.length)];
      }
    };
    const close = (after) => hideAnimated([el], () => { unlockScroll(); after && after(); });
    const tick = () => {
      t++;
      $("#sc").textContent = t;
      $("#sb").style.width = (t / max) * 100 + "%";
      $(".ruler", el).setAttribute("aria-valuenow", t);
      if (t % 2 === 0 && !stopping) $("#sl").textContent = musings[(t / 2) % musings.length];
      shuffle();
      if (t >= target) return finish();
      solveTimer = setTimeout(tick, stepMs);
    };
    solveTimer = setTimeout(tick, stepMs);
    $("#solveCancel").onclick = () => {
      stopping = true; clearTimeout(solveTimer);
      $("#solveCancel").textContent = "Stopping…"; $("#solveCancel").disabled = true;
      $("#sl").textContent = "Putting the pencils down.";
      setTimeout(() => close(() => { toast("Stopped before any plan was found."); if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus({ preventScroll: true }); }), 600);
    };
    function finish() {
      $("#solveCancel").disabled = true;
      $("#sl").textContent = clash ? "These rules can’t all be met." : "The menu is set.";
      rows.forEach((row, i) => setTimeout(() => {
        const slot = D.result.days[i] && (D.result.days[i].meals[lastMeal] || D.result.days[i].meals.find(Boolean));
        $(".gx", row).textContent = clash ? "—" : slot ? recipe(slot[0]).name : "—";
        row.classList.add("set");
      }, RM.matches ? 0 : i * 60));
      setTimeout(() => {
        state.result = clone(D.result);
        state.result.status = state.demo === "time_ran_out" ? "time_ran_out" : "optimal";
        state.result.solvedIn = target;
        state.hasResult = true; state.saved = false; state.savedId = null; state.clashPrefer = {};
        state.justSolved = true;
        close();
        go("menu");
        $("#page").focus({ preventScroll: true });
      }, RM.matches ? 400 : 650 + nDays * 60);
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
          const under = (x) => g.min != null && x.v < g.min;
          const worst = bad.reduce((w, x) => (under(x) ? (x.v < w.v ? x : w) : (x.v > w.v ? x : w)), bad[0]);
          text = `${cap(name)} was ${under(worst) ? "under" : "over"} ${fmt(under(worst) ? g.min : g.max)} ${a.unit} on ${word(bad.length)} of ${word(n)} days.`;
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

  function demoBox() {
    return `<div class="demo" role="group" aria-labelledby="demoL"><p class="label" id="demoL">Prototype only: show the result as</p>
      <div class="seg">${[["optimal", "Plan found"], ["time_ran_out", "Time ran out"], ["clash", "No plan possible"]].map(([k, l]) => `<button type="button" data-demo="${k}" aria-pressed="${state.demo === k}">${l}</button>`).join("")}</div></div>`;
  }

  function viewMenu() {
    const demo = demoBox();
    if (state.demo === "clash") return viewClash(demo);
    if (!state.hasResult) {
      return `<header class="cover" style="padding-bottom:16px"><p class="kicker">${issueLine()}</p></header>
        ${demo}
        <article class="menu-card blank-card" aria-labelledby="menuTitle"><div class="menu-card-inner">
          <p class="ornament" aria-hidden="true">❦</p>
          <h1 class="menu-title display" id="menuTitle">The Menu</h1>
          <div class="blank-lines" aria-hidden="true"><i></i><i></i><i></i></div>
          <p class="standfirst">Nothing is on the menu this week. Compose the week from the brief.</p>
          <button class="btn primary" type="button" id="composeHere">Compose the week</button>
          <a class="text-btn plain" href="#plan">Read the brief first</a>
        </div></article>
        ${turnLinks("menu")}`;
    }
    const r = state.result;
    const meals = state.schedule.meals;
    const days = r.days.slice(0, state.schedule.days);
    const verdicts = goalVerdicts();
    const missed = verdicts.filter((v) => !v.ok);
    const missedMust = missed.some((v) => v.g.strictness === "must");
    const nDishes = days.reduce((s, d) => s + d.meals.slice(0, meals.length).filter(Boolean).length, 0);
    const statusText = r.status === "optimal" ? "The best plan possible" : "Time ran out, so this may not be the best plan";
    const keyAttr = attr("cost") || D.attributes[0];
    const keyTotal = days.reduce((s, d) => s + d.totals[keyAttr.id], 0);
    const reveal = state.justSolved && !RM.matches;
    state.justSolved = false;
    return `
      <header class="cover" style="padding-bottom:16px"><p class="kicker">${issueLine()}</p></header>
      ${demo}
      <article class="menu-card ${reveal ? "reveal" : ""}" aria-labelledby="menuTitle">
        <span class="stamp ${r.status === "optimal" ? "" : "warn"}">${r.status === "optimal" ? "Best plan" : "Time ran out"}</span>
        <div class="menu-card-inner">
        <div class="menu-head">
          <p class="ornament" aria-hidden="true">❦</p>
          <h1 class="menu-title display" id="menuTitle">The Menu</h1>
          <p class="menu-sub">for ${dateRange()}</p>
          <p class="menu-count">${cap(word(days.length))} days, ${word(nDishes)} dishes</p>
          <p class="menu-saved ${state.saved ? "is-saved" : ""}">${state.saved ? "Filed in the archive" : "New, not saved yet"}</p>
        </div>
        ${days.map((d, i) => {
          const dt = dayDate(i);
          const miss = dayMisses(d);
          return `<section class="day" style="--i:${i}" aria-labelledby="d${i}">
            <div class="day-head"><h2 class="dname" id="d${i}">${DAYS[dt.getDay()]}</h2><span class="ddate">${dt.getDate()} <span class="sc">${MONTHS[dt.getMonth()].slice(0, 3)}</span></span></div>
            ${meals.map((m, j) => {
              const slot = d.meals[j];
              if (!slot) return `<div class="course skip"><span class="meal">${esc(m)}</span><span class="dish-skip">Dining out</span></div>`;
              const rc = recipe(slot[0]), p = slot[1];
              return `<div class="course"><span class="meal">${esc(m)}</span>
                <a class="dish" href="#recipe/${rc.id}"><span class="dname-t">${esc(rc.name)}</span>${p !== 1 ? `<span class="portion" aria-label="${frac(p)} portions">× ${frac(p)}</span>` : ""}</a>
                <span class="margin-note"><b>${fmt(rc.per.energy * p)}</b> kcal<br>${fmt(rc.per.protein * p)} g prot.</span>
              </div>`;
            }).join("")}
            <p class="day-totals"><span class="visually-hidden">Day totals:</span>
              ${D.attributes.map((a) => `<span class="${miss[a.id] ? "miss" : ""}">${fmt(d.totals[a.id])} ${a.unit}${a.id === "energy" || a.id === "cost" ? "" : " " + a.name.toLowerCase()}${miss[a.id] ? `<span class="visually-hidden"> (goal missed)</span>` : ""}</span>`).join("")}
            </p>
          </section>`;
        }).join("")}
        <div class="menu-end"><p class="ornament" aria-hidden="true">❦</p>
          <p class="menu-key">Margins: energy and protein for each dish. <span class="dag">†</span> a day goal missed.</p></div>
      </div></article>

      <section class="colophon" aria-labelledby="colo">
        <p class="kicker">Colophon</p>
        <h2 id="colo">How the week turned out</h2>
        <p class="standfirst dropcap">${statusText}, composed in ${r.solvedIn} seconds. ${missed.length ? `${cap(word(missed.length))} ${missedMust ? "" : "preferred "}${plural(missed.length, "goal was", "goals were")} missed; everything else held.` : "Every goal was met."}</p>
        <p class="pull"><span class="big">${fmt(keyTotal)}<small>${keyAttr.unit}</small></span>for the week’s ${keyAttr.id === "cost" ? "food" : keyAttr.name.toLowerCase()}, about ${fmt(Math.round(keyTotal / days.length))} ${keyAttr.unit} a day.</p>
        <ul class="verdicts">
          ${verdicts.map((v) => `<li class="${v.ok ? "ok" : "missed"}"><span class="v" role="img" aria-label="${v.ok ? "Met" : "Missed"}">${v.ok ? "✓" : "†"}</span><p>${esc(v.text)}${v.sub ? `<span class="sub">${esc(v.sub)}</span>` : ""}${v.ok ? "" : `<span class="sub">${v.g.strictness === "must" ? "Must" : `Preferred, importance ${v.g.importance}`}</span>`}</p></li>`).join("")}
        </ul>
        <table class="totals-table"><caption class="visually-hidden">Plan totals</caption>
          <thead><tr><th scope="col">For the week</th><th scope="col">Total</th><th scope="col">A day</th></tr></thead>
          <tbody>${D.attributes.map((a) => { const t = days.reduce((s, d) => s + d.totals[a.id], 0); return `<tr><th scope="row">${a.name}</th><td>${fmt(t)} ${a.unit}</td><td>${fmt(t / days.length)} ${a.unit}</td></tr>`; }).join("")}</tbody>
        </table>
        <div class="menu-actions">
          ${state.saved ? `<p class="saved-note">Filed in the archive as Week ${isoWeek(dayDate(0))}.</p>` : `<button class="btn primary block" type="button" id="mSave">Save to the archive</button>`}
          <div class="btn-row">${isToday() ? `<button class="btn" type="button" disabled>Used for today</button>` : `<button class="btn" type="button" id="mToday">Use for today</button>`}<button class="btn ghost" type="button" id="mDiscard">Discard</button></div>
        </div>
      </section>
      ${turnLinks("menu")}`;
  }
  function isToday() { const p = state.archive.find((x) => x.id === state.savedId); return !!(p && p.today); }

  function viewClash(demo) {
    const items = [
      { key: "g1", text: () => goalSentence(state.goals.find((g) => g.id === "g1") || D.plan.goals[0]), where: "Clashes over the whole plan" },
      { key: "g5", text: () => `At most <b>650 kr</b> <span class="attr">cost</span>, over the whole plan`, where: "Clashes over the whole plan" },
      { key: "sched", text: () => `All planned meals are served on <b>Friday</b>`, where: "Clashes on Friday 27, in the schedule", schedule: true },
    ];
    return `
      <header class="cover" style="padding-bottom:16px"><p class="kicker">${issueLine()}</p></header>
      ${demo}
      <article class="editors-note" aria-labelledby="enT">
        <div class="note-card">
          <p class="kicker">Editor’s note</p>
          <h1 id="enT">No plan possible</h1>
          <p class="lede dropcap">These rules can’t all be met at once. Each one is a Must; loosen one and the week can be composed. Fixing these may show another clash.</p>
        </div>
        <ol class="clash-list">
          ${items.map((it) => {
            const pref = state.clashPrefer[it.key];
            return `<li class="clash-item ${pref ? "fixed" : ""}">
              <p class="where">${it.where}</p>
              <p class="ct">${it.text()}: <em>${pref ? "will be preferred" : "must"}</em>.</p>
              ${it.schedule ? `<a class="text-btn" href="#plan">Change the schedule</a>` : `<button type="button" class="btn small ${pref ? "ghost" : ""}" data-prefer="${it.key}">${pref ? "Keep Must" : "Make Prefer"}</button>`}
            </li>`;
          }).join("")}
        </ol>
        <p class="signature">The planner</p>
        <button class="btn primary block" type="button" id="tryAgain">Try again</button>
      </article>
      ${turnLinks("menu")}`;
  }

  function bindMenu() {
    $$("[data-demo]").forEach((b) => b.addEventListener("click", () => {
      state.demo = b.dataset.demo;
      if (state.demo !== "clash") { state.hasResult = true; state.result.status = state.demo; state.result.solvedIn = state.demo === "time_ran_out" ? state.maxSeconds : D.result.solvedIn; }
      rerender();
      const again = $(`[data-demo="${b.dataset.demo}"]`); again && again.focus({ preventScroll: true });
    }));
    $$("[data-prefer]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.prefer; state.clashPrefer[k] = !state.clashPrefer[k]; rerender();
      const again = $(`[data-prefer="${k}"]`); again && again.focus({ preventScroll: true });
    }));
    const ch = $("#composeHere");
    if (ch) ch.addEventListener("click", startSolving);
    const tr = $("#tryAgain");
    if (tr) tr.addEventListener("click", () => {
      Object.keys(state.clashPrefer).forEach((k) => { if (state.clashPrefer[k]) { const g = state.goals.find((x) => x.id === k); if (g) { g.strictness = "prefer"; g.importance = g.importance || 5; } } });
      if (Object.values(state.clashPrefer).some(Boolean)) state.demo = "optimal";
      else toast("Nothing changed, so the same clash may come back.");
      startSolving();
    });
    const save = () => {
      state.saved = true;
      const wk = isoWeek(dayDate(0));
      const id = "p" + Date.now();
      state.savedId = id;
      state.archive.unshift({ id, label: `Week ${wk}`, start: state.schedule.start, days: state.schedule.days, savedAt: "2026-11-19 21:30", today: false });
      return wk;
    };
    const s = $("#mSave");
    if (s) s.addEventListener("click", () => { const wk = save(); rerender(); toast(`Saved to the archive as Week ${wk}.`); });
    const t = $("#mToday");
    if (t) t.addEventListener("click", () => {
      const wasSaved = state.saved;
      if (!wasSaved) save();
      state.archive.forEach((p) => (p.today = p.id === state.savedId));
      rerender();
      toast(wasSaved ? "Today’s meals now come from this menu." : "Saved, and today’s meals now come from this menu.");
    });
    const d = $("#mDiscard");
    if (d) d.addEventListener("click", () => openSheet("Discard this plan?", `<p class="standfirst">The Menu for ${issueLine()} will be thrown away. ${state.saved ? "The copy in the archive stays." : "It isn’t saved, so this can’t be undone."}</p>
      <div class="sheet-actions"><button class="btn ghost" type="button" id="dNo">Keep it</button><button class="btn accent" type="button" id="dYes">Discard</button></div>`, (b) => {
      $("#dNo", b).onclick = closeSheet;
      $("#dYes", b).onclick = () => { state.hasResult = false; state.saved = false; state.savedId = null; closeSheet({ noRefocus: true }); rerender(); $("#page").focus({ preventScroll: true }); toast("Plan discarded."); };
    }));
  }

  // ---------- RECIPE INDEX ----------
  function viewRecipes() {
    return `
      <header class="cover"><p class="kicker">${cap(word(D.recipes.length))} dishes, A to Z</p>
        <h1 class="cover-title display">The recipe <em>index</em></h1>
        <p class="standfirst">Everything the planner may cook from, filed by name.</p></header>
      <div class="search">${SEARCH_ICON}
        <label class="visually-hidden" for="rq">Search recipes</label><input class="input" id="rq" type="search" placeholder="Search by name or tag" value="${esc(state.q)}" autocomplete="off"></div>
      <div id="idx" aria-live="polite"></div>
      <button class="btn block" type="button" id="newRecipe" style="margin-top:24px">New recipe</button>
      ${turnLinks("recipes")}`;
  }
  function renderIndex() {
    const q = state.q.trim().toLowerCase();
    const list = D.recipes.filter((r) => !q || r.name.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groups = {};
    list.forEach((r) => (groups[r.name[0].toUpperCase()] ||= []).push(r));
    const usable = usableRecipes().map((r) => r.id);
    $("#idx").innerHTML = Object.keys(groups).map((L) => `<h2 class="letter">${L}<span class="cnt">${groups[L].length}</span></h2><ul class="idx">${groups[L].map((r) => `<li>
      <a class="idx-entry" href="#recipe/${r.id}">
        <span class="swatch">${plateSVG(r, "swatch")}</span>
        <span><span class="n">${esc(r.name)}</span><span class="t">${r.tags.map(esc).join(", ")}${usable.includes(r.id) ? "" : `; <em>not this week</em>`}</span></span>
        <span class="m">${r.minutes} min</span>
      </a></li>`).join("")}</ul>`).join("")
      || `<div class="empty-state"><p>No recipe matches “${esc(state.q.trim())}”.</p><button class="text-btn" type="button" id="clearQ">Clear the search</button></div>`;
    const c = $("#clearQ");
    if (c) c.addEventListener("click", () => { state.q = ""; $("#rq").value = ""; renderIndex(); $("#rq").focus(); });
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
    const no = idNum(base);
    const per = base.per;
    const tags = full ? R.tags : base.tags;
    return `
      <figure class="spread-fig" style="margin:0">
        <div class="spread-plate" role="img" aria-label="Colour plate for ${esc(name)}">${plateSVG(base, "spread")}</div>
        <figcaption class="plate-cap"><span class="pn">Plate ${ROMAN[no - 1] || no}</span><span>${base.minutes} minutes, serves ${serves}</span></figcaption>
      </figure>
      ${full ? `<div class="spread-bar ${ed ? "editing" : ""}">
        <span class="hint">${ed ? "Annotating: change anything underlined" : `<a href="#recipes" class="text-btn plain">Back to the index</a>`}</span>
        ${ed ? `<span class="btn-row"><button class="btn ghost small" type="button" id="eCancel">Cancel</button><button class="btn accent small" type="button" id="eDone">Save</button></span>`
             : `<button class="btn small" type="button" id="eStart">Edit</button>`}
      </div>` : ""}
      <header class="spread-head">
        <p class="kicker">Recipe ${no}${tags.length ? `, filed under ${esc(tags[0])}` : ""}</p>
        ${ed ? `<label class="visually-hidden" for="eName">Recipe name</label><input class="annot title-in display" id="eName" value="${esc(name)}">`
             : `<h1 class="spread-title display">${esc(name)}</h1>`}
        ${ed ? `<div class="edit-meta">
            <div class="em-row"><span class="label" id="servL">Serves</span>
              <div class="stepper" role="group" aria-labelledby="servL"><button type="button" id="svM" aria-label="Fewer servings">−</button><output class="val" id="svV">${serves}</output><button type="button" id="svP" aria-label="More servings">+</button></div></div>
            <p class="edit-hint" style="margin-top:-8px">Amounts are for the whole recipe.</p>
            <div class="em-row"><span class="label" id="porL">Portion size</span>
              <div class="portion-edit" role="group" aria-labelledby="porL">${[["from", "From"], ["to", "To"], ["step", "In steps of"]].map(([k, l]) => `<label class="pe"><span class="k">${l}</span><input class="annot" inputmode="decimal" data-portion="${k}" value="${R.portion[k]}"></label>`).join("")}</div></div>
          </div>`
        : `<div class="spread-meta">
            <div><span class="k">Serves</span><span class="v">${serves}</span></div>
            <div><span class="k">Time</span><span class="v">${base.minutes}<small>min</small></span></div>
            ${full ? `<div><span class="k">Portions</span><span class="v">${frac(R.portion.from)}–${frac(R.portion.to)}</span></div>` : ""}
          </div>`}
      </header>

      <section class="spread-sec" style="margin-top:8px" aria-labelledby="ingT">
        <div class="section-head"><span class="section-no" aria-hidden="true">i</span><h2 class="section-title" id="ingT">Ingredients</h2></div>
        ${full ? R.sections.map((sec, si) => `<div class="ing-section"><h3>${esc(sec.name)}</h3>
          ${ed ? `<div>${sec.lines.map((l, li) => ingEditRow(l, si, li)).join("")}</div>
              <button type="button" class="text-btn add-line" data-add="${si}">Add a line to “${esc(sec.name)}”</button>`
               : `<ul class="ing-list">${sec.lines.map((l) => `<li class="ing ${l.needsReview ? "review" : ""}"><span class="amt">${l.amount == null ? "–" : fmt(l.amount)}<span class="u">${esc(l.unit)}</span></span>
                  <span class="nm">${esc(l.ingredient)}${l.note ? `<span class="cv">${esc(l.note)}</span>` : ""}${l.needsReview ? `<span class="cv warn">Needs review: no weight for “${esc(l.unit)}”</span>` : ""}</span></li>`).join("")}</ul>`}
        </div>`).join("")
        : `<div class="empty-state" style="margin-top:16px"><p>Only the Chickpea curry has its full spread in this prototype.</p><a class="text-btn" href="#recipe/r9">Open the Chickpea curry</a></div>`}
      </section>

      ${full ? `<section class="spread-sec" aria-labelledby="mT">
        <div class="section-head"><span class="section-no" aria-hidden="true">ii</span><h2 class="section-title" id="mT">Method</h2></div>
        <ol class="method ${ed ? "method-edit" : ""}">
          ${R.instructions.map((s, i) => ed
            ? `<li><span><label class="visually-hidden" for="st${i}">Step ${i + 1}</label><textarea class="annot" id="st${i}" data-step="${i}" rows="3">${esc(s)}</textarea></span><button type="button" class="icon-btn" data-rmstep="${i}" aria-label="Remove step ${i + 1}">×</button></li>`
            : `<li><p>${esc(s)}</p></li>`).join("")}
        </ol>
        ${ed ? `<button type="button" class="text-btn" id="addStep">Add a step</button>` : ""}
      </section>` : ""}

      <section class="spread-sec" aria-labelledby="tT">
        <div class="section-head"><span class="section-no" aria-hidden="true">${full ? "iii" : "ii"}</span><h2 class="section-title" id="tT">Notes</h2></div>
        <p class="kicker" style="margin-bottom:4px">Tags</p>
        ${ed ? `<div class="chips">${D.tags.map((t) => { const der = R.derivedTags.includes(t); return `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${R.tags.includes(t) || der}" ${der ? "disabled" : ""}>${esc(t)}${der ? `<span class="auto">auto</span>` : ""}</button>`; }).join("")}</div>
              <p class="edit-hint">Tags marked auto come from the ingredients, by each tag’s rule, and can’t be turned off here.</p>`
             : `<div class="tags-line">${tags.map((t) => `<span class="tag-word">${esc(t)}</span>`).join("")}</div>
               ${full ? `<p class="tag-derived">From the ingredients: ${R.derivedTags.join(", ")}</p>` : ""}`}

        <table class="nutri"><caption>Per portion</caption>
          <tbody>${D.attributes.map((a) => `<tr><th scope="row">${a.name}</th><td>${fmt(per[a.id])} ${a.unit}</td></tr>`).join("")}</tbody></table>

        ${full ? (ed ? `<div class="field" style="margin-top:24px"><label for="eSrc">Source</label><input class="annot" id="eSrc" type="url" value="${esc(R.source)}" style="width:100%"></div>`
                     : `<p class="source"><span class="kicker">Source</span><br><a class="source-link" href="${esc(R.source)}" target="_blank" rel="noopener">${esc(R.source.replace(/^https?:\/\//, ""))}</a></p>`) : ""}
      </section>
      <nav class="turn" aria-label="Turn the page"><a class="prev" href="#recipes"><span class="kicker">Back to</span><span class="t">The recipe index</span></a>
        <a class="next" href="#menu"><span class="kicker">On the menu</span><span class="t">The Menu</span></a></nav>
      <p class="folio" aria-label="Page 3">3</p>`;
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
  function bindRecipe() {
    const R = state.recipe;
    const line = (key) => { const [si, li] = key.split("-").map(Number); return R.sections[si].lines[li]; };
    const startEdit = () => { state.snapshot = clone(R); state.editing = true; rerender(); const n = $("#eName"); n && n.focus({ preventScroll: true }); };
    const s = $("#eStart"); s && s.addEventListener("click", startEdit);
    if (!state.editing || !$("#eCancel")) return;
    const refocus = (sel) => { const el = $(sel); el && el.focus({ preventScroll: true }); };
    $("#eCancel").addEventListener("click", () => { state.recipe = state.snapshot; state.editing = false; rerender(); refocus("#eStart"); toast("Changes thrown away."); });
    $("#eDone").addEventListener("click", () => {
      const left = R.sections.some((sec) => sec.lines.some((l) => l.needsReview));
      state.editing = false; rerender(); refocus("#eStart"); toast(left ? "Saved. One line still needs review." : "Recipe saved.");
    });
    $("#eName").addEventListener("input", (e) => (R.name = e.target.value));
    const serv = () => { $("#svV").textContent = R.serves; $("#svM").disabled = R.serves <= 1; };
    serv();
    $("#svM").addEventListener("click", () => { R.serves = Math.max(1, R.serves - 1); serv(); if ($("#svM").disabled) $("#svP").focus(); });
    $("#svP").addEventListener("click", () => { R.serves = Math.min(1000, R.serves + 1); serv(); });
    $$("[data-portion]").forEach((i) => i.addEventListener("change", () => { const v = +i.value.replace(",", "."); if (v > 0) R.portion[i.dataset.portion] = v; else { i.value = R.portion[i.dataset.portion]; toast("Portion sizes are numbers above zero."); } }));
    $$("[data-amt]").forEach((i) => i.addEventListener("input", () => { const raw = i.value.replace(",", ".").trim(); const v = +raw; line(i.dataset.amt).amount = raw === "" || isNaN(v) ? null : v; }));
    $$("[data-unit]").forEach((sel) => sel.addEventListener("change", () => {
      const l = line(sel.dataset.unit); l.unit = sel.value;
      if (!["g", "kg"].includes(l.unit) && !(l.note && l.note.startsWith(`1 ${l.unit} `)) && !["tbsp", "tsp", "ml", "l", "dl"].includes(l.unit)) l.needsReview = true;
      else { l.needsReview = false; if (["g", "kg"].includes(l.unit)) l.note = undefined; }
      rerender(); refocus("#u" + sel.dataset.unit);
    }));
    $$("[data-conv]").forEach((i) => i.addEventListener("input", () => { const l = line(i.dataset.conv); l.note = `1 ${l.unit} = ${i.value} g`; }));
    $$("[data-fix]").forEach((b) => b.addEventListener("click", () => {
      const key = b.dataset.fix, inp = $("#fx" + key), v = +inp.value.replace(",", ".");
      if (!(v > 0)) { inp.focus(); return toast("Enter the grams in one " + line(key).unit + "."); }
      const l = line(key); l.needsReview = false; l.note = `1 ${l.unit} = ${v} g`;
      rerender(); refocus("#a" + key); toast("Conversion added. The line counts now.");
    }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      const [si, li] = b.dataset.rm.split("-").map(Number);
      const [gone] = R.sections[si].lines.splice(li, 1); rerender(); refocus(`[data-add="${si}"]`); toast(`Removed ${gone.ingredient}.`);
    }));
    $$("[data-add]").forEach((b) => b.addEventListener("click", () => sheetAddLine(+b.dataset.add)));
    $$("[data-step]").forEach((t) => t.addEventListener("input", () => (R.instructions[+t.dataset.step] = t.value)));
    $$("[data-rmstep]").forEach((b) => b.addEventListener("click", () => { R.instructions.splice(+b.dataset.rmstep, 1); rerender(); refocus("#addStep"); }));
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
    const html = `<div class="search">${SEARCH_ICON}<label class="visually-hidden" for="aq">Find an ingredient</label><input class="input" id="aq" type="search" placeholder="Find an ingredient" autocomplete="off"></div><ul class="picker-list" id="al"></ul>`;
    openSheet(`Add to “${R.sections[si].name}”`, html, (b) => {
      const draw = (q) => {
        $("#al", b).innerHTML = D.ingredients.filter((i) => i.toLowerCase().includes(q.toLowerCase())).sort().map((i) => `<li><button type="button" data-pick="${esc(i)}">${esc(i)}</button></li>`).join("")
          || `<li class="none">No ingredient is called “${esc(q)}”. Add it on the Ingredients page first.</li>`;
        $$("[data-pick]", b).forEach((x) => (x.onclick = () => {
          R.sections[si].lines.push({ ingredient: x.dataset.pick, amount: null, unit: "g" });
          closeSheet({ noRefocus: true }); rerender();
          const li = R.sections[si].lines.length - 1; const inp = $(`#a${si}-${li}`); if (inp) { inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: "center" }); }
        }));
      };
      draw("");
      $("#aq", b).addEventListener("input", (e) => draw(e.target.value));
    }, { focus: "#aq" });
  }

  // ---------- ARCHIVE ----------
  function viewArchive() {
    return `<header class="cover"><p class="kicker">Saved plans</p><h1 class="cover-title display">The <em>archive</em></h1>
      <p class="standfirst">Past menus, newest first. The one marked Today feeds today’s meals.</p></header>
      ${state.archive.length ? `<ul class="archive">${state.archive.slice().sort((a, b) => b.start.localeCompare(a.start) || b.savedAt.localeCompare(a.savedAt)).map((p) => {
        const d = parseDate(p.start), [day, time] = p.savedAt.split(" "), sd = parseDate(day);
        return `<li><button type="button" class="archive-entry" data-plan="${p.id}">
          <span class="wk" aria-hidden="true">${isoWeek(d)}</span>
          <span><span class="lbl">${esc(p.label)}</span><span class="meta">${p.days} days from ${d.getDate()} ${MONTHS[d.getMonth()]}. Saved ${sd.getDate()} ${MONTHS[sd.getMonth()].slice(0, 3)}, ${time}</span></span>
          ${p.today ? `<span class="today-mark">Today</span>` : `<span aria-hidden="true" class="chev">›</span>`}
        </button></li>`;
      }).join("")}</ul>` : `<div class="empty-state"><p>No saved plans yet. Save a menu and it is filed here.</p><a class="text-btn" href="#menu">Go to The Menu</a></div>`}
      ${turnLinks("archive")}`;
  }
  function bindArchive() {
    $$("[data-plan]").forEach((b) => b.addEventListener("click", () => {
      const p = state.archive.find((x) => x.id === b.dataset.plan);
      toast(`Opening ${p.label} (the sample shows this week’s menu).`);
      state.demo = "optimal"; state.hasResult = true; state.saved = true; state.savedId = p.id; go("menu");
    }));
  }

  // ---------- INGREDIENTS ----------
  function viewIngredients() {
    return `<header class="cover"><p class="kicker">${D.ingredients.length} in the larder</p><h1 class="cover-title display"><em>Ingredients</em></h1>
      <p class="standfirst">What recipes are made of: nutrition per 100 g, units and conversions.</p></header>
      <div class="search">${SEARCH_ICON}
        <label class="visually-hidden" for="iq">Search ingredients</label><input class="input" id="iq" type="search" placeholder="Search ingredients" value="${esc(state.iq)}" autocomplete="off"></div>
      <div id="ilWrap" aria-live="polite"></div>
      ${turnLinks("ingredients")}`;
  }
  function bindIngredients() {
    const draw = () => {
      const q = state.iq.trim().toLowerCase();
      const list = D.ingredients.filter((i) => i.toLowerCase().includes(q)).sort();
      $("#ilWrap").innerHTML = list.length
        ? `<ul class="ingr-list">${list.map((i) => `<li><button type="button" data-ing="${esc(i)}">${esc(i)}</button></li>`).join("")}</ul>`
        : `<div class="empty-state"><p>Nothing in the larder is called “${esc(state.iq.trim())}”.</p><button class="text-btn" type="button" id="clearI">Clear the search</button></div>`;
      $$("[data-ing]").forEach((b) => b.addEventListener("click", () => toast(`${b.dataset.ing}: its own page isn’t in this prototype.`)));
      const c = $("#clearI"); c && c.addEventListener("click", () => { state.iq = ""; $("#iq").value = ""; draw(); $("#iq").focus(); });
    };
    draw();
    $("#iq").addEventListener("input", (e) => { state.iq = e.target.value; draw(); });
  }

  // ---------- SETTINGS ----------
  function viewSettings() {
    return `<header class="cover"><p class="kicker">The small print</p><h1 class="cover-title display"><em>Settings</em></h1></header>
      <div class="setting"><h2 id="edH">Edition</h2><div class="seg" role="group" aria-labelledby="edH">
        ${[["auto", "Follow the device"], ["light", "Paper"], ["dark", "Evening"]].map(([k, l]) => `<button type="button" data-theme-pick="${k}" aria-pressed="${state.theme === k}">${l}</button>`).join("")}</div>
        <p class="edit-hint">The evening edition is a dark theme for the couch.</p></div>
      <div class="setting"><h2 id="lnH">Language</h2><div class="seg" role="group" aria-labelledby="lnH">
        <button type="button" aria-pressed="true">English</button><button type="button" data-sv aria-pressed="false">Svenska</button></div></div>
      <div class="setting"><h2>Units</h2><p class="serif-text">g, kg, dl, ml, l, pcs, tbsp, tsp, bunch and more.</p><button type="button" class="text-btn" id="units">Edit the unit catalogue</button></div>
      <div class="setting"><h2>Attributes</h2><p class="serif-text">${D.attributes.map((a) => `${a.name} (${a.unit})`).join(", ")}</p><button type="button" class="text-btn" id="attrs">Edit attributes</button></div>
      ${turnLinks("settings")}`;
  }
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", state.theme);
    // keep the browser chrome in step with a picked edition
    $$('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.media) m.dataset.media = m.getAttribute("media") || "";
      if (state.theme === "auto") m.setAttribute("media", m.dataset.media);
      else m.setAttribute("media", m.dataset.media.includes(state.theme) ? "all" : "not all");
    });
  }
  function bindSettings() {
    $$("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => {
      state.theme = b.dataset.themePick;
      applyTheme();
      rerender();
      $(`[data-theme-pick="${state.theme}"]`).focus({ preventScroll: true });
    }));
    $("[data-sv]").addEventListener("click", () => toast("Swedish text isn’t in this prototype."));
    $("#units").addEventListener("click", () => toast("The unit catalogue isn’t in this prototype."));
    $("#attrs").addEventListener("click", () => toast("Attributes aren’t in this prototype."));
  }

  // ---------- contents overlay ----------
  function openContents() {
    $("#contentsIssue").textContent = issueLine();
    const here = current === "recipe" ? "recipes" : current;
    $("#contentsList").innerHTML = PAGES.map((p, i) => `<li><a href="#${p.id}" ${here === p.id ? 'aria-current="page"' : ""}>
      <span class="no" aria-hidden="true">${i + 1}</span>
      <span><span class="row"><span class="ti">${p.title}</span><span class="lead" aria-hidden="true"></span>${here === p.id ? `<span class="here">here</span>` : ""}<span class="pg" aria-label="page ${i + 1}">${i + 1}</span></span>
      <span class="de">${p.desc}</span></span></a></li>`).join("");
    $("#contents").classList.remove("closing");
    $("#contents").hidden = false;
    $("#contentsBtn").setAttribute("aria-expanded", "true");
    lockScroll();
    $("#contentsClose").focus();
    $$("#contentsList a").forEach((a) => a.addEventListener("click", () => closeContents(true)));
  }
  function closeContents(navigating) {
    if ($("#contents").hidden) return;
    $("#contentsBtn").setAttribute("aria-expanded", "false");
    const done = () => { unlockScroll(); if (!navigating) $("#contentsBtn").focus(); };
    if (navigating) { $("#contents").hidden = true; done(); } else hideAnimated([$("#contents")], done);
  }

  // ---------- global wiring ----------
  $("#contentsBtn").setAttribute("aria-expanded", "false");
  $("#contentsBtn").addEventListener("click", openContents);
  $("#contentsClose").addEventListener("click", () => closeContents(false));
  $("#sheetClose").addEventListener("click", () => closeSheet());
  $("#sheetBackdrop").addEventListener("click", () => closeSheet());
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") return trapTab(e);
    if (e.key !== "Escape") return;
    if (!$("#solving").hidden) { const c = $("#solveCancel"); c && !c.disabled && c.click(); }
    else if (!$("#sheet").hidden) closeSheet();
    else if (!$("#contents").hidden) closeContents(false);
  });
  window.addEventListener("scroll", () => $("#masthead").classList.toggle("scrolled", window.scrollY > 160), { passive: true });
  window.addEventListener("hashchange", () => {
    // leaving the spread mid-edit throws the edits away instead of keeping them half-saved
    if (state.editing && !location.hash.startsWith("#recipe")) { state.recipe = state.snapshot; state.editing = false; toast("Left without saving; the recipe is as it was."); }
    if (!$("#sheet").hidden) { $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; unlockScroll(); }
    route();
  });

  // swipe to turn the page
  let sx = 0, sy = 0, st = 0, ok = false;
  const pageEl = $("#page");
  pageEl.addEventListener("touchstart", (e) => {
    const t = e.target;
    ok = !state.editing && !t.closest("input, textarea, select, .sched, .seg, .chips");
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
