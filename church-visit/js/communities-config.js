/**
 * 공동체 및 목사님별 순 구성 설정 파일
 * 
 * 새로운 공동체나 목사님이 추가될 때 아래에 객체를 하나씩 추가하시면
 * 별도 개발 없이 자동으로 전용 신청 페이지, 전용 캘린더, 전용 데이터베이스가 생성됩니다!
 */

window.COMMUNITIES_CONFIG = {
  // 1. 우면공동체 (강현구 목사님)
  woomyeon: {
    id: "woomyeon",
    communityName: "우면공동체",
    pastorName: "강현구 목사님",
    subTitle: "말씀과 기도로 하나되는 은혜의 심방",
    // 순 그룹 구성 (여성 11, 직여 12, 남성 8)
    groups: [
      {
        category: "여성순",
        items: Array.from({ length: 11 }, (_, i) => `여성${i + 1}순`)
      },
      {
        category: "직여순 (직장여성)",
        items: Array.from({ length: 12 }, (_, i) => `직여${i + 1}순`)
      },
      {
        category: "남성순",
        items: Array.from({ length: 8 }, (_, i) => `남성${i + 1}순`)
      }
    ]
  },

  // 2. 예시: 양재공동체 (김진우 목사님) - 필요에 따라 수정하거나 추가 가능
  yangjae: {
    id: "yangjae",
    communityName: "양재공동체",
    pastorName: "김진우 목사님",
    subTitle: "가정마다 임하는 주님의 평안과 회복의 심방",
    groups: [
      {
        category: "1교구",
        items: Array.from({ length: 10 }, (_, i) => `1교구 ${i + 1}순`)
      },
      {
        category: "2교구",
        items: Array.from({ length: 10 }, (_, i) => `2교구 ${i + 1}순`)
      }
    ]
  },

  // 3. 예시: 서초공동체 (박은혜 목사님) - 필요에 따라 수정하거나 추가 가능
  seocho: {
    id: "seocho",
    communityName: "서초공동체",
    pastorName: "박은혜 목사님",
    subTitle: "믿음 안에서 하나되는 은혜로운 순심방",
    groups: [
      {
        category: "여성순",
        items: Array.from({ length: 12 }, (_, i) => `여성${i + 1}순`)
      },
      {
        category: "남성순",
        items: Array.from({ length: 10 }, (_, i) => `남성${i + 1}순`)
      }
    ]
  }
};

// 기본 활성화 공동체 ID
window.DEFAULT_COMMUNITY_ID = "woomyeon";
