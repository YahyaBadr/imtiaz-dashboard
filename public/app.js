'use strict';

window.DB = {};

window.VERIFY = {
  checks: [],
  add(label, countValue, getLen) { this.checks.push({ label, countValue, getLen }); },
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
      badge.innerHTML = `⚠️ عدم تطابق في ${failed.length} رقم:<br>` + failed.map(f => `<small>${f.label}: المعروض <b>${f.countValue}</b> ≠ القائمة <b>${f.listLen}</b></small>`).join('<br>');
    }
  }
};

// ── NEW FORMATTING HELPERS ──
window.formatDate = function(dateStr) {
  if (!dateStr) return 'غير محدد';
  const str = String(dateStr);
  if (str.includes('T')) return str.split('T')[0]; // Removes the time part
  return str;
};

window.formatPhone = function(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, ''); // Keep only numbers
  // If it's 10 digits and starts with 1 (Egyptian number missing zero)
  if (p.length === 10 && p.startsWith('1')) return '0' + p;
  return p;
};
// ─────────────────────────────

function loadCSV(filename) {
  if (window.APP_CONFIG && window.APP_CONFIG.API_URL) {
    const sheetName = filename.replace('.csv', '');
    return fetch(`${window.APP_CONFIG.API_URL}?sheet=${sheetName}`).then(res => res.json()).catch(err => { console.error(err); return []; });
  }
  return new Promise((resolve, reject) => {
    Papa.parse('./data/' + filename, {
      download: true, header: true, skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: e => reject(new Error('فشل قراءة الملف ' + filename))
    });
  });
}

window.cleanGroupId = function(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  const num = parseFloat(str);
  return isNaN(num) ? str : String(Math.round(num));
};

window.getTodayStr = function() {
  const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0'); const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

window.computeStatus = function(startDate, endDate) {
  if (!startDate || !endDate) return 'upcoming';
  const today = getTodayStr();
  const sDate = formatDate(startDate);
  const eDate = formatDate(endDate);
  if (today > eDate) return 'finished';
  if (today >= sDate && today <= eDate) return 'current';
  return 'upcoming';
};

window.computeAge = function(birthDateStr) {
  if (!birthDateStr) return 'غير محدد';
  const cleanDate = formatDate(birthDateStr);
  const bdate = new Date(cleanDate);
  if (isNaN(bdate.getTime())) return 'غير محدد';
  const today = new Date(getTodayStr());
  let age = today.getFullYear() - bdate.getFullYear();
  const m = today.getMonth() - bdate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bdate.getDate())) age--;
  return age > 0 ? `${age} سنة` : 'غير محدد';
};

window.statusBadge = function(status) {
  const map = { current: ['badge-plum', 'جارٍ الآن'], upcoming: ['badge-grey', 'قادم'], finished: ['badge-emerald', 'انتهى'] };
  const [cls, label] = map[status] || ['badge-grey', status || 'غير محدد'];
  return `<span class="badge ${cls}">${label}</span>`;
};

window.roundLabel = function(key) {
  const map = { college: 'أقسام الكلية', units: 'وحدات بيطرية', poultry: 'دواجن', slaughter: 'مجازر وسلامة غذاء', equine_lab_fish: 'خيل ومعامل وسمك', elective: 'تدريب اختياري' };
  return map[key] || key || 'غير محدد';
};

window.animateCountUp = function(el, target, duration = 600) {
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * ease);
    if (p < 1) requestAnimationFrame(step); else el.textContent = target;
  }
  requestAnimationFrame(step);
};

window.togglePresentationMode = function() {
  const isPres = document.body.classList.toggle('presentation-mode');
  const btn = document.getElementById('presentation-btn');
  if (btn) btn.innerHTML = isPres ? '<span>🖥️ خروج من وضع العرض</span>' : '<span>🖥️ وضع العرض</span>';
};

window.getInitials = function(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  return parts.length === 1 ? parts[0].substring(0, 2) : parts[0].substring(0, 1) + parts[1].substring(0, 1);
};

