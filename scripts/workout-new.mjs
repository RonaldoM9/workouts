#!/usr/bin/env node
/**
 * workout:new — crée un log de séance daté depuis le template.
 *
 * Usage:
 *   npm run workout:new                  → logs/YYYY/MM/YYYY-MM-DD.md (aujourd'hui)
 *   npm run workout:new -- --date 2026-09-01 → date précise
 *   npm run workout:new -- --date=2026-09-01 → idem (forme =)
 *
 * Règles :
 *   - Ne JAMAIS écraser un fichier existant (erreur + code 1).
 *   - Crée les dossiers logs/YYYY/MM/ automatiquement.
 *   - Remplace YYYY-MM-DD dans le template par la date réelle.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATE_PATH = join(ROOT, 'templates', 'workout-template.md');

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDateArg(args) {
  let raw = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      raw = args[i + 1];
    } else if (args[i].startsWith('--date=')) {
      raw = args[i].slice('--date='.length);
    }
  }
  if (!raw) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) {
    console.error(`❌ Format de date invalide : "${raw}" — attendu YYYY-MM-DD (ex. 2026-09-01)`);
    process.exit(1);
  }
  const [y, mo, d] = [m[1], m[2], m[3]];
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== Number(y) || dt.getMonth() + 1 !== Number(mo) || dt.getDate() !== Number(d)) {
    console.error(`❌ Date inexistante : "${raw}"`);
    process.exit(1);
  }
  return { y, mo, d };
}

function today() {
  const now = new Date();
  return { y: String(now.getFullYear()), mo: pad(now.getMonth() + 1), d: pad(now.getDate()) };
}

// --- main ---
const date = parseDateArg(process.argv.slice(2)) ?? today();
const dateStr = `${date.y}-${date.mo}-${date.d}`;

const targetDir = join(ROOT, 'logs', date.y, date.mo);
const targetFile = join(targetDir, `${dateStr}.md`);

if (existsSync(targetFile)) {
  console.error(`⛔ Séance déjà existante : ${targetFile}`);
  console.error('   Aucun fichier écrasé — modifier la séance existante à la main si besoin.');
  process.exit(1);
}

if (!existsSync(TEMPLATE_PATH)) {
  console.error(`❌ Template introuvable : ${TEMPLATE_PATH}`);
  process.exit(1);
}

const template = readFileSync(TEMPLATE_PATH, 'utf8');
const content = template.replace(/YYYY-MM-DD/g, dateStr);

mkdirSync(targetDir, { recursive: true });
writeFileSync(targetFile, content);

console.log(`✅ Workout créé : ${targetFile}`);
console.log(`   (rempli depuis templates/workout-template.md — date ${dateStr})`);
