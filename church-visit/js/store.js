/**
 * 순심방 비즈니스 로직 및 중복 방지 검증 모듈
 * 우면공동체 공식 심방 가능 일정(오전/오후/저녁 슬롯) 내장
 */

const SOON_GROUPS = [
  {
    category: '여성순',
    items: Array.from({ length: 10 }, (_, i) => `여성${i + 2}순`) // 여성2순 ~ 여성11순 (여성1순 제외)
  },
  {
    category: '직여순 (직장여성)',
    items: Array.from({ length: 12 }, (_, i) => `직여${i + 1}순`) // 직여1순 ~ 직여12순
  },
  {
    category: '남성순',
    items: [1, 3, 4, 5, 6, 7, 8].map((n) => `남성${n}순`) // 남성1순, 남성3순 ~ 남성8순 (남성2순 제외)
  }
];

const EXCLUDED_SOONS = ['여성1순', '남성2순'];
if (typeof window !== 'undefined') {
  window.EXCLUDED_SOONS = EXCLUDED_SOONS;
}

const DEFAULT_SOONS = [
  ...SOON_GROUPS[0].items,
  ...SOON_GROUPS[1].items,
  ...SOON_GROUPS[2].items
];

// 우면공동체 9월~12월 공식 심방 가능 일정 (양육 프로그램 및 교회 일정 반영)
const OFFICIAL_SCHEDULE = {
  // 9월
  '2026-09-16': ['morning', 'afternoon', 'evening'], // 16일(수) 오전, 오후, 저녁
  '2026-09-17': ['morning', 'afternoon'],            // 17일(목) 오전, 오후
  '2026-09-22': ['morning', 'afternoon', 'evening'], // 22일(화) 오전, 오후, 저녁
  '2026-09-29': ['evening'],                         // 29일(화) 저녁
  '2026-09-30': ['morning', 'afternoon', 'evening'], // 30일(수) 오전, 오후, 저녁

  // 10월
  '2026-10-01': ['morning', 'afternoon', 'evening'], // 1일(목) 오전, 오후, 저녁
  '2026-10-02': ['morning', 'afternoon'],            // 2일(금) 오전, 오후
  '2026-10-07': ['morning', 'afternoon'],            // 7일(수) 오전, 오후
  '2026-10-08': ['evening'],                         // 8일(목) 저녁
  '2026-10-13': ['evening'],                         // 13일(화) 저녁
  '2026-10-14': ['morning', 'afternoon', 'evening'], // 14일(수) 오전, 오후, 저녁
  '2026-10-15': ['afternoon'],                       // 15일(목) 오후
  '2026-10-16': ['morning', 'afternoon', 'evening'], // 16일(금) 오전, 오후, 저녁
  '2026-10-17': ['afternoon'],                       // 17일(토) 오후
  '2026-10-20': ['evening'],                         // 20일(화) 저녁
  '2026-10-21': ['evening'],                         // 21일(수) 저녁
  '2026-10-22': ['evening'],                         // 22일(목) 저녁
  '2026-10-23': ['morning', 'afternoon', 'evening'], // 23일(금) 오전, 오후, 저녁
  '2026-10-24': ['afternoon'],                       // 24일(토) 오후
  '2026-10-30': ['evening'],                         // 30일(금) 저녁

  // 11월
  '2026-11-03': ['evening'],                         // 3일(화) 저녁
  '2026-11-04': ['morning', 'afternoon'],            // 4일(수) 오전, 오후
  '2026-11-05': ['afternoon', 'evening'],            // 5일(목) 오후, 저녁
  '2026-11-06': ['morning', 'afternoon', 'evening'], // 6일(금) 오전, 오후, 저녁
  '2026-11-07': ['afternoon'],                       // 7일(토) 오후
  '2026-11-12': ['afternoon', 'evening'],            // 12일(목) 오후, 저녁
  '2026-11-13': ['morning', 'afternoon', 'evening'], // 13일(금) 오전, 오후, 저녁
  '2026-11-14': ['morning', 'afternoon', 'evening'], // 14일(토) 오전, 오후, 저녁 (사용자 '14일(금)' 표기 모두 지원)
  '2026-11-17': ['evening'],                         // 17일(화) 저녁
  '2026-11-18': ['morning', 'afternoon', 'evening'], // 18일(수) 오전, 오후, 저녁
  '2026-11-24': ['evening'],                         // 24일(화) 저녁
  '2026-11-25': ['morning', 'afternoon', 'evening'], // 25일(수) 오전, 오후, 저녁
  '2026-11-26': ['afternoon', 'evening'],            // 26일(목) 오후, 저녁
  '2026-11-27': ['morning', 'afternoon', 'evening'], // 27일(금) 오전, 오후, 저녁

  // 12월
  '2026-12-02': ['afternoon', 'evening'],            // 2일(수) 오후, 저녁
  '2026-12-03': ['afternoon', 'evening']             // 3일(목) 오후, 저녁
};

