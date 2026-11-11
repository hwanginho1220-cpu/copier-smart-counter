@echo off
chcp 65001 > nul
echo ========================================================
echo [스마트 부품 구매이력 매니저] 로컬 서버를 시작합니다...
echo 브라우저가 열리면 바로 사용하실 수 있습니다. (주소: http://localhost:8090)
echo ========================================================
start "" "http://localhost:8090/index.html"
python -m http.server 8090
