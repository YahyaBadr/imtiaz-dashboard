'use strict';

function renderUnits(container) {
  const byUnit = {};
  DB.assignments.forEach(row => {
    if (row.round_key !== 'units') return;
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
      const sKey = `${gid}_${r.code_short}`;
      studentsWithGroup.add(sKey);
      if (!studentUnitsMap[sKey]) studentUnitsMap[sKey] = [];
      studentUnitsMap[sKey].push(r.unit_name.trim());
    }
  });

  for (const sKey in studentUnitsMap) { if (studentUnitsMap[sKey].length > 1) multiUnitStudents.add(sKey); }

  const uniqueStudentsCount = studentsWithGroup.size;
  const multiUnitCount = multiUnitStudents.size;

  const units = [...DB.stationsUnits].sort((a, b) => (parseInt(b.registered, 10) || 0) - (parseInt(a.registered, 10) || 0));

  // زخرفة اللوتس: أبعادها مضبوطة عبر CSS (svg.title-ornament) — لا !important هنا
  const lotusSvg = `<svg class="title-ornament" viewBox="0 0 24 14" aria-hidden="true"><path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/><path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/><circle cx="3" cy="7" r="2.2" fill="#E3A73C"/><circle cx="21" cy="7" r="2.2" fill="#E3A73C"/></svg>`;

