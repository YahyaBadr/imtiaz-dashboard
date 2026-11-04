'use strict';

/* ═════════════════════════════════════════════════════════════════════════════════
   البند 5 — صفحات الراوندات
   راوند ٢ هو المحور المركزي للدورة الثانية.
   الإختياري = راوند ٥ (صفحة مستقلة).
   راوندات ١ · ٣ · ٤ أماكن شاغرة.
   ════════════════════════════════════════════════════════════════════════════════ */

/* ── كشف طلاب راوند برقمه ('1'..'4') من نفس مصادر اللوحة ── */
window.getRosterForRoundOrder = function (order) {
  order = String(order);
  const list = [];
  if (!window.DB) return list;
  const seen = {};
  const pushRow = (row, stationName) => {
    const code = String(row.code_short || '').trim();
    const s = resolveStudent(row) || row;
    // group_id يُؤخذ من مصدر البيانات الحالي (assignments/unregistered)، وليس من جدول students،
    // لأن group_id في students قد يختلف عن group_id في تسجيلات الرايوند ٢ (مثل نعمة عادل: 1.0 في assignments و 2 في students).
    const gid = cleanGroupId(row.group_id || '');
    if (!gid && !code) return;
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

  const schedRows = (DB.roundSchedule || []).filter((r) => String(r.round_order) === order);
  if (schedRows.length) {
    (DB.assignments || []).forEach((a) => {
      if (String(resolveRoundOrder(a)) === order && (a.full_name || a.code_short)) pushRow(a, a.unit_name || '');
    });
    schedRows.forEach((r) => {
      const gid = cleanGroupId(r.group_id);
      if (!gid) return;
      (DB.students || []).forEach((s) => { if (String(s.group_id) === gid) pushRow(s, r.round_name_ar || roundLabel(r.round_key)); });
    });
  } else if (order === '1') {
    const regs = window.getUnitAssignments ? window.getUnitAssignments() : [];
    regs.forEach((a) => pushRow(a, a.unit_name || ''));
  }
  list.sort((a, b) => (+a.gid || 0) - (+b.gid || 0) || String(a.code).localeCompare(String(b.code), 'ar', { numeric: true }));
  return list;
};

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

/* ═══ خريطة: group_id → round_key للرايوند ٢ من جدول الجولات ═══ */
/* لأن جدول التسجيلات يُخزن round_key='units' للجميع، التخصص الفعلي يُعرف من الجدول الزمني. */
window.buildR2GroupFieldMap = function () {
  const map = {};
  (DB.roundSchedule || []).forEach((r) => {
    if (String(r.round_order) === '2') {
      map[String(r.group_id)] = String(r.round_key || 'units');
    }
  });
  console.log('[R2 DEBUG] buildR2GroupFieldMap=', map, 'roundSchedule.length=', (DB.roundSchedule || []).length);
  return map;
};

/* تعريف المجالات للرايوند ٢ — فقط المجالات التي لديها بيانات فعلية */
const R2_DOMAINS = [
  { key: 'units',           label: 'الوحدات البيطرية',   icon: 'hospital',   tone: 'tone-teal' },
  { key: 'college',         label: 'أقسام الكلية',        icon: 'landmark',   tone: 'tone-rust' },
  { key: 'equine_lab_fish', label: 'خيل ومعامل وسمك',     icon: 'microscope', tone: 'tone-navy' },
  { key: 'slaughter',       label: 'مجازر وسلامة غذاء',   icon: 'meat',       tone: 'tone-mustard' },
  { key: 'poultry',         label: 'دواجن',               icon: 'chicken',    tone: 'tone-green' }
];

function domainLabel(key) { const d = R2_DOMAINS.find((x) => x.key === key); return d ? d.label : key; }
function domainIcon(key) { const d = R2_DOMAINS.find((x) => x.key === key); return d ? d.icon : 'pin'; }
function domainTone(key) { const d = R2_DOMAINS.find((x) => x.key === key); return d ? d.tone : 'tone-gold'; }

/* الطلاب المسجلين في مجال معين للرايوند ٢ — يُربط عبر group_id من جدول الجولات */
/* group_id يُؤخذ من جدول التسجيلات (assignments) لأنه المصدر الموثوق للرايوند ٢.
// عند وجود student_code موحد (مثل نعمة عادل 11012021100676)، يُجلب الاسم والنوع من جدول الطلاب عبر resolveStudent.
// تُعيد كائنات معالجة بنفس بنية مخرجات getRosterForRoundOrder حتى تظهر بيانات الطلبة بشكل صحيح. */
function r2StudentsForKey(key) {
  const groupFieldMap = window.buildR2GroupFieldMap ? window.buildR2GroupFieldMap() : {};
  const result = [];
  const seen = {};
  console.log('[R2 DEBUG] r2StudentsForKey key=', key, 'assignments.length=', (DB.assignments || []).length, 'groupFieldMap=', groupFieldMap);
  (DB.assignments || []).forEach((a) => {
    // group_id يُؤخذ من جدول التسجيلات (assignments) لأنه المصدر الموثوق للرايوند ٢
    const gid = cleanGroupId(a.group_id || '');
    const field = groupFieldMap[gid] || 'units';
    if (field !== key) return;
    if (!(a.full_name || a.code_short)) return;
    const code = String(a.code_short || '').trim();
    const k = gid + '_' + code + '_' + (a.student_code || '');
    if (seen[k]) return;
    seen[k] = true;
    const s = resolveStudent(a) || a;
    result.push({
      sid: s ? studentKey(s) : '',
      name: s.full_name || a.full_name || 'غير محدد',
      gid, code: code || (s.code_short || ''),
      studentCode: s.student_code || a.student_code || '',
      gender: s.gender || a.gender || '',
      station: a.unit_name || domainLabel(key) || roundLabel(a.round_key || '') || '',
      // تمرير بيانات التناوب من جدول التسجيلات لـ studentSubUnitNow
      group_id: cleanGroupId(a.group_id || ''),
      code_short: a.code_short,
      student_code: a.student_code,
      rotation_order: a.rotation_order || '',
      sub_unit_start: a.sub_unit_start || ''
    });
  });
  console.log('[R2 DEBUG] r2StudentsForKey result count=', result.length, 'for key=', key);
  result.sort((a, b) => (+a.gid || 0) - (+b.gid || 0) || String(a.code).localeCompare(String(b.code), 'ar', { numeric: true }));
  return result;
}

/* غير المسجلين في مجال معين للرايوند ٢ — يُربط عبر group_id من جدول الجولات */
function r2UnregisteredForKey(key) {
  const groupFieldMap = window.buildR2GroupFieldMap ? window.buildR2GroupFieldMap() : {};
  return (DB.unregistered || []).filter((u) => {
    const gid = String(cleanGroupId(u.group_id || ''));
    const field = groupFieldMap[gid] || 'units';
    return field === key;
  });
}

function r2SummaryForKey(key) {
  return (DB.round2Summary || []).find((r) => String(r.round_key || '') === key) || {};
}

/*raven بطاقات الرايوند ٢ — تصميم يشبه صفحة الملخص تماماً*/
window.renderRound2Hub = function (container) {
  if (!container) return;
  const d = getRoundDates('2');
  const rows = getRosterForRoundOrder('2');
  const groupsHere = [...new Set(rows.map((r) => r.gid).filter(Boolean))];

  const groupFieldMap = window.buildR2GroupFieldMap ? window.buildR2GroupFieldMap() : {};
  const unregR2 = (DB.unregistered || []).filter((u) => {
    const gid = String(cleanGroupId(u.group_id || ''));
    const field = groupFieldMap[gid] || 'units';
    return field === 'units' || field === 'college' || field === 'equine_lab_fish' || field === 'slaughter' || field === 'poultry';
  });

  container.innerHTML = `
    <div class="card card-sm round-hero" style="margin-bottom: var(--gap); border-right:4px solid var(--c-gold)">
      <div class="round-hero-row">
        <div class="round-hero-main">
          <span class="schedule-intro-ico" aria-hidden="true">${iconSvg('calendar')}</span>
          <div>
            <div class="round-hero-title">راوند ٢ — الدورة الثانية (R2)</div>
            <div class="round-hero-sub">${esc(d.start || '—')} إلى ${esc(d.end || '—')} · كل البيانات الخاصة بالدورة الثانية فقط</div>
          </div>
        </div>
        <div class="round-hero-stats">
          <div class="rhs"><span class="num rhs-n">${rows.length}</span><span>طالب/ة في الكشف</span></div>
          <div class="rhs"><span class="num rhs-n">${groupsHere.length}</span><span>جروب</span></div>
          <div class="rhs"><span class="num rhs-n">${unregR2.length}</span><span>غير مسجلين</span></div>
        </div>
      </div>
    </div>

    <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('map-pin')} المجالات التدريبية — الدورة الثانية</h2>
    <div class="r2-domains-grid">
      ${R2_DOMAINS.map((domain) => {
        const students = r2StudentsForKey(domain.key);
        const s = r2SummaryForKey(domain.key);
        const reg = parseInt(s.registered, 10) || students.length;
        const exp = parseInt(s.expected_students, 10) || 0;
        const miss = parseInt(s.not_registered, 10) || 0;
        const pct = exp > 0 ? Math.round((reg / exp) * 100) : (reg > 0 ? 100 : 0);
        const pageId = domain.key === 'equine_lab_fish' ? 'round-2-equine' : `round-2-${domain.key}`;
        return `
          <div class="r2-domain-card" data-action="goto-page" data-page="${pageId}" style="cursor:pointer;">
            <div class="r2-domain-head">
              <span class="r2-domain-ico ${domainTone(domain.key)}" aria-hidden="true">${iconSvg(domainIcon(domain.key))}</span>
              <span class="r2-domain-label">${esc(domain.label)}</span>
            </div>
            <div class="r2-domain-body">
              <div class="r2-domain-num"><span class="num">${reg}</span> <span>${exp > 0 ? '/' + exp : ''}</span></div>
              <div class="r2-domain-progress">
                <div class="progress-bar"><div class="progress-fill ${domainTone(domain.key)}" style="width:${Math.min(pct, 100)}%"></div></div>
                <span class="num">${pct}%</span>
              </div>
              <div class="r2-domain-meta">${esc(s.groups || students.length > 0 ? 'مجموعات متعددة' : '—')}</div>
            </div>
            ${miss > 0 ? `<div class="r2-domain-alert"><span class="badge badge-amber num">${miss} غير مسجل</span></div>` : ''}
          </div>`;
      }).join('')}
    </div>

    ${unregR2.length ? `
      <h2 class="section-title"><span class="title-ornament" aria-hidden="true"></span>${ico('warning')} غير المسجلين في راوند ٢</h2>
      <div class="card card-sm elite-unreg-card">
        <div class="card-body">
          <div class="elite-unreg-header">
            <span class="elite-unreg-count">${unregR2.length}</span>
            <span class="elite-unreg-label">طالب/ة غير مسجل في مواقع التدريب بالدورة الثانية</span>
          </div>
          <ul class="slist elite-slist">
            ${unregR2.map((u) => {
              const s = resolveStudent(u) || u;
              return `
              <li class="slist-row">
                <span class="initials-avatar">${esc(getInitials(s.full_name || ''))}</span>
                <span class="slist-main">
                  <div class="slist-name">${esc(s.full_name || 'غير محدد')}</div>
                  <div class="slist-sub">جروب ${esc(cleanGroupId(s.group_id || u.group_id || '')) || '—'} · كود ${esc(s.code_short || u.code_short || '—')}</div>
                </span>
              </li>`;
            }).join('')}
          </ul>
        </div>
      </div>` : ''}
  `;
};

/* ═══ صفحة مجال فرعي تحت راوند ٢ ═══ */
window.renderRound2Domain = function (container, domainKey) {
  if (!container) return;
  const domain = R2_DOMAINS.find((d) => d.key === domainKey) || { key: domainKey, label: domainKey, icon: 'pin', tone: 'tone-gold' };
  const students = r2StudentsForKey(domainKey);
  const unreg = r2UnregisteredForKey(domainKey);
  const s = r2SummaryForKey(domainKey);
  const reg = parseInt(s.registered, 10) || students.length;
  const exp = parseInt(s.expected_students, 10) || 0;
  const miss = parseInt(s.not_registered, 10) || 0;

  let contentHtml = '';
  if (domainKey === 'units') {
    /* واجهة الوحدات البيطرية: كارد لكل وحدة، وعند الضغط تظهر أسماء أهلها */
    const grouped = {};
    students.forEach((st) => {
      const unit = st.station || 'غير محدد';
      if (!grouped[unit]) grouped[unit] = [];
      grouped[unit].push(st);
    });
    const unitNames = Object.keys(grouped).sort();
    contentHtml = `
      <div class="units-grid">
        ${unitNames.map((unitName) => {
          const unitStudents = grouped[unitName];
          return `
          <div class="unit-card" data-action="toggle-unit" data-unit="${esc(unitName)}" style="cursor:pointer;">
            <div class="unit-card-header">
              <span class="unit-card-ico">${iconSvg('hospital')}</span>
              <div class="unit-card-info">
                <div class="unit-card-name">${esc(unitName)}</div>
                <div class="unit-card-count">${unitStudents.length} طالب/ة</div>
              </div>
            </div>
            <div class="unit-card-body">
              <ul class="unit-student-list">
                ${unitStudents.map((st) => `
                  <li data-action="student" data-sid="${esc(studentKey(st))}">
                    <span class="initials-avatar">${esc(getInitials(st.name || ''))}</span>
                    <div class="unit-student-info">
                      <div class="unit-student-name">${esc(st.name || 'غير محدد')}</div>
                      <div class="unit-student-sub">جروب ${esc(st.gid || '—')} · كود ${esc(st.code || '—')}</div>
                    </div>
                  </li>
                `).join('')}
              </ul>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    // غير المسجلين لوحدات بيطرية (حتى لو غير موجودين في جدول الطلاب الموحد)
    if (miss > 0) {
      contentHtml += `
        <div class="card card-sm elite-unreg-card" style="margin-top: var(--gap);">
          <div class="card-body">
            <div class="elite-unreg-header">
              <span class="elite-unreg-count">${miss}</span>
              <span class="elite-unreg-label">طالب/ة غير مسجل في وحدات بيطرية (الدورة الثانية)</span>
            </div>
            <ul class="slist elite-slist">
              ${unreg.map((u) => {
                const s2 = resolveStudent(u) || u;
                return `
                <li class="slist-row">
                  <span class="initials-avatar">${esc(getInitials(s2.full_name || ''))}</span>
                  <span class="slist-main">
                    <div class="slist-name">${esc(s2.full_name || 'غير محدد')}</div>
                    <div class="slist-sub">جروب ${esc(cleanGroupId(s2.group_id || u.group_id || '')) || '—'} · كود ${esc(s2.code_short || u.code_short || '—')}</div>
                  </span>
                </li>`;
              }).join('')}
            </ul>
          </div>
        </div>`;
    }
  } else if (domainKey === 'equine_lab_fish') {
    /* واجهة خيل/معامل/سمك: جدول مع عمود التناوب الحالي والبلوك */
    contentHtml = `
      <div class="two-col">
        <section style="flex:2;">
          <h3 class="section-title" style="margin-top:0;">${ico('users')} الطلاب المسجلون (${students.length})</h3>
          <div class="card">
            <div class="table-scroll">
              <table class="table-cards">
                <thead>
                  <tr>
                    <th>الاسم</th><th>الجروب</th><th>الكود</th><th>النوع</th><th>الوحدة</th><th>التناوب الآن</th>
                  </tr>
                </thead>
                <tbody>
                  ${students.map((s) => {
                    const rot = window.studentSubUnitNow ? window.studentSubUnitNow({...s, group_id: s.gid, code_short: s.code, student_code: s.studentCode}) : null;
                    const rotationHtml = `<td class="rotation-cell">
                      ${rot ? `<span class="badge rotation-badge rotation-${rot.key}">${esc(rot.label)}</span><br><span class="rotation-block">بلوك ${rot.blockNo}/${rot.totalBlocks}</span>` : '<span class="muted">—</span>'}
                    </td>`;
                    return `
                    <tr class="clickable-row"${act('student', { sid: s.sid })} >
                      <td>
                        <span class="initials-avatar">${esc(getInitials(s.name || ''))}</span>
                        <strong>${esc(s.name || 'غير محدد')}</strong>
                      </td>
                      <td><span class="cartouche-badge">جروب ${esc(s.gid || '—')}</span></td>
                      <td class="num">${esc(s.code || '—')}</td>
                      <td>${genderBadge(s.gender)}</td>
                      <td>${esc(s.station || '—')}</td>
                      ${rotationHtml}
                    </tr>`;
                  }).join('') || '<tr><td colspan="6" class="empty-note">لا يوجد طلاب مسجلين في هذا المجال.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section style="flex:1;">
          ${miss > 0 ? `
            <h3 class="section-title">${ico('warning')} غير مسجلين (${miss})</h3>
            <div class="card card-sm elite-unreg-card">
              <div class="card-body">
                <div class="elite-unreg-header">
                  <span class="elite-unreg-count">${miss}</span>
                  <span class="elite-unreg-label">طالب/ة غير مسجل في مواقع التدريب بالدورة الثانية</span>
                </div>
                <ul class="slist elite-slist">
                  ${unreg.map((u) => {
                    const s2 = resolveStudent(u) || u;
                    return `
                    <li class="slist-row">
                      <span class="initials-avatar">${esc(getInitials(s2.full_name || ''))}</span>
                      <span class="slist-main">
                        <div class="slist-name">${esc(s2.full_name || 'غير محدد')}</div>
                        <div class="slist-sub">جروب ${esc(cleanGroupId(s2.group_id || u.group_id || '')) || '—'} · كود ${esc(s2.code_short || u.code_short || '—')}</div>
                      </span>
                    </li>`;
                  }).join('')}
                </ul>
              </div>
            </div>
          ` : `
            <div class="card card-sm" style="text-align:center; padding:40px 20px; color:var(--c-green);">
              ${ico('check')}
              <h3 style="margin-top:12px;">جميع الطلاب مسجلون</h3>
              <p style="color:var(--c-text-muted);">لا يوجد طلاب غير مسجلين في هذا المجال.</p>
            </div>
          `}
        </section>
      </div>`;
  } else {
    /* واجهة باقي المجالات (college, slaughter, poultry): جدول عادي */
    contentHtml = `
      <div class="two-col">
        <section style="flex:2;">
          <h3 class="section-title" style="margin-top:0;">${ico('users')} الطلاب المسجلون (${students.length})</h3>
          <div class="card">
            <div class="table-scroll">
              <table class="table-cards">
                <thead>
                  <tr>
                    <th>الاسم</th><th>الجروب</th><th>الكود</th><th>النوع</th><th>الوحدة</th>
                  </tr>
                </thead>
                <tbody>
                  ${students.map((s) => `
                    <tr class="clickable-row"${act('student', { sid: s.sid })} >
                      <td>
                        <span class="initials-avatar">${esc(getInitials(s.name || ''))}</span>
                        <strong>${esc(s.name || 'غير محدد')}</strong>
                      </td>
                      <td><span class="cartouche-badge">جروب ${esc(s.gid || '—')}</span></td>
                      <td class="num">${esc(s.code || '—')}</td>
                      <td>${genderBadge(s.gender)}</td>
                      <td>${esc(s.station || '—')}</td>
                    </tr>`).join('') || '<tr><td colspan="5" class="empty-note">لا يوجد طلاب مسجلين في هذا المجال.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section style="flex:1;">
          ${miss > 0 ? `
            <h3 class="section-title">${ico('warning')} غير مسجلين (${miss})</h3>
            <div class="card card-sm elite-unreg-card">
              <div class="card-body">
                <div class="elite-unreg-header">
                  <span class="elite-unreg-count">${miss}</span>
                  <span class="elite-unreg-label">طالب/ة غير مسجل في مواقع التدريب بالدورة الثانية</span>
                </div>
                <ul class="slist elite-slist">
                  ${unreg.map((u) => {
                    const s2 = resolveStudent(u) || u;
                    return `
                    <li class="slist-row">
                      <span class="initials-avatar">${esc(getInitials(s2.full_name || ''))}</span>
                      <span class="slist-main">
                        <div class="slist-name">${esc(s2.full_name || 'غير محدد')}</div>
                        <div class="slist-sub">جروب ${esc(cleanGroupId(s2.group_id || u.group_id || '')) || '—'} · كود ${esc(s2.code_short || u.code_short || '—')}</div>
                      </span>
                    </li>`;
                  }).join('')}
                </ul>
              </div>
            </div>
          ` : `
            <div class="card card-sm" style="text-align:center; padding:40px 20px; color:var(--c-green);">
              ${ico('check')}
              <h3 style="margin-top:12px;">جميع الطلاب مسجلون</h3>
              <p style="color:var(--c-text-muted);">لا يوجد طلاب غير مسجلين في هذا المجال.</p>
            </div>
          `}
        </section>
      </div>`;
  }

  container.innerHTML = `
    <div class="card card-sm domain-header-card" style="margin-bottom: var(--gap); border-right:4px solid var(--c-${domainTone(domain.key).replace('tone-','')})">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" class="btn btn-surface btn-sm" data-action="goto-page" data-page="round-2" style="margin-right:8px;">${ico('arrow-left')} رجوع لراوند ٢</button>
          <span class="r2-domain-ico ${domainTone(domain.key)}" aria-hidden="true" style="font-size:1.5rem;">${iconSvg(domainIcon(domain.key))}</span>
          <div>
            <div style="font-size:1.25rem; font-weight:700; color:var(--c-plum);">${esc(domain.label)} — الدورة الثانية (R2)</div>
            <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">${reg} من ${exp} طالب/ة مسجلين${miss > 0 ? ' · ' + miss + ' غير مسجل' : ''}</div>
          </div>
        </div>
      </div>
    </div>

    ${contentHtml}
  `;
};

window.renderRound2Units = function (c) { renderRound2Domain(c, 'units'); };
window.renderRound2College = function (c) { renderRound2Domain(c, 'college'); };
window.renderRound2Equine = function (c) { renderRound2Domain(c, 'equine_lab_fish'); };
window.renderRound2Slaughter = function (c) { renderRound2Domain(c, 'slaughter'); };
window.renderRound2Poultry = function (c) { renderRound2Domain(c, 'poultry'); };

/* ═══ الرايوند الإختياري = راوند ٥ (صفحة مستقلة، ليس تحت راوند ٢) ═══ */
window.renderRound0Elective = function (container) {
  if (!container) return;
  container.innerHTML = `
    <div class="card card-sm" style="text-align:center; padding:60px 20px;">
      <span class="schedule-intro-ico" aria-hidden="true" style="font-size:3rem; opacity:0.3;">${iconSvg('star')}</span>
      <h2 style="margin-top:16px; color:var(--c-text-muted);">الرايوند الإختياري (راوند ٥)</h2>
      <p style="color:var(--c-text-muted);">بيانات الرايوند الإختياري تُضاف لاحقاً في جدول مستقل.</p>
    </div>`;
};

/* ═══ راوندات ١ · ٣ · ٤ — أماكن شاغرة ═══ */
window.renderRoundPlaceholder = function (container, order) {
  if (!container) return;
  const d = getRoundDates(order);
  container.innerHTML = `
    <div class="card card-sm" style="text-align:center; padding:60px 20px;">
      <span class="schedule-intro-ico" aria-hidden="true" style="font-size:3rem; opacity:0.3;">${iconSvg('calendar')}</span>
      <h2 style="margin-top:16px; color:var(--c-text-muted);">راوند ${esc(order)}</h2>
      <p style="color:var(--c-text-muted);">بيانات هذا الراوند غير متوفرة بعد. سيتم عرضها عند إضافة بيانات راوند ${esc(order)}.</p>
      ${d.start ? `<p style="font-size:0.85rem; color:var(--c-text-muted); margin-top:8px;">التواريخ المقررة: ${esc(d.start)} إلى ${esc(d.end)}</p>` : ''}
    </div>`;
};

window.renderRoundPage = function (order) {
  const container = document.getElementById('page-round-' + order);
  if (!container) return;
  if (order === '2') { return renderRound2Hub(container); }
  return renderRoundPlaceholder(container, order);
};

/* ═══ بروفايل الطالب «elite» ═══ */
window.openEliteStudentProfile = function (rawKey) {
  const student = (DB.studentLookup || {})[String(rawKey).replace(/\s+/g, '')];
  if (!student) { toast('لم يتم العثور على سجل الطالب'); return; }
  closeProfileOnly();

  const journey = buildStudentJourney(student);
  const mine = (DB.assignments || []).filter((a) => (student.student_code && a.student_code === student.student_code) || (String(a.group_id) === String(student.group_id) && String(a.code_short).trim() === String(student.code_short).trim()));
  const unitsTxt = [...new Set(mine.map((a) => a.unit_name).filter(Boolean))].join(' + ') || '—';
  const subNow = window.studentSubUnitNow ? window.studentSubUnitNow(student) : null;
  const rotSeq = window.parseSubRotation ? window.parseSubRotation(window.rotationOrderOf(student), window.subStartOf(student)) : null;
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
          ${subNow ? `<div class="elite-fact"><span class="k">تدوير خيل/معامل/سمك — الآن</span><span class="v"><strong>${esc(subNow.label)}</strong> · بلوك ${subNow.blockNo}/${subNow.totalBlocks}${rotSeq ? ' · التسلسل: ' + esc(window.subUnitSeqLabel(rotSeq.sequence)) : ''}</span></div>` : ''}
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
