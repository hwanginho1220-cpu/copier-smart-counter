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


TIMESTAMP_LINE_RE = re.compile(
    r'(?:^|[\s\[\(\-•*])((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[\]\)\s\-~—:]+|$)'
)


def parse_timestamps_from_text(text: str, total_duration: float = 0.0) -> list:
    """
    Parse lines containing timestamps like:
    00:00 Intro - Artist
    [03:24] 2. Song Title
    Song Title 06:45
    """
    if not text:
        return []

    raw_items = []
    for line in text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        # Find all timestamps on this line
        matches = list(re.finditer(r'\b((?:\d{1,2}:)?\d{1,2}:\d{2})\b', line_str))
        if not matches:
            continue

        start_ts = matches[0].group(1)
        start_sec = hms_to_seconds(start_ts)

        # Check if line has start ~ end timestamp
        end_sec = None
        if len(matches) >= 2:
            possible_end = hms_to_seconds(matches[1].group(1))
            if possible_end > start_sec:
                end_sec = possible_end

        # Clean title by removing the matched timestamp(s) and surrounding brackets/separators
        title = line_str
        for m in matches[:2]:
            title = title.replace(m.group(0), " ")
        title = re.sub(r'^[\s\[\]\(\)\-~—•*:.\d]+', '', title).strip()
        title = re.sub(r'[\s\[\]\(\)\-~—•*:]+$', '', title).strip()
        if not title:
            title = f"Track {len(raw_items) + 1}"

        raw_items.append({
            "start": start_sec,
            "end": end_sec,
            "title": title
        })

    if len(raw_items) < 1:
        return []

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


def detect_silence_tracks(audio_path: Path, min_silence_len: float = 1.5, silence_thresh_db: int = -38, min_track_len: float = 30.0) -> list:
    """
    Use ffmpeg silencedetect filter to find silence boundaries between songs.
    """
    cmd = [
        FFMPEG_BIN, "-hide_banner", "-nostats",
        "-i", str(audio_path),
        "-af", f"silencedetect=noise={silence_thresh_db}dB:d={min_silence_len}",
        "-f", "null", "-"
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    stderr = proc.stderr or ""

    # Get total duration
    dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", stderr)
    total_duration = 0.0
    if dur_match:
        total_duration = int(dur_match.group(1)) * 3600 + int(dur_match.group(2)) * 60 + float(dur_match.group(3))

    # Parse silence_start and silence_end
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


def run_split_job(job_id: str, url: str, tracks: list, mode: str, bitrate: str, silence_opts: dict):
    try:
        job_dir = OUTPUT_ROOT / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

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

        # If mode is silence detection or no tracks were provided, run silence detection
        if mode == "silence" or not tracks:
            update_job(job_id, status="analyzing_silence", progress=50, message="FFmpeg로 무음(곡 간격) 구간을 정밀 탐색하는 중...")
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
            track_num = idx + 1
            raw_title = tr.get("title") or f"Track {track_num:02d}"
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
                        ch_title = (ch.get("title") or f"Track {idx + 1}").strip()
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

                # Convert any start_str / end_str edits into numeric seconds
                normalized_tracks = []
                for idx, tr in enumerate(tracks):
                    st = hms_to_seconds(str(tr.get("start_str", "00:00"))) if "start_str" in tr else float(tr.get("start", 0))
                    end_str = str(tr.get("end_str", "")).strip()
                    if end_str and end_str not in ("끝까지", "끝", "-"):
                        ed = hms_to_seconds(end_str)
                    else:
                        ed = float(tr.get("end", 0))
                    normalized_tracks.append({
                        "index": idx + 1,
                        "title": (tr.get("title") or f"Track {idx + 1:02d}").strip(),
                        "start": st,
                        "end": ed
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
                    args=(job_id, url, normalized_tracks, mode, bitrate, silence_opts),
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


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    port = int(os.environ.get("PORT", "8765"))
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
