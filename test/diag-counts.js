'use strict';
const fs = require('fs');
const id = require('../public/identity.js');

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '') !== '');
}

function load(name) {
  const rows = parseCSV(fs.readFileSync(require('path').join(__dirname, '..', 'public', 'data', name), 'utf8'));
  const head = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map((cells) => {
    const o = {};
    head.forEach((h, i) => { o[h] = cells[i] === undefined ? '' : String(cells[i]).trim(); });
    return o;
  });
}

const master = load('master_students.csv').map((s) => ({ ...s, group_id: id.cleanGroup(s.group_id) }));
const unreg = load('07_unregistered_round2_r2.csv').map((s) => ({ ...s, group_id: id.cleanGroup(s.group_id) }));
const asg = load('06_assignments_round2_r2.csv').map((s) => ({ ...s, group_id: id.cleanGroup(s.group_id) }));
const index = id.buildIndex(master);
const byG = {};
master.forEach((s) => {
  const g = s.group_id || '?';
  const gender = (s.gender || '').trim() || 'BLANK';
  const flag = (s.data_flag || '').trim() || '-';
  const src = (s.gender_source || '').trim() || '-';
  const k = [g, gender, src, flag].join('|');
  byG[k] = (byG[k] || 0) + 1;
});
console.log('MASTER', master.length);
Object.keys(byG).sort().forEach((k) => console.log('G', k, byG[k]));
unreg.forEach((row) => {
  const hit = id.resolve(row, index);
  if (!hit) console.log('UNRESOLVED_UNREG', id.codeShort(row.code_short));
  else {
    const c = id.groupConflict(row.group_id, hit.group_id);
    if (c) console.log('CONFLICT', c.sourceGroup, '->', c.masterGroup, id.codeShort(row.code_short));
  }
});
console.log('UNREG', unreg.length);
['927', '326', '801', '758', '239', '647', '803'].forEach((code) => {
  const short = id.codeShort(code);
  const u = unreg.filter((r) => id.codeShort(r.code_short) === short).map((r) => r.group_id);
  const m = master.filter((s) => id.codeShort(s.raw_code || s.code_short) === short).map((s) => s.group_id);
  console.log('CODE', short, 'sheet', u.join(',') || '-', 'master', m.join(',') || '-');
});
const masterFull = new Set(master.map((s) => id.codeFull(s.raw_code || s.student_code || s.code_short)));
let missCode = 0, missGroup = 0, unresolvedA = 0;
const missCodeShort = [];
asg.forEach((row) => {
  const full = id.codeFull(row.student_code || row.code_short);
  if (!masterFull.has(full)) { missCode++; missCodeShort.push(id.codeShort(row.code_short || row.student_code) + '@' + id.cleanGroup(row.group_id)); }
  const short = id.codeShort(row.code_short || row.student_code);
  if (!id.unique(index.byGroupShort, id.cleanGroup(row.group_id) + '|' + short)) missGroup++;
  if (!id.resolve(row, index)) unresolvedA++;
});
console.log('ASSIGN', asg.length, 'code_not_in_master', missCode, 'group_short_miss', missGroup, 'unresolved', unresolvedA);
console.log('MISS_CODE', missCodeShort.join(' '));
console.log('SHORT_COLLISIONS', index.collisions.short.length, index.collisions.short.join(','));
const sched = load('04_round_schedule_r2.csv');
const map = {};
sched.forEach((r) => {
  const ord = String(r.round_order || '').replace(/\.0$/, '');
  if (ord === '2') map[id.cleanGroup(r.group_id)] = r.round_key;
});
console.log('R2_FIELDS');
Object.keys(map).sort((a, b) => +a - +b).forEach((g) => console.log(g, map[g]));
