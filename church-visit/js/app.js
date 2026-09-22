/**
 * 교회 순심방 신청 메인 애플리케이션 스크립트
 * 우면공동체 9월~12월 공식 심방 가능 일정(오전/오후/저녁 슬롯) 완전 연동
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

  // 심방 가능 날짜 관련 DOM
  const availableDatesInfoTag = document.getElementById('available-dates-info-tag');
  const availableDatesChipContainer = document.getElementById('available-dates-chip-container');
  const availableDatesChips = document.getElementById('available-dates-chips');
  const btnModeAll = document.getElementById('btn-mode-all');
  const btnModeRestricted = document.getElementById('btn-mode-restricted');
  const adminDateStart = document.getElementById('admin-date-start');
  const adminDateEnd = document.getElementById('admin-date-end');
  const btnAdminAddRange = document.getElementById('btn-admin-add-range');
  const adminAvailableCountBadge = document.getElementById('admin-available-count-badge');
  const adminAvailableDatesList = document.getElementById('admin-available-dates-list');
  const btnAdminClearAllDates = document.getElementById('btn-admin-clear-all-dates');
  const btnAdminResetOfficial = document.getElementById('btn-admin-reset-official');

  // 상단 현황 배지
  const cloudStatusBadge = document.getElementById('cloud-status-badge');
  const headerSummaryText = document.getElementById('header-summary-text');
  const headerProgressBar = document.getElementById('header-progress-bar');

  function updateHeaderSummary(stats) {
    if (!stats) stats = window.visitStore.getSoonStats();
    if (headerSummaryText) {
      if (stats.finished > 0) {
        headerSummaryText.textContent = `총 ${stats.total}개 순 중 ${stats.completed}개 순 신청 (심방 완료 ${stats.finished}순 · ${stats.rate}%)`;
      } else {
        headerSummaryText.textContent = `총 ${stats.total}개 순 중 ${stats.completed}개 순 신청 완료 (${stats.rate}%)`;
      }
    }
    if (headerProgressBar) {
      headerProgressBar.style.width = `${stats.rate}%`;
    }
  }

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

  // 오늘 날짜 및 기본값 설정 (가장 빠른 공식 가능 날짜로 자동 세팅)
  function initDefaultDates() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const available = window.visitStore.getAvailableDates().filter((date) => date >= todayStr);
    if (window.visitStore.isRestrictMode() && available.length > 0) {
      dateInput.value = available[0];
    } else {
      dateInput.value = todayStr;
    }
    dateInput.min = todayStr;

    if (adminDateStart) adminDateStart.min = todayStr;
    if (adminDateEnd) adminDateEnd.min = todayStr;

    updateQuickTimeButtonsForDate(dateInput.value);
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

    if (tabKey === 'apply') {
      renderAvailableDatesChips();
      updateQuickTimeButtonsForDate(dateInput.value);
    } else if (tabKey === 'calendar' && calendar) {
      calendar.render();
      renderSelectedDateSchedule(calendar.selectedDateStr);
    } else if (tabKey === 'status') {
      renderSoonStatusBoard();
    } else if (tabKey === 'admin') {
      renderAdminView();
    }
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // ==========================================
  // 3. 날짜별 시간대(오전/오후/저녁) 버튼 동적 제어
  // ==========================================
  function updateQuickTimeButtonsForDate(dateStr) {
    if (!dateStr) return;

    const allowedSlots = window.visitStore.getAllowedSlots(dateStr);
    const isRestrict = window.visitStore.isRestrictMode();
    const isDateAvailable = window.visitStore.isDateAvailable(dateStr);
    const buttons = document.querySelectorAll('.btn-quick-time');

    buttons.forEach((btn) => {
      const slot = btn.getAttribute('data-slot');
      const isAllowed = !isRestrict || !isDateAvailable || allowedSlots.includes(slot);

      if (isAllowed) {
        btn.disabled = false;
        btn.classList.remove('opacity-30', 'cursor-not-allowed', 'line-through', 'bg-slate-200');
        btn.classList.add('bg-slate-100', 'hover:bg-blue-50', 'hover:text-blue-600');
        btn.removeAttribute('title');
      } else {
        btn.disabled = true;
        btn.classList.add('opacity-30', 'cursor-not-allowed', 'line-through', 'bg-slate-200');
        btn.classList.remove('hover:bg-blue-50', 'hover:text-blue-600');
        btn.setAttribute('title', '양육 프로그램 및 교회 일정으로 신청 불가 시간대입니다.');
      }
    });

    // 만약 현재 선택된 시간이 해당 일자의 허용 슬롯에 맞지 않으면 허용되는 첫 슬롯으로 자동 조정
    if (isRestrict && isDateAvailable && allowedSlots.length > 0) {
      const slotCheck = window.visitStore.checkSlotRestriction(dateStr, startTimeInput.value, endTimeInput.value);
      if (!slotCheck.allowed) {
        const firstSlotKey = allowedSlots[0];
        const def = window.SLOT_DEFINITIONS[firstSlotKey];
        if (def) {
          startTimeInput.value = def.defaultStart;
          endTimeInput.value = def.defaultEnd;
        }
      }
    }
  }

  // ==========================================
  // 4. 중복 및 심방 가능 날짜/시간대 실시간 검증 (Validation)
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
          <div class="flex items-start gap-2.5 text-amber-900">
            <svg class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <div class="w-full">
              <span class="font-extrabold text-sm">[이미 신청 완료된 순입니다]</span><br>
              <span class="text-xs text-amber-800">${soonCheck.reason}</span>
              ${
                soonCheck.existing
                  ? `<div class="mt-2.5 pt-2 border-t border-amber-200/80 flex flex-wrap gap-2">
                      <button type="button" class="btn-conflict-edit px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition flex items-center gap-1 shadow-2xs cursor-pointer" data-visit-id="${soonCheck.existing.id}">
                        <span>✏️</span> 일정 수정하기
                      </button>
                      <button type="button" class="btn-conflict-delete px-3 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition flex items-center gap-1 shadow-2xs cursor-pointer" data-visit-id="${soonCheck.existing.id}" data-soon="${soonName}">
                        <span>🗑️</span> 신청 취소(삭제)
                      </button>
                    </div>`
                  : ''
              }
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

    // 2. 심방 가능 날짜 및 시간대(오전/오후/저녁) 제한 검사
    if (date) {
      const dateCheck = window.visitStore.checkDateRestriction(date);
      if (!dateCheck.allowed) {
        conflictAlert.classList.remove('hidden');
        conflictAlert.innerHTML = `
          <div class="flex items-start gap-2 text-rose-800">
            <svg class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <div>
              <span class="font-bold">[심방 불가 날짜]</span> ${dateCheck.reason}<br>
              <span class="text-xs text-rose-700">목사님이 지정하신 공식 심방 가능 날짜 중에서 선택해주세요.</span>
            </div>
          </div>
        `;
        conflictAlert.className = 'p-3 bg-rose-50 border border-rose-200 rounded-xl mb-4 animate-shake';
        isValid = false;
      } else if (startTime && endTime) {
        // 시간대(슬롯) 및 중복 검사
        const timeCheck = window.visitStore.checkTimeConflict(date, startTime, endTime);
        if (timeCheck.hasConflict) {
          conflictAlert.classList.remove('hidden');
          conflictAlert.innerHTML = `
            <div class="flex items-start gap-2 text-rose-800">
              <svg class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <div>
                <span class="font-bold">[신청 불가]</span> ${timeCheck.reason}<br>
                <span class="text-xs text-rose-700">가능한 시간대를 선택해주세요.</span>
              </div>
            </div>
          `;
          conflictAlert.className = 'p-3 bg-rose-50 border border-rose-200 rounded-xl mb-4 animate-shake';
          isValid = false;
        } else {
          // 통과
          conflictAlert.classList.remove('hidden');
          conflictAlert.className = 'p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-4';
          conflictAlert.innerHTML = `
            <div class="flex items-center gap-2 text-emerald-800 text-sm font-medium">
              <svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>이 날짜와 시간대는 예약이 가능합니다! (중복 없음)</span>
            </div>
          `;
        }
      } else {
        conflictAlert.classList.add('hidden');
      }
    } else {
      conflictAlert.classList.add('hidden');
    }

    renderDaySlotPreview(date);

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
    const slotSummary = window.visitStore.isDateAvailable(dateStr) ? window.visitStore.getSlotSummaryForDate(dateStr) : null;

    let html = `
      <div class="bg-blue-50/70 border border-blue-100 rounded-xl p-3 space-y-2">
        <div class="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span>📅 ${dateStr} 예약 현황 (${dayVisits.length}건)</span>
          ${slotSummary ? `<span class="text-[11px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">가능 시간대: ${slotSummary}</span>` : ''}
        </div>
    `;

    if (dayVisits.length === 0) {
      html += `
        <div class="text-xs text-slate-500 bg-white/70 p-2 rounded-lg border border-blue-100 flex items-center gap-1.5">
          <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          아직 예약된 순이 없습니다. 가능한 시간대(${slotSummary || '전체'}) 중 원하시는 시간을 선택하세요.
        </div>
      `;
    } else {
      html += `<div class="flex flex-wrap gap-2">`;
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
      html += `</div>`;
    }

    html += `</div>`;
    daySlotPreview.innerHTML = html;
  }

  // ==========================================
  // 5. 심방 가능 날짜 빠른 선택 칩 렌더링 (시간대 요약 표기)
  // ==========================================
  function renderAvailableDatesChips() {
    if (!availableDatesChips || !availableDatesChipContainer) return;

    const isRestrict = window.visitStore.isRestrictMode();
    const dates = window.visitStore.getAvailableDates();
    const todayStr = new Date().toISOString().slice(0, 10);
    const validDates = dates.filter((d) => d >= todayStr);

    if (isRestrict && validDates.length > 0) {
      availableDatesChipContainer.classList.remove('hidden');
      if (availableDatesInfoTag) availableDatesInfoTag.classList.remove('hidden');

      const days = ['일', '월', '화', '수', '목', '금', '토'];
      availableDatesChips.innerHTML = validDates
        .map((d) => {
          const dayObj = new Date(d);
          const dayName = days[dayObj.getDay()] || '';
          const isSelected = dateInput.value === d;
          const isSun = dayObj.getDay() === 0;
          const isSat = dayObj.getDay() === 6;
          const slotSummary = window.visitStore.getSlotSummaryForDate(d);

          let textClr = isSun ? 'text-rose-600' : isSat ? 'text-blue-600' : 'text-slate-700';

          const activeClasses = isSelected
            ? 'bg-blue-600 text-white font-black shadow-xs ring-2 ring-blue-300'
            : `bg-white ${textClr} hover:bg-blue-50 border border-slate-200`;

          return `
            <button type="button" class="btn-chip-date px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${activeClasses}"
                    data-date="${d}">
              <span>📅 ${d.slice(5)} (${dayName})</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-md ${
                isSelected
                  ? 'bg-white/25 text-white'
                  : 'bg-blue-50 text-blue-700 border border-blue-100'
              }">${slotSummary}</span>
            </button>
          `;
        })
        .join('');

      availableDatesChips.querySelectorAll('.btn-chip-date').forEach((btn) => {
        btn.addEventListener('click', () => {
          const selected = btn.getAttribute('data-date');
          dateInput.value = selected;
          updateQuickTimeButtonsForDate(selected);
          validateConflict();
          if (calendar) {
            calendar.selectDate(selected);
          }
          renderAvailableDatesChips();
        });
      });
    } else {
      availableDatesChipContainer.classList.add('hidden');
      if (availableDatesInfoTag) availableDatesInfoTag.classList.add('hidden');
    }
  }

  // ==========================================
  // 6. 신청 폼 제출
  // ==========================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateConflict()) {
      alert('입력 내용에 중복 또는 시간대 제한 오류가 있습니다. 확인 후 다시 시도해주세요.');
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
        renderAvailableDatesChips();
        if (calendar) {
          calendar.render();
          renderSelectedDateSchedule(dateInput.value);
        }
        renderSoonStatusBoard();
        renderAdminTable();
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
  // 7. 캘린더 탭 연동 및 일별 스케줄 렌더링
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
    const isRestrictMode = window.visitStore.isRestrictMode();
    const isDateAvailable = window.visitStore.isDateAvailable(dateStr);
    const slotSummary = isDateAvailable ? window.visitStore.getSlotSummaryForDate(dateStr) : null;

    let html = `
      <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
        <div>
          <h3 class="text-lg font-bold text-slate-800">
            ${dateStr} (${dayName}요일)
          </h3>
          <p class="text-xs text-slate-500">예약 ${visits.length}건 등록됨</p>
        </div>
        ${
          isRestrictMode && !isDateAvailable
            ? `<span class="px-2.5 py-1 text-xs font-bold rounded-xl bg-slate-100 text-slate-400 border border-slate-200">
                 심방 불가일
               </span>`
            : `<button id="btn-apply-this-date" class="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-1 shadow-xs">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                 이 날짜로 신청하기
               </button>`
        }
      </div>
    `;

    if (isRestrictMode && !isDateAvailable) {
      html += `
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 mb-4 flex items-start gap-2">
          <span class="text-base shrink-0">⚠️</span>
          <div>
            <span class="font-bold">목사님 심방 일정이 없는 날짜입니다.</span><br>
            <span class="text-amber-700">목사님이 지정하신 공식 심방 가능 날짜 중에서 선택해주세요.</span>
          </div>
        </div>
      `;
    } else if (slotSummary) {
      html += `
        <div class="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 mb-4 flex items-center justify-between">
          <span class="font-bold">✨ 심방 가능 시간대:</span>
          <span class="font-extrabold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">${slotSummary}</span>
        </div>
      `;
    }

    if (visits.length === 0) {
      if (isRestrictMode && !isDateAvailable) {
        html += `
          <div class="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
            </div>
            <p class="font-semibold text-slate-700 mb-1">심방 일정이 없는 날입니다</p>
            <p class="text-xs text-slate-400">달력에 시간대 표시가 있는 다른 날짜를 선택해주세요.</p>
          </div>
        `;
      } else {
        html += `
          <div class="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-500 mx-auto flex items-center justify-center mb-3">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <p class="font-semibold text-slate-700 mb-1">아직 등록된 심방 일정이 없습니다</p>
            <p class="text-xs text-slate-400 mb-4">가능한 시간대(${slotSummary || '전체'}) 중 원하시는 시간에 신청해보세요!</p>
            <button id="btn-empty-apply" class="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition">
              이 날짜에 바로 신청
            </button>
          </div>
        `;
      }
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
                ${
                  window.visitStore.isVisitFinished(v)
                    ? `<span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                         <span>🕊️</span> 심방 완료
                       </span>`
                    : `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                         심방 예정
                       </span>`
                }
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

    const btnApply = document.getElementById('btn-apply-this-date');
    const btnEmpty = document.getElementById('btn-empty-apply');
    const applyAction = () => {
      dateInput.value = dateStr;
      updateQuickTimeButtonsForDate(dateStr);
      switchTab('apply');
      validateConflict();
    };

    if (btnApply) btnApply.addEventListener('click', applyAction);
    if (btnEmpty) btnEmpty.addEventListener('click', applyAction);
  }

  // ==========================================
  // 8. 순 전체 현황판 렌더링
  // ==========================================
  function renderSoonStatusBoard() {
    const container = document.getElementById('soon-status-grid');
    if (!container) return;

    const stats = window.visitStore.getSoonStats();
    const soonGroups = window.visitStore.getSoonGroups();
    const allVisits = window.visitStore.getAllVisits();
    const visitMap = new Map();
    allVisits.forEach((v) => visitMap.set(v.soonName.trim(), v));

    // 상단 진행상황 4개 카드 갱신
    const finishedCountElem = document.getElementById('status-finished-count');
    if (finishedCountElem) finishedCountElem.textContent = `${stats.finished}개 순`;
    const upcomingCountElem = document.getElementById('status-upcoming-count');
    if (upcomingCountElem) upcomingCountElem.textContent = `${stats.upcoming}개 순`;
    const remainingCountElem = document.getElementById('status-remaining-count');
    if (remainingCountElem) remainingCountElem.textContent = `${stats.remaining}개 순`;
    const rateTextElem = document.getElementById('status-rate-text');
    if (rateTextElem) rateTextElem.textContent = `${stats.rate}%`;
    const progressBarElem = document.getElementById('status-progress-bar');
    if (progressBarElem) progressBarElem.style.width = `${stats.rate}%`;

    const renderCard = (soonName) => {
      const v = visitMap.get(soonName);
      if (v) {
        const isFinished = window.visitStore.isVisitFinished(v);

        if (isFinished) {
          // 🌟 1. [심방 완료] 된 순 - 큼지막하고 눈에 확 띄는 완료 배너
          return `
            <div class="card-view-detail p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-emerald-50/90 to-emerald-100/40 border-2 border-emerald-500 shadow-sm relative overflow-hidden flex flex-col justify-between cursor-pointer hover:border-emerald-600 hover:shadow-md transition group"
                 data-visit-id="${v.id}">
              <!-- 우측 상단 완료 리본 스탬프 -->
              <div class="absolute top-0 right-0 w-11 h-11 bg-emerald-600 rounded-bl-3xl -mr-0.5 -mt-0.5 flex items-start justify-end p-2 text-white shadow-xs">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              </div>

              <div>
                <div class="flex items-center gap-1.5 pr-8">
                  <span class="text-base sm:text-lg font-black text-slate-900">${soonName}</span>
                </div>
                <p class="text-xs text-slate-600 font-semibold mt-0.5">${v.leaderName} 순장</p>

                <!-- 🌟 [핵심] 큼지막한 심방 완료 중앙 배너 🌟 -->
                <div class="my-2.5 py-2 px-2 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-700 text-white rounded-xl font-black text-xs sm:text-sm text-center shadow-xs flex items-center justify-center gap-1.5 tracking-tight border border-emerald-400">
                  <span class="text-sm">🕊️</span>
                  <span>심방 완료</span>
                  <span class="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-md font-bold">Done</span>
                </div>

                <div class="space-y-1 text-xs text-slate-700 bg-white/95 rounded-xl p-2.5 border border-emerald-200/70 shadow-2xs">
                  <div class="font-bold text-emerald-900 text-xs flex items-center gap-1">
                    <span>📅</span> <span>${v.date} (${v.startTime} ~ ${v.endTime})</span>
                  </div>
                  <div class="truncate text-slate-600 text-xs flex items-center gap-1">
                    <span>📍</span> <span class="truncate font-medium">${v.place}</span>
                  </div>
                </div>
              </div>

              <div class="mt-2.5 pt-2 border-t border-emerald-200/80 flex items-center justify-between text-xs font-bold text-emerald-800">
                <span>상세 확인 / 수정</span>
                <span class="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          `;
        } else {
          // 🗓️ 2. [심방 예정] 순 (신청 완료 및 날짜 대기 중)
          return `
            <div class="card-view-detail p-3.5 sm:p-4 rounded-2xl bg-white border border-blue-200 shadow-2xs relative overflow-hidden flex flex-col justify-between cursor-pointer hover:border-blue-400 hover:shadow-md transition group"
                 data-visit-id="${v.id}">
              <div class="absolute top-0 right-0 w-9 h-9 bg-blue-50 rounded-bl-2xl -mr-0.5 -mt-0.5 flex items-start justify-end p-1.5 group-hover:bg-blue-100 transition">
                <span class="text-xs">🗓️</span>
              </div>

              <div>
                <div class="flex items-center gap-1.5 pr-7">
                  <span class="text-base sm:text-lg font-black text-slate-800">${soonName}</span>
                  <span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">예정</span>
                </div>
                <p class="text-xs text-slate-500 font-semibold mt-0.5">${v.leaderName} 순장</p>

                <div class="my-2.5 space-y-1 text-xs text-slate-600 bg-slate-50/90 rounded-xl p-2.5 border border-slate-100">
                  <div class="font-bold text-blue-700 text-xs flex items-center gap-1">
                    <span>📅</span> <span>${v.date} (${v.startTime} ~ ${v.endTime})</span>
                  </div>
                  <div class="truncate text-slate-600 text-xs flex items-center gap-1">
                    <span>📍</span> <span class="truncate font-medium">${v.place}</span>
                  </div>
                </div>
              </div>

              <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400 group-hover:text-blue-600">
                <span>상세 / 수정</span>
                <span class="group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          `;
        }
      } else {
        // ⏳ 3. [미신청] 순
        return `
          <div class="p-3 sm:p-3.5 rounded-2xl bg-slate-50/70 border border-dashed border-slate-300 flex flex-col justify-between hover:bg-white hover:border-blue-400 transition">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-sm sm:text-base font-bold text-slate-500">${soonName}</span>
                <span class="text-[10px] font-medium text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-full">미신청</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">심방 미정</p>
            </div>
            <button class="btn-quick-apply-soon mt-3 w-full py-1.5 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 transition"
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
      const groupFinishedCount = group.items.filter((item) => {
        const visit = visitMap.get(item);
        return visit && window.visitStore.isVisitFinished(visit);
      }).length;
      const groupBookedCount = group.items.filter((item) => visitMap.has(item)).length;

      html += `
        <div class="col-span-full mt-3 first:mt-0 pt-3 first:pt-0 border-t first:border-0 border-slate-100">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-extrabold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <span>${group.category}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                심방 완료 ${groupFinishedCount}순 · 신청 ${groupBookedCount} / ${groupCount}순
              </span>
            </h4>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
            ${group.items.map((soon) => renderCard(soon)).join('')}
          </div>
        </div>
      `;
    });

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
  // 9. 목사님/관리자 모드
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
      renderAdminAvailableDates();
      renderAdminTable();
    }
  }

  // 관리자 심방 가능 날짜 현황 렌더링
  function renderAdminAvailableDates() {
    if (!adminAvailableDatesList) return;

    const isRestrict = window.cloudSync.getIsRestrictMode();
    const scheduleMap = window.visitStore.getScheduleMap();
    const dates = Object.keys(scheduleMap).sort();

    if (btnModeAll && btnModeRestricted) {
      if (isRestrict) {
        btnModeRestricted.className = 'px-3 py-1.5 rounded-xl font-bold transition bg-blue-600 text-white shadow-xs';
        btnModeAll.className = 'px-3 py-1.5 rounded-xl font-bold transition text-slate-600 hover:text-slate-900';
      } else {
        btnModeAll.className = 'px-3 py-1.5 rounded-xl font-bold transition bg-blue-600 text-white shadow-xs';
        btnModeRestricted.className = 'px-3 py-1.5 rounded-xl font-bold transition text-slate-600 hover:text-slate-900';
      }
    }

    if (adminAvailableCountBadge) {
      adminAvailableCountBadge.textContent = `${dates.length}일 등록됨 (${isRestrict ? '공식 일정 제한 모드' : '자유 신청 모드'})`;
      adminAvailableCountBadge.className = isRestrict
        ? 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700'
        : 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600';
    }

    if (dates.length === 0) {
      adminAvailableDatesList.innerHTML = `
        <div class="w-full text-center py-6 text-xs text-slate-400">
          지정된 심방 가능 날짜가 없습니다.<br>
          상단의 <strong>[📋 공식 9~12월 일정으로 복원]</strong> 버튼을 누르시면 준비된 공식 일정이 즉시 적용됩니다.
        </div>
      `;
      return;
    }

    const days = ['일', '월', '화', '수', '목', '금', '토'];
    adminAvailableDatesList.innerHTML = dates
      .map((d) => {
        const dayObj = new Date(d);
        const dayName = days[dayObj.getDay()] || '';
        const isSun = dayObj.getDay() === 0;
        const isSat = dayObj.getDay() === 6;
        let dayClr = isSun ? 'text-rose-600' : isSat ? 'text-blue-600' : 'text-slate-800';
        const slotsLabel = window.visitStore.getSlotSummaryForDate(d);

        return `
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs font-medium">
            <span class="font-bold ${dayClr}">${d} (${dayName})</span>
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">${slotsLabel}</span>
            <button type="button" class="btn-admin-remove-date text-slate-400 hover:text-rose-600 p-0.5 rounded-md hover:bg-rose-50 transition" data-date="${d}" title="이 날짜 삭제">
              ✕
            </button>
          </div>
        `;
      })
      .join('');

    adminAvailableDatesList.querySelectorAll('.btn-admin-remove-date').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const d = btn.getAttribute('data-date');
        await window.cloudSync.removeAvailableDate(d);
        renderAdminAvailableDates();
        renderAvailableDatesChips();
        updateQuickTimeButtonsForDate(dateInput.value);
        if (calendar) calendar.render();
        validateConflict();
      });
    });
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

  // 공식 9~12월 일정표 복원 버튼
  if (btnAdminResetOfficial) {
    btnAdminResetOfficial.addEventListener('click', async () => {
      if (confirm('9월~12월 공식 심방 가능 일정(35개 일자, 오전/오후/저녁 지정)으로 초기화하시겠습니까?')) {
        await window.cloudSync.resetToOfficialSchedule();
        alert('9월~12월 공식 심방 가능 일정이 성공적으로 적용되었습니다!');
        renderAdminAvailableDates();
        renderAvailableDatesChips();
        updateQuickTimeButtonsForDate(dateInput.value);
        if (calendar) calendar.render();
        validateConflict();
      }
    });
  }

  if (btnModeAll) {
    btnModeAll.addEventListener('click', async () => {
      await window.cloudSync.setRestrictMode(false);
      renderAdminAvailableDates();
      renderAvailableDatesChips();
      updateQuickTimeButtonsForDate(dateInput.value);
      if (calendar) calendar.render();
      validateConflict();
    });
  }

  if (btnModeRestricted) {
    btnModeRestricted.addEventListener('click', async () => {
      await window.cloudSync.setRestrictMode(true);
      renderAdminAvailableDates();
      renderAvailableDatesChips();
      updateQuickTimeButtonsForDate(dateInput.value);
      if (calendar) calendar.render();
      validateConflict();
    });
  }

  // 요일별 일괄 추가 버튼
  document.querySelectorAll('.btn-weekday-add').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetDay = Number(btn.getAttribute('data-day'));
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const today = new Date();
      const newDates = [];

      for (let i = 0; i <= 60; i++) {
        const cur = new Date(today);
        cur.setDate(today.getDate() + i);
        if (cur.getDay() === targetDay) {
          const y = cur.getFullYear();
          const m = String(cur.getMonth() + 1).padStart(2, '0');
          const d = String(cur.getDate()).padStart(2, '0');
          newDates.push(`${y}-${m}-${d}`);
        }
      }

      await window.cloudSync.addAvailableDates(newDates);
      alert(`향후 60일 내 모든 [${dayNames[targetDay]}요일] (${newDates.length}일)이 심방 가능 날짜로 등록되었습니다!`);
      renderAdminAvailableDates();
      renderAvailableDatesChips();
      updateQuickTimeButtonsForDate(dateInput.value);
      if (calendar) calendar.render();
      validateConflict();
    });
  });

  // 기간 또는 단일 날짜 추가 버튼
  if (btnAdminAddRange) {
    btnAdminAddRange.addEventListener('click', async () => {
      const startVal = adminDateStart.value;
      const endVal = adminDateEnd.value || startVal;

      if (!startVal) {
        alert('시작 날짜를 선택해주세요.');
        adminDateStart.focus();
        return;
      }

      if (startVal > endVal) {
        alert('종료 날짜는 시작 날짜 이후여야 합니다.');
        return;
      }

      const newDates = [];
      const cur = new Date(startVal);
      const end = new Date(endVal);

      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        newDates.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }

      await window.cloudSync.addAvailableDates(newDates);
      alert(`${startVal} ~ ${endVal} (${newDates.length}일)이 심방 가능 날짜로 등록되었습니다!`);
      adminDateStart.value = '';
      adminDateEnd.value = '';
      renderAdminAvailableDates();
      renderAvailableDatesChips();
      updateQuickTimeButtonsForDate(dateInput.value);
      if (calendar) calendar.render();
      validateConflict();
    });
  }

  // 모든 날짜 비우기 버튼
  if (btnAdminClearAllDates) {
    btnAdminClearAllDates.addEventListener('click', async () => {
      if (confirm('등록된 심방 가능 날짜를 모두 삭제하시겠습니까?\n모두 삭제되면 "모든 날짜 자유 신청 모드"로 자동 전환됩니다.')) {
        await window.cloudSync.clearAllAvailableDates();
        renderAdminAvailableDates();
        renderAvailableDatesChips();
        updateQuickTimeButtonsForDate(dateInput.value);
        if (calendar) calendar.render();
        validateConflict();
      }
    });
  }

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
      const isFinished = window.visitStore.isVisitFinished(v);
      html += `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-sm text-slate-700">
          <td class="py-3 px-3 text-center text-slate-400 text-xs">${idx + 1}</td>
          <td class="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
            ${v.soonName}
            ${
              isFinished
                ? `<span class="ml-1 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">🕊️ 완료</span>`
                : `<span class="ml-1 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">예정</span>`
            }
          </td>
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

    tbody.querySelectorAll('.btn-delete-visit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const soon = btn.getAttribute('data-soon');
        if (confirm(`정말로 [${soon}]의 심방 일정을 취소/삭제하시겠습니까?`)) {
          await window.cloudSync.deleteVisit(id);
          renderAdminTable();
          if (calendar) {
            calendar.render();
            renderSelectedDateSchedule(calendar.selectedDateStr);
          }
          renderSoonStatusBoard();
          const stats = window.visitStore.getSoonStats();
          updateHeaderSummary(stats);
          validateConflict();
        }
      });
    });
  }

  // 엑셀(CSV) 다운로드 기능
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
    URL.revokeObjectURL(url);
  });

  // ==========================================
  // 10. Firebase 클라우드 연동 모달
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
  // 11. 실시간 데이터 갱신 리스너
  // ==========================================
  window.cloudSync.subscribe((visits, meta) => {
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

    const stats = window.visitStore.getSoonStats();
    updateHeaderSummary(stats);

    renderAvailableDatesChips();
    updateQuickTimeButtonsForDate(dateInput.value);
    if (adminAuthenticated) {
      renderAdminAvailableDates();
    }

    if (currentTab === 'calendar' && calendar) {
      calendar.render();
      renderSelectedDateSchedule(calendar.selectedDateStr);
    } else if (currentTab === 'status') {
      renderSoonStatusBoard();
    } else if (currentTab === 'admin' && adminAuthenticated) {
      renderAdminTable();
    }

    validateConflict();
  });

  // ==========================================
  // 12. 빠른 시간 선택 버튼 & 이벤트 리스너
  // ==========================================
  document.querySelectorAll('.btn-quick-time').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
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
    updateQuickTimeButtonsForDate(dateInput.value);
    validateConflict();
    renderAvailableDatesChips();
    if (calendar) {
      calendar.selectDate(dateInput.value);
    }
  });
  startTimeInput.addEventListener('change', validateConflict);
  endTimeInput.addEventListener('change', validateConflict);

  // ==========================================
  // 13. 순심방 상세 조회 및 수정 / 삭제 모달 로직
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

  const editLeaderName = document.getElementById('edit-leader-name');
  const editVisitDate = document.getElementById('edit-visit-date');
  const editStartTime = document.getElementById('edit-start-time');
  const editEndTime = document.getElementById('edit-end-time');
  const editVisitPlace = document.getElementById('edit-visit-place');
  const editAttendeesCount = document.getElementById('edit-attendees-count');
  const editPrayerTopic = document.getElementById('edit-prayer-topic');

  function getDayOfWeekStr(dateStr) {
    if (!dateStr) return '';
    const dayObj = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[dayObj.getDay()] || '';
  }

  function openVisitDetailModal(visitId) {
    const visits = window.visitStore.getAllVisits();
    const visit = visits.find((v) => String(v.id) === String(visitId));
    if (!visit) {
      alert('신청 정보를 찾을 수 없습니다.');
      return;
    }

    currentDetailVisit = visit;
    const dayName = getDayOfWeekStr(visit.date);

    const isFinished = window.visitStore.isVisitFinished(visit);

    const modalSoonBadge = document.getElementById('detail-modal-soon-badge');
    if (modalSoonBadge) {
      modalSoonBadge.textContent = visit.soonName;
      if (isFinished) {
        modalSoonBadge.className = 'px-2.5 py-1 rounded-xl text-sm font-extrabold bg-emerald-600 text-white flex items-center gap-1 shadow-xs';
        modalSoonBadge.innerHTML = '<span>🕊️</span> ' + visit.soonName + ' <span class="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-md font-bold">완료</span>';
      } else {
        modalSoonBadge.className = 'px-2.5 py-1 rounded-xl text-sm font-extrabold bg-blue-600 text-white';
        modalSoonBadge.textContent = visit.soonName;
      }
    }

    const finishedAlert = document.getElementById('detail-finished-alert');
    if (finishedAlert) {
      if (isFinished) {
        finishedAlert.className = 'p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md flex items-center gap-3 border border-emerald-400/40';
        finishedAlert.innerHTML = `
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0 shadow-inner">🕊️</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5">
              <span>심방 완료</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/25 text-emerald-50">은혜 가운데 마쳤습니다</span>
            </div>
            <p class="text-xs text-emerald-100 mt-0.5 leading-snug">이 순의 대심방 일정이 성공적으로 완료되었습니다.</p>
          </div>
        `;
      } else {
        finishedAlert.className = 'hidden';
        finishedAlert.innerHTML = '';
      }
    }

    document.getElementById('detail-view-soon-leader').textContent = `${visit.soonName} (${visit.leaderName} 순장)`;
    document.getElementById('detail-view-datetime').textContent = `${visit.date} (${dayName}요일) ${visit.startTime} ~ ${visit.endTime}`;
    document.getElementById('detail-view-place').textContent = visit.place;
    document.getElementById('detail-view-attendees').textContent = visit.attendees ? `${visit.attendees}명` : '미기재';
    document.getElementById('detail-view-prayer').textContent = visit.prayerTopic || '등록된 기도제목이 없습니다.';

    detailViewMode.classList.remove('hidden');
    detailEditMode.classList.add('hidden');
    editConflictAlert.classList.add('hidden');
    visitDetailModal.classList.remove('hidden');
  }

  if (btnCloseDetailModal) {
    btnCloseDetailModal.addEventListener('click', () => {
      visitDetailModal.classList.add('hidden');
    });
  }

  if (visitDetailModal) {
    visitDetailModal.addEventListener('click', (e) => {
      if (e.target === visitDetailModal) {
        visitDetailModal.classList.add('hidden');
      }
    });
  }

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

  if (btnDetailSwitchEdit) {
    btnDetailSwitchEdit.addEventListener('click', () => {
      if (!currentDetailVisit) return;
      const v = currentDetailVisit;

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

  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
      detailEditMode.classList.add('hidden');
      detailViewMode.classList.remove('hidden');
    });
  }

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
          <span class="font-bold shrink-0">⚠️ 중복 오류:</span>
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
      input.addEventListener('input', validateEditConflict);
    }
  });

  async function executeSaveEdit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!currentDetailVisit) return;

    if (!validateEditConflict()) {
      alert('시간 중복 또는 오류가 있습니다. 다시 확인해주세요.');
      return;
    }

    const leaderNameVal = editLeaderName.value.trim();
    const dateVal = editVisitDate.value;
    const startTimeVal = editStartTime.value;
    const endTimeVal = editEndTime.value;
    const placeVal = editVisitPlace.value.trim();

    if (!leaderNameVal || !dateVal || !startTimeVal || !endTimeVal || !placeVal) {
      alert('필수 입력 항목(순장명, 날짜, 시작/종료시간, 장소)을 모두 입력해주세요.');
      return;
    }

    const soonName = currentDetailVisit.soonName;
    const targetId = currentDetailVisit.id;

    const updateData = {
      leaderName: leaderNameVal,
      date: dateVal,
      startTime: startTimeVal,
      endTime: endTimeVal,
      place: placeVal,
      attendees: editAttendeesCount.value ? Number(editAttendeesCount.value) : 0,
      prayerTopic: editPrayerTopic.value.trim()
    };

    btnSaveEdit.disabled = true;
    btnSaveEdit.textContent = '수정 저장 중...';

    try {
      const res = await window.cloudSync.updateVisit(targetId, updateData);
      if (res && res.success) {
        alert(`[${soonName}] 심방 일정이 성공적으로 수정되었습니다!`);
        visitDetailModal.classList.add('hidden');
        currentDetailVisit = null;

        if (calendar) {
          calendar.render();
          renderSelectedDateSchedule(calendar.selectedDateStr);
        }
        renderSoonStatusBoard();
        if (adminAuthenticated) renderAdminTable();

        const stats = window.visitStore.getSoonStats();
        updateHeaderSummary(stats);
        validateConflict();
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
  }

  if (detailEditForm) {
    detailEditForm.addEventListener('submit', executeSaveEdit);
  }
  if (btnSaveEdit) {
    btnSaveEdit.addEventListener('click', (e) => {
      if (e.target.type !== 'submit') {
        executeSaveEdit(e);
      }
    });
  }

  if (btnDetailDelete) {
    btnDetailDelete.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!currentDetailVisit) return;
      const soonName = currentDetailVisit.soonName;
      const targetId = currentDetailVisit.id;

      if (confirm(`정말로 [${soonName}]의 순심방 일정을 취소/삭제하시겠습니까?\n취소하시면 다른 순이 해당 시간대를 신청할 수 있게 됩니다.`)) {
        try {
          const res = await window.cloudSync.deleteVisit(targetId);
          if (res && res.success) {
            alert(`[${soonName}] 심방 일정이 취소되었습니다.`);
            visitDetailModal.classList.add('hidden');
            currentDetailVisit = null;

            if (calendar) {
              calendar.render();
              renderSelectedDateSchedule(calendar.selectedDateStr);
            }
            renderSoonStatusBoard();
            if (adminAuthenticated) renderAdminTable();

            const stats = window.visitStore.getSoonStats();
            updateHeaderSummary(stats);
            validateConflict();
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

  // 14. 전체 화면 클릭 이벤트 위임
  document.addEventListener('click', (e) => {
    const btnConflictEdit = e.target.closest('.btn-conflict-edit');
    if (btnConflictEdit) {
      const visitId = btnConflictEdit.getAttribute('data-visit-id');
      if (visitId) {
        openVisitDetailModal(visitId);
        if (btnDetailSwitchEdit) btnDetailSwitchEdit.click();
      }
      return;
    }

    const btnConflictDelete = e.target.closest('.btn-conflict-delete');
    if (btnConflictDelete) {
      const visitId = btnConflictDelete.getAttribute('data-visit-id');
      const soon = btnConflictDelete.getAttribute('data-soon') || '해당 순';
      if (confirm(`정말로 [${soon}]의 기존 심방 신청을 취소/삭제하시겠습니까?`)) {
        window.cloudSync.deleteVisit(visitId).then(() => {
          alert(`[${soon}] 기존 신청이 취소되었습니다. 이제 새로운 시간으로 신청하실 수 있습니다.`);
          validateConflict();
        });
      }
      return;
    }

    const card = e.target.closest('.card-view-detail');
    if (card) {
      if (!e.target.closest('.btn-quick-apply-soon') && !e.target.closest('.btn-delete-visit')) {
        const visitId = card.getAttribute('data-visit-id');
        if (visitId) {
          openVisitDetailModal(visitId);
        }
      }
    }
  });

  const sampleBtn = document.getElementById('btn-seed-sample');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      if (confirm('테스트용 샘플 일정 3건을 생성하시겠습니까? (공식 일정에 맞춰 자동 생성됩니다)')) {
        window.cloudSync.seedSampleData();
      }
    });
  }

  // 시작 초기화 실행
  initSoonSelectOptions();
  initDefaultDates();
  initCalendar();
  renderAvailableDatesChips();
  validateConflict();
});
