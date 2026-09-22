# 프로젝트 개발 및 브라우저 스크립트 안정성 규칙

## 1. 일반 브라우저 스크립트 스코프 충돌 방지
- 번들러가 없는 다중 `<script>` 환경에서는 파일 간 최상위 `const`, `let` 식별자가 충돌할 경우 치명적인 `SyntaxError`로 전체 앱이 중단됩니다.
- 공통 상수나 유틸리티는 각 파일에서 중복 `const`로 재선언하지 말고, 전역 네임스페이스(`window.APP_CONFIG` 등)에 안전하게 할당하거나 파일별 고유 접두사를 사용해야 합니다.

## 2. UI 기본 조작성(탭, 드롭다운) 우선 보호 원칙
- 탭 네비게이션, 모달 닫기, 기본 드롭다운 옵션 채우기 등 사용자의 기본 조작과 직결되는 이벤트 등록은 `DOMContentLoaded` 최상단에 우선 배치해야 합니다.
- 외부 API 연동, 클라우드 동기화, 복잡한 비즈니스 로직에서 에러가 발생하더라도 사용자의 기본 메뉴 이동 및 폼 조작이 중단되지 않도록 `try-catch` 또는 독립 함수로 안전하게 격리합니다.

## 3. DOM 구조 무결성 규칙
- `<select>` 내에서 `<optgroup>`을 구성할 때는 반드시 생성된 `<option>` 노드를 소속 `optGroup.appendChild(opt)`로 묶은 뒤, 해당 `optGroup`을 `select.appendChild(optGroup)`에 추가해야 합니다.
- 중복 검사 등 유효성 검증 함수에서 `existing` 객체가 `null`일 수 있는 분기(예: 제외된 항목)는 `.id` 등의 프로퍼티에 접근하기 전 반드시 널 가드(`soonCheck.existing ? soonCheck.existing.id : ''`)를 적용합니다.

## 4. 배포 전 브라우저 런타임 자동 검증 (Windows 환경)
- Node.js가 설치되어 있지 않은 환경이더라도, 로컬 파이썬 서버와 시스템 기본 내장 헤드리스 엣지 브라우저(`msedge --headless=new --dump-dom --enable-logging=stderr`)를 활용하여 실제 콘솔 에러(SyntaxError, TypeError) 발생 여부를 배포 전에 자동 검증한 뒤 커밋/푸시합니다.
