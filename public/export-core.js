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

    /* 6) الوحدات: الاسم، المحافظة، المفيدون إناث/ذكور/إجمالي، المقيدون/السعة/النسبة */
    const byUnit = {};
    (DB.assignments || []).forEach((row) => {
      if (normRoundKey(row.round_key) !== 'units') return;
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

    return { summary, roundDates, alerts, training, topFields, groups, matrix, units, unreg, students };
  }

  /* المجموعات المعرَّفة: اسم الورقة + الهيدر + الصفوف + لون التبويب */
  function datasets(scope) {
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
      return `imtiaz-${scope}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
    }
  };
})();
