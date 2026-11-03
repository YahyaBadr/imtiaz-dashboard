'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   export.js — تصدير حقيقي لملفات Excel / PDF / Word / CSV (توليد في المتصفح)
   مصدر البيانات: window.DB (نفس مصدر اللوحة) — لا قراءة من DOM.
   المكتبات تُحمَّل عند أول نقرة فقط (lazy-load).
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  const libs = { xlsx: null, pdfmake: null, docx: null };

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('تعذّر تحميل ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadLibs(fmt) {
    if (fmt === 'xlsx' && !libs.xlsx) { await loadScript('./vendor/xlsx.full.min.js'); libs.xlsx = window.XLSX; }
    if (fmt === 'pdf' && !libs.pdfmake) {
      await loadScript('./vendor/pdfmake.min.js');
      await loadScript('./vendor/vfs_fonts.js');
      libs.pdfmake = window.pdfMake;
    }
    if (fmt === 'docx' && !libs.docx) { await loadScript('./vendor/docx.umd.js'); libs.docx = window.docx; }
  }

  // اسم الملف: imtiaz-YYYY-MM-DD-HHMM.ext
  function fileStamp(ext) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `imtiaz-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  }

  const N = (v) => parseInt(v, 10) || 0;
  const genderAr = (g) => (g === 'F' ? 'أنثى' : g === 'M' ? 'ذكر' : '—');
  function statusBadgeText(st) {
    return ({ current: 'جارٍ الآن', upcoming: 'قادم', finished: 'انتهى' })[st] || '—';
  }

  /* ─────────── بناء بيانات التصدير من window.DB — نفس أرقام اللوحة تماماً ─────────── */
  function buildExportData() {
    const DB = window.DB;
    if (!DB || !Array.isArray(DB.students) || !DB.students.length) throw new Error('البيانات غير جاهزة بعد — انتظر اكتمال تحميل اللوحة');

    const totalStudents = (DB.groups || []).reduce((a, g) => a + N(g.total_students), 0) || DB.students.length;
    const males = DB.students.filter((s) => s.gender === 'M').length;
    const females = DB.students.filter((s) => s.gender === 'F').length;
    const r2Reg = (DB.round2Summary || []).reduce((a, r) => a + N(r.registered), 0);
    const r2Missing = (DB.round2Summary || []).reduce((a, r) => a + N(r.not_registered), 0);

    const summary = [
      ['إجمالي طلاب الدفعة', totalStudents],
      ['بنين', males],
      ['بنات', females],
      ['عدد الجروبات', (DB.groups || []).length],
      ['مسجلون بمواقع التدريب (دورة 2)', r2Reg],
      ['غير مسجلين (دورة 2)', r2Missing]
    ];

    const training = (DB.round2Summary || []).map((r) => {
      const reg = N(r.registered), exp = N(r.expected_students), miss = N(r.not_registered);
      return [r.round_name_ar || roundLabel(r.round_key), reg, exp, miss, exp > 0 ? Math.round((reg / exp) * 100) : 0];
    });

    const groups = (DB.groups || []).map((g) => {
      const gid = String(g.group_id);
      const sched = (DB.roundSchedule || []).filter((r) => String(r.group_id) === gid).sort((a, b) => N(a.round_order) - N(b.round_order));
      const cur = sched.find((r) => computeStatus(r.start_date, r.end_date) === 'current')
        || sched.find((r) => computeStatus(r.start_date, r.end_date) === 'upcoming') || sched[sched.length - 1];
      return [gid, N(g.total_students),
        cur ? (cur.round_name_ar || roundLabel(cur.round_key)) : '—',
        cur ? statusBadgeText(computeStatus(cur.start_date, cur.end_date)) : '—'];
    });

    const matrix = (DB.roundSchedule || []).map((r) => [
      String(r.group_id), r.round_name_ar || roundLabel(r.round_key),
      formatDate(r.start_date) || '—', formatDate(r.end_date) || '—',
      statusBadgeText(computeStatus(r.start_date, r.end_date))
    ]).sort((a, b) => (N(a[0]) - N(b[0])) || String(a[1]).localeCompare(String(b[1]), 'ar'));

    const unreg = (DB.unregistered || []).map((u) => [
      u.full_name || 'غير محدد', u.code_short || '—', String(u.group_id || '—'),
      roundLabel(u.round_key), genderAr(normGender(u.gender))
    ]);

    const students = DB.students.map((s) => [
      s.full_name || 'غير محدد', s.student_code || '—', String(s.group_id || '—'),
      genderAr(s.gender), formatPhone(s.phone) || '—'
    ]);

    return { summary, training, groups, matrix, unreg, students };
  }

  /* ─────────── EXCEL (.xlsx): SheetJS — أوراق متعددة · RTL · رؤوس مثبّتة ─────────── */
  async function exportXLSX() {
    await loadLibs('xlsx');
    const XLSX = libs.xlsx;
    const d = buildExportData();
    const wb = XLSX.utils.book_new();

    const addSheet = (name, header, rows) => {
      const ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
      ws['!cols'] = header.map(() => ({ wch: 20 }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    addSheet('الملخص', ['البيان', 'القيمة'], d.summary);
    addSheet('توزيع التدريب R2', ['المجال', 'مسجلون', 'متوقعون', 'غير مسجلين', 'نسبة %'], d.training);
    addSheet('الجروبات', ['الجروب', 'القوام', 'الموقع الحالي', 'الحالة'], d.groups);
    addSheet('مصفوفة التدوير', ['الجروب', 'الدورة', 'من تاريخ', 'إلى تاريخ', 'الحالة'], d.matrix);
    addSheet('غير المسجلين', ['الاسم', 'الكود', 'الجروب', 'الدورة', 'النوع'], d.unreg);
    addSheet('دليل الطلاب', ['الاسم', 'الرقم المرجعي', 'الجروب', 'النوع', 'الهاتف'], d.students);

    // وسوم الأوراق RTL (يقرأها Excel في عرض الأوراق)
    wb.Workbook = { Sheets: wb.SheetNames.map(() => ({ Hidden: 0, RTL: true })) };

    const fname = fileStamp('xlsx');
    XLSX.writeFile(wb, fname);
    return fname;
  }

  /* ─────────── CSV (.csv): UTF-8 BOM — ملف واحد بأقسام واضحة ─────────── */
  async function exportCSV() {
    const d = buildExportData();
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const toCSV = (rows) => rows.map((r) => r.map(esc).join(',')).join('\r\n');

    let out = '\uFEFF'; // BOM — يفتح العربية بشكل صحيح في Excel
    out += 'الملخص\r\n' + toCSV([['البيان', 'القيمة'], ...d.summary]) + '\r\n\r\n';
    out += 'توزيع التدريب بالدورة الثانية\r\n' + toCSV([['المجال', 'مسجلون', 'متوقعون', 'غير مسجلين', 'نسبة %'], ...d.training]) + '\r\n\r\n';
    out += 'الجروبات\r\n' + toCSV([['الجروب', 'القوام', 'الموقع الحالي', 'الحالة'], ...d.groups]) + '\r\n\r\n';
    out += 'مصفوفة التدوير\r\n' + toCSV([['الجروب', 'الدورة', 'من تاريخ', 'إلى تاريخ', 'الحالة'], ...d.matrix]) + '\r\n\r\n';
    out += 'غير المسجلين\r\n' + toCSV([['الاسم', 'الكود', 'الجروب', 'الدورة', 'النوع'], ...d.unreg]) + '\r\n\r\n';
    out += 'دليل الطلاب\r\n' + toCSV([['الاسم', 'الرقم المرجعي', 'الجروب', 'النوع', 'الهاتف'], ...d.students]);

    const blob = new Blob([out], { type: 'text/csv;charset=utf-8;' });
    const fname = fileStamp('csv');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fname;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    return fname;
  }

  /* ─────────── PDF (.pdf): pdfmake + خط Cairo المضمّن + اتجاه RTL ─────────── */
  async function exportPDF() {
    await loadLibs('pdf');
    const pdfMake = libs.pdfmake;
    const assets = window.__IMTIAZ_EXPORT_ASSETS;
    if (!assets || !assets.Cairo400) throw new Error('أصول التصدير (export-assets.js) غير محمّلة');

    // Cairo base64 → vfs (base64 مقبول مباشرة في vfs من pdfmake ≥0.2)
    pdfMake.vfs = Object.assign({}, pdfMake.vfs || {});
    pdfMake.vfs['Cairo-Regular.ttf'] = assets.Cairo400;
    pdfMake.vfs['Cairo-Bold.ttf'] = assets.Cairo700 || assets.Cairo400;
    pdfMake.fonts = { Cairo: { normal: 'Cairo-Regular.ttf', bold: 'Cairo-Bold.ttf', italics: 'Cairo-Regular.ttf', bolditalics: 'Cairo-Regular.ttf' } };

    const d = buildExportData();
    const T = (header, rows, widths) => ({
      table: { headerRows: 1, widths: widths || header.map(() => '*'), body: [header.map((h) => ({ text: h, style: 'th' }))].concat(rows.map((r) => r.map((c) => String(c)))) },
      layout: { fillColor: (i) => (i === 0 ? '#2B1A2B' : (i % 2 ? '#FAF2E2' : '#FFFFFF')), hLineColor: '#E6DEC8', vLineColor: '#E6DEC8', hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      fontSize: 8.5
    });

    const dd = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [24, 34, 24, 40],
      info: { title: 'لوحة متابعة الإمتياز البيطري', subject: 'تقرير رسمي' },
      content: [
        { text: 'كلية الطب البيطري — جامعة القاهرة', style: 'org', alignment: 'right' },
        { text: 'لوحة متابعة الإمتياز البيطري', style: 'title', alignment: 'right' },
        { text: 'مكتب وكيل الكلية · العام الجاميدي ' + ((window.APP_CONFIG && APP_CONFIG.ACADEMIC_YEAR) || '—') + ' · تاريخ التقرير: ' + new Date().toLocaleDateString('ar-EG'), style: 'sub', alignment: 'right' },
        { text: 'الملخص', style: 'h', margin: [0, 10, 0, 4] },
        { columns: [T(['البيان', 'القيمة'], d.summary, [160, 90]), { width: 10 }, T(['المجال', 'مسجلون', 'متوقعون', 'غير مسجلين', '%'], d.training, [110, 55, 55, 65, 45])] },
        { text: 'الجروبات ومواقعها الحالية', style: 'h', margin: [0, 12, 0, 4] },
        T(['الجروب', 'القوام', 'الموقع الحالي', 'الحالة'], d.groups, [70, 70, 260, 90]),
        { text: 'الطلاب غير المسجلين (دورة 2)', style: 'h', margin: [0, 12, 0, 4] },
        d.unreg.length ? T(['الاسم', 'الكود', 'الجروب', 'الدورة', 'النوع'], d.unreg, [220, 80, 60, 140, 60]) : { text: 'لا يوجد غير مسجلين', style: 'ok' }
      ],
      defaultStyle: { font: 'Cairo', fontSize: 9 },
      styles: {
        org: { fontSize: 10, color: '#685764' },
        title: { fontSize: 16, bold: true, color: '#2B1A2B' },
        sub: { fontSize: 8.5, color: '#9C8C99', margin: [0, 2, 0, 6] },
        h: { fontSize: 12, bold: true, color: '#2B1A2B' },
        th: { bold: true, color: '#FFFFFF', fontSize: 8.5 },
        ok: { fontSize: 10, color: '#2A9D72', bold: true }
      }
    };

    const fname = fileStamp('pdf');
    await new Promise((res, rej) => {
      try { pdfMake.createPdf(dd).download(fname, res, rej); } catch (e) { rej(e); }
    });
    return fname;
  }

  /* ─────────── WORD (.docx): docx.js — RTL paragraphs + جداول bidirectional ─────────── */
  async function exportDOCX() {
    await loadLibs('docx');
    const m = libs.docx;
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, ShadingType, HeadingLevel } = m;
    const d = buildExportData();

    const para = (text, opts) => new Paragraph(Object.assign({
      bidirectional: true, alignment: AlignmentType.RIGHT,
      children: [new TextRun(Object.assign({ text: String(text), rightToLeft: true, size: 20, font: 'Cairo' }, (opts && opts.run) || {}))]
    }, opts && opts.para || {}));

    const row = (cells, isHeader) => new TableRow({
      children: cells.map((c) => new TableCell({
        width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
        shading: isHeader ? { type: ShadingType.CLEAR, fill: '2B1A2B' } : undefined,
        children: [new Paragraph({
          bidirectional: true, alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: String(c), rightToLeft: true, size: 18, bold: !!isHeader, color: isHeader ? 'FFFFFF' : undefined, font: 'Cairo' })]
        })]
      }))
    });

    const tbl = (header, rows) => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [row(header, true)].concat(rows.map((r) => row(r, false)))
    });

    const H = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, bidirectional: true, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: t, rightToLeft: true, font: 'Cairo' })] });

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Cairo', size: 20 }, paragraph: { bidirectional: true } } } },
      sections: [{
        properties: { page: { size: { orientation: m.PageOrientation.LANDSCAPE } } },
        children: [
          para('كلية الطب البيطري — جامعة القاهرة · مكتب وكيل الكلية', { run: { size: 18, color: '685764' } }),
          para('لوحة متابعة الإمتياز البيطري', { run: { bold: true, size: 32, color: '2B1A2B' }, para: { spacing: { after: 120 } } }),
          para('تاريخ التقرير: ' + new Date().toLocaleDateString('ar-EG') + ' · العام الجامعي ' + ((window.APP_CONFIG && APP_CONFIG.ACADEMIC_YEAR) || '—'), { run: { size: 16, color: '9C8C99' } }),
          H('الملخص'), tbl(['البيان', 'القيمة'], d.summary),
          H('توزيع التدريب بالدورة الثانية'), tbl(['المجال', 'مسجلون', 'متوقعون', 'غير مسجلين', 'نسبة %'], d.training),
          H('الجروبات ومواقعها الحالية'), tbl(['الجروب', 'القوام', 'الموقع الحالي', 'الحالة'], d.groups),
          H('الطلاب غير المسجلين (دورة 2)'), d.unreg.length ? tbl(['الاسم', 'الكود', 'الجروب', 'الدورة', 'النوع'], d.unreg) : para('لا يوجد غير مسجلين')
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    const fname = fileStamp('docx');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fname;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    return fname;
  }

  /* ─────────── الواجهة: القائمة المنسدلة + مؤشر الدوران + toast ─────────── */
  function menuEl() { return document.getElementById('export-menu'); }
  function btnEl() { return document.getElementById('export-btn'); }

  function toggleMenu(force) {
    const menu = menuEl(), btn = btnEl();
    if (!menu || !btn) return;
    const show = force !== undefined ? force : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !show);
    btn.setAttribute('aria-expanded', String(show));
    // تدوير سهم القائمة عند الفتح/الإغلاق
    const caret = btn.querySelector('.export-caret');
    if (caret) caret.classList.toggle('open', show);
  }

  async function handleExport(fmt) {
    const item = document.querySelector('#export-menu [data-format="' + fmt + '"]');
    if (!item) return;
    if (item.disabled) return;
    item.disabled = true;
    const txt = item.querySelector('.export-txt');
    const orig = txt ? txt.innerHTML : '';
    if (txt) txt.innerHTML = '<b>جارٍ التوليد…</b><small>قد يستغرق ثوانٍ على الملفات الكبيرة</small>';
    toggleMenu(false);
    try {
      let fname;
      if (fmt === 'xlsx') fname = await exportXLSX();
      else if (fmt === 'csv') fname = await exportCSV();
      else if (fmt === 'pdf') fname = await exportPDF();
      else if (fmt === 'docx') fname = await exportDOCX();
      else throw new Error('صيغة غير معروفة');
      toast('تم تنزيل الملف:' + fname);
    } catch (err) {
      console.error(err);
      toast('فشل التصدير: ' + (err && err.message ? err.message : 'خطأ غير متوقع'), 4200);
    } finally {
      item.disabled = false;
      if (txt) txt.innerHTML = orig;
    }
  }

  // المعالج الموحّد في app.js يتكفل بـ data-action — نسجّل إجراءين فقط
  if (typeof registerAction === 'function') {
    registerAction('export-toggle', () => toggleMenu());
    registerAction('export-file', (el) => handleExport(el.dataset.format));
  }

  // إغلاق القائمة بالنقر خارجها أو ESC
  document.addEventListener('click', (e) => {
    const menu = menuEl();
    if (!menu || menu.classList.contains('hidden')) return;
    if (e.target.closest('#export-menu') || e.target.closest('#export-btn')) return;
    toggleMenu(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

  // ── الوضع الداكن/الفاتح (زر الرأس موجود مسبقاً: #theme-toggle[data-action=toggle-theme]) ──
  const THEME_KEY = 'imtiaz_theme';

  function applyTheme(dark, announce) {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('.t-ico-moon').forEach((el) => el.classList.toggle('hidden', dark));
    document.querySelectorAll('.t-ico-sun').forEach((el) => el.classList.toggle('hidden', !dark));
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(dark));
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', dark ? '#14101A' : '#2B1A2B');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (err) {}
    if (announce) { /* صامت: لا ليبل عائم فوق المحتوى عند تبديل الثيم */ }
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (err) {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    applyTheme(dark, false);
    // متابعة تغيّر النظام تلقائياً طالما المستخدم لم يحدّد يدوياً
    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (ev) => {
          let cur = null; try { cur = localStorage.getItem(THEME_KEY); } catch (e2) {}
          if (!cur) applyTheme(ev.matches, false);
        });
      } catch (err) { /* متقدمات لا تدعم addEventListener على matchMedia */ }
    }
  }
  initTheme();

  if (typeof registerAction === 'function') {
    registerAction('toggle-theme', () => applyTheme(!document.documentElement.classList.contains('dark'), true));
  }
})();
