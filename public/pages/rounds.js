'use strict';

/* ═════════════════════════════════════════════════════════════════════════════════
   البند 5 — صفحات الراوندات: الراوند ٢ هو المحور المركزي (الدورة الثانية)
   والراوندات ١ · ٣ · ٤ أماكن شاغرة حتى تُضاف بياناتها لاحقاً.
   ════════════════════════════════════════════════════════════════════════════════ */

/* ── كشف طلاب راوند برقمه ('1'..'4') من نفس مصادر اللوحة ── */
window.getRosterForRoundOrder = function (order) {
  order = String(order);
  const list = [];
  if (!window.DB) return list;
  const seen = {};
  const pushRow = (row, stationName) => {
    const gid = cleanGroupId(row.group_id || '');
    const code = String(row.code_short || '').trim();
    if (!gid && !code) return;
    const s = resolveStudent(row) || row;
    const key = gid + '_' + code + '_' + (s.student_code || '');
    if (seen[key]) return;
    seen[key] = true;
    list.push({
      sid: s ? studentKey(s) : '',
      name: s.full_name || row.full_name || 'غير محدد',
      gid, code: code || (s.code_short || ''),
      studentCode: s.student_code || '',
      gender: s.gender || row.gender || '',
      station: stationName || roundLabel(row.round_key || '') || ''
    });
  };

  // الصفوف المرتبطة بجداول الجروبات لهذا الرقم (كل جروب في الراوند)
  const schedRows = (DB.roundSchedule || []).filter((r) => String(r.round_order) === order);
  if (schedRows.length) {
    // تسجيلات فردية بالاسم/الكود إن وجدت في assignments مطابقة لنفس رقم الدورة
    (DB.assignments || []).forEach((a) => {
      if (String(resolveRoundOrder(a)) === order && (a.full_name || a.code_short)) pushRow(a, a.unit_name || '');
    });
    // بقية أعضاء كل جروب في الراوند (كشف الجروب الكامل — نفس قوام المصفوفة)
    schedRows.forEach((r) => {
      const gid = cleanGroupId(r.group_id);
      if (!gid) return;
      (DB.students || []).forEach((s) => { if (String(s.group_id) === gid) pushRow(s, r.round_name_ar || roundLabel(r.round_key)); });
    });
  } else if (order === '1') {
    // راوند الوحدات: الكشف من getUnitAssignments المحصَّن ضد التصفير
    const regs = window.getUnitAssignments ? getUnitAssignments() : [];
    regs.forEach((a) => pushRow(a, a.unit_name || ''));
  }
  list.sort((a, b) => (+a.gid || 0) - (+b.gid || 0) || String(a.code).localeCompare(String(b.code), 'ar', { numeric: true }));
  return list;
};

/* إجمالي الراوند الظاهر في اللوحة (المصفوفة) — للمطابقة مع عدد الكروت */
window.getRoundMatrixTotal = function (order) {
  let total = 0;
  Object.keys(DB.roundMatrix || {}).forEach((k) => {
    if (k.split('_')[0] === String(order)) total += DB.roundMatrix[k].total_students || 0;
  });
  return total;
};

/* ── تصنيف وحدات الراوند ٢ إلى المجالات الفرعية (للمحور الفرعي) ── */
/*目前所有单元都归属 "وحدات بيطرية". يمكن توسيع التصنيف لاحقاً لكل مجزر/قسم/تخصص. */
const R2_DOMAINS = [
  { key: 'units',    label: 'الوحدات البيطرية',   icon: 'hospital', tone: 'tone-teal' },
  { key: 'slaughter', label: 'المجازر',            icon: 'meat',     tone: 'tone-mustard' },
  { key: 'faculty',  label: 'أقسام الكلية',        icon: 'landmark', tone: 'tone-rust' },
  { key: 'equine',   label: 'خيل ومعامل وسمك',     icon: 'microscope', tone: 'tone-navy' },
  { key: 'elective', label: 'تدريب اختياري',       icon: 'star',     tone: 'tone-olive' }
];

