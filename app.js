/* ============================================================
   WORKOUTS app — lecture live GitHub (public) + écriture Contents API
   Source de vérité : logs/YYYY/MM/YYYY-MM-DD.md (Completed)
   ============================================================ */
'use strict';

/* ---------- config ---------- */
const REPO = 'RonaldoM9/workouts';
const BRANCH = 'main';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const API = `https://api.github.com/repos/${REPO}`;
const LS_FILES = 'wk.files.v1';
const LS_TOKEN = 'wk.token';
const DRAFT_PREFIX = 'wk.draft.';

const EXOS = [
  'Bench Press','Trap Bar Deadlift','Landmine Press','Pull-Up','Dip','Chin-Up',
  'Barbell Row','Overhead Press','Squat','Romanian Deadlift','Push-Up','Glute Bridge',
  'KB Swing','KB Clean','KB Press','KB Goblet Squat','KB Turkish Get-Up','KB Snatch','KB Row',
  'Farmer Carry','Sandbag Carry','Sandbag Shoulder','Sandbag Squat','Suitcase Carry','Waiter Carry',
  'Plank','Hanging Leg Raise','TRX Row','TRX Push-Up','Box Jump','Step-Up','Burpee',
  'Rower','Bike','Run','Walk','Ski Erg'
];
const EXO_EMOJI = {
  'Bench Press':'🏋️','Trap Bar Deadlift':'🦾','Landmine Press':'🔥','Pull-Up':'🧗','Dip':'💪','Chin-Up':'🧗',
  'Barbell Row':'🚣','Overhead Press':'🏋️','Squat':'🦵','Romanian Deadlift':'🍑','Push-Up':'🙌','Glute Bridge':'🦵',
  'KB Swing':'⚡','KB Clean':'⚡','KB Press':'🏋️','KB Goblet Squat':'🦵','KB Turkish Get-Up':'🌀','KB Snatch':'⚡','KB Row':'🚣',
  'Farmer Carry':'🧱','Sandbag Carry':'🥋','Sandbag Shoulder':'🥋','Sandbag Squat':'🥋',
  'Suitcase Carry':'🧱','Waiter Carry':'🧱','Plank':'🧊','Hanging Leg Raise':'🧊',
  'TRX Row':'⛓️','TRX Push-Up':'⛓️','Box Jump':'📦','Step-Up':'🪜','Burpee':'💥',
  'Rower':'🚣','Bike':'🚴','Run':'🏃','Walk':'🚶','Ski Erg':'🎿'
};
const exoEmoji = e => EXO_EMOJI[e] || '💪';

/* ---------- state ---------- */
const state = {
  files: {},          // path -> texte markdown
  workouts: [],       // [{date,path,readiness,plannedMd,completed,hasCompleted,conditioning,review,prsMd}]
  treeSha: null,
  ui: { view: 'home', session: null, loggerDate: null, docSub: 'profil', progExo: null },
  lg: null            // état formulaire logger
};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch {} };
const getToken = () => { try { return localStorage.getItem(LS_TOKEN) || ''; } catch { return ''; } };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtFR = dstr => { if(!dstr) return ''; const [y,m,d] = dstr.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}).replace(/^./,c=>c.toUpperCase()); };
const fmtShort = dstr => { if(!dstr) return ''; const [,m,d] = dstr.split('-'); return `${d}/${m}`; };
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

let toastTimer = null;
function toast(msg, type = '', dur = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), dur);
}
function showModal(html) { $('#modal-body').innerHTML = html; $('#modal-wrap').classList.remove('hidden'); }
function hideModal() { $('#modal-wrap').classList.add('hidden'); }
function loading(on) { $('#loading').classList.toggle('hidden', !on); }

/* ============================================================
   Markdown lite (rendu) + parse workouts
   ============================================================ */
