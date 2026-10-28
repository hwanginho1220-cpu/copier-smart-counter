# 🎧 YouTube MP3 Track Splitter Studio

긴 유튜브 음악/플레이리스트/모음곡 영상을 **곡별로 자동 분할하여 개별 MP3 파일 및 ZIP 압축본**으로 저장하는 프로그램입니다.

---

## 🏠 집 PC에서 10초 만에 실행하는 방법

> **별도로 FFmpeg를 설치할 필요가 없습니다!**  
> `run_splitter.bat`을 더블클릭하면 파이썬 패키지(`yt-dlp`)와 내장 `FFmpeg`(`imageio-ffmpeg`)까지 자동으로 설치된 후 웹 브라우저가 열립니다.

### 방법 A: GitHub에서 ZIP으로 다운받아 실행 (가장 간단)
1. GitHub 저장소 페이지 **[https://github.com/hwanginho1220-cpu/copier-smart-counter](https://github.com/hwanginho1220-cpu/copier-smart-counter)** 에 접속합니다.
2. 초록색 **`<> Code`** 버튼 → **`Download ZIP`**을 눌러 압축을 풉니다.
3. **`youtube-mp3-splitter`** 폴더 안의 **`run_splitter.bat`** 파일을 **더블클릭**합니다.
4. 자동으로 필요한 도구가 설치되고 `http://127.0.0.1:8765` 화면이 열립니다!

### 방법 B: Git 명령어로 받아서 실행
```powershell
git clone https://github.com/hwanginho1220-cpu/copier-smart-counter.git
cd copier-smart-counter\youtube-mp3-splitter
.\run_splitter.bat
```

---

## ✨ 주요 기능
1. **공식 챕터 & 영상 설명란 타임라인 자동 감지**: 유튜브 주소만 넣으면 곡 목록과 시작/종료 시간을 자동으로 불러옵니다.
2. **댓글 타임라인 붙여넣기**: 고정 댓글에 적힌 타임라인(`00:00 노래제목`)을 복사해 붙여넣으면 자동으로 트랙을 나눕니다.
3. **무음 구간 자동 감지**: 타임라인이 아예 없는 영상도 곡 사이의 조용한 정적 구간을 분석해 자동으로 한 곡씩 잘라줍니다.
4. **고음질 MP3 & ID3 태그 & ZIP 다운로드**: 320/192/128kbps 지원, 브라우저 미리듣기 및 원클릭 폴더 열기 지원.
