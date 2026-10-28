(function () {
  "use strict";

  window.YT_SPLITTER_APP = window.YT_SPLITTER_APP || {
    state: {
      videoUrl: "",
      videoTitle: "",
      videoDuration: 0,
      activeMode: "timeline", // 'timeline' | 'silence'
      tracks: [],
      currentJobId: null,
      pollTimer: null,
      lastFolderPath: ""
    }
  };

  var appState = window.YT_SPLITTER_APP.state;

  // =========================================================================
  // 1. UI 초기화 및 기본 조작 보호 (탭, 드롭다운) - DOMContentLoaded 최상단
  // =========================================================================
  function initBitrateDropdown() {
    var select = document.getElementById("bitrate-select");
    if (!select) return;
    select.innerHTML = "";

    var optGroupHigh = document.createElement("optgroup");
    optGroupHigh.label = "고음질 MP3 (추천)";

    var opt320 = document.createElement("option");
    opt320.value = "320";
    opt320.textContent = "🎵 320 kbps (최고 음질)";
    optGroupHigh.appendChild(opt320);

    var opt192 = document.createElement("option");
    opt192.value = "192";
    opt192.textContent = "🎧 192 kbps (표준 고음질)";
    opt192.selected = true;
    optGroupHigh.appendChild(opt192);

    select.appendChild(optGroupHigh);

    var optGroupLight = document.createElement("optgroup");
    optGroupLight.label = "가벼운 용량";

    var opt128 = document.createElement("option");
    opt128.value = "128";
    opt128.textContent = "⚡ 128 kbps (빠른 변환/저용량)";
    optGroupLight.appendChild(opt128);

    select.appendChild(optGroupLight);
  }

  function switchTab(targetTabId) {
    var tabButtons = document.querySelectorAll(".tab-btn");
    var tabPanels = document.querySelectorAll(".tab-panel");

    tabButtons.forEach(function (btn) {
      if (btn.getAttribute("data-tab") === targetTabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    tabPanels.forEach(function (panel) {
      if (panel.id === targetTabId) {
        panel.classList.add("active");
      } else {
        panel.classList.remove("active");
      }
    });

    if (targetTabId === "tab-silence") {
      appState.activeMode = "silence";
    } else {
      appState.activeMode = "timeline";
    }
    updateStartButtonText();
  }

  function updateStartButtonText() {
    var btn = document.getElementById("btn-start-split");
    if (!btn) return;
    if (appState.activeMode === "silence") {
      btn.textContent = "🤖 무음 구간 자동 감지하여 곡별 MP3 분할 시작하기";
    } else {
      var selectedCount = appState.tracks.filter(function (t) {
        return t && t.checked !== false;
      }).length;
      if (selectedCount > 0) {
        btn.textContent = "🚀 선택한 " + selectedCount + "곡 MP3로 분할 추출 시작하기";
      } else {
        btn.textContent = "🚀 MP3 추출 시작하기";
      }
    }
  }

  function showStatus(msg, isError) {
    var banner = document.getElementById("analyze-status");
    if (!banner) return;
    if (!msg) {
      banner.classList.add("hidden");
      return;
    }
    banner.textContent = msg;
    banner.classList.remove("hidden");
    if (isError) {
      banner.classList.add("error");
    } else {
      banner.classList.remove("error");
    }
  }

  // =========================================================================
  // 2. 트랙 리스트 렌더링 및 조작
  // =========================================================================
  function renderTracksTable() {
    var tbody = document.getElementById("track-tbody");
    var countLabel = document.getElementById("track-count-label");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!appState.tracks || appState.tracks.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      emptyRow.innerHTML =
        '<td colspan="7">등록된 곡 구간이 없습니다. <strong>[영상 & 곡 목록 불러오기]</strong>를 누르거나 <strong>[댓글 타임라인 붙여넣기]</strong> 또는 <strong>[무음 구간 자동 감지]</strong> 탭을 선택하세요.</td>';
      tbody.appendChild(emptyRow);
      if (countLabel) countLabel.textContent = "0";
      updateStartButtonText();
      return;
    }

    var selectedCount = 0;

    appState.tracks.forEach(function (track, idx) {
      if (!track) return;
      if (typeof track.checked === "undefined") {
        track.checked = true;
      }
      if (track.checked) selectedCount++;

      var tr = document.createElement("tr");

      // 선택 체크박스
      var tdCheck = document.createElement("td");
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!track.checked;
      chk.addEventListener("change", function () {
        track.checked = chk.checked;
        renderTracksTable();
      });
      tdCheck.appendChild(chk);
      tr.appendChild(tdCheck);

      // 번호
      var tdNum = document.createElement("td");
      tdNum.textContent = String(idx + 1).padStart(2, "0");
      tr.appendChild(tdNum);

      // 제목 입력
      var tdTitle = document.createElement("td");
      var inputTitle = document.createElement("input");
      inputTitle.type = "text";
      inputTitle.className = "table-input";
      inputTitle.value = track.title || "Track " + (idx + 1);
      inputTitle.addEventListener("input", function () {
        track.title = inputTitle.value;
      });
      tdTitle.appendChild(inputTitle);
      tr.appendChild(tdTitle);

      // 시작 시간
      var tdStart = document.createElement("td");
      var inputStart = document.createElement("input");
      inputStart.type = "text";
      inputStart.className = "table-input";
      inputStart.value = track.start_str || "00:00";
      inputStart.addEventListener("input", function () {
        track.start_str = inputStart.value;
      });
      tdStart.appendChild(inputStart);
      tr.appendChild(tdStart);

      // 종료 시간
      var tdEnd = document.createElement("td");
      var inputEnd = document.createElement("input");
      inputEnd.type = "text";
      inputEnd.className = "table-input";
      inputEnd.value = track.end_str || "끝까지";
      inputEnd.addEventListener("input", function () {
        track.end_str = inputEnd.value;
      });
      tdEnd.appendChild(inputEnd);
      tr.appendChild(tdEnd);

      // 길이
      var tdDur = document.createElement("td");
      tdDur.textContent = track.duration_str || "-";
      tr.appendChild(tdDur);

      // 삭제 버튼
      var tdDel = document.createElement("td");
      var btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-danger-icon";
      btnDel.textContent = "✕";
      btnDel.title = "이 곡 제외";
      btnDel.addEventListener("click", function () {
        appState.tracks.splice(idx, 1);
        renderTracksTable();
      });
      tdDel.appendChild(btnDel);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    });

    if (countLabel) {
      countLabel.textContent = String(selectedCount);
    }
    updateStartButtonText();
  }

  // =========================================================================
  // 3. 서버 API 연동 함수 (안전하게 try-catch 격리)
  // =========================================================================
  async function handleAnalyzeVideo() {
    var urlInput = document.getElementById("yt-url-input");
    var btnAnalyze = document.getElementById("btn-analyze");
    if (!urlInput) return;

    var url = urlInput.value.trim();
    if (!url) {
      showStatus("유튜브 영상 주소를 먼저 입력해 주세요!", true);
      urlInput.focus();
      return;
    }

    appState.videoUrl = url;
    if (btnAnalyze) btnAnalyze.disabled = true;
    showStatus("⏳ 유튜브 영상 정보와 챕터/타임라인을 분석하고 있습니다...", false);

    try {
      var res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });
      var data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "영상 분석 실패");
      }

      appState.videoTitle = data.title || "YouTube Audio";
      appState.videoDuration = data.duration || 0;

      // 영상 프리뷰 카드 업데이트
      var infoCard = document.getElementById("video-info-card");
      var thumbEl = document.getElementById("video-thumb");
      var titleEl = document.getElementById("video-title");
      var uploaderEl = document.getElementById("video-uploader");
      var badgeSource = document.getElementById("badge-source");
      var badgeDuration = document.getElementById("badge-duration");

      if (infoCard) infoCard.classList.remove("hidden");
      if (thumbEl) thumbEl.src = data.thumbnail || "";
      if (titleEl) titleEl.textContent = data.title || "";
      if (uploaderEl) uploaderEl.textContent = data.uploader || "";
      if (badgeDuration) badgeDuration.textContent = "전체 길이 " + (data.duration_str || "00:00");

      if (data.tracks && data.tracks.length > 0) {
        appState.tracks = data.tracks.map(function (t) {
          t.checked = true;
          return t;
        });
        if (badgeSource) {
          badgeSource.textContent =
            data.detected_source === "chapters"
              ? "✅ 공식 챕터 " + data.tracks.length + "곡 자동 감지됨"
              : "✅ 영상 설명란 타임라인 " + data.tracks.length + "곡 자동 감지됨";
        }
        showStatus("✨ 총 " + data.tracks.length + "곡의 구간을 자동으로 찾았습니다! 아래에서 제목이나 구간을 확인 후 추출을 시작하세요.", false);
        switchTab("tab-timeline");
        renderTracksTable();
      } else {
        // 챕터/설명란 타임라인이 없는 경우 기본 1곡 세팅 및 안내
        appState.tracks = [
          {
            index: 1,
            title: data.title || "Track 01",
            start: 0,
            end: data.duration || 0,
            start_str: "00:00",
            end_str: data.duration_str || "끝까지",
            duration_str: data.duration_str || "-",
            checked: true
          }
        ];
        if (badgeSource) {
          badgeSource.textContent = "ℹ️ 영상 내 챕터 없음 (댓글 붙여넣기 또는 무음 감지 가능)";
        }
        showStatus(
          "💡 영상 설명란에 타임라인이 없습니다. 유튜브 고정 댓글의 타임라인을 [댓글 타임라인 붙여넣기] 탭에 붙여넣거나, [무음 구간 자동 감지] 탭으로 자동 분할할 수 있습니다!",
          false
        );
        renderTracksTable();
      }
    } catch (err) {
      showStatus("❌ 오류: " + (err && err.message ? err.message : String(err)), true);
    } finally {
      if (btnAnalyze) btnAnalyze.disabled = false;
    }
  }

  async function handleParsePastedTimeline() {
    var textarea = document.getElementById("paste-timeline-input");
    if (!textarea) return;
    var text = textarea.value.trim();
    if (!text) {
      showStatus("붙여넣은 타임라인 텍스트가 비어 있습니다.", true);
      return;
    }

    try {
      var res = await fetch("/api/parse-timestamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          duration: appState.videoDuration || 0
        })
      });
      var data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "타임라인 파싱 실패");
      }

      if (!data.tracks || data.tracks.length === 0) {
        showStatus("⚠️ 텍스트에서 시간(예: 00:00, 03:25) 형식을 찾지 못했습니다.", true);
        return;
      }

      appState.tracks = data.tracks.map(function (t) {
        t.checked = true;
        return t;
      });
      showStatus("✅ 붙여넣은 텍스트에서 총 " + data.tracks.length + "곡의 타임라인을 성공적으로 추출했습니다!", false);
      switchTab("tab-timeline");
      renderTracksTable();
    } catch (err) {
      showStatus("❌ 타임라인 분석 오류: " + (err && err.message ? err.message : String(err)), true);
    }
  }

  async function handleStartSplit() {
    var urlInput = document.getElementById("yt-url-input");
    var url = urlInput ? urlInput.value.trim() : appState.videoUrl;
    if (!url) {
      showStatus("먼저 1단계에 유튜브 영상 주소를 입력해 주세요!", true);
      if (urlInput) urlInput.focus();
      return;
    }

    var selectedTracks = appState.tracks.filter(function (t) {
      return t && t.checked !== false;
    });

    if (appState.activeMode === "timeline" && selectedTracks.length === 0) {
      showStatus("분할 추출할 곡을 최소 1개 이상 선택하거나 추가해 주세요.", true);
      return;
    }

    var bitrateSelect = document.getElementById("bitrate-select");
    var bitrate = bitrateSelect ? bitrateSelect.value : "192";

    var silenceDurEl = document.getElementById("silence-duration");
    var silenceDbEl = document.getElementById("silence-db");
    var minTrackEl = document.getElementById("min-track-sec");

    var silenceOpts = {
      min_silence_len: silenceDurEl ? parseFloat(silenceDurEl.value) || 1.5 : 1.5,
      silence_thresh_db: silenceDbEl ? parseInt(silenceDbEl.value, 10) || -38 : -38,
      min_track_len: minTrackEl ? parseFloat(minTrackEl.value) || 45 : 45
    };

    var btnStart = document.getElementById("btn-start-split");
    if (btnStart) btnStart.disabled = true;

    var resultSection = document.getElementById("result-section");
    var completedBox = document.getElementById("completed-box");
    if (resultSection) resultSection.classList.remove("hidden");
    if (completedBox) completedBox.classList.add("hidden");

    updateProgressUI(2, "서버에 MP3 분할 추출 작업을 요청하는 중...");

    try {
      var res = await fetch("/api/start-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          mode: appState.activeMode,
          bitrate: bitrate,
          tracks: selectedTracks,
          silence_opts: silenceOpts
        })
      });
      var data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "작업 시작 실패");
      }

      appState.currentJobId = data.job_id;
      startPollingJob(data.job_id);
    } catch (err) {
      updateProgressUI(0, "❌ 오류: " + (err && err.message ? err.message : String(err)));
      if (btnStart) btnStart.disabled = false;
    }
  }

  function updateProgressUI(pct, msg) {
    var msgEl = document.getElementById("progress-message");
    var pctEl = document.getElementById("progress-percent");
    var fillEl = document.getElementById("progress-bar-fill");
    if (msgEl) msgEl.textContent = msg || "";
    if (pctEl) pctEl.textContent = String(pct || 0) + "%";
    if (fillEl) fillEl.style.width = String(pct || 0) + "%";
  }

  function startPollingJob(jobId) {
    if (appState.pollTimer) {
      clearInterval(appState.pollTimer);
    }
    appState.pollTimer = setInterval(async function () {
      try {
        var res = await fetch("/api/job-status?job_id=" + encodeURIComponent(jobId));
        var job = await res.json();
        if (!res.ok || job.error) {
          throw new Error(job.error || "상태 조회 실패");
        }

        updateProgressUI(job.progress || 0, job.message || "처리 중...");

        if (job.status === "done") {
          clearInterval(appState.pollTimer);
          appState.pollTimer = null;
          var btnStart = document.getElementById("btn-start-split");
          if (btnStart) btnStart.disabled = false;
          renderCompletedResults(job);
        } else if (job.status === "error") {
          clearInterval(appState.pollTimer);
          appState.pollTimer = null;
          var btnStartErr = document.getElementById("btn-start-split");
          if (btnStartErr) btnStartErr.disabled = false;
        }
      } catch (err) {
        clearInterval(appState.pollTimer);
        appState.pollTimer = null;
        var btnStartCatch = document.getElementById("btn-start-split");
        if (btnStartCatch) btnStartCatch.disabled = false;
      }
    }, 1000);
  }

  function renderCompletedResults(job) {
    var completedBox = document.getElementById("completed-box");
    var completedTitle = document.getElementById("completed-title");
    var completedPath = document.getElementById("completed-path");
    var zipBtn = document.getElementById("btn-download-zip");
    var tbody = document.getElementById("result-tbody");

    if (completedBox) completedBox.classList.remove("hidden");
    if (completedTitle) {
      completedTitle.textContent = "🎉 총 " + (job.files ? job.files.length : 0) + "곡 MP3 분할 저장 완료!";
    }
    if (completedPath) {
      appState.lastFolderPath = job.folder_path || "";
      completedPath.textContent = "📁 PC 저장 위치: " + (job.folder_path || "");
    }
    if (zipBtn && job.zip_url) {
      zipBtn.href = job.zip_url;
      zipBtn.setAttribute("download", job.zip_filename || "tracks.zip");
    }

    if (!tbody) return;
    tbody.innerHTML = "";

    (job.files || []).forEach(function (file) {
      if (!file) return;
      var tr = document.createElement("tr");

      var tdNum = document.createElement("td");
      tdNum.textContent = String(file.index || 1).padStart(2, "0");
      tr.appendChild(tdNum);

      var tdName = document.createElement("td");
      var strong = document.createElement("strong");
      strong.textContent = file.filename || "";
      tdName.appendChild(strong);
      tr.appendChild(tdName);

      var tdRange = document.createElement("td");
      tdRange.textContent = (file.start_str || "00:00") + " ~ " + (file.end_str || "") + " (" + (file.duration_str || "-") + ")";
      tr.appendChild(tdRange);

      var tdSize = document.createElement("td");
      tdSize.textContent = (file.size_mb || 0) + " MB";
      tr.appendChild(tdSize);

      var tdAudio = document.createElement("td");
      var audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.className = "audio-mini";
      audio.src = file.url || "";
      tdAudio.appendChild(audio);
      tr.appendChild(tdAudio);

      var tdDown = document.createElement("td");
      var a = document.createElement("a");
      a.className = "btn btn-sm btn-primary";
      a.href = file.url || "#";
      a.setAttribute("download", file.filename || "track.mp3");
      a.textContent = "💾 MP3 저장";
      tdDown.appendChild(a);
      tr.appendChild(tdDown);

      tbody.appendChild(tr);
    });
  }

  async function openLocalFolder(folderPath) {
    try {
      await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: folderPath || "" })
      });
    } catch (e) {
      console.error("폴더 열기 오류:", e);
    }
  }

  // =========================================================================
  // 4. DOMContentLoaded 이벤트 바인딩
  // =========================================================================
  document.addEventListener("DOMContentLoaded", function () {
    // [최우선] 드롭다운 및 탭 전환 UI 초기화
    initBitrateDropdown();

    var tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-tab");
        if (target) switchTab(target);
      });
    });

    // 전체 선택 체크박스
    var checkAll = document.getElementById("check-all-tracks");
    if (checkAll) {
      checkAll.addEventListener("change", function () {
        appState.tracks.forEach(function (t) {
          if (t) t.checked = checkAll.checked;
        });
        renderTracksTable();
      });
    }

    // 구간 수동 추가 버튼
    var btnAddTrack = document.getElementById("btn-add-track");
    if (btnAddTrack) {
      btnAddTrack.addEventListener("click", function () {
        var nextIdx = appState.tracks.length + 1;
        var lastEnd = appState.tracks.length > 0 ? appState.tracks[appState.tracks.length - 1].end_str : "00:00";
        if (!lastEnd || lastEnd === "끝까지") lastEnd = "00:00";
        appState.tracks.push({
          index: nextIdx,
          title: "Track " + String(nextIdx).padStart(2, "0"),
          start_str: lastEnd,
          end_str: "끝까지",
          duration_str: "-",
          checked: true
        });
        renderTracksTable();
      });
    }

    // 통째로 1곡 설정 버튼
    var btnSingleTrack = document.getElementById("btn-single-track");
    if (btnSingleTrack) {
      btnSingleTrack.addEventListener("click", function () {
        appState.tracks = [
          {
            index: 1,
            title: appState.videoTitle || "Full Audio Track",
            start_str: "00:00",
            end_str: "끝까지",
            duration_str: "-",
            checked: true
          }
        ];
        renderTracksTable();
      });
    }

    // 예시 타임라인 넣기 버튼
    var btnSample = document.getElementById("btn-sample-timeline");
    if (btnSample) {
      btnSample.addEventListener("click", function () {
        var textarea = document.getElementById("paste-timeline-input");
        if (textarea) {
          textarea.value =
            "00:00 1. 상쾌한 아침 로파이 비트 (Morning Coffee)\n" +
            "03:15 2. 빗소리와 어울리는 피아노 (Rainy Window)\n" +
            "06:40 3. 밤하늘 산책 (Midnight Walk)\n" +
            "10:12 4. 집중력을 높여주는 재즈 힙합 (Focus Groove)";
        }
      });
    }

    // 타임라인 분석 적용 버튼
    var btnApplyTimeline = document.getElementById("btn-apply-timeline");
    if (btnApplyTimeline) {
      btnApplyTimeline.addEventListener("click", function () {
        handleParsePastedTimeline();
      });
    }

    // 영상 분석 버튼 및 엔터키
    var btnAnalyze = document.getElementById("btn-analyze");
    if (btnAnalyze) {
      btnAnalyze.addEventListener("click", function () {
        handleAnalyzeVideo();
      });
    }

    var urlInput = document.getElementById("yt-url-input");
    if (urlInput) {
      urlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleAnalyzeVideo();
        }
      });
    }

    // MP3 분할 시작 버튼
    var btnStartSplit = document.getElementById("btn-start-split");
    if (btnStartSplit) {
      btnStartSplit.addEventListener("click", function () {
        handleStartSplit();
      });
    }

    // 폴더 열기 버튼
    var btnOpenDownloads = document.getElementById("btn-open-downloads");
    if (btnOpenDownloads) {
      btnOpenDownloads.addEventListener("click", function () {
        openLocalFolder("");
      });
    }

    var btnOpenAlbum = document.getElementById("btn-open-album-folder");
    if (btnOpenAlbum) {
      btnOpenAlbum.addEventListener("click", function () {
        openLocalFolder(appState.lastFolderPath);
      });
    }
  });
})();
