#!/usr/bin/env python3
"""build-site.py — génère index.html (site statique auto-contenu) depuis les logs markdown.

Usage: npm run site:build   (ou: python3 scripts/build-site.py)
Lit:  logs/**/*.md, profile.md, stats/*.md
Écrit: index.html (à commit + push — GitHub Pages sert main/)
"""
import re
import html as html_mod
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- markdown-lite
def esc(s):
    return html_mod.escape(s, quote=False)

def inline(s):
    s = esc(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'`(.+?)`', r'<code>\1</code>', s)
    return s

def render_md(md):
    lines = md.splitlines()
    out = []
    i = 0
    while i < len(lines):
        ln = lines[i].rstrip()
        if ln.startswith('```'):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i])
                i += 1
            out.append('<pre class="code">' + esc('\n'.join(code)) + '</pre>')
        elif re.match(r'^\|.*\|$', ln):
            rows = []
            while i < len(lines) and re.match(r'^\|.*\|$', lines[i].rstrip()):
                rows.append(lines[i].rstrip())
                i += 1
            head = [c.strip() for c in rows[0].strip('|').split('|')]
            body = rows[2:] if len(rows) > 2 else []
            t = ['<table><thead><tr>']
            for c in head:
                t.append(f'<th>{inline(c)}</th>')
            t.append('</tr></thead><tbody>')
            for r in body:
                cs = [c.strip() for c in r.strip('|').split('|')]
                t.append('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in cs) + '</tr>')
            t.append('</tbody></table>')
            out.append(''.join(t))
        elif ln.startswith('- '):
            buf = []
            while i < len(lines) and lines[i].rstrip().startswith('- '):
                buf.append(lines[i].rstrip())
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(b[2:])}</li>' for b in buf) + '</ul>')
        elif ln.startswith('#'):
            level = min(len(ln) - len(ln.lstrip('#')), 6)
            out.append(f'<h{level}>{inline(ln.lstrip("#").strip())}</h{level}>')
            i += 1
        elif ln.strip() == '':
            i += 1
        else:
            buf = [ln]
            i += 1
            while i < len(lines) and lines[i].rstrip().strip() not in ('',) \
                    and not lines[i].rstrip().startswith(('#', '- ', '|', '```')):
                buf.append(lines[i].rstrip())
                i += 1
            out.append('<p>' + inline(' '.join(buf)) + '</p>')
    return '\n'.join(out)

# ---------------------------------------------------------------- parsing
def parse_readiness(text):
    out = {}
    for line in text.splitlines():
        m = re.match(r'^([^:]+):\s*(.*)$', line)
        if m:
            out[m.group(1).strip()] = m.group(2).strip()
    return out

def parse_kv_section(text):
    out = {}
    for line in text.splitlines():
        m = re.match(r'^([^:]+):\s*(.*)$', line)
        if m and m.group(2).strip():
            out[m.group(1).strip()] = m.group(2).strip()
    return out

def parse_workout(path):
    text = path.read_text(encoding='utf-8')
    m = re.search(r'# Workout[—\- ]+(\d{4}-\d{2}-\d{2})', text)
    date = m.group(1) if m else path.stem
    parts = re.split(r'^## (.+)$', text, flags=re.M)
    sec = {}
    for i in range(1, len(parts), 2):
        sec[parts[i].strip()] = parts[i + 1].strip()
    completed_raw = sec.get('Completed Workout', '')
    completed_lines = [l for l in completed_raw.splitlines() if re.match(r'^\|.*\|$', l)]
    has_completed = any(
        any(c.strip() for c in l.strip('|').split('|')[1:])
        for l in completed_lines[2:] if len(completed_lines) > 2
    )
    return {
        'date': date,
        'readiness': parse_readiness(sec.get('Readiness', '')),
        'planned': render_md(sec.get('Planned Workout', '')),
        'completed': render_md(completed_raw),
        'has_completed': has_completed,
        'conditioning': parse_kv_section(sec.get('Conditioning', '')),
        'review': parse_kv_section(sec.get('Review', '')),
        'review_extra': sec.get('Review', ''),
        'prs': render_md(sec.get('PRs', '')),
        'prs_raw': sec.get('PRs', ''),
    }

