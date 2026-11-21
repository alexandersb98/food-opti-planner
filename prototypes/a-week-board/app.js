/* Prototype A: "The week is the app". Throwaway code: one state object, render functions, delegated clicks. */
(() => {
  "use strict";

  const D = window.MEAL_DATA;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RECIPES = Object.fromEntries(D.recipes.map((r) => [r.id, r]));
  const ATTR = Object.fromEntries(D.attributes.map((a) => [a.id, a]));
  const SCOPE = { day: "Each day", plan_total: "Plan total", daily_average: "Daily average" };
  const fmt = (n, attr) => {
    if (n == null) return "";
    const dec = attr === "salt" ? 1 : 0;
    return Number(n).toLocaleString("en-GB", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  };
  const fmtPortion = (p) => (Number.isInteger(p) ? p.toFixed(0) : String(p));

  // ---------------------------------------------------------------- state
  const state = {
    schedule: clone(D.plan.schedule),
    goals: clone(D.plan.goals),
    filters: clone(D.plan.tagFilters),
    maxSeconds: D.plan.maxSeconds,
    phase: "idle", // idle | solving | result | clash
    result: null, // { status, solvedIn, days: [{ meals: [[id, portion] | null] }] }
    saved: false,
    stale: false,
    demo: "optimal", // optimal | time_ran_out | clash
    selectedDay: 0,
    edit: false,
    solve: null,
    fillAnim: false,
    clashResolved: {},
  };

  // ---------------------------------------------------------------- dates
  const startDate = () => new Date(state.schedule.start + "T12:00:00");
  const dayDate = (i) => { const d = startDate(); d.setDate(d.getDate() + i); return d; };
  const dayShort = (i) => dayDate(i).toLocaleDateString("en-GB", { weekday: "short" });
  const dayLong = (i) => dayDate(i).toLocaleDateString("en-GB", { weekday: "long" });
  const dayDM = (i) => dayDate(i).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const isoWeek = (d) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y) / 86400000 + 1) / 7);
  };

  // ---------------------------------------------------------------- schedule helpers
  const isSkipped = (d, meal) => (state.schedule.skipped[d] || []).includes(meal);
  const plannedCount = (d) => state.schedule.meals.filter((m) => !isSkipped(d, m)).length;
  function toggleSkip(d, meal) {
    const list = state.schedule.skipped[d] || (state.schedule.skipped[d] = []);
    const i = list.indexOf(meal);
    if (i >= 0) list.splice(i, 1); else list.push(meal);
    const al = state.schedule.atLeast[d];
    if (al != null && al > plannedCount(d)) state.schedule.atLeast[d] = plannedCount(d);
    markStale();
  }
  function markStale() { if (state.result) state.stale = true; }

  // ---------------------------------------------------------------- result maths
  function dayTotals(d) {
    const t = { energy: 0, protein: 0, fibre: 0, salt: 0, cost: 0 };
    const day = state.result && state.result.days[d];
    if (!day) return t;
    day.meals.forEach((m) => {
      if (!m) return;
      const r = RECIPES[m[0]];
      for (const k in t) t[k] += r.per[k] * m[1];
    });
    return t;
  }
  const resultDays = () => (state.result ? Math.min(state.schedule.days, state.result.days.length) : 0);
  function planTotals() {
    const t = { energy: 0, protein: 0, fibre: 0, salt: 0, cost: 0 };
    for (let d = 0; d < resultDays(); d++) { const dt = dayTotals(d); for (const k in t) t[k] += dt[k]; }
    return t;
  }
  const inRange = (v, g) => (g.min == null || v >= g.min - 1e-9) && (g.max == null || v <= g.max + 1e-9);
  const rangeText = (g) => {
    const u = ATTR[g.attribute].unit;
    if (g.min != null && g.max != null) return g.min === g.max ? `exactly ${fmt(g.min)} ${u}` : `${fmt(g.min)}–${fmt(g.max)} ${u}`;
    if (g.min != null) return `at least ${fmt(g.min)} ${u}`;
    if (g.max != null) return `at most ${fmt(g.max)} ${u}`;
    return "no range yet";
  };

  // Evaluate a goal against the current result: progress (0..1) for the ring, met, short label, miss text.
  function evalGoal(g) {
    if (!state.result || state.phase !== "result") return { has: false, progress: 0, label: shortRange(g) };
    const n = resultDays();
    const u = ATTR[g.attribute].unit;
    const name = ATTR[g.attribute].name;
    if (g.scope === "day") {
      let met = 0, worst = null;
      for (let d = 0; d < n; d++) {
        const v = dayTotals(d)[g.attribute];
        if (inRange(v, g)) met++;
        else {
          const dist = g.min != null && v < g.min ? g.min - v : v - g.max;
          if (!worst || dist > worst.dist) worst = { d, v, dist };
        }
      }
      const ok = met === n;
      const dir = g.min != null && worst && worst.v < g.min ? "under" : "over";
      const bound = dir === "under" ? `${fmt(g.min)} ${u}` : `${fmt(g.max)} ${u}`;
      return {
        has: true, progress: met / n, met: ok, label: `${met}/${n}`,
        miss: ok ? null : `${name} ${dir} ${bound} on ${n - met} of ${n} days`,
        worst: worst ? `Worst: ${dayShort(worst.d)}, ${fmt(worst.v, g.attribute)} ${u}` : null,
      };
    }
    const tot = planTotals()[g.attribute];
    const v = g.scope === "daily_average" ? tot / n : tot;
    const ok = inRange(v, g);
    let progress;
    if (g.min != null && g.max != null) progress = Math.min(1, v / g.max);
    else if (g.min != null) progress = Math.min(1, v / g.min);
    else progress = Math.min(1, v / (g.max || 1));
    const what = g.scope === "daily_average" ? `${name} averaged ${fmt(v, g.attribute)} ${u} a day` : `${name} came to ${fmt(v, g.attribute)} ${u}`;
    return {
      has: true, progress, met: ok, value: v,
      label: g.attribute === "cost" || v >= 1000 ? compact(v) : fmt(v, g.attribute),
      miss: ok ? null : `${what}, goal ${rangeText(g)}`, worst: null,
    };
  }
  const compact = (v) => (v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : fmt(v));
  function shortRange(g) {
    if (g.min != null && g.max != null) return `${compact(g.min)}–${compact(g.max)}`;
    if (g.min != null) return `≥${compact(g.min)}`;
    if (g.max != null) return `≤${compact(g.max)}`;
    return "–";
  }

  // ---------------------------------------------------------------- svg bits
  const ICON = {
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    spark: '<svg class="spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".7"/></svg>',
    swap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>',
  };
  function ringSvg(progress, colour, size = 56, stroke = 6) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, progress)));
    return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${colour}" stroke-width="${stroke}"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-off="${off.toFixed(2)}"/></svg>`;
  }
  // Animate rings from their previous fill to the new one after each render.
  const ringMemory = new Map();
  function settleRings(root) {
    root.querySelectorAll(".ring[data-key]").forEach((el) => {
      const fill = el.querySelector(".fill"); if (!fill) return;
      const key = el.dataset.key;
      const prev = ringMemory.get(key);
      if (prev != null) fill.style.strokeDashoffset = prev;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.strokeDashoffset = fill.dataset.off;
        ringMemory.set(key, fill.dataset.off);
      }));
    });
  }

  // ---------------------------------------------------------------- render: top
  function renderTop() {
    const n = state.schedule.days;
    const s = startDate(), e = dayDate(n - 1);
    const range = `${s.getDate()} ${s.toLocaleDateString("en-GB", { month: "short" })} – ${e.getDate()} ${e.toLocaleDateString("en-GB", { month: "short" })}`;
    let pill = `<span class="status-pill"><span class="dot"></span>No plan yet</span>`;
    if (state.phase === "solving") pill = `<span class="status-pill live"><span class="dot"></span>Making plan…</span>`;
    else if (state.phase === "clash") pill = `<span class="status-pill bad"><span class="dot"></span>No plan possible</span>`;
    else if (state.phase === "result") {
      if (state.stale) pill = `<span class="status-pill warn"><span class="dot"></span>Schedule changed · make again</span>`;
      else if (state.saved) pill = `<span class="status-pill ok"><span class="dot"></span>Saved · Week ${isoWeek(s)}</span>`;
      else if (state.result.status === "optimal") pill = `<span class="status-pill ok"><span class="dot"></span>Best possible plan · ${state.result.solvedIn} s</span>`;
      else pill = `<span class="status-pill warn"><span class="dot"></span>Time ran out: may not be the best plan</span>`;
    }
    $("#top").innerHTML = `
      <button class="search-pill" data-act="open-search" aria-label="Search recipes, ingredients, tags and settings">
        ${ICON.search}<span class="grow">Recipes, ingredients, tags…</span><kbd>Pull ↓</kbd>
      </button>
      <div class="titlebar">
        <div class="titles">
          <div class="eyebrow">${esc(range)} · ${n} days</div>
          <h1 class="title-xl">Week ${isoWeek(s)}<span class="soft">.</span></h1>
          ${pill}
        </div>
        <button class="icon-btn ${state.edit ? "on" : ""}" data-act="toggle-edit" aria-pressed="${state.edit}" aria-label="${state.edit ? "Done editing the week" : "Edit the week: days, meals, start date"}">${state.edit ? ICON.close : ICON.edit}</button>
      </div>`;
  }

  // ---------------------------------------------------------------- render: bento
  function renderBento() {
    const evals = state.goals.map(evalGoal);
    const has = state.phase === "result";
    const rings = state.goals.map((g, i) => {
      const ev = evals[i], a = ATTR[g.attribute];
      const colour = !ev.has ? a.colour : ev.met ? a.colour : "var(--accent)";
      const flag = ev.has ? `<span class="flag ${ev.met ? "met" : "miss"}" aria-hidden="true">${ev.met ? "✓" : "!"}</span>` : "";
      const must = g.strictness === "must" ? `<span class="must" aria-hidden="true">M</span>` : "";
      const status = ev.has ? (ev.met ? "met" : "missed") : "not planned yet";
      return `<button class="ring-btn" data-act="open-goal" data-id="${g.id}" aria-label="${esc(g.name)}: ${esc(rangeText(g))}, ${SCOPE[g.scope]}, ${g.strictness === "must" ? "Must" : "Prefer"}, ${status}. Edit goal.">
        <span class="ring" data-key="ring-${g.id}">${ringSvg(ev.progress, colour)}<span class="center">${esc(ev.label)}</span>${must}${flag}</span>
        <span class="ring-name">${esc(a.name)}</span></button>`;
    }).join("");

    const met = evals.filter((e) => e.has && e.met).length;
    const total = state.goals.length;
    const missedList = evals.filter((e) => e.has && !e.met);
    const pt = has ? planTotals() : null;
    const budget = state.goals.find((g) => g.attribute === "cost" && g.scope === "plan_total" && g.max != null);
    const costMax = budget ? budget.max : null;

    let statusTile;
    if (state.phase === "solving") {
      statusTile = `<div class="tile status" aria-live="polite"><span class="glow"></span><span class="tile-label">Plan</span>
        <div><div class="big">…</div><div class="sub">Trying recipes and portions for ${totalMeals()} meals</div></div></div>`;
    } else if (state.phase === "clash") {
      statusTile = `<div class="tile status"><span class="glow"></span><span class="tile-label">Plan</span>
        <div><div class="big">0<small>/${total}</small></div><div class="sub">Rules clash. See below.</div></div></div>`;
    } else if (has) {
      statusTile = `<button class="tile status" data-act="open-missed" aria-label="${met} of ${total} goals met. Show goal details."><span class="glow"></span><span class="tile-label">Goals met</span>
        <div><div class="big">${met}<small>/${total}</small></div>
        <div class="segs" aria-hidden="true">${evals.map((e) => `<span class="${e.met ? "met" : "miss"}"></span>`).join("")}</div>
        </div></button>`;
    } else {
      statusTile = `<div class="tile status"><span class="glow"></span><span class="tile-label">Plan</span>
        <div><div class="big">${totalMeals()}<small> meals</small></div><div class="sub">to plan over ${state.schedule.days} days</div></div></div>`;
    }

    const costTile = `<button class="tile cost" data-act="${budget ? "open-goal" : "toast"}" ${budget ? `data-id="${budget.id}"` : 'data-msg="No budget goal yet"'} aria-label="Cost ${has ? fmt(pt.cost) + " kr" : "not planned"}${costMax ? " of " + costMax + " kr budget" : ""}">
      <span class="tile-label">Cost</span>
      <div class="num">${has ? fmt(pt.cost) : "–"} <small>${costMax ? `/ ${costMax} kr` : "kr"}</small></div>
      <div class="minibar" aria-hidden="true"><i style="width:${has && costMax ? Math.min(100, (pt.cost / costMax) * 100) : 0}%"></i></div></button>`;

    const missedTile = has
      ? `<button class="tile missed ${missedList.length ? "has" : "none"}" data-act="open-missed" aria-label="${missedList.length} missed goals. Show them.">
          <span class="tile-label">Missed</span><div class="num">${missedList.length} <small>${missedList.length === 1 ? "goal" : "goals"}</small></div>
          <div style="font-size:var(--t-2xs);color:var(--ink-2);margin-top:4px">${missedList.length ? "Tap to see why" : "All met"}</div></button>`
      : `<div class="tile missed"><span class="tile-label">Missed</span><div class="num">– </div></div>`;

    $("#bento").innerHTML = `
      <div class="tile rings"><div class="tile-head"><span class="tile-label">Goals</span>
        <span style="font-size:var(--t-2xs);color:var(--ink-3)">Tap a ring to edit</span></div>
        <div class="ring-row">${rings}
          <button class="ring-btn ring-add" data-act="add-goal" aria-label="Add goal"><span class="ring" aria-hidden="true">+</span><span class="ring-name">Add</span></button>
        </div></div>
      ${statusTile}${costTile}${missedTile}`;
    settleRings($("#bento"));
  }
  const totalMeals = () => { let n = 0; for (let d = 0; d < state.schedule.days; d++) n += plannedCount(d); return n; };

  // ---------------------------------------------------------------- render: filters
  function renderFilters() {
    const chips = state.filters.filter((f) => f.mode !== "any").map((f) =>
      `<button class="chip chip-touch ${f.mode}" data-act="cycle-filter" data-tag="${esc(f.tag)}" aria-label="${f.mode === "only" ? "Only" : "Never"}: ${esc(f.tag)}. Tap to change.">
        <span class="k">${f.mode === "only" ? "Only" : "Never"}</span> ${esc(f.tag)}${f.note ? ` <span class="k">· ${esc(f.note)}</span>` : ""}</button>`).join("");
    $("#filters").innerHTML = `<span class="lead">Recipes this plan may use</span>${chips}
      <button class="chip chip-touch" data-act="open-search" data-section="tags" aria-label="Edit recipe filters">+ Filter</button>
      <button class="chip chip-touch" data-act="max-time" aria-label="Max solving time ${state.maxSeconds} seconds. Change.">⏱ ${state.maxSeconds} s max</button>`;
  }

  // ---------------------------------------------------------------- render: notice (clash / missed summary)
  function clashItems() {
    const g1 = state.goals.find((g) => g.strictness === "must") || state.goals[0];
    return [
      { kind: "goal", id: g1.id, what: g1.name, detail: `${ATTR[g1.attribute].name} · ${rangeText(g1)} · ${SCOPE[g1.scope]} · Must` },
      { kind: "schedule", id: "fri", what: `Meals on ${dayLong(4)}`, detail: `All planned meals are served (${plannedCount(4)} of ${state.schedule.meals.length})` },
    ];
  }
  function renderNotice() {
    const el = $("#notice");
    if (state.phase !== "clash") { el.innerHTML = ""; return; }
    const items = clashItems().map((c) => {
      if (c.kind === "goal") {
        const prefer = state.clashResolved[c.id];
        return `<div class="clash-item ${prefer ? "resolved" : ""}"><div><div class="what">${esc(c.what)}</div><div class="detail">${esc(c.detail)}</div></div>
          <div class="actions">${prefer
            ? `<span class="status-pill ok" style="margin:0">Will be Prefer</span><button class="btn small ghost" data-act="clash-keep" data-id="${c.id}">Keep Must</button>`
            : `<button class="btn small primary" data-act="clash-prefer" data-id="${c.id}">Make Prefer</button><button class="btn small ghost" data-act="open-goal" data-id="${c.id}">Edit goal</button>`}</div></div>`;
      }
      return `<div class="clash-item"><div><div class="what">${esc(c.what)}</div><div class="detail">${esc(c.detail)}</div></div>
        <div class="actions"><button class="btn small ghost" data-act="toggle-edit">Edit schedule</button></div></div>`;
    }).join("");
    el.innerHTML = `<div class="notice clash" role="alert">
      <h3><span class="ico" aria-hidden="true">!</span>No plan possible</h3>
      <p>These rules can't all be met. Clashes over the whole plan:</p>
      ${items}
      <div class="clash-foot"><span class="note">Fixing these may show another clash.</span>
        <button class="btn accent" data-act="make-plan">Try again</button></div></div>`;
  }

  // ---------------------------------------------------------------- render: week strip
  function renderWeek() {
    const strip = $(".strip");
    const keep = strip ? strip.scrollLeft : null;
    const meals = state.schedule.meals;
    let idx = 0;
    const days = [];
    for (let d = 0; d < state.schedule.days; d++) {
      const resDay = state.phase === "result" && state.result.days[d];
      const slots = meals.map((m, mi) => {
        const skipped = isSkipped(d, m);
        const label = `${m} on ${dayLong(d)}`;
        if (state.phase === "solving" && !skipped) return `<div class="slot loading" aria-hidden="true"></div>`;
        if (skipped) {
          return `<button class="slot skipped" data-act="slot" data-d="${d}" data-m="${mi}" aria-label="${esc(label)}: skipped.${state.edit || !resDay ? " Tap to plan it." : " Open day."}">
            ${state.edit ? '<span class="toggle-badge">Skip</span>' : ""}<span class="mn">${esc(m)}</span><span class="hint">skipped</span></button>`;
        }
        const cell = resDay ? resDay.meals[mi] : null;
        if (cell) {
          const r = RECIPES[cell[0]];
          const i = idx++;
          return `<button class="slot meal" style="--h:${r.hue};--i:${i}" data-act="slot" data-d="${d}" data-m="${mi}" aria-label="${esc(label)}: ${esc(r.name)}, ${fmtPortion(cell[1])} portions.${state.edit ? " Tap to skip." : " Open day."}">
            <span class="initial" aria-hidden="true">${esc(r.name[0])}</span>
            <span class="portion">×${fmtPortion(cell[1])}</span>${state.edit ? '<span class="toggle-badge">Plan</span>' : ""}
            <span class="mn">${esc(m)}</span><span class="rn">${esc(r.name)}</span></button>`;
        }
        return `<button class="slot empty-planned" data-act="slot" data-d="${d}" data-m="${mi}" aria-label="${esc(label)}: planned. Tap to skip.">
          ${state.edit ? '<span class="toggle-badge">Plan</span>' : ""}<span class="mn">${esc(m)}</span><span class="hint">${resDay ? "left empty" : "Tap to skip"}</span></button>`;
      }).join("");

      let meta = "";
      if (resDay) {
        const t = dayTotals(d);
        const dayGoals = state.goals.filter((g) => g.scope === "day");
        meta = `<span class="meta" style="--d:${d}">${fmt(t.energy)} kcal<br><span class="dotline" aria-hidden="true">${dayGoals.map((g) => `<i class="${inRange(t[g.attribute], g) ? "" : "miss"}"></i>`).join("")}</span></span>`;
      }
      const al = state.schedule.atLeast[d];
      const atLeast = state.edit
        ? `<div class="atleast"><span>At least</span><span class="stepper">
            <button data-act="atleast" data-d="${d}" data-delta="-1" aria-label="Fewer meals at least on ${dayLong(d)}">−</button>
            <span class="val" aria-live="polite">${al == null ? "all" : al}</span>
            <button data-act="atleast" data-d="${d}" data-delta="1" aria-label="More meals at least on ${dayLong(d)}">+</button></span></div>`
        : al != null ? `<span class="badge-atleast">At least ${al} of ${plannedCount(d)}</span>` : "";

      days.push(`<article class="day ${d === state.selectedDay ? "selected" : ""}" aria-label="${dayLong(d)} ${dayDM(d)}">
        <button class="day-top" data-act="open-day" data-d="${d}" aria-label="Open ${dayLong(d)}, ${dayDM(d)}">
          <span><span class="dn">${dayShort(d)}</span><br><span class="dd">${dayDM(d)}</span></span>${meta}</button>
        ${slots}${atLeast}</article>`);
    }

    const sched = state.edit ? `
      <div class="sched-panel" role="group" aria-label="Schedule">
        <div class="row"><label for="startDate">Starts</label><input id="startDate" class="input" type="date" value="${state.schedule.start}" style="width:auto"></div>
        <div class="row"><span class="label" id="daysLbl">Number of days</span>
          <span class="stepper-lg" role="group" aria-labelledby="daysLbl"><button data-act="days" data-delta="-1" aria-label="Fewer days">−</button><output>${state.schedule.days}</output><button data-act="days" data-delta="1" aria-label="More days">+</button></span></div>
        <div><span class="label">Meals each day</span>
          <div class="meal-names" style="margin-top:8px">${meals.map((m, i) => `<span class="meal-name"><input value="${esc(m)}" data-meal="${i}" aria-label="Name of meal ${i + 1}" maxlength="24">
            <button data-act="remove-meal" data-i="${i}" aria-label="Remove ${esc(m)}">×</button></span>`).join("")}
            <button class="chip" data-act="add-meal" style="min-height:42px">+ Add meal</button></div>
          <p class="hint" style="margin:8px 0 0">Meal names are labels for you; the planner only counts meals. Tap a meal below to plan or skip it.</p></div>
        <button class="btn primary" data-act="toggle-edit">Done</button>
      </div>` : "";

    const hint = state.edit ? "Tap meals to plan or skip" : state.phase === "result" ? "Tap a day for totals" : "Tap a meal to skip it · hold to edit";
    $("#week").innerHTML = `
      <div class="week-head"><h2>${state.edit ? "Edit the week" : "The week"}</h2><span class="hint">${hint}</span></div>
      ${sched}
      <div class="strip ${state.edit ? "edit" : ""} ${state.fillAnim ? "fill-in" : ""}">${days.join("")}</div>`;
    const ns = $(".strip");
    if (keep != null) ns.scrollLeft = keep;
    state.fillAnim = false;
  }

  // ---------------------------------------------------------------- render: dock
  function renderDock() {
    const dock = $("#dock");
    if (state.edit) { dock.innerHTML = ""; return; }
    if (state.phase === "solving") {
      const s = state.solve;
      const pct = Math.min(100, (s.elapsed / state.maxSeconds) * 100);
      dock.innerHTML = `<div class="solving">
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${state.maxSeconds}" aria-valuenow="${Math.floor(s.elapsed)}" aria-label="Making plan">
          <span class="fillbar" style="width:${pct}%"></span><span class="spin" aria-hidden="true"></span>
          <span class="txt"><b>${s.stopping ? "Stopping…" : "Making plan…"}</b><span>${Math.floor(s.elapsed)} of ${state.maxSeconds} s</span></span></div>
        <button class="btn" data-act="cancel-solve" ${s.stopping ? "disabled" : ""}>Cancel</button></div>`;
      return;
    }
    if (state.phase === "result" && !state.saved && !state.stale) {
      dock.innerHTML = `<div class="dock-note">New plan, not saved</div><div class="result-dock">
        <button class="btn ghost" data-act="discard">Discard</button>
        <button class="btn" data-act="use-today">Use for today</button>
        <button class="btn accent save" data-act="save">Save</button></div>`;
      return;
    }
    const again = state.phase === "result" || state.phase === "clash";
    dock.innerHTML = `<button class="make" data-act="make-plan">${ICON.spark}
      <span class="lbl"><span>${again ? "Make plan again" : "Make plan"}</span><span class="sub">${totalMeals()} meals · up to ${state.maxSeconds} s</span></span></button>`;
  }

  function renderDemo() {
    const opts = [["optimal", "Best plan"], ["time_ran_out", "Time runs out"], ["clash", "No plan possible"]];
    $("#demo").innerHTML = `<span class="label" id="demoLbl">Demo · next Make plan gives</span>
      <div class="seg" role="group" aria-labelledby="demoLbl">${opts.map(([v, l]) => `<button data-act="demo" data-v="${v}" aria-pressed="${state.demo === v}">${l}</button>`).join("")}</div>`;
  }

  function render() {
    renderTop(); renderBento(); renderFilters(); renderNotice(); renderWeek(); renderDock(); renderDemo();
    refreshSheets();
  }

  // ---------------------------------------------------------------- toast
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ---------------------------------------------------------------- sheets (a stack)
  const stack = [];
  function openSheet({ kind = "bottom", label, render: renderFn, onClose, wide }) {
    const layer = document.createElement("div");
    layer.className = "layer";
    layer.innerHTML = `<div class="backdrop" data-act="close-sheet"></div>
      <div class="sheet ${kind}" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div>`;
    $("#sheets").appendChild(layer);
    const entry = { layer, sheet: layer.querySelector(".sheet"), render: renderFn, onClose, opener: document.activeElement };
    stack.push(entry);
    paint(entry);
    document.body.classList.add("locked", "sheet-open");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      layer.classList.add("open");
      const f = entry.sheet.querySelector("[autofocus]") || entry.sheet.querySelector("button, input, select, textarea");
      if (f) f.focus({ preventScroll: true });
    }));
    return entry;
  }
  function paint(entry) {
    const scroller = entry.sheet.querySelector(".sheet-body, .scroller");
    const top = scroller ? scroller.scrollTop : 0;
    const active = document.activeElement;
    const focusKey = active && entry.sheet.contains(active) ? active.dataset.fk : null;
    entry.sheet.innerHTML = entry.render();
    const ns = entry.sheet.querySelector(".sheet-body, .scroller");
    if (ns) ns.scrollTop = top;
    if (focusKey) { const f = entry.sheet.querySelector(`[data-fk="${focusKey}"]`); if (f) f.focus({ preventScroll: true }); }
    settleRings(entry.sheet);
  }
  function refreshSheets() { stack.forEach(paint); }
  const top = () => stack[stack.length - 1];
  function closeSheet() {
    const entry = stack.pop(); if (!entry) return;
    entry.layer.classList.remove("open");
    const done = () => entry.layer.remove();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) done(); else setTimeout(done, 440);
    if (!stack.length) document.body.classList.remove("locked", "sheet-open");
    if (entry.onClose) entry.onClose();
    if (entry.opener && document.contains(entry.opener)) entry.opener.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- sheet: day
  function openDay(d) {
    state.selectedDay = d;
    render();
    scrollToDay(d);
    openSheet({ label: "Day", render: () => dayHtml(state.selectedDay) });
  }
  function dayHtml(d) {
    const resDay = state.phase === "result" && state.result.days[d];
    const t = dayTotals(d);
    const meals = state.schedule.meals.map((m, mi) => {
      const skipped = isSkipped(d, m);
      const cell = resDay ? resDay.meals[mi] : null;
      if (skipped) {
        return `<div class="meal-row"><div class="thumb skip" aria-hidden="true">–</div><div><div class="mn">${esc(m)}</div><div class="rn" style="color:var(--ink-3)">Skipped</div>
          <div class="facts">Eating out, not home</div><div class="acts"><button class="btn small" data-act="skip-meal" data-d="${d}" data-m="${mi}">Plan this meal</button></div></div></div>`;
      }
      if (!cell) {
        return `<div class="meal-row"><div class="thumb skip" aria-hidden="true">?</div><div><div class="mn">${esc(m)}</div><div class="rn">${resDay ? "Left empty" : "Not planned yet"}</div>
          <div class="facts">${resDay ? "Allowed by “At least” on this day" : "Make plan fills this in"}</div>
          <div class="acts"><button class="btn small ghost" data-act="skip-meal" data-d="${d}" data-m="${mi}">Skip</button></div></div></div>`;
      }
      const r = RECIPES[cell[0]];
      return `<div class="meal-row"><button class="thumb" style="--h:${r.hue};border:0" data-act="open-recipe" data-id="${r.id}" aria-label="Open recipe ${esc(r.name)}">${esc(r.name[0])}</button>
        <div><div class="mn">${esc(m)}</div><div class="rn">${esc(r.name)}</div>
        <div class="facts">${fmt(r.per.energy * cell[1])} kcal · ${fmt(r.per.protein * cell[1])} g protein · ${fmt(r.per.cost * cell[1])} kr</div>
        <div class="acts">
          <span class="portion-step" role="group" aria-label="Portion size"><button data-act="portion" data-d="${d}" data-m="${mi}" data-delta="-0.5" aria-label="Smaller portion">−</button><output>×${fmtPortion(cell[1])}</output><button data-act="portion" data-d="${d}" data-m="${mi}" data-delta="0.5" aria-label="Bigger portion">+</button></span>
          <button class="btn small" data-act="swap" data-d="${d}" data-m="${mi}">${ICON.swap} Swap</button>
          <button class="btn small ghost" data-act="skip-meal" data-d="${d}" data-m="${mi}">Skip</button></div></div></div>`;
    }).join("");

    const gauges = resDay ? state.goals.map((g) => gaugeHtml(g, d, t)).join("") : `<p class="empty-note">Day totals appear here after Make plan.</p>`;
    const n = state.schedule.days;
    return `<button class="grab" data-act="close-sheet" aria-label="Close"></button>
      <div class="sheet-head"><div style="flex:1;min-width:0"><div class="sub">${dayDM(d)} · day ${d + 1} of ${n}</div><h2>${dayLong(d)}</h2></div>
        <div class="day-nav"><button class="icon-btn" data-act="day-step" data-delta="-1" ${d === 0 ? "disabled" : ""} aria-label="Previous day">${ICON.left}</button>
        <button class="icon-btn" data-act="day-step" data-delta="1" ${d === n - 1 ? "disabled" : ""} aria-label="Next day">${ICON.right}</button></div></div>
      <div class="sheet-body">
        ${meals}
        <div class="section-title">Day totals vs goals</div>
        ${gauges}
      </div>`;
  }
  function gaugeHtml(g, d, t) {
    const a = ATTR[g.attribute];
    const v = t[g.attribute];
    let verdict, scopeNote;
    if (g.scope === "plan_total") {
      const tot = planTotals()[g.attribute];
      scopeNote = `Plan total: ${fmt(tot, g.attribute)} of ${rangeText(g)}`;
      verdict = `<span class="verdict info">${Math.round((v / (g.max || g.min || 1)) * 100)}% of the ${a.name.toLowerCase()} goal</span>`;
      const scale = g.max || g.min;
      return gaugeShell(g, a, v, scopeNote, verdict, 0, scale, 0, Math.min(100, (v / scale) * 100), false);
    }
    const ok = inRange(v, g);
    let diff = "";
    if (!ok) diff = g.min != null && v < g.min ? `${fmt(g.min - v, g.attribute)} ${a.unit} under` : `${fmt(v - g.max, g.attribute)} ${a.unit} over`;
    const cls = ok ? "ok" : g.min != null && v < g.min ? "under" : "over";
    if (g.scope === "daily_average") {
      scopeNote = "Daily-average goal, this day alone";
      verdict = `<span class="verdict ${ok ? "ok" : "info"}">${ok ? "✓ In range" : (cls === "under" ? "↓ " : "↑ ") + diff + " today · the average counts"}</span>`;
    } else {
      scopeNote = SCOPE.day;
      verdict = `<span class="verdict ${cls}">${ok ? "✓ In range" : (cls === "under" ? "↓ " : "↑ ") + diff}</span>`;
    }
    const hi = Math.max(g.max != null ? g.max * 1.25 : g.min * 1.6, v * 1.1);
    const bandL = g.min != null ? (g.min / hi) * 100 : 0;
    const bandR = g.max != null ? (g.max / hi) * 100 : 100;
    return gaugeShell(g, a, v, scopeNote, verdict, bandL, bandR, null, (v / hi) * 100, !ok, g.max == null);
  }
  function gaugeShell(g, a, v, scopeNote, verdict, bandL, bandR, _x, markerPct, bad, openMax) {
    const isTotal = g.scope === "plan_total";
    const band = isTotal ? "" : `<span class="band ${openMax ? "openmax" : ""}" style="left:${bandL}%;width:${bandR - bandL}%"></span>`;
    const fillBar = isTotal ? `<span class="band" style="left:0;width:${markerPct}%;background:color-mix(in oklab, ${a.colour} 45%, transparent)"></span>` : "";
    return `<div class="gauge"><div class="g-top"><span class="g-name"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${a.colour};margin-right:6px"></span>${esc(g.name)}</span>
      <span class="g-val">${fmt(v, g.attribute)} ${a.unit}</span></div>
      <div class="track" aria-hidden="true">${band}${fillBar}${isTotal ? "" : `<span class="marker ${bad ? "bad" : ""}" style="left:${Math.min(98, markerPct)}%"></span>`}</div>
      <div class="g-foot"><span>${esc(scopeNote)} · goal ${esc(rangeText(g))}</span>${verdict}</div></div>`;
  }

  // ---------------------------------------------------------------- sheet: missed goals
  function openMissed() {
    openSheet({ label: "Goals", render: () => {
      const evals = state.goals.map((g) => [g, evalGoal(g)]);
      const missed = evals.filter(([, e]) => !e.met);
      const met = evals.filter(([, e]) => e.met);
      const row = ([g, e]) => `<button class="list-item" data-act="open-goal" data-id="${g.id}">
        <span class="ring" data-key="mg-${g.id}" style="width:42px;height:42px;flex:none">${ringSvg(e.progress, e.met ? ATTR[g.attribute].colour : "var(--accent)", 42, 5)}</span>
        <span class="t"><b>${esc(g.name)}</b><span>${esc(e.miss || `${rangeText(g)} · ${SCOPE[g.scope]}`)}${e.worst ? ` · ${esc(e.worst)}` : ""}</span></span>
        <span class="chev">${ICON.right}</span></button>`;
      return `<button class="grab" data-act="close-sheet" aria-label="Close"></button>
        <div class="sheet-head"><h2>${missed.length ? `${missed.length} missed ${missed.length === 1 ? "goal" : "goals"}` : "All goals met"}</h2></div>
        <div class="sheet-body">
          ${missed.length ? `<div class="list">${missed.map(row).join("")}</div>
            <p class="explain" style="margin:0">Prefer goals can be missed when meeting them all isn't possible. Raise the importance of the ones that matter most, or allow bigger portions.</p>` : ""}
          ${met.length ? `<div class="section-title">Met</div><div class="list">${met.map(row).join("")}</div>` : ""}
        </div>`;
    } });
  }

  // ---------------------------------------------------------------- sheet: goal editor
  function openGoal(id) {
    const existing = state.goals.find((g) => g.id === id);
    const draft = existing ? clone(existing) : { id: "g" + Date.now(), name: "", attribute: "fibre", min: null, max: null, scope: "day", strictness: "prefer", importance: 3 };
    if (draft.importance == null) draft.importance = 3;
    draft._advanced = false;
    const ctx = { draft, isNew: !existing, error: "" };
    openSheet({ label: existing ? "Edit goal" : "Add goal", render: () => goalHtml(ctx) });
    top().ctx = ctx;
  }
  function goalHtml({ draft: g, isNew, error }) {
    const a = ATTR[g.attribute];
    const name = g.name || `${a.name} goal`;
    const summary = `${a.name} · ${rangeText(g)} · ${SCOPE[g.scope]} · ${g.strictness === "must" ? "Must" : `Prefer, importance ${g.importance} of 5`}`;
    const prog = g.strictness === "must" ? 1 : g.importance / 5;
    return `<button class="grab" data-act="close-sheet" aria-label="Close"></button>
      <div class="sheet-head"><h2>${isNew ? "Add goal" : "Edit goal"}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Close">${ICON.close}</button></div>
      <div class="sheet-body">
        <div class="goal-preview"><span class="ring" data-key="gp">${ringSvg(prog, a.colour, 64, 7)}<span class="center" style="font-size:var(--t-xs)">${g.strictness === "must" ? "Must" : g.importance + "/5"}</span></span>
          <div style="min-width:0"><div class="gp-name">${esc(name)}</div><div class="gp-sum" id="goalSum">${esc(summary)}</div></div></div>

        <div class="field"><span id="attrLbl">What to track</span>
          <div class="attr-chips" role="group" aria-labelledby="attrLbl">${D.attributes.map((x) => `<button data-act="g-attr" data-v="${x.id}" data-fk="attr-${x.id}" aria-pressed="${g.attribute === x.id}" style="--c:${x.colour}"><i></i>${x.name}</button>`).join("")}</div></div>

        <div class="two">
          <label class="field"><span>Min</span><span class="input-unit"><input class="input" inputmode="decimal" data-g="min" data-fk="min" value="${g.min ?? ""}" placeholder="none"><span class="u">${a.unit}</span></span></label>
          <label class="field"><span>Max</span><span class="input-unit"><input class="input" inputmode="decimal" data-g="max" data-fk="max" value="${g.max ?? ""}" placeholder="none"><span class="u">${a.unit}</span></span></label>
        </div>
        ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ""}

        <div class="field"><span id="scopeLbl">Applies to</span>
          <div class="seg" role="group" aria-labelledby="scopeLbl">${Object.entries(SCOPE).map(([k, l]) => `<button data-act="g-scope" data-v="${k}" data-fk="scope-${k}" aria-pressed="${g.scope === k}">${l}</button>`).join("")}</div></div>

        <div class="field"><span id="strictLbl">How strict</span>
          <div class="seg strict" role="group" aria-labelledby="strictLbl">
            <button data-act="g-strict" data-v="must" data-fk="st-must" aria-pressed="${g.strictness === "must"}">Must</button>
            <button data-act="g-strict" data-v="prefer" data-fk="st-prefer" aria-pressed="${g.strictness === "prefer"}">Prefer</button></div>
          <div class="explain" style="margin-top:2px">${g.strictness === "must" ? "The plan fails rather than miss this goal." : "The planner tries, and weighs it against other Prefer goals."}</div></div>

        ${g.strictness === "prefer" ? `<label class="field"><span>Importance <b id="impVal">${g.importance}</b> of 5</span>
          <input type="range" min="1" max="5" step="1" value="${g.importance}" data-g="importance" data-fk="imp" aria-valuetext="Importance ${g.importance} of 5">
          <div class="ticks" aria-hidden="true"><span>Nice to have</span><span>Very important</span></div></label>` : ""}

        <details class="adv" ${g._advanced ? "open" : ""} data-g-adv><summary>Advanced</summary><div class="inner">
          <label class="field"><span>Goal name</span><input class="input" data-g="name" data-fk="name" value="${esc(g.name)}" placeholder="${esc(a.name)} goal" maxlength="60"></label>
          <label class="switch">Different importance below and above<input type="checkbox" data-g="split" data-fk="split" ${g.split ? "checked" : ""}></label>
          ${g.scope === "daily_average" ? `<label class="switch">Also keep each day in range<input type="checkbox" data-g="guard" data-fk="guard" ${g.guard ? "checked" : ""}></label>` : ""}
          <label class="field"><span>Count a miss as a percentage of</span><span class="input-unit"><input class="input" inputmode="decimal" data-g="ref" data-fk="ref" value="${g.ref ?? (g.max || g.min || "")}"><span class="u">${a.unit}</span></span></label>
        </div></details>
      </div>
      <div class="sheet-foot">
        ${isNew ? `<button class="btn ghost" data-act="close-sheet">Cancel</button>` : `<button class="btn danger" data-act="g-delete">Delete</button>`}
        <button class="btn primary" data-act="g-save">${isNew ? "Add goal" : "Save"}</button></div>`;
  }

  // ---------------------------------------------------------------- sheet: search / catalogue
  function openSearch(section) {
    const ctx = { q: "" };
    const entry = openSheet({ kind: "top", label: "Search", render: () => searchHtml(ctx) });
    entry.ctx = ctx;
    if (section) setTimeout(() => { const s = entry.sheet.querySelector(`#s-${section}`); if (s) s.scrollIntoView({ block: "start" }); }, 450);
  }
  function usableCount() {
    const only = state.filters.filter((f) => f.mode === "only").map((f) => f.tag);
    const never = state.filters.filter((f) => f.mode === "never").map((f) => f.tag);
    return D.recipes.filter((r) => !r.tags.some((t) => never.includes(t)) && (!only.length || r.tags.some((t) => only.includes(t)))).length;
  }
  function searchHtml(ctx) {
    const q = ctx.q.trim().toLowerCase();
    const match = (s) => !q || s.toLowerCase().includes(q);
    const recs = D.recipes.filter((r) => match(r.name) || r.tags.some(match));
    const ings = D.ingredients.filter(match);
    const tags = D.tags.filter(match);
    const never = state.filters.filter((f) => f.mode === "never").map((f) => f.tag);
    const filterOf = (t) => (state.filters.find((f) => f.tag === t) || { mode: "any" }).mode;
    const sections = [["recipes", "Recipes"], ["tags", "Tags & filters"], ["ingredients", "Ingredients"], ["plans", "Saved plans"], ["settings", "Settings"]];
    return `<div class="scroller">
      <div class="search-bar"><div class="wrap">${ICON.search}<input class="input" type="search" placeholder="Search everything" aria-label="Search recipes, ingredients and tags" data-search data-fk="search" value="${esc(ctx.q)}" ${ctx.q ? "" : "autofocus"}></div>
        <button class="icon-btn" data-act="close-sheet" aria-label="Close search">${ICON.close}</button></div>
      <nav class="jump" aria-label="Sections">${sections.map(([k, l]) => `<button class="chip" data-act="jump" data-to="${k}">${l}</button>`).join("")}</nav>

      <section class="s-section" id="s-recipes"><h3>Recipes <small>${recs.length} of ${D.recipes.length}</small></h3>
        <div class="list">${recs.map((r) => `<button class="list-item ${r.tags.some((t) => never.includes(t)) ? "dim" : ""}" data-act="open-recipe" data-id="${r.id}">
          <span class="sw" style="--h:${r.hue}" aria-hidden="true"></span><span class="t"><b>${esc(r.name)}</b>
          <span>${r.minutes} min · serves ${r.serves} · ${fmt(r.per.energy)} kcal · ${esc(r.tags.join(", "))}</span></span><span class="chev">${ICON.right}</span></button>`).join("") || `<div class="list-item"><span class="t"><span>No recipes match.</span></span></div>`}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" data-act="new-recipe">+ New recipe</button><button class="btn ghost" data-act="toast" data-msg="Import recipe opens the AI import (not in this prototype)">Import recipe</button></div></section>

      <section class="s-section" id="s-tags"><h3>Tags & filters <small>tap to cycle Any → Only → Never</small></h3>
        <div class="chips">${tags.map((t) => { const m = filterOf(t); return `<button class="chip chip-touch ${m === "any" ? "" : m}" data-act="cycle-filter" data-tag="${esc(t)}" aria-label="Filter for ${esc(t)}: ${m === "any" ? "Any" : m === "only" ? "Only" : "Never"}">${m === "any" ? "" : `<span class="k">${m === "only" ? "Only" : "Never"}</span>`} ${esc(t)}</button>`; }).join("")}</div>
        <p class="count-line">${usableCount()} of ${D.recipes.length} recipes can be used${state.filters.some((f) => f.note) ? " (Only: Weeknight applies to Mon–Thu dinners)" : ""}.</p></section>

      <section class="s-section" id="s-ingredients"><h3>Ingredients <small>${ings.length}</small></h3>
        <div class="chips">${ings.slice(0, q ? 40 : 18).map((i) => `<button class="chip chip-touch" data-act="toast" data-msg="${esc(i)}: ingredient editor isn't part of this prototype">${esc(i)}</button>`).join("")}
        ${!q && ings.length > 18 ? `<button class="chip chip-touch" data-act="toast" data-msg="Would list all ${ings.length} ingredients">Show all ${ings.length}</button>` : ""}</div></section>

      <section class="s-section" id="s-plans"><h3>Saved plans</h3>
        <div class="list">${D.savedPlans.map((p) => `<button class="list-item" data-act="toast" data-msg="Opens ${esc(p.label)} on the week board"><span class="t"><b>${esc(p.label)}${p.today ? ' <span class="status-pill ok" style="margin:0 0 0 6px;padding:2px 8px">Today</span>' : ""}</b><span>${p.days} days from ${esc(p.start)} · saved ${esc(p.savedAt)}</span></span><span class="chev">${ICON.right}</span></button>`).join("")}</div></section>

      <section class="s-section" id="s-settings"><h3>Settings</h3>
        <div class="list">
          <div class="set-row"><span class="t"><b>Max solving time</b><span>Whole seconds, at most 300 (5 minutes)</span></span>
            <span class="stepper-lg"><button data-act="max-step" data-delta="-5" aria-label="Less time">−</button><output>${state.maxSeconds} s</output><button data-act="max-step" data-delta="5" aria-label="More time">+</button></span></div>
          <div class="set-row"><span class="t"><b>Language</b><span>English · Svenska</span></span><span class="seg"><button aria-pressed="true" data-act="toast" data-msg="Already English">EN</button><button aria-pressed="false" data-act="toast" data-msg="Svenska: labels are longer, layouts leave room">SV</button></span></div>
          <button class="list-item" data-act="toast" data-msg="Units and conversions (slice U1) not in this prototype"><span class="t"><b>Units</b><span>Catalogue and conversions</span></span><span class="chev">${ICON.right}</span></button>
          <button class="list-item" data-act="toast" data-msg="Attributes editor not in this prototype"><span class="t"><b>Attributes</b><span>${D.attributes.map((x) => x.name).join(", ")}</span></span><span class="chev">${ICON.right}</span></button>
          <button class="list-item" data-act="toast" data-msg="AI key settings not in this prototype"><span class="t"><b>AI key</b><span>For recipe import</span></span><span class="chev">${ICON.right}</span></button>
        </div></section>
      <div style="height:calc(40px + var(--safe-bottom))"></div>
    </div>`;
  }

  // ---------------------------------------------------------------- sheet: recipe editor
  function openRecipe(id) {
    const base = RECIPES[id];
    let draft;
    if (id === D.recipeDetail.id) draft = clone(D.recipeDetail);
    else if (base) draft = { id, name: base.name, serves: base.serves, minutes: base.minutes, source: "", tags: [...base.tags], derivedTags: [], portion: { from: 0.5, to: 1.5, step: 0.5 },
      sections: [{ name: "Ingredients", lines: [] }], instructions: [""], _thin: true };
    else draft = { id: "new", name: "", serves: 4, minutes: 30, source: "", tags: [], derivedTags: [], portion: { from: 0.5, to: 1.5, step: 0.5 }, sections: [{ name: "Ingredients", lines: [] }], instructions: [""] };
    const ctx = { draft, editing: null, per: base ? base.per : { energy: 0, protein: 0, fibre: 0, salt: 0, cost: 0 }, hue: base ? base.hue : 260 };
    const entry = openSheet({ kind: "full", label: draft.name || "New recipe", render: () => recipeHtml(ctx) });
    entry.ctx = ctx;
  }
  const UNITS = ["g", "kg", "dl", "ml", "l", "pcs", "tbsp", "tsp", "cloves", "bunch"];
  function recipeHtml(ctx) {
    const r = ctx.draft;
    const sections = r.sections.map((s, si) => {
      const lines = s.lines.map((l, li) => {
        const key = `${si}-${li}`;
        if (ctx.editing === key) {
          return `<div class="line-edit" role="group" aria-label="Edit ${esc(l.ingredient)}">
            <b>${esc(l.ingredient || "New ingredient")}</b>
            ${l.ingredient ? "" : `<label class="field"><span>Ingredient</span><input class="input" list="ingList" data-l="ingredient" data-fk="ing-${key}" placeholder="Pick ingredient"></label>`}
            <div class="row"><label class="field"><span>Amount</span><input class="input" inputmode="decimal" data-l="amount" data-fk="amt-${key}" value="${l.amount ?? ""}" autofocus></label>
            <label class="field"><span>Unit</span><select class="input" data-l="unit" data-fk="unit-${key}">${UNITS.map((u) => `<option ${u === l.unit ? "selected" : ""}>${u}</option>`).join("")}<option value="__new">New unit…</option></select></label></div>
            <div class="hint">${l.note ? `Conversion: ${esc(l.note)}` : l.unit === "g" ? "The ingredient's own unit, no conversion needed." : `1 ${esc(l.unit)} = ? g. Add a conversion so totals can be counted.`}</div>
            <div class="acts"><button class="btn small danger" data-act="line-remove" data-k="${key}">Remove</button><button class="btn small primary" data-act="line-done">Done</button></div></div>`;
        }
        return `<div class="line ${l.needsReview ? "review" : ""}">
          <button class="amt" data-act="line-edit" data-k="${key}" aria-label="Amount of ${esc(l.ingredient)}: ${l.amount} ${esc(l.unit)}. Edit.">${fmt(l.amount)} <span class="u">${esc(l.unit)}</span></button>
          <div class="ing"><b>${esc(l.ingredient)}</b>
            ${l.note ? `<span class="conv">⇄ ${esc(l.note)}</span>` : ""}
            ${l.needsReview ? `<div class="rv">⚠ ${esc(l.unit)} doesn't convert. Pick another unit or add a conversion.
              <button class="btn small" data-act="line-edit" data-k="${key}">Change</button><button class="btn small primary" data-act="line-accept" data-k="${key}">Use 1 bunch = 25 g</button></div>` : ""}</div>
          <button class="more" data-act="toast" data-msg="Line menu: move to section, remove" aria-label="Line menu for ${esc(l.ingredient)}">⋯</button></div>`;
      }).join("");
      return `<section class="card"><div class="card-head"><input value="${esc(s.name)}" aria-label="Section name" data-sec="${si}" data-fk="sec-${si}">
          <button class="btn small ghost" data-act="toast" data-msg="Section menu: move, remove">⋯</button></div>
        ${lines || `<p class="empty-note">${r._thin ? "Only the chickpea curry has full ingredients in this prototype." : "Add at least one ingredient."}</p>`}
        <button class="add-line" data-act="line-add" data-s="${si}">+ Add ingredient</button></section>`;
    }).join("");

    const p = ctx.per;
    const tagSet = new Set([...r.tags, ...r.derivedTags]);
    return `<div class="scroller">
      <div class="sticky-head"><button class="icon-btn" data-act="close-sheet" aria-label="Close without saving">${ICON.close}</button>
        <span class="ttl">${r.id === "new" ? "New recipe" : "Edit recipe"}</span>
        <button class="btn accent" data-act="recipe-save">Save</button></div>
      <div class="r-hero" style="--h:${ctx.hue}"><span class="initial" aria-hidden="true">${esc((r.name || "N")[0])}</span>
        <textarea rows="2" aria-label="Recipe name" data-r="name" data-fk="rname" placeholder="Recipe name">${esc(r.name)}</textarea>
        <div class="meta"><span>${r.minutes} min</span><span>${tagSet.size} tags</span>${r.source ? `<span>Source linked</span>` : ""}</div></div>
      <div class="r-body">
        <section class="card serves-row"><span class="t"><b>Serves</b><span>Amounts are for the whole recipe.</span></span>
          <span class="stepper-lg" role="group" aria-label="Serves"><button data-act="serves" data-delta="-1" aria-label="Fewer servings">−</button><output>${r.serves}</output><button data-act="serves" data-delta="1" aria-label="More servings">+</button></span></section>

        ${sections}
        <button class="btn ghost block" data-act="section-add">+ Add section</button>

        <section class="card"><div class="card-head"><h3>Instructions</h3></div>
          <ol class="steps">${r.instructions.map((s, i) => `<li><textarea rows="2" aria-label="Step ${i + 1}" data-step="${i}" data-fk="step-${i}">${esc(s)}</textarea></li>`).join("")}</ol>
          <button class="add-line" data-act="step-add">+ Add step</button></section>

        <section class="card"><div class="card-head"><h3>Tags</h3></div>
          <div class="chips">${D.tags.map((t) => { const derived = r.derivedTags.includes(t); const on = tagSet.has(t);
            return `<button class="chip chip-touch ${on ? "on" : ""} ${derived ? "derived" : ""}" data-act="tag-toggle" data-tag="${esc(t)}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(t)}${derived ? ' <span class="k">· from ingredients</span>' : ""}</button>`; }).join("")}</div>
          <p class="explain" style="margin:10px 0 0">Tags from the ingredients are on already, by each tag's rule.</p></section>

        <section class="card"><div class="card-head"><h3>Portion size</h3></div>
          <div class="portion-grid">${["from", "to", "step"].map((k) => `<label class="field"><span>${k === "from" ? "From" : k === "to" ? "To" : "In steps"}</span><span class="input-unit"><input class="input" inputmode="decimal" data-portion="${k}" data-fk="p-${k}" value="${r.portion[k]}"><span class="u">×</span></span></label>`).join("")}</div>
          <p class="explain" style="margin:10px 0 0">The planner picks ${r.portion.from}×, ${[r.portion.from + r.portion.step, r.portion.to].filter((v, i, a) => a.indexOf(v) === i && v < r.portion.to).map((v) => v + "×").join(", ")}${r.portion.to > r.portion.from ? " or " + r.portion.to + "×" : ""} of a portion.</p></section>

        <section class="card"><div class="card-head"><h3>Per portion</h3><span class="explain" style="margin:0">from the ingredients</span></div>
          <div class="mini-bento">
            <div class="mb big"><span class="k">Energy</span><span class="v">${fmt(p.energy)}<small> kcal</small></span></div>
            <div class="mb"><span class="k"><span class="dot" style="--c:${ATTR.protein.colour}"></span>Protein</span><div class="v">${fmt(p.protein)}<small> g</small></div></div>
            <div class="mb"><span class="k"><span class="dot" style="--c:${ATTR.fibre.colour}"></span>Fibre</span><div class="v">${fmt(p.fibre)}<small> g</small></div></div>
            <div class="mb"><span class="k"><span class="dot" style="--c:${ATTR.salt.colour}"></span>Salt</span><div class="v">${fmt(p.salt, "salt")}<small> g</small></div></div>
            <div class="mb"><span class="k"><span class="dot" style="--c:${ATTR.cost.colour}"></span>Cost</span><div class="v">${fmt(p.cost)}<small> kr</small></div></div>
          </div>
          ${r.sections.some((s) => s.lines.some((l) => l.needsReview)) ? `<p class="explain" style="margin:10px 0 0;color:var(--warn)">⚠ One line needs review and is left out of these totals.</p>` : ""}</section>

        <section class="card"><label class="field"><span>Source</span><input class="input" type="url" data-r="source" data-fk="src" value="${esc(r.source)}" placeholder="https://"></label>
          ${r.source ? `<button class="btn small ghost" style="margin-top:8px" data-act="toast" data-msg="Opens ${esc(r.source)}">Open source ↗</button>` : ""}</section>
      </div>
      <datalist id="ingList">${D.ingredients.map((i) => `<option value="${esc(i)}">`).join("")}</datalist>
    </div>`;
  }

  // ---------------------------------------------------------------- solving
  const SIM = 0.2; // real seconds per simulated second
  function makePlan() {
    if (state.phase === "solving") return;
    if (state.edit) state.edit = false;
    const outcome = state.demo === "clash" && Object.keys(state.clashResolved).length ? "optimal" : state.demo;
    // apply "Make Prefer" choices from the clash card
    Object.keys(state.clashResolved).forEach((id) => { const g = state.goals.find((x) => x.id === id); if (g) { g.strictness = "prefer"; g.importance = g.importance || 5; } });
    state.clashResolved = {};
    const end = outcome === "optimal" ? D.result.solvedIn : outcome === "time_ran_out" ? state.maxSeconds : 3;
    state.phase = "solving"; state.saved = false; state.stale = false; state.result = null;
    state.solve = { elapsed: 0, end, outcome, stopping: false, t0: performance.now() };
    render();
    const tick = () => {
      const s = state.solve; if (!s || state.phase !== "solving") return;
      s.elapsed = Math.min(s.end, (performance.now() - s.t0) / 1000 / SIM);
      if (s.elapsed >= s.end) return finishSolve(s.outcome, s.end);
      renderDock();
      s.raf = requestAnimationFrame(tick);
    };
    state.solve.raf = requestAnimationFrame(tick);
  }
  function finishSolve(outcome, secs) {
    state.solve = null;
    if (outcome === "clash") {
      state.phase = "clash";
      render();
      toast("No plan possible with these settings");
      return;
    }
    state.phase = "result";
    state.result = { status: outcome, solvedIn: Math.round(secs), days: clone(D.result.days).map((d) => ({ meals: d.meals })) };
    // honour the current schedule: skipped meals stay empty, newly planned ones get a recipe
    alignResultToSchedule();
    state.fillAnim = true;
    render();
    const ev = state.goals.map(evalGoal);
    const missed = ev.filter((e) => !e.met).length;
    toast(missed ? `Plan ready · ${missed} goal${missed === 1 ? "" : "s"} missed` : "Plan ready · all goals met");
  }
  function alignResultToSchedule() {
    const pool = ["r3", "r6", "r9", "r10", "r7", "r1", "r4", "r11"];
    for (let d = 0; d < state.schedule.days; d++) {
      const day = state.result.days[d] || (state.result.days[d] = { meals: [] });
      day.meals = state.schedule.meals.map((m, mi) => {
        if (isSkipped(d, m)) return null;
        return day.meals[mi] || [pool[(d + mi) % pool.length], 1];
      });
    }
  }
  function cancelSolve() {
    const s = state.solve; if (!s) return;
    s.stopping = true; renderDock();
    setTimeout(() => {
      cancelAnimationFrame(s.raf);
      state.solve = null; state.phase = "idle";
      render(); toast("Stopped before any plan was found");
    }, 500);
  }

  // ---------------------------------------------------------------- actions
  function scrollToDay(d) {
    const strip = $(".strip"); const el = strip && strip.children[d]; if (!el) return;
    strip.scrollTo({ left: el.offsetLeft - 16, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function confirmSheet(title, body, okLabel, onOk) {
    openSheet({ label: title, render: () => `<button class="grab" data-act="close-sheet" aria-label="Close"></button>
      <div class="sheet-head"><h2>${esc(title)}</h2></div><div class="sheet-body"><p style="margin:0;color:var(--ink-2)">${esc(body)}</p></div>
      <div class="sheet-foot"><button class="btn ghost" data-act="close-sheet">Keep</button><button class="btn danger" data-act="confirm-ok">${esc(okLabel)}</button></div>` });
    top().onOk = onOk;
  }

  const actions = {
    "toast": (el) => toast(el.dataset.msg),
    "close-sheet": () => closeSheet(),
    "open-search": (el) => openSearch(el.dataset.section),
    "jump": (el) => { const s = top().sheet.querySelector(`#s-${el.dataset.to}`); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); },
    "toggle-edit": () => {
      if (stack.length) while (stack.length) closeSheet();
      state.edit = !state.edit; render();
      if (state.edit) { $("#week").scrollIntoView({ behavior: "smooth", block: "start" }); toast("Editing the week · tap meals to plan or skip"); }
    },
    "slot": (el) => {
      const d = +el.dataset.d, m = state.schedule.meals[+el.dataset.m];
      if (longPressFired) { longPressFired = false; return; }
      if (state.edit || state.phase !== "result") {
        if (state.phase === "solving") return;
        toggleSkip(d, m);
        if (state.result) syncResultSlot(d, +el.dataset.m);
        render();
        toast(isSkipped(d, m) ? `${m} on ${dayShort(d)} skipped` : `${m} on ${dayShort(d)} planned`);
      } else openDay(d);
    },
    "open-day": (el) => openDay(+el.dataset.d),
    "day-step": (el) => { const d = Math.max(0, Math.min(state.schedule.days - 1, state.selectedDay + +el.dataset.delta)); state.selectedDay = d; render(); scrollToDay(d); },
    "atleast": (el) => {
      const d = +el.dataset.d, max = plannedCount(d), cur = state.schedule.atLeast[d] ?? max;
      const next = Math.max(0, Math.min(max, cur + +el.dataset.delta));
      if (next >= max) delete state.schedule.atLeast[d]; else state.schedule.atLeast[d] = next;
      markStale(); render();
    },
    "days": (el) => {
      state.schedule.days = Math.max(1, Math.min(14, state.schedule.days + +el.dataset.delta));
      if (state.selectedDay >= state.schedule.days) state.selectedDay = state.schedule.days - 1;
      markStale(); render();
    },
    "add-meal": () => {
      if (state.schedule.meals.length >= 6) return toast("At most 6 meals a day");
      let n = state.schedule.meals.length + 1, name = "Snack";
      while (state.schedule.meals.includes(name)) name = `Meal ${n++}`;
      state.schedule.meals.push(name); markStale(); render();
      const inputs = document.querySelectorAll("[data-meal]"); inputs[inputs.length - 1].select();
    },
    "remove-meal": (el) => {
      if (state.schedule.meals.length <= 1) return toast("Keep at least one meal");
      const i = +el.dataset.i, name = state.schedule.meals[i];
      state.schedule.meals.splice(i, 1);
      if (state.result) state.result.days.forEach((d) => d.meals.splice(i, 1));
      markStale(); render(); toast(`${name} removed`);
    },
    "open-goal": (el) => openGoal(el.dataset.id),
    "add-goal": () => openGoal(null),
    "open-missed": () => openMissed(),
    "cycle-filter": (el) => {
      const tag = el.dataset.tag;
      let f = state.filters.find((x) => x.tag === tag);
      if (!f) { f = { tag, mode: "any" }; state.filters.push(f); }
      f.mode = f.mode === "any" ? "only" : f.mode === "only" ? "never" : "any";
      if (f.mode === "any") delete f.note;
      markStale(); render();
      toast(`${f.mode === "any" ? "Any" : f.mode === "only" ? "Only" : "Never"}: ${tag} · ${usableCount()} of ${D.recipes.length} recipes can be used`);
    },
    "max-time": () => openSearch("settings"),
    "max-step": (el) => { state.maxSeconds = Math.max(5, Math.min(300, state.maxSeconds + +el.dataset.delta)); render(); },
    "make-plan": () => makePlan(),
    "cancel-solve": () => cancelSolve(),
    "save": () => { state.saved = true; render(); toast(`Saved as Week ${isoWeek(startDate())}`); },
    "use-today": () => toast(`Today's meals now come from Week ${isoWeek(startDate())}`),
    "discard": () => confirmSheet("Discard this plan?", "This can't be undone.", "Discard", () => {
      state.phase = "idle"; state.result = null; state.saved = false; state.stale = false; render(); toast("Plan discarded");
    }),
    "confirm-ok": () => { const fn = top().onOk; closeSheet(); fn && fn(); },
    "demo": (el) => { state.demo = el.dataset.v; renderDemo(); },
    "clash-prefer": (el) => { state.clashResolved[el.dataset.id] = true; renderNotice(); },
    "clash-keep": (el) => { delete state.clashResolved[el.dataset.id]; renderNotice(); },

    // day sheet
    "portion": (el) => {
      const cell = state.result.days[+el.dataset.d].meals[+el.dataset.m];
      cell[1] = Math.max(0.5, Math.min(3, cell[1] + +el.dataset.delta));
      render();
    },
    "swap": (el) => {
      const d = +el.dataset.d, mi = +el.dataset.m;
      const cell = state.result.days[d].meals[mi];
      const never = state.filters.filter((f) => f.mode === "never").map((f) => f.tag);
      const ok = D.recipes.filter((r) => !r.tags.some((t) => never.includes(t)) && r.id !== cell[0]);
      const next = ok[(ok.findIndex((r) => r.id > cell[0]) + 1 + mi) % ok.length] || ok[0];
      cell[0] = next.id; state.fillAnim = false; render();
      toast(`Swapped to ${next.name}`);
    },
    "skip-meal": (el) => {
      const d = +el.dataset.d, mi = +el.dataset.m, m = state.schedule.meals[mi];
      toggleSkip(d, m); state.stale = false; // the day sheet edits the plan directly
      if (state.result) syncResultSlot(d, mi);
      render(); toast(isSkipped(d, m) ? `${m} skipped` : `${m} planned`);
    },
    "open-recipe": (el) => openRecipe(el.dataset.id),
    "new-recipe": () => openRecipe("__new"),

    // goal editor
    "g-attr": (el) => { const c = top().ctx; c.draft.attribute = el.dataset.v; paint(top()); },
    "g-scope": (el) => { const c = top().ctx; c.draft.scope = el.dataset.v; paint(top()); },
    "g-strict": (el) => { const c = top().ctx; c.draft.strictness = el.dataset.v; paint(top()); },
    "g-save": () => {
      const c = top().ctx, g = c.draft;
      if (g.min == null && g.max == null) { c.error = "Give a minimum, a maximum or both."; return paint(top()); }
      if (g.min != null && g.max != null && g.min > g.max) { c.error = "Min must be at most the maximum."; return paint(top()); }
      if (!g.name) g.name = `${ATTR[g.attribute].name} goal`;
      delete g._advanced;
      const i = state.goals.findIndex((x) => x.id === g.id);
      if (i >= 0) state.goals[i] = g; else state.goals.push(g);
      closeSheet(); render(); toast(c.isNew ? "Goal added" : "Goal saved");
    },
    "g-delete": () => {
      const id = top().ctx.draft.id;
      confirmSheet("Delete this goal?", "The next plan won't use it.", "Delete", () => {
        state.goals = state.goals.filter((g) => g.id !== id); closeSheet(); render(); toast("Goal deleted");
      });
    },

    // recipe editor
    "serves": (el) => { const r = top().ctx.draft; r.serves = Math.max(1, Math.min(1000, r.serves + +el.dataset.delta)); paint(top()); },
    "line-edit": (el) => { top().ctx.editing = el.dataset.k; paint(top()); },
    "line-done": () => { const c = top().ctx; c.editing = null; paint(top()); },
    "line-accept": (el) => { const [s, l] = el.dataset.k.split("-").map(Number); const line = top().ctx.draft.sections[s].lines[l]; line.needsReview = false; line.note = "1 bunch = 25 g"; paint(top()); toast("Conversion added"); },
    "line-remove": (el) => { const [s, l] = el.dataset.k.split("-").map(Number); const c = top().ctx; const [gone] = c.draft.sections[s].lines.splice(l, 1); c.editing = null; paint(top()); toast(`${gone.ingredient || "Line"} removed`); },
    "line-add": (el) => { const c = top().ctx; const s = +el.dataset.s; c.draft.sections[s].lines.push({ ingredient: "", amount: null, unit: "g" }); c.editing = `${s}-${c.draft.sections[s].lines.length - 1}`; paint(top());
      const f = top().sheet.querySelector('[data-l="ingredient"]'); if (f) f.focus(); },
    "section-add": () => { const c = top().ctx; c.draft.sections.push({ name: `Section ${c.draft.sections.length + 1}`, lines: [] }); paint(top()); },
    "step-add": () => { const c = top().ctx; c.draft.instructions.push(""); paint(top()); const t = top().sheet.querySelectorAll("[data-step]"); t[t.length - 1].focus(); },
    "tag-toggle": (el) => { const r = top().ctx.draft, t = el.dataset.tag;
      if (r.derivedTags.includes(t)) { r.derivedTags = r.derivedTags.filter((x) => x !== t); r.tags = r.tags.filter((x) => x !== t); }
      else if (r.tags.includes(t)) r.tags = r.tags.filter((x) => x !== t); else r.tags.push(t);
      paint(top()); },
    "recipe-save": () => { const r = top().ctx.draft; if (!r.name.trim()) return toast("Give the recipe a name"); closeSheet(); toast(`Saved “${r.name}”`); },
  };

  function syncResultSlot(d, mi) {
    const day = state.result && state.result.days[d]; if (!day) return;
    const m = state.schedule.meals[mi];
    if (isSkipped(d, m)) day.meals[mi] = null;
    else if (!day.meals[mi]) day.meals[mi] = [["r6", "r9", "r3", "r10"][(d + mi) % 4], 1];
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { fn(el, e); }
  });

  // inputs inside sheets and the schedule panel
  document.addEventListener("input", (e) => {
    const t = e.target;
    const entry = top();
    if (t.matches("[data-search]")) { entry.ctx.q = t.value; paint(entry); return; }
    if (t.matches("[data-g]") && entry && entry.ctx) {
      const g = entry.ctx.draft, k = t.dataset.g;
      if (k === "min" || k === "max" || k === "ref") {
        const v = t.value.trim().replace(",", ".");
        g[k] = v === "" ? null : Number.isFinite(+v) ? +v : g[k];
        entry.ctx.error = v !== "" && !Number.isFinite(+v) ? "A number, such as 120 or 1.5." : "";
      } else if (k === "importance") { g.importance = +t.value; const iv = $("#impVal"); if (iv) iv.textContent = t.value; t.setAttribute("aria-valuetext", `Importance ${t.value} of 5`); }
      else if (k === "name") g.name = t.value;
      else if (k === "split" || k === "guard") g[k] = t.checked;
      const a = ATTR[g.attribute];
      const sum = $("#goalSum");
      if (sum) sum.textContent = `${a.name} · ${rangeText(g)} · ${SCOPE[g.scope]} · ${g.strictness === "must" ? "Must" : `Prefer, importance ${g.importance} of 5`}`;
      if (k === "importance") { const c = entry.sheet.querySelector(".goal-preview .center"); if (c) c.textContent = g.importance + "/5";
        const f = entry.sheet.querySelector(".goal-preview .fill"); if (f) { const circ = +f.getAttribute("stroke-dasharray"); f.style.strokeDashoffset = circ * (1 - g.importance / 5); } }
      return;
    }
    if (t.matches("[data-meal]")) { state.schedule.meals[+t.dataset.meal] = t.value; markStale(); return; }
    if (t.matches("#startDate") && t.value) { state.schedule.start = t.value; markStale(); renderTop(); return; }
    if (entry && entry.ctx && entry.ctx.draft && entry.ctx.draft.sections) {
      const r = entry.ctx.draft;
      if (t.dataset.r) r[t.dataset.r] = t.value;
      else if (t.dataset.step != null) r.instructions[+t.dataset.step] = t.value;
      else if (t.dataset.sec != null) r.sections[+t.dataset.sec].name = t.value;
      else if (t.dataset.portion) { const v = +t.value.replace(",", "."); if (Number.isFinite(v) && v > 0) r.portion[t.dataset.portion] = v; }
      else if (t.dataset.l && entry.ctx.editing) {
        const [s, l] = entry.ctx.editing.split("-").map(Number); const line = r.sections[s].lines[l];
        if (t.dataset.l === "amount") { const v = +t.value.replace(",", "."); line.amount = Number.isFinite(v) ? v : line.amount; }
        else if (t.dataset.l === "ingredient") line.ingredient = t.value;
      }
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target; const entry = top();
    if (t.matches("[data-meal]")) { if (!t.value.trim()) { toast("Name every meal"); } render(); return; }
    if (t.matches("[data-g-adv]")) return;
    if (t.dataset.l === "unit" && entry && entry.ctx.editing) {
      if (t.value === "__new") { toast("New unit… opens the unit catalogue"); t.value = "g"; return; }
      const [s, l] = entry.ctx.editing.split("-").map(Number); const line = entry.ctx.draft.sections[s].lines[l];
      line.unit = t.value; if (line.note && !line.note.startsWith("1 " + t.value)) delete line.note;
      paint(entry);
    }
    if (t.dataset.l === "ingredient" && entry) paint(entry);
    if (t.dataset.portion && entry) paint(entry);
  });
  document.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("[data-g-adv]")) { const c = top() && top().ctx; if (c) c.draft._advanced = e.target.open; } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && stack.length) closeSheet(); });

  // long-press a meal slot: enter edit mode
  let lpTimer = null, longPressFired = false;
  document.addEventListener("pointerdown", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot || state.edit || state.phase === "solving") return;
    lpTimer = setTimeout(() => { longPressFired = true; state.edit = true; render(); if (navigator.vibrate) navigator.vibrate(12); toast("Editing the week"); }, 550);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((t) => document.addEventListener(t, () => clearTimeout(lpTimer)));
  document.addEventListener("scroll", () => clearTimeout(lpTimer), true);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest(".slot")) e.preventDefault(); });

  // pull down at the top to open search
  let pullY = null, pulled = 0;
  const hint = () => $("#pullHint");
  document.addEventListener("touchstart", (e) => { if (!stack.length && window.scrollY <= 0 && !e.target.closest(".strip")) pullY = e.touches[0].clientY; }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (pullY == null) return;
    pulled = Math.max(0, e.touches[0].clientY - pullY);
    $("#top").style.transform = `translateY(${Math.min(60, pulled * 0.4)}px)`;
    hint().classList.toggle("show", pulled > 80);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (pullY == null) return;
    $("#top").style.transform = ""; hint().classList.remove("show");
    if (pulled > 80) openSearch();
    pullY = null; pulled = 0;
  });

  render();
})();
