/**
 * Firebase Firestore & LocalStorage 하이브리드 데이터 동기화 서비스
 * 우면공동체 강현구 목사님 순심방 전용 실시간 동기화
 */

const STORAGE_KEY_VISITS = 'church_visit_data_v1';
const STORAGE_KEY_FIREBASE_CONFIG = 'church_visit_firebase_config';
const STORAGE_KEY_DELETED = 'church_visit_deleted_ids_v1';
const STORAGE_KEY_SCHEDULE_MAP = 'church_visit_schedule_map_v2';
const STORAGE_KEY_RESTRICT_MODE = 'church_visit_restrict_mode_v2';

class CloudSyncService {
  constructor() {
    this.isCloudEnabled = false;
    this.db = null;
    this.unsubscribe = null;
    this.settingsUnsubscribe = null;
    this.listeners = [];
    this.visits = [];
    this.deletedVisitIds = this.loadDeletedIds();
    this.scheduleMap = this.loadScheduleMap();
    this.isRestrictMode = this.loadRestrictMode();
    this.init();
  }

  loadDeletedIds() {
    try {
      const str = localStorage.getItem(STORAGE_KEY_DELETED);
      return new Set(str ? JSON.parse(str) : []);
    } catch (e) {
      return new Set();
    }
  }

  saveDeletedIds() {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify([...this.deletedVisitIds]));
    } catch (e) {}
  }

  // 심방 가능 일정표 로드 (기본값: window.OFFICIAL_SCHEDULE)
  loadScheduleMap() {
    try {
      const str = localStorage.getItem(STORAGE_KEY_SCHEDULE_MAP);
      if (str) {
        const parsed = JSON.parse(str);
        if (parsed && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return (typeof window !== 'undefined' && window.OFFICIAL_SCHEDULE) ? { ...window.OFFICIAL_SCHEDULE } : {};
  }

  loadRestrictMode() {
    try {
      const str = localStorage.getItem(STORAGE_KEY_RESTRICT_MODE);
      return str !== null ? JSON.parse(str) : true;
    } catch (e) {
      return true;
    }
  }

  saveScheduleLocally(scheduleMap, isRestrictMode = true) {
    try {
      localStorage.setItem(STORAGE_KEY_SCHEDULE_MAP, JSON.stringify(scheduleMap));
      localStorage.setItem(STORAGE_KEY_RESTRICT_MODE, JSON.stringify(isRestrictMode));
    } catch (e) {}
  }

  getScheduleMap() {
    if (!this.scheduleMap || Object.keys(this.scheduleMap).length === 0) {
      if (typeof window !== 'undefined' && window.OFFICIAL_SCHEDULE) {
        this.scheduleMap = { ...window.OFFICIAL_SCHEDULE };
      }
    }
    return this.scheduleMap || {};
  }

  getAvailableDates() {
    return Object.keys(this.getScheduleMap()).sort();
  }

  getIsRestrictMode() {
    return this.isRestrictMode;
  }

  // 심방 가능 일정표 및 운영 모드 저장
  async saveScheduleMap(scheduleMap, isRestrictMode = true) {
    this.scheduleMap = { ...scheduleMap };
    this.isRestrictMode = isRestrictMode;
    this.saveScheduleLocally(this.scheduleMap, isRestrictMode);
    this.notifyListeners({ type: 'DATES_UPDATE', source: 'local' });

    if (this.isCloudEnabled && this.db) {
      this.db.collection('settings').doc('schedule').set({
        scheduleMap: this.scheduleMap,
        availableDates: Object.keys(this.scheduleMap).sort(),
        isRestrictMode,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch((err) => console.warn('클라우드 가능 일정 동기화 지연:', err.message));
    }
    return true;
  }

  async saveAvailableDates(dates, isRestrictMode = true) {
    const map = { ...this.getScheduleMap() };
    const currentDates = Object.keys(map);

    // 새로 전달된 날짜 중 없는 것은 전일 허용으로 추가
    dates.forEach((d) => {
      if (!map[d]) {
        map[d] = ['morning', 'afternoon', 'evening'];
      }
    });

    // 목록에 없는 날짜는 삭제
    currentDates.forEach((d) => {
      if (!dates.includes(d)) {
        delete map[d];
      }
    });

    return this.saveScheduleMap(map, isRestrictMode);
  }

  async setDateSlots(dateStr, slots) {
    const map = { ...this.getScheduleMap() };
    if (!slots || slots.length === 0) {
      delete map[dateStr];
    } else {
      map[dateStr] = slots;
    }
    return this.saveScheduleMap(map, this.isRestrictMode);
  }

  async removeAvailableDate(dateStr) {
    const map = { ...this.getScheduleMap() };
    delete map[dateStr];
    return this.saveScheduleMap(map, this.isRestrictMode);
  }

  async addAvailableDates(newDatesArr, defaultSlots = ['morning', 'afternoon', 'evening']) {
    const map = { ...this.getScheduleMap() };
    newDatesArr.forEach((d) => {
      if (!map[d]) {
        map[d] = defaultSlots;
      }
    });
    return this.saveScheduleMap(map, this.isRestrictMode);
  }

  async clearAllAvailableDates() {
    return this.saveScheduleMap({}, this.isRestrictMode);
  }

  async resetToOfficialSchedule() {
    if (typeof window !== 'undefined' && window.OFFICIAL_SCHEDULE) {
      return this.saveScheduleMap(window.OFFICIAL_SCHEDULE, true);
    }
    return false;
  }

  async setRestrictMode(isRestrict) {
    return this.saveScheduleMap(this.getScheduleMap(), isRestrict);
  }

  // 초기화: 저장된 Firebase 설정 확인 또는 파일 기본 설정 로드
  init() {
    let savedConfig = this.getSavedFirebaseConfig();
    
    // 파일(firebase-config.js)에 기본 설정이 적혀있는 경우 우선 적용
    if (!savedConfig && window.DEFAULT_FIREBASE_CONFIG && window.DEFAULT_FIREBASE_CONFIG.apiKey && window.DEFAULT_FIREBASE_CONFIG.projectId) {
      savedConfig = window.DEFAULT_FIREBASE_CONFIG;
    }

    if (savedConfig && savedConfig.apiKey && savedConfig.projectId) {
      this.initFirebase(savedConfig);
    } else {
      this.loadFromLocalStorage();
    }
  }

  getSavedFirebaseConfig() {
    try {
      const configStr = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
      return configStr ? JSON.parse(configStr) : null;
    } catch (e) {
      console.error('설정 로드 실패:', e);
      return null;
    }
  }

  saveFirebaseConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
      return this.initFirebase(config);
    } catch (e) {
      console.error('설정 저장 실패:', e);
      return false;
    }
  }

  clearFirebaseConfig() {
    localStorage.removeItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    this.isCloudEnabled = false;
    this.db = null;
    this.loadFromLocalStorage();
    this.notifyListeners();
  }

  // Firebase 초기화
  initFirebase(config) {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK가 로드되지 않아 로컬 모드로 시작합니다.');
        this.loadFromLocalStorage();
        return false;
      }

      let app;
      if (firebase.apps && firebase.apps.length > 0) {
        app = firebase.apps[0];
      } else {
        app = firebase.initializeApp(config);
      }

      this.db = firebase.firestore();
      this.isCloudEnabled = true;

      // 1. 실시간 방문 신청 구독 (onSnapshot)
      if (this.unsubscribe) this.unsubscribe();
      this.unsubscribe = this.db.collection('visits').onSnapshot(
        (snapshot) => {
          const cloudVisits = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;
            const fieldId = data.id ? String(data.id) : null;

            if (this.deletedVisitIds) {
              if (this.deletedVisitIds.has(docId) || (fieldId && this.deletedVisitIds.has(fieldId))) {
                return;
              }
            }

            cloudVisits.push({
              ...data,
              id: docId,
              rawFieldId: fieldId
            });
          });
          this.visits = cloudVisits;
          this.saveToLocalStorage(this.visits);
          this.notifyListeners({ type: 'SYNC_UPDATE', source: 'cloud' });
        },
        (error) => {
          console.error('Firestore 실시간 동기화 에러:', error);
          this.isCloudEnabled = false;
          this.loadFromLocalStorage();
          this.notifyListeners({ type: 'ERROR', message: '클라우드 동기화 실패. 로컬 모드로 전환됩니다.' });
        }
      );

      // 2. 실시간 심방 가능 일정표 구독 (onSnapshot)
      if (this.settingsUnsubscribe) this.settingsUnsubscribe();
      this.settingsUnsubscribe = this.db.collection('settings').doc('schedule').onSnapshot(
        (doc) => {
          if (doc.exists) {
            const data = doc.data() || {};
            if (data.scheduleMap && typeof data.scheduleMap === 'object') {
              this.scheduleMap = data.scheduleMap;
            } else if (Array.isArray(data.availableDates)) {
              const map = {};
              data.availableDates.forEach((d) => { map[d] = ['morning', 'afternoon', 'evening']; });
              this.scheduleMap = map;
            }
            this.isRestrictMode = data.isRestrictMode !== false;
            this.saveScheduleLocally(this.scheduleMap, this.isRestrictMode);
            this.notifyListeners({ type: 'DATES_UPDATE', source: 'cloud' });
          }
        },
        (error) => {
          console.warn('Firestore 일정 설정 동기화 지연:', error);
        }
      );

      console.log('우면공동체 실시간 클라우드 동기화 활성화 완료!');
      return true;
    } catch (error) {
      console.error('Firebase 초기화 실패:', error);
      this.isCloudEnabled = false;
      this.loadFromLocalStorage();
      return false;
    }
  }

  // 로컬 스토리지 데이터 로드
  loadFromLocalStorage() {
    try {
      const dataStr = localStorage.getItem(STORAGE_KEY_VISITS);
      if (dataStr) {
        this.visits = JSON.parse(dataStr);
      } else {
        this.visits = [];
      }
    } catch (e) {
      console.error('로컬스토리지 로드 에러:', e);
      this.visits = [];
    }
    this.notifyListeners({ type: 'LOCAL_LOAD' });
  }

  saveToLocalStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY_VISITS, JSON.stringify(data));
    } catch (e) {
      console.error('로컬스토리지 저장 에러:', e);
    }
  }

  // 리스너 등록
  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.visits, {
      isCloud: this.isCloudEnabled,
      availableDates: this.getAvailableDates(),
      scheduleMap: this.getScheduleMap(),
      isRestrictMode: this.getIsRestrictMode()
    });
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  notifyListeners(meta = {}) {
    this.listeners.forEach((cb) => cb(this.visits, {
      isCloud: this.isCloudEnabled,
      availableDates: this.getAvailableDates(),
      scheduleMap: this.getScheduleMap(),
      isRestrictMode: this.getIsRestrictMode(),
      ...meta
    }));
  }

  getVisits() {
    return [...this.visits];
  }

  // 심방 신청 추가
  async addVisit(visitData) {
    const id = visitData.id || ('visit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const newEntry = {
      id,
      ...visitData,
      createdAt: visitData.createdAt || new Date().toISOString(),
      status: 'confirmed'
    };

    if (this.deletedVisitIds && this.deletedVisitIds.has(id)) {
      this.deletedVisitIds.delete(id);
      this.saveDeletedIds();
    }

    this.visits = this.visits.filter((v) => String(v.id) !== String(id));
    this.visits.push(newEntry);
    this.saveToLocalStorage(this.visits);
    this.notifyListeners({ type: 'NEW_VISIT', data: newEntry });

    if (this.isCloudEnabled && this.db) {
      this.db.collection('visits').doc(id).set(newEntry)
        .then(() => console.log('클라우드 저장 성공:', id))
        .catch((err) => console.warn('클라우드 저장 지연:', err.message));
    }

    return { success: true, id };
  }

  // 심방 신청 수정
  async updateVisit(id, updateData) {
    const idStr = String(id);
    const updated = {
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    if (this.deletedVisitIds && this.deletedVisitIds.has(idStr)) {
      this.deletedVisitIds.delete(idStr);
      this.saveDeletedIds();
    }

    const index = this.visits.findIndex((v) => String(v.id) === idStr);
    if (index !== -1) {
      this.visits[index] = { ...this.visits[index], ...updated };
      this.saveToLocalStorage(this.visits);
      this.notifyListeners({ type: 'UPDATE_VISIT', data: this.visits[index] });
    }

    if (this.isCloudEnabled && this.db) {
      this.db.collection('visits').doc(idStr).set(updated, { merge: true })
        .then(() => console.log('클라우드 수정 완료:', idStr))
        .catch((err) => console.warn('클라우드 수정 지연:', err.message));
    }

    return { success: true };
  }

  // 심방 신청 삭제/취소
  async deleteVisit(id) {
    const idStr = String(id);
    const existing = this.visits.find((v) => String(v.id) === idStr || (v.rawFieldId && String(v.rawFieldId) === idStr));

    if (!this.deletedVisitIds) this.deletedVisitIds = new Set();
    this.deletedVisitIds.add(idStr);
    if (existing) {
      this.deletedVisitIds.add(String(existing.id));
      if (existing.rawFieldId) this.deletedVisitIds.add(String(existing.rawFieldId));
    }
    this.saveDeletedIds();

    this.visits = this.visits.filter((v) => String(v.id) !== idStr && (!v.rawFieldId || String(v.rawFieldId) !== idStr));
    this.saveToLocalStorage(this.visits);
    this.notifyListeners({ type: 'DELETE_VISIT', id: idStr });

    if (this.isCloudEnabled && this.db) {
      this.db.collection('visits').doc(idStr).delete()
        .then(() => console.log('클라우드 문서 삭제 완료:', idStr))
        .catch((err) => console.warn('클라우드 삭제 지연:', err.message));

      if (existing && existing.rawFieldId && String(existing.rawFieldId) !== idStr) {
        this.db.collection('visits').doc(String(existing.rawFieldId)).delete().catch(() => {});
      }
      if (existing && existing.id && String(existing.id) !== idStr) {
        this.db.collection('visits').doc(String(existing.id)).delete().catch(() => {});
      }
    }

    return { success: true };
  }

  // 샘플 데이터 생성
  seedSampleData() {
    const samples = [
      {
        id: 'sample_v2_1_' + Date.now(),
        soonName: '여성1순',
        leaderName: '김철수',
        date: '2026-09-16',
        startTime: '10:00',
        endTime: '12:00',
        place: '김철수 순장 자택',
        attendees: 5,
        prayerTopic: '순원들의 자녀 취업과 건강을 위해 기도 부탁드립니다.',
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      },
      {
        id: 'sample_v2_2_' + Date.now(),
        soonName: '직여3순',
        leaderName: '이영희',
        date: '2026-09-22',
        startTime: '14:00',
        endTime: '16:00',
        place: '교회 2층 새가족실',
        attendees: 7,
        prayerTopic: '순원 간의 깊은 교제와 새가족 정착',
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      },
      {
        id: 'sample_v2_3_' + Date.now(),
        soonName: '남성2순',
        leaderName: '박민수',
        date: '2026-09-29',
        startTime: '19:00',
        endTime: '21:00',
        place: '카페 세미나실',
        attendees: 6,
        prayerTopic: '직장인 순원들의 영적 회복과 가정을 위해',
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      }
    ];

    samples.forEach((sample) => {
      this.addVisit(sample);
    });

    this.notifyListeners({ type: 'SEED_COMPLETE' });
  }
}

// 전역 인스턴스 노출
window.cloudSync = new CloudSyncService();
