'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   صفحة مصفوفة التدوير الزمني — كل خلية قابلة للضغط عبر data-action
   (بدون onclick مضمّن حتى لا تنكسر الأزرار مع أسماء الدورات/الجروبات)
   ═══════════════════════════════════════════════════════════════════════════ */

const ROUND_META = {
  units:           { icon: '🏥', label: 'وحدات بيطرية',          cls: 'badge-round-units' },
  college:         { icon: '🏛️', label: 'أقسام الكلية',           cls: 'badge-round-college' },
  poultry:         { icon: '🐔', label: 'دواجن',                  cls: 'badge-round-poultry' },
  slaughter:       { icon: '🥩', label: 'مجازر وسلامة غذاء',      cls: 'badge-round-slaughter' },
  equine_lab_fish: { icon: '🔬', label: 'خيل ومعامل وسمك',        cls: 'badge-round-equine' },
  elective:        { icon: '🌟', label: 'تدريب اختياري',          cls: 'badge-round-elective' }
};

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

  container.innerHTML = `
    <div class="card card-sm schedule-intro">
      <div class="schedule-intro-row">
        <div class="schedule-intro-main">
          <span class="schedule-intro-ico" aria-hidden="true">📅</span>
          <div>
            <div class="schedule-intro-title">مصفوفة التدوير الزمني للإمتياز</div>
            <div class="schedule-intro-sub">انقر على أي خلية أو جروب لعرض تفاصيل التوزيع والكشوف المعتمدة · اسحب أفقياً على الهاتف لمشاهدة بقية الراوندات</div>
          </div>
        </div>
        <div class="schedule-legend">
          <span class="badge badge-round-units">🏥 وحدات</span>
          <span class="badge badge-round-college">🏛️ أقسام</span>
          <span class="badge badge-round-poultry">🐔 دواجن</span>
          <span class="badge badge-round-slaughter">🥩 مجازر</span>
          <span class="badge badge-round-equine">🔬 خيل وسمك</span>
          <span class="badge badge-round-elective">🌟 اختياري</span>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll gantt-scroll">
        <table class="gantt-matrix-table" id="gantt-table">
          <thead>
            <tr>
              <th class="gantt-sticky-col">الجروب والقوام</th>
              ${roundCols.map((c) => `
                <th>
                  <div class="gantt-head-title">${esc(c.title)}</div>
                  <div class="gantt-head-dates num">${esc(c.dates)}</div>
                  <div class="gantt-head-status">${statusBadge(computeStatus(c.start, c.end))}</div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${DB.groups.map((g) => {
              const gid = String(g.group_id), count = groupCounts[gid] || 0, gs = schedMap[gid] || {};
              return `
                <tr>
                  <td class="gantt-sticky-col">
                    <div class="gantt-group-cell"${act('group-roster', { gid })}>
                      <div class="gantt-group-top"><span class="cartouche-badge">جروب ${esc(gid)}</span><span class="go" aria-hidden="true">↗</span></div>
                      <div class="gantt-group-count"><strong class="num">${count}</strong> طالب/ة</div>
                    </div>
                  </td>
                  ${roundCols.map((c) => {
                    if (c.order === '0') {
                      const meta = ROUND_META.elective, st = computeStatus(c.start, c.end);
                      return `<td class="gantt-cell"${act('round-detail', { round: 'elective', title: 'تدريب اختياري', gid, count })}>
                        <div class="gantt-cell-inner elective">
                          <div class="gantt-round-name"><span aria-hidden="true">${meta.icon}</span><span>تدريب اختياري</span></div>
                          <div class="gantt-cell-foot"><span class="badge ${meta.cls}">${count} طالب</span>${statusBadge(st)}</div>
                        </div></td>`;
                    }
                    const row = gs[c.order];
                    if (!row) return `<td class="gantt-cell gantt-empty"><span class="muted small">غير محدد</span></td>`;
                    const rKey = row.round_key, meta = ROUND_META[rKey] || { icon: '📌', label: row.round_name_ar || roundLabel(rKey), cls: 'badge-grey' };
                    const rStatus = computeStatus(row.start_date, row.end_date);
                    const matrixKey = c.order + '_' + rKey, mData = DB.roundMatrix[matrixKey];
                    let countText = `${count} طالب`;
                    if (mData && mData.groups.length > 1) {
                      const others = mData.groups.filter((x) => String(x.group_id) !== gid).map((x) => x.group_id).join('+');
                      countText = `${count} طالب · مع جروب ${others} · الإجمالي ${mData.total_students}`;
                    }
                    return `<td class="gantt-cell"${act('round-detail', { round: rKey, title: row.round_name_ar || roundLabel(rKey), gid, count, matrix: matrixKey })}>
                      <div class="gantt-cell-inner ${esc(rKey)}">
                        <div class="gantt-round-name"><span aria-hidden="true">${meta.icon}</span><span>${esc(row.round_name_ar || roundLabel(rKey))}</span></div>
                        <div class="gantt-cell-foot">
                          <span class="badge ${meta.cls} gantt-count-badge">${esc(countText)}</span>
                          ${statusBadge(rStatus)}
                        </div>
                      </div></td>`;
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
    extra += `<div class="alert-item alert-amber static"><span class="alert-icon">⚠️</span><div>هذا التوقيت يتدرب فيه <strong>جروب ${esc(gid)}</strong> مع جروب <strong>${esc(others)}</strong>. إجمالي الطلاب المتواجدين: <strong class="num">${DB.roundMatrix[mKey].total_students}</strong> طالب/ة.</div></div>`;
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
         ${btn('الانتقال لصفحة الوحدات البيطرية 🏥', 'goto-page', { page: 'units' })}
         ${btn(`قائمة طلاب جروب ${gid} 👥`, 'group-roster', { gid, replace: 1 }, 'btn-surface')}
       </div>`
    : `<div class="modal-actions">
         ${btn(`استعراض قائمة طلاب جروب ${gid} (${cnt} طالب) 👥`, 'group-roster', { gid, replace: 1 })}
       </div>`;

  openModal(`تفاصيل الدورة — جروب ${gid}`, `
    <div class="profile-chips" style="margin-bottom:14px">
      <span class="cartouche-badge-dark">جروب ${esc(gid)}</span>
      <span class="badge badge-gold">${esc(title)}</span>
    </div>${kv}${actions}`);
};
