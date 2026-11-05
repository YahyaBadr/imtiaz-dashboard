'use strict';

function renderUnits(container) {
  // بند2(ج): المصدر الآن getUnitAssignments() — يتعرف على صفوف تسجيل الوحدة بعدة علامات
  // ويحمي من التصفير الصامت حين تكون بيانات الشيت موجودة (كان الفلتر الحرفي round_key==='units' ينكسر).
  const byUnit = {};
  (window.getUnitAssignments ? getUnitAssignments() : (DB.assignments || []).filter(r => r.round_key === 'units')).forEach(row => {
    const unitName = (row.unit_name || '').trim();
    if (!unitName) return;
    if (!byUnit[unitName]) byUnit[unitName] = [];
    byUnit[unitName].push(row);
  });

  const totalUnitRegistrations = Object.values(byUnit).reduce((acc, list) => acc + list.length, 0);
  const studentsWithGroup = new Set();
  const multiUnitStudents = new Set();
  const studentUnitsMap = {};
  let noGroupCount = 0;

  Object.values(byUnit).flat().forEach(r => {
    const gid = (r.group_id || '').trim();
    if (!gid || gid === '0') { noGroupCount++; } else {
      // البند أ: مفتاح التجميع عبر فهرس الهوية الموحد — الصفوف غير المحلولة تحصل على مفتاح خام خاص بها
      const st = resolveStudent(r);
      const sKey = st ? studentKey(st) : `raw:${gid}:${String(r.code_short || r.student_code || r.full_name || '').trim()}`;
      studentsWithGroup.add(sKey);
      if (!studentUnitsMap[sKey]) studentUnitsMap[sKey] = [];
      studentUnitsMap[sKey].push(r.unit_name.trim());
    }
  });

  for (const sKey in studentUnitsMap) { if (studentUnitsMap[sKey].length > 1) multiUnitStudents.add(sKey); }

  const uniqueStudentsCount = studentsWithGroup.size;
  const multiUnitCount = multiUnitStudents.size;

  const units = [...DB.stationsUnits].sort((a, b) => (parseInt(b.registered, 10) || 0) - (parseInt(a.registered, 10) || 0));

  // حارس التصفير: لو كشف الأفراد فاضي بينما شيت الوحدات نفسه يعلن مسجلين → نعرض أرقام الشيت مع تنبيه، مش صفر صامت
  const sheetTotal = units.reduce((acc, u) => acc + (parseInt(u.registered, 10) || 0), 0);
  const sheetOnly = totalUnitRegistrations === 0 && sheetTotal > 0;
  const shownTotal = sheetOnly ? sheetTotal : totalUnitRegistrations;
  const sheetOnlyNote = sheetOnly
    ? `<div class="alert-item alert-amber static" style="margin-top:10px"><span class="alert-icon">${ico('warning')}</span><div>الأرقام مأخوذة من شيت الوحدات (<strong class="num">${sheetTotal}</strong> مسجل/ة)، وكشف الأسماء غير متاح لأن صفوف التسجيلات لا تحمل اسم الوحدة/الراوند بصيغة مفهومة — راجع أعمدة شيت التسجيلات.</div></div>`
    : '';

  // زخرفة اللوتس: أبعادها مضبوطة عبر CSS (svg.title-ornament) — لا !important هنا
  const lotusSvg = `<svg class="title-ornament" viewBox="0 0 24 14" aria-hidden="true"><path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/><path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/><circle cx="3" cy="7" r="2.2" fill="#E3A73C"/><circle cx="21" cy="7" r="2.2" fill="#E3A73C"/></svg>`;

container.innerHTML = `
    <div class="card card-sm units-intro-card" style="margin-bottom: var(--gap); border-right:4px solid var(--c-gold)">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.4rem">${ico('hospital')}</span>
          <div>
            <div style="font-size:1.15rem; font-weight:700; color:var(--c-heading); display:flex; align-items:center; gap:8px">
              ${lotusSvg}
              <span><span class="num">${units.length}</span> وحدات بيطرية معتمدة (القاهرة والجيزة)</span>
            </div>
            <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">إجمالي الطلاب المسجلين بالوحدات: <strong class="num" style="color:var(--c-heading)">${shownTotal}</strong> طالب/ة</div>
          </div>
        </div>
        <div style="font-size:0.86rem; color:var(--c-text-muted); background:var(--c-page-bg); padding:6px 14px; border-radius:var(--radius-badge); border:1px solid var(--c-border);">
          <strong>تفصيل التسجيل:</strong> <span class="num">${totalUnitRegistrations}</span> تسجيل = <span class="num">${uniqueStudentsCount}</span> طالب + <span class="num">${multiUnitCount}</span> طلاب في وحدتين + <span class="num">${noGroupCount}</span> غير موجودين في ملفات الجروبات
        </div>
      </div>
      ${sheetOnlyNote}
    </div>

    <div class="units-grid" id="units-grid">
      ${units.map(u => buildUnitCard(u, byUnit)).join('')}
    </div>
  `;

  VERIFY.add('إجمالي تسجيلات الوحدات (البانر)', totalUnitRegistrations, () => {
    let sum = 0; document.querySelectorAll('.unit-student-list').forEach(l => { sum += l.querySelectorAll('li').length; }); return sum;
  });
}

