'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   صفحة مصفوفة التدوير الزمني — كل خلية قابلة للضغط عبر data-action
   (بدون onclick مضمّن حتى لا تنكسر الأزرار مع أسماء الدورات/الجروبات)
   ═══════════════════════════════════════════════════════════════════════════ */

/* أيقونات SVG موحّدة بدل الإيموجي — تُقرأ من window.ROUND_META في app.js (نفس ترميز الألوان) */
const ROUND_META = (window.ROUND_META && Object.keys(window.ROUND_META).length) ? window.ROUND_META : {
  units:           { icon: 'hospital',   label: 'وحدات بيطرية',          cls: 'badge-round-units', tone: 'tone-teal' },
  college:         { icon: 'landmark',   label: 'أقسام الكلية',           cls: 'badge-round-college', tone: 'tone-rust' },
  poultry:         { icon: 'chicken',    label: 'دواجن',                  cls: 'badge-round-poultry', tone: 'tone-green' },
  slaughter:       { icon: 'meat',       label: 'مجازر وسلامة غذاء',      cls: 'badge-round-slaughter', tone: 'tone-mustard' },
  equine_lab_fish: { icon: 'microscope', label: 'خيل ومعامل وسمك',        cls: 'badge-round-equine', tone: 'tone-navy' },
  elective:        { icon: 'star',       label: 'تدريب اختياري',          cls: 'badge-round-elective', tone: 'tone-olive' }
};

/* شريحة نصية صغيرة غير قابلة للكسر منتصفها (tnum للأرقام) — تُستخدم كوحدة واحدة في سطر الـ meta */
function gChip(txt, isNum) {
  return `<span class="g-chip${isNum ? ' num' : ''}">${txt}</span>`;
}