function unitsForDomain(domainKey) {
  const units = (DB.stationsUnits || []).filter(u => String(u.round_key || '').toLowerCase() === 'units');
  switch (domainKey) {
    case 'units':    return units; // كل الوحدات البيطرية
    case 'slaughter': return units.filter(u => /مجزر|مجازر|سلخ|smart/.test(String(u.unit_name || ''))); // 확장 عند توفر البيانات
    case 'faculty':  return units.filter(u => /كلية|قسم|قسمي/.test(String(u.unit_name || '')));         // 확장 عند توفر البيانات
    case 'equine':   return units.filter(u => /خيل|معامل|سمك|equine|lab|fish/.test(String(u.unit_name || ''))); // 확장 عند توفر البيانات
    case 'elective': return []; // 확장 عند توفر البيانات
    default: return units;
  }
}

function genderBadge(g) {
  return g === 'F' ? '<span class="badge badge-rose">أنثى</span>'
       : g === 'M' ? '<span class="badge badge-plum">ذكر</span>'
       : '<span class="badge badge-grey">غير محدد</span>';
}

/* ════════════════════════════════════════════════════════════════════════════════════
   الراوند ٢ — المحور المركزي للدورة الثانية
   ═══════════════════════════════════════════════════════════════════════════════════ */
window.renderRound2Hub = function (container) {
  if (!container) return;
  const d = getRoundDates('2');
  const rows = getRosterForRoundOrder('2');
  const matrixTotal = getRoundMatrixTotal('2');
  const groupsHere = [...new Set(rows.map((r) => r.gid).filter(Boolean))];
  const r2Summary = (DB.round2Summary || []).find(r => String(r.round_order || '') === '2' || String(r.round_key || '') === 'units') || {};
  const reg2 = parseInt(r2Summary.registered, 10) || 0;
  const miss2 = parseInt(r2Summary.not_registered, 10) || 0;
  const unregR2 = (DB.unregistered || []).filter(u => String(u.round_order || '') === '2' || String(u.round_key || '') === 'units' || !u.round_order);

  container.innerHTML = `
    <div class="card card-sm round-hero" style="margin-bottom: var(--gap); border-right:4px solid var(--c-gold)">
      <div class="round-hero-row">
        <div class="round-hero-main">
          <span class="schedule-intro-ico" aria-hidden="true">${iconSvg('calendar')}</span>
          <div>
            <div class="round-hero-title">الراوند ٢ — الدورة الثانية (R2)</div>
            <div class="round-hero-sub">${esc(d.start || '—')} إلى ${esc(d.end || '—')} · كل البيانات الخاصة بالدورة الثانية فقط</div>
          </div>
        </div>
        <div class="round-hero-stats">
          <div class="rhs"><span class="num rhs-n">${reg2}</span><span>مسجلون في مواقع التدريب</span></div>
          <div class="rhs"><span class="num rhs-n">${miss2}</span><span>غير مسجلين</span></div>
          <div class="rhs"><span class="num rhs-n">${groupsHere.length}</span><span>جروب</span></div>
          ${matrixTotal ? `<div class="rhs"><span class="num rhs-n">${matrixTotal}</span><span>إجمالي المصفوفة</span></div>` : ''}
        </div>
      </div>
    </div>

    <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('map-pin')} المجالات التدريبية — الدورة الثانية</h2>
    <div class="r2-domains-grid">
      ${R2_DOMAINS.map(domain => {
        const units = unitsForDomain(domain.key);
        const unitCount = units.length;
        const registered = units.reduce((sum, u) => sum + (parseInt(u.registered, 10) || 0), 0);
        const hasData = unitCount > 0;
        return `
          <div class="r2-domain-card"${hasData ? ` data-action="goto-page" data-page="round-2-${domain.key}"` : ''} style="cursor:${hasData ? 'pointer' : 'default'};">
            <div class="r2-domain-head">
              <span class="r2-domain-ico ${domain.tone}" aria-hidden="true">${iconSvg(domain.icon)}</span>
              <span class="r2-domain-label">${esc(domain.label)}</span>
            </div>
            <div class="r2-domain-stats">
              <span class="num">${unitCount}</span><span>وحدة</span>
              ${hasData ? `<span class="num">${registered}</span><span>مسجل</span>` : '<span class="muted">لا توجد بيانات بعد</span>'}
            </div>
            ${!hasData ? `<div class="r2-domain-empty">بيانات هذا المجال تُضاف لاحقاً</div>` : ''}
          </div>`;
      }).join('')}
    </div>

    <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('warning')} غير المسجلين في الراوند ٢</h2>
    ${unregR2.length ? `
      <div class="card card-sm">
        <div class="card-body">
          <p>يوجد <strong class="num">${unregR2.length}</strong> طالب/ة غير مسجلين في مواقع التدريب بالدورة الثانية:</p>
          <ul class="slist">
            ${unregR2.map(u => `
              <li>
                <span class="initials-avatar">${esc(getInitials(u.full_name || ''))}</span>
                <span class="slist-main">
                  <div class="slist-name">${esc(u.full_name || 'غير محدد')}</div>
                  <div class="slist-sub">جروب ${esc(u.group_id || '—')} · كود ${esc(u.code_short || '—')}</div>
                </span>
              </li>`).join('')}
          </ul>
        </div>
      </div>` : `<div class="empty-note">جميع الطلاب مسجلون في الدورة الثانية بالكامل.</div>`}
  `;
};

