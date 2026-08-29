/**
 * 모바일 최적화 인터랙티브 심방 캘린더 컴포넌트
 */

class VisitCalendar {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.currentDate = new Date();
    this.selectedDateStr = this.formatDate(new Date());
    this.options = {
      onDateSelect: () => {},
      ...options
    };
  }

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.render();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.render();
  }

  goToday() {
    this.currentDate = new Date();
    this.selectedDateStr = this.formatDate(new Date());
    this.render();
    this.options.onDateSelect(this.selectedDateStr);
  }

  selectDate(dateStr) {
    this.selectedDateStr = dateStr;
    this.render();
    this.options.onDateSelect(dateStr);
  }

  render() {
    if (!this.container) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0(일) ~ 6(토)
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDate = new Date(year, month, 0).getDate();

    const todayStr = this.formatDate(new Date());
    const allVisits = window.visitStore ? window.visitStore.getAllVisits() : [];

    // 날짜별 방문 맵 구축
    const dateMap = new Map();
    allVisits.forEach((v) => {
      if (!dateMap.has(v.date)) {
        dateMap.set(v.date, []);
      }
      dateMap.get(v.date).push(v);
    });

    let html = `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <!-- 캘린더 상단 헤더 & 컨트롤 -->
        <div class="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div class="flex items-center gap-2">
            <h2 class="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              ${year}년 <span class="text-blue-600">${month + 1}월</span>
            </h2>
            <button id="cal-btn-today" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition">
              오늘
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button id="cal-btn-prev" class="p-2 rounded-xl text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <button id="cal-btn-next" class="p-2 rounded-xl text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>

        <!-- 요일 헤더 -->
        <div class="calendar-grid bg-slate-100/70 border-b border-slate-200 text-center text-xs font-semibold py-2.5 text-slate-500">
          <div class="text-rose-500">일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div class="text-blue-500">토</div>
        </div>

        <!-- 날짜 그리드 -->
        <div class="calendar-grid divide-x divide-y divide-slate-100">
    `;

    // 1. 이전 달 빈 칸
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevDate = prevMonthLastDate - i;
      html += `
        <div class="calendar-day-cell p-1 sm:p-2 bg-slate-50/40 text-slate-300 opacity-60">
          <span class="text-xs sm:text-sm font-medium pl-1">${prevDate}</span>
        </div>
      `;
    }

    // 2. 이번 달 날짜들
    for (let day = 1; day <= lastDate; day++) {
      const dayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayObj = new Date(year, month, day);
      const dayOfWeek = dayObj.getDay();

      const isToday = dayDateStr === todayStr;
      const isSelected = dayDateStr === this.selectedDateStr;
      const visits = dateMap.get(dayDateStr) || [];
      const hasVisits = visits.length > 0;

      let textClass = 'text-slate-700';
      if (dayOfWeek === 0) textClass = 'text-rose-600 font-medium';
      if (dayOfWeek === 6) textClass = 'text-blue-600 font-medium';

      let cellBg = isToday ? 'today' : 'bg-white';
      if (isSelected) cellBg += ' selected';

      html += `
        <div class="calendar-day-cell p-1 sm:p-2 cursor-pointer ${cellBg} relative flex flex-col justify-between"
             data-date="${dayDateStr}">
          <div class="flex items-center justify-between">
            <span class="text-xs sm:text-sm font-semibold rounded-full w-6 h-6 flex items-center justify-center ${
              isToday ? 'bg-blue-600 text-white shadow-sm' : textClass
            }">
              ${day}
            </span>
            ${
              hasVisits
                ? `<span class="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                    ${visits.length}건
                   </span>`
                : ''
            }
          </div>

          <!-- 예약 내역 배지 칩 -->
          <div class="mt-1 space-y-1 overflow-hidden">
            ${visits
              .slice(0, 2)
              .map(
                (v) => `
              <div class="card-view-detail truncate text-[10px] sm:text-xs py-0.5 px-1.5 rounded font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200/60 flex items-center gap-1 shadow-2xs cursor-pointer transition"
                   data-visit-id="${v.id}">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                <span class="font-bold shrink-0">${v.startTime}</span>
                <span class="truncate">${v.soonName}</span>
              </div>
            `
              )
              .join('')}
            ${
              visits.length > 2
                ? `<div class="text-[10px] text-slate-400 pl-1 font-medium">+${visits.length - 2}건 더보기</div>`
                : ''
            }
          </div>
        </div>
      `;
    }

    // 3. 다음 달 빈 칸 맞추기 (총 셀 개수가 7의 배수가 되도록)
    const totalCells = firstDay + lastDate;
    const nextDays = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= nextDays; i++) {
      html += `
        <div class="calendar-day-cell p-1 sm:p-2 bg-slate-50/40 text-slate-300 opacity-60">
          <span class="text-xs sm:text-sm font-medium pl-1">${i}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEvents();
  }

  attachEvents() {
    // 이전/다음/오늘 버튼
    const prevBtn = document.getElementById('cal-btn-prev');
    const nextBtn = document.getElementById('cal-btn-next');
    const todayBtn = document.getElementById('cal-btn-today');

    if (prevBtn) prevBtn.addEventListener('click', () => this.prevMonth());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextMonth());
    if (todayBtn) todayBtn.addEventListener('click', () => this.goToday());

    // 날짜 셀 클릭 이벤트
    const cells = this.container.querySelectorAll('[data-date]');
    cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const date = cell.getAttribute('data-date');
        this.selectDate(date);
      });
    });
  }
}

window.VisitCalendar = VisitCalendar;
