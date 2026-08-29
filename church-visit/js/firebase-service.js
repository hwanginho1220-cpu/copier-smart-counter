/**
 * Firebase Firestore & LocalStorage 하이브리드 데이터 동기화 서비스
 * 무료 Firebase 프로젝트(Firestore) 연동 시 실시간 동기화 지원
 * 설정이 없거나 오프라인일 때는 자동으로 LocalStorage 기반으로 안전하게 작동
 */

const STORAGE_KEY_FIREBASE_CONFIG = 'church_visit_firebase_config';

class CloudSyncService {
  constructor() {
    this.currentCommunityId = this.detectInitialCommunity();
    this.isCloudEnabled = false;
    this.db = null;
    this.unsubscribe = null;
    this.listeners = [];
    this.visits = [];
    this.init();
  }

  // URL 파라미터(?c=양재 or ?community=seocho)로부터 초기 공동체 감지
  detectInitialCommunity() {
    try {
      const params = new URLSearchParams(window.location.search);
      const c = params.get('c') || params.get('community');
      if (c && window.COMMUNITIES_CONFIG && window.COMMUNITIES_CONFIG[c]) {
        return c;
      }
    } catch (e) {}
    return window.DEFAULT_COMMUNITY_ID || 'woomyeon';
  }

  // 공동체별 Firestore 컬렉션 이름 (우면공동체는 기존 호환 'visits', 타 공동체는 'visits_공동체ID')
  getCollectionName() {
    return this.currentCommunityId === 'woomyeon' ? 'visits' : `visits_${this.currentCommunityId}`;
  }

  // 공동체별 LocalStorage 키
  getStorageKey() {
    return this.currentCommunityId === 'woomyeon' ? 'church_visit_data_v1' : `church_visit_data_${this.currentCommunityId}`;
  }

  // 공동체 변경 (화면 전환 시 호출)
  setCommunity(communityId) {
    if (this.currentCommunityId === communityId) return;
    this.currentCommunityId = communityId;

    if (this.isCloudEnabled && this.db) {
      this.subscribeCloudCollection();
    } else {
      this.loadFromLocalStorage();
    }
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

  // Firebase 초기화 (Firebase Compat SDK 활용)
  initFirebase(config) {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK가 아직 로드되지 않아 로컬 모드로 시작합니다.');
        this.loadFromLocalStorage();
        return false;
      }

      // 이미 초기화된 앱이 있으면 재사용하거나 새로 초기화
      let app;
      if (firebase.apps && firebase.apps.length > 0) {
        app = firebase.apps[0];
      } else {
        app = firebase.initializeApp(config);
      }

      this.db = firebase.firestore();
      this.isCloudEnabled = true;

      this.subscribeCloudCollection();
      console.log(`Firebase Firestore 실시간 동기화 활성화 완료! [공동체: ${this.currentCommunityId}]`);
      return true;
    } catch (error) {
      console.error('Firebase 초기화 실패:', error);
      this.isCloudEnabled = false;
      this.loadFromLocalStorage();
      return false;
    }
  }

  // 실시간 리스너 구독 (onSnapshot)
  subscribeCloudCollection() {
    if (!this.db) return;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    const collName = this.getCollectionName();
    this.unsubscribe = this.db.collection(collName).onSnapshot(
      (snapshot) => {
        const cloudVisits = [];
        snapshot.forEach((doc) => {
          cloudVisits.push({ id: doc.id, ...doc.data() });
        });
        this.visits = cloudVisits;
        // 로컬에도 백업 저장
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
  }

  // 로컬 스토리지 데이터 로드
  loadFromLocalStorage() {
    try {
      const storageKey = this.getStorageKey();
      const dataStr = localStorage.getItem(storageKey);
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
      const storageKey = this.getStorageKey();
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('로컬스토리지 저장 에러:', e);
    }
  }

  // 리스너 등록
  subscribe(callback) {
    this.listeners.push(callback);
    // 즉시 현재 데이터 1회 전달
    callback(this.visits, { isCloud: this.isCloudEnabled });
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  notifyListeners(meta = {}) {
    this.listeners.forEach((cb) => cb(this.visits, { isCloud: this.isCloudEnabled, ...meta }));
  }

  // 신청 데이터 목록 가져오기
  getVisits() {
    return [...this.visits];
  }

  // 심방 신청 추가
  async addVisit(visitData) {
    const newEntry = {
      ...visitData,
      communityId: this.currentCommunityId,
      createdAt: new Date().toISOString(),
      status: 'confirmed'
    };

    if (this.isCloudEnabled && this.db) {
      try {
        const collName = this.getCollectionName();
        const docRef = await this.db.collection(collName).add(newEntry);
        newEntry.id = docRef.id;
        return { success: true, id: docRef.id };
      } catch (error) {
        console.error('클라우드 저장 실패, 로컬로 저장:', error);
      }
    }

    // 로컬 모드 저장
    newEntry.id = 'visit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    this.visits.push(newEntry);
    this.saveToLocalStorage(this.visits);
    this.notifyListeners({ type: 'NEW_VISIT', data: newEntry });
    return { success: true, id: newEntry.id };
  }

  // 심방 신청 수정
  async updateVisit(id, updateData) {
    const updated = {
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    if (this.isCloudEnabled && this.db) {
      try {
        const collName = this.getCollectionName();
        await this.db.collection(collName).doc(id).update(updated);
        return { success: true };
      } catch (error) {
        console.error('클라우드 업데이트 실패:', error);
      }
    }

    // 로컬 모드 수정
    const index = this.visits.findIndex((v) => v.id === id);
    if (index !== -1) {
      this.visits[index] = { ...this.visits[index], ...updated };
      this.saveToLocalStorage(this.visits);
      this.notifyListeners({ type: 'UPDATE_VISIT', data: this.visits[index] });
      return { success: true };
    }
    return { success: false, error: '해당 신청을 찾을 수 없습니다.' };
  }

  // 심방 신청 삭제/취소
  async deleteVisit(id) {
    if (this.isCloudEnabled && this.db) {
      try {
        const collName = this.getCollectionName();
        await this.db.collection(collName).doc(id).delete();
        return { success: true };
      } catch (error) {
        console.error('클라우드 삭제 실패:', error);
      }
    }

    // 로컬 모드 삭제
    this.visits = this.visits.filter((v) => v.id !== id);
    this.saveToLocalStorage(this.visits);
    this.notifyListeners({ type: 'DELETE_VISIT', id });
    return { success: true };
  }

  // 샘플 데이터 생성 (체험/테스트용)
  seedSampleData() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = today.getDate();

    // 다음 주 며칠 뒤 날짜 계산 함수
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
        id: 'sample_1',
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
        id: 'sample_2',
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
        id: 'sample_3',
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
        id: 'sample_4',
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
  }
}

// 전역 인스턴스 노출
window.cloudSync = new CloudSyncService();