/* ═══ الوحدات ضمن الراوند ٢ (Sub-page) ═══ */
window.renderRound2Units = function (container) {
  if (!container) return;
  const byUnit = {};
  (window.getUnitAssignments ? getUnitAssignments() : []).forEach(row => {
    const unitName = (row.unit_name || '').trim();
    if (!unitName) return;
    if (!byUnit[unitName]) byUnit[unitName] = [];
    byUnit[unitName].push(row);
  });
  const units = [...DB.stationsUnits].sort((a, b) => (parseInt(b.registered, 10) || 0) - (parseInt(a.registered, 10) || 0));

  container.innerHTML = `
    <div class="card card-sm units-intro-card" style="margin-bottom: var(--gap); border-right:4px solid var(--c-gold)">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.4rem">${ico('hospital')}</span>
        <div>
          <div style="font-size:1.15rem; font-weight:700; color:var(--c-plum); display:flex; align-items:center; gap:8px">
            ${ico('map-pin')} <span>الوحدات البيطرية — الدورة الثانية (R2)</span>
          </div>
          <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">إجمالي الوحدات: <strong class="num">${units.length}</strong> · إجمالي المسجلين: <strong class="num">${Object.values(byUnit).reduce((a, l) => a + l.length, 0)}</strong> طالب/ة</div>
        </div>
      </div>
    </div>
    <div class="units-grid" id="round2-units-grid">
      ${units.map(u => {
        const students = byUnit[u.unit_name] || [];
        const cap = parseInt(u.capacity, 10); const reg = parseInt(u.registered, 10) || 0;
        const pct = cap ? Math.min(Math.round((reg / cap) * 100), 100) : 0;
        return `
          <div class="unit-card">
            <div class="unit-card-header" role="button" tabindex="0">
              <div class="unit-card-top">
                <div><div class="unit-name">${esc(u.unit_name || '—')}</div><div class="unit-gov">${ico('map-pin')} ${esc(u.governorate || '—')}</div></div>
              </div>
              <div class="unit-stats">
                <span class="unit-count-box">${ico('user')} المقيدون: <strong class="num">${reg}</strong> ${cap ? `/ طاقة: <span class="num">${cap}</span>` : ''}</span>
                <span class="unit-count-box">${pct}%</span>
              </div>
            </div>
            <div class="unit-card-body">
              <ul class="unit-student-list">
                ${students.map(s => `
                  <li>
                    <span class="clickable-student-name"${act('student', { sid: (s.group_id + '_' + s.code_short).replace(/\s+/g, '') })} title="ملف ${esc(s.full_name || '')}">${esc(s.full_name || 'غير محدد')}</span>
                    <span class="student-code">${esc(s.code_short || '—')}</span>
                    <span class="cartouche-badge" style="font-size:0.74rem">جروب ${esc(s.group_id || '—')}</span>
                  </li>`).join('') || '<li class="empty-note">لا يوجد طلاب مسجلين في هذه الوحدة.</li>'}
              </ul>
            </div>
          </div>`;
      }).join('')}
    </div>`;
};