window.renderStudentListModal = function(title, students, breadcrumb = '') {
  const html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      ${breadcrumb ? `<div class="breadcrumb-bar">${breadcrumb}</div>` : '<div></div>'}
      <div class="badge badge-plum num" style="font-size:0.9rem">الإجمالي: ${students.length}</div>
    </div>
    <input type="text" class="table-search" id="modal-list-search" placeholder="🔍 بحث في القائمة..." style="width:100%; margin-bottom:12px" oninput="filterStudentList(this)">
    <div style="max-height:55vh; overflow-y:auto; border:1px solid var(--c-border); border-radius:8px;">
      <table class="student-table">
        <thead><tr><th>الاسم</th><th>الجروب</th><th>النوع</th></tr></thead>
        <tbody id="student-list-body">
          ${students.map(s => {
            if (!s) return '';
            const key = `${s.group_id}_${s.code_short}`.replace(/\s+/g, ''); 
            return `
              <tr class="clickable-row" onclick="openStudentProfile('${key}')">
                <td>
                  <div style="display:flex; align-items:center; gap:8px">
                    <div class="initials-avatar">${getInitials(s.full_name)}</div>
                    <strong>${s.full_name || 'غير محدد'}</strong>
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

window.filterStudentList = function(input) { const q = input.value.toLowerCase(); document.querySelectorAll('#student-list-body tr').forEach(r => { r.style.display = String(r.textContent).toLowerCase().includes(q) ? '' : 'none'; }); };
window.openStudentDirectoryModal = function() { renderStudentListModal('دليل كامل طلاب الدفعة', DB.students, 'الرئيسية › الدليل'); };
window.openGroupRosterModal = function(groupId) { const st = DB.students.filter(s => String(s.group_id) === String(groupId)); renderStudentListModal(`قائمة طلاب جروب ${groupId}`, st); };

window.openStudentProfile = function(rawKey) {
  try {
    const cleanKey = String(rawKey).replace(/\s+/g, '');
    const student = DB.studentLookup[cleanKey];
    
    if (!student) { alert('لم يتم العثور على سجل بيانات الطالب'); return; }

    const old = document.getElementById('profile-panel-overlay');
    if (old) old.remove();

    // Format phone and dates
    const rawPhone = String(student.phone || '').trim();
    const displayPhone = formatPhone(rawPhone); 
    const phoneEmpty = !displayPhone;
    const phoneClean = displayPhone.replace(/\D/g, '');
    const phoneForWa = phoneClean.startsWith('0') ? phoneClean.slice(1) : phoneClean;
    const isPhoneCheck = student.phone_status === 'check';
    
    const emailVal = String(student.email || '').trim();
    const emailEmpty = !emailVal;

    const rawNid = String(student.national_id || '').trim();
    const isNidCheck = student.nid_status === 'check';
    const maskedNid = rawNid ? '••••••••••' + (rawNid.length >= 4 ? rawNid.slice(-4) : '') : 'غير متوفر';
    
    // Format Dates
    const displayBirthDate = formatDate(student.birth_date);
    const displayRegDate = formatDate(student.registered_at);
    const ageStr = computeAge(displayBirthDate);

    const prefFields = ['pref_FoodSafety_QC', 'pref_SmallAnimal', 'pref_Pharma_Vaccines', 'pref_Equine', 'pref_Poultry', 'pref_LargeAnimal'];
    const studentPrefs = prefFields.map(key => ({ key, arabicName: DB.fieldsMap[key] || key, rank: parseInt(student[key], 10) || 99 })).sort((a, b) => a.rank - b.rank);

    const journey = buildStudentJourney(student);

    const panel = document.createElement('div');
    panel.id = 'profile-panel-overlay';
    panel.className = 'modal-overlay profile-overlay';
    panel.innerHTML = `
      <div class="profile-drawer" role="dialog" aria-modal="true">
        
        <div class="profile-header">
          <div style="flex:1">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
              <span class="badge ${student.gender === 'F' ? 'badge-rose' : 'badge-plum'}">${student.gender === 'F' ? 'أنثى ♀' : 'ذكر ♂'}</span>
              <span class="cartouche-badge-dark">جروب ${student.group_id || '—'}</span>
              <span class="student-code">${student.code_short || '—'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px">
              <div class="initials-avatar" style="width:48px; height:48px; font-size:1.2rem; border:2px solid var(--c-gold);">${getInitials(student.full_name)}</div>
              <div>
                <h2 style="font-size:1.35rem; font-weight:700; color:#FFFFFF">${student.full_name || 'غير محدد'}</h2>
                <div style="font-size:0.84rem; color:#E2D7E5">الكود الأكاديمي: <span class="num">${student.student_code || '—'}</span></div>
              </div>
            </div>
          </div>
          <button class="modal-close" onclick="closeStudentProfile()" aria-label="إغلاق">✕</button>
        </div>

        <div class="profile-body">
          ${student.student_notes ? `<div class="profile-section"><div class="alert-item alert-amber" style="padding:10px 14px; font-size:0.88rem"><span>📌</span><div><strong>ملاحظة إدارية:</strong> ${student.student_notes}</div></div></div>` : ''}

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
                  <span class="num">${displayBirthDate}</span>
                  <span style="font-size:0.8rem; color:var(--c-text-muted); font-weight:400">(${ageStr})</span>
                </div>
              </div>
              <div style="grid-column: span 2; border-top:1px solid var(--c-border); padding-top:8px">
                <div style="font-size:0.76rem; color:var(--c-text-muted)">تاريخ التسجيل: <strong class="num">${displayRegDate}</strong></div>
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
                    ${phoneEmpty ? '<span style="color:var(--c-text-subtle)">غير متوفر</span>' : `<span class="num">${displayPhone}</span>`}
                    ${isPhoneCheck ? '<span class="badge badge-amber" style="font-size:0.75rem">⚠️ هاتف يحتاج مراجعة</span>' : ''}
                  </div>
                </div>
                ${!phoneEmpty ? `
                  <div class="contact-actions">
                    <a href="tel:${phoneClean}" class="btn btn-plum btn-sm">📞 اتصال</a>
                    <a href="https://wa.me/20${phoneForWa}" target="_blank" class="btn btn-emerald btn-sm">💬 واتساب</a>
                    <button class="btn btn-surface btn-sm" onclick="navigator.clipboard.writeText('${displayPhone}'); alert('تم نسخ رقم الهاتف');">📋 نسخ</button>
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
                    <a href="mailto:${emailVal}" class="btn btn-plum btn-sm">✉️ مراسلة</a>
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
                    <div style="font-size:0.9rem">📍 موقع التدريب: <strong>${step.station}</strong></div>
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
  } catch (err) {
    console.error(err); alert("حدث خطأ: " + err.message);
  }
};

window.toggleNidVisibility = function(realNid, maskedNid) {
  const el = document.getElementById('nid-display'); const btn = document.getElementById('nid-toggle-btn');
  if (!el) return;
  const isMasked = el.textContent.includes('••');
  el.textContent = isMasked ? realNid : maskedNid;
  if (btn) btn.textContent = isMasked ? '🙈' : '👁️';
};

window.closeStudentProfile = function() { const p = document.getElementById('profile-panel-overlay'); if (p) p.remove(); };

function buildStudentJourney(student) {
  const gid = student.group_id; const sCode = student.student_code;
  const groupRounds = DB.roundSchedule.filter(r => r.group_id === gid).sort((a,b) => parseInt(a.round_order,10) - parseInt(b.round_order,10));
  const steps = [];
  
  const r1 = groupRounds.find(r => r.round_order === '1') || {};
  const r1Dates = r1.start_date ? `${formatDate(r1.start_date)} إلى ${formatDate(r1.end_date)}` : 'غير متاح';
  steps.push({ roundName: `الراوند 1 — ${r1.round_name_ar || 'أقسام الكلية'}`, dates: r1Dates, station: 'غير متاح بعد', status: computeStatus(r1.start_date || '2026-09-20', r1.end_date || '2026-11-03') });
  
  const r2 = groupRounds.find(r => r.round_order === '2') || {};
  const assignR2 = DB.assignments.find(a => (a.group_id === gid && a.code_short === student.code_short) || a.student_code === sCode);
  const r2Station = assignR2 ? (assignR2.unit_name || assignR2.round_name_ar || 'مسجل') : 'غير مسجل';
  const r2Dates = r2.start_date ? `${formatDate(r2.start_date)} إلى ${formatDate(r2.end_date)}` : 'غير متاح';
  steps.push({ roundName: `الراوند 2 — ${r2.round_name_ar || 'وحدات بيطرية'}`, dates: r2Dates, station: r2Station, status: computeStatus(r2.start_date || '2026-11-07', r2.end_date || '2026-12-24') });
  
  const r3 = groupRounds.find(r => r.round_order === '3') || {};
  const r3Dates = r3.start_date ? `${formatDate(r3.start_date)} إلى ${formatDate(r3.end_date)}` : 'غير متاح';
  steps.push({ roundName: `الراوند 3 — ${r3.round_name_ar || 'دواجن'}`, dates: r3Dates, station: 'غير متاح بعد', status: computeStatus(r3.start_date || '2026-12-26', r3.end_date || '2027-02-09') });
  
  const r4 = groupRounds.find(r => r.round_order === '4') || {};
  const r4Dates = r4.start_date ? `${formatDate(r4.start_date)} إلى ${formatDate(r4.end_date)}` : 'غير متاح';
  steps.push({ roundName: `الراوند 4 — ${r4.round_name_ar || 'مجازر / خيل'}`, dates: r4Dates, station: 'غير متاح بعد', status: computeStatus(r4.start_date || '2027-02-07', r4.end_date || '2027-03-30') });
  
  return steps;
}

window.openGlobalSearch = function() {
  const old = document.getElementById('search-modal-overlay'); if (old) old.remove();
  const overlay = document.createElement('div'); overlay.id = 'search-modal-overlay'; overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="search-modal-box"><div class="search-input-wrap"><span class="search-icon">🔍</span><input type="text" id="global-search-input" class="search-box-input" placeholder="ابحث..." autofocus><button class="modal-close" onclick="document.getElementById('search-modal-overlay').remove()">✕</button></div><div class="search-results-list" id="search-results-list"></div></div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('global-search-input'); input.focus();
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase(); if (!q) { document.getElementById('search-results-list').innerHTML = ''; return; }
    const matchStudents = DB.students.filter(s => String(s.full_name || '').toLowerCase().includes(q) || String(s.student_code || '').includes(q) || String(s.code_short || '') === q).slice(0, 15);
    document.getElementById('search-results-list').innerHTML = matchStudents.map(s => {
      const key = `${s.group_id}_${s.code_short}`.replace(/\s+/g, '');
      return `<div class="search-result-row" onclick="document.getElementById('search-modal-overlay').remove(); openStudentProfile('${key}')"><div><strong>${s.full_name || 'غير محدد'}</strong><br><small>جروب ${s.group_id}</small></div></div>`;
    }).join('');
  });
};

window.openModal = function(title, bodyHTML) {
  const old = document.getElementById('modal-overlay'); if (old) old.remove();
  const overlay = document.createElement('div'); overlay.id = 'modal-overlay'; overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box"><div class="modal-header"><h2 class="modal-title">${title}</h2><button class="modal-close" onclick="document.getElementById('modal-overlay').remove()">✕</button></div><div class="modal-body">${bodyHTML}</div></div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); }); document.body.appendChild(overlay);
};

window.makeTableSortable = function(tableEl) {
  const headers = tableEl.querySelectorAll('th[data-col]'); let sortCol = null, sortDir = 1;
  headers.forEach(th => { th.addEventListener('click', () => {
      const col = th.dataset.col; if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
      headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc')); th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
      const tbody = tableEl.querySelector('tbody'); const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const av = a.querySelector(`td[data-col="${col}"]`)?.textContent.trim() || ''; const bv = b.querySelector(`td[data-col="${col}"]`)?.textContent.trim() || '';
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir; return av.localeCompare(bv, 'ar') * sortDir;
      }); rows.forEach(r => tbody.appendChild(r));
  }); });
};

window.makeTableSearchable = function(inputEl, tableEl) {
  inputEl.addEventListener('input', () => { const q = inputEl.value.trim().toLowerCase(); tableEl.querySelectorAll('tbody tr').forEach(row => { row.style.display = q === '' || String(row.textContent).toLowerCase().includes(q) ? '' : 'none'; }); });
};

async function loadAllData() {
  const [students, groups, roundsOverview, roundSchedule, stationsUnits, assignments, unregistered, round2Summary, roundDates, fields, issues, issuesR2] = await Promise.all([
    loadCSV('01_students.csv'), loadCSV('02_groups.csv'), loadCSV('03_rounds_overview.csv'), loadCSV('04_round_schedule.csv'),
    loadCSV('05_stations_units_draft.csv'), loadCSV('06_assignments_round2.csv'), loadCSV('07_unregistered_round2.csv'),
    loadCSV('08_round2_summary.csv'), loadCSV('09_round_dates.csv'), loadCSV('10_fields.csv'),
    loadCSV('00_data_issues.csv'), loadCSV('00_data_issues_round2.csv'),
  ]);

  DB.students = students.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.groups = groups.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.roundSchedule = roundSchedule.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.stationsUnits = stationsUnits; DB.round2Summary = round2Summary; DB.unregistered = unregistered.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));
  DB.fields = fields; DB.fieldsMap = {}; fields.forEach(f => { DB.fieldsMap[f.column] = f.name_ar; });

  DB.studentLookup = {};
  DB.students.forEach(s => {
    const cleanKey = `${s.group_id}_${s.code_short}`.replace(/\s+/g, ''); 
    DB.studentLookup[cleanKey] = s;
    DB.studentLookup[String(s.student_code).replace(/\s+/g, '')] = s;
  });

  DB.assignments = assignments.map(r => ({ ...r, group_id: cleanGroupId(r.group_id) }));

  DB.roundMatrix = {};
  DB.roundSchedule.forEach(item => {
    const key = `${item.round_order}_${item.round_key}`;
    if (!DB.roundMatrix[key]) DB.roundMatrix[key] = { round_order: item.round_order, round_key: item.round_key, round_name_ar: item.round_name_ar, groups: [], total_students: 0 };
    const gInfo = DB.groups.find(g => String(g.group_id) === String(item.group_id));
    const count = gInfo ? parseInt(gInfo.total_students, 10) : 0;
    DB.roundMatrix[key].groups.push({ group_id: item.group_id, count });
    DB.roundMatrix[key].total_students += count;
  });
}

const PAGE_RENDERERS = { 'overview': () => renderOverview(document.getElementById('page-overview')), 'schedule': () => renderSchedule(document.getElementById('page-schedule')), 'units': () => renderUnits(document.getElementById('page-units')), 'not-registered': () => renderNotRegistered(document.getElementById('page-not-registered')) };
let _activePage = null;
window.showPage = function(pageId) {
  if (_activePage === pageId) return;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const pageEl = document.getElementById('page-' + pageId); if (!pageEl) return; pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
  if (!pageEl.dataset.rendered && PAGE_RENDERERS[pageId]) { PAGE_RENDERERS[pageId](); pageEl.dataset.rendered = 'true'; setTimeout(() => VERIFY.run(), 60); }
  _activePage = pageId; window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function init() {
  try {
    await loadAllData();
    const updateEl = document.getElementById('header-last-update'); if (updateEl && window.APP_CONFIG) updateEl.textContent = `آخر تحديث للبيانات: ${window.APP_CONFIG.LAST_DATA_UPDATE}`;
    const loader = document.getElementById('loading-screen'); if (loader) loader.remove();
    document.querySelectorAll('.nav-btn:not([disabled])').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    showPage('overview');
  } catch (err) { console.error(err); }
}
document.addEventListener('DOMContentLoaded', init);
