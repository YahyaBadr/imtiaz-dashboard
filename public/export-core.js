'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   export-core.js — مصدر بيانات التصدير الوحيد (من window.DB مباشرة، بلا DOM)
   يُحمَّل كـ classic script (بحجم صغير) حتى تعمل قائمة «تصدير» فوراً،
   بينما تُحمَّل مكتبات xlsx/pdfmake/docx عند أول نقرة فقط (lazy).
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  const N = (v) => parseInt(v, 10) || 0;
  const genderAr = (g) => (g === 'F' ? 'أنثى' : g === 'M' ? 'ذكر' : 'غير محدد');

  // ألوان أقسام اللوحة (لتبويبات Excel)
  const TONE = {
    units: '2A9D8F', equine_lab_fish: '3E7CB1', poultry: 'C97B2C', slaughter: 'A63D40',
    college: '6B4C7A', elective: '5F8D4E', unknown: '8A7F88'
  };
  function toneFor(roundKey) { return TONE[roundKey] || '6B4C7A'; }

  function statusText(st) {
    return ({ current: 'جارٍ الآن', upcoming: 'قادم', finished: 'انتهى' })[st] || '—';
  }

  /* ── احتياطيات محلية للدوال المشتركة مع app.js (export-core يُحمَّل قبل app.js،
     وتُفضَّل نسخة window إن وُجدت وقت الاستدعاء — نفس أرقام اللوحة دائماً) ── */
  const W = (name, fallback) => function () {
    const f = window[name];
    return typeof f === 'function' ? f.apply(null, arguments) : fallback.apply(null, arguments);
  };
  const localFormatDate = function (v) {
    if (v === null || v === undefined || v === '') return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s;
  };
  const localComputeStatus = function (startDate, endDate) {
    const s = formatDate(startDate), e = formatDate(endDate);
    if (!s || !e) return 'upcoming';
    const today = new Date().toISOString().slice(0, 10);
    if (today > e) return 'finished';
    if (today >= s) return 'current';
    return 'upcoming';
  };
  const localNormGender = function (g) {
    const s = String(g || '').trim().toUpperCase();
    if (s === 'F' || s === 'أنثى' || s === 'انثى' || s.startsWith('FEM')) return 'F';
    if (s === 'M' || s === 'ذكر' || s.startsWith('MAL')) return 'M';
    return '';
  };
  const localFormatPhone = function (phone) {
    let p = String(phone === null || phone === undefined ? '' : phone).trim().replace(/\D/g, '');
    if (!p) return '';
    if (p.startsWith('0020')) p = p.slice(4);
    if (p.startsWith('20') && p.length === 12) p = p.slice(2);
    if (p.length === 10 && p.startsWith('1')) p = '0' + p;
    return p;
  };
  const localRoundLabel = function (key) {
    const DB = window.DB || {};
    const k = normRoundKey(key);
    return (DB.roundNames && (DB.roundNames[k] || DB.roundNames[key])) || String(key || '').trim() || 'غير محدد';
  };
  const localNormRoundKey = function (key) {
    const raw = String(key === null || key === undefined ? '' : key).trim();
    if (!raw) return '';
    const alias = ((window.APP_CONFIG || {}).ROUND_ALIASES || {});
    if (alias[raw]) return normRoundKey(alias[raw]);
    const s = raw.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^\w]/g, '');
    if (/unit|وحدة|وحدات/.test(s)) return 'units';
    if (/poultry|دواجن|دجاج/.test(s)) return 'poultry';
    if (/slaughter|food|مجزر|مجازر|غذاء/.test(s)) return 'slaughter';
    if (/equine|horse|lab|fish|خيل|معامل|سمك/.test(s)) return 'equine_lab_fish';
    if (/college|depart|قسم|اقسام|كلية/.test(s)) return 'college';
    if (/elective|اختياري/.test(s)) return 'elective';
    return raw;
  };
  const formatDate      = W('formatDate', localFormatDate);
  const computeStatus   = W('computeStatus', localComputeStatus);
  const normGender      = W('normGender', localNormGender);
  const formatPhone     = W('formatPhone', localFormatPhone);
  const roundLabel      = W('roundLabel', localRoundLabel);
  const normRoundKey    = W('normRoundKey', localNormRoundKey);

  function ensureReady() {
    const DB = window.DB;
    if (!DB || !Array.isArray(DB.students) || !DB.students.length) {
      throw new Error('البيانات غير جاهزة بعد — انتظر اكتمال تحميل اللوحة ثم أعد المحاولة');
    }
  }

  /* ─────────── بناء كل مجموعات البيانات من نفس أرقام اللوحة تماماً ─────────── */
  function build() {
    ensureReady();
    const DB = window.DB;

    /* 1) الملخص: المؤشرات + تواريخ الدورة + التنبيهات الحالية */
    const totalStudents = DB.students.length
      || (DB.groups || []).reduce((a, g) => a + N(g.total_students), 0);
    const males = DB.students.filter((s) => s.gender === 'M').length;
    const females = DB.students.filter((s) => s.gender === 'F').length;
    const unknownGender = totalStudents - males - females;
    const r2Reg = (DB.round2Summary || []).reduce((a, r) => a + N(r.registered), 0);
    const r2Missing = (DB.round2Summary || []).reduce((a, r) => a + N(r.not_registered), 0);

    const summary = [
      ['إجمالي طلاب الدفعة', totalStudents],
      ['بنين', males],
      ['بنات', females],
      ['غير محدد النوع', Math.max(0, unknownGender)],
      ['عدد الجروبات', (DB.groups || []).length],
      ['مسجلون بمواقع التدريب (دورة 2)', r2Reg],
      ['غير مسجلين (دورة 2)', r2Missing],
      ['العام الجامعي', (window.APP_CONFIG && APP_CONFIG.ACADEMIC_YEAR) || '—']
    ];

    // تواريخ الراوندات (نفس مصدر التواريخ في اللوحة)
    const roundDates = (DB.roundDates || []).map((r) => [
      String(r.round_order || '—'),
      r.round_name_ar || roundLabel(r.round_key) || '—',
      formatDate(r.start_date) || '—',
      formatDate(r.end_date) || '—'
    ]).sort((a, b) => N(a[0]) - N(b[0]));

    // تنبيهات اللوحة الحالية (نفس مصادرها: issues + غير المسجلين + جودة البيانات)
    const alerts = [];
    if (r2Missing > 0) alerts.push(['تنبيه', `طلاب غير مسجلين بمواقع التدريب (دورة 2): ${r2Missing} طالب/ة`]);
    const issuesCount = (DB.issues || []).length + (DB.issuesR2 || []).length;
    if (issuesCount) alerts.push(['ملاحظة جودة بيانات', `${issuesCount} ملاحظة مسجّلة في كشف Problems`]);
    (DB.issuesR2 || []).forEach((r) => alerts.push([r.full_name || 'غير محدد', `جروب ${r.group_id || '—'} — ${r.issue || ''}`]));
    (DB.issues || []).forEach((r) => alerts.push([r.name || 'غير محدد', `جروب ${r.group || '—'} — ${r.problem || ''}`]));

    /* 2) توزيع التدريب R2: لكل مجال — الإجمالي، السعة، النسبة، الحالة */
    const training = (DB.round2Summary || []).map((r) => {
      const reg = N(r.registered), exp = N(r.expected_students), miss = N(r.not_registered);
      const cap = N(r.capacity);
      const pct = exp > 0 ? Math.round((reg / exp) * 100) : 0;
      const rk = r.round_key || '';
      return [r.round_name_ar || roundLabel(rk), reg, exp, cap, miss, pct,
        miss === 0 && exp > 0 && reg >= exp ? 'مكتمل' : 'غير مكتمل'];
    });

    /* 3) المجالات الأكثر طلبًا: الترتيب + المتوسط + عدد اختياراته أولًا */
    const prefs = DB.prefColumns || [];
    const sums = {}, counts = {}, firsts = {};
    prefs.forEach((p) => { sums[p] = 0; counts[p] = 0; firsts[p] = 0; });
    DB.students.forEach((s) => prefs.forEach((p) => {
      const v = parseFloat(s[p]);
      if (!isNaN(v) && v > 0) { sums[p] += v; counts[p]++; if (v === 1) firsts[p]++; }
    }));
    const topFields = prefs.map((p) => ({
      name: (DB.fieldsMap && DB.fieldsMap[p]) || p,
      avg: counts[p] ? sums[p] / counts[p] : 0,
      first: firsts[p]
    })).sort((a, b) => b.avg - a.avg)
      .map((f, i) => [i + 1, f.name, Number(f.avg.toFixed(2)), f.first]);

    /* 4) الجروبات: رقم، اسم، إجمالي، طالبات، طلاب، غير محدد، تصنيف */
    const rosterFG = {};
    DB.students.forEach((s) => {
      const gid = String(s.group_id || '').trim();
      if (!gid) return;
      if (!rosterFG[gid]) rosterFG[gid] = { f: 0, m: 0, u: 0 };
      if (s.gender === 'F') rosterFG[gid].f++;
      else if (s.gender === 'M') rosterFG[gid].m++;
      else rosterFG[gid].u++;
    });
    const groups = (DB.groups || []).map((g) => {
      const gid = String(g.group_id);
      const tot = N(g.total_students);
      const c = rosterFG[gid] || { f: N(g.female_count), m: N(g.male_count), u: 0 };
      const unk = Math.max(0, tot - c.f - c.m);
      let cls = '—';
      try { cls = g.group_type || g.type || g.classification || '—'; } catch (e) {}
      return [gid, g.group_name || ('جروب ' + gid), tot, c.f, c.m, unk, String(cls)];
    });

    /* 5) المصفوفة: لكل جروب × راوند — القسم، القوام، مشارك مع، الإجمالي، الحالة */
    const matrix = [];
    (DB.roundSchedule || []).forEach((r) => {
      const gid = String(r.group_id);
      const gInfo = (DB.groups || []).find((x) => String(x.group_id) === gid);
      const count = gInfo ? N(gInfo.total_students) : 0;
      const st = computeStatus(r.start_date, r.end_date);
      const mKey = r.round_order + '_' + r.round_key;
      const mData = DB.roundMatrix && DB.roundMatrix[mKey];
      const others = mData && mData.groups.length > 1
        ? 'مشارك مع جروب ' + mData.groups.filter((x) => String(x.group_id) !== gid).map((x) => x.group_id).join('+')
        : '—';
      const sharedTotal = mData && mData.groups.length > 1 ? mData.total_students : count;
      matrix.push([gid, r.round_name_ar || roundLabel(r.round_key),
        formatDate(r.start_date) || '—', formatDate(r.end_date) || '—',
        count, others, sharedTotal, statusText(st)]);
    });
    matrix.sort((a, b) => (N(a[0]) - N(b[0])) || String(a[2]).localeCompare(String(b[2])));

    /* 6) الوحدات: الاسم، المحافظة، المفيدون إناث/ذكور/إجمالي، المقيدون/السعة/النسبة
       بند2(ج): نفس مصدر اللوحة getUnitAssignments() — لا فلتر حرفي هش ولا تصفير */
    const byUnit = {};
    ((window.getUnitAssignments ? window.getUnitAssignments() : (DB.assignments || []).filter((row) => normRoundKey(row.round_key) === 'units')) || [])
      .forEach((row) => {
        const un = (row.unit_name || '').trim();
        if (un) (byUnit[un] = byUnit[un] || []).push(row);
      });
    const units = (DB.stationsUnits || []).map((u) => {
      const un = (u.unit_name || '').trim();
      const reg = N(u.registered), cap = N(u.capacity);
      const list = byUnit[un] || [];
      const f = list.filter((s) => s.gender === 'F').length;
      const m = list.filter((s) => s.gender === 'M').length;
      return [un, (u.governorate || '').trim() || 'غير محدد',
        N(u.females), N(u.males), N(u.females) + N(u.males),
        reg, cap || '—', cap > 0 ? Math.round((reg / cap) * 100) + '%' : '—',
        list.length || '—', f, m];
    }).sort((a, b) => N(b[5]) - N(a[5]));

    /* 7) غير المسجلين: الأسماء مع الجروب والكود */
    const unreg = (DB.unregistered || []).map((u) => [
      u.full_name || 'غير محدد', u.code_short || '—', String(u.group_id || '—'),
      roundLabel(u.round_key), genderAr(normGender(u.gender))
    ]);

    /* 8) دليل الطلاب الكامل */
    const students = DB.students.map((s) => [
      s.full_name || 'غير محدد', s.student_code || '—', String(s.group_id || '—'),
      genderAr(s.gender), formatPhone(s.phone) || '—'
    ]);

    /* 9) البند 3 — أوراق لكل جروب (مساره عبر كل الراوندات) ولكل راوند (مسجلوه)،
          بنفس أرقام اللوحة: roundSchedule + getUnitAssignments + تدوير البند 4 */
    const perGroup = {}, perRound = {};
    (DB.roundSchedule || []).forEach((r) => {
      const gid = String(r.group_id);
      const secLabel = r.round_name_ar || roundLabel(r.round_key) || '—';
      let subTxt = '';
      if (normRoundKey(r.round_key) === 'equine_lab_fish') {
        const rot = window.getEquineGroupRot ? window.getEquineGroupRot(gid) : null;
        if (rot) {
          const info = window.subUnitBlocksForOrder ? window.subUnitBlocksForOrder(r.round_order) : null;
          // جدول البلوكات كما في الشيت حرفياً: كل بلوك أسبوعان، البداية من عمود «يبدأ …»
          const blocksTxt = (info && info.blocks.length > 1)
            ? ' · ' + info.blocks.map((b, i) => {
                const at = window.subUnitAtDate ? subUnitAtDate(rot, r.round_order, b.start) : null;
                return 'أسبوعان ' + (i + 1) + ': ' + ((at && at.label) || '—');
              }).join(' | ')
            : '';
          subTxt = (window.subUnitSeqLabel ? subUnitSeqLabel(rot.sequence) : '') + blocksTxt;
        }
      }
      (perGroup[gid] = perGroup[gid] || []).push([gid, secLabel, formatDate(r.start_date) || '—', formatDate(r.end_date) || '—', statusText(computeStatus(r.start_date, r.end_date)), subTxt || '—']);
      (perRound[r.round_order] = perRound[r.round_order] || []).push([gid, secLabel]);
    });
    const groupSheets = Object.keys(perGroup).sort((a, b) => N(a) - N(b)).map((gid) => ({
      gid, rows: perGroup[gid].slice().sort((x, y) => String(x[2]).localeCompare(String(y[2])))
    }));
    const unitRegsByGid = {};
    (((window.getUnitAssignments ? window.getUnitAssignments() : []) || [])).forEach((row) => {
      const g = String(row.group_id || '').trim();
      if (!g || g === '0') return;
      (unitRegsByGid[g] = unitRegsByGid[g] || []).push(row);
    });

    return { summary, roundDates, alerts, training, topFields, groups, matrix, units, unreg, students, groupSheets, unitRegsByGid };
  }

  /* المجموعات المعرَّفة: اسم الورقة + الهيدر + الصفوف + لون التبويب
     البند 3 — النطاقات الجديدة: 'group:<gid>' لكل جروب (بياناته عبر كل الراوندات)،
     'round:<N>' لكل راوند (كل المسجلين فيه)، 'matrix'، 'students'، 'unreg'.
     نفس الصيغ الأربع ونفس اتفاقية التسمية والترويسة branded (تُطبَّق في export.js). */
  const GROUP_HEADER = ['الجروب', 'الراوند/القسم', 'من', 'إلى', 'الحالة', 'تدوير خيل/معامل/سمك (حسب الشيت)'];
  const ROUND_HEADER = ['الاسم', 'الكود', 'الجروب', 'النوع', 'الوحدة البيطرية', 'الهاتف'];
  function groupSheetSet(d, gid) {
    const gs = (d.groupSheets || []).find((x) => String(x.gid) === String(gid));
    if (!gs) return null;
    const gInfo = (DB.groups || []).find((x) => String(x.group_id) === String(gid));
    const name = 'جروب ' + gid + (gInfo && gInfo.group_name ? ' - ' + gInfo.group_name : '');
    return { name: name.slice(0, 31), header: GROUP_HEADER, rows: gs.rows, tone: '3E7CB1' };
  }
  function roundSheetSet(d, order) {
    const regs = ((window.getUnitAssignments ? window.getUnitAssignments() : []) || [])
      .filter((r) => String(r.round_order || '') === String(order));
    // مسجلو الراوند = صفوف التسجيل فيه؛ إن لم يكن للراوند صفوف وحدة (راوندات القسم) يُبنى من كشف الجروبات المجدولة
    let rows = regs.map((r) => [r.full_name || 'غير محدد', r.code_short || '—', String(r.group_id || '—'), genderAr(normGender(r.gender)), (r.unit_name || '').trim() || '—', formatPhone(r.phone) || '—']);
    if (!rows.length) {
      const sched = (DB.roundSchedule || []).filter((x) => String(x.round_order) === String(order));
      const gids = sched.map((x) => String(x.group_id));
      rows = (DB.students || []).filter((s) => gids.indexOf(String(s.group_id)) > -1)
        .map((s) => [s.full_name || 'غير محدد', s.student_code || '—', String(s.group_id || '—'), genderAr(s.gender), '—', formatPhone(s.phone) || '—']);
    }
    const label = (window.ROUND_LABELS_AR ? ROUND_LABELS_AR[order] : null) || ('راوند ' + order);
    return { name: ('راوند ' + order).slice(0, 31), header: ROUND_HEADER, rows, tone: '6B4C7A', label };
  }
  function datasets(scope) {
    scope = String(scope || 'page');
    const d = build();
    const all = [
      { name: 'الملخص', header: ['البيان', 'القيمة'], rows: d.summary, tone: '6B4C7A' },
      { name: 'تواريخ الدورة', header: ['ترتيب الراوند', 'الراوند', 'من', 'إلى'], rows: d.roundDates, tone: '6B4C7A' },
      { name: 'التنبيهات', header: ['البند', 'التفاصيل'], rows: d.alerts, tone: 'A63D40' },
      { name: 'توزيع التدريب R2', header: ['المجال', 'مسجلون', 'متوقعون', 'السعة', 'غير مسجلين', 'نسبة %', 'الحالة'], rows: d.training, tone: '2A9D8F' },
      { name: 'المجالات الأكثر طلبًا', header: ['الترتيب', 'المجال', 'المتوسط', 'اختيار أول'], rows: d.topFields, tone: 'C97B2C' },
      { name: 'الجروبات', header: ['الجروب', 'اسم الجروب', 'الإجمالي', 'طالبات', 'طلاب', 'غير محدد', 'التصنيف'], rows: d.groups, tone: '3E7CB1' },
      { name: 'مصفوفة التدوير', header: ['الجروب', 'الراوند', 'من', 'إلى', 'قوام الجروب', 'مشاركة', 'إجمالي المتواجدين', 'الحالة'], rows: d.matrix, tone: '5F8D4E' },
      { name: 'الوحدات', header: ['الوحدة', 'المحافظة', 'مفيدون إناث', 'مفيدون ذكور', 'مفيدون إجمالي', 'المقيدون', 'السعة', 'نسبة الإشغال', 'كشف مسجلين', 'بنات الكشف', 'بنين الكشف'], rows: d.units, tone: '2A9D8F' },
      { name: 'غير المسجلين', header: ['الاسم', 'الكود', 'الجروب', 'الدورة', 'النوع'], rows: d.unreg, tone: 'A63D40' },
      { name: 'دليل الطلاب', header: ['الاسم', 'الرقم المرجعي', 'الجروب', 'النوع', 'الهاتف'], rows: d.students, tone: '6B4C7A' }
    ];
    if (scope === 'full') return all;
    // البند 3 — نطاقات مفصلة: group:<gid> · round:<N> · matrix · students · unreg
    const mG = scope.match(/^group[:\-_](\d+)$/i);
    if (mG) { const s = groupSheetSet(d, mG[1]); return s ? [s] : []; }
    const mR = scope.match(/^round[:\-_](\d+)$/i);
    if (mR) { const s = roundSheetSet(d, mR[1]); return s ? [s] : []; }
    if (scope === 'matrix')   return all.filter((s) => s.name === 'مصفوفة التدوير');
    if (scope === 'students') return all.filter((s) => s.name === 'دليل الطلاب');
    if (scope === 'unreg')    return all.filter((s) => s.name === 'غير المسجلين');
    if (scope === 'units')    return all.filter((s) => s.name === 'الوحدات');
    // نطاق «الصفحة الحالية»: مجموعة الأوراق المرتبطة بالتبويب النشط
    const activeBtn = document.querySelector('.site-nav .nav-btn.active');
    const page = activeBtn ? activeBtn.dataset.page : null;
    const pick = {
      overview: ['الملخص', 'تواريخ الدورة', 'التنبيهات', 'توزيع التدريب R2', 'المجالات الأكثر طلبًا', 'الجروبات'],
      schedule: ['مصفوفة التدوير', 'تواريخ الدورة', 'الجروبات'],
      units: ['الوحدات'],
      'not-registered': ['غير المسجلين']
    }[page] || null;
    return pick ? all.filter((s) => pick.indexOf(s.name) > -1) : all;
  }

  window.ExportCore = {
    build, datasets, toneFor,
    fileStamp(scope, ext) {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      // البند 3: نفس الاتفاقية imtiaz-<scope>-YYYY-MM-DD.<ext> مع تنظيف نطاقات group:N / round:N
      const safe = String(scope || 'page').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'page';
      return `imtiaz-${safe}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
    }
  };
})();