const SLOT_DEFINITIONS = {
  morning: {
    key: 'morning',
    name: '오전',
    defaultStart: '10:00',
    defaultEnd: '12:00',
    minMinutes: 540,  // 09:00
    maxMinutes: 780   // 13:00
  },
  afternoon: {
    key: 'afternoon',
    name: '오후',
    defaultStart: '14:00',
    defaultEnd: '16:00',
    minMinutes: 780,  // 13:00
    maxMinutes: 1080  // 18:00
  },
  evening: {
    key: 'evening',
    name: '저녁',
    defaultStart: '19:00',
    defaultEnd: '21:00',
    minMinutes: 1080, // 18:00
    maxMinutes: 1350  // 22:30
  }
};

class VisitStore {
  constructor(syncService) {
    this.sync = syncService;
  }

  // 전체 순 목록 가져오기 (총 31개)
  getDefaultSoons() {
    return DEFAULT_SOONS;
  }

  // 그룹별 순 목록 가져오기
  getSoonGroups() {
    return SOON_GROUPS;
  }

  // 전체 신청 내역 (시간순 정렬, 제외된 순 필터링)
  getAllVisits() {
    const list = this.sync.getVisits();
    return list
      .filter((v) => !EXCLUDED_SOONS.includes(v.soonName ? v.soonName.trim() : ''))
      .sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.startTime.localeCompare(b.startTime);
      });
  }

  // 특정 날짜의 신청 목록
  getVisitsByDate(dateStr) {
    return this.getAllVisits().filter((v) => v.date === dateStr);
  }

  // 'HH:mm' 문자열을 분 단위 숫자로 변환 (예: '10:30' -> 630)
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // ==========================================
  // 심방 가능 날짜 및 시간대(슬롯) 관리 로직
  // ==========================================
  getScheduleMap() {
    if (this.sync && typeof this.sync.getScheduleMap === 'function') {
      const map = this.sync.getScheduleMap();
      if (map && Object.keys(map).length > 0) return map;
    }
    return OFFICIAL_SCHEDULE;
  }

  getAvailableDates() {
    return Object.keys(this.getScheduleMap()).sort();
  }

  isRestrictMode() {
    if (!this.sync) return true;
    return this.sync.getIsRestrictMode();
  }

  isDateAvailable(dateStr) {
    if (!dateStr) return false;
    if (!this.isRestrictMode()) return true;
    return this.getAvailableDates().includes(dateStr);
  }

  getAllowedSlots(dateStr) {
    const schedule = this.getScheduleMap();
    return schedule[dateStr] || ['morning', 'afternoon', 'evening'];
  }

  getSlotsLabel(slots) {
    if (!slots || slots.length === 0) return '신청 불가';
    const names = slots.map((s) => (SLOT_DEFINITIONS[s] ? SLOT_DEFINITIONS[s].name : s));
    if (slots.length === 3) return '전일(오전/오후/저녁)';
    return names.join('·');
  }

  getSlotSummaryForDate(dateStr) {
    const slots = this.getAllowedSlots(dateStr);
    return this.getSlotsLabel(slots);
  }

  /**
   * 시간대가 허용된 슬롯(오전/오후/저녁)에 부합하는지 검사
   */
  checkSlotRestriction(dateStr, startTime, endTime) {
    if (!dateStr) return { allowed: true };
    if (!this.isRestrictMode()) return { allowed: true };

    // 1. 날짜 존재 여부 검사
    if (!this.isDateAvailable(dateStr)) {
      return {
        allowed: false,
        reason: '선택하신 날짜는 목사님 심방 일정이 없는 날짜입니다. 안내된 심방 가능 날짜를 확인해주세요.'
      };
    }

    // 2. 시간대 슬롯 검사
    if (!startTime || !endTime) return { allowed: true };

    const startMin = this.timeToMinutes(startTime);
    const endMin = this.timeToMinutes(endTime);
    const allowedSlots = this.getAllowedSlots(dateStr);

    // 해당 시간대가 어떤 슬롯에 속하는지 판별
    let matchedSlot = null;
    if (startMin >= 540 && endMin <= 780) {
      matchedSlot = 'morning';
    } else if (startMin >= 780 && endMin <= 1080) {
      matchedSlot = 'afternoon';
    } else if (startMin >= 1080 && endMin <= 1350) {
      matchedSlot = 'evening';
    } else {
      // 슬롯 경계를 넘어서는 경우 (예: 12시~14시 등)
      if (startMin < 780 && endMin > 540 && !allowedSlots.includes('morning')) {
        matchedSlot = 'disallowed';
      } else if (startMin < 1080 && endMin > 780 && !allowedSlots.includes('afternoon')) {
        matchedSlot = 'disallowed';
      } else if (startMin < 1350 && endMin > 1080 && !allowedSlots.includes('evening')) {
        matchedSlot = 'disallowed';
      }
    }

    if (matchedSlot === 'disallowed' || (matchedSlot && !allowedSlots.includes(matchedSlot))) {
      const allowedNames = this.getSlotsLabel(allowedSlots);
      const chosenName = matchedSlot && SLOT_DEFINITIONS[matchedSlot] ? SLOT_DEFINITIONS[matchedSlot].name : '해당 시간대';
      return {
        allowed: false,
        reason: `[${chosenName} 신청 불가] 해당 날짜(${dateStr})는 [${allowedNames}] 심방만 가능합니다. (양육 프로그램 및 교회 일정 고려)`
      };
    }

    return { allowed: true };
  }

  // 날짜 유효성 검사 결과
  checkDateRestriction(dateStr) {
    if (!dateStr) return { allowed: true, reason: null };
    if (!this.isRestrictMode()) return { allowed: true, reason: null };
    const allowed = this.isDateAvailable(dateStr);
    if (!allowed) {
      return {
        allowed: false,
        reason: '선택하신 날짜는 목사님 심방 일정이 없는 날짜입니다. 지정된 심방 가능 날짜를 선택해주세요.'
      };
    }
    return { allowed: true, reason: null };
  }

  /**
   * [핵심] 시간 중복(충돌) 및 슬롯 검사 함수
   */
  checkTimeConflict(date, startTime, endTime, excludeId = null) {
    if (!date || !startTime || !endTime) {
      return { hasConflict: false, conflictVisit: null, reason: null };
    }

    // 1. 날짜 및 시간대(오전/오후/저녁) 슬롯 검증
    const slotCheck = this.checkSlotRestriction(date, startTime, endTime);
    if (!slotCheck.allowed) {
      return {
        hasConflict: true,
        conflictVisit: null,
        reason: slotCheck.reason
      };
    }

    const startMin = this.timeToMinutes(startTime);
    const endMin = this.timeToMinutes(endTime);

    if (startMin >= endMin) {
      return {
        hasConflict: true,
        conflictVisit: null,
        reason: '종료 시간은 시작 시간보다 늦어야 합니다.'
      };
    }

    // 2. 다른 순과의 시간대 겹침 검사
    const dayVisits = this.getVisitsByDate(date);

    for (const v of dayVisits) {
      if (excludeId && String(v.id) === String(excludeId)) continue;

      const vStart = this.timeToMinutes(v.startTime);
      const vEnd = this.timeToMinutes(v.endTime);

      if (startMin < vEnd && endMin > vStart) {
        return {
          hasConflict: true,
          conflictVisit: v,
          reason: `[${v.soonName}] (${v.startTime} ~ ${v.endTime}) 일정과 시간이 겹칩니다.`
        };
      }
    }

    return { hasConflict: false, conflictVisit: null, reason: null };
  }

  /**
   * 동일 순 중복 신청 검사
   */
  checkSoonDuplicate(soonName, excludeId = null) {
    if (!soonName) return { isDuplicate: false, existing: null };

    const trimmed = soonName.trim();
    if (EXCLUDED_SOONS.includes(trimmed)) {
      return {
        isDuplicate: true,
        existing: null,
        reason: `[${trimmed}]은(는) 심방 운영 대상에서 제외된 순입니다.`
      };
    }
    const existing = this.getAllVisits().find(
      (v) => v.soonName.trim() === trimmed && (!excludeId || String(v.id) !== String(excludeId))
    );

    if (existing) {
      return {
        isDuplicate: true,
        existing,
        reason: `[${trimmed}]은(는) 이미 ${existing.date} ${existing.startTime}~${existing.endTime}에 신청 완료되었습니다.`
      };
    }

    return { isDuplicate: false, existing: null, reason: null };
  }

  /**
   * 심방 완료 여부 판별 (날짜 및 시간이 지났는지 확인)
   * @param {object} visit 
   * @returns {boolean}
   */
  isVisitFinished(visit) {
    if (!visit || !visit.date) return false;
    const now = new Date();
    const [y, m, d] = visit.date.split('-').map(Number);
    const timeStr = visit.endTime || visit.startTime || '23:59';
    const [hh, mm] = timeStr.split(':').map(Number);
    const visitEndTime = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
    return now >= visitEndTime;
  }

  /**
   * 순 전체 신청 현황 통계
   */
  getSoonStats() {
    const allVisits = this.getAllVisits();
    const registeredSoonMap = new Map();

    allVisits.forEach((v) => {
      registeredSoonMap.set(v.soonName.trim(), v);
    });

    const soonList = DEFAULT_SOONS.map((soon) => {
      const visit = registeredSoonMap.get(soon);
      return {
        name: soon,
        isRegistered: !!visit,
        visit: visit || null,
        isFinished: visit ? this.isVisitFinished(visit) : false
      };
    });

    // 기본 순 외에 직접 입력한 특별 순이 있는 경우 추가 (제외된 순은 미포함)
    allVisits.forEach((v) => {
      const name = v.soonName ? v.soonName.trim() : '';
      if (!DEFAULT_SOONS.includes(name) && !EXCLUDED_SOONS.includes(name)) {
        soonList.push({
          name: v.soonName,
          isRegistered: true,
          visit: v,
          isFinished: this.isVisitFinished(v)
        });
      }
    });

    const completedCount = allVisits.length;
    const finishedCount = allVisits.filter((v) => this.isVisitFinished(v)).length;
    const upcomingCount = completedCount - finishedCount;
    const totalCount = DEFAULT_SOONS.length;

    return {
      total: totalCount,
      completed: completedCount, // 전체 신청된 순
      finished: finishedCount,   // 심방 완료된 순 (시간 경과)
      upcoming: upcomingCount,   // 심방 예정인 순
      remaining: Math.max(0, totalCount - completedCount),
      rate: Math.round((completedCount / totalCount) * 100),
      soonList
    };
  }

  /**
   * 특정 날짜의 타임슬롯 현황
   */
  getDaySlotsStatus(dateStr) {
    const dayVisits = this.getVisitsByDate(dateStr);
    const slots = [];
    const baseHour = 9;
    const endHour = 22;

    for (let h = baseHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += 30) {
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const currentMin = h * 60 + m;

        const matched = dayVisits.find((v) => {
          const vStart = this.timeToMinutes(v.startTime);
          const vEnd = this.timeToMinutes(v.endTime);
          return currentMin >= vStart && currentMin < vEnd;
        });

        slots.push({
          time: timeStr,
          isBooked: !!matched,
          visit: matched || null
        });
      }
    }

    return slots;
  }
}

// 전역 인스턴스 및 상수 노출
window.OFFICIAL_SCHEDULE = OFFICIAL_SCHEDULE;
window.SLOT_DEFINITIONS = SLOT_DEFINITIONS;
window.visitStore = new VisitStore(window.cloudSync);