container.innerHTML = `
    <div class="card card-sm" style="margin-bottom: var(--gap); background:#FFFFFF; border-right:4px solid var(--c-gold)">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.4rem">🏥</span>
          <div>
            <div style="font-size:1.15rem; font-weight:700; color:var(--c-plum); display:flex; align-items:center; gap:8px">
              ${lotusSvg}
              <span><span class="num">${units.length}</span> وحدات بيطرية معتمدة (القاهرة والجيزة)</span>
            </div>
            <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">إجمالي الطلاب المسجلين بالوحدات: <strong class="num" style="color:var(--c-plum)">${totalUnitRegistrations}</strong> طالب/ة</div>
          </div>
        </div>
        <div style="font-size:0.86rem; color:var(--c-text-muted); background:var(--c-page-bg); padding:6px 14px; border-radius:var(--radius-badge); border:1px solid var(--c-border);">
          💡 <strong>تفصيل التسجيل:</strong> <span class="num">${totalUnitRegistrations}</span> تسجيل = <span class="num">${uniqueStudentsCount}</span> طالب + <span class="num">${multiUnitCount}</span> طلاب في وحدتين + <span class="num">${noGroupCount}</span> غير موجودين في ملفات الجروبات
        </div>
      </div>
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

  let barHTML = '';
  if (hasCapacity) {
    const pct = Math.min(Math.round((reg / cap) * 100), 100);
    barHTML = `<div class="progress-wrap" style="margin-top:4px"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div><span class="num">${pct}%</span><span class="badge badge-gold" style="font-size:0.7rem">مبدئي</span></div>`;
  }

  return `
    <div class="unit-card">
      <div class="unit-card-header" role="button" tabindex="0" data-action="toggle-unit">
        <div class="unit-card-top">
          <div><div class="unit-name">${esc(unitName)}</div><div class="unit-gov">📍 المحافظة: ${esc(gov)}</div></div>
          <button class="unit-toggle-btn" tabindex="-1" aria-hidden="true">▾</button>
        </div>
        <div class="unit-stats">
          <span class="unit-count-box">👤 المقيدون: <strong class="num">${reg}</strong> ${hasCapacity ? `/ طاقة استيعابية: <span class="num">${cap}</span>` : ''}</span>
          ${females > 0 ? `<span class="unit-count-box gender-f">♀ <strong class="num">${females}</strong></span>` : ''}
          ${males   > 0 ? `<span class="unit-count-box gender-m">♂ <strong class="num">${males}</strong></span>` : ''}
        </div>
        ${barHTML}
      </div>

      <div class="unit-card-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px">
          <span style="font-size:0.84rem; color:var(--c-text-muted)">كشف الطلاب (<strong class="num">${students.length}</strong> طالب/ة — انقر لفتح الملف):</span>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
            ${btn('🖨️ طباعة كشف الوحدة', 'print-unit', { unit: unitName }, 'btn-surface btn-sm')}
            ${btn('📋 نسخ الأسماء والهواتف', 'copy-unit', { unit: unitName }, 'btn-surface btn-sm')}
          </div>
        </div>
        <ul class="unit-student-list" id="${listId}">
          ${students.map(s => {
            const gIcon = s.gender === 'M' ? '<span class="gender-m" title="ذكر">♂</span>' : s.gender === 'F' ? '<span class="gender-f" title="أنثى">♀</span>' : '';
            const grpLabel = s.group_id ? `<span class="cartouche-badge" style="font-size:0.74rem">جروب ${s.group_id}</span>` : `<span style="color:var(--c-rose)">بدون جروب</span>`;
            const issueNote = s.issue ? `<span title="${s.issue}" style="cursor:help; font-size:0.8rem">⚠️</span>` : '';
            const sKey = `${s.group_id}_${s.code_short}`.replace(/\s+/g, '');
            return `<li>${gIcon}<span class="clickable-student-name"${act('student', { sid: sKey })} title="اضغط لفتح الملف الكامل للطالب">${esc(s.full_name || 'غير محدد')}</span><span class="student-code">${s.code_short || '—'}</span>${grpLabel}${issueNote}</li>`;
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
    const fullStudent = DB.studentLookup[`${s.group_id}_${s.code_short}`.replace(/\s+/g, '')] || {};
    return `<tr><td style="text-align:center; padding:6px; border:1px solid #333">${idx + 1}</td><td style="padding:6px; border:1px solid #333"><b>${s.full_name}</b></td><td style="text-align:center; padding:6px; border:1px solid #333">${s.code_short || '—'}</td><td style="text-align:center; padding:6px; border:1px solid #333">جروب ${s.group_id || '—'}</td><td style="text-align:center; padding:6px; border:1px solid #333">${fullStudent.phone || '—'}</td></tr>`;
  }).join('');
  printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف ${unitName}</title><style>body { font-family: 'Cairo', sans-serif; margin: 20mm; direction: rtl; } .sheet-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; } .sheet-logo { max-width: 70px; } .sheet-title { text-align: center; } table { width: 100%; border-collapse: collapse; } th { background: #f0f0f0; border: 1px solid #333; padding: 8px; }</style></head><body><div class="sheet-header"><img src="assets/university_logo.png" class="sheet-logo"><div class="sheet-title"><h1>كلية الطب البيطري — جامعة القاهرة</h1><p>كشف توزيع الدورة الثانية — ${unitName}</p></div><img src="assets/college_logo.png" class="sheet-logo"></div><table><thead><tr><th>م</th><th>اسم الطالب</th><th>الكود</th><th>الجروب</th><th>الهاتف</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload = function() { window.print(); };<\/script></body></html>`);
  printWindow.document.close();
};

window.copyUnitListWithPhones = function(unitName, listId) {
  const students = DB.assignments.filter(a => a.round_key === 'units' && (a.unit_name || '').trim() === unitName.trim());
  const lines = students.map(s => { const full = DB.studentLookup[`${s.group_id}_${s.code_short}`.replace(/\s+/g, '')] || {}; return `${s.full_name}\t${s.code_short}\tجروب ${s.group_id}\t${full.phone || ''}`; });
  navigator.clipboard.writeText(`كشف وحدة: ${unitName} (${lines.length} طالب)\n` + lines.join('\n')).then(() => alert(`تم النسخ ✓`)).catch(() => { openModal(`قائمة طلاب ${unitName}`, `<pre style="white-space:pre-wrap; direction:rtl">${lines.join('\n')}</pre>`); });
};

/* ═══ أزرار صفحة الوحدات — كل الضغطات عبر المعالج الموحّد (data-action) ═══ */
registerAction('toggle-unit', (el) => { const c = el.closest('.unit-card'); if (c) c.classList.toggle('open'); });
registerAction('print-unit', (el) => printUnitSheet(el.dataset.unit || ''));
registerAction('copy-unit', (el) => copyUnitListWithPhones(el.dataset.unit || ''));
