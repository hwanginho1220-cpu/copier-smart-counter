/**
 * 교회 순심방 신청 메인 애플리케이션 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {
  // 상태 관리
  let currentTab = 'apply'; // 'apply' | 'calendar' | 'status' | 'admin'
  let calendar = null;
  let adminAuthenticated = false;
  const ADMIN_PIN = '1234'; // 목사님/관리자 기본 핀번호

  // DOM 요소 참조
  const tabBtns = document.querySelectorAll('.tab-nav-btn');
  const tabContents = {
    apply: document.getElementById('tab-content-apply'),
    calendar: document.getElementById('tab-content-calendar'),
    status: document.getElementById('tab-content-status'),
    admin: document.getElementById('tab-content-admin')
  };

  // 폼 필드
  const form = document.getElementById('visit-form');
  const soonSelect = document.getElementById('soon-select');
  const customSoonWrap = document.getElementById('custom-soon-wrap');
  const customSoonInput = document.getElementById('custom-soon-input');
  const leaderInput = document.getElementById('leader-name');
  const dateInput = document.getElementById('visit-date');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');
  const placeInput = document.getElementById('visit-place');
  const attendeesInput = document.getElementById('attendees-count');
  const prayerTopicInput = document.getElementById('prayer-topic');
  const submitBtn = document.getElementById('submit-btn');
  const conflictAlert = document.getElementById('conflict-alert');
  const soonConflictAlert = document.getElementById('soon-conflict-alert');
  const daySlotPreview = document.getElementById('day-slot-preview');

  // 상단 현황 배지
  const cloudStatusBadge = document.getElementById('cloud-status-badge');
  const headerSummaryText = document.getElementById('header-summary-text');
  const headerProgressBar = document.getElementById('header-progress-bar');

  // ==========================================
  // 1. 초기화 및 순 드롭다운 세팅 (여성순, 직여순, 남성순)
  // ==========================================
  function initSoonSelectOptions() {
    const soonGroups = window.visitStore.getSoonGroups();
    soonSelect.innerHTML = '<option value="">-- 순을 선택하세요 (여성/직여/남성) --</option>';

    soonGroups.forEach((group) => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = group.category;
      group.items.forEach((soon) => {
        const opt = document.createElement('option');
        opt.value = soon;
        opt.textContent = soon;
        optGroup.appendChild(opt);
      });
      soonSelect.appendChild(optGroup);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '✏️ 직접 입력 (기타 순)';
    soonSelect.appendChild(customOpt);
  }

  // 오늘 날짜를 기본값으로 설정
  function initDefaultDates() {
    const today = new Date();
    // 심방은 보통 주말이나 다음 주를 신청하므로 기본 날짜를 내일 또는 오늘로
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    dateInput.value = todayStr;
    dateInput.min = todayStr; // 지난 날짜 신청 방지
  }

  // ==========================================
  // 2. 탭 전환
  // ==========================================
  function switchTab(tabKey) {
    currentTab = tabKey;

    tabBtns.forEach((btn) => {
      if (btn.getAttribute('data-tab') === tabKey) {
        btn.classList.add('border-blue-600', 'text-blue-600', 'bg-blue-50/50');
        btn.classList.remove('border-transparent', 'text-slate-500', 'hover:text-slate-700');
      } else {
        btn.classList.remove('border-blue-600', 'text-blue-600', 'bg-blue-50/50');
        btn.classList.add('border-transparent', 'text-slate-500', 'hover:text-slate-700');
      }
    });

    Object.keys(tabContents).forEach((k) => {
      if (tabContents[k]) {
        if (k === tabKey) {
          tabContents[k].classList.remove('hidden');
        } else {
          tabContents[k].classList.add('hidden');
        }
      }
    });

    // 탭 전환 시 필요한 렌더링
    if (tabKey === 'calendar' && calendar) {
      calendar.render();
      renderSelectedDateSchedule(calendar.selectedDateStr);
    } else if (tabKey === 'status') {
      renderSoonStatusBoard();
    } else if (tabKey === 'admin') {
      renderAdminView();
    }
  }

  // ==========================================
  // 3. 중복 실시간 검증 (Validation)
  // ==========================================
  function getSelectedSoonName() {
    if (soonSelect.value === '__custom__') {
      return customSoonInput.value.trim();
    }
    return soonSelect.value.trim();
  }

  function validateConflict() {
    const soonName = getSelectedSoonName();
    const date = dateInput.value;
    const startTime = startTimeInput.value;
    const endTime = endTimeInput.value;

    let isValid = true;

    // 1. 순 중복 검사
    if (soonName) {
      const soonCheck = window.visitStore.checkSoonDuplicate(soonName);
      if (soonCheck.isDuplicate) {
        soonConflictAlert.classList.remove('hidden');
        soonConflictAlert.innerHTML = `
          <div class="flex items-start gap-2 text-amber-800">
            <svg class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <div>
              <span class="font-bold">[중복 신청 주의]</span> ${soonCheck.reason}<br>
              <span class="text-xs text-amber-700">이미 신청된 일정이 있습니다. 일정 변경이 필요하시면 아래 관리자 문의 또는 목사님께 말씀해주세요.</span>
            </div>
          </div>
        `;
        isValid = false;
      } else {
        soonConflictAlert.classList.add('hidden');
      }
    } else {
      soonConflictAlert.classList.add('hidden');
    }

    // 2. 시간 충돌 검사
    if (date && startTime && endTime) {
      const timeCheck = window.visitStore.checkTimeConflict(date, startTime, endTime);
      if (timeCheck.hasConflict) {
        conflictAlert.classList.remove('hidden');
        conflictAlert.innerHTML = `
          <div class="flex items-start gap-2 text-rose-800">
            <svg class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div>
              <span class="font-bold">[시간 중복 - 신청 불가]</span> ${timeCheck.reason}<br>
              <span class="text-xs text-rose-700">먼저 신청한 다른 순과 시간이 겹칩니다. 다른 시간대를 선택해주세요.</span>
            </div>
          </div>
        `;
        conflictAlert.className = 'p-3 bg-rose-50 border border-rose-200 rounded-xl mb-4 animate-shake';
        isValid = false;
      } else {
        // 충돌 없음
        conflictAlert.classList.remove('hidden');
        conflictAlert.className = 'p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-4';
        conflictAlert.innerHTML = `
          <div class="flex items-center gap-2 text-emerald-800 text-sm font-medium">
            <svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>이 시간대는 예약이 가능합니다! (중복 없음)</span>
          </div>
        `;
      }
    } else {
      conflictAlert.classList.add('hidden');
    }

    // 당일 시간대 프리뷰 갱신
    renderDaySlotPreview(date);

    // 버튼 활성화/비활성화
    submitBtn.disabled = !isValid;
    if (!isValid) {
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    return isValid;
  }

  // 당일 예약 현황 미니 타임라인 프리뷰
  function renderDaySlotPreview(dateStr) {
    if (!dateStr) {
      daySlotPreview.innerHTML = '';
      return;
    }

    const dayVisits = window.visitStore.getVisitsByDate(dateStr);
    if (dayVisits.length === 0) {
      daySlotPreview.innerHTML = `
        <div class="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center gap-1.5">
          <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          선택한 날짜(${dateStr})에는 아직 예약된 순이 없어 모든 시간대 신청이 가능합니다.
        </div>
      `;
      return;
    }

    let html = `
      <div class="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
        <div class="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
          <span>📅 ${dateStr} 당일 예약된 순 현황 (${dayVisits.length}건)</span>
          <span class="text-[11px] text-blue-600 font-normal">겹치지 않게 시간을 선택하세요</span>
        </div>
        <div class="flex flex-wrap gap-2">
    `;

    dayVisits.forEach((v) => {
      html += `
        <div class="px-2.5 py-1 rounded-lg bg-white border border-blue-200 shadow-2xs text-xs text-slate-800 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          <span class="font-bold text-blue-900">${v.startTime} ~ ${v.endTime}</span>
          <span class="font-semibold text-slate-700">${v.soonName}</span>
          <span class="text-slate-400">(${v.leaderName} 순장)</span>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    daySlotPreview.innerHTML = html;
  }

  // ==========================================
  // 4. 신청 폼 제출
  // ==========================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateConflict()) {
      alert('입력 내용에 중복 또는 오류가 있습니다. 확인 후 다시 시도해주세요.');
      return;
    }

    const soonName = getSelectedSoonName();
    if (!soonName) {
      alert('순 이름을 선택하거나 입력해주세요.');
      soonSelect.focus();
      return;
    }

    const visitData = {
      soonName,
      leaderName: leaderInput.value.trim(),
      date: dateInput.value,
      startTime: startTimeInput.value,
      endTime: endTimeInput.value,
      place: placeInput.value.trim(),
      attendees: attendeesInput.value ? Number(attendeesInput.value) : 0,
      prayerTopic: prayerTopicInput.value.trim()
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      신청 저장 중...
    `;

    try {
      const res = await window.cloudSync.addVisit(visitData);
      if (res && res.success) {
        showSuccessModal(visitData);
        form.reset();
        initDefaultDates();
        customSoonWrap.classList.add('hidden');
        conflictAlert.classList.add('hidden');
        soonConflictAlert.classList.add('hidden');
      } else {
        alert('신청 저장에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (err) {
      console.error(err);
      alert('오류가 발생했습니다: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        심방 신청 완료하기
      `;
    }
  });

  // 신청 완료 모달
  function showSuccessModal(data) {
    const modal = document.getElementById('success-modal');
    const summaryEl = document.getElementById('success-summary');
    const shareText = `🕊️ [우면공동체 강현구 목사님 순심방 신청 완료]\n• 순: ${data.soonName} (${data.leaderName} 순장)\n• 일시: ${data.date} ${data.startTime} ~ ${data.endTime}\n• 장소: ${data.place}\n${data.prayerTopic ? `• 기도제목: ${data.prayerTopic}\n` : ''}은혜로운 심방 시간이 되기를 기도합니다!`;

    summaryEl.innerHTML = `
      <div class="bg-slate-50 p-4 rounded-xl space-y-2 text-sm text-slate-700 border border-slate-200 text-left">
        <div><strong class="text-slate-900">순 / 순장:</strong> ${data.soonName} (${data.leaderName} 순장)</div>
        <div><strong class="text-slate-900">심방 일시:</strong> ${data.date} (${data.startTime} ~ ${data.endTime})</div>
        <div><strong class="text-slate-900">심방 장소:</strong> ${data.place}</div>
        ${data.attendees ? `<div><strong class="text-slate-900">예상 인원:</strong> ${data.attendees}명</div>` : ''}
        ${data.prayerTopic ? `<div><strong class="text-slate-900">기도 제목:</strong> ${data.prayerTopic}</div>` : ''}
      </div>
    `;

    document.getElementById('btn-copy-share').onclick = () => {
      navigator.clipboard.writeText(shareText).then(() => {
        alert('카카오톡 공유용 안내 문구가 클립보드에 복사되었습니다!\n순원 단톡방에 붙여넣어 공유하세요.');
      });
    };

    document.getElementById('btn-close-modal').onclick = () => {
      modal.classList.add('hidden');
      switchTab('calendar');
    };

    modal.classList.remove('hidden');
  }

  // ==========================================
  // 5. 캘린더 탭 연동 및 일별 스케줄 렌더링
  // ==========================================
  function initCalendar() {
    calendar = new window.VisitCalendar('calendar-container', {
      onDateSelect: (selectedDate) => {
        renderSelectedDateSchedule(selectedDate);
      }
    });
    calendar.render();
    renderSelectedDateSchedule(calendar.selectedDateStr);
  }

  function renderSelectedDateSchedule(dateStr) {
    const container = document.getElementById('selected-date-schedule');
    if (!container) return;

    const visits = window.visitStore.getVisitsByDate(dateStr);
    const dayObj = new Date(dateStr);
    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = daysOfWeek[dayObj.getDay()];

    let html = `
      <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <div>
          <h3 class="text-lg font-bold text-slate-800">
            ${dateStr} (${dayName}요일)
          </h3>
          <p class="text-xs text-slate-500">예약 ${visits.length}건 등록됨</p>
        </div>
        <button id="btn-apply-this-date" class="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1 shadow-xs">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          이 날짜로 신청하기
        </button>
      </div>
    `;

    if (visits.length === 0) {
      html += `
        <div class="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-500 mx-auto flex items-center justify-center mb-3">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          </div>
          <p class="font-semibold text-slate-700 mb-1">아직 등록된 심방 일정이 없습니다</p>
          <p class="text-xs text-slate-400 mb-4">원하시는 시간에 가장 먼저 신청해보세요!</p>
          <button id="btn-empty-apply" class="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition">
            이 날짜에 바로 신청
          </button>
        </div>
      `;
    } else {
      html += `<div class="space-y-3">`;
      visits.forEach((v) => {
        html += `
          <div class="card-view-detail p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-blue-400 hover:shadow-md transition cursor-pointer group"
               data-visit-id="${v.id}">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-blue-100 text-blue-800 group-hover:bg-blue-600 group-hover:text-white transition">
                  ${v.soonName}
                </span>
                <span class="text-sm font-bold text-slate-800">${v.leaderName} 순장</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  예약확정
                </span>
                <span class="text-[11px] text-blue-600 font-medium hidden sm:inline">상세보기/수정 🔍</span>
              </div>
            </div>
            <div class="mt-2.5 space-y-1 text-xs text-slate-600">
              <div class="flex items-center gap-1.5 font-medium text-blue-600">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>${v.startTime} ~ ${v.endTime}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span>${v.place}</span>
              </div>
              ${
                v.prayerTopic
                  ? `
                <div class="mt-2 p-2 bg-slate-50 rounded-lg text-slate-500 italic text-[11px] line-clamp-2">
                  "${v.prayerTopic}"
                </div>`
                  : ''
              }
            </div>
            <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end text-[11px] text-slate-400 font-medium">
              클릭하여 상세 정보 보기 및 수정 / 삭제 →
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    container.innerHTML = html;

    // 해당 날짜로 신청 버튼 이벤트
    const btnApply = document.getElementById('btn-apply-this-date');
    const btnEmpty = document.getElementById('btn-empty-apply');
    const applyAction = () => {
      dateInput.value = dateStr;
      switchTab('apply');
      validateConflict();
    };

    if (btnApply) btnApply.addEventListener('click', applyAction);
    if (btnEmpty) btnEmpty.addEventListener('click', applyAction);
  }

  // ==========================================
  // 6. 순 전체 현황판 렌더링 (여성순, 직여순, 남성순 그룹화)
  // ==========================================
  function renderSoonStatusBoard() {
    const container = document.getElementById('soon-status-grid');
    if (!container) return;

    const stats = window.visitStore.getSoonStats();
    const soonGroups = window.visitStore.getSoonGroups();
    const allVisits = window.visitStore.getAllVisits();
    const visitMap = new Map();
    allVisits.forEach((v) => visitMap.set(v.soonName.trim(), v));

    // 상단 진행상황 카드 갱신
    document.getElementById('status-completed-count').textContent = `${stats.completed}개 순`;
    document.getElementById('status-remaining-count').textContent = `${stats.remaining}개 순`;
    document.getElementById('status-rate-text').textContent = `${stats.rate}%`;
    document.getElementById('status-progress-bar').style.width = `${stats.rate}%`;

    const renderCard = (soonName) => {
      const v = visitMap.get(soonName);
      if (v) {
        return `
          <div class="card-view-detail p-3 sm:p-3.5 rounded-2xl bg-white border border-emerald-200/90 shadow-2xs relative overflow-hidden flex flex-col justify-between cursor-pointer hover:border-emerald-500 hover:shadow-md transition group"
               data-visit-id="${v.id}">
            <div class="absolute top-0 right-0 w-10 h-10 bg-emerald-50 rounded-bl-2xl -mr-1 -mt-1 flex items-start justify-end p-1.5 group-hover:bg-emerald-100 transition">
              <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-sm sm:text-base font-extrabold text-slate-800">${soonName}</span>
                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded-full">완료</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5 font-medium">${v.leaderName} 순장</p>
              <div class="mt-2 space-y-0.5 text-xs text-slate-600">
                <div class="font-bold text-blue-700 text-[11px]">${v.date}</div>
                <div class="text-[11px]">${v.startTime} ~ ${v.endTime}</div>
                <div class="truncate text-slate-500 text-[11px]">${v.place}</div>
              </div>
            </div>
            <div class="mt-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-blue-600 font-medium">
              <span>상세/수정</span>
              <span>→</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="p-3 sm:p-3.5 rounded-2xl bg-slate-50/70 border border-dashed border-slate-300 flex flex-col justify-between hover:bg-white hover:border-blue-400 transition">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-sm sm:text-base font-bold text-slate-500">${soonName}</span>
                <span class="text-[10px] font-medium text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-full">미신청</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">심방 미정</p>
            </div>
            <button class="btn-quick-apply-soon mt-3 w-full py-1 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 transition"
                    data-soon="${soonName}">
              신청하기
            </button>
          </div>
        `;
      }
    };

    let html = '';
    soonGroups.forEach((group) => {
      const groupCount = group.items.length;
      const groupDoneCount = group.items.filter((item) => visitMap.has(item)).length;

      html += `
        <div class="col-span-full mt-3 first:mt-0 pt-3 first:pt-0 border-t first:border-0 border-slate-100">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <span>${group.category}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                ${groupDoneCount} / ${groupCount} 완료
              </span>
            </h4>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
            ${group.items.map((soon) => renderCard(soon)).join('')}
          </div>
        </div>
      `;
    });

    // 기타(직접 입력한 순)이 있는 경우
    const extraSoons = allVisits.filter((v) => !window.visitStore.getDefaultSoons().includes(v.soonName.trim()));
    if (extraSoons.length > 0) {
      html += `
        <div class="col-span-full mt-4 pt-3 border-t border-slate-100">
          <div class="mb-3 font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <span>기타 순</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
            ${extraSoons.map((v) => renderCard(v.soonName)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // 미신청 순 '신청하기' 바로가기 버튼 이벤트
    container.querySelectorAll('.btn-quick-apply-soon').forEach((btn) => {
      btn.addEventListener('click', () => {
        const soonName = btn.getAttribute('data-soon');
        soonSelect.value = soonName;
        customSoonWrap.classList.add('hidden');
        switchTab('apply');
        validateConflict();
      });
    });
  }

  // ==========================================
  // 7. 목사님/관리자 모드
  // ==========================================
  function renderAdminView() {
    const authWrap = document.getElementById('admin-auth-wrap');
    const panelWrap = document.getElementById('admin-panel-wrap');

    if (!adminAuthenticated) {
      authWrap.classList.remove('hidden');
      panelWrap.classList.add('hidden');
    } else {
      authWrap.classList.add('hidden');
      panelWrap.classList.remove('hidden');
      renderAdminTable();
    }
  }

  // 관리자 인증 폼
  document.getElementById('admin-login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = document.getElementById('admin-pin-input').value;
    if (pin === ADMIN_PIN) {
      adminAuthenticated = true;
      document.getElementById('admin-pin-input').value = '';
      renderAdminView();
    } else {
      alert('비밀번호가 올바르지 않습니다. (기본 비밀번호: 1234)');
    }
  });

  // 관리자 로그아웃
  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    adminAuthenticated = false;
    renderAdminView();
  });

  // 관리자 신청 목록 테이블 렌더링
  function renderAdminTable() {
    const tbody = document.getElementById('admin-table-body');
    const visits = window.visitStore.getAllVisits();

    if (visits.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-slate-400 text-sm">
            등록된 심방 신청 내역이 없습니다.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    visits.forEach((v, idx) => {
      html += `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-sm text-slate-700">
          <td class="py-3 px-3 text-center text-slate-400 text-xs">${idx + 1}</td>
          <td class="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">${v.soonName}</td>
          <td class="py-3 px-3 whitespace-nowrap">${v.leaderName}</td>
          <td class="py-3 px-3 whitespace-nowrap font-medium text-blue-700">
            ${v.date} <span class="text-xs text-slate-500 font-normal">(${v.startTime}~${v.endTime})</span>
          </td>
          <td class="py-3 px-3">${v.place}</td>
          <td class="py-3 px-3 text-xs text-slate-500 max-w-xs truncate" title="${v.prayerTopic || ''}">
            ${v.prayerTopic || '-'}
          </td>
          <td class="py-3 px-3 text-center whitespace-nowrap">
            <button class="btn-delete-visit text-rose-500 hover:text-rose-700 text-xs font-semibold px-2 py-1 rounded hover:bg-rose-50 transition"
                    data-id="${v.id}" data-soon="${v.soonName}">
              취소/삭제
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    // 삭제 버튼 이벤트
    tbody.querySelectorAll('.btn-delete-visit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const soon = btn.getAttribute('data-soon');
        if (confirm(`정말로 [${soon}]의 심방 일정을 취소/삭제하시겠습니까?`)) {
          await window.cloudSync.deleteVisit(id);
          renderAdminTable();
        }
      });
    });
  }

  // 엑셀(CSV) 다운로드 기능 (UTF-8 with BOM)
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const visits = window.visitStore.getAllVisits();
    if (visits.length === 0) {
      alert('내보낼 신청 내역이 없습니다.');
      return;
    }

    const headers = ['연번', '순이름', '순장이름', '심방날짜', '시작시간', '종료시간', '장소', '예상인원', '기도제목및비고', '신청일시'];
    const rows = visits.map((v, i) => [
      i + 1,
      `"${v.soonName}"`,
      `"${v.leaderName}"`,
      v.date,
      v.startTime,
      v.endTime,
      `"${(v.place || '').replace(/"/g, '""')}"`,
      v.attendees || 0,
      `"${(v.prayerTopic || '').replace(/"/g, '""')}"`,
      v.createdAt || ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `우면공동체_강현구목사님_순심방_일정현황_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // ==========================================
  // 8. Firebase 클라우드 연동 모달
  // ==========================================
  const firebaseModal = document.getElementById('firebase-modal');
  const btnOpenFirebase = document.getElementById('btn-open-firebase-modal');
  const btnCloseFirebase = document.getElementById('btn-close-firebase-modal');
  const formFirebase = document.getElementById('firebase-config-form');
  const btnResetFirebase = document.getElementById('btn-reset-firebase');

  if (btnOpenFirebase) {
    btnOpenFirebase.addEventListener('click', () => {
      const currentConfig = window.cloudSync.getSavedFirebaseConfig();
      if (currentConfig) {
        document.getElementById('fb-api-key').value = currentConfig.apiKey || '';
        document.getElementById('fb-auth-domain').value = currentConfig.authDomain || '';
        document.getElementById('fb-project-id').value = currentConfig.projectId || '';
        document.getElementById('fb-storage-bucket').value = currentConfig.storageBucket || '';
        document.getElementById('fb-messaging-sender-id').value = currentConfig.messagingSenderId || '';
        document.getElementById('fb-app-id').value = currentConfig.appId || '';
      }
      firebaseModal.classList.remove('hidden');
    });
  }

  if (btnCloseFirebase) {
    btnCloseFirebase.addEventListener('click', () => {
      firebaseModal.classList.add('hidden');
    });
  }

  if (formFirebase) {
    formFirebase.addEventListener('submit', (e) => {
      e.preventDefault();
      const config = {
        apiKey: document.getElementById('fb-api-key').value.trim(),
        authDomain: document.getElementById('fb-auth-domain').value.trim(),
        projectId: document.getElementById('fb-project-id').value.trim(),
        storageBucket: document.getElementById('fb-storage-bucket').value.trim(),
        messagingSenderId: document.getElementById('fb-messaging-sender-id').value.trim(),
        appId: document.getElementById('fb-app-id').value.trim()
      };

      if (!config.apiKey || !config.projectId) {
        alert('API Key와 Project ID는 필수 입력값입니다.');
        return;
      }

      const success = window.cloudSync.saveFirebaseConfig(config);
      if (success) {
        alert('🎉 Firebase 클라우드 실시간 동기화 설정이 저장되었습니다!\n이제 모든 스마트폰과 브라우저에서 실시간으로 일정이 공유됩니다.');
        firebaseModal.classList.add('hidden');
      } else {
        alert('Firebase 초기화에 실패했습니다. 키 값을 다시 확인해주세요.');
      }
    });
  }

  if (btnResetFirebase) {
    btnResetFirebase.addEventListener('click', () => {
      if (confirm('클라우드 설정을 초기화하고 브라우저 로컬 모드로 되돌리시겠습니까?')) {
        window.cloudSync.clearFirebaseConfig();
        alert('로컬 모드로 전환되었습니다.');
        firebaseModal.classList.add('hidden');
      }
    });
  }

  // ==========================================
  // 9. 실시간 데이터 갱신 리스너 (반응형 갱신)
  // ==========================================
  window.cloudSync.subscribe((visits, meta) => {
    // 1. 상단 클라우드 상태 표시
    if (meta.isCloud) {
      cloudStatusBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        <span class="w-2 h-2 rounded-full bg-emerald-500 -ml-3"></span>
        <span class="text-emerald-700 font-semibold">실시간 클라우드 동기화 중</span>
      `;
      cloudStatusBadge.className = 'px-3 py-1 rounded-full text-xs bg-emerald-50 border border-emerald-200 flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100 transition';
    } else {
      cloudStatusBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-amber-500"></span>
        <span class="text-amber-700 font-semibold">로컬 모드 (클라우드 설정 가능)</span>
      `;
      cloudStatusBadge.className = 'px-3 py-1 rounded-full text-xs bg-amber-50 border border-amber-200 flex items-center gap-1.5 cursor-pointer hover:bg-amber-100 transition';
    }

    // 2. 상단 프로그레스 바 갱신
    const stats = window.visitStore.getSoonStats();
    headerSummaryText.textContent = `총 ${stats.total}개 순 중 ${stats.completed}개 순 신청 완료 (${stats.rate}%)`;
    headerProgressBar.style.width = `${stats.rate}%`;

    // 3. 활성화된 화면 재렌더링
    if (currentTab === 'calendar' && calendar) {
      calendar.render();
      renderSelectedDateSchedule(calendar.selectedDateStr);
    } else if (currentTab === 'status') {
      renderSoonStatusBoard();
    } else if (currentTab === 'admin' && adminAuthenticated) {
      renderAdminTable();
    }

    // 폼 검증 상태도 최신 데이터 기준으로 재검증
    validateConflict();
  });

  // ==========================================
  // 10. 빠른 시간 선택 버튼 & 이벤트 리스너
  // ==========================================
  document.querySelectorAll('.btn-quick-time').forEach((btn) => {
    btn.addEventListener('click', () => {
      const start = btn.getAttribute('data-start');
      const end = btn.getAttribute('data-end');
      startTimeInput.value = start;
      endTimeInput.value = end;
      validateConflict();
    });
  });

  soonSelect.addEventListener('change', () => {
    if (soonSelect.value === '__custom__') {
      customSoonWrap.classList.remove('hidden');
      customSoonInput.focus();
    } else {
      customSoonWrap.classList.add('hidden');
    }
    validateConflict();
  });

  customSoonInput.addEventListener('input', validateConflict);
  dateInput.addEventListener('change', () => {
    validateConflict();
    if (calendar) {
      calendar.selectDate(dateInput.value);
    }
  });
  startTimeInput.addEventListener('change', validateConflict);
  endTimeInput.addEventListener('change', validateConflict);

  // ==========================================
  // 11. 순심방 상세 조회 및 수정 / 삭제 모달 로직
  // ==========================================
  let currentDetailVisit = null;
  const visitDetailModal = document.getElementById('visit-detail-modal');
  const detailViewMode = document.getElementById('detail-view-mode');
  const detailEditMode = document.getElementById('detail-edit-mode');
  const btnCloseDetailModal = document.getElementById('btn-close-detail-modal');
  const btnDetailCopyShare = document.getElementById('btn-detail-copy-share');
  const btnDetailSwitchEdit = document.getElementById('btn-detail-switch-edit');
  const btnDetailDelete = document.getElementById('btn-detail-delete');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const detailEditForm = document.getElementById('detail-edit-form');
  const editConflictAlert = document.getElementById('edit-conflict-alert');
  const btnSaveEdit = document.getElementById('btn-save-edit');

  // 수정 입력 필드
  const editLeaderName = document.getElementById('edit-leader-name');
  const editVisitDate = document.getElementById('edit-visit-date');
  const editStartTime = document.getElementById('edit-start-time');
  const editEndTime = document.getElementById('edit-end-time');
  const editVisitPlace = document.getElementById('edit-visit-place');
  const editAttendeesCount = document.getElementById('edit-attendees-count');
  const editPrayerTopic = document.getElementById('edit-prayer-topic');

  // 요일 이름 가져오기
  function getDayOfWeekStr(dateStr) {
    if (!dateStr) return '';
    const dayObj = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dayObj.getDay()] || '';
  }

  // 상세 모달 열기
  function openVisitDetailModal(visitId) {
    const visits = window.visitStore.getAllVisits();
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      alert('신청 정보를 찾을 수 없습니다.');
      return;
    }

    currentDetailVisit = visit;
    const dayName = getDayOfWeekStr(visit.date);

    // 상세 뷰 데이터 채우기
    document.getElementById('detail-modal-soon-badge').textContent = visit.soonName;
    document.getElementById('detail-view-soon-leader').textContent = `${visit.soonName} (${visit.leaderName} 순장)`;
    document.getElementById('detail-view-datetime').textContent = `${visit.date} (${dayName}요일) ${visit.startTime} ~ ${visit.endTime}`;
    document.getElementById('detail-view-place').textContent = visit.place;
    document.getElementById('detail-view-attendees').textContent = visit.attendees ? `${visit.attendees}명` : '미기재';
    document.getElementById('detail-view-prayer').textContent = visit.prayerTopic || '등록된 기도제목이 없습니다.';

    // 모드 초기화 (보기 모드로)
    detailViewMode.classList.remove('hidden');
    detailEditMode.classList.add('hidden');
    editConflictAlert.classList.add('hidden');
    visitDetailModal.classList.remove('hidden');
  }

  // 상세 모달 닫기
  if (btnCloseDetailModal) {
    btnCloseDetailModal.addEventListener('click', () => {
      visitDetailModal.classList.add('hidden');
    });
  }

  // 모달 바깥 배경 클릭 시 닫기
  if (visitDetailModal) {
    visitDetailModal.addEventListener('click', (e) => {
      if (e.target === visitDetailModal) {
        visitDetailModal.classList.add('hidden');
      }
    });
  }

  // 카카오톡 공유 문구 복사
  if (btnDetailCopyShare) {
    btnDetailCopyShare.addEventListener('click', () => {
      if (!currentDetailVisit) return;
      const v = currentDetailVisit;
      const dayName = getDayOfWeekStr(v.date);
      const text = `🕊️ [우면공동체 강현구 목사님 순심방 확정 안내]\n• 대상: ${v.soonName} (${v.leaderName} 순장)\n• 일시: ${v.date} (${dayName}) ${v.startTime} ~ ${v.endTime}\n• 장소: ${v.place}\n${v.attendees ? `• 예상인원: ${v.attendees}명\n` : ''}${v.prayerTopic ? `• 기도제목: ${v.prayerTopic}\n` : ''}\n은혜롭고 따뜻한 심방 시간이 되기를 기도합니다!`;

      navigator.clipboard.writeText(text).then(() => {
        alert('카카오톡 공유용 안내 문구가 복사되었습니다!\n순원 단톡방에 붙여넣어 공유하세요.');
      });
    });
  }

  // 수정 모드로 전환
  if (btnDetailSwitchEdit) {
    btnDetailSwitchEdit.addEventListener('click', () => {
      if (!currentDetailVisit) return;
      const v = currentDetailVisit;

      // 폼 필드 채우기
      editLeaderName.value = v.leaderName;
      editVisitDate.value = v.date;
      editStartTime.value = v.startTime;
      editEndTime.value = v.endTime;
      editVisitPlace.value = v.place;
      editAttendeesCount.value = v.attendees || '';
      editPrayerTopic.value = v.prayerTopic || '';

      detailViewMode.classList.add('hidden');
      detailEditMode.classList.remove('hidden');
      validateEditConflict();
    });
  }

  // 수정 취소
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
      detailEditMode.classList.add('hidden');
      detailViewMode.classList.remove('hidden');
    });
  }

  // 수정 중 시간 충돌 검사
  function validateEditConflict() {
    if (!currentDetailVisit) return true;

    const date = editVisitDate.value;
    const startTime = editStartTime.value;
    const endTime = editEndTime.value;

    const timeCheck = window.visitStore.checkTimeConflict(date, startTime, endTime, currentDetailVisit.id);

    if (timeCheck.hasConflict) {
      editConflictAlert.classList.remove('hidden');
      editConflictAlert.innerHTML = `
        <div class="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-1.5">
          <span class="font-bold shrink-0">⚠️ 시간 중복:</span>
          <span>${timeCheck.reason} 다른 시간대를 선택해주세요.</span>
        </div>
      `;
      btnSaveEdit.disabled = true;
      btnSaveEdit.classList.add('opacity-50', 'cursor-not-allowed');
      return false;
    } else {
      editConflictAlert.classList.add('hidden');
      btnSaveEdit.disabled = false;
      btnSaveEdit.classList.remove('opacity-50', 'cursor-not-allowed');
      return true;
    }
  }

  [editVisitDate, editStartTime, editEndTime].forEach((input) => {
    if (input) {
      input.addEventListener('change', validateEditConflict);
    }
  });

  // 수정 폼 제출 (저장)
  if (detailEditForm) {
    detailEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentDetailVisit) return;

      if (!validateEditConflict()) {
        alert('시간 중복이 있습니다. 시간을 다시 확인해주세요.');
        return;
      }

      const updateData = {
        leaderName: editLeaderName.value.trim(),
        date: editVisitDate.value,
        startTime: editStartTime.value,
        endTime: editEndTime.value,
        place: editVisitPlace.value.trim(),
        attendees: editAttendeesCount.value ? Number(editAttendeesCount.value) : 0,
        prayerTopic: editPrayerTopic.value.trim()
      };

      btnSaveEdit.disabled = true;
      btnSaveEdit.textContent = '수정 저장 중...';

      try {
        const res = await window.cloudSync.updateVisit(currentDetailVisit.id, updateData);
        if (res && res.success) {
          alert(`[${currentDetailVisit.soonName}] 심방 일정이 성공적으로 수정되었습니다!`);
          visitDetailModal.classList.add('hidden');
        } else {
          alert('수정 저장에 실패했습니다. 다시 시도해주세요.');
        }
      } catch (err) {
        console.error(err);
        alert('오류가 발생했습니다: ' + err.message);
      } finally {
        btnSaveEdit.disabled = false;
        btnSaveEdit.textContent = '수정 완료 저장';
      }
    });
  }

  // 삭제 / 취소
  if (btnDetailDelete) {
    btnDetailDelete.addEventListener('click', async () => {
      if (!currentDetailVisit) return;
      const soonName = currentDetailVisit.soonName;

      if (confirm(`정말로 [${soonName}]의 순심방 일정을 취소/삭제하시겠습니까?\n취소하시면 다른 순이 해당 시간대를 신청할 수 있게 됩니다.`)) {
        try {
          const res = await window.cloudSync.deleteVisit(currentDetailVisit.id);
          if (res && res.success) {
            alert(`[${soonName}] 심방 일정이 취소되었습니다.`);
            visitDetailModal.classList.add('hidden');
          } else {
            alert('삭제에 실패했습니다. 다시 시도해주세요.');
          }
        } catch (err) {
          console.error(err);
          alert('오류 발생: ' + err.message);
        }
      }
    });
  }

  // 12. 전체 화면 클릭 이벤트 위임 (카드 클릭 시 상세 모달 열기)
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card-view-detail');
    if (card) {
      // 퀵 신청 버튼이나 삭제 버튼 클릭이 아닌 경우만 상세 모달 열기
      if (!e.target.closest('.btn-quick-apply-soon') && !e.target.closest('.btn-delete-visit')) {
        const visitId = card.getAttribute('data-visit-id');
        if (visitId) {
          openVisitDetailModal(visitId);
        }
      }
    }
  });

  // 탭 네비게이션 클릭 이벤트
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // 샘플 데이터 생성 버튼 (체험용)
  const sampleBtn = document.getElementById('btn-seed-sample');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      if (confirm('테스트용 샘플 일정 4건을 생성하시겠습니까?')) {
        window.cloudSync.seedSampleData();
      }
    });
  }

  // 시작 초기화 실행
  initSoonSelectOptions();
  initDefaultDates();
  initCalendar();
  validateConflict();
});
