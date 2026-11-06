import os
import re
import sys
import json
import time
import uuid
import shutil
import zipfile
import threading
import subprocess
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import yt_dlp


def resolve_ffmpeg_binary() -> str:
    """Return system ffmpeg path if installed, otherwise fallback to imageio-ffmpeg binary."""
    sys_ffmpeg = shutil.which("ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


FFMPEG_BIN = resolve_ffmpeg_binary()

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_ROOT = BASE_DIR / "downloads"
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

# In-memory job store
JOBS = {}
JOBS_LOCK = threading.Lock()


def sanitize_filename(name: str) -> str:
    """Remove characters invalid in Windows filenames."""
    cleaned = re.sub(r'[\\/:*?"<>|\r\n\t]+', ' ', name).strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned[:120] or "Track"


def seconds_to_hms(sec: float) -> str:
    sec = max(0, int(round(sec)))
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def hms_to_seconds(ts: str) -> float:
    ts = ts.strip()
    parts = [int(p) for p in ts.split(":")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:
        return parts[0] * 60 + parts[1]
    elif len(parts) == 1:
        return float(parts[0])
    return 0.0


TS_TOKEN_RE = re.compile(r'(?<!\d)((?:\d{1,2}:)?\d{1,2}:\d{2})(?!\d)')


def clean_track_title(raw: str, fallback_idx: int) -> str:
    title = raw.strip()
    # 앞뒤 괄호, 구분선, 번호(01., 1), [1] 등) 제거
    title = re.sub(r'^[\s\[\]\(\)\-~—•*:/|]+', '', title).strip()
    title = re.sub(r'^(?:\[\d+\]|\(\d+\)|\d{1,3}[\s.\-):]+)\s*', '', title).strip()
    title = re.sub(r'^[\s\[\]\(\)\-~—•*:/|]+', '', title).strip()
    title = re.sub(r'[\s\[\]\(\)\-~—•*:/|]+$', '', title).strip()
    return title or f"Track {fallback_idx:02d}"


def parse_timestamps_from_text(text: str, total_duration: float = 0.0) -> list:
    """
    Parse lines containing timestamps in any format:
    - 00:00 Intro - Artist
    - 00:00찬양제목 (붙어있는 한글)
    - 01. 00:00 ~ 03:24 Song Title
    - Song Title [03:24]
    - 00:00 곡1 / 03:24 곡2 / 07:10 곡3 (한 줄에 여러 곡)
    """
    if not text:
        return []

    raw_items = []
    for line in text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        # '3분 25초', '03;25' 같은 변형 표기를 표준 '03:25'로 정규화
        line_str = re.sub(r'(\d{1,2})\s*분\s*(\d{1,2})\s*초?', lambda m: f"{int(m.group(1)):02d}:{int(m.group(2)):02d}", line_str)
        line_str = re.sub(r'(?<!\d)(\d{1,2});(\d{2})(?!\d)', r'\1:\2', line_str)

        matches = list(TS_TOKEN_RE.finditer(line_str))
        if not matches:
            continue

        # 케이스 1: 타임스탬프가 2개이고 두 타임스탬프 사이에 '~' 또는 '-' 만 있는 경우 (시작 ~ 종료 시간 표시)
        if len(matches) == 2:
            between = line_str[matches[0].end():matches[1].start()].strip()
            if re.fullmatch(r'[\s~\-—to\[\]\(\)]*', between, re.IGNORECASE):
                start_sec = hms_to_seconds(matches[0].group(1))
                end_sec = hms_to_seconds(matches[1].group(1))
                title_part = (line_str[:matches[0].start()] + " " + line_str[matches[1].end():]).strip()
                title = clean_track_title(title_part, len(raw_items) + 1)
                raw_items.append({
                    "start": start_sec,
                    "end": end_sec if end_sec > start_sec else None,
                    "title": title
                })
                continue

        # 케이스 2: 한 줄에 타임스탬프가 여러 개 나열된 경우 (예: 00:00 곡1 03:20 곡2)
        if len(matches) >= 2:
            for idx_m, m in enumerate(matches):
                start_sec = hms_to_seconds(m.group(1))
                seg_start = m.end()
                seg_end = matches[idx_m + 1].start() if idx_m + 1 < len(matches) else len(line_str)
                seg_title = line_str[seg_start:seg_end].strip()
                if not seg_title and idx_m == 0 and m.start() > 0:
                    seg_title = line_str[:m.start()].strip()
                title = clean_track_title(seg_title, len(raw_items) + 1)
                raw_items.append({
                    "start": start_sec,
                    "end": None,
                    "title": title
                })
            continue

        # 케이스 3: 한 줄에 타임스탬프 1개 (가장 일반적)
        m = matches[0]
        start_sec = hms_to_seconds(m.group(1))
        # 타임스탬프 앞의 트랙 번호(예: "01. 00:00 노래")는 버리고, 만약 제목이 타임스탬프 앞에 있으면 보존
        before_ts = line_str[:m.start()].strip()
        after_ts = line_str[m.end():].strip()
        # 앞부분이 단순 번호("1.", "01)", "[1]")면 뒷부분만 제목으로 사용
        if re.fullmatch(r'[\[\(\s]*\d{1,3}[\]\)\s.\-:•]*', before_ts):
            title_part = after_ts
        elif after_ts:
            title_part = f"{before_ts} {after_ts}".strip()
        else:
            title_part = before_ts

        title = clean_track_title(title_part, len(raw_items) + 1)
        raw_items.append({
            "start": start_sec,
            "end": None,
            "title": title
        })

    if len(raw_items) < 1:
        return []

    # 만약 첫 곡이 00:00(또는 45초 이내)로 시작하지 않고 시간들이 증가하지 않는 경우 (각 곡의 재생 길이만 적어둔 목록인 경우)
    # 자동으로 누적 시작~종료 시간으로 변환!
    if len(raw_items) >= 2 and raw_items[0]["start"] >= 45:
        non_increasing_count = sum(
            1 for i in range(len(raw_items) - 1) if raw_items[i + 1]["start"] <= raw_items[i]["start"]
        )
        if non_increasing_count >= 1:
            cum_sec = 0.0
            tracks = []
            for i, item in enumerate(raw_items):
                dur_s = item["start"]
                st_s = cum_sec
                ed_s = cum_sec + dur_s
                if total_duration > 0 and i == len(raw_items) - 1:
                    ed_s = total_duration
                cum_sec = ed_s
                tracks.append({
                    "index": i + 1,
                    "title": item["title"],
                    "start": st_s,
                    "end": ed_s,
                    "start_str": seconds_to_hms(st_s),
                    "end_str": seconds_to_hms(ed_s),
                    "duration_str": seconds_to_hms(ed_s - st_s)
                })
            return tracks

    # Sort by start time and deduplicate identical start times
    raw_items.sort(key=lambda x: x["start"])
    deduped = []
    for item in raw_items:
        if deduped and abs(deduped[-1]["start"] - item["start"]) < 1.0:
            continue
        deduped.append(item)

    # Fill in end times
    tracks = []
    for i, item in enumerate(deduped):
        start_s = item["start"]
        if item["end"] is not None:
            end_s = item["end"]
        elif i + 1 < len(deduped):
            end_s = deduped[i + 1]["start"]
        elif total_duration and total_duration > start_s:
            end_s = total_duration
        else:
            end_s = 0.0  # Will be resolved to audio duration later

        tracks.append({
            "index": i + 1,
            "title": item["title"],
            "start": start_s,
            "end": end_s,
            "start_str": seconds_to_hms(start_s),
            "end_str": seconds_to_hms(end_s) if end_s > 0 else "끝까지",
            "duration_str": seconds_to_hms(end_s - start_s) if end_s > start_s else "-"
        })

    return tracks


def _run_ffmpeg_silencedetect(audio_path: Path, min_silence_len: float, silence_thresh_db: int, min_track_len: float):
    cmd = [
        FFMPEG_BIN, "-hide_banner", "-nostats",
        "-i", str(audio_path),
        "-af", f"silencedetect=noise={silence_thresh_db}dB:d={min_silence_len}",
        "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    stderr = proc.stderr or ""

    dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", stderr)
    total_duration = 0.0
    if dur_match:
        total_duration = int(dur_match.group(1)) * 3600 + int(dur_match.group(2)) * 60 + float(dur_match.group(3))

    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", stderr)]

    cut_points = [0.0]
    for s, e in zip(starts, ends):
        mid = (s + e) / 2.0
        if mid - cut_points[-1] >= min_track_len:
            cut_points.append(round(mid, 1))

    if total_duration > 0 and (total_duration - cut_points[-1]) >= 10.0:
        cut_points.append(round(total_duration, 1))
    elif total_duration > 0 and len(cut_points) > 1:
        cut_points[-1] = round(total_duration, 1)
    elif total_duration > 0:
        cut_points.append(round(total_duration, 1))

    return cut_points, total_duration


def detect_silence_tracks(audio_path: Path, min_silence_len: float = 1.5, silence_thresh_db: int = -38, min_track_len: float = 30.0) -> list:
    """
    Use ffmpeg silencedetect filter to find silence boundaries between songs.
    Automatically adapts sensitivity if initial parameters only find 1 track on a long audio file.
    """
    attempts = [
        (min_silence_len, silence_thresh_db),
        (min(1.0, min_silence_len), max(-33, silence_thresh_db)),
        (0.7, -29),
        (0.5, -25),
    ]

    cut_points = [0.0]
    for sil_len, db_val in attempts:
        cut_points, total_duration = _run_ffmpeg_silencedetect(audio_path, sil_len, db_val, min_track_len)
        # 2곡 이상으로 나눠졌거나, 전체 길이가 짧은 단일 곡(3분 미만)이면 중단
        if len(cut_points) >= 3 or total_duration < 180:
            break

    tracks = []
    for i in range(len(cut_points) - 1):
        st = cut_points[i]
        ed = cut_points[i + 1]
        tracks.append({
            "index": i + 1,
            "title": f"Track {i + 1:02d}",
            "start": st,
            "end": ed,
            "start_str": seconds_to_hms(st),
            "end_str": seconds_to_hms(ed),
            "duration_str": seconds_to_hms(ed - st)
        })
    return tracks


def update_job(job_id: str, **kwargs):
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(kwargs)


def run_split_job(job_id: str, url: str, tracks: list, mode: str, bitrate: str, silence_opts: dict, start_number: int = 1):
    try:
        job_dir = OUTPUT_ROOT / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # 재생목록(개별 video_url이 있는 트랙들)인지 확인
        is_playlist_job = any(bool(t.get("video_url")) for t in tracks)

        if is_playlist_job:
            safe_album_folder = "YouTube_Playlist_MP3"
            album_dir = job_dir / safe_album_folder
            album_dir.mkdir(parents=True, exist_ok=True)
            results = []
            total_tracks = len(tracks)

            for idx, tr in enumerate(tracks):
                track_num = start_number + idx
                item_url = tr.get("video_url") or url
                raw_title = (tr.get("title") or f"Track {track_num:02d}").strip()
                clean_title = sanitize_filename(raw_title)
                filename = f"{track_num:02d}. {clean_title}.mp3"
                out_path = album_dir / filename

                pct = 10 + int((idx / max(1, total_tracks)) * 84)
                update_job(
                    job_id,
                    status="splitting",
                    progress=pct,
                    message=f"재생목록 [{idx + 1}/{total_tracks}] '{clean_title}' 다운로드 및 MP3 변환 중..."
                )

                temp_tmpl = str(job_dir / f"pl_item_{idx}.%(ext)s")
                ydl_item_opts = {
                    "format": "bestaudio/best",
                    "outtmpl": temp_tmpl,
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                }
                with yt_dlp.YoutubeDL(ydl_item_opts) as ydl:
                    ent_info = ydl.extract_info(item_url, download=True)
                    ent_uploader = ent_info.get("uploader") or "YouTube"
                    ent_dur = float(ent_info.get("duration") or 0.0)

                item_files = list(job_dir.glob(f"pl_item_{idx}.*"))
                if not item_files:
                    continue
                item_source = item_files[0]

                cmd = [
                    FFMPEG_BIN, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(item_source),
                    "-vn", "-acodec", "libmp3lame", "-b:a", f"{bitrate}k",
                    "-metadata", f"title={raw_title}",
                    "-metadata", f"artist={ent_uploader}",
                    "-metadata", f"track={track_num}",
                    str(out_path)
                ]
                subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
                try:
                    item_source.unlink(missing_ok=True)
                except Exception:
                    pass

                if out_path.exists():
                    size_mb = round(out_path.stat().st_size / (1024 * 1024), 2)
                    results.append({
                        "index": track_num,
                        "title": raw_title,
                        "filename": filename,
                        "start_str": "00:00",
                        "end_str": seconds_to_hms(ent_dur) if ent_dur > 0 else "끝",
                        "duration_str": seconds_to_hms(ent_dur) if ent_dur > 0 else "-",
                        "size_mb": size_mb,
                        "url": f"/downloads/{job_id}/{safe_album_folder}/{filename}"
                    })

            update_job(job_id, status="zipping", progress=96, message="전체 곡 ZIP 압축 파일 생성 중...")
            zip_filename = f"{safe_album_folder}_모음.zip"
            zip_path = job_dir / zip_filename
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for item in results:
                    mp3_file = album_dir / item["filename"]
                    if mp3_file.exists():
                        zf.write(mp3_file, arcname=item["filename"])

            update_job(
                job_id,
                status="done",
                progress=100,
                message=f"재생목록 총 {len(results)}곡 MP3 저장이 완료되었습니다!",
                album_title=safe_album_folder,
                folder_path=str(album_dir),
                zip_url=f"/downloads/{job_id}/{zip_filename}",
                zip_filename=zip_filename,
                files=results
            )
            return

        update_job(job_id, status="downloading", progress=8, message="유튜브에서 원본 고음질 오디오 스트림을 다운로드하는 중...")

        raw_audio_template = str(job_dir / "source_audio.%(ext)s")

        def progress_hook(d):
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes") or 0
                if total > 0:
                    pct = int(8 + (downloaded / total) * 35)
                    update_job(
                        job_id,
                        progress=min(43, pct),
                        message=f"원본 오디오 다운로드 중... ({int(downloaded / 1024 / 1024 * 10) / 10}MB / {int(total / 1024 / 1024 * 10) / 10}MB)"
                    )
            elif d.get("status") == "finished":
                update_job(job_id, progress=45, message="원본 오디오 다운로드 완료! 곡 분할 준비 중...")

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": raw_audio_template,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [progress_hook],
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            album_title = sanitize_filename(info.get("title") or "YouTube Album")
            uploader = info.get("uploader") or "YouTube"
            total_duration = float(info.get("duration") or 0.0)

        # Find the downloaded source file
        source_files = list(job_dir.glob("source_audio.*"))
        if not source_files:
            raise RuntimeError("오디오 원본 파일을 찾을 수 없습니다.")
        source_file = source_files[0]

        # If mode is silence detection, no tracks were provided, or only 1 full-video track was passed on a long video (unless user explicitly requested single mode)
        is_unsplit_long_video = (
            mode != "single"
            and len(tracks) == 1
            and total_duration >= 240.0
            and float(tracks[0].get("start") or 0.0) == 0.0
        )
        if mode == "silence" or not tracks or is_unsplit_long_video:
            update_job(job_id, status="analyzing_silence", progress=50, message="FFmpeg로 무음(곡 간격) 구간을 정밀 탐색하여 곡을 나누는 중...")
            min_silence = float(silence_opts.get("min_silence_len", 1.5))
            thresh_db = int(silence_opts.get("silence_thresh_db", -38))
            min_track = float(silence_opts.get("min_track_len", 30.0))
            tracks = detect_silence_tracks(source_file, min_silence, thresh_db, min_track)
            if not tracks:
                tracks = [{
                    "index": 1,
                    "title": album_title,
                    "start": 0.0,
                    "end": total_duration
                }]

        # Create clean output folder inside downloads
        safe_album_folder = sanitize_filename(album_title)[:60]
        album_dir = job_dir / safe_album_folder
        album_dir.mkdir(parents=True, exist_ok=True)

        results = []
        total_tracks = len(tracks)

        for idx, tr in enumerate(tracks):
            track_num = start_number + idx
            raw_title = (tr.get("title") or "").strip()
            # 기본 자동생성 제목(Track 01 등)인 경우 지정된 시작 번호에 맞춰 갱신
            if not raw_title or re.match(r"^Track\s+\d+$", raw_title, re.IGNORECASE):
                raw_title = f"Track {track_num:02d}"
            clean_title = sanitize_filename(raw_title)
            filename = f"{track_num:02d}. {clean_title}.mp3"
            out_path = album_dir / filename

            start_sec = float(tr.get("start") or 0.0)
            end_sec = float(tr.get("end") or 0.0)
            if end_sec <= 0 and total_duration > start_sec:
                end_sec = total_duration

            pct = 52 + int((idx / max(1, total_tracks)) * 42)
            update_job(
                job_id,
                status="splitting",
                progress=pct,
                message=f"[{track_num}/{total_tracks}] '{clean_title}' MP3 변환 및 분할 중..."
            )

            cmd = [FFMPEG_BIN, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start_sec:.2f}"]
            if end_sec > start_sec:
                cmd += ["-to", f"{end_sec:.2f}"]
            cmd += [
                "-i", str(source_file),
                "-vn",
                "-acodec", "libmp3lame",
                "-b:a", f"{bitrate}k",
                "-metadata", f"title={raw_title}",
                "-metadata", f"album={album_title}",
                "-metadata", f"artist={uploader}",
                "-metadata", f"track={track_num}/{total_tracks}",
                str(out_path)
            ]

            proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if proc.returncode != 0:
                raise RuntimeError(f"FFmpeg 변환 오류 ({clean_title}): {proc.stderr[:200]}")

            size_mb = round(out_path.stat().st_size / (1024 * 1024), 2)
            dur_sec = max(0.0, end_sec - start_sec) if end_sec > start_sec else 0.0
            rel_url = f"/downloads/{job_id}/{safe_album_folder}/{filename}"

            results.append({
                "index": track_num,
                "title": raw_title,
                "filename": filename,
                "start_str": seconds_to_hms(start_sec),
                "end_str": seconds_to_hms(end_sec) if end_sec > 0 else "끝",
                "duration_str": seconds_to_hms(dur_sec) if dur_sec > 0 else "-",
                "size_mb": size_mb,
                "url": rel_url
            })

        # Create ZIP archive of all MP3s
        update_job(job_id, status="zipping", progress=96, message="전체 곡 ZIP 압축 파일 생성 중...")
        zip_filename = f"{safe_album_folder}_MP3_모음.zip"
        zip_path = job_dir / zip_filename
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in results:
                mp3_file = album_dir / item["filename"]
                if mp3_file.exists():
                    zf.write(mp3_file, arcname=item["filename"])

        # Remove raw source audio to save disk space
        try:
            source_file.unlink(missing_ok=True)
        except Exception:
            pass

        update_job(
            job_id,
            status="done",
            progress=100,
            message=f"총 {len(results)}곡 MP3 분할 저장이 완료되었습니다!",
            album_title=album_title,
            folder_path=str(album_dir),
            zip_url=f"/downloads/{job_id}/{zip_filename}",
            zip_filename=zip_filename,
            files=results
        )

    except Exception as e:
        update_job(
            job_id,
            status="error",
            progress=0,
            message=f"오류가 발생했습니다: {str(e)}"
        )


class SplitterRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, format, *args):
        # Quiet standard logs
        pass

    def _send_json(self, data: dict, status_code: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/job-status":
            qs = parse_qs(parsed.query)
            job_id = (qs.get("job_id") or [""])[0]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            if not job:
                return self._send_json({"error": "Job not found"}, 404)
            return self._send_json(job)

        # Serve static or downloaded MP3 files with proper UTF-8 path decoding
        self.path = unquote(self.path)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/analyze":
            try:
                body = self._read_json_body()
                url = (body.get("url") or "").strip()
                if not url:
                    return self._send_json({"error": "유튜브 주소를 입력해 주세요."}, 400)

                ydl_opts = {
                    "quiet": True,
                    "no_warnings": True,
                    "noplaylist": True,
                    "extract_flat": False,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)

                title = info.get("title") or "YouTube Audio"
                duration = float(info.get("duration") or 0.0)
                thumbnail = info.get("thumbnail") or ""
                uploader = info.get("uploader") or ""
                description = info.get("description") or ""
                chapters = info.get("chapters") or []

                detected_source = "none"
                tracks = []

                if chapters:
                    detected_source = "chapters"
                    for idx, ch in enumerate(chapters):
                        st = float(ch.get("start_time") or 0.0)
                        ed = float(ch.get("end_time") or 0.0)
                        raw_ch_title = (ch.get("title") or "").strip()
                        ch_title = re.sub(r"^\d{1,3}[\s.\-):]+\s*", "", raw_ch_title).strip() or raw_ch_title or f"Track {idx + 1:02d}"
                        tracks.append({
                            "index": idx + 1,
                            "title": ch_title,
                            "start": st,
                            "end": ed,
                            "start_str": seconds_to_hms(st),
                            "end_str": seconds_to_hms(ed),
                            "duration_str": seconds_to_hms(ed - st)
                        })
                else:
                    desc_tracks = parse_timestamps_from_text(description, duration)
                    if len(desc_tracks) >= 2:
                        detected_source = "description"
                        tracks = desc_tracks
                    else:
                        # 챕터와 설명란에 타임라인이 없으면 고정 댓글 / 인기 댓글 상위 20개를 자동 스캔!
                        try:
                            comment_opts = {
                                "quiet": True,
                                "no_warnings": True,
                                "noplaylist": True,
                                "skip_download": True,
                                "getcomments": True,
                                "extractor_args": {
                                    "youtube": {
                                        "max_comments": ["50", "50", "0", "0"],
                                        "comment_sort": ["top"]
                                    }
                                }
                            }
                            with yt_dlp.YoutubeDL(comment_opts) as ydl_c:
                                info_c = ydl_c.extract_info(url, download=False)
                            comments = info_c.get("comments") or []
                            best_comment_tracks = []
                            for c in comments:
                                c_text = c.get("text") or ""
                                c_tracks = parse_timestamps_from_text(c_text, duration)
                                if len(c_tracks) >= 2 and len(c_tracks) > len(best_comment_tracks):
                                    best_comment_tracks = c_tracks
                            if len(best_comment_tracks) >= 2:
                                detected_source = "comments"
                                tracks = best_comment_tracks
                        except Exception:
                            pass

                # 만약 단일 영상에서 타임라인을 못 찾았는데 주소에 list= (재생목록)가 포함되어 있는 경우 재생목록 전체 곡 불러오기
                if not tracks and "list=" in url:
                    try:
                        pl_opts = {
                            "quiet": True,
                            "no_warnings": True,
                            "noplaylist": False,
                            "extract_flat": "in_playlist",
                            "playlistend": 80,
                        }
                        with yt_dlp.YoutubeDL(pl_opts) as ydl_pl:
                            pl_info = ydl_pl.extract_info(url, download=False)
                        entries = pl_info.get("entries") or []
                        if len(entries) >= 2:
                            detected_source = "playlist"
                            title = pl_info.get("title") or title
                            for idx_e, ent in enumerate(entries):
                                if not ent:
                                    continue
                                ent_id = ent.get("id") or ""
                                ent_url = ent.get("url") or (f"https://www.youtube.com/watch?v={ent_id}" if ent_id else "")
                                ent_title = (ent.get("title") or f"Track {idx_e + 1:02d}").strip()
                                ent_dur = float(ent.get("duration") or 0.0)
                                tracks.append({
                                    "index": idx_e + 1,
                                    "title": ent_title,
                                    "start": 0.0,
                                    "end": ent_dur,
                                    "start_str": "재생목록",
                                    "end_str": seconds_to_hms(ent_dur) if ent_dur > 0 else "전체",
                                    "duration_str": seconds_to_hms(ent_dur) if ent_dur > 0 else "-",
                                    "video_url": ent_url
                                })
                    except Exception:
                        pass

                return self._send_json({
                    "title": title,
                    "uploader": uploader,
                    "duration": duration,
                    "duration_str": seconds_to_hms(duration),
                    "thumbnail": thumbnail,
                    "description": description,
                    "detected_source": detected_source,
                    "tracks": tracks
                })
            except Exception as e:
                return self._send_json({"error": f"영상 정보를 가져오지 못했습니다: {str(e)}"}, 500)

        elif parsed.path == "/api/parse-timestamps":
            try:
                body = self._read_json_body()
                text = body.get("text") or ""
                duration = float(body.get("duration") or 0.0)
                tracks = parse_timestamps_from_text(text, duration)
                return self._send_json({"tracks": tracks})
            except Exception as e:
                return self._send_json({"error": str(e)}, 500)

        elif parsed.path == "/api/start-job":
            try:
                body = self._read_json_body()
                url = (body.get("url") or "").strip()
                if not url:
                    return self._send_json({"error": "유튜브 주소가 필요합니다."}, 400)

                tracks = body.get("tracks") or []
                mode = body.get("mode") or "timeline"
                bitrate = str(body.get("bitrate") or "192")
                silence_opts = body.get("silence_opts") or {}
                try:
                    start_number = int(body.get("start_number", 1))
                except (ValueError, TypeError):
                    start_number = 1
                if start_number < 0:
                    start_number = 0

                # Convert any start_str / end_str edits into numeric seconds
                normalized_tracks = []
                for idx, tr in enumerate(tracks):
                    raw_st = str(tr.get("start_str", "00:00")).strip()
                    if re.match(r"^(?:\d+:)?\d+:\d+$", raw_st):
                        st = hms_to_seconds(raw_st)
                    else:
                        st = float(tr.get("start") or 0.0)

                    end_str = str(tr.get("end_str", "")).strip()
                    if re.match(r"^(?:\d+:)?\d+:\d+$", end_str):
                        ed = hms_to_seconds(end_str)
                    else:
                        ed = float(tr.get("end") or 0.0)

                    track_no = start_number + idx
                    normalized_tracks.append({
                        "index": track_no,
                        "title": (tr.get("title") or f"Track {track_no:02d}").strip(),
                        "start": st,
                        "end": ed,
                        "video_url": (tr.get("video_url") or "").strip()
                    })

                job_id = time.strftime("%Y%m%d_%H%M%S_") + uuid.uuid4().hex[:6]
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "job_id": job_id,
                        "status": "queued",
                        "progress": 2,
                        "message": "작업을 시작하는 중...",
                        "files": []
                    }

                t = threading.Thread(
                    target=run_split_job,
                    args=(job_id, url, normalized_tracks, mode, bitrate, silence_opts, start_number),
                    daemon=True
                )
                t.start()

                return self._send_json({"job_id": job_id})
            except Exception as e:
                return self._send_json({"error": str(e)}, 500)

        elif parsed.path == "/api/open-folder":
            try:
                body = self._read_json_body()
                folder_path = body.get("folder_path") or str(OUTPUT_ROOT)
                target = Path(folder_path).resolve()
                if not target.exists():
                    target = OUTPUT_ROOT
                if sys.platform.startswith("win"):
                    os.startfile(str(target))
                return self._send_json({"ok": True, "opened": str(target)})
            except Exception as e:
                return self._send_json({"error": str(e)}, 500)

        return self._send_json({"error": "Not found"}, 404)


def free_port_on_windows(port: int):
    if not sys.platform.startswith("win"):
        return
    try:
        my_pid = os.getpid()
        out = subprocess.check_output(["netstat", "-aon"], text=True, encoding="utf-8", errors="ignore")
        for line in out.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    pid = int(parts[-1])
                    if pid != my_pid and pid > 0:
                        subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
                        time.sleep(0.4)
    except Exception:
        pass


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    port = int(os.environ.get("PORT", "8765"))
    free_port_on_windows(port)
    server = ThreadingHTTPServer(("127.0.0.1", port), SplitterRequestHandler)
    print("============================================================")
    print(" [YouTube MP3 Splitter Studio] Server Started!")
    print(f" -> URL: http://127.0.0.1:{port}")
    print(f" -> FFmpeg: {FFMPEG_BIN}")
    print(f" -> Output Dir: {OUTPUT_ROOT}")
    print("============================================================")
    if "--open-browser" in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