/* ═══ المجالات الفرعية الأخرى للراوند ٢ (أماكن شاغرة حتى تُضاف البيانات) ═══ */
function renderRound2EmptyDomain(container, domain) {
  if (!container) return;
  container.innerHTML = `
    <div class="card card-sm" style="text-align:center; padding:60px 20px;">
      <span class="schedule-intro-ico" aria-hidden="true" style="font-size:3rem; opacity:0.3;">${iconSvg(domain.icon)}</span>
      <h2 style="margin-top:16px; color:var(--c-text-muted);">${esc(domain.label)} — الدورة الثانية (R2)</h2>
      <p style="color:var(--c-text-muted);">بيانات هذا المجال تُضاف لاحقاً. عند توفر شيت التداول الخاص بهذا المجال، ستظهر الوحدات والطلاب هنا تلقائياً.</p>
    </div>`;
}
window.renderRound2Slaughter = function (c) { renderRound2EmptyDomain(c, R2_DOMAINS[1]); };
window.renderRound2Faculty = function (c) { renderRound2EmptyDomain(c, R2_DOMAINS[2]); };
window.renderRound2Equine = function (c) { renderRound2EmptyDomain(c, R2_DOMAINS[3]); };
window.renderRound2Elective = function (c) { renderRound2EmptyDomain(c, R2_DOMAINS[4]); };
window.renderRound2Unregistered = function (container) {
  if (!container) return;
  const unregR2 = (DB.unregistered || []).filter(u => String(u.round_order || '') === '2' || String(u.round_key || '') === 'units' || !u.round_order);
  container.innerHTML = `
    <div class="card card-sm" style="border-right:4px solid var(--c-rose)">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
        <span style="font-size:1.4rem">${ico('warning')}</span>
        <div><div style="font-weight:700; color:var(--c-rose);">غير المسجلين في الراوند ٢</div><div style="font-size:0.86rem; color:var(--c-text-muted);">${unregR2.length} طالب/ة</div></div>
      </div>
      ${unregR2.length ? `
        <ul class="slist">
          ${unregR2.map(u => `
            <li>
              <span class="initials-avatar">${esc(getInitials(u.full_name || ''))}</span>
              <span class="slist-main">
                <div class="slist-name">${esc(u.full_name || 'غير محدد')}</div>
                <div class="slist-sub">جروب ${esc(u.group_id || '—')} · كود ${esc(u.code_short || '—')}</div>
              </span>
            </li>`).join('')}
        </ul>` : `<div class="empty-note">جميع الطلاب مسجلون بالكامل.</div>`}
    </div>`;
};

/* ═══ الراوندات ١ · ٣ · ٤ — أماكن شاغرة ═══ */
window.renderRoundPlaceholder = function (container, order) {
  if (!container) return;
  const d = getRoundDates(order);
  container.innerHTML = `
    <div class="card card-sm" style="text-align:center; padding:60px 20px;">
      <span class="schedule-intro-ico" aria-hidden="true" style="font-size:3rem; opacity:0.3;">${iconSvg('calendar')}</span>
      <h2 style="margin-top:16px; color:var(--c-text-muted);">الراوند ${esc(order)}</h2>
      <p style="color:var(--c-text-muted);">بيانات هذا الراوند غير متوفرة بعد. سيتم عرضها عند إضافة بيانات الراوند ${esc(order)}.</p>
      ${d.start ? `<p style="font-size:0.85rem; color:var(--c-text-muted); margin-top:8px;">التواريخ المقررة: ${esc(d.start)} إلى ${esc(d.end)}</p>` : ''}
    </div>`;
};

window.renderRoundPage = function (order) {
  const container = document.getElementById('page-round-' + order);
  if (!container) return;
  if (order === '2') { return renderRound2Hub(container); }
  return renderRoundPlaceholder(container, order);
};

/* ── بروفايل الطالب «elite» — ללא تغيير ═══ */
window.openEliteStudentProfile = function (rawKey) {
  const student = (DB.studentLookup || {})[String(rawKey).replace(/\s+/g, '')];
  if (!student) { toast('لم يتم العثور على سجل الطالب'); return; }
  closeProfileOnly();

  const journey = buildStudentJourney(student);
  const mine = (DB.assignments || []).filter((a) => (student.student_code && a.student_code === student.student_code) || (String(a.group_id) === String(student.group_id) && String(a.code_short).trim() === String(student.code_short).trim()));
  const unitsTxt = [...new Set(mine.map((a) => a.unit_name).filter(Boolean))].join(' + ') || '—';
  const subNow = window.studentSubUnitNow ? studentSubUnitNow(student) : null;
  const rotSeq = window.parseSubRotation ? parseSubRotation(rotationOrderOf(student), subStartOf(student)) : null;
  const phone = formatPhone(student.phone);

  const panel = document.createElement('div');
  panel.id = 'profile-panel-overlay';
  panel.className = 'modal-overlay profile-overlay elite-profile-overlay';
  panel.innerHTML = `
    <div class="elite-card" role="dialog" aria-modal="true" aria-label="الملف الكامل للطالب">
      <div class="elite-head">
        <div class="elite-head-inner">
          <div class="initials-avatar lg elite-avatar">${esc(getInitials(student.full_name))}</div>
          <div class="elite-id">
            <h2 class="elite-name">${esc(student.full_name || 'غير محدد')}</h2>
            <div class="elite-code-row">
              <span class="elite-code num">${esc(student.student_code || student.code_short || '—')}</span>
              <span class="cartouche-badge-dark">جروب ${esc(student.group_id || '—')}</span>
              ${genderBadge(student.gender)}
            </div>
          </div>
        </div>
        <button type="button" class="modal-close dark" data-action="close-overlay" aria-label="إغلاق">${ico('x')}</button>
      </div>
      <div class="elite-body">
        <div class="elite-facts">
          <div class="elite-fact"><span class="k">الوحدة / التسجيل</span><span class="v">${esc(unitsTxt)}</span></div>
          <div class="elite-fact"><span class="k">الهاتف</span><span class="v num" dir="ltr">${esc(phone || 'غير متوفر')}</span></div>
          ${subNow ? `<div class="elite-fact"><span class="k">تدوير خيل/معامل/سمك — الآن</span><span class="v"><strong>${esc(subNow.label)}</strong> · بلوك ${subNow.blockNo}/${subNow.totalBlocks}${rotSeq ? ' · التسلسل: ' + esc(subUnitSeqLabel(rotSeq.sequence)) : ''}</span></div>` : ''}
        </div>
        <div class="elite-section-title">${ico('calendar')} رحلة الراوندات والأقسام</div>
        <div class="elite-timeline">
          ${journey.map((st) => `
            <div class="elite-step ${st.status}">
              <span class="elite-bullet"></span>
              <div class="elite-step-content">
                <div class="elite-step-top"><span class="elite-step-name">${esc(st.roundName)}</span>${statusBadge(st.status)}</div>
                <div class="elite-step-dates num">${escDates(st.dates)}</div>
                <div class="elite-step-station">${esc(st.station)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  Overlays.open(panel, true);
};