function renderSchedule(container) {
  // التواريخ من الشيت أولاً، ثم ملف config كخطة بديلة — لا تواريخ ثابتة داخل الكود
  const orders = ['1', '2', '3', '4', '0'];
  const roundCols = orders.map((order) => {
    const d = getRoundDates(order);
    return {
      order,
      title: order === '0' ? 'تدريب اختياري' : 'الراوند ' + order,
      start: d.start || '',
      end: d.end || '',
      dates: d.start ? `${d.start} إلى ${d.end}` : 'غير محدد بعد'
    };
  });

  const groupCounts = {};
  DB.groups.forEach((g) => { groupCounts[String(g.group_id)] = parseInt(g.total_students, 10) || 0; });

  const schedMap = {};
  DB.roundSchedule.forEach((r) => {
    const gid = String(r.group_id);
    if (!schedMap[gid]) schedMap[gid] = {};
    schedMap[gid][String(r.round_order)] = r;
  });

  /* بناء بطاقة خلية واحدة — هيكل صارم من ثلاث مناطق متطابق في كل البطاقات:
     head : [أيقونة SVG] + [اسم القسم] + [شارة الحالة] في صف واحد space-between
     meta : رقائق منفصلة nowrap لا تنكسر أبداً في منتصفها
     foot : شارة الحالة مثبتة أسفل البطاقة (margin-top:auto) لتتساوى في كل صف */
  function rotCard(opts) {
    const rKey = opts.rKey, meta = opts.meta, st = opts.status;
    const chips = opts.chips.map((c) => gChip(c[0], c[1])).join('');
    return `
      <div class="rot-card ${esc(rKey)}">
        <div class="rot-head">
          ${window.roundIcon ? roundIcon(rKey, true) : iconChip(meta.icon || 'pin', meta.tone || 'tone-gold')}
          <span class="rot-title">${esc(opts.title)}</span>
          <span class="rot-status">${statusBadge(st)}</span>
        </div>
        <div class="rot-meta">${chips}</div>
        <div class="rot-foot">${statusBadge(st)}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="card card-sm schedule-intro">
      <div class="schedule-intro-row">
        <div class="schedule-intro-main">
          <span class="schedule-intro-ico" aria-hidden="true">${iconSvg('calendar')}</span>
          <div>
            <div class="schedule-intro-title">مصفوفة التدوير الزمني للإمتياز</div>
            <div class="schedule-intro-sub">انقر على أي خلية أو جروب لعرض تفاصيل التوزيع والكشوف المعتمدة · اسحب أفقياً على الهاتف لمشاهدة بقية الراوندات</div>
          </div>
        </div>
        <div class="schedule-legend">
          ${['units', 'college', 'poultry', 'slaughter', 'equine_lab_fish', 'elective'].map((k) => {
            const m = ROUND_META[k];
            const shortName = { units: 'وحدات', college: 'أقسام', poultry: 'دواجن', slaughter: 'مجازر', equine_lab_fish: 'خيل وسمك', elective: 'اختياري' }[k];
            return `<span class="badge ${m.cls} legend-chip">${iconSvg(m.icon)} ${shortName}</span>`;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll gantt-scroll has-fade" id="gantt-scroll">
        <table class="gantt-matrix-table" id="gantt-table">
          <thead>
            <tr>
              <th class="gantt-sticky-col gantt-sticky-head">الجروب والقوام</th>
              ${roundCols.map((c) => `
                <th>
                  <div class="gantt-head-title">${esc(c.title)}</div>
                  <div class="gantt-head-dates num">${esc(c.dates)}</div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${DB.groups.map((g) => {
              const gid = String(g.group_id), count = groupCounts[gid] || 0, gs = schedMap[gid] || {};
              return `
                <tr class="gantt-row">
                  <td class="gantt-sticky-col">
                    <div class="gantt-group-cell"${act('group-roster', { gid })}>
                      <div class="gantt-group-top"><span class="cartouche-badge">جروب ${esc(gid)}</span><span class="go" aria-hidden="true">${iconSvg('external')}</span></div>
                      <div class="gantt-group-count"><strong class="num">${count}</strong> طالب/ة</div>
                    </div>
                  </td>
                  ${roundCols.map((c) => {
                    if (c.order === '0') {
                      const meta = ROUND_META.elective, st = computeStatus(c.start, c.end);
                      return `<td class="gantt-cell"${act('round-detail', { round: 'elective', title: 'تدريب اختياري', gid, count })}>
                        ${rotCard({ rKey: 'elective', meta, title: 'تدريب اختياري', status: st, chips: [[`${count} طالب`, true]], foot: 'status' })}
                      </td>`;
                    }
                    const row = gs[c.order];
                    if (!row) return `<td class="gantt-cell gantt-empty"><span class="muted small">غير محدد</span></td>`;
                    const rKey = row.round_key, meta = ROUND_META[rKey] || { icon: 'pin', label: row.round_name_ar || roundLabel(rKey), cls: 'badge-grey', tone: 'tone-gold' };
                    const rStatus = computeStatus(row.start_date, row.end_date);
                    const matrixKey = c.order + '_' + rKey, mData = DB.roundMatrix[matrixKey];
                    // كل قطعة معلومة كاملة تُمرَّر كشريحة مستقلة nowrap — الالتفاف يحدث بين الشرائح فقط
                    const chips = [[`قوام الجروب ${count}`, true]];
                    let capDot = '';
                    if (mData && mData.groups.length > 1) {
                      const others = mData.groups.filter((x) => String(x.group_id) !== gid).map((x) => x.group_id).join('+');
                      chips.push([`مشارك مع جروب ${esc(others)}`, false], [`الإجمالي ${mData.total_students}`, true]);
                    }
                    if (rKey === 'units') {
                      const unregHere = (DB.unregistered || []).some((u) => normRoundKey(u.round_key) === 'units' && String(u.group_id) === gid);
                      capDot = unregHere ? 'amber' : 'green';
                    }
                    return `<td class="gantt-cell"${act('round-detail', { round: rKey, title: row.round_name_ar || roundLabel(rKey), gid, count, matrix: matrixKey })}>
                      ${rotCard({ rKey, meta, title: row.round_name_ar || roundLabel(rKey), status: rStatus, chips, foot: (c.order === '1' ? 'total' : 'status'), total: count, dot: capDot })}
                    </td>`;
                  }).join('')}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ── نافذة تفاصيل الدورة لجروب معيّن (كل الأزرار فيها data-action) ── */
window.openRoundDetailModal = function (rawKey, roundTitle, groupId, studentCount, matrixKey) {
  const roundKey = normRoundKey(rawKey);                              // يقبل أي مسميات في الشيت (veterinary_units …)
  const gid = String(groupId == null ? '' : groupId);
  const cnt = String(studentCount == null ? 0 : studentCount);
  const title = roundTitle || roundLabel(roundKey);
  let extra = '';

  const mKey = matrixKey || '';
  if (mKey && DB.roundMatrix[mKey] && DB.roundMatrix[mKey].groups.length > 1) {
    const others = DB.roundMatrix[mKey].groups.filter((x) => String(x.group_id) !== gid).map((x) => x.group_id).join('+');
    extra += `<div class="alert-item alert-amber static"><span class="alert-icon">${iconSvg('alert-triangle')}</span><div>هذا التوقيت يتدرب فيه <strong>جروب ${esc(gid)}</strong> مع جروب <strong>${esc(others)}</strong>. إجمالي الطلاب المتواجدين: <strong class="num">${DB.roundMatrix[mKey].total_students}</strong> طالب/ة.</div></div>`;
  }

  const schedRow = DB.roundSchedule.find((r) => String(r.group_id) === gid && r.round_key === roundKey) || {};
  const start = formatDate(schedRow.start_date) || getRoundDates(schedRow.round_order || '').start || getRoundDates('').start;
  const end = formatDate(schedRow.end_date) || getRoundDates(schedRow.round_order || '').end || getRoundDates('').end;
  const info = [
    ['المجال', title],
    ['قوام الجروب', cnt + ' طالب/ة'],
    ['مواعيد هذه الدورة', start ? `${start} ← ${end}` : 'غير محددة بعد'],
    ['الحالة', ({ current: 'جارية الآن', finished: 'انتهت', upcoming: 'لم تبدأ بعد' })[computeStatus(start, end)] || '—']
  ];

  const kv = `<div class="kv-list">${info.map((r) => `<div class="kv"><span>${esc(r[0])}</span><strong>${esc(r[1])}</strong></div>`).join('')}</div>`;

  const actions = roundKey === 'units'
    ? `<div class="modal-actions">
         ${btn(`${iconSvg('hospital')} الانتقال لصفحة الوحدات البيطرية`, 'goto-page', { page: 'units' })}
         ${btn(`${iconSvg('users')} قائمة طلاب جروب ${gid}`, 'group-roster', { gid, replace: 1 }, 'btn-surface')}
       </div>`
    : `<div class="modal-actions">
         ${btn(`${iconSvg('users')} استعراض قائمة طلاب جروب ${gid} (${cnt} طالب)`, 'group-roster', { gid, replace: 1 })}
       </div>`;

  openModal(`تفاصيل الدورة — جروب ${gid}`, `
    <div class="profile-chips" style="margin-bottom:14px">
      <span class="cartouche-badge-dark">جروب ${esc(gid)}</span>
      <span class="badge badge-gold">${esc(title)}</span>
    </div>${kv}${actions}`);
};
