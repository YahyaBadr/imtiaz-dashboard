'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   identity.js — canonical student identity (pure, no DOM, no app state)

   The same student appears in several sheets with different code shapes:
   - master_students.raw_code:      "927" | "0927" | "11012021100927"
   - assignments.student_code:      "11012021100927"
   - assignments/unregistered.code_short: "927" | "030"

   Rules:
   - Full code = 1101202110 + four digits
   - Short code = the four digits, zero-padded
   - group + short is preferred when both rows carry a group
   - a full/short key is used only when it is unique
   - Arabic-name matching is the last resort, never a silent override
   ═══════════════════════════════════════════════════════════════════════════ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImtiazIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CODE_PREFIX = '1101202110';
  const ARABIC_RE = /[\u0600-\u06ff]/;

  function digits(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\D/g, '');
  }

  function codeFull(value) {
    const d = digits(value);
    if (!d) return '';
    if (d.length === 14 && d.indexOf(CODE_PREFIX) === 0) return d;
    if (d.length <= 4) return CODE_PREFIX + d.padStart(4, '0');
    if (d.indexOf(CODE_PREFIX) === 0) {
      const tail = d.slice(CODE_PREFIX.length);
      return tail.length <= 4 ? CODE_PREFIX + tail.padStart(4, '0') : d;
    }
    return d.length === 14 ? d : CODE_PREFIX + d.padStart(4, '0');
  }

  function codeShort(value) {
    const d = digits(value);
    if (!d) return '';
    if (d.length > 4) return d.slice(-4).padStart(4, '0');
    return d.padStart(4, '0');
  }

  function cleanGroup(value) {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s) return '';
    const n = parseFloat(s);
    return isNaN(n) ? s : String(Math.round(n));
  }

  function normName(value) {
    let s = String(value === null || value === undefined ? '' : value);
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
    return s
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\u0600-\u06ffa-z0-9]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function compactName(value) { return normName(value).replace(/\s+/g, ''); }
  function hasArabic(value) { return ARABIC_RE.test(String(value || '')); }

  function put(map, key, item) {
    if (!key) return;
    (map[key] || (map[key] = [])).push(item);
  }

  function unique(map, key) {
    const list = key && map[key];
    return list && list.length === 1 ? list[0] : null;
  }

  function buildIndex(students) {
    const list = Array.isArray(students) ? students : [];
    const index = {
      students: list,
      bySid: Object.create(null),
      byFull: Object.create(null),
      byShort: Object.create(null),
      byGroupShort: Object.create(null),
      byName: Object.create(null),
      byCompactName: Object.create(null),
      byGroupName: Object.create(null),
      collisions: { full: [], short: [], groupShort: [] }
    };

    list.forEach((student, i) => {
      if (!student || typeof student !== 'object') return;
      const full = codeFull(student.student_code || student.raw_code || student.code_short);
      const short = codeShort(student.code_short || student.student_code || student.raw_code);
      const gid = cleanGroup(student.group_id);
      const name = normName(student.full_name);
      const compact = compactName(student.full_name);

      student._code_full = full;
      student._code_short = short;
      student._identityGroup = gid;
      student._identityKey = student._identityKey || ('student-' + (i + 1));

      index.bySid[student._identityKey] = student;
      put(index.byFull, full, student);
      put(index.byShort, short, student);
      put(index.byGroupShort, gid + '|' + short, student);
      put(index.byName, name, student);
      put(index.byCompactName, compact, student);
      put(index.byGroupName, gid + '|' + name, student);
    });

    ['byFull', 'byShort', 'byGroupShort'].forEach((kind) => {
      const shortKind = kind === 'byFull' ? 'full' : kind === 'byShort' ? 'short' : 'groupShort';
      Object.keys(index[kind]).forEach((key) => {
        if (index[kind][key].length > 1) index.collisions[shortKind].push(key);
      });
    });

    return index;
  }

  function resolve(row, index) {
    if (!row || !index) return null;
    if (row._identityKey && index.bySid[row._identityKey] === row) return row;

    const gid = cleanGroup(row.group_id);
    const full = codeFull(row.student_code || row.raw_code || row.code_short);
    const short = codeShort(row.code_short || row.raw_code || row.student_code);
    const name = normName(row.full_name);
    const compact = compactName(row.full_name);

    let hit = unique(index.byGroupShort, gid + '|' + short);
    if (!hit) hit = unique(index.byFull, full);
    if (!hit) hit = unique(index.byShort, short);
    if (!hit) hit = unique(index.byGroupName, gid + '|' + name);
    if (!hit) hit = unique(index.byName, name);
    if (!hit) hit = unique(index.byCompactName, compact);
    return hit;
  }

  function findByKey(index, rawKey) {
    if (!index || rawKey === null || rawKey === undefined) return null;
    let key = String(rawKey).trim();
    if (!key) return null;
    if (index.bySid[key]) return index.bySid[key];

    const m = key.match(/^(\d+)[_\s:]+(\d+)$/);
    if (m) {
      const grouped = unique(index.byGroupShort, cleanGroup(m[1]) + '|' + codeShort(m[2]));
      if (grouped) return grouped;
      let qualified = unique(index.byShort, codeShort(m[2]));
      if (!qualified) qualified = unique(index.byFull, codeFull(m[2]));
      if (qualified) return qualified;
    }

    let hit = unique(index.byFull, codeFull(key));
    if (!hit) hit = unique(index.byShort, codeShort(key));
    if (!hit) hit = unique(index.byName, normName(key));
    if (!hit) hit = unique(index.byCompactName, compactName(key));
    return hit;
  }

  function groupConflict(sourceGroup, masterGroup) {
    const a = cleanGroup(sourceGroup), b = cleanGroup(masterGroup);
    if (!a || !b || a === b) return null;
    return { sourceGroup: a, masterGroup: b };
  }

  function displayName(row, student) {
    const rowName = String((row && row.full_name) || '').trim();
    const studentName = String((student && student.full_name) || '').trim();
    const hint = String((student && student._displayNameAr) || '').trim();
    if (rowName && hasArabic(rowName)) return rowName;
    if (hint) return hint;
    return studentName || rowName;
  }

  function displayGroup(row, student) {
    return cleanGroup((student && student.group_id) || (row && row.group_id));
  }

  function sourceGroup(row, student) {
    return cleanGroup((row && row.group_id) || (student && student._unregisteredGroup));
  }

  function displayGender(row, student) {
    return String((student && student.gender) || (row && row.gender) || '').trim();
  }

  /* legacy composite key used by older pages: group_id + '_' + raw short code */
  function legacyKey(row) {
    const gid = cleanGroup(row && row.group_id);
    const raw = String((row && row.code_short) || '').replace(/\D/g, '');
    if (!gid || !raw) return '';
    return gid + '_' + raw;
  }

  function aliases(index) {
    const out = Object.create(null);
    if (!index) return out;
    Object.keys(index.bySid).forEach((key) => { out[key] = index.bySid[key]; });
    ['byFull', 'byShort', 'byGroupShort'].forEach((kind) => {
      Object.keys(index[kind]).forEach((key) => {
        const list = index[kind][key];
        if (list.length === 1) out[key] = list[0];
      });
    });
    /* مفاتيح توافقية (resilience):
       - الكود القصير وحده عندما يكون فريداً في الكشف بالكامل
       - جروب_كود بصيغة الصفحات القديمة عندما يكون فريداً
       تُسجَّل المفاتيح الفريدة فقط؛ أي مفتاح مكرر بين طالبين يُترك غامضاً عمداً. */
    const uniqShort = Object.create(null), dupShort = Object.create(null);
    const uniqLegacy = Object.create(null), dupLegacy = Object.create(null);
    (index.students || []).forEach((st) => {
      const sh = st._code_short;
      if (sh) { if (uniqShort[sh]) dupShort[sh] = true; else uniqShort[sh] = st; }
      const raw = String(st.code_short || '').replace(/\D/g, '');
      const lk = cleanGroup(st.group_id) + '_' + raw;
      if (lk !== '_') { if (uniqLegacy[lk]) dupLegacy[lk] = true; else uniqLegacy[lk] = st; }
    });
    Object.keys(uniqShort).forEach((key) => { if (!dupShort[key] && !out[key]) out[key] = uniqShort[key]; });
    Object.keys(uniqLegacy).forEach((key) => { if (!dupLegacy[key] && !out[key]) out[key] = uniqLegacy[key]; });
    return out;
  }

  return {
    CODE_PREFIX,
    codeFull,
    codeShort,
    cleanGroup,
    normName,
    compactName,
    hasArabic,
    buildIndex,
    resolve,
    findByKey,
    legacyKey,
    aliases,
    groupConflict,
    displayName,
    displayGroup,
    sourceGroup,
    displayGender,
    unique
  };
});