function buildUnitCard(u, byUnit) {
  const unitName  = (u.unit_name || '').trim(); const gov = (u.governorate || '').trim() || 'غير محدد';
  const cap = parseInt(u.capacity, 10); const reg = parseInt(u.registered, 10) || 0;
  const males = parseInt(u.males, 10) || 0; const females = parseInt(u.females, 10) || 0;
  const hasCapacity = !isNaN(cap) && cap > 0; const listId = 'unit-list-' + slugify(unitName);
  const students = byUnit[unitName] || [];

  let occHTML = '';
  let occClass = 'occ-low';
  if (hasCapacity) {
    const pct = Math.min(Math.round((reg / cap) * 100), 100);
    occClass = pct >= 90 ? 'occ-high' : (pct >= 60 ? 'occ-mid' : 'occ-low');
    occHTML = `
      <div class="unit-occupancy">
        <div class="unit-occ-bar"><div class="unit-occ-fill ${occClass}" style="width:${pct}%"></div></div>
        <div class="unit-occ-text"><span>${pct}% إشغال</span><span>${reg} من ${cap}</span></div>
      </div>`;
  }

  return `
    <div class="unit-card-gradient" role="button" tabindex="0" data-action="toggle-unit">
      <div class="unit-card-header" style="padding:0; border-bottom:none; cursor:pointer; display:flex; flex-direction:column; gap:0;">
        <div class="unit-card-top" style="padding:16px 20px; border-bottom:1px solid var(--c-surface); display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div class="unit-name" style="font-weight:700; font-size:1.05rem; color:var(--c-heading); line-height:1.3; margin-bottom:2px;">${esc(unitName)}</div>
            <div class="unit-gov" style="font-size:0.82rem; color:var(--c-text-muted); margin-top:0;">${ico('map-pin')} ${esc(gov)}</div>
          </div>
          <button class="unit-toggle-btn" tabindex="-1" aria-hidden="true" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:var(--c-text-subtle); line-height:1; transform:rotate(0deg); transition:transform 0.2s ease, color 0.2s ease;">▾</button>
        </div>
        <div style="padding:12px 20px; display:flex; gap:14px; align-items:center; flex-wrap:wrap; border-bottom:1px solid var(--c-surface);">
          <span class="unit-count-box" style="font-size:0.84rem; color:var(--c-text-muted); display:flex; align-items:center; gap:4px;">
            ${ico('user')} <strong class="num">${reg}</strong> مقيد${hasCapacity ? ` / <span class="num">${cap}</span> طاقة` : ''}
          </span>
          ${females > 0 ? `<span class="unit-count-box gender-f">${ico('female')} <strong class="num">${females}</strong></span>` : ''}
          ${males   > 0 ? `<span class="unit-count-box gender-m">${ico('male')} <strong class="num">${males}</strong></span>` : ''}
        </div>
        ${occHTML}
      </div>

      <div class="unit-card-body" style="padding:16px 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px">
          <span style="font-size:0.84rem; color:var(--c-text-muted)">كشف الطلاب (<strong class="num">${students.length}</strong> طالب/ة — انقر لفتح الملف):</span>
          <div class="unit-actions">
            <button type="button" class="btn-icon" data-action="print-unit" data-unit="${esc(unitName)}" title="طباعة كشف الوحدة">${ico('print')}</button>
            <button type="button" class="btn-icon" data-action="copy-unit" data-unit="${esc(unitName)}" title="نسخ الأسماء والهواتف">${ico('copy')}</button>
          </div>
        </div>
        <ul class="unit-student-list" id="${listId}">
          ${students.map(s => {
            const gIcon = s.gender === 'M' ? `<span class="gender-m" title="ذكر">${ico('male')}</span>` : s.gender === 'F' ? `<span class="gender-f" title="أنثى">${ico('female')}</span>` : '';
            const grpLabel = s.group_id ? `<span class="cartouche-badge" style="font-size:0.74rem">جروب ${s.group_id}</span>` : `<span style="color:var(--c-rose)">بدون جروب</span>`;
            const issueNote = s.issue ? `<span title="${s.issue}" style="cursor:help; font-size:0.8rem">${ico('warning')}</span>` : '';
            const person = resolveStudent(s);
            // البند أ: الصف غير المحلول يبقى قابلاً للضغط — كارت «بيانات الطالب» من الصف الخام بدل نقطة ميتة
            const attrs = person ? act('student', { sid: studentKey(person) }) : rawAttrs(s);
            return `<li>${gIcon}<span class="clickable-student-name"${attrs} title="اضغط لفتح الملف الكامل للطالب">${esc(s.full_name || 'غير محدد')}</span><span class="student-code">${s.code_short || '—'}</span>${grpLabel}${issueNote}</li>`;
          }).join('')}
        </ul>
      </div>
    </div>`;
}

