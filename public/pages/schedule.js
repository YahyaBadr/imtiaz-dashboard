'use strict';

function renderSchedule(container) {
  const roundCols = [
    { order: '1', title: 'الراوند 1', dates: '2026-09-20 إلى 2026-11-03', start: '2026-09-20', end: '2026-11-03' },
    { order: '2', title: 'الراوند 2', dates: '2026-11-07 إلى 2026-12-24', start: '2026-11-07', end: '2026-12-24' },
    { order: '3', title: 'الراوند 3', dates: '2026-12-26 إلى 2027-02-09', start: '2026-12-26', end: '2027-02-09' },
    { order: '4', title: 'الراوند 4', dates: '2027-02-07 إلى 2027-03-30', start: '2027-02-07', end: '2027-03-30' },
    { order: '0', title: 'تدريب اختياري', dates: '2027-04-03 إلى 2027-05-03', start: '2027-04-03', end: '2027-05-03' },
  ];

  const groupCounts = {};
  DB.groups.forEach(g => { groupCounts[g.group_id] = parseInt(g.total_students, 10) || 0; });

  const schedMap = {};
  DB.roundSchedule.forEach(r => {
    if (!schedMap[r.group_id]) schedMap[r.group_id] = {};
    schedMap[r.group_id][r.round_order] = r;
  });

  const roundMeta = {
    units:           { icon: '🏥', label: 'وحدات بيطرية', cls: 'badge-round-units' },
    college:         { icon: '🏛️', label: 'أقسام الكلية', cls: 'badge-round-college' },
    poultry:         { icon: '🐔', label: 'دواجن', cls: 'badge-round-poultry' },
    slaughter:       { icon: '🥩', label: 'مجازر وسلامة غذاء', cls: 'badge-round-slaughter' },
    equine_lab_fish: { icon: '🔬', label: 'خيل ومعامل وسمك', cls: 'badge-round-equine' },
    elective:        { icon: '🌟', label: 'تدريب اختياري', cls: 'badge-round-elective' }
  };

  const lotusSvg = `
    <svg class="title-ornament" viewBox="0 0 24 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/>
      <path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/>
      <circle cx="3" cy="7" r="2.2" fill="#E3A73C"/>
      <circle cx="21" cy="7" r="2.2" fill="#E3A73C"/>
    </svg>`;

  container.innerHTML = `
    <div class="card card-sm" style="margin-bottom: var(--gap); background:#FFFFFF; border-right:4px solid var(--c-gold)">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px">
        <div style="display:flex; align-items:center; gap:10px">
          <span style="font-size:1.4rem">📅</span>
          <div>
            <div style="font-size:1.15rem; font-weight:700; color:var(--c-plum); display:flex; align-items:center; gap:8px">
              ${lotusSvg}
              <span>مصفوفة التدوير الزمني للإمتياز</span>
            </div>
            <div style="font-size:0.84rem; color:var(--c-text-muted); margin-top:2px">
              انقر على أي خلية أو جروب لعرض تفاصيل التوزيع والكشوف المعتمدة
            </div>
          </div>
        </div>

        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
          <span class="badge badge-round-units">🏥 وحدات</span>
          <span class="badge badge-round-college">🏛️ أقسام</span>
          <span class="badge badge-round-poultry">🐔 دواجن</span>
          <span class="badge badge-round-slaughter">🥩 مجازر</span>
          <span class="badge badge-round-equine">🔬 خيل وسمك</span>
        </div>
      </div>
    </div>

    <div class="table-wrap" style="overflow-x:auto">
      <table class="gantt-matrix-table" id="gantt-table">
        <thead>
          <tr>
            <th style="min-width:140px; position:sticky; right:0; z-index:10; background:#F4EFE6">الجروب والقوام</th>
            ${roundCols.map(c => `
              <th style="min-width:220px">
                <div style="font-weight:700; color:var(--c-plum)">${c.title}</div>
                <div style="font-size:0.76rem; font-weight:400; color:var(--c-text-muted)" class="num">${c.dates}</div>
                <div style="margin-top:4px">${statusBadge(computeStatus(c.start, c.end))}</div>
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${DB.groups.map(g => {
            const gid = g.group_id;
            const count = groupCounts[gid] || 0;
            const groupSchedule = schedMap[gid] || {};

            return `
              <tr>
                <td style="position:sticky; right:0; z-index:5; background:#FFFFFF; border-left:2px solid var(--c-border); cursor:pointer"
                    onclick="openGroupRosterModal('${gid}')" title="انقر لفتح قائمة طلاب جروب ${gid}">
                  <div style="display:flex; align-items:center; justify-content:space-between">
                    <span class="cartouche-badge">جروب ${gid}</span>
                    <span style="font-size:0.75rem; color:var(--c-text-muted)">↗</span>
                  </div>
                  <div style="font-size:0.8rem; color:var(--c-text-muted); margin-top:4px">
                    <strong class="num">${count}</strong> طالب/ة
                  </div>
                </td>

                ${roundCols.map(c => {
                  if (c.order === '0') {
                    const st = computeStatus(c.start, c.end);
                    const meta = roundMeta.elective;
                    return `
                      <td class="gantt-cell" onclick="openRoundDetailModal('elective', 'تدريب اختياري', '${gid}', '${count}')">
                        <div class="gantt-cell-inner elective">
                          <div class="gantt-round-name">
                            <span>${meta.icon}</span> <span>تدريب اختياري</span>
                          </div>
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px">
                            <span class="badge ${meta.cls}">${count} طالب</span>
                            ${statusBadge(st)}
                          </div>
                        </div>
                      </td>`;
                  }

                  const row = groupSchedule[c.order];
                  if (!row) {
                    return `<td><span style="color:var(--c-text-subtle)">غير محدد</span></td>`;
                  }

                  const rStatus = computeStatus(row.start_date, row.end_date);
                  const rKey = row.round_key;
                  const meta = roundMeta[rKey] || { icon: '📌', label: row.round_name_ar || rKey, cls: 'badge-grey' };

                  // ── ADDED: Compute Combined Totals (Bug Fix #1) ──
                  const matrixKey = `${c.order}_${rKey}`;
                  const mData = DB.roundMatrix[matrixKey];
                  let countText = `${count} طالب`;
                  
                  if (mData && mData.groups.length > 1) {
                    const otherGroups = mData.groups.filter(x => String(x.group_id) !== String(gid)).map(x => x.group_id).join('+');
                    countText = `${count} طالب · مع جروب ${otherGroups} · الإجمالي ${mData.total_students}`;
                  }

                  return `
                    <td class="gantt-cell" onclick="openRoundDetailModal('${rKey}', '${escapeAttr(row.round_name_ar)}', '${gid}', '${count}', '${matrixKey}')">
                      <div class="gantt-cell-inner ${rKey}">
                        <div class="gantt-round-name">
                          <span>${meta.icon}</span>
                          <span>${row.round_name_ar || roundLabel(rKey)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; flex-wrap:wrap; gap:4px;">
                          <span class="badge ${meta.cls}" style="font-size:0.72rem; white-space:normal; text-align:right; line-height:1.4;">${countText}</span>
                          ${statusBadge(rStatus)}
                        </div>
                      </div>
                    </td>`;
                }).join('')}
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  VERIFY.add('صفوف جدول التدوير الزمني (8 جروبات)', DB.groups.length, () => document.querySelectorAll('#gantt-table tbody tr').length);
}

window.openRoundDetailModal = function(roundKey, roundTitle, groupId, studentCount, matrixKey) {
  let extraContent = '';

  if (matrixKey && DB.roundMatrix[matrixKey] && DB.roundMatrix[matrixKey].groups.length > 1) {
    const others = DB.roundMatrix[matrixKey].groups.filter(x => String(x.group_id) !== String(groupId)).map(x => x.group_id).join('+');
    extraContent += `
      <div class="alert-item alert-amber" style="margin-bottom:12px; padding:10px 14px;">
        <span>⚠️</span>
        <div>هذا التوقيت يتدرب فيه <strong>جروب ${groupId} مع جروب ${others}</strong>. إجمالي الطلاب المتواجدين: <strong class="num">${DB.roundMatrix[matrixKey].total_students}</strong> طالب/ة.</div>
      </div>`;
  }

  if (roundKey === 'units') {
    extraContent += `
      <p style="font-size:0.9rem; margin-top:12px; line-height:1.6">هذا الجروب موزع على الوحدات البيطرية بمحافظتي القاهرة والجيزة.</p>
      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-plum" onclick="document.getElementById('modal-overlay').remove(); showPage('units');">الانتقال لصفحة الوحدات البيطرية 🏥</button>
        <button class="btn btn-surface" onclick="document.getElementById('modal-overlay').remove(); openGroupRosterModal('${groupId}')">استعراض قائمة طلاب جروب ${groupId} 👥</button>
      </div>`;
  } else {
    extraContent += `
      <p style="font-size:0.9rem; margin-top:12px; line-height:1.6">المجال: <strong>${roundTitle}</strong><br>قوام الجروب: <strong class="num">${studentCount}</strong> طالب/ة.</p>
      <div style="margin-top:16px">
        <button class="btn btn-plum" onclick="document.getElementById('modal-overlay').remove(); openGroupRosterModal('${groupId}')">استعراض قائمة طلاب جروب ${groupId} (${studentCount} طالب) 👥</button>
      </div>`;
  }

  const html = `
    <div style="padding:10px 0">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
        <span class="cartouche-badge">جروب ${groupId}</span>
        <span class="badge badge-gold">${roundTitle}</span>
      </div>
      ${extraContent}
    </div>`;

  openModal(`تفاصيل الدورة — جروب ${groupId}`, html);
};

function escapeAttr(str) { return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }