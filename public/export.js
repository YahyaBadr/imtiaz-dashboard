'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   export.js — توليد ملفات حقيقية: Excel / PDF / Word / CSV (client-side)
   مصدر البيانات: window.ExportCore (من window.DB مباشرة — بلا DOM scraping).
   المكتبات vendored في ./vendor وتُحمَّل كسولاً عند أول نقرة فقط.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  const libs = { xlsx: null, pdfmake: null, docx: null };
  let busy = false;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('تعذّر تحميل المكتبة: ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadLibs(fmt) {
    // xlsx-js-style أولاً: يدعم أنماط الخلايا cellStyles/.s (نسخة CE المجانية تتجاهلها).
    // ملاحظة مثبتة باختبار فعلي: هذا الفرع لا يكتب tabColor ولا rightToLeft في XML،
    // لذا ألوان تبويبات الأوراق وRTL على مستوى المصنف تُضاف يدويًا بعد XLSX.write.
    // احتياطي: xlsx.full.min.js إن فشل التحميل (يُعلَّم __XLSX_STYLE_FAILED لتجنّب إعادة المحاولة).
    if (fmt === 'xlsx' && !libs.xlsx) {
      try {
        await loadScript('./vendor/xlsx-js-style.min.js');
        libs.xlsx = window.XLSX;
      } catch (e) {
        window.__XLSX_STYLE_FAILED = true;
        await loadScript('./vendor/xlsx.full.min.js');
        libs.xlsx = window.XLSX;
      }
      if (!window.JSZip) { try { await loadScript('./vendor/jszip.min.js'); } catch (e2) { /* حقن RTL/ألوان التبويبات يصبح اختياريًا */ } }
    }
    if (fmt === 'pdf' && !libs.pdfmake) {
      await loadScript('./vendor/pdfmake.min.js');
      await loadScript('./vendor/vfs_fonts.js');
      libs.pdfmake = window.pdfMake;
    }
    if (fmt === 'docx' && !libs.docx) { await loadScript('./vendor/docx.umd.js'); libs.docx = window.docx; }
  }

  function downloadBlob(blob, fname) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  /* ─────────── EXCEL (.xlsx): xlsx-js-style — أوراق متعددة · RTL · تجميد · رؤوس ملونة · أرقام حقيقية ─────────── */
  async function exportXLSX(scope) {
    await loadLibs('xlsx'); // تحمّل xlsx-js-style أولاً (cellStyles+tabColor) مع احتياطي CE
    const XLSX = libs.xlsx;
    const styled = !window.__XLSX_STYLE_FAILED; // الأنماط تُطبَّق فقط عند توفر النسخة المدعومة
    const sets = window.ExportCore.datasets(scope);

    const wb = XLSX.utils.book_new();
    const sheetProps = [];

    sets.forEach((ds) => {
      const aoa = [ds.header].concat(ds.rows);
      const ws = XLSX.utils.aoa_to_sheet(aoa); // الأرقام تبقى خلايا رقمية (t:'n') تلقائياً

      // البند 7: رأس branded (خلفية هوية + نص أبيض عريض) + حدود خفيفة + صفوف متناوبة — فقط مع النسخة المدعومة
      if (styled) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        const thin = { style: 'thin', color: { rgb: 'D8CFC3' } };
        const borderAll = { top: thin, bottom: thin, left: thin, right: thin };
        for (let c = range.s.c; c <= range.e.c; ++c) {
          const addr = XLSX.utils.encode_cell({ r: 0, c });
          if (ws[addr]) ws[addr].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '2B1A2B' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: borderAll,
          };
        }
        for (let r = 1; r <= range.e.r; ++r) {
          const band = (r % 2 === 0) ? { pattern: 'none' } : { pattern: 'solid', fgColor: { rgb: 'F7F2E8' } };
          for (let c = range.s.c; c <= range.e.c; ++c) {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (ws[addr]) ws[addr].s = { alignment: { horizontal: 'right', vertical: 'center' }, border: borderAll, fill: band };
          }
        }
      }

      // عروض أعمدة معقولة (حسب أطول قيمة؛ العربي ≈ حرفان للوحدة)
      ws['!cols'] = ds.header.map((h, ci) => {
        let w = String(h).length * 2;
        ds.rows.slice(0, 300).forEach((row) => { const l = String(row[ci] == null ? '' : row[ci]).length * 1.9; if (l > w) w = l; });
        return { wch: Math.min(Math.max(Math.round(w) + 2, 10), 44) };
      });

      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(wb, ws, ds.name.slice(0, 31));
      const prop = { Hidden: 0, RTL: true };
      if (styled) prop.tabColor = { rgb: ds.tone || '6B4C7A' };
      sheetProps.push(prop);
    });

    wb.Workbook = { Sheets: sheetProps };

    const fname = window.ExportCore.fileStamp(scope, 'xlsx');
    // cellStyles:true مطلوب في SheetJS لتفعيل كائنات .s الخاصة بالأنماط عند الكتابة
    let out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: styled });
    if (styled) {
      // ملاحظة مثبتة باختبار فعلي على xlsx-js-style 1.2.0: الكتابة تتجاهل tabColor وRTL،
      // لذا نحقنها يدويًا في XML داخل الـ zip الناتج (تعديل نصي آمن على ملفين فقط).
      try { out = await patchXlsxRtlTabs(out, sheetProps); } catch (e) { /* الملف يخرج بلا ألوان تبويبات — لا يفشل التصدير */ }
    }
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
    return fname;
  }

  /* حقن rightToLeft + tabColor في XML بعد كتابة SheetJS (فرع xlsx-js-style لا يكتبهما).
     JSZip 3.x: loadAsync للقراءة وgenerateAsync للكتابة — واجهة الـ constructor المباشرة محذوفة منذ 3.0. */
  async function patchXlsxRtlTabs(buf, sheetProps) {
    if (!window.JSZip) return buf;
    const zip = await window.JSZip.loadAsync(buf);
    const wbFile = zip.file('xl/workbook.xml');
    if (!wbFile) return buf;
    let wbx = await wbFile.async('string');
    // 1) ألوان التبويبات: <sheet .../> → <sheet ...><tabColor rgb="FF.."/></sheet>
    let i = -1;
    wbx = wbx.replace(/<sheet\b[^>]*?(\/?)>/g, (m) => {
      i++;
      const p = sheetProps[i];
      if (!p || !p.tabColor) return m;
      const color = '<tabColor rgb="FF' + p.tabColor.rgb + '"/>';
      if (m.endsWith('/>')) return m.slice(0, -2) + '>' + color + '</sheet>';
      return m + color; // وسم مفتوح يتبعه إغلاق لاحق
    });
    zip.file('xl/workbook.xml', wbx);
    // 2) RTL + تجميد الصف الأول لكل ورقة: حقن rightToLeft="1" و<pane .../> في <sheetView>
    //    (xlsx-js-style 1.2.0 لا يكتب !freeze إطلاقاً — محقَّن يدويًا هنا، والنتيجة موثقة باختبار فعلي)
    const jobs = [];
    zip.forEach((path, entry) => {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) {
        jobs.push(entry.async('string').then((s) => {
          s = s.replace(/<sheetView\b([^>]*?)\/>/g, (m0, attrs) => {   // وسم ذاتي الإغلاق فقط
            const open = `<sheetView${/rightToLeft/.test(attrs) ? attrs : attrs + ' rightToLeft="1"'}`;
            return `${open}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView>`;
          });
          zip.file(path, s);
        }));
      }
    });
    await Promise.all(jobs);
    const ab = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    return new Uint8Array(ab);
  }

  /* ─────────── CSV (.csv): UTF-8 BOM — ملف واحد بأقسام واضحة ─────────── */
  async function exportCSV(scope) {
    const sets = window.ExportCore.datasets(scope);
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    let out = '\uFEFF';
    sets.forEach((ds) => {
      out += ds.name + '\r\n';
      out += ds.header.map(esc).join(',') + '\r\n';
      ds.rows.forEach((r) => { out += r.map(esc).join(',') + '\r\n'; });
      out += '\r\n';
    });
    const fname = window.ExportCore.fileStamp(scope, 'csv');
    downloadBlob(new Blob([out], { type: 'text/csv;charset=utf-8;' }), fname);
    return fname;
  }

  /* ─────────── PDF (.pdf): pdfmake — خط Cairo مضمّن + RTL + ترويسة branded ─────────── */
  async function exportPDF(scope) {
    await loadLibs('pdf');
    const pdfMake = libs.pdfmake;
    const assets = window.__IMTIAZ_EXPORT_ASSETS;
    if (!assets || !assets.Cairo400) throw new Error('أصول التصدير (export-assets.js) غير محمّلة');

    pdfMake.vfs = Object.assign({}, pdfMake.vfs || {});
    pdfMake.vfs['Cairo-Regular.ttf'] = assets.Cairo400;
    pdfMake.vfs['Cairo-Bold.ttf'] = assets.Cairo700 || assets.Cairo400;
    pdfMake.fonts = { Cairo: { normal: 'Cairo-Regular.ttf', bold: 'Cairo-Bold.ttf', italics: 'Cairo-Regular.ttf', bolditalics: 'Cairo-Regular.ttf' } };

    const sets = window.ExportCore.datasets(scope);
    const logo = assets.collegeLogo || assets.universityLogo || null;

    const tableOf = (ds) => ({
      table: {
        headerRows: 1, widths: ds.header.map(() => '*'),
        body: [ds.header.map((h) => ({ text: h, style: 'th', alignment: 'right' }))]
          .concat(ds.rows.map((r) => r.map((c) => ({ text: String(c == null ? '' : c), alignment: 'right' }))))
      },
      layout: {
        fillColor: (i) => (i === 0 ? '#2B1A2B' : (i % 2 ? '#FAF2E2' : '#FFFFFF')),
        hLineColor: '#E6DEC8', vLineColor: '#E6DEC8', hLineWidth: () => 0.5, vLineWidth: () => 0.5
      },
      fontSize: 8
    });

    const blocks = [];
    sets.forEach((ds, si) => {
      if (si > 0) blocks.push({ text: '', pageBreak: 'before' }); // البند 7: كل مجموعة بيانات في صفحة مستقلة — جداول أنيق بلا تقطيع فوضوي
      blocks.push({ text: ds.name, style: 'h', margin: [0, 12, 0, 4] });
      blocks.push(tableOf(ds));
    });

    const head = [
      { text: 'كلية الطب البيطري — جامعة القاهرة', style: 'org', alignment: 'right' },
      { text: 'لوحة متابعة الإمتياز البيطري', style: 'title', alignment: 'right' },
      { text: 'مكتب السيد الأستاذ الدكتور وكيل الكلية · العام الجامعي ' + ((window.APP_CONFIG && APP_CONFIG.ACADEMIC_YEAR) || '—') + ' · تاريخ التوليد: ' + new Date().toLocaleDateString('ar-EG'), style: 'sub', alignment: 'right' }
    ];

    const dd = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [24, 46, 24, 44],
      info: { title: 'لوحة متابعة الإمتياز البيطري', subject: scope === 'full' ? 'الملف الشامل' : 'تصدير الصفحة الحالية' },
      content: [
        logo
          ? { columns: [{ image: 'data:image/png;base64,' + logo, width: 52, margin: [0, 0, 10, 0] }, head] }
          : head,
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 780, y2: 6, lineWidth: 1.5, lineColor: '#C9A227' }], margin: [0, 6, 0, 2] },
        blocks
      ],
      footer: (page, total) => ({ text: 'صفحة ' + page + ' من ' + total + ' · مكتب السيد الأستاذ الدكتور وكيل الكلية', style: 'foot', alignment: 'center', margin: [0, 6, 0, 0] }),
      defaultStyle: { font: 'Cairo', fontSize: 9 },
      styles: {
        org: { fontSize: 10, color: '#685764' },
        title: { fontSize: 17, bold: true, color: '#2B1A2B' },
        sub: { fontSize: 8.5, color: '#9C8C99', margin: [0, 2, 0, 0] },
        h: { fontSize: 12, bold: true, color: '#2B1A2B' },
        th: { bold: true, color: '#FFFFFF', fontSize: 8 },
        foot: { fontSize: 7.5, color: '#9C8C99' }
      }
    };

    const fname = window.ExportCore.fileStamp(scope, 'pdf');
    await new Promise((res, rej) => {
      try { pdfMake.createPdf(dd).download(fname, res, rej); } catch (e) { rej(e); }
    });
    return fname;
  }

  /* ─────────── WORD (.docx): docx.js — فقرات وجداول RTL bidirectional ─────────── */
  async function exportDOCX(scope) {
    await loadLibs('docx');
    const m = libs.docx;
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, ShadingType, HeadingLevel, BorderStyle } = m;
    const sets = window.ExportCore.datasets(scope);

    const para = (text, runOpts, paraOpts) => new Paragraph(Object.assign({
      bidirectional: true, alignment: AlignmentType.RIGHT
    }, paraOpts || {}, {
      children: [new TextRun(Object.assign({ text: String(text), rightToLeft: true, size: 20, font: 'Cairo' }, runOpts || {}))]
    }));

    const cell = (txt, isHeader, band) => new TableCell({
      // البند 7: رأس بلون الهوية + صفوف متناوبة اللون (بيج فاتح على الصفوف الفردية)
      shading: isHeader ? { type: ShadingType.CLEAR, fill: '2B1A2B' } : (band ? { type: ShadingType.CLEAR, fill: 'FAF2E2' } : undefined),
      margins: { top: 40, bottom: 40 },
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E6DEC8' }, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E6DEC8' }, left: { style: BorderStyle.SINGLE, size: 2, color: 'E6DEC8' }, right: { style: BorderStyle.SINGLE, size: 2, color: 'E6DEC8' } },
      children: [new Paragraph({
        bidirectional: true, alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: String(txt == null ? '' : txt), rightToLeft: true, size: 17, bold: !!isHeader, color: isHeader ? 'FFFFFF' : undefined, font: 'Cairo' })]
      })]
    });

    const tbl = (header, rows) => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ tableHeader: true, children: header.map((h) => cell(h, true)) })]
        .concat(rows.map((r, ri) => new TableRow({ children: r.map((c) => cell(c, false, ri % 2 === 1)) })))
    });

    const children = [
      para('كلية الطب البيطري — جامعة القاهرة · مكتب السيد الأستاذ الدكتور وكيل الكلية', { size: 18, color: '685764' }),
      para('لوحة متابعة الإمتياز البيطري', { bold: true, size: 32, color: '2B1A2B' }, { spacing: { after: 80 } }),
      para('نطاق التقرير: ' + (scope === 'full' ? 'الملف الشامل (كل البيانات)' : 'الصفحة الحالية') + ' · تاريخ التوليد: ' + new Date().toLocaleDateString('ar-EG') + ' · العام الجامعي ' + ((window.APP_CONFIG && APP_CONFIG.ACADEMIC_YEAR) || '—'), { size: 16, color: '9C8C99' }, { spacing: { after: 200 } })
    ];
    sets.forEach((ds) => {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: ds.name, rightToLeft: true, font: 'Cairo', color: '2B1A2B' })] }));
      children.push(tbl(ds.header, ds.rows));
    });
    children.push(para('— نهاية التقرير · مكتب السيد الأستاذ الدكتور وكيل الكلية —', { size: 16, color: '9C8C99' }, { spacing: { before: 240 } }));

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Cairo', size: 20 }, paragraph: { bidirectional: true } } } },
      sections: [{ properties: { page: { size: { orientation: m.PageOrientation.LANDSCAPE } } }, children }]
    });

    const fname = window.ExportCore.fileStamp(scope, 'docx');
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, fname);
    return fname;
  }

  /* ─────────── الواجهة: قائمة النطاق × الصيغة + حالة الزر ─────────── */
  function menuEl() { return document.getElementById('export-menu'); }
  function btnEl() { return document.getElementById('export-btn'); }

  // النطاق المحدد في القائمة (افتراضي: الصفحة الحالية)
  let chosenScope = 'page';
  function setScope(el) {
    chosenScope = el.dataset.scope === 'full' ? 'full' : 'page';
    const menu = menuEl(); if (!menu) return;
    menu.querySelectorAll('.export-scope').forEach((b) => {
      const on = b === el;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  function toggleMenu(force) {
    const menu = menuEl(), btn = btnEl();
    if (!menu || !btn) return;
    const show = force !== undefined ? force : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !show);
    btn.setAttribute('aria-expanded', String(show));
    const caret = btn.querySelector('.export-caret');
    if (caret) caret.classList.toggle('open', show);
    if (show) {
      const first = menu.querySelector('.export-item:not([disabled])');
      if (first) try { first.focus(); } catch (e) {}
    }
  }

  function setBusy(on) {
    busy = on;
    const btn = btnEl();
    if (btn) {
      btn.disabled = on;
      btn.classList.toggle('spinning', on);
      btn.setAttribute('aria-busy', String(on));
    }
    const menu = menuEl();
    if (menu) menu.querySelectorAll('.export-item').forEach((it) => { it.disabled = on; });
  }

  async function handleExport(el) {
    if (busy) return;
    const fmt = el.dataset.format, scope = chosenScope || 'page';
    if (!fmt) return;
    setBusy(true);
    const txt = el.querySelector('.export-txt');
    const orig = txt ? txt.innerHTML : '';
    if (txt) txt.innerHTML = '<b>جارٍ التوليد…</b><small>لا تغلق الصفحة</small>';
    toggleMenu(false);
    try {
      let fname;
      if (fmt === 'xlsx') fname = await exportXLSX(scope);
      else if (fmt === 'csv') fname = await exportCSV(scope);
      else if (fmt === 'pdf') fname = await exportPDF(scope);
      else if (fmt === 'docx') fname = await exportDOCX(scope);
      else throw new Error('صيغة غير معروفة: ' + fmt);
      toast('تم تنزيل الملف: ' + fname);
    } catch (err) {
      toast('فشل التصدير: ' + (err && err.message ? err.message : 'خطأ غير متوقع'), 5200);
    } finally {
      setBusy(false);
      if (txt) txt.innerHTML = orig;
    }
  }

  if (typeof registerAction === 'function') {
    registerAction('export-toggle', () => toggleMenu());
    registerAction('export-file', (el) => handleExport(el));
    registerAction('export-scope', (el) => setScope(el));
  }

  document.addEventListener('click', (e) => {
    const menu = menuEl();
    if (!menu || menu.classList.contains('hidden')) return;
    if (e.target.closest('#export-menu') || e.target.closest('#export-btn')) return;
    toggleMenu(false);
  });

  // تنقل الكيبورد داخل القائمة (عناصر القائمة كلها أزرار native: Tab + Enter/Space + أسهم)
  document.addEventListener('keydown', (e) => {
    const menu = menuEl();
    if (!menu || menu.classList.contains('hidden')) return;
    if (e.key === 'Escape') { toggleMenu(false); const b = btnEl(); if (b) b.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.prototype.slice.call(menu.querySelectorAll('.export-item, .export-scope'));
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
    items[next].focus();
  });

  /* ── الوضع الداكن/الفاتح (زر الرأس: #theme-toggle[data-action=toggle-theme]) ── */
  const THEME_KEY = 'imtiaz_theme';

  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('.t-ico-moon').forEach((el) => el.classList.toggle('hidden', dark));
    document.querySelectorAll('.t-ico-sun').forEach((el) => el.classList.toggle('hidden', !dark));
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(dark));
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', dark ? '#14101A' : '#2B1A2B');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (err) {}
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (err) {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved ? saved === 'dark' : prefersDark);
    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (ev) => {
          let cur = null; try { cur = localStorage.getItem(THEME_KEY); } catch (e2) {}
          if (!cur) applyTheme(ev.matches);
        });
      } catch (err) { /* متصفحات قديمة */ }
    }
  }
  initTheme();

  if (typeof registerAction === 'function') {
    registerAction('toggle-theme', () => applyTheme(!document.documentElement.classList.contains('dark')));
  }
})();
