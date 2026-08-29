/**
 * Firebase Firestore & LocalStorage 하이브리드 데이터 동기화 서비스
 * 우면공동체 강현구 목사님 순심방 전용 실시간 동기화
 */

const STORAGE_KEY_VISITS = 'church_visit_data_v1';
const STORAGE_KEY_FIREBASE_CONFIG = 'church_visit_firebase_config';
const STORAGE_KEY_DELETED = 'church_visit_deleted_ids_v1';

class CloudSyncService {
  constructor() {
    this.isCloudEnabled = false;
    this.db = null;
    this.unsubscribe = null;
    this.listeners = [];
    this.visits = [];
    this.deletedVisitIds = this.loadDeletedIds();
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

      // 실시간 리스너 구독 (onSnapshot)
      if (this.unsubscribe) this.unsubscribe();
      this.unsubscribe = this.db.collection('visits').onSnapshot(
        (snapshot) => {
          const cloudVisits = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;
            const fieldId = data.id ? String(data.id) : null;

            // doc.id 또는 data.id 중 하나라도 삭제목록에 있으면 부활 차단!
            if (this.deletedVisitIds) {
              if (this.deletedVisitIds.has(docId) || (fieldId && this.deletedVisitIds.has(fieldId))) {
                return;
              }
            }

            // doc.id를 고유 id로 강제 통일하여 Firestore 문서 삭제와 100% 일치
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
    callback(this.visits, { isCloud: this.isCloudEnabled });
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  notifyListeners(meta = {}) {
    this.listeners.forEach((cb) => cb(this.visits, { isCloud: this.isCloudEnabled, ...meta }));
  }

  getVisits() {
    return [...this.visits];
  }

  // 심방 신청 추가 (즉각 로컬 반영 + 백그라운드 클라우드 동기화)
  async addVisit(visitData) {
    const id = visitData.id || ('visit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const newEntry = {
      id,
      ...visitData,
      createdAt: visitData.createdAt || new Date().toISOString(),
      status: 'confirmed'
    };

    // 새로 등록하는 항목은 묘비(삭제목록)에서 해제
    if (this.deletedVisitIds && this.deletedVisitIds.has(id)) {
      this.deletedVisitIds.delete(id);
      this.saveDeletedIds();
    }

    // 1. 로컬 메모리 및 LocalStorage에 즉시 반영 (0.01초 즉각 완료)
    this.visits = this.visits.filter((v) => String(v.id) !== String(id));
    this.visits.push(newEntry);
    this.saveToLocalStorage(this.visits);
    this.notifyListeners({ type: 'NEW_VISIT', data: newEntry });

    // 2. Firebase 클라우드가 켜져 있는 경우 백그라운드 비동기 저장
    if (this.isCloudEnabled && this.db) {
      this.db.collection('visits').doc(id).set(newEntry)
        .then(() => console.log('클라우드 저장 성공:', id))
        .catch((err) => console.warn('클라우드 저장 지연:', err.message));
    }

    return { success: true, id };
  }

  // 심방 신청 수정 (즉각 로컬 반영 + 백그라운드 클라우드 동기화)
  async updateVisit(id, updateData) {
    const idStr = String(id);
    const updated = {
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    // 혹시 삭제 목록에 등록되어 있었다면 해제
    if (this.deletedVisitIds && this.deletedVisitIds.has(idStr)) {
      this.deletedVisitIds.delete(idStr);
      this.saveDeletedIds();
    }

    // 1. 로컬 메모리 및 LocalStorage 즉각 반영
    const index = this.visits.findIndex((v) => String(v.id) === idStr);
    if (index !== -1) {
      this.visits[index] = { ...this.visits[index], ...updated };
      this.saveToLocalStorage(this.visits);
      this.notifyListeners({ type: 'UPDATE_VISIT', data: this.visits[index] });
    }

    // 2. Firebase 클라우드 백그라운드 비동기 업데이트 (set with merge로 문서 유무 무관 100% 성공)
    if (this.isCloudEnabled && this.db) {
      this.db.collection('visits').doc(idStr).set(updated, { merge: true })
        .then(() => console.log('클라우드 수정 완료:', idStr))
        .catch((err) => console.warn('클라우드 수정 지연:', err.message));
    }

    return { success: true };
  }

  // 심방 신청 삭제/취소 (즉각 로컬 삭제 + 묘비 등록 + 백그라운드 클라우드 삭제)
  async deleteVisit(id) {
    const idStr = String(id);

    // 1. 현재 메모리에서 항목 찾기 (doc.id 또는 rawFieldId 일치)
    const existing = this.visits.find((v) => String(v.id) === idStr || (v.rawFieldId && String(v.rawFieldId) === idStr));

    // 2. 묘비(Tombstone) 등록 -> 서버가 재전송해도 부활 차단!
    if (!this.deletedVisitIds) this.deletedVisitIds = new Set();
    this.deletedVisitIds.add(idStr);
    if (existing) {
      this.deletedVisitIds.add(String(existing.id));
      if (existing.rawFieldId) this.deletedVisitIds.add(String(existing.rawFieldId));
    }
    this.saveDeletedIds();

    // 3. 로컬 메모리 및 LocalStorage에서 즉각 삭제
    this.visits = this.visits.filter((v) => String(v.id) !== idStr && (!v.rawFieldId || String(v.rawFieldId) !== idStr));
    this.saveToLocalStorage(this.visits);
    this.notifyListeners({ type: 'DELETE_VISIT', id: idStr });

    // 4. Firebase 클라우드 문서 비동기 삭제 (doc.id 및 rawFieldId 둘 다 삭제)
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

  // 샘플 데이터 생성 (체험/테스트용)
  seedSampleData() {
    const today = new Date();
    const getDateStr = (offsetDays) => {
      const target = new Date(today);
      target.setDate(today.getDate() + offsetDays);
      const ty = target.getFullYear();
      const tm = String(target.getMonth() + 1).padStart(2, '0');
      const td = String(target.getDate()).padStart(2, '0');
      return `${ty}-${tm}-${td}`;
    };

    const samples = [
      {
        id: 'sample_v2_1_' + Date.now(),
        soonName: '여성1순',
        leaderName: '김철수',
        date: getDateStr(2),
        startTime: '10:00',
        endTime: '12:00',
        place: '김철수 순장 자택 (동탄역 롯데캐슬 102동)',
        attendees: 5,
        prayerTopic: '순원들의 자녀 취업과 건강을 위해 기도 부탁드립니다.',
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      },
      {
        id: 'sample_v2_2_' + Date.now(),
        soonName: '직여3순',
        leaderName: '이영희',
        date: getDateStr(2),
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
        date: getDateStr(4),
        startTime: '19:00',
        endTime: '21:00',
        place: '빛과소금 카페 2층 세미나실',
        attendees: 6,
        prayerTopic: '직장인 순원들의 영적 회복과 가정을 위해',
        createdAt: new Date().toISOString(),
        status: 'confirmed'
      },
      {
        id: 'sample_v2_4_' + Date.now(),
        soonName: '여성7순',
        leaderName: '정다은',
        date: getDateStr(5),
        startTime: '11:00',
        endTime: '13:00',
        place: '정다은 권사님 댁',
        attendees: 4,
        prayerTopic: '부모님 건강 회복 및 영혼 구원',
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