function mdInline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
function mdToHtml(md) {
  const lines = String(md || '').split('\n');
  let out = '', i = 0, list = null;
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  while (i < lines.length) {
    let ln = lines[i].replace(/\s+$/, '');
    if (!ln.trim()) { closeList(); i++; continue; }
    const l = ln.trimStart();
    if (l.startsWith('```')) {
      closeList(); const code = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith('```'); i++) code.push(lines[i]);
      out += `<pre class="doc-code">${esc(code.join('\n'))}</pre>`; i++;
    } else if (/^\|.*\|$/.test(l)) {
      closeList(); const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(lines[i].trim()); i++; }
      const th = rows[0].split('|').slice(1,-1).map(c => `<th>${mdInline(c.trim())}</th>`).join('');
      const trs = rows.slice(2).map(r => '<tr>' + r.split('|').slice(1,-1).map(c => `<td>${mdInline(c.trim())}</td>`).join('') + '</tr>').join('');
      out += `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
    } else if (/^#{1,4}\s/.test(l)) {
      closeList(); const lvl = l.match(/^#+/)[0].length; out += `<h${lvl}>${mdInline(l.replace(/^#+\s*/, ''))}</h${lvl}>`; i++;
    } else if (/^[-*]\s+/.test(l)) {
      if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; }
      out += `<li>${mdInline(l.replace(/^[-*]\s+/, ''))}</li>`; i++;
    } else if (/^\d+\.\s+/.test(l)) {
      if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; }
      out += `<li>${mdInline(l.replace(/^\d+\.\s+/, ''))}</li>`; i++;
    } else if (/^>\s?/.test(l)) {
      closeList(); const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      out += `<blockquote>${mdToHtml(q.join('\n'))}</blockquote>`;
    } else {
      closeList(); out += `<p>${mdInline(l)}</p>`; i++;
    }
  }
  closeList();
  return out;
}
function kvParse(text) {
  const o = {};
  String(text || '').split('\n').forEach(ln => {
    const m = ln.match(/^([^:]{1,30}):\s*(.*)$/);
    if (m && (m[2] || m[1])) o[m[1].trim()] = m[2].trim();
  });
  return o;
}
function parseWorkout(md) {
  const parts = String(md || '').split(/^## (.+)$/m);
  const sec = {};
  for (let i = 1; i < parts.length; i += 2) sec[parts[i].trim()] = (parts[i+1] || '').replace(/^\n+|\n+$/g, '');
  const dm = String(md).match(/# Workout\s*[—-]?\s*(\d{4}-\d{2}-\d{2})/);
  const rows = [];
  String(sec['Completed Workout'] || '').split('\n').forEach(ln => {
    if (!/^\|.*\|$/.test(ln.trim())) return;
    const c = ln.trim().split('|').slice(1, -1).map(x => x.trim());
    if (c.length < 6 || !c[0] || c[0].toLowerCase() === 'exercise' || /^-+$/.test(c[0])) return;
    rows.push({ ex: c[0], set: c[1], reps: c[2], weight: c[3], rpe: c[4], notes: c[5] });
  });
  return {
    readiness: kvParse(sec.Readiness),
    plannedMd: sec['Planned Workout'] || '',
    completed: rows,
    hasCompleted: rows.length > 0,
    conditioning: kvParse(sec.Conditioning),
    review: kvParse(sec.Review),
    prsMd: sec.PRs || ''
  };
}

/* ============================================================
   Lecture GitHub (tree + raws) avec cache localStorage
   ============================================================ */
async function fetchTree() {
  const r = await fetch(`${API}/git/trees/${BRANCH}?recursive=1`);
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  return { sha: j.sha, paths: (j.tree || []).filter(t => t.type === 'blob' && t.path.endsWith('.md')).map(t => t.path) };
}
async function refreshFiles(force = false) {
  const cache = lsGet(LS_FILES, null);
  const tree = await fetchTree();
  if (!force && cache && cache.sha === tree.sha && cache.files) {
    state.files = cache.files; state.treeSha = tree.sha;
    return; // cache à jour
  }
  const files = {};
  const fetches = tree.paths.map(async p => {
    try {
      const r = await fetch(RAW + p);
      if (r.ok) files[p] = await r.text();
    } catch { /* retry ci-dessous */ }
  });
  await Promise.all(fetches);
  // retry une fois les fichiers manquants
  const missing = tree.paths.filter(p => files[p] === undefined);
  for (const p of missing) {
    try { const r = await fetch(RAW + p); if (r.ok) files[p] = await r.text(); } catch { /* abandon */ }
  }
  if (!Object.keys(files).length && tree.paths.length) throw new Error('fichiers illisibles');
  state.files = files; state.treeSha = tree.sha;
  lsSet(LS_FILES, { sha: tree.sha, files });
}
function buildWorkouts() {
  const out = [];
  Object.keys(state.files).filter(p => p.startsWith('logs/') && p.endsWith('.md')).forEach(p => {
    const dm = p.match(/logs\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\.md/);
    if (!dm) return;
    const parsed = parseWorkout(state.files[p]);
    out.push({ date: dm[3], path: p, ...parsed });
  });
  out.sort((a, b) => b.date.localeCompare(a.date));
  state.workouts = out;
}
const byDate = dstr => state.workouts.find(w => w.date === dstr);

/* ============================================================
   GitHub écriture (Contents API, token fine-grained)
   ============================================================ */
function b64(s) { return btoa(unescape(encodeURIComponent(s))); }

function buildFileMd(date, f) {
  const existing = byDate(date);
  const planned = (existing && existing.plannedMd) ? existing.plannedMd : '';
  const prs = (existing && existing.prsMd) ? existing.prsMd : '- None';
  const line = (k, v) => `${k}:${v}`;
  const rows = f.exs.flatMap(ex => ex.sets.map((s, i) =>
    `| ${String(ex.name).replace(/\|/g, '/').trim()} | ${i + 1} | ${s.reps} | ${s.weight} | ${s.rpe} | ${String(s.notes).replace(/\|/g, '/').trim()} |`
  )).join('\n');
  return `# Workout — ${date}

## Readiness
${line('Sleep', f.readiness.sleep)}
${line('Energy', (f.readiness.energy ? f.readiness.energy + '/10' : '/10'))}
${line('Bodyweight', f.readiness.bodyweight)}
${line('Pain', f.readiness.pain)}

## Planned Workout
${planned || ''}

## Completed Workout

| Exercise | Set | Reps | Weight kg | RPE | Notes |
|---|---:|---:|---:|---:|---|
${rows}

## Conditioning
${line('Time', f.cond.time)}
${line('Distance', f.cond.distance)}
${line('Calories', f.cond.calories)}

## Review
${line('Overall RPE', f.rev.overall)}
${line('What went well', f.rev.well)}
${line('Pain/discomfort', f.rev.pain)}
${line('Notes for next workout', f.rev.next)}

## PRs
${prs}
`;
}
async function publish(date) {
  const token = getToken();
  if (!token) { toast('Ajoute d’abord ton token GitHub (carte « Publication »).', 'err', 4500); return false; }
  const path = `logs/${date.slice(0,4)}/${date.slice(5,7)}/${date}.md`;
  const f = collectLogger();
  if (!f) return false;
  const md = buildFileMd(date, f);
  let sha = null;
  try {
    const g = await fetch(`${API}/contents/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (g.ok) sha = (await g.json()).sha;
    else if (g.status !== 404) { toast(`Lecture GitHub impossible (${g.status}).`, 'err'); return false; }
  } catch { toast('Réseau : impossible de contacter GitHub.', 'err'); return false; }
  loading(true);
  try {
    const r = await fetch(`${API}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Log séance ${date} (depuis le site)`, content: b64(md), ...(sha ? { sha } : {}) })
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = (j.message || '').toLowerCase();
      if (m.includes('permission') || m.includes('policy')) toast('Token invalide ou sans permission d’écriture sur workouts.', 'err', 5000);
      else toast(`Échec publication (${r.status}).`, 'err');
      return false;
    }
  } catch { toast('Réseau : publication interrompue.', 'err'); return false; }
  finally { loading(false); }
  lsDel(DRAFT_PREFIX + date);
  await refreshFiles(true); buildWorkouts();
  toast('✅ Séance publiée sur GitHub — site à jour !', 'ok', 4000);
  state.ui.session = date;
  state.ui.view = 'sessions';
  go('sessions');
  return true;
}

/* ============================================================
   Stats dérivées (uniquement depuis Completed)
   ============================================================ */
function bestLifts() {
  const best = {};
  state.workouts.forEach(w => {
    w.completed.forEach(r => {
      const kg = num(r.weight); const reps = num(r.reps);
      if (kg === null) return;
      const key = r.ex.trim();
      const cur = best[key];
      const cand = { kg, reps, date: w.date, set: r.set };
      if (!cur || kg > cur.kg || (kg === cur.kg && (reps || 0) > (cur.reps || 0))) best[key] = cand;
    });
  });
  return best;
}
function est1RM(kg, reps) { return kg * (1 + (reps || 1) / 30); }
function exoHistory(exo) {
  const h = [];
  state.workouts.forEach(w => {
    const rows = w.completed.filter(r => r.ex.trim().toLowerCase() === exo.toLowerCase());
    if (!rows.length) return;
    const best = rows.reduce((a, r) => { const kg = num(r.weight) || 0; const e = est1RM(kg, num(r.reps) || 0); return e > a.e ? { kg, reps: num(r.reps) || 0, e } : a; }, { e: 0 });
    const vol = rows.reduce((s, r) => s + (num(r.weight) || 0) * (num(r.reps) || 0), 0);
    h.push({ date: w.date, best, vol, sets: rows.length });
  });
  return h;
}
const allExercisesLogged = () => [...new Set(state.workouts.flatMap(w => w.completed.map(r => r.ex.trim())).filter(Boolean))];
function totalVolume() {
  let kg = 0, rows = 0;
  state.workouts.forEach(w => w.completed.forEach(r => {
    const a = num(r.weight), b = num(r.reps);
    if (a !== null && b !== null) { kg += a * b; rows++; }
  }));
  return { kg, rows };
}

/* ============================================================
   Views
   ============================================================ */
function go(v) {
  state.ui.view = v;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  $$('.view').forEach(x => x.classList.remove('active'));
  const el = $('#view-' + v); el.classList.add('active');
  if (v === 'home') renderHome();
  else if (v === 'sessions') renderSessions();
  else if (v === 'logger') renderLogger();
  else if (v === 'progress') renderProgress();
  else if (v === 'docs') renderDocs();
  window.scrollTo({ top: 0 });
}

/* ---------------- HOME ---------------- */
function renderHome() {
  const today = todayStr();
  const wt = byDate(today);
  const { kg, rows } = totalVolume();
  const lifts = bestLifts();
  const hero = (() => {
    if (wt && wt.hasCompleted) return { t: 'Séance du jour terminée', s: `Beau travail — ${wt.completed.length} exercices loggés aujourd’hui. 🔥`, cta: false };
    if (wt && wt.plannedMd.trim()) return { t: 'Ta séance est prête', s: 'Un plan t’attend — lance-toi et logge les séries avec les poids. 💪', cta: true };
    return { t: 'Rien de prévu aujourd’hui', s: 'Crée ta séance et logge-la directement : exercices, séries, reps, poids, RPE.', cta: true };
  })();
  const todayDot = wt ? (wt.hasCompleted ? 'ok' : 'todo') : 'none';
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const w = byDate(ds);
    week.push({ ds, cls: w ? (w.hasCompleted ? 'on' : 'plan') : 'off', dl: d.toLocaleDateString('fr-FR', { weekday: 'narrow' }), dn: d.getDate() });
  }
  const liftTiles = Object.entries(lifts).sort((a, b) => b[1].kg - a[1].kg).slice(0, 6);
  const last = state.workouts.find(w => w.plannedMd.trim() || w.hasCompleted) || null;

  $('#view-home').innerHTML = `
  <section class="hero-panel card">
    <span class="hero-today">📅 <b>${fmtFR(today)}</b> · <span class="dot ${todayDot}"></span> ${wt ? (wt.hasCompleted ? 'complétée' : 'planifiée') : 'libre'}</span>
    <h1 class="hero">${hero.t.split(' ').slice(0,-1).join(' ')} <span class="grad">${hero.t.split(' ').slice(-1)}</span></h1>
    <p class="hero-sub">${hero.s}</p>
    <div class="cta-row">
      ${hero.cta ? `<button class="btn primary" onclick="go('logger')">✍️ Logger ma séance</button>` : ''}
      <button class="btn ghost" onclick="go('sessions')">📋 Voir les séances</button>
      ${wt && wt.hasCompleted ? `<button class="btn ghost" onclick="openSession('${today}')">Revoir la séance</button>` : ''}
    </div>
  </section>

  <div class="stat-row">
    <div class="stat"><div class="v">${state.workouts.length}<small> séances</small></div><div class="l">loggées</div></div>
    <div class="stat"><div class="v">${state.workouts.filter(w => w.hasCompleted).length}<small> ✓</small></div><div class="l">complétées</div></div>
    <div class="stat"><div class="v">${rows ? Math.round(kg).toLocaleString('fr-FR') : '—'}<small> kg</small></div><div class="l">volume total</div></div>
    <div class="stat"><div class="v">${Object.keys(lifts).length}<small></small></div><div class="l">exercices loggés</div></div>
  </div>

  <div class="section-title">Cette semaine <span class="n">· ${week.filter(d => d.cls === 'on').length} faites</span></div>
  <div class="card"><div class="weekbar">
    ${week.map(d => `<div class="wb ${d.cls}" title="${d.ds}"><div class="bar"></div><span class="dl">${esc(d.dl)}</span><span class="dd">${d.dn}</span></div>`).join('')}
  </div></div>

  <div class="section-title">Meilleurs lifts <span class="n">· auto depuis Completed</span></div>
  ${liftTiles.length ? `<div class="lift-tiles">${liftTiles.map(([ex, r]) => `
    <div class="lift" onclick="openSession('${r.date}')" style="cursor:pointer">
      <div class="ico">${exoEmoji(ex)}</div>
      <div class="nm">${esc(ex)}</div>
      <div class="kg">${r.kg}<span class="u"> kg</span></div>
      <div class="meta">×${r.reps ?? '—'} · ${fmtShort(r.date)}</div>
    </div>`).join('')}</div>`
    : `<div class="empty">Aucune série loggée pour l’instant — logge ta première séance !</div>`}

  ${last ? `
  <div class="section-title">Dernière séance</div>
  <div class="card" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div style="flex:1;min-width:220px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <b style="font-family:'Anton';font-size:19px;letter-spacing:.5px">${last.date}</b>
        <span class="badge ${last.hasCompleted ? 'ok' : 'todo'}">${last.hasCompleted ? '✓ complétée' : 'en attente'}</span>
      </div>
      <div class="wsub">${last.hasCompleted ? `${last.completed.length} exercices · ${fmtFR(last.date)}` : (last.plannedMd.trim() ? 'Planifiée — à compléter' : '')}</div>
    </div>
    <button class="btn ghost small" onclick="openSession('${last.date}')">Ouvrir →</button>
  </div>` : ''}`;
}

/* ---------------- SESSIONS ---------------- */
function renderSessions() {
  const ws = state.workouts;
  let sel = state.ui.session && byDate(state.ui.session) ? state.ui.session : (ws[0] ? ws[0].date : null);
  const months = {};
  ws.forEach(w => { const k = w.date.slice(0, 7); (months[k] = months[k] || []).push(w); });
  const labels = { '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin','07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre' };
  const listHtml = Object.keys(months).sort().reverse().map(k => {
    const [y, m] = k.split('-');
    return `<div style="font-size:10px;font-weight:800;letter-spacing:2px;color:var(--mut2);text-transform:uppercase;padding:10px 4px 4px">${labels[m]} ${y}</div>` +
      months[k].map(w => `
      <button class="sitem ${w.date === sel ? 'active' : ''}" data-d="${w.date}">
        <span class="dot ${w.hasCompleted ? 'ok' : (w.plannedMd.trim() ? 'todo' : 'none')}"></span>
        ${w.date}
        <span class="sd">${w.hasCompleted ? '✓' : ''}</span>
      </button>`).join('');
  }).join('');

  $('#view-sessions').innerHTML = `
  <h1 class="hero" style="font-size:clamp(28px,5vw,40px)">Séances</h1>
  <div class="cta-row" style="margin:4px 0 18px"><button class="btn primary small" onclick="go('logger')">✍️ Logger une séance</button></div>
  ${ws.length ? `<div class="session-layout">
    <div class="slist">${listHtml}</div>
    <div id="wdetail"></div>
  </div>` : `<div class="empty" style="padding:40px">Aucune séance — <a href="#" onclick="go('logger');return false">crée la première</a>.</div>`}`;
  $$('.sitem').forEach(b => b.onclick = () => { state.ui.session = b.dataset.d; renderSessions(); });
  if (sel) renderSessionDetail(sel);
}
function renderSessionDetail(date) {
  const w = byDate(date);
  const box = $('#wdetail');
  if (!w || !box) return;
  const rpeCls = r => { const n = num(r); return n === null ? '' : (n <= 6 ? 'low' : n <= 8 ? 'mid' : 'hi'); };
  const rowsHtml = w.completed.length ? `
    <div style="overflow-x:auto"><table class="tb">
      <thead><tr><th>Exercice</th><th style="text-align:right">Reps</th><th style="text-align:right">Kg</th><th style="text-align:center">RPE</th><th>Notes</th></tr></thead>
      <tbody>${w.completed.map(r => `
        <tr>
          <td class="ex"><span class="eico">${exoEmoji(r.ex)}</span>${esc(r.ex)} <span class="eset">· série ${r.set || ''}</span></td>
          <td class="num">${esc(r.reps)}</td>
          <td class="num mono"><b>${esc(r.weight)}</b></td>
          <td style="text-align:center">${r.rpe ? `<span class="rpe ${rpeCls(r.rpe)}">${esc(r.rpe)}</span>` : ''}</td>
          <td class="muted" style="font-size:12.5px">${esc(r.notes)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`
    : (w.plannedMd.trim() ? `<div class="empty">Planifiée mais pas encore loggée —<br><button class="btn primary small" style="margin-top:10px" onclick="loggerFor('${date}')">✍️ Logger cette séance</button></div>` : `<div class="empty">Séance vide.</div>`);
  const chip = (k, v) => v ? `<span class="chip"><b>${esc(k)}</b>${esc(v)}</span>` : '';
  const cond = Object.entries(w.conditioning).filter(([, v]) => v).map(([k, v]) => chip(k, v)).join('');
  const rev = Object.entries(w.review).filter(([, v]) => v).map(([k, v]) => chip(k, v)).join('');
  const rdy = Object.entries(w.readiness).filter(([, v]) => v).map(([k, v]) => chip(k, v)).join('');

  box.innerHTML = `
  <div class="whead">
    <h2>${date}</h2>
    <span class="badge ${w.hasCompleted ? 'ok' : (w.plannedMd.trim() ? 'todo' : 'none')}">${w.hasCompleted ? '✓ complétée' : (w.plannedMd.trim() ? 'planifiée' : 'vide')}</span>
  </div>
  <div class="wsub">${fmtFR(date)}</div>
  ${!w.hasCompleted ? '' : `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
    <span class="pill">${w.completed.length} exos</span>
    <span class="pill">${w.completed.reduce((s, r) => s + (num(r.weight) || 0) * (num(r.reps) || 0), 0).toLocaleString('fr-FR')} kg volume</span>
    ${Object.entries(w.conditioning).filter(([, v]) => v).map(([k, v]) => `<span class="pill">${esc(k)} ${esc(v)}</span>`).join('')}
  </div>`}

  ${rdy ? `<div class="wsec plain"><h4>Readiness</h4><div class="chips">${rdy}</div></div>` : ''}
  ${w.plannedMd.trim() ? `<div class="wsec plain"><h4>Planned Workout</h4><div class="doc-lite">${mdToHtml(w.plannedMd)}</div></div>` : ''}
  <div class="wsec"><h4>Completed Workout <span class="src">· source de vérité</span></h4>${rowsHtml}</div>
  ${cond ? `<div class="wsec plain"><h4>Conditioning</h4><div class="chips">${cond}</div></div>` : ''}
  ${rev ? `<div class="wsec plain"><h4>Review</h4><div class="chips">${rev}</div></div>` : ''}
  <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn ghost small" onclick="loggerFor('${date}')">✍️ Modifier / compléter</button>
  </div>`;
}
function openSession(date) { state.ui.session = date; state.ui.view = 'sessions'; go('sessions'); }

/* ---------------- LOGGER ---------------- */
function freshLg(date) {
  return {
    date,
    readiness: { sleep: '', energy: '', bodyweight: '', pain: '' },
    exs: [],
    cond: { time: '', distance: '', calories: '' },
    rev: { overall: '', well: '', pain: '', next: '' }
  };
}
function defaultLg(date) {
  const w = byDate(date);
  const lg = freshLg(date);
  if (w) {
    Object.keys(lg.readiness).forEach(k => { if (w.readiness[k] !== undefined) lg.readiness[k] = w.readiness[k].replace(/\/10$/, ''); });
    lg.cond = { time: w.conditioning.Time || '', distance: w.conditioning.Distance || '', calories: w.conditioning.Calories || '' };
    lg.rev = { overall: w.review['Overall RPE'] || '', well: w.review['What went well'] || '', pain: w.review['Pain/discomfort'] || '', next: w.review['Notes for next workout'] || '' };
    if (w.hasCompleted) {
      const groups = {};
      w.completed.forEach(r => { (groups[r.ex] = groups[r.ex] || []).push(r); });
      lg.exs = Object.entries(groups).map(([name, sets]) => ({ name, sets: sets.map(s => ({ reps: s.reps, weight: s.weight, rpe: s.rpe, notes: s.notes })) }));
    }
  }
  const draft = lsGet(DRAFT_PREFIX + date, null);
  if (draft && draft.exs) { Object.assign(lg.readiness, draft.readiness); lg.cond = draft.cond; lg.rev = draft.rev; lg.exs = draft.exs; }
  return lg;
}
function renderLogger() {
  const date = state.ui.loggerDate || todayStr();
  state.ui.loggerDate = date;
  state.lg = defaultLg(date);
  const lg = state.lg;
  const existing = byDate(date);
  const token = getToken();

  $('#view-logger').innerHTML = `
  <div style="display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:18px">
    <div style="flex:1;min-width:200px">
      <div class="hero-eyebrow">Quick log</div>
      <h1 class="hero" style="font-size:clamp(26px,5vw,38px);margin:4px 0 0">Logge ta séance</h1>
    </div>
    <div class="field" style="margin:0">
      <label>Date</label>
      <input type="date" id="lg-date" value="${date}" min="2026-01-01" max="${todayStr()}" style="background:var(--panel);border:1px solid var(--line2);border-radius:11px;padding:9px 13px">
    </div>
  </div>

  <div class="lg-wrap">
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="lg-panel">
        <h3>🏁 Readiness <span class="hint">optionnel</span></h3>
        <div class="row4">
          <div class="field"><label>Sommeil</label><input id="rd-sleep" placeholder="ex. 7h30" value="${esc(lg.readiness.sleep)}"></div>
          <div class="field"><label>Énergie /10</label><input id="rd-energy" type="number" min="1" max="10" placeholder="7" value="${esc(lg.readiness.energy)}"></div>
          <div class="field"><label>Poids (kg)</label><input id="rd-bw" inputmode="decimal" placeholder="ex. 82.5" value="${esc(lg.readiness.bodyweight)}"></div>
          <div class="field"><label>Douleurs</label><input id="rd-pain" placeholder="aucune / zone…" value="${esc(lg.readiness.pain)}"></div>
        </div>
      </div>

      <div class="lg-panel">
        <h3>🏋️ Exercices & séries <span class="hint">poids en kg · distance/temps → bloc Conditioning</span></h3>
        <div id="lg-exs"></div>
        <button class="add-ex" onclick="lgAddEx()">＋ Ajouter un exercice</button>
      </div>

      <div class="lg-panel">
        <h3>🚣 Conditioning <span class="hint">rower / bike / run</span></h3>
        <div class="row4">
          <div class="field"><label>Temps</label><input id="cd-time" placeholder="ex. 12:00" value="${esc(lg.cond.time)}"></div>
          <div class="field"><label>Distance</label><input id="cd-dist" placeholder="ex. 3000 m" value="${esc(lg.cond.distance)}"></div>
          <div class="field"><label>Calories</label><input id="cd-cal" placeholder="ex. 180" value="${esc(lg.cond.calories)}"></div>
        </div>
      </div>

      <div class="lg-panel">
        <h3>📝 Review</h3>
        <div class="review-grid">
          <div class="range-row"><label style="font-size:10.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--mut2)">RPE global</label>
            <input type="range" id="rv-overall" min="1" max="10" value="${lg.rev.overall || 7}"><span class="rval" id="rv-overall-val">${lg.rev.overall || 7}</span></div>
          <div class="field"><label>Ce qui a bien marché</label><input id="rv-well" value="${esc(lg.rev.well)}"></div>
          <div class="field"><label>Douleurs / inconfort</label><input id="rv-pain" value="${esc(lg.rev.pain)}"></div>
          <div class="field"><label>Notes pour la prochaine</label><input id="rv-next" value="${esc(lg.rev.next)}"></div>
        </div>
      </div>

      <div class="lg-panel">
        <h3>💾 Enregistrer</h3>
        <p class="muted" style="font-size:13px;margin-bottom:12px">
          ${existing ? (existing.hasCompleted ? 'ℹ️ Une version loggée existe déjà → elle sera complétée (le Planned existant est conservé).' : 'ℹ️ Séance déjà planifiée → le Planned est conservé, tu remplis le Completed.') : 'Nouvelle séance : le fichier sera créé depuis le template.'}
        </p>
        <div class="lg-actions">
          <button class="btn primary" onclick="publish('${date}')">🚀 Publier sur GitHub</button>
          <button class="btn ghost" onclick="saveDraft()">💾 Brouillon local</button>
          <button class="btn ghost" onclick="copyMd()">📋 Copier le markdown</button>
        </div>
      </div>
    </div>

    <div class="lg-side">
      <div class="lg-panel">
        <h3>🔐 Publication GitHub</h3>
        ${token ? `
          <div class="token-ok">✅ Token connecté<button class="btn ghost small" onclick="clearToken()">Retirer</button></div>
          <p class="muted" style="font-size:12.5px;margin-top:8px">« Publier » écrit directement dans le repo : le site et les stats se mettent à jour instantanément.</p>`
        : `
          <p class="muted" style="font-size:12.5px;margin-bottom:8px">Sans token, tu peux <b>sauver en brouillon</b> (ce navigateur) ou copier le markdown. Avec un token (1 min), la publication est directe :</p>
          <input class="inp" type="password" id="tk-input" placeholder="github_pat_…" autocomplete="off" style="margin-bottom:8px">
          <button class="btn ghost small" style="width:100%" onclick="saveToken()">Connecter le token</button>
          <details style="margin-top:10px;font-size:12px;color:var(--mut)">
            <summary style="cursor:pointer;font-weight:700">Comment créer le token ?</summary>
            <ol style="padding-left:18px;margin-top:6px;line-height:1.7">
              <li>Ouvre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
              <li>Name : <code>workouts-site</code> · expiration : 90 jours</li>
              <li>Repository access : <b>Only select repositories</b> → <code>RonaldoM9/workouts</code></li>
              <li>Permissions → <b>Contents : Read and write</b></li>
              <li>Generate token → colle-le ci-dessus</li>
            </ol>
          </details>`}
      </div>
      <div class="lg-panel">
        <h3>💡 Règles</h3>
        <ul style="padding-left:18px;font-size:12.5px;color:var(--mut);line-height:1.8">
          <li>Le <b>Completed Workout</b> est la seule source de vérité (historique, stats, PR).</li>
          <li>Les RPE 9-10 = quasi échec ; 6-7 = confortable.</li>
          <li>Distance/temps (carries, rower) → notes ou bloc Conditioning.</li>
        </ul>
      </div>
    </div>
  </div>`;

  $('#lg-date').onchange = e => { state.ui.loggerDate = e.target.value; saveDraftState(); renderLogger(); };
  $('#rv-overall').oninput = e => { $('#rv-overall-val').textContent = e.target.value; };
  renderLgExs();
  bindLgInputs();
}
function bindLgInputs() {
  ['rd-sleep', 'rd-energy', 'rd-bw', 'rd-pain'].forEach(id => $('#' + id)?.addEventListener('input', () => saveDraftState()));
  ['cd-time', 'cd-dist', 'cd-cal'].forEach(id => $('#' + id)?.addEventListener('input', () => saveDraftState()));
  ['rv-well', 'rv-pain', 'rv-next'].forEach(id => $('#' + id)?.addEventListener('input', () => saveDraftState()));
  $('#rv-overall')?.addEventListener('change', () => saveDraftState());
}
function renderLgExs() {
  const box = $('#lg-exs'); if (!box) return;
  const lg = state.lg;
  box.innerHTML = lg.exs.map((ex, i) => `
    <div class="ex-card" data-i="${i}">
      <div class="ex-head">
        <input list="exo-list" placeholder="Exercice (ex. Bench Press)" value="${esc(ex.name)}" data-name="${i}" oninput="lgRename(${i}, this.value)">
        <datalist id="exo-list">${EXOS.map(e => `<option value="${esc(e)}">`).join('')}</datalist>
        <button class="ex-del" title="Supprimer l’exercice" onclick="lgDelEx(${i})">✕</button>
      </div>
      <div class="set-head"><span>Set</span><span>Reps</span><span>Poids kg</span><span>RPE</span><span>Notes</span><span></span></div>
      ${ex.sets.map((s, j) => `
      <div class="set-row" data-i="${i}" data-j="${j}">
        <span style="font-weight:800;color:var(--mut);text-align:center">${j + 1}</span>
        <input class="sinp" placeholder="reps" inputmode="numeric" value="${esc(s.reps)}" oninput="lgSet(${i},${j},'reps',this.value)">
        <input class="sinp" placeholder="kg" inputmode="decimal" value="${esc(s.weight)}" oninput="lgSet(${i},${j},'weight',this.value)">
        <input class="sinp" placeholder="RPE" inputmode="numeric" maxlength="2" value="${esc(s.rpe)}" oninput="lgSet(${i},${j},'rpe',this.value)">
        <input class="sinp" placeholder="note…" value="${esc(s.notes)}" oninput="lgSet(${i},${j},'notes',this.value)">
        <button class="sdel" onclick="lgDelSet(${i},${j})">✕</button>
      </div>`).join('')}
      <button class="addset" onclick="lgAddSet(${i})">＋ série</button>
    </div>`).join('');
}
function lgAddEx() { state.lg.exs.push({ name: '', sets: [{ reps: '', weight: '', rpe: '', notes: '' }] }); renderLgExs(); saveDraftState(); }
function lgDelEx(i) { state.lg.exs.splice(i, 1); renderLgExs(); saveDraftState(); }
function lgAddSet(i) { state.lg.exs[i].sets.push({ reps: '', weight: '', rpe: '', notes: '' }); renderLgExs(); saveDraftState(); }
function lgDelSet(i, j) { state.lg.exs[i].sets.splice(j, 1); if (!state.lg.exs[i].sets.length) state.lg.exs.splice(i, 1); renderLgExs(); saveDraftState(); }
function lgRename(i, v) { state.lg.exs[i].name = v; saveDraftState(); }
function lgSet(i, j, k, v) { if (state.lg.exs[i]) state.lg.exs[i].sets[j][k] = v; saveDraftState(); }
function saveDraftState() {
  const lg = state.lg; if (!lg) return;
  const g = id => $(id)?.value ?? '';
  lg.readiness = { sleep: g('#rd-sleep'), energy: g('#rd-energy'), bodyweight: g('#rd-bw'), pain: g('#rd-pain') };
  lg.cond = { time: g('#cd-time'), distance: g('#cd-dist'), calories: g('#cd-cal') };
  lg.rev = { overall: g('#rv-overall'), well: g('#rv-well'), pain: g('#rv-pain'), next: g('#rv-next') };
  lg.date = state.ui.loggerDate;
}
function collectLogger() {
  saveDraftState();
  const lg = state.lg;
  const hasSets = lg.exs.some(ex => ex.name.trim() && ex.sets.some(s => s.reps || s.weight));
  const hasRest = Object.values(lg.cond).some(Boolean) || Object.values(lg.rev).some(Boolean) || Object.values(lg.readiness).some(Boolean);
  if (!hasSets && !hasRest) { toast('Rien à enregistrer : ajoute au moins une série (exercice + reps ou poids).', 'err', 4500); return null; }
  return lg;
}
function saveDraft() {
  const f = collectLogger(); if (!f) return;
  lsSet(DRAFT_PREFIX + f.date, { readiness: f.readiness, exs: f.exs, cond: f.cond, rev: f.rev });
  toast('💾 Brouillon sauvegardé sur cet appareil.', 'ok');
}
function copyMd() {
  const f = collectLogger(); if (!f) return;
  const md = buildFileMd(f.date, f);
  const done = () => toast('📋 Markdown copié — colle-le-moi ou commit-le.', 'ok');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(md).then(done).catch(() => fallbackCopy(md, done));
  else fallbackCopy(md, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('Copie impossible.', 'err'); }
  ta.remove();
}
function loggerFor(date) { state.ui.loggerDate = date; state.ui.view = 'logger'; go('logger'); }
function saveToken() {
  const t = $('#tk-input').value.trim();
  if (!t) { toast('Colle d’abord ton token.', 'err'); return; }
  localStorage.setItem(LS_TOKEN, t);
  toast('Token enregistré sur cet appareil.', 'ok');
  renderLogger();
}
function clearToken() { localStorage.removeItem(LS_TOKEN); renderLogger(); toast('Token retiré.', 'ok'); }

/* ---------------- PROGRESSION ---------------- */
async function renderProgress() {
  const box = $('#view-progress');
  const logged = allExercisesLogged();
  if (!logged.length) { box.innerHTML = `<div class="empty" style="padding:40px">Aucune donnée — logge des séances pour voir ta progression 📈</div>`; return; }
  const exo = state.ui.progExo && logged.includes(state.ui.progExo) ? state.ui.progExo : logged[0];
  state.ui.progExo = exo;
  box.innerHTML = `
    <h1 class="hero" style="font-size:clamp(26px,5vw,38px)">Progression</h1>
    <p class="hero-sub" style="margin-bottom:18px">Calculée uniquement depuis les Completed Workout — charges réelles loggées.</p>
    <div class="prog-head">
      <select id="prog-exo">${logged.map(e => `<option ${e === exo ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
      <span class="muted" style="font-size:13px">${esc(exoEmoji(exo))} ${esc(exo)}</span>
    </div>
    <div class="chart-card"><h3 style="font-size:11px;font-weight:800;letter-spacing:2px;color:var(--mut2);text-transform:uppercase;margin-bottom:10px">Charge max par séance</h3><div class="chart-legend"><span><i class="legend-dot" style="background:#00d4aa"></i>Meilleure série (kg)</span><span><i class="legend-dot" style="background:#7c5cff"></i>1RM estimé (Epley)</span></div><div class="ch"><canvas id="chart-main"></canvas></div></div>
    <div class="chart-card"><h3 style="font-size:11px;font-weight:800;letter-spacing:2px;color:var(--mut2);text-transform:uppercase;margin-bottom:10px">Volume par séance (kg)</h3><div class="ch" style="height:170px"><canvas id="chart-vol"></canvas></div></div>
    <div class="section-title">Toutes les séances · ${esc(exo)}</div>
    <div class="card" style="overflow-x:auto"><table class="tb">
      <thead><tr><th>Date</th><th style="text-align:right">Séries</th><th style="text-align:right">Meilleure série</th><th style="text-align:right">1RM est.</th><th style="text-align:right">Volume</th></tr></thead>
      <tbody>${exoHistory(exo).map(h => `
        <tr style="cursor:pointer" onclick="openSession('${h.date}')">
          <td class="ex">${h.date}</td><td class="num">${h.sets}</td>
          <td class="num mono"><b>${h.best.kg ? h.best.kg + ' kg' : '—'}</b>${h.best.reps ? ` ×${h.best.reps}` : ''}</td>
          <td class="num mono">${h.best.kg ? Math.round(h.best.e) + ' kg' : '—'}</td>
          <td class="num mono">${h.vol.toLocaleString('fr-FR')}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    <div class="section-title">Meilleurs lifts — tous exercices <span class="n">· auto</span></div>
    <div class="card" style="overflow-x:auto"><table class="tb">
      <thead><tr><th>Exercice</th><th style="text-align:right">Meilleure série</th><th style="text-align:right">1RM est.</th><th style="text-align:right">Date</th></tr></thead>
      <tbody>${Object.entries(bestLifts()).sort((a, b) => b[1].kg - a[1].kg).map(([ex, r]) => `
        <tr style="cursor:pointer" onclick="openSession('${r.date}')">
          <td class="ex"><span class="eico">${exoEmoji(ex)}</span>${esc(ex)}</td>
          <td class="num mono"><b>${r.kg} kg</b>${r.reps ? ` ×${r.reps}` : ''}</td>
          <td class="num mono">${Math.round(est1RM(r.kg, r.reps))} kg</td>
          <td class="num muted">${r.date}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  $('#prog-exo').onchange = e => { state.ui.progExo = e.target.value; renderProgress(); };
  drawCharts(exo);
}
async function drawCharts(exo) {
  try { await loadChartJs(); } catch { return; }
  const h = exoHistory(exo);
  const labels = h.map(x => fmtShort(x.date));
  const best = h.map(x => x.best.kg || null);
  const e1rm = h.map(x => x.best.kg ? Math.round(x.best.e) : null);
  const vol = h.map(x => x.vol);
  Chart.defaults.color = '#8b8b98'; Chart.defaults.font.family = 'Inter';
  const mk = id => document.getElementById(id);
  const c1 = mk('chart-main'), c2 = mk('chart-vol');
  if (!c1 || !c2) return;
  const grad = ctx => { const g = ctx.createLinearGradient(0, 0, 0, 280); g.addColorStop(0, 'rgba(0,212,170,.25)'); g.addColorStop(1, 'rgba(0,212,170,0)'); return g; };
  new Chart(c1, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'kg', data: best, borderColor: '#00d4aa', backgroundColor: grad(c1.getContext('2d')), fill: true, tension: .35, pointRadius: 5, pointBackgroundColor: '#00d4aa', borderWidth: 2.5 },
      { label: '1RM', data: e1rm, borderColor: '#7c5cff', borderDash: [6, 5], tension: .35, pointRadius: 0, borderWidth: 2 }
    ]},
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y + ' kg' } } },
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.05)' } }, x: { grid: { display: false } } } }
  });
  new Chart(c2, {
    type: 'bar',
    data: { labels, datasets: [{ data: vol, backgroundColor: 'rgba(0,212,170,.28)', borderColor: '#00d4aa', borderWidth: 1.5, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { grid: { color: 'rgba(255,255,255,.05)' } }, x: { grid: { display: false } } } }
  });
}
function loadChartJs() {
  return new Promise((res, rej) => {
    if (window.Chart) return res();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Chart.js'));
    document.head.appendChild(s);
  });
}

/* ---------------- DOCS (profil / prs / exos) ---------------- */
const DOCS = [
  { id: 'profil', label: '👤 Profil', path: 'profile.md' },
  { id: 'prs', label: '🏆 PRs', path: 'stats/personal-records.md' },
  { id: 'exos', label: '📖 Exercices', path: 'stats/exercise-index.md' }
];
function renderDocs() {
  const sub = state.ui.docSub;
  const box = $('#view-docs');
  box.innerHTML = `
    <h1 class="hero" style="font-size:clamp(26px,5vw,38px)">Référence</h1>
    <div class="doc-subnav">${DOCS.map(d => `<button class="${d.id === sub ? 'active' : ''}" data-s="${d.id}">${d.label}</button>`).join('')}</div>
    <div class="doc"><div class="card" id="doc-body"><div class="empty">Chargement…</div></div></div>`;
  $$('.doc-subnav button').forEach(b => b.onclick = () => { state.ui.docSub = b.dataset.s; renderDocs(); });
  const d = DOCS.find(x => x.id === sub);
  const md = state.files[d.path];
  $('#doc-body').innerHTML = md !== undefined ? mdToHtml(md) : `<div class="empty">Fichier introuvable (${d.path}).</div>`;
}

/* ============================================================
   Boot
   ============================================================ */
async function boot() {
  loading(true);
  try {
    await refreshFiles(false);
    buildWorkouts();
    go('home');
    document.title = `Workouts — ${state.workouts.filter(w => w.hasCompleted).length} séances complétées`;
  } catch (e) {
    $('#view-home').innerHTML = `
      <div class="card" style="padding:36px;text-align:center;margin-top:20px">
        <div style="font-size:40px">📡</div>
        <h1 class="hero" style="font-size:26px;margin:10px 0">Impossible de charger les données</h1>
        <p class="muted">Vérifie ta connexion ou l’accès au repo public, puis réessaie.</p>
        <button class="btn primary" style="margin-top:16px" onclick="boot()">Réessayer</button>
      </div>`;
  } finally { loading(false); }
}
// expose pour les handlers inline
window.go = go; window.openSession = openSession; window.loggerFor = loggerFor;
window.publish = publish; window.saveDraft = saveDraft; window.copyMd = copyMd;
window.lgAddEx = lgAddEx; window.lgDelEx = lgDelEx; window.lgAddSet = lgAddSet; window.lgDelSet = lgDelSet;
window.lgRename = lgRename; window.lgSet = lgSet; window.saveToken = saveToken; window.clearToken = clearToken;
window.boot = boot;

boot();
