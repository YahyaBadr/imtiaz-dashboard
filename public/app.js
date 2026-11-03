'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   app.js — Core Engine, Data Processing, Student Profile & Command Palette
   ═══════════════════════════════════════════════════════════════════════════ */

window.DB = {};

// ─── Automated Verification System ───────────────────────────────────────────
window.VERIFY = {
  checks: [],

  add(label, countValue, getLen) {
    this.checks.push({ label, countValue, getLen });
  },

  run() {
    if (this.checks.length === 0) return;
    const results = this.checks.map(({ label, countValue, getLen }) => {
      const listLen = getLen();
      return { label, countValue, listLen, ok: Number(countValue) === Number(listLen) };
    });
    this.checks = [];
    this._renderBadge(results);
  },

  _renderBadge(results) {
    const badge = document.getElementById('verify-badge');
    if (!badge) return;

    const failed = results.filter(r => !r.ok);
    badge.classList.remove('hidden');

    if (failed.length === 0) {
      badge.className = 'verify-badge verify-ok';
      badge.innerHTML = `✓ تدقيق متطابق (${results.length} فحص رقمي سليم)`;
    } else {
      badge.className = 'verify-badge verify-fail';
      badge.innerHTML =
        `⚠️ عدم تطابق في ${failed.length} رقم:<br>` +
        failed.map(f => `<small>${f.label}: المعروض <b>${f.countValue}</b> ≠ القائمة <b>${f.listLen}</b></small>`).join('<br>');
    }
  }
};

// ─── CSV Loader via local PapaParse ──────────────────────────────────────────
function loadCSV(filename) {
  return new Promise((resolve, reject) => {
    Papa.parse('./data/' + filename, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error:    e => reject(new Error('فشل قراءة الملف ' + filename + ': ' + e.message))
    });
  });
}

// ─── Clean float group ID ───────────────────────────────────────────────────
window.cleanGroupId = function(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  const num = parseFloat(str);
  return isNaN(num) ? str : String(Math.round(num));
};

// ─── Date & Status Computation ───────────────────────────────────────────────
window.getTodayStr = function() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

window.computeStatus = function(startDate, endDate) {
  if (!startDate || !endDate) return 'upcoming';
  const today = getTodayStr();
  if (today > endDate) return 'finished';
  if (today >= startDate && today <= endDate) return 'current';
  return 'upcoming';
};

window.computeAge = function(birthDateStr) {
  if (!birthDateStr) return 'غير محدد';
  const bdate = new Date(birthDateStr);
  if (isNaN(bdate.getTime())) return 'غير محدد';
  const today = new Date(getTodayStr());
  let age = today.getFullYear() - bdate.getFullYear();
  const m = today.getMonth() - bdate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bdate.getDate())) {
    age--;
  }
  return age > 0 ? `${age} سنة` : 'غير محدد';
};

window.statusBadge = function(status) {
  const map = {
    current:  ['badge-plum',    'جارٍ الآن'],
    upcoming: ['badge-grey',    'قادم'],
    finished: ['badge-emerald', 'انتهى'],
  };
  const [cls, label] = map[status] || ['badge-grey', status || 'غير محدد'];
  return `<span class="badge ${cls}">${label}</span>`;
};

window.roundLabel = function(key) {
  const map = {
    college:         'أقسام الكلية',
    units:           'وحدات بيطرية',
    poultry:         'دواجن',
    slaughter:       'مجازر وسلامة غذاء',
    equine_lab_fish: 'خيل ومعامل وسمك',
    elective:        'تدريب اختياري',
  };
  return map[key] || key || 'غير محدد';
};

// ─── Number Count-up Animation ───────────────────────────────────────────────
window.animateCountUp = function(el, target, duration = 600) {
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * ease);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
};

// ─── Presentation Mode Toggle ────────────────────────────────────────────────
window.togglePresentationMode = function() {
  const isPres = document.body.classList.toggle('presentation-mode');
  const btn = document.getElementById('presentation-btn');
  if (btn) {
    btn.innerHTML = isPres ? '<span>🖥️ خروج من وضع العرض</span>' : '<span>🖥️ وضع العرض</span>';
    btn.classList.toggle('active', isPres);
  }
};

// ─── Reusable Student List Component (Requested Bug Fix #2) ─────────────────
window.getInitials = function(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].substring(0, 2) : parts[0].substring(0, 1) + parts[1].substring(0, 1);
};

