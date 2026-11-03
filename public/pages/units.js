'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   pages/units.js — الوحدات البيطرية (Pharaonic Plum & Unit Sheet Printing)
   ═══════════════════════════════════════════════════════════════════════════ */

function renderUnits(container) {
  // ── 1. Map de-duplicated students to units ─────────────────────────────────
  const byUnit = {};
  DB.assignments.forEach(row => {
    if (row.round_key !== 'units') return;
    const unitName = (row.unit_name || '').trim();
    if (!unitName) return;
    if (!byUnit[unitName]) byUnit[unitName] = [];
    byUnit[unitName].push(row);
  });

  // ── 2. Dynamic Computation for Summary Note ───────────────────────────────
  const totalUnitRegistrations = Object.values(byUnit).reduce((acc, list) => acc + list.length, 0);

  const studentsWithGroup = new Set();
  const multiUnitStudents = new Set();
  const studentUnitsMap = {};
  let noGroupCount = 0;

  Object.values(byUnit).flat().forEach(r => {
    const gid = (r.group_id || '').trim();
    if (!gid || gid === '0') {
      noGroupCount++;
    } else {
      const sKey = `${gid}_${r.code_short}`;
      studentsWithGroup.add(sKey);
      if (!studentUnitsMap[sKey]) studentUnitsMap[sKey] = [];
      studentUnitsMap[sKey].push(r.unit_name.trim());
    }
  });

  for (const sKey in studentUnitsMap) {
    if (studentUnitsMap[sKey].length > 1) {
      multiUnitStudents.add(sKey);
    }
  }

  const uniqueStudentsCount = studentsWithGroup.size;
  const multiUnitCount = multiUnitStudents.size;

  // ── 3. Units Ordered by Registered Count Desc ──────────────────────────────
  const units = [...DB.stationsUnits].sort((a, b) => {
    return (parseInt(b.registered, 10) || 0) - (parseInt(a.registered, 10) || 0);
  });

  const lotusSvg = `
    <svg class="title-ornament" viewBox="0 0 24 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/>
      <path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/>
      <circle cx="3" cy="7" r="2.2" fill="#E3A73C"/>
      <circle cx="21" cy="7" r="2.2" fill="#E3A73C"/>
    </svg>`;

  container.innerHTML = `
    <!-- Top Summary Banner -->
    <div class="card card-sm" style="margin-bottom: var(--gap); background:#FFFFFF; border-right:4px solid var(--c-gold)">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.4rem">🏥</span>
          <div>
            <div style="font-size:1.15rem; font-weight:700; color:var(--c-plum); display:flex; align-items:center; gap:8px">
              ${lotusSvg}
              <span><span class="num">${units.length}</span> وحدات بيطرية معتمدة (القاهرة والجيزة)</span>
            </div>
            <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">
              إجمالي الطلاب المسجلين بالوحدات: <strong class="num" style="color:var(--c-plum)">${totalUnitRegistrations}</strong> طالب/ة
            </div>
          </div>
        </div>

        <!-- Dynamic Note Calculation -->
        <div style="font-size:0.86rem; color:var(--c-text-muted); background:var(--c-page-bg); padding:6px 14px; border-radius:var(--radius-badge); border:1px solid var(--c-border);">
          💡 <strong>تفصيل التسجيل:</strong>
          <span class="num">${totalUnitRegistrations}</span> تسجيل =
          <span class="num">${uniqueStudentsCount}</span> طالب +
          <span class="num">${multiUnitCount}</span> ${multiUnitCount === 2 ? 'طالبان مسجلان' : 'طلاب مسجلين'} في وحدتين +
          <span class="num">${noGroupCount}</span> ${noGroupCount === 1 ? 'طالبة غير موجودة' : 'طلاب غير موجودين'} في ملفات الجروبات
        </div>
      </div>
    </div>

    <!-- Units Grid -->
    <div class="units-grid" id="units-grid">
      ${units.map(u => buildUnitCard(u, byUnit)).join('')}
    </div>
  `;

  // Accordion toggle
  container.querySelectorAll('.unit-card-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.unit-card');
      card.classList.toggle('open');
    });
  });

  // ── Automated Verifications ──────────────────────────────────────────────
  VERIFY.add(
    'إجمالي تسجيلات الوحدات (البانر)',
    totalUnitRegistrations,
    () => {
      let sum = 0;
      document.querySelectorAll('.unit-student-list').forEach(l => {
        sum += l.querySelectorAll('li').length;
      });
      return sum;
    }
  );

  units.forEach(u => {
    const uName = (u.unit_name || '').trim();
    const cardReg = parseInt(u.registered, 10) || 0;
    const listId = 'unit-list-' + slugify(uName);

    VERIFY.add(
      `وحدة "${uName}" — عدد المسجلين`,
      cardReg,
      () => {
        const list = document.getElementById(listId);
        return list ? list.querySelectorAll('li').length : 0;
      }
    );
  });
}

