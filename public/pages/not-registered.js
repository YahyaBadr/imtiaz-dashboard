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

  const lotusSvg = `<svg class="title-ornament" viewBox="0 0 24 14" aria-hidden="true"><path d="M12 1L16 6H8L12 1Z" fill="#E3A73C"/><path d="M12 13L8 8H16L12 13Z" fill="#E3A73C"/><circle cx="3" cy="7" r="2.2" fill="#E3A73C"/><circle cx="21" cy="7" r="2.2" fill="#E3A73C"/></svg>`;

  container.innerHTML = `
    <div class="card card-sm units-intro-card" style="margin-bottom: calc(var(--gap)*1.5); border-right:4px solid var(--c-amber)">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="empty-ico">${ico('warning')}</span>
          <div>
            <div style="font-size:1.15rem; font-weight:700; color:var(--c-plum); display:flex; align-items:center; gap:8px">${lotusSvg}<span>الطلاب غير المسجلين بالدورة الثانية (R2)</span></div>
            <div style="font-size:0.86rem; color:var(--c-text-muted); margin-top:2px">الإجمالي: <strong class="num" style="color:var(--c-rose)">${totalMissing}</strong> طالب/ة لم يعتمد تسجيلهم حتى الآن</div>
          </div>
        </div>
        ${btn('نسخ جميع الأسماء غير المسجلة', 'copy-all-nr', null, 'btn-plum')}
      </div>
    </div>

    ${totalMissing === 0 ? `<div class="card" style="text-align:center; padding:48px; color:var(--c-green)"><p style="font-size:2.5rem; margin-bottom:12px">${ico('check')}</p><p style="font-weight:700; font-size:1.1rem">جميع الطلاب مسجلون في الدورة الثانية بالكامل</p></div>` : sortedRounds.map(rk => buildRoundSection(rk, byRound[rk])).join('')}
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
    const gIcon = s.gender === 'M' ? `<span class="gender-m">${ico('male')}</span>` : s.gender === 'F' ? `<span class="gender-f">${ico('female')}</span>` : '';
    const sKey = `${groupId}_${s.code_short}`.replace(/\s+/g, ''); 
    return `<div class="copyable-name" data-name="${esc(s.full_name)}" data-code="${esc(s.code_short || '')}" data-group="${esc(groupId)}">${gIcon}<span class="clickable-student-name"${act('student', { sid: sKey })} title="اضغط لفتح الملف الكامل للطالب">${esc(s.full_name || 'غير محدد')}</span><span class="student-code">${esc(s.code_short || '—')}</span></div>`;
  }).join('');

  return `
    <div style="margin-bottom: var(--gap)">
      <div class="nr-header">
        <div style="display:flex; align-items:center; gap:8px"><span class="cartouche-badge">جروب ${groupId}</span><span style="font-weight:700; font-size:0.92rem; color:var(--c-plum)">طلاب غير مسجلين</span></div>
        <div style="display:flex; gap:8px; align-items:center"><span class="badge badge-grey num">${students.length} طلاب</span>${btn('نسخ', 'copy-block', { block: blockId, label: 'جروب ' + groupId + ' — ' + roundLabel(roundKey) }, 'btn-surface btn-sm')}</div>
      </div>
      <div class="copyable-list"><div class="copyable-list-inner" id="${blockId}">${rows}</div></div>
    </div>`;
}

window.copyBlock = function (blockId, label) {
  const block = document.getElementById(blockId); if (!block) { toast('تعذّر العثور على القائمة'); return; }
  const names = Array.from(block.querySelectorAll('.copyable-name')).map((el) => {
    const n = el.querySelector('.clickable-student-name'), c = el.querySelector('.student-code');
    return `${(n ? n.textContent : '').trim()}\t${(c ? c.textContent : '').trim()}`;
  });
  copyText(`${label} (${names.length}):\n` + names.join('\n'), `تم نسخ ${names.length} اسماً ${ico('check')}`);
};

window.copyAllNotRegistered = function () {
  const allRows = Array.from(document.querySelectorAll('#page-not-registered .copyable-name')).map((el) => {
    const n = el.querySelector('.clickable-student-name'), c = el.querySelector('.student-code');
    return `${(n ? n.textContent : '').trim()}\t${(c ? c.textContent : '').trim()}\tجروب ${el.dataset.group || ''}`;
  });
  if (!allRows.length) { toast('لا توجد أسماء لنسخها'); return; }
  copyText('قائمة الطلاب غير المسجلين بالدورة الثانية:\n' + allRows.join('\n'), `تم نسخ ${allRows.length} اسماً ${ico('check')}`);
};


/* ═══ أزرار صفحة غير المسجلين — عبر المعالج الموحّد ═══ */
registerAction('copy-block', (el) => copyBlock(el.dataset.block, el.dataset.label || ''));
registerAction('copy-all-nr', () => copyAllNotRegistered());
