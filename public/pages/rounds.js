'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   البند 5 — صفحة مخصصة لكل راوند (1..4): كروت كل الطلاب المسجلين في هذا
   الراوند (الاسم · الجروب · الكود · الجنس)، والضغط على أي كارت يفتح بروفايل
   الطالب الكامل بأسلوب «elite»: كارت بهوية اللوحة (ذهبي/بنفسجي داكن)،
   هرمية بصرية للاسم والكود، رحلة الراوندات كـ timeline، وتدفق واحد بلا أي
   تمرير أفقي على الموبايل أو الديسكتوب، مطابق للوضعين الفاتح والداكن.

   مصدر العدد: نفس DB.roundSchedule + getUnitAssignments() — لا أرقام ثابتة،
   ولا تصفير: إن تعذّر بناء الكشف تُعرض رسالة صريحة بدل الصفر الصامت.
   ═══════════════════════════════════════════════════════════════════════════ */

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

function genderBadge(g) {
  return g === 'F' ? '<span class="badge badge-rose">أنثى</span>'
       : g === 'M' ? '<span class="badge badge-plum">ذكر</span>'
       : '<span class="badge badge-grey">غير محدد</span>';
}

window.renderRoundPage = function (order) {
  const container = document.getElementById('page-round-' + order);
  if (!container) return;
  const d = getRoundDates(order);
  const rows = getRosterForRoundOrder(order);
  const matrixTotal = getRoundMatrixTotal(order);
  const sectionNames = [...new Set((DB.roundSchedule || []).filter((r) => String(r.round_order) === String(order)).map((r) => r.round_name_ar || roundLabel(r.round_key)))].join(' · ');
  const groupsHere = [...new Set(rows.map((r) => r.gid).filter(Boolean))];

  /* حارس البند 2(ج): كشف فارغ بينما المصفوفة تعلن قواماً → لا نعرض صفرًا مكان بيانات موجودة */
  const emptyWarn = (!rows.length && matrixTotal > 0)
    ? `<div class="alert-item alert-amber static" style="margin-bottom:var(--gap)">
         <span class="alert-icon">${ico('warning')}</span>
         <div><strong>${matrixTotal}</strong> طالب/ة في هذا الراوند حسب المصفوفة، لكن كشف الأفراد غير متاح من الشيت الحالي — الأرقام لم تُصفَّر، والجدول أدناه يعرض المتوفر فقط.</div>
       </div>` : '';

  const cardsHtml = rows.length ? `
    <div class="round-roster-grid">
      ${rows.map((r) => `
        <button type="button" class="round-student-card" data-action="student" data-sid="${esc(r.sid)}" data-replace="1" aria-label="ملف ${esc(r.name)}">
          <div class="rsc-top">
            <span class="initials-avatar">${esc(getInitials(r.name))}</span>
            <div class="rsc-id">
              <span class="rsc-name">${esc(r.name)}</span>
              <span class="rsc-sub"><span class="cartouche-badge">جروب ${esc(r.gid || '—')}</span></span>
            </div>
            ${genderBadge(r.gender)}
          </div>
          <div class="rsc-foot">
            <span class="student-code">${esc(r.code || '—')}</span>
            ${r.station ? `<span class="rsc-unit">${esc(r.station)}</span>` : ''}
          </div>
        </button>`).join('')}
    </div>` : `<div class="empty-note">لا يوجد كشف أفراد متاح لهذا الراوند من الشيت بعد.</div>`;

  container.innerHTML = `
    <div class="card card-sm round-hero" style="margin-bottom: var(--gap); border-right:4px solid var(--c-gold)">
      <div class="round-hero-row">
        <div class="round-hero-main">
          <span class="schedule-intro-ico" aria-hidden="true">${iconSvg('users')}</span>
          <div>
            <div class="round-hero-title">الراوند ${esc(order)}</div>
            <div class="round-hero-sub">${esc(sectionNames || 'الأقسام')} · <span class="num">${esc(d.start || '—')}</span> إلى <span class="num">${esc(d.end || '—')}</span></div>
          </div>
        </div>
        <div class="round-hero-stats">
          <div class="rhs"><span class="num rhs-n">${rows.length}</span><span>طالب/ة في الكشف</span></div>
          <div class="rhs"><span class="num rhs-n">${groupsHere.length}</span><span>جروب</span></div>
          ${matrixTotal ? `<div class="rhs"><span class="num rhs-n">${matrixTotal}</span><span>إجمالي المصفوفة</span></div>` : ''}
        </div>
      </div>
    </div>
    ${emptyWarn}
    ${cardsHtml}`;
};

/* ── بروفايل الطالب «elite» — طبقة كاملة فوق openStudentProfile الحالية ── */
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
                <div class="elite-step-dates num">${esc(st.dates)}</div>
                <div class="elite-step-station">${esc(st.station)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  Overlays.open(panel, true);
};