function buildUnitCard(u, byUnit) {
  const unitName  = (u.unit_name || '').trim();
  const gov       = (u.governorate || '').trim() || 'غير محدد';
  const cap       = parseInt(u.capacity, 10);
  const reg       = parseInt(u.registered, 10) || 0;
  const males     = parseInt(u.males, 10)   || 0;
  const females   = parseInt(u.females, 10) || 0;
  const hasCapacity = !isNaN(cap) && cap > 0;
  const listId    = 'unit-list-' + slugify(unitName);

  const students  = byUnit[unitName] || [];

  // Capacity bar only if capacity exists
  let barHTML = '';
  if (hasCapacity) {
    const pct = Math.min(Math.round((reg / cap) * 100), 100);
    barHTML = `
      <div class="progress-wrap" style="margin-top:4px">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="num">${pct}%</span>
        <span class="badge badge-gold" style="font-size:0.7rem">مبدئي</span>
      </div>`;
  }

  return `
    <div class="unit-card">
      <div class="unit-card-header" role="button" tabindex="0">
        <div class="unit-card-top">
          <div>
            <div class="unit-name">${unitName}</div>
            <div class="unit-gov">📍 المحافظة: ${gov}</div>
          </div>
          <button class="unit-toggle-btn" tabindex="-1" aria-hidden="true">▾</button>
        </div>

        <div class="unit-stats">
          <span class="unit-count-box">
            👤 المقيدون: <strong class="num">${reg}</strong>
            ${hasCapacity ? `/ طاقة استيعابية: <span class="num">${cap}</span>` : ''}
          </span>
          ${females > 0 ? `<span class="unit-count-box gender-f">♀ <strong class="num">${females}</strong></span>` : ''}
          ${males   > 0 ? `<span class="unit-count-box gender-m">♂ <strong class="num">${males}</strong></span>` : ''}
        </div>

        ${barHTML}
      </div>

      <div class="unit-card-body">
        <!-- Actions Toolbar -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px">
          <span style="font-size:0.84rem; color:var(--c-text-muted)">
            كشف الطلاب (<strong class="num">${students.length}</strong> طالب/ة — انقر لفتح الملف):
          </span>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
            <button class="btn btn-surface btn-sm" onclick="printUnitSheet('${escapeAttr(unitName)}')">
              🖨️ طباعة كشف الوحدة
            </button>
            <button class="btn btn-surface btn-sm" onclick="copyUnitListWithPhones('${escapeAttr(unitName)}', '${listId}')">
              📋 نسخ الأسماء والهواتف
            </button>
          </div>
        </div>

        <ul class="unit-student-list" id="${listId}">
          ${students.map(s => {
            const gIcon = s.gender === 'M' ? '<span class="gender-m" title="ذكر">♂</span>'
                        : s.gender === 'F' ? '<span class="gender-f" title="أنثى">♀</span>'
                        : '';
            const grpLabel = s.group_id ? `<span class="cartouche-badge" style="font-size:0.74rem">جروب ${s.group_id}</span>` : `<span style="color:var(--c-rose)">بدون جروب</span>`;
            const issueNote = s.issue ? `<span title="${s.issue}" style="cursor:help; font-size:0.8rem">⚠️</span>` : '';
            const sKey = `${s.group_id}_${s.code_short}`;

            return `<li>
              ${gIcon}
              <span class="clickable-student-name" onclick="openStudentProfile('${sKey}')" title="اضغط لفتح الملف الكامل للطالب">
                ${s.full_name || 'غير محدد'}
              </span>
              <span class="student-code">${s.code_short || '—'}</span>
              ${grpLabel}
              ${issueNote}
            </li>`;
          }).join('')}
        </ul>
      </div>
    </div>`;
}

function slugify(str) {
  return (str || '').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').replace(/-+/g, '-');
}

function escapeAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
