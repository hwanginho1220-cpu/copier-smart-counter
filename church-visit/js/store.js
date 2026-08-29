/**
 * 순심방 비즈니스 로직 및 중복 방지 검증 모듈
 */

const DEFAULT_SOONS = Array.from({ length: 30 }, (_, i) => `${i + 1}순`);

class VisitStore {
  constructor(syncService) {
    this.sync = syncService;
  }

  // 30개 기본 순 목록 가져오기
  getDefaultSoons() {
    return DEFAULT_SOONS;
  }

  // 전체 신청 내역 (시간순 정렬)
  getAllVisits() {
    const list = this.sync.getVisits();
    return list.sort((a, b) => {
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

  /**
   * [핵심] 시간 중복(충돌) 검사 함수
   * 두 시간대 [startA, endA)와 [startB, endB)가 겹치는 조건:
   * startA < endB && endA > startB
   * 
   * @param {string} date 'YYYY-MM-DD'
   * @param {string} startTime 'HH:mm'
   * @param {string} endTime 'HH:mm'
   * @param {string|null} excludeId 수정 시 자기 자신 제외
   * @returns {{ hasConflict: boolean, conflictVisit: object|null, reason: string|null }}
   */
  checkTimeConflict(date, startTime, endTime, excludeId = null) {
    if (!date || !startTime || !endTime) {
      return { hasConflict: false, conflictVisit: null, reason: null };
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

    const dayVisits = this.getVisitsByDate(date);

    for (const v of dayVisits) {
      if (excludeId && v.id === excludeId) continue;

      const vStart = this.timeToMinutes(v.startTime);
      const vEnd = this.timeToMinutes(v.endTime);

      // 시간대 겹침 판단
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
   * 한 순이 여러 번 중복 신청하는 것을 방지
   * 
   * @param {string} soonName 순 이름 (예: '1순')
   * @param {string|null} excludeId 수정 시 제외
   */
  checkSoonDuplicate(soonName, excludeId = null) {
    if (!soonName) return { isDuplicate: false, existing: null };

    const trimmed = soonName.trim();
    const existing = this.getAllVisits().find(
      (v) => v.soonName.trim() === trimmed && (!excludeId || v.id !== excludeId)
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
   * 30개 순 전체 신청 현황 통계
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
        visit: visit || null
      };
    });

    // 기본 30순 외에 직접 입력한 특별 순이 있는 경우 추가
    allVisits.forEach((v) => {
      if (!DEFAULT_SOONS.includes(v.soonName.trim())) {
        soonList.push({
          name: v.soonName,
          isRegistered: true,
          visit: v
        });
      }
    });

    const completedCount = allVisits.length;
    const totalCount = DEFAULT_SOONS.length;

    return {
      total: totalCount,
      completed: completedCount,
      remaining: Math.max(0, totalCount - completedCount),
      rate: Math.round((completedCount / totalCount) * 100),
      soonList
    };
  }

  /**
   * 특정 날짜의 타임슬롯 현황 (오전 9시 ~ 밤 10시까지 30분 단위 분석)
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

        // 이 타임에 걸치는 심방 찾기
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

// 전역 인스턴스
window.visitStore = new VisitStore(window.cloudSync);