window.renderStudentListModal = function(title, students, breadcrumb = '') {
  const html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      ${breadcrumb ? `<div class="breadcrumb-bar">${breadcrumb}</div>` : '<div></div>'}
      <div class="badge badge-plum num" style="font-size:0.9rem">النتائج: ${students.length}</div>
    </div>
    <input type="text" class="table-search" id="modal-list-search" placeholder="🔍 بحث في القائمة..." style="width:100%; margin-bottom:12px" oninput="filterStudentList(this)">
    <div style="max-height:55vh; overflow-y:auto; border:1px solid var(--c-border); border-radius:8px;">
      <table class="student-table">
        <thead>
          <tr><th>الاسم</th><th>الجروب</th><th>النوع</th></tr>
        </thead>
        <tbody id="student-list-body">
          ${students.map(s => {
            if (!s) return '';
            const sKey = `${s.group_id}_${s.code_short}`;
            return `
              <tr class="clickable-row" onclick="openStudentProfile('${sKey}')">
                <td>
                  <div style="display:flex; align-items:center; gap:8px">
                    <div class="initials-avatar">${getInitials(s.full_name)}</div>
                    <strong>${s.full_name}</strong>
                  </div>
                </td>
                <td><span class="cartouche-badge">جروب ${s.group_id || '—'}</span></td>
                <td>${s.gender === 'F' ? '<span class="gender-f">أنثى ♀</span>' : s.gender === 'M' ? '<span class="gender-m">ذكر ♂</span>' : '—'}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  openModal(title, html);
};

window.filterStudentList = function(input) {
  const q = input.value.toLowerCase();
  document.querySelectorAll('#student-list-body tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.openStudentDirectoryModal = function() {
  renderStudentListModal('دليل كامل طلاب الدفعة', DB.students, '<span>الرئيسية</span> <span>›</span> <strong>الدليل</strong>');
};

window.openGroupRosterModal = function(groupId) {
  const students = DB.students.filter(s => String(s.group_id) === String(groupId));
  renderStudentListModal(`قائمة طلاب جروب ${groupId}`, students, '<span>الرئيسية</span> <span>›</span> <span>الجروبات</span>');
};

// ─── Student Profile Panel (Requested Avatar added) ─────────────────────────
window.openStudentProfile = function(studentKey) {
  const student = DB.studentLookup[studentKey];
  if (!student) {
    alert('لم يتم العثور على سجل بيانات الطالب: ' + studentKey);
    return;
  }

  const old = document.getElementById('profile-panel-overlay');
  if (old) old.remove();

  const rawPhone = (student.phone || '').trim();
  const phoneEmpty = !rawPhone;
  const phoneClean = rawPhone.replace(/\D/g, '');
  const phoneForWa = phoneClean.startsWith('0') ? phoneClean.slice(1) : phoneClean;
  const isPhoneCheck = student.phone_status === 'check';
  const emailVal = (student.email || '').trim();
  const emailEmpty = !emailVal;

  const rawNid = (student.national_id || '').trim();
  const isNidCheck = student.nid_status === 'check';
  const maskedNid = rawNid ? '••••••••••' + (rawNid.length >= 4 ? rawNid.slice(-4) : '') : 'غير متوفر';
  const ageStr = computeAge(student.birth_date);

  const prefFields = ['pref_FoodSafety_QC', 'pref_SmallAnimal', 'pref_Pharma_Vaccines', 'pref_Equine', 'pref_Poultry', 'pref_LargeAnimal'];
  const studentPrefs = prefFields.map(key => ({
      key, arabicName: DB.fieldsMap[key] || key, rank: parseInt(student[key], 10) || 99
    })).sort((a, b) => a.rank - b.rank);

  const journey = buildStudentJourney(student);

  const panel = document.createElement('div');
  panel.id = 'profile-panel-overlay';
  panel.className = 'modal-overlay profile-overlay';
  panel.innerHTML = `
    <div class="profile-drawer" role="dialog" aria-modal="true" aria-label="ملف الطالب">
      
      <div class="profile-header">
        <div style="flex:1; display:flex; align-items:center; gap:12px">
          <div class="initials-avatar" style="width:56px; height:56px; font-size:1.4rem; border:2px solid var(--c-gold);">${getInitials(student.full_name)}</div>
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
              <span class="badge ${student.gender === 'F' ? 'badge-rose' : 'badge-plum'}">${student.gender === 'F' ? 'أنثى ♀' : 'ذكر ♂'}</span>
              <span class="cartouche-badge-dark">جروب ${student.group_id || '—'}</span>
            </div>
            <h2 style="font-size:1.35rem; font-weight:700; color:#FFFFFF">${student.full_name}</h2>
          </div>
        </div>
        <button class="modal-close" onclick="closeStudentProfile()" aria-label="إغلاق">✕</button>
      </div>

      <div class="profile-body">
        ${student.student_notes ? `
          <div class="profile-section">
            <div class="alert-item alert-amber" style="padding:10px 14px; font-size:0.88rem">
              <span>📌</span>
              <div><strong>ملاحظة إدارية:</strong> ${student.student_notes}</div>
            </div>
          </div>
        ` : ''}

        <div class="profile-section">
          <div class="profile-section-title">🪪 البيانات الشخصية والرقم القومي</div>
          <div class="personal-info-card">
            <div>
              <div style="font-size:0.78rem; color:var(--c-text-muted)">الرقم القومي</div>
              <div style="font-weight:700; font-size:0.95rem; display:flex; align-items:center; gap:6px; margin-top:2px">
                <span id="nid-display" class="num">${window.APP_CONFIG && window.APP_CONFIG.SHOW_NID_BY_DEFAULT ? rawNid : maskedNid}</span>
                ${rawNid ? `<button class="btn btn-surface btn-sm" id="nid-toggle-btn" style="padding:1px 6px; font-size:0.72rem" onclick="toggleNidVisibility('${rawNid}', '${maskedNid}')">👁️</button>` : ''}
              </div>
              ${isNidCheck ? '<span class="badge badge-amber" style="font-size:0.72rem; margin-top:3px">⚠️ يحتاج مراجعة</span>' : ''}
            </div>
            <div>
              <div style="font-size:0.78rem; color:var(--c-text-muted)">تاريخ الميلاد / السن</div>
              <div style="font-weight:700; font-size:0.95rem; margin-top:2px">
                <span class="num">${student.birth_date || 'غير محدد'}</span>
                <span style="font-size:0.8rem; color:var(--c-text-muted); font-weight:400">(${ageStr})</span>
              </div>
            </div>
            <div style="grid-column: span 2; border-top:1px solid var(--c-border); padding-top:8px">
              <div style="font-size:0.76rem; color:var(--c-text-muted)">تاريخ التسجيل الأولي: <strong class="num">${student.registered_at || 'غير متوفر'}</strong></div>
            </div>
          </div>
        </div>

        <div class="profile-section hide-in-presentation">
          <div class="profile-section-title">📞 بيانات التواصل والاتصال المباشر</div>
          <div class="contact-box">
            <div class="contact-row">
              <div style="flex:1">
                <div style="font-size:0.8rem; color:var(--c-text-muted)">رقم الهاتف المحمول</div>
                <div style="font-weight:700; font-size:1.05rem; display:flex; align-items:center; gap:6px">
                  ${phoneEmpty ? '<span style="color:var(--c-text-subtle)">غير متوفر</span>' : `<span class="num">${rawPhone}</span>`}
                  ${isPhoneCheck ? '<span class="badge badge-amber" style="font-size:0.75rem">⚠️ هاتف يحتاج مراجعة</span>' : ''}
                </div>
              </div>
              ${!phoneEmpty ? `
                <div class="contact-actions">
                  <a href="tel:${phoneClean}" class="btn btn-plum btn-sm" title="اتصال هاتفي">📞 اتصال</a>
                  <a href="https://wa.me/20${phoneForWa}" target="_blank" rel="noopener" class="btn btn-emerald btn-sm" title="محادثة واتساب">💬 واتساب</a>
                  <button class="btn btn-surface btn-sm" onclick="navigator.clipboard.writeText('${rawPhone}'); alert('تم نسخ رقم الهاتف');">📋 نسخ</button>
                </div>
              ` : ''}
            </div>
            <div class="contact-row" style="margin-top:12px; padding-top:12px; border-top:1px solid var(--c-surface)">
              <div style="flex:1">
                <div style="font-size:0.8rem; color:var(--c-text-muted)">البريد الإلكتروني</div>
                <div style="font-weight:600; font-size:0.95rem">${emailEmpty ? '<span style="color:var(--c-text-subtle)">غير متوفر</span>' : emailVal}</div>
              </div>
              ${!emailEmpty ? `
                <div class="contact-actions">
                  <a href="mailto:${emailVal}" class="btn btn-plum btn-sm" title="إرسال بريد">✉️ مراسلة</a>
                  <button class="btn btn-surface btn-sm" onclick="navigator.clipboard.writeText('${emailVal}'); alert('تم نسخ البريد الإلكتروني');">📋 نسخ</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">🗺️ المسار التدريبي ومواقع التوزيع</div>
          <div class="journey-timeline">
            ${journey.map(step => `
              <div class="journey-step ${step.status}">
                <div class="journey-bullet"></div>
                <div class="journey-content">
                  <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="font-weight:700; color:var(--c-plum)">${step.roundName}</span>
                    ${statusBadge(step.status)}
                  </div>
                  <div style="font-size:0.84rem; color:var(--c-text-muted); margin:3px 0">📅 <span class="num">${step.dates}</span></div>
                  <div style="font-size:0.9rem">📍 موقع التدريب / المحطة: <strong>${step.station}</strong></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="profile-section">
          <div class="profile-section-title">⭐ ترتيب الرغبات والمجالات</div>
          <div class="pref-list">
            ${studentPrefs.map((p, idx) => `
              <div class="pref-item">
                <span class="pref-rank-badge num">#${idx + 1}</span>
                <span class="pref-name">${p.arabicName}</span>
                <span class="pref-score">الرغبة: <strong class="num">${p.rank < 99 ? p.rank : '—'}</strong></span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  panel.addEventListener('click', e => { if (e.target === panel) closeStudentProfile(); });
  document.body.appendChild(panel);
};

window.toggleNidVisibility = function(realNid, maskedNid) {
  const el = document.getElementById('nid-display');
  const btn = document.getElementById('nid-toggle-btn');
  if (!el) return;
  const isMasked = el.textContent.includes('••');
  el.textContent = isMasked ? realNid : maskedNid;
  if (btn) btn.textContent = isMasked ? '🙈' : '👁️';
};

window.closeStudentProfile = function() {
  const p = document.getElementById('profile-panel-overlay');
  if (p) p.remove();
};

function buildStudentJourney(student) {
  const gid = student.group_id;
  const sCode = student.student_code;
  const groupRounds = DB.roundSchedule.filter(r => r.group_id === gid).sort((a,b) => parseInt(a.round_order,10) - parseInt(b.round_order,10));
  const steps = [];

  const r1 = groupRounds.find(r => r.round_order === '1') || {};
  steps.push({ roundName: `الراوند 1 — ${r1.round_name_ar || 'أقسام الكلية'}`, dates: r1.start_date ? `${r1.start_date} إلى ${r1.end_date}` : '2026-09-20 إلى 2026-11-03', station: 'غير متاح بعد', status: computeStatus(r1.start_date || '2026-09-20', r1.end_date || '2026-11-03') });
  const r2 = groupRounds.find(r => r.round_order === '2') || {};
  const assignR2 = DB.assignments.find(a => (a.group_id === gid && a.code_short === student.code_short) || a.student_code === sCode);
  const r2Station = assignR2 ? (assignR2.unit_name || assignR2.round_name_ar || 'مسجل') : 'غير مسجل';
  steps.push({ roundName: `الراوند 2 — ${r2.round_name_ar || 'وحدات بيطرية'}`, dates: r2.start_date ? `${r2.start_date} إلى ${r2.end_date}` : '2026-11-07 إلى 2026-12-24', station: r2Station, status: computeStatus(r2.start_date || '2026-11-07', r2.end_date || '2026-12-24') });
  const r3 = groupRounds.find(r => r.round_order === '3') || {};
  steps.push({ roundName: `الراوند 3 — ${r3.round_name_ar || 'دواجن'}`, dates: r3.start_date ? `${r3.start_date} إلى ${r3.end_date}` : '2026-12-26 إلى 2027-02-09', station: 'غير متاح بعد', status: computeStatus(r3.start_date || '2026-12-26', r3.end_date || '2027-02-09') });
  const r4 = groupRounds.find(r => r.round_order === '4') || {};
  steps.push({ roundName: `الراوند 4 — ${r4.round_name_ar || 'مجازر / خيل'}`, dates: r4.start_date ? `${r4.start_date} إلى ${r4.end_date}` : '2027-02-07 إلى 2027-03-30', station: 'غير متاح بعد', status: computeStatus(r4.start_date || '2027-02-07', r4.end_date || '2027-03-30') });
  steps.push({ roundName: 'التدريب الاختياري', dates: '2027-04-03 إلى 2027-05-03', station: 'غير متاح بعد', status: computeStatus('2027-04-03', '2027-05-03') });

  return steps;
}

// ─── Command Palette & Search (Ctrl + K) ─────────────────────────────────────
window.openGlobalSearch = function() {
  const old = document.getElementById('search-modal-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'search-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="search-modal-box" role="dialog" aria-modal="true">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="global-search-input" class="search-box-input" placeholder="ابحث عن طالب، وحدة، جروب... (Ctrl+K)" autofocus>
        <button class="modal-close" onclick="document.getElementById('search-modal-overlay').remove()">✕</button>
      </div>
      <div class="search-results-list" id="search-results-list"></div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  const input = document.getElementById('global-search-input');
  const resultsContainer = document.getElementById('search-results-list');
  input.focus();

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsContainer.innerHTML = `<div style="padding:24px; text-align:center; color:var(--c-text-muted)">اكتب للبحث...</div>`;
      return;
    }
    let html = '';

    const matchUnits = DB.stationsUnits.filter(u => u.unit_name.toLowerCase().includes(q) || u.governorate.toLowerCase().includes(q));
    if (matchUnits.length > 0) {
      html += '<div class="search-category-header">الوحدات البيطرية</div>';
      matchUnits.forEach(u => {
        html += `<div class="search-result-row" onclick="document.getElementById('search-modal-overlay').remove(); showPage('units');"><span>🏥 وحدة ${u.unit_name}</span><span class="badge badge-round-units">${u.registered} مسجل</span></div>`;
      });
    }

    const matchGroups = DB.groups.filter(g => g.group_name.toLowerCase().includes(q) || String(g.group_id).includes(q));
    if (matchGroups.length > 0) {
      html += '<div class="search-category-header">الجروبات</div>';
      matchGroups.forEach(g => {
        html += `<div class="search-result-row" onclick="document.getElementById('search-modal-overlay').remove(); openGroupRosterModal('${g.group_id}');"><span>👥 ${g.group_name}</span><span class="cartouche-badge">${g.total_students} طالب</span></div>`;
      });
    }

    const matchStudents = DB.students.filter(s => (s.full_name || '').toLowerCase().includes(q) || String(s.student_code || '').includes(q) || String(s.code_short || '') === q || String(s.national_id || '').includes(q)).slice(0, 15);
    if (matchStudents.length > 0) {
      html += '<div class="search-category-header">الطلاب</div>';
      matchStudents.forEach(s => {
        const sKey = `${s.group_id}_${s.code_short}`;
        html += `<div class="search-result-row" onclick="document.getElementById('search-modal-overlay').remove(); openStudentProfile('${sKey}');"><div><div style="font-weight:700; color:var(--c-plum);">${s.full_name}</div><div style="font-size:0.8rem; color:var(--c-text-muted);">جروب ${s.group_id} | كود: <span class="num">${s.student_code}</span></div></div><span class="student-code">${s.code_short}</span></div>`;
      });
    }

    if (!html) html = `<div style="padding:24px; text-align:center; color:var(--c-text-muted)">لا توجد نتائج مطابقة لـ "${q}"</div>`;
    resultsContainer.innerHTML = html;
  });
};

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openGlobalSearch(); }
  if (e.key === 'Escape') { closeStudentProfile(); const s = document.getElementById('search-modal-overlay'); if (s) s.remove(); }
});

// ─── Modal Dialog ────────────────────────────────────────────────────────────
window.openModal = function(title, bodyHTML) {
  const old = document.getElementById('modal-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" aria-label="إغلاق" onclick="document.getElementById('modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

// ─── Table Sorting & Search ──────────────────────────────────────────────────
window.makeTableSortable = function(tableEl) {
  const headers = tableEl.querySelectorAll('th[data-col]');
  let sortCol = null, sortDir = 1;

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
      headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');

      const tbody = tableEl.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const av = a.querySelector(`td[data-col="${col}"]`)?.textContent.trim() || '';
        const bv = b.querySelector(`td[data-col="${col}"]`)?.textContent.trim() || '';
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return av.localeCompare(bv, 'ar') * sortDir;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
};

window.makeTableSearchable = function(inputEl, tableEl) {
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim().toLowerCase();
    tableEl.querySelectorAll('tbody tr').forEach(row => {
      row.style.display = q === '' || row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
};

// ─── Data Initialization & Sanitization ──────────────────────────────────────
async function loadAllData() {
  const [students, groups, roundsOverview, roundSchedule, stationsUnits, assignments, unregistered, round2Summary, roundDates, fields, issues, issuesR2] = await Promise.all([
    loadCSV('01_students.csv'), loadCSV('02_groups.csv'), loadCSV('03_rounds_overview.csv'), loadCSV('04_round_schedule.csv'),
    loadCSV('05_stations_units_draft.csv'), loadCSV('06_assignments_round2.csv'), loadCSV('07_unregistered_round2.csv'),
    loadCSV('08_round2_summary.csv'), loadCSV('09_round_dates.csv'), loadCSV('10_fields.csv'),
    loadCSV('00_data_issues.csv'), loadCSV('00_data_issues_round2.csv'),
  ]);

  DB.students       = students.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.groups         = groups.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.roundsOverview = roundsOverview;
  DB.roundSchedule  = roundSchedule.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.stationsUnits  = stationsUnits;
  DB.round2Summary  = round2Summary;
  DB.roundDates     = roundDates;
  DB.fields         = fields;
  DB.issues         = issues;
  DB.issuesR2       = issuesR2;
  DB.unregistered   = unregistered.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));

  DB.fieldsMap = {};
  fields.forEach(f => { DB.fieldsMap[f.column] = f.name_ar; });

  DB.studentLookup = {};
  DB.students.forEach(s => { DB.studentLookup[`${s.group_id}_${s.code_short}`] = s; DB.studentLookup[s.student_code] = s; });

  const rawAssignments = assignments.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  const dedupedList = [];
  const seenKey = new Set();
  rawAssignments.forEach(row => {
    const unit = (row.unit_name || '').trim();
    const key = `${row.group_id}_${row.code_short}_${unit}_${row.round_key}`;
    if (!seenKey.has(key)) { seenKey.add(key); dedupedList.push(row); }
  });
  DB.assignments = dedupedList;
  DB.rawAssignments = rawAssignments;

  // ── ADDED: Calculate Round Matrix with Combined Totals (Bug Fix #1) ──
  DB.roundMatrix = {};
  DB.roundSchedule.forEach(item => {
    const key = `${item.round_order}_${item.round_key}`;
    if (!DB.roundMatrix[key]) {
      DB.roundMatrix[key] = { round_order: item.round_order, round_key: item.round_key, round_name_ar: item.round_name_ar, groups: [], total_students: 0 };
    }
    const gInfo = DB.groups.find(g => String(g.group_id) === String(item.group_id));
    const count = gInfo ? parseInt(gInfo.total_students, 10) : 0;
    DB.roundMatrix[key].groups.push({ group_id: item.group_id, count });
    DB.roundMatrix[key].total_students += count;
  });
}

// ─── SPA Navigation ──────────────────────────────────────────────────────────
const PAGE_RENDERERS = {
  'overview':       () => renderOverview(document.getElementById('page-overview')),
  'schedule':       () => renderSchedule(document.getElementById('page-schedule')),
  'units':          () => renderUnits(document.getElementById('page-units')),
  'not-registered': () => renderNotRegistered(document.getElementById('page-not-registered')),
};

let _activePage = null;
window.showPage = function(pageId) {
  if (_activePage === pageId) return;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const pageEl = document.getElementById('page-' + pageId);
  if (!pageEl) return;
  pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
  if (!pageEl.dataset.rendered && PAGE_RENDERERS[pageId]) {
    PAGE_RENDERERS[pageId]();
    pageEl.dataset.rendered = 'true';
    setTimeout(() => VERIFY.run(), 60);
  } else {
    setTimeout(() => VERIFY.run(), 40);
  }
  _activePage = pageId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function init() {
  try {
    await loadAllData();
    const updateEl = document.getElementById('header-last-update');
    if (updateEl && window.APP_CONFIG) updateEl.textContent = `آخر تحديث للبيانات: ${window.APP_CONFIG.LAST_DATA_UPDATE}`;
    const loader = document.getElementById('loading-screen');
    if (loader) loader.remove();
    document.querySelectorAll('.nav-btn:not([disabled])').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    showPage('overview');
  } catch (err) {
    console.error('Initialization error:', err);
    const loader = document.getElementById('loading-screen');
    if (loader) loader.innerHTML = `<div class="card" style="border-color:var(--c-rose-border); background:var(--c-rose-bg); color:var(--c-rose); text-align:center; max-width:440px;"><p style="font-weight:700; margin-bottom:8px">⚠️ تعذر تحميل البيانات</p><p style="font-size:0.88rem">${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);