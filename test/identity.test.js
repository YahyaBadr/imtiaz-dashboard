'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const identity = require('../public/identity.js');

const DATA = path.join(__dirname, '..', 'public', 'data');

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '') !== '');
}

function load(name) {
  const rows = parseCSV(fs.readFileSync(path.join(DATA, name), 'utf8'));
  const head = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map((cells) => {
    const out = {};
    head.forEach((h, i) => { out[h] = cells[i] === undefined ? '' : String(cells[i]).trim(); });
    return out;
  });
}

const master = load('master_students.csv').map((s) => ({ ...s, group_id: identity.cleanGroup(s.group_id) }));
const unregistered = load('07_unregistered_round2_r2.csv').map((s) => ({ ...s, group_id: identity.cleanGroup(s.group_id) }));
const assignments = load('06_assignments_round2_r2.csv').map((s) => ({ ...s, group_id: identity.cleanGroup(s.group_id) }));
const index = identity.buildIndex(master);

test('canonical code helpers normalize every source shape', () => {
  assert.equal(identity.codeFull('927'), '11012021100927');
  assert.equal(identity.codeFull('0927'), '11012021100927');
  assert.equal(identity.codeFull('11012021100927'), '11012021100927');
  assert.equal(identity.codeFull('030'), '11012021100030');
  assert.equal(identity.codeShort('927'), '0927');
  assert.equal(identity.codeShort('11012021100030'), '0030');
  assert.equal(identity.codeShort('030'), '0030');
});

test('every unregistered row resolves to one master student', () => {
  assert.ok(unregistered.length > 0);
  unregistered.forEach((row, i) => {
    const hit = identity.resolve(row, index);
    assert.ok(hit, 'unregistered row ' + i + ' did not resolve');
    assert.equal(typeof hit._identityKey, 'string');
    assert.ok(hit._identityKey);
  });
});

test('Arabic source names win over Latin master names', () => {
  unregistered.filter((row) => identity.hasArabic(row.full_name)).forEach((row, i) => {
    const hit = identity.resolve(row, index);
    assert.ok(hit, 'Arabic unregistered row ' + i + ' did not resolve');
    assert.ok(identity.hasArabic(identity.displayName(row, hit)), 'Arabic display name lost at row ' + i);
  });
});

test('group conflicts are reported, never silent', () => {
  const withConflict = unregistered.filter((row) => {
    const hit = identity.resolve(row, index);
    return hit && identity.groupConflict(row.group_id, hit.group_id);
  });
  // Owner-corrected roster: Habiba (803) → group 6 (was 7) and Amnah's stale group 9 cancelled → group 6.
  // With the corrected assignments the unregistered rows must now agree with the master roster.
  assert.equal(withConflict.length, 0, 'expected no unregistered group conflicts after owner corrections');
  withConflict.forEach((row, i) => {
    const hit = identity.resolve(row, index);
    const conflict = identity.groupConflict(row.group_id, hit.group_id);
    assert.equal(conflict.sourceGroup, identity.cleanGroup(row.group_id));
    assert.equal(conflict.masterGroup, identity.cleanGroup(hit.group_id));
  });
});

test('colliding short codes resolve by group first, and ambiguous keys are rejected', () => {
  assert.ok(index.collisions.short.length > 0, 'fixture should contain short-code collisions');
  index.collisions.short.forEach((short) => {
    const rows = index.byShort[short];
    rows.forEach((student) => {
      const key = student._identityGroup + '_' + short;
      assert.equal(identity.findByKey(index, key), student);
    });
    assert.equal(identity.unique(index.byShort, short), null);
  });
});

test('identity keys are unique across the master roster', () => {
  const keys = new Set(master.map((s) => s._identityKey));
  assert.equal(keys.size, master.length);
  master.forEach((s) => assert.equal(identity.findByKey(index, s._identityKey), s));
});

test('every assignment with a code present in master resolves', () => {
  const masterFull = new Set(master.map((s) => identity.codeFull(s.raw_code || s.student_code || s.code_short)));
  assignments.forEach((row, i) => {
    const full = identity.codeFull(row.student_code || row.code_short);
    if (!masterFull.has(full)) return;
    assert.ok(identity.resolve(row, index), 'assignment row ' + i + ' with known code did not resolve');
  });
  const unmatched = assignments.filter((row) => !identity.resolve(row, index));
  assert.ok(unmatched.length <= 1, 'unexpected unresolved assignment rows: ' + unmatched.length);
});

test('group totals are derived from the master roster', () => {
  const counts = {};
  master.forEach((s) => { counts[s._identityGroup] = (counts[s._identityGroup] || 0) + 1; });
  assert.equal(Object.values(counts).reduce((a, n) => a + n, 0), master.length);
  Object.keys(counts).forEach((gid) => assert.ok(counts[gid] > 0));
});
