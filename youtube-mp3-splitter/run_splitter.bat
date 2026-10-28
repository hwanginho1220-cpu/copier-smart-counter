@echo off
chcp 65001 > nul
cd /d "%~dp0"
title YouTube MP3 Track Splitter Studio

echo ============================================================
echo  [YouTube MP3 Track Splitter] 실행 환경을 점검합니다...
echo ============================================================

set "PY_EXE="

if exist "..\.venv\Scripts\python.exe" (
    set "PY_EXE=..\.venv\Scripts\python.exe"
) else if exist ".venv\Scripts\python.exe" (
    set "PY_EXE=.venv\Scripts\python.exe"
) else (
    echo [1/2] 처음 실행하시는군요! 전용 가상환경(.venv)을 자동 생성합니다...
    python -m venv .venv
    if exist ".venv\Scripts\python.exe" (
        set "PY_EXE=.venv\Scripts\python.exe"
    ) else (
        set "PY_EXE=python"
    )
)

echo [2/2] 필수 패키지(yt-dlp, 내장 FFmpeg) 확인 및 최신 업데이트 중...
"%PY_EXE%" -m pip install --quiet --upgrade yt-dlp imageio-ffmpeg

echo.
echo ============================================================
echo  준비 완료! 브라우저가 자동으로 열립니다 (http://127.0.0.1:8765)
echo  종료하려면 이 창을 닫거나 Ctrl+C를 누르세요.
echo ============================================================
"%PY_EXE%" server.py --open-browser
pause