function slugify(str) { return (str || '').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').replace(/-+/g, '-'); }

window.printUnitSheet = function(unitName) {
  const students = DB.assignments.filter(a => a.round_key === 'units' && (a.unit_name || '').trim() === unitName.trim());
  const uInfo = DB.stationsUnits.find(u => u.unit_name.trim() === unitName.trim()) || {};
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('يرجى السماح بالنوافذ المنبثقة');
  const rowsHtml = students.map((s, idx) => {
    const fullStudent = resolveStudent(s) || {};
    return `<tr><td style="text-align:center; padding:6px; border:1px solid #333">${idx + 1}</td><td style="padding:6px; border:1px solid #333"><b>${s.full_name}</b></td><td style="text-align:center; padding:6px; border:1px solid #333">${s.code_short || '—'}</td><td style="text-align:center; padding:6px; border:1px solid #333">جروب ${s.group_id || '—'}</td><td style="text-align:center; padding:6px; border:1px solid #333">${fullStudent.phone || '—'}</td></tr>`;
  }).join('');
  printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف ${unitName}</title><style>body { font-family: 'Cairo', sans-serif; margin: 20mm; direction: rtl; } .sheet-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; } .sheet-logo { max-width: 70px; } .sheet-title { text-align: center; } table { width: 100%; border-collapse: collapse; } th { background: #f0f0f0; border: 1px solid #333; padding: 8px; }</style></head><body><div class="sheet-header"><img src="assets/university_logo.png" class="sheet-logo"><div class="sheet-title"><h1>كلية الطب البيطري — جامعة القاهرة</h1><p>كشف توزيع الدورة الثانية — ${unitName}</p></div><img src="assets/college_logo.png" class="sheet-logo"></div><table><thead><tr><th>م</th><th>اسم الطالب</th><th>الكود</th><th>الجروب</th><th>الهاتف</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload = function() { window.print(); };<\/script></body></html>`);
  printWindow.document.close();
};

window.copyUnitListWithPhones = function(unitName, listId) {
  const students = DB.assignments.filter(a => a.round_key === 'units' && (a.unit_name || '').trim() === unitName.trim());
  const lines = students.map(s => { const full = resolveStudent(s) || {}; return `${s.full_name}\t${s.code_short}\tجروب ${s.group_id}\t${full.phone || ''}`; });
  navigator.clipboard.writeText(`كشف وحدة: ${unitName} (${lines.length} طالب)\n` + lines.join('\n')).then(() => alert(`تم النسخ ${ico("check")}`)).catch(() => { openModal(`قائمة طلاب ${unitName}`, `<pre style="white-space:pre-wrap; direction:rtl">${lines.join('\n')}</pre>`); });
};

/* ═══ أزرار صفحة الوحدات — كل الضغطات عبر المعالج الموحّد (data-action) ═══ */
registerAction('toggle-unit', (el) => { const c = el.closest('.unit-card-gradient'); if (c) c.classList.toggle('open'); });
registerAction('print-unit', (el) => printUnitSheet(el.dataset.unit || ''));
registerAction('copy-unit', (el) => copyUnitListWithPhones(el.dataset.unit || ''));
