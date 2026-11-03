'use strict';

function renderNotRegistered(container) {
  const rows = DB.unregistered;
  const byRound = {};
  rows.forEach(r => {
    const rk = r.round_key || 'unknown'; if (!byRound[rk]) byRound[rk] = {};
    const gid = r.group_id || 'غير محدد'; if (!byRound[rk][gid]) byRound[rk][gid] = [];
    byRound[rk][gid].push(r);
  });

  const roundOrder = ['units', 'equine_lab_fish', 'poultry', 'slaughter', 'college', 'unknown'];
  const sortedRounds = Object.keys(byRound).sort((a, b) => roundOrder.indexOf(a) - roundOrder.indexOf(b));
  const totalMissing = rows.length;

  // THE FIX: Hardcoded dimensions directly into the SVG
  const lotusSvg = `<svg class="title-ornament" width="22" height="12" style="width:22px !important; height:12px !important; max-width:22px !important; max-height:12px !important;" viewBox="0 0 24 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/><path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/><circle cx="3" cy="7" r="2.2" fill="#E3A73C"/><circle cx="21" cy="7" r="2.2" fill="#E3A73C"/></svg>`;

  container.innerHTML = `
    <div class="card card-sm" style="margin-bottom: calc(var(--gap)*1.5); background:#FFFFFF; border-right:4px solid var(--c-amber)">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.4rem">⚠️</span>
          <div>
            <div style="font-size:1.15rem; font-weight:700; color:var(--c-plum); display:flex; align-items:center; gap:8px">${lotusSvg}<span>الطلاب غير المسجلين بالدورة الثانية (R2)</span></div>
            <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">الإجمالي: <strong class="num" style="color:var(--c-rose)">${totalMissing}</strong> طالب/ة لم يعتمد تسجيلهم حتى الآن</div>
          </div>
        </div>
        <button class="btn btn-plum" onclick="copyAllNotRegistered()">📋 نسخ جميع الأسماء غير المسجلة</button>
      </div>
    </div>

    ${totalMissing === 0 ? `<div class="card" style="text-align:center; padding:48px; color:var(--c-green)"><p style="font-size:2.5rem; margin-bottom:12px">✓</p><p style="font-weight:700; font-size:1.1rem">جميع الطلاب مسجلون في الدورة الثانية بالكامل</p></div>` : sortedRounds.map(rk => buildRoundSection(rk, byRound[rk])).join('')}
  `;
}

function buildRoundSection(roundKey, groupsMap) {
  const roundTotal = Object.values(groupsMap).reduce((acc, arr) => acc + arr.length, 0);
  const secId = 'nr-section-' + roundKey;
  const groupBlocks = Object.keys(groupsMap).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(gid => buildGroupBlock(gid, groupsMap[gid], roundKey)).join('');

  return `
    <div class="nr-section" id="${secId}">
      <div class="nr-header"><h2 class="section-title" style="margin-bottom:0"><span>${roundLabel(roundKey)}</span></h2><span class="badge badge-amber num">${roundTotal} غير مسجل</span></div>
      ${groupBlocks}
    </div>`;
}

function buildGroupBlock(groupId, students, roundKey) {
  const blockId = 'nr-block-' + roundKey + '-g' + groupId;
  const rows = students.map(s => {
    const gIcon = s.gender === 'M' ? '<span class="gender-m">♂</span>' : s.gender === 'F' ? '<span class="gender-f">♀</span>' : '';
    const sKey = `${groupId}_${s.code_short}`.replace(/\s+/g, ''); 
    return `<div class="copyable-name" data-name="${escapeAttr(s.full_name)}" data-code="${s.code_short || ''}" data-group="${groupId}">${gIcon}<span class="clickable-student-name" onclick="openStudentProfile('${sKey}')" title="اضغط لفتح الملف الكامل للطالب">${s.full_name || 'غير محدد'}</span><span class="student-code">${s.code_short || '—'}</span></div>`;
  }).join('');

  return `
    <div style="margin-bottom: var(--gap)">
      <div class="nr-header">
        <div style="display:flex; align-items:center; gap:8px"><span class="cartouche-badge">جروب ${groupId}</span><span style="font-weight:700; font-size:0.92rem; color:var(--c-plum)">طلاب غير مسجلين</span></div>
        <div style="display:flex; gap:8px; align-items:center"><span class="badge badge-grey num">${students.length} طلاب</span><button class="btn btn-surface btn-sm" onclick="copyBlock('${blockId}', 'جروب ${groupId} — ${roundLabel(roundKey)}')">📋 نسخ</button></div>
      </div>
      <div class="copyable-list"><div class="copyable-list-inner" id="${blockId}">${rows}</div></div>
    </div>`;
}

window.copyBlock = function(blockId, label) {
  const block = document.getElementById(blockId); if (!block) return;
  const names = Array.from(block.querySelectorAll('.copyable-name')).map(el => `${el.querySelector('.clickable-student-name')?.textContent.trim() || ''}\t${el.querySelector('.student-code')?.textContent.trim() || ''}`);
  navigator.clipboard.writeText(`${label}\n` + names.join('\n')).then(() => alert(`تم نسخ ${names.length} اسم ✓`));
};

window.copyAllNotRegistered = function() {
  const allRows = Array.from(document.querySelectorAll('.copyable-name')).map(el => `${el.querySelector('.clickable-student-name')?.textContent.trim() || ''}\t${el.querySelector('.student-code')?.textContent.trim() || ''}\tجروب ${el.dataset.group || ''}`);
  navigator.clipboard.writeText(`قائمة الطلاب غير المسجلين بالدورة الثانية:\n` + allRows.join('\n')).then(() => alert(`تم نسخ ${allRows.length} اسماً بنجاح ✓`));
};

function escapeAttr(str) { return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