# ---------------------------------------------------------------- HTML
def readiness_chips(r):
    if not r:
        return '<p class="muted">—</p>'
    return '<div class="chips">' + ''.join(
        f'<span class="chip"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in r.items()
    ) + '</div>'

def conditioning_html(c):
    if not c:
        return '<p class="muted">—</p>'
    return '<div class="chips">' + ''.join(
        f'<span class="chip"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in c.items()
    ) + '</div>'

def review_html(r, extra):
    if not r:
        return '<p class="muted">—</p>'
    rest = '\n'.join(l for l in extra.splitlines() if not re.match(r'^[^:]+:\s*\S', l))
    chips = '<div class="chips">' + ''.join(
        f'<span class="chip"><b>{esc(k)}</b> {esc(v)}</span>' for k, v in r.items()
    ) + '</div>'
    return chips + (render_md(rest) if rest.strip() else '')

def workout_article(w):
    completed_placeholder = ('<p class="muted">Aucune série loggée — à remplir après la séance.</p>'
                             if not w['has_completed'] else '')
    badge = ('<span class="badge done">✓ Completed</span>' if w['has_completed']
             else '<span class="badge todo">en attente</span>')
    pr_none = 'None' in w['prs_raw'] and '<li>None</li>' not in w['prs']
    pr_html = w['prs'] if not pr_none else '<p class="muted">Aucun PR pour cette séance.</p>'
    return f'''
    <article class="workout" id="w-{w['date']}">
      <header class="w-head">
        <h2>Workout — {w['date']}</h2>
        {badge}
      </header>
      <section class="block">
        <h3>Readiness</h3>
        {readiness_chips(w['readiness'])}
      </section>
      <section class="block planned">
        <h3>Planned Workout</h3>
        {w['planned'] or '<p class="muted">—</p>'}
      </section>
      <section class="block completed">
        <h3>Completed Workout <span class="src">— source de vérité</span></h3>
        {completed_placeholder}
        {w['completed']}
      </section>
      <section class="block">
        <h3>Conditioning</h3>
        {conditioning_html(w['conditioning'])}
      </section>
      <section class="block">
        <h3>Review</h3>
        {review_html(w['review'], w['review_extra'])}
      </section>
      <section class="block">
        <h3>PRs</h3>
        {pr_html}
      </section>
    </article>'''

def build():
    logs = sorted(Path(ROOT, 'logs').glob('**/*.md'), reverse=True)
    workouts = [parse_workout(p) for p in logs]
    workouts.sort(key=lambda w: w['date'], reverse=True)

    list_items = ''.join(
        f'''<button class="w-item {'active' if i == 0 else ''}" data-date="{w['date']}" onclick="openW('{w['date']}')">
            <span class="w-date">{w['date']}</span>
            <span class="w-state {'done' if w['has_completed'] else 'todo'}">{'✓' if w['has_completed'] else '○'}</span>
        </button>''' for i, w in enumerate(workouts)
    )
    articles = '\n'.join(workout_article(w) for w in workouts)
    if not workouts:
        list_items = '<p class="muted">Aucune séance.</p>'
        articles = '<p class="muted">Aucune séance loggée.</p>'

    profile = render_md(Path(ROOT, 'profile.md').read_text(encoding='utf-8'))
    prs = render_md(Path(ROOT, 'stats', 'personal-records.md').read_text(encoding='utf-8'))
    idx = render_md(Path(ROOT, 'stats', 'exercise-index.md').read_text(encoding='utf-8'))

    n_done = sum(1 for w in workouts if w['has_completed'])
    n_todo = len(workouts) - n_done

    html_doc = f'''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workouts — Ronald</title>
<!-- build: {n_done}/{len(workouts)} completed -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Anton&display=swap" rel="stylesheet">
<style>
  :root {{ --bg:#0a0a0a; --panel:#141414; --panel2:#1b1b1b; --accent:#00d4aa; --accent-dim:#0a3a31;
           --text:#e8e8e8; --muted:#8a8a8a; --warn:#ffb454; --bad:#ff5c5c; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ background:var(--bg); color:var(--text); font-family:'Inter',system-ui,sans-serif; line-height:1.55; }}
  header.top {{ position:sticky; top:0; z-index:10; background:rgba(10,10,10,.92); backdrop-filter:blur(8px);
               border-bottom:1px solid #222; }}
  .top-in {{ max-width:1100px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; gap:18px; flex-wrap:wrap; }}
  .logo {{ font-family:'Anton',sans-serif; font-size:22px; letter-spacing:1.5px; color:var(--accent); }}
  .logo small {{ color:var(--muted); font-family:'Inter'; font-size:12px; letter-spacing:0; }}
  nav.tabs {{ display:flex; gap:6px; margin-left:auto; }}
  nav.tabs button {{ background:none; border:none; color:var(--muted); font-weight:600; font-size:14px;
                     padding:8px 14px; border-radius:8px; cursor:pointer; }}
  nav.tabs button.active {{ color:var(--accent); background:var(--accent-dim); }}
  nav.tabs button:hover {{ color:var(--text); }}
  main {{ max-width:1100px; margin:0 auto; padding:24px 20px 60px; }}
  .view {{ display:none; }}
  .view.active {{ display:block; }}
  .layout {{ display:grid; grid-template-columns:260px 1fr; gap:24px; align-items:start; }}
  @media (max-width:820px) {{ .layout {{ grid-template-columns:1fr; }} }}
  aside.wlist {{ position:sticky; top:76px; display:flex; flex-direction:column; gap:6px; }}
  @media (max-width:820px) {{ aside.wlist {{ position:static; flex-direction:row; overflow-x:auto; padding-bottom:8px; }} }}
  .w-item {{ background:var(--panel); border:1px solid #242424; color:var(--text); text-align:left;
            padding:10px 14px; border-radius:10px; cursor:pointer; display:flex; justify-content:space-between;
            align-items:center; font-size:13.5px; font-weight:600; font-family:inherit; }}
  .w-item:hover {{ border-color:var(--accent); }}
  .w-item.active {{ border-color:var(--accent); background:var(--accent-dim); }}
  .w-state.done {{ color:var(--accent); }} .w-state.todo {{ color:#555; }}
  .workout {{ background:var(--panel); border:1px solid #222; border-radius:14px; padding:22px 24px; }}
  .workout.hidden {{ display:none; }}
  .w-head {{ display:flex; align-items:center; gap:12px; margin-bottom:8px; }}
  .w-head h2 {{ font-family:'Anton',sans-serif; font-size:24px; letter-spacing:1px; }}
  .badge {{ font-size:11px; font-weight:800; padding:4px 10px; border-radius:99px; }}
  .badge.done {{ color:var(--accent); background:var(--accent-dim); }}
  .badge.todo {{ color:var(--warn); background:#33260f; }}
  .block {{ margin-top:18px; }}
  .block h3 {{ font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:var(--muted); margin-bottom:10px;
               border-bottom:1px solid #222; padding-bottom:6px; }}
  .block.completed h3 {{ color:var(--accent); }}
  .src {{ text-transform:none; letter-spacing:0; font-size:11px; color:var(--muted); font-weight:400; }}
  .chips {{ display:flex; flex-wrap:wrap; gap:8px; }}
  .chip {{ background:var(--panel2); border:1px solid #262626; padding:6px 12px; border-radius:99px; font-size:13px; }}
  .chip b {{ color:var(--accent); font-weight:700; margin-right:4px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13.5px; }}
  th {{ text-align:left; color:var(--muted); font-size:11.5px; text-transform:uppercase; letter-spacing:.8px;
        border-bottom:1px solid #2c2c2c; padding:8px 10px; }}
  td {{ padding:8px 10px; border-bottom:1px solid #1e1e1e; }}
  tr:hover td {{ background:#181818; }}
  td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5) {{ text-align:right; font-variant-numeric:tabular-nums; }}
  td.rpe-6 {{ color:var(--accent); font-weight:700; }} td.rpe-7,td.rpe-8 {{ color:var(--warn); font-weight:700; }}
  td.rpe-9,td.rpe-10 {{ color:var(--bad); font-weight:700; }}
  ul {{ padding-left:20px; }} li {{ margin:4px 0; }}
  .muted {{ color:var(--muted); }}
  h1 {{ font-family:'Anton',sans-serif; font-size:30px; letter-spacing:1px; margin-bottom:6px; }}
  .doc h2 {{ font-family:'Anton',sans-serif; letter-spacing:.5px; margin:22px 0 8px; }}
  .doc h3 {{ color:var(--accent); text-transform:uppercase; font-size:13px; letter-spacing:1.2px; margin:18px 0 8px; }}
  .doc p, .doc li {{ font-size:14.5px; }}
  .doc blockquote {{ border-left:3px solid var(--accent); padding:8px 14px; background:var(--panel2);
                     border-radius:0 8px 8px 0; margin:10px 0; color:#cfcfcf; }}
  .doc code {{ background:var(--panel2); color:var(--accent); padding:1px 6px; border-radius:5px; font-size:13px; }}
  .stats {{ display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }}
  .stat {{ background:var(--panel); border:1px solid #222; border-radius:12px; padding:10px 18px; }}
  .stat b {{ display:block; font-family:'Anton',sans-serif; font-size:20px; color:var(--accent); }}
  .stat span {{ font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; }}
  .filter {{ width:100%; background:var(--panel); border:1px solid #242424; color:var(--text); padding:9px 14px;
             border-radius:10px; font-family:inherit; font-size:13.5px; margin-bottom:10px; }}
  .filter:focus {{ outline:none; border-color:var(--accent); }}
</style>
</head>
<body>
<header class="top">
  <div class="top-in">
    <div class="logo">WORKOUTS<small> · RONALD</small></div>
    <nav class="tabs">
      <button class="active" data-v="workouts" onclick="show('workouts',this)">Séances</button>
      <button data-v="profile" onclick="show('profile',this)">Profil</button>
      <button data-v="prs" onclick="show('prs',this)">PRs</button>
      <button data-v="exercises" onclick="show('exercises',this)">Exercices</button>
    </nav>
  </div>
</header>
<main>
  <div class="view active" id="view-workouts">
    <div class="stats">
      <div class="stat"><b>{len(workouts)}</b><span>séances</span></div>
      <div class="stat"><b>{n_done}</b><span>complétées</span></div>
      <div class="stat"><b>{n_todo}</b><span>en attente</span></div>
    </div>
    <div class="layout">
      <aside class="wlist">
        <input class="filter" id="wfilter" placeholder="Filtrer (2026-09…)" oninput="filterW(this.value)">
        {list_items}
      </aside>
      <div class="workouts-detail">{articles}</div>
    </div>
  </div>
  <div class="view doc" id="view-profile">{profile}</div>
  <div class="view doc" id="view-prs">{prs}</div>
  <div class="view doc" id="view-exercises">{idx}</div>
</main>
<script>
  function show(v, btn) {{
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  }}
  function openW(date) {{
    document.querySelectorAll('.workout').forEach(a => a.classList.toggle('hidden', a.id !== 'w-' + date));
    document.querySelectorAll('.w-item').forEach(b => b.classList.toggle('active', b.dataset.date === date));
  }}
  function filterW(q) {{
    document.querySelectorAll('.w-item').forEach(b => {{
      b.style.display = b.dataset.date.includes(q.trim()) ? '' : 'none';
    }});
  }}
  // badges RPE sur les tables Completed
  document.querySelectorAll('table tbody tr').forEach(tr => {{
    const rpe = tr.cells[4];
    if (rpe && /^\\d+(\\.\\d+)?$/.test(rpe.textContent.trim())) rpe.classList.add('rpe-' + Math.round(parseFloat(rpe.textContent)));
  }});
</script>
</body>
</html>'''

    out = Path(ROOT, 'index.html')
    out.write_text(html_doc, encoding='utf-8')
    print(f'✅ index.html généré — {len(workouts)} séances ({n_done} complétées, {n_todo} en attente)')

if __name__ == '__main__':
    build()
