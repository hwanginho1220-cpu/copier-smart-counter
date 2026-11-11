/**
 * 스마트 부품 구매이력 매니저 (복사기 부품 / 컴퓨터 부품 / 거래명세서 AI 스캔)
 * - 전역 식별자 충돌 방지를 위해 IIFE 및 window.PurchaseManagerApp 네임스페이스 사용
 * - UI 기본 조작(탭 전환, 모달, 폼 이벤트)을 DOMContentLoaded 최상단에 우선 등록 및 try-catch 격리
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    RECORDS: 'pm_purchase_records_v1',
    VENDORS: 'pm_frequent_vendors_v1',
    CATEGORIES: 'pm_custom_categories_v1',
    GEMINI_KEY: 'pm_gemini_api_key_v1',
    WORKSPACE: 'pm_cloud_workspace_v1'
  };

  var DEFAULT_CATEGORIES = [
    '복사기 부품',
    '컴퓨터 부품',
    '프린터/소모품',
    '공구/자재',
    '기타'
  ];

  var DEFAULT_VENDORS = [
    '대원오피스(복사기부품)',
    '신도테크',
    '캐논파트너스',
    '컴퓨존',
    '다나와/아이코다',
    '쿠팡비즈',
    '네이버스마트스토어'
  ];

  var state = {
    records: [],
    vendors: [],
    categories: [],
    currentPhotoDataUrl: '',
    currentLineItems: [],
    geminiApiKey: '',
    workspaceCode: 'default-parts-room',
    db: null,
    unsubscribeSnapshot: null,
    isCloudConnected: false
  };

  // ==================== 유틸리티 함수 ====================
  function getTodayStr() {
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function formatNumber(num) {
    var n = Number(String(num || 0).replace(/[^0-9.-]/g, ''));
    if (isNaN(n)) return '0';
    return n.toLocaleString('ko-KR');
  }

  function parseAmount(val) {
    var cleaned = String(val || '').replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    try {
      var container = document.getElementById('toast-container');
      if (!container) return;
      var toast = document.createElement('div');
      var bgClass = type === 'error' ? 'bg-red-600' : (type === 'info' ? 'bg-indigo-600' : 'bg-slate-900');
      toast.className = bgClass + ' text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-xl shadow-lg border border-white/10 animate-fade-in pointer-events-auto';
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3200);
    } catch (e) {
      console.error('Toast Error:', e);
    }
  }

  // ==================== 로컬 스토리지 관리 ====================
  function loadLocalData() {
    try {
      var rawRecords = localStorage.getItem(STORAGE_KEYS.RECORDS);
      state.records = rawRecords ? JSON.parse(rawRecords) : [];
      if (!Array.isArray(state.records)) state.records = [];
    } catch (e) {
      state.records = [];
    }

    try {
      var rawVendors = localStorage.getItem(STORAGE_KEYS.VENDORS);
      state.vendors = rawVendors ? JSON.parse(rawVendors) : DEFAULT_VENDORS.slice();
      if (!Array.isArray(state.vendors) || state.vendors.length === 0) {
        state.vendors = DEFAULT_VENDORS.slice();
      }
    } catch (e) {
      state.vendors = DEFAULT_VENDORS.slice();
    }

    try {
      var rawCats = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      state.categories = rawCats ? JSON.parse(rawCats) : DEFAULT_CATEGORIES.slice();
      if (!Array.isArray(state.categories) || state.categories.length === 0) {
        state.categories = DEFAULT_CATEGORIES.slice();
      }
    } catch (e) {
      state.categories = DEFAULT_CATEGORIES.slice();
    }

    try {
      state.geminiApiKey = localStorage.getItem(STORAGE_KEYS.GEMINI_KEY) || '';
      var urlParams = new URLSearchParams(window.location.search);
      var roomParam = urlParams.get('room');
      var savedWs = localStorage.getItem(STORAGE_KEYS.WORKSPACE);
      if (roomParam && roomParam.trim()) {
        state.workspaceCode = roomParam.trim();
        localStorage.setItem(STORAGE_KEYS.WORKSPACE, state.workspaceCode);
      } else if (savedWs && savedWs.trim()) {
        state.workspaceCode = savedWs.trim();
      }
    } catch (e) {
      // ignore storage errors
    }
  }

  function saveLocalRecords() {
    try {
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(state.records));
    } catch (e) {
      showToast('브라우저 저장소 용량이 부족합니다. 오래된 사진 내역을 백업 후 정리해주세요.', 'error');
    }
  }

  function rememberVendor(vendorName) {
    if (!vendorName) return;
    var clean = vendorName.trim();
    if (!clean || clean === '미지정(사진기록)') return;
    var idx = state.vendors.indexOf(clean);
    if (idx !== -1) {
      state.vendors.splice(idx, 1);
    }
    state.vendors.unshift(clean);
    if (state.vendors.length > 12) {
      state.vendors = state.vendors.slice(0, 12);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.VENDORS, JSON.stringify(state.vendors));
    } catch (e) {
      // ignore
    }
    renderVendorChips();
  }

  // ==================== 이미지 리사이즈/압축 및 가로 방향 자동 회전 ====================
  function compressImageFile(file, callback) {
    var reader = new FileReader();
    reader.onload = function (event) {
      var img = new Image();
      img.onload = function () {
        var origW = img.width;
        var origH = img.height;
        // 세로로 찍힌 사진(높이 > 너비)이면 거래명세서 가로 보기에 맞춰 자동으로 90도 가로 회전!
        var autoRotateToLandscape = origH > origW;
        var targetW = autoRotateToLandscape ? origH : origW;
        var targetH = autoRotateToLandscape ? origW : origH;

        var maxDim = 1024;
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW > targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
          } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
          }
        }

        var canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        var ctx = canvas.getContext('2d');

        if (autoRotateToLandscape) {
          // 반시계 방향(-90도) 회전하여 세로로 찍은 가로 명세서를 똑바로 눕힘
          ctx.translate(targetW / 2, targetH / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(img, -targetH / 2, -targetW / 2, targetH, targetW);
        } else {
          ctx.drawImage(img, 0, 0, targetW, targetH);
        }

        var compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
        callback(null, compressedDataUrl, targetW, targetH, autoRotateToLandscape);
      };
      img.onerror = function () {
        callback(new Error('이미지를 불러올 수 없습니다.'));
      };
      img.src = event.target.result;
    };
    reader.onerror = function () {
      callback(new Error('파일 읽기에 실패했습니다.'));
    };
    reader.readAsDataURL(file);
  }

  // 기존 DataURL 이미지를 지정 각도(90 또는 -90 또는 180)만큼 회전하는 함수
  function rotateDataUrlImage(dataUrl, degree, callback) {
    if (!dataUrl || !degree) {
      if (callback) callback(dataUrl);
      return;
    }
    var img = new Image();
    img.onload = function () {
      var w = img.width;
      var h = img.height;
      var canvas = document.createElement('canvas');
      var normDeg = ((degree % 360) + 360) % 360;

      if (normDeg === 90 || normDeg === 270) {
        canvas.width = h;
        canvas.height = w;
      } else {
        canvas.width = w;
        canvas.height = h;
      }

      var ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((normDeg * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);

      var rotatedUrl = canvas.toDataURL('image/jpeg', 0.78);
      if (callback) callback(rotatedUrl, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  }

  // ==================== Gemini Vision AI 거래명세서 초고속 스캔 (동적 모델 캐싱 + thinkingBudget:0) ====================
  var FAST_GEMINI_MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  var cachedModelList = null;
  var cachedKeyForModels = '';

  function resolveAvailableModels(cleanKey) {
    if (cachedModelList && cachedModelList.length > 0 && cachedKeyForModels === cleanKey) {
      return Promise.resolve(cachedModelList.slice());
    }
    var listUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(cleanKey);
    return fetch(listUrl)
      .then(function (res) {
        if (!res.ok) return FAST_GEMINI_MODELS.slice();
        return res.json().then(function (data) {
          if (!data || !Array.isArray(data.models)) return FAST_GEMINI_MODELS.slice();
          var supported = data.models
            .filter(function (m) {
              return m && m.name && Array.isArray(m.supportedGenerationMethods) &&
                m.supportedGenerationMethods.indexOf('generateContent') !== -1 &&
                m.name.indexOf('gemini') !== -1 &&
                m.name.indexOf('embedding') === -1 &&
                m.name.indexOf('tts') === -1 &&
                m.name.indexOf('image-generation') === -1 &&
                m.name.indexOf('audio') === -1 &&
                m.name.indexOf('robotics') === -1 &&
                m.name.indexOf('computer-use') === -1;
            })
            .map(function (m) {
              return m.name.replace(/^models\//, '');
            });

          var ordered = [];
          // 1순위: FAST_GEMINI_MODELS에 있으면서 실제 키가 지원하는 모델
          FAST_GEMINI_MODELS.forEach(function (pref) {
            if (supported.indexOf(pref) !== -1 && ordered.indexOf(pref) === -1) {
              ordered.push(pref);
            }
          });
          // 2순위: 이름에 flash-lite가 들어간 모델 (가장 빠름)
          supported.forEach(function (s) {
            if (s.indexOf('flash-lite') !== -1 && ordered.indexOf(s) === -1) {
              ordered.push(s);
            }
          });
          // 3순위: 이름에 flash가 들어간 모델
          supported.forEach(function (s) {
            if (s.indexOf('flash') !== -1 && ordered.indexOf(s) === -1) {
              ordered.push(s);
            }
          });
          // 4순위: 나머지 지원 모델
          supported.forEach(function (s) {
            if (ordered.indexOf(s) === -1) {
              ordered.push(s);
            }
          });

          if (ordered.length > 0) {
            cachedModelList = ordered;
            cachedKeyForModels = cleanKey;
            return ordered.slice();
          }
          return FAST_GEMINI_MODELS.slice();
        });
      })
      .catch(function () {
        return FAST_GEMINI_MODELS.slice();
      });
  }

  function sendSingleGeminiRequest(cleanKey, modelName, payload, useNoThinking) {
    var apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(cleanKey);
    var bodyCopy = JSON.parse(JSON.stringify(payload));
    if (useNoThinking) {
      bodyCopy.generationConfig = bodyCopy.generationConfig || {};
      bodyCopy.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 18000) : null;

    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyCopy),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timeoutId) clearTimeout(timeoutId);
      if (res.ok) {
        return res.json();
      }
      return res.json().catch(function () { return {}; }).then(function (errJson) {
        var detailMsg = (errJson && errJson.error && errJson.error.message) ? errJson.error.message : ('HTTP ' + res.status);
        // 만약 thinkingConfig 파라미터 자체를 지원하지 않는 모델이어서 400이 났다면, thinkingConfig 없이 즉시 재호출
        if (useNoThinking && res.status === 400 && detailMsg.toLowerCase().indexOf('thinking') !== -1) {
          return sendSingleGeminiRequest(cleanKey, modelName, payload, false);
        }
        var err = new Error('API 오류 (' + res.status + '): ' + detailMsg);
        err.status = res.status;
        throw err;
      });
    }).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    });
  }

  function callGeminiWithModels(cleanKey, requestBody, modelList, idx) {
    var currentIdx = idx || 0;
    var modelName = modelList[currentIdx];
    // 2.5 또는 3 계열 모델이면 기본적으로 thinkingBudget: 0 (생각 시간 0초)을 켜서 2~3초 내 즉시 응답 유도
    var shouldDisableThinking = (modelName.indexOf('2.5') !== -1 || modelName.indexOf('3') !== -1);

    return sendSingleGeminiRequest(cleanKey, modelName, requestBody, shouldDisableThinking)
      .catch(function (err) {
        var st = err && err.status;
        var isTimeout = err && err.name === 'AbortError';
        if (currentIdx + 1 < modelList.length && (isTimeout || st === 404 || st === 429 || st === 503 || st === 400)) {
          console.warn('Model ' + modelName + ' failed, switching to ' + modelList[currentIdx + 1]);
          return callGeminiWithModels(cleanKey, requestBody, modelList, currentIdx + 1);
        }
        throw err;
      });
  }

  function callGeminiModelWithFallback(cleanKey, requestBody) {
    // 실제 API 키가 지원하는 모델 목록을 조회(1회 조회 후 메모리에 캐싱되어 0초 소요)한 뒤 호출하여 404 원천 차단!
    return resolveAvailableModels(cleanKey).then(function (models) {
      return callGeminiWithModels(cleanKey, requestBody, models, 0);
    });
  }

  function analyzeInvoiceWithGemini() {
    if (!state.currentPhotoDataUrl) {
      showToast('먼저 거래명세서나 영수증 사진을 첨부해주세요.', 'error');
      return;
    }

    var cleanKey = String(state.geminiApiKey || '').replace(/\s+/g, '');
    if (!cleanKey) {
      showToast('AI 자동 인식을 위해 우측 상단 [설정/연동]에서 Gemini API 키를 입력해주세요.', 'info');
      openSettingsModal();
      return;
    }

    var btn = document.getElementById('btn-run-ai-ocr');
    var statusMsg = document.getElementById('ai-ocr-status-msg');
    var originalBtnHtml = btn ? btn.innerHTML : '';

    var elapsedSec = 0;
    var timerInterval = null;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⚡</span><span>초고속 AI 스캔 중... (0초)</span>';
      timerInterval = setInterval(function () {
        elapsedSec += 1;
        btn.innerHTML = '<span>⚡</span><span>초고속 AI 스캔 중... (' + elapsedSec + '초)</span>';
      }, 1000);
    }
    if (statusMsg) {
      statusMsg.innerHTML = '⚡ <strong>초고속 AI 스캔 중...</strong> 거래처, 품목, 수량, 단가, 합계금액을 즉시 추출하고 있습니다 (보통 2~4초 소요)';
    }

    var base64Data = state.currentPhotoDataUrl.split(',')[1];
    var mimeMatch = state.currentPhotoDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    var catListStr = state.categories.length > 0 ? state.categories.join('|') : '복사기 부품|컴퓨터 부품|프린터/소모품|공구/자재|기타';
    var promptText = [
      '한국 거래명세서/영수증/부품사진입니다. 순수 JSON만 출력하세요:',
      '{"date":"YYYY-MM-DD","vendor":"구매처상호","category":"' + catListStr + ' 중 가장 알맞은 1개","summary":"대표품목 요약","totalAmount":숫자총액,"paymentMethod":"세금계산서(월결제)|법인/사업자카드|계좌이체/현금|온라인결제","rotationNeeded":0또는90또는180또는270(글씨가똑바로보이려면시계방향으로몇도회전해야하는지),"items":[{"name":"품목명","qty":수량,"unitPrice":단가,"amount":금액}]}'
    ].join('\n');

    var requestBody = {
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    };

    callGeminiModelWithFallback(cleanKey, requestBody)
      .then(function (data) {
        var rawText = '';
        if (
          data &&
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0]
        ) {
          rawText = data.candidates[0].content.parts[0].text || '';
        }
        rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
        var jsonStart = rawText.indexOf('{');
        var jsonEnd = rawText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          rawText = rawText.substring(jsonStart, jsonEnd + 1);
        }
        var parsed = JSON.parse(rawText);
        applyAiResultToForm(parsed);
        if (statusMsg) {
          statusMsg.innerHTML = '✅ <strong>AI 자동 인식 완료! (' + elapsedSec + '초 소요)</strong> 아래 채워진 내용을 확인 후 [구매이력 저장하기]를 눌러주세요.';
        }
        showToast('✨ ' + elapsedSec + '초 만에 거래명세서 내용을 자동 입력했습니다!', 'info');
      })
      .catch(function (err) {
        console.error('Gemini OCR Error:', err);
        if (statusMsg) {
          statusMsg.innerHTML = '⚠️ AI 자동 인식 실패: ' + escapeHtml(err.message) + ' (우측 상단 [설정/연동]에서 API 키를 확인해주세요)';
        }
        showToast('AI 인식 오류: ' + err.message, 'error');
      })
      .finally(function () {
        if (timerInterval) clearInterval(timerInterval);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalBtnHtml;
        }
      });
  }

  function applyAiResultToForm(parsed) {
    if (!parsed || typeof parsed !== 'object') return;

    var dateInput = document.getElementById('input-date');
    var catInput = document.getElementById('input-category');
    var vendorInput = document.getElementById('input-vendor');
    var summaryInput = document.getElementById('input-summary');
    var amountInput = document.getElementById('input-amount');
    var paymentInput = document.getElementById('input-payment');

    if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && dateInput) {
      dateInput.value = parsed.date;
    }
    if (parsed.category && catInput) {
      if (state.categories.indexOf(parsed.category) !== -1) {
        catInput.value = parsed.category;
      }
    }
    if (parsed.vendor && vendorInput) {
      vendorInput.value = parsed.vendor;
    }
    if (parsed.summary && summaryInput) {
      summaryInput.value = parsed.summary;
    }
    if (parsed.totalAmount !== undefined && amountInput) {
      amountInput.value = formatNumber(parsed.totalAmount);
    }
    if (parsed.paymentMethod && paymentInput) {
      paymentInput.value = parsed.paymentMethod;
    }

    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      state.currentLineItems = parsed.items.map(function (item) {
        var qty = Number(item.qty) || 1;
        var unitPrice = Number(item.unitPrice) || 0;
        var amount = Number(item.amount) || (qty * unitPrice);
        return {
          name: item.name || '',
          qty: qty,
          unitPrice: unitPrice,
          amount: amount
        };
      });
      renderLineItems();
    }

    // AI가 이미지 상하좌우 뒤집힘(90, 180, 270도)을 감지한 경우 자동으로 정방향 회전
    var rot = Number(parsed.rotationNeeded) || 0;
    if ((rot === 90 || rot === 180 || rot === 270) && state.currentPhotoDataUrl) {
      rotateDataUrlImage(state.currentPhotoDataUrl, rot, function (rotatedUrl) {
        state.currentPhotoDataUrl = rotatedUrl;
        updatePhotoPreviewUI();
      });
    }
  }

  // ==================== 세부 품목(거래명세서 행) 렌더링 ====================
  function renderLineItems() {
    var wrapper = document.getElementById('line-items-wrapper');
    var listEl = document.getElementById('line-items-list');
    if (!wrapper || !listEl) return;

    if (!state.currentLineItems || state.currentLineItems.length === 0) {
      wrapper.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }

    wrapper.classList.remove('hidden');
    listEl.innerHTML = '';

    state.currentLineItems.forEach(function (item, idx) {
      var row = document.createElement('div');
      row.className = 'grid grid-cols-12 gap-1.5 items-center bg-white p-2 rounded-lg border border-slate-200';
      row.innerHTML =
        '<div class="col-span-12 sm:col-span-5">' +
          '<input type="text" data-idx="' + idx + '" data-field="name" value="' + escapeHtml(item.name) + '" placeholder="품목명/규격 (예: IR2525 드럼)" class="line-item-input w-full px-2.5 py-1.5 rounded border border-slate-200 text-xs font-medium">' +
        '</div>' +
        '<div class="col-span-3 sm:col-span-2">' +
          '<input type="number" data-idx="' + idx + '" data-field="qty" value="' + Number(item.qty || 1) + '" min="1" placeholder="수량" class="line-item-input w-full px-2 py-1.5 rounded border border-slate-200 text-xs text-right">' +
        '</div>' +
        '<div class="col-span-4 sm:col-span-2">' +
          '<input type="text" inputmode="numeric" data-idx="' + idx + '" data-field="unitPrice" value="' + formatNumber(item.unitPrice || 0) + '" placeholder="단가" class="line-item-input w-full px-2 py-1.5 rounded border border-slate-200 text-xs text-right">' +
        '</div>' +
        '<div class="col-span-4 sm:col-span-2">' +
          '<input type="text" inputmode="numeric" data-idx="' + idx + '" data-field="amount" value="' + formatNumber(item.amount || 0) + '" placeholder="합계" class="line-item-input w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-bold text-blue-700 text-right bg-blue-50/40">' +
        '</div>' +
        '<div class="col-span-1 text-right">' +
          '<button type="button" data-remove-idx="' + idx + '" class="btn-remove-line-item text-slate-400 hover:text-red-600 text-xs font-bold p-1" title="줄 삭제">✕</button>' +
        '</div>';
      listEl.appendChild(row);
    });

    // 이벤트 바인딩
    var inputs = listEl.querySelectorAll('.line-item-input');
    inputs.forEach(function (inp) {
      inp.addEventListener('input', function (e) {
        var idx = parseInt(e.target.getAttribute('data-idx'), 10);
        var field = e.target.getAttribute('data-field');
        if (isNaN(idx) || !state.currentLineItems[idx]) return;

        if (field === 'name') {
          state.currentLineItems[idx].name = e.target.value;
        } else if (field === 'qty') {
          state.currentLineItems[idx].qty = Number(e.target.value) || 0;
          state.currentLineItems[idx].amount = state.currentLineItems[idx].qty * state.currentLineItems[idx].unitPrice;
          updateLineItemRowDisplay(idx);
        } else if (field === 'unitPrice') {
          var up = parseAmount(e.target.value);
          state.currentLineItems[idx].unitPrice = up;
          state.currentLineItems[idx].amount = state.currentLineItems[idx].qty * up;
          e.target.value = formatNumber(up);
          updateLineItemRowDisplay(idx);
        } else if (field === 'amount') {
          var amt = parseAmount(e.target.value);
          state.currentLineItems[idx].amount = amt;
          e.target.value = formatNumber(amt);
          recalculateTotalFromLineItems();
        }
        autoFillSummaryFromLineItems();
      });
    });

    var removeBtns = listEl.querySelectorAll('.btn-remove-line-item');
    removeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
        if (!isNaN(idx)) {
          state.currentLineItems.splice(idx, 1);
          renderLineItems();
          recalculateTotalFromLineItems();
        }
      });
    });
  }

  function updateLineItemRowDisplay(idx) {
    var listEl = document.getElementById('line-items-list');
    if (!listEl || !state.currentLineItems[idx]) return;
    var amtInput = listEl.querySelector('input[data-idx="' + idx + '"][data-field="amount"]');
    if (amtInput) {
      amtInput.value = formatNumber(state.currentLineItems[idx].amount);
    }
    recalculateTotalFromLineItems();
  }

  function recalculateTotalFromLineItems() {
    if (!state.currentLineItems || state.currentLineItems.length === 0) return;
    var sum = state.currentLineItems.reduce(function (acc, cur) {
      return acc + (Number(cur.amount) || 0);
    }, 0);
    var amountInput = document.getElementById('input-amount');
    if (amountInput && sum > 0) {
      amountInput.value = formatNumber(sum);
    }
  }

  function autoFillSummaryFromLineItems() {
    var summaryInput = document.getElementById('input-summary');
    if (!summaryInput) return;
    var validNames = state.currentLineItems
      .map(function (i) { return (i.name || '').trim(); })
      .filter(Boolean);
    if (validNames.length === 0) return;
    if (validNames.length === 1) {
      summaryInput.value = validNames[0];
    } else {
      summaryInput.value = validNames[0] + ' 외 ' + (validNames.length - 1) + '건';
    }
  }

  // ==================== 카테고리 관리 및 렌더링 ====================
  function getCategoryIcon(cat) {
    if (!cat) return '📦';
    if (cat.indexOf('복사기') !== -1) return '🖨️';
    if (cat.indexOf('컴퓨터') !== -1 || cat.indexOf('PC') !== -1) return '💻';
    if (cat.indexOf('프린터') !== -1 || cat.indexOf('소모품') !== -1 || cat.indexOf('토너') !== -1) return '🖨️';
    if (cat.indexOf('공구') !== -1 || cat.indexOf('자재') !== -1) return '🔧';
    return '🏷️';
  }

  function saveCategories() {
    try {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(state.categories));
    } catch (e) {}
  }

  function renderCategoryOptionsAndChips() {
    var selectInput = document.getElementById('input-category');
    var filterSelect = document.getElementById('filter-category');
    var chipsContainer = document.getElementById('category-quick-chips-container');

    if (selectInput) {
      var prevVal = selectInput.value;
      selectInput.innerHTML = '';
      state.categories.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = getCategoryIcon(cat) + ' ' + cat;
        selectInput.appendChild(opt);
      });
      if (prevVal && state.categories.indexOf(prevVal) !== -1) {
        selectInput.value = prevVal;
      } else if (state.categories.length > 0) {
        selectInput.value = state.categories[0];
      }
    }

    if (filterSelect) {
      var prevFilter = filterSelect.value || 'ALL';
      filterSelect.innerHTML = '<option value="ALL">전체 카테고리</option>';
      state.categories.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = getCategoryIcon(cat) + ' ' + cat;
        filterSelect.appendChild(opt);
      });
      if (prevFilter === 'ALL' || state.categories.indexOf(prevFilter) !== -1) {
        filterSelect.value = prevFilter;
      } else {
        filterSelect.value = 'ALL';
      }
    }

    if (chipsContainer) {
      chipsContainer.innerHTML = '';
      var chipColors = [
        'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
        'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
        'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
        'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
        'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
        'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
      ];
      state.categories.forEach(function (cat, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        var colorClass = chipColors[idx % chipColors.length];
        btn.className = 'category-quick-chip text-[11px] px-2.5 py-1 rounded-full border font-semibold transition ' + colorClass;
        btn.textContent = getCategoryIcon(cat) + ' ' + cat;
        btn.addEventListener('click', function () {
          if (selectInput) selectInput.value = cat;
        });
        chipsContainer.appendChild(btn);
      });
    }
  }

  function renderCategoryManagerModalList() {
    var listEl = document.getElementById('category-manager-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.categories.forEach(function (cat, idx) {
      var row = document.createElement('div');
      row.className = 'flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200';
      row.innerHTML =
        '<span class="text-sm pl-1">' + getCategoryIcon(cat) + '</span>' +
        '<input type="text" data-cat-idx="' + idx + '" value="' + escapeHtml(cat) + '" class="cat-rename-input flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none">' +
        '<button type="button" data-save-idx="' + idx + '" class="btn-save-cat-name px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold shrink-0">이름변경</button>' +
        '<button type="button" data-del-idx="' + idx + '" class="btn-del-cat px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold shrink-0">삭제</button>';
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.btn-save-cat-name').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-save-idx'), 10);
        var inp = listEl.querySelector('input[data-cat-idx="' + idx + '"]');
        if (!inp || isNaN(idx)) return;
        var oldName = state.categories[idx];
        var newName = inp.value.trim();
        if (!newName) {
          showToast('카테고리 이름을 입력해주세요.', 'error');
          return;
        }
        if (newName === oldName) {
          showToast('변경된 내용이 없습니다.');
          return;
        }
        if (state.categories.indexOf(newName) !== -1) {
          showToast('이미 존재하는 카테고리 이름입니다.', 'error');
          return;
        }
        state.categories[idx] = newName;
        // 기존 구매내역 중 oldName을 쓰던 항목들도 일괄 업데이트
        var updatedCount = 0;
        state.records.forEach(function (r) {
          if (r && r.category === oldName) {
            r.category = newName;
            r.updatedAt = new Date().toISOString();
            syncRecordToCloud(r);
            updatedCount += 1;
          }
        });
        saveCategories();
        if (updatedCount > 0) saveLocalRecords();
        renderCategoryManagerModalList();
        renderAllViews();
        showToast('✅ [' + oldName + '] → [' + newName + '] 변경 완료!');
      });
    });

    listEl.querySelectorAll('.btn-del-cat').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (state.categories.length <= 1) {
          showToast('최소 1개의 카테고리는 남아있어야 합니다.', 'error');
          return;
        }
        var idx = parseInt(btn.getAttribute('data-del-idx'), 10);
        if (isNaN(idx)) return;
        var targetName = state.categories[idx];
        if (!confirm('[' + targetName + '] 카테고리를 목록에서 삭제하시겠습니까?')) return;
        state.categories.splice(idx, 1);
        saveCategories();
        renderCategoryManagerModalList();
        renderAllViews();
        showToast('🗑️ [' + targetName + '] 카테고리가 삭제되었습니다.');
      });
    });
  }

  // ==================== 자주 쓰는 구매처 칩 렌더링 ====================
  function renderVendorChips() {
    var container = document.getElementById('recent-vendors-chips');
    if (!container) return;
    container.innerHTML = '';

    state.vendors.forEach(function (v) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 text-slate-700 border border-slate-200 font-semibold transition';
      btn.textContent = v;
      btn.addEventListener('click', function () {
        var vendorInput = document.getElementById('input-vendor');
        if (vendorInput) {
          vendorInput.value = v;
          vendorInput.focus();
        }
      });
      container.appendChild(btn);
    });
  }

  // ==================== 구매내역 저장 & 사진만 빠른 저장 ====================
  function savePurchaseRecord(isQuickPhotoOnly) {
    var editIdEl = document.getElementById('edit-record-id');
    var dateEl = document.getElementById('input-date');
    var catEl = document.getElementById('input-category');
    var vendorEl = document.getElementById('input-vendor');
    var summaryEl = document.getElementById('input-summary');
    var amountEl = document.getElementById('input-amount');
    var paymentEl = document.getElementById('input-payment');
    var memoEl = document.getElementById('input-memo');

    var editId = editIdEl ? editIdEl.value.trim() : '';
    var dateVal = (dateEl && dateEl.value) ? dateEl.value : getTodayStr();
    var catVal = (catEl && catEl.value) ? catEl.value : '복사기 부품';
    var vendorVal = (vendorEl && vendorEl.value.trim()) ? vendorEl.value.trim() : (isQuickPhotoOnly ? '미지정(사진기록)' : '');
    var summaryVal = (summaryEl && summaryEl.value.trim()) ? summaryEl.value.trim() : (isQuickPhotoOnly ? '거래명세서/부품 사진 간편등록 (추후확인)' : '');
    var amountVal = amountEl ? parseAmount(amountEl.value) : 0;
    var paymentVal = paymentEl ? paymentEl.value : '세금계산서(월결제)';
    var memoVal = memoEl ? memoEl.value.trim() : '';

    if (!isQuickPhotoOnly) {
      if (!vendorVal) {
        showToast('구매처(거래처)를 입력하거나 아래 버튼을 선택해주세요.', 'error');
        if (vendorEl) vendorEl.focus();
        return;
      }
      if (!summaryVal) {
        showToast('구매내용(부품명/품목 요약)을 입력해주세요.', 'error');
        if (summaryEl) summaryEl.focus();
        return;
      }
    } else if (!state.currentPhotoDataUrl) {
      showToast('사진만 바로 저장하려면 먼저 사진을 촬영하거나 선택해주세요.', 'error');
      return;
    }

    var recordId = editId || ('pm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    var recordObj = {
      id: recordId,
      date: dateVal,
      category: catVal,
      vendor: vendorVal,
      summary: summaryVal,
      amount: amountVal,
      payment: paymentVal,
      memo: memoVal,
      lineItems: state.currentLineItems.slice(),
      photoDataUrl: state.currentPhotoDataUrl || '',
      updatedAt: new Date().toISOString()
    };

    var existingIdx = state.records.findIndex(function (r) {
      return r && r.id === recordId;
    });

    if (existingIdx !== -1) {
      state.records[existingIdx] = recordObj;
    } else {
      state.records.unshift(recordObj);
    }

    rememberVendor(vendorVal);
    saveLocalRecords();
    syncRecordToCloud(recordObj);

    resetPurchaseForm();
    renderAllViews();

    showToast(editId ? '✅ 구매내역이 수정되었습니다.' : '✅ 구매이력이 저장되었습니다.');
  }

  function resetPurchaseForm() {
    var editIdEl = document.getElementById('edit-record-id');
    var dateEl = document.getElementById('input-date');
    var vendorEl = document.getElementById('input-vendor');
    var summaryEl = document.getElementById('input-summary');
    var amountEl = document.getElementById('input-amount');
    var memoEl = document.getElementById('input-memo');
    var titleEl = document.getElementById('form-mode-title');
    var submitTextEl = document.getElementById('btn-submit-text');

    if (editIdEl) editIdEl.value = '';
    if (dateEl) dateEl.value = getTodayStr();
    if (vendorEl) vendorEl.value = '';
    if (summaryEl) summaryEl.value = '';
    if (amountEl) amountEl.value = '';
    if (memoEl) memoEl.value = '';
    if (titleEl) titleEl.innerHTML = '<span>✍️</span> 2단계: 구매 내역 확인 및 입력';
    if (submitTextEl) submitTextEl.textContent = '구매이력 저장하기';

    state.currentPhotoDataUrl = '';
    state.currentLineItems = [];
    updatePhotoPreviewUI();
    renderLineItems();
  }

  function updatePhotoPreviewUI() {
    var container = document.getElementById('photo-preview-container');
    var imgEl = document.getElementById('photo-preview-img');
    var camInput = document.getElementById('input-camera-photo');
    var galInput = document.getElementById('input-gallery-photo');

    if (!container || !imgEl) return;

    if (state.currentPhotoDataUrl) {
      imgEl.src = state.currentPhotoDataUrl;
      container.classList.remove('hidden');
    } else {
      imgEl.src = '';
      container.classList.add('hidden');
      if (camInput) camInput.value = '';
      if (galInput) galInput.value = '';
    }
  }

  // ==================== 수정 / 삭제 / 사진 확대 ====================
  function startEditRecord(recordId) {
    var target = state.records.find(function (r) { return r && r.id === recordId; });
    if (!target) return;

    switchTab('register');

    var editIdEl = document.getElementById('edit-record-id');
    var dateEl = document.getElementById('input-date');
    var catEl = document.getElementById('input-category');
    var vendorEl = document.getElementById('input-vendor');
    var summaryEl = document.getElementById('input-summary');
    var amountEl = document.getElementById('input-amount');
    var paymentEl = document.getElementById('input-payment');
    var memoEl = document.getElementById('input-memo');
    var titleEl = document.getElementById('form-mode-title');
    var submitTextEl = document.getElementById('btn-submit-text');

    if (editIdEl) editIdEl.value = target.id;
    if (dateEl) dateEl.value = target.date || getTodayStr();
    if (catEl) catEl.value = target.category || '복사기 부품';
    if (vendorEl) vendorEl.value = target.vendor || '';
    if (summaryEl) summaryEl.value = target.summary || '';
    if (amountEl) amountEl.value = formatNumber(target.amount || 0);
    if (paymentEl) paymentEl.value = target.payment || '세금계산서(월결제)';
    if (memoEl) memoEl.value = target.memo || '';

    state.currentPhotoDataUrl = target.photoDataUrl || '';
    state.currentLineItems = Array.isArray(target.lineItems) ? JSON.parse(JSON.stringify(target.lineItems)) : [];

    updatePhotoPreviewUI();
    renderLineItems();

    if (titleEl) titleEl.innerHTML = '<span>✏️</span> 구매 내역 수정 모드';
    if (submitTextEl) submitTextEl.textContent = '수정 내용 저장하기';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('수정할 내역을 불러왔습니다.');
  }

  function deleteRecord(recordId) {
    if (!confirm('이 구매내역을 삭제하시겠습니까?')) return;
    state.records = state.records.filter(function (r) {
      return r && r.id !== recordId;
    });
    saveLocalRecords();
    deleteRecordFromCloud(recordId);
    renderAllViews();
    showToast('구매내역이 삭제되었습니다.');
  }

  var currentViewingRecordId = null;

  function openPhotoViewer(dataUrl, caption, recordId) {
    if (!dataUrl) return;
    currentViewingRecordId = recordId || null;
    var modal = document.getElementById('modal-photo-viewer');
    var img = document.getElementById('modal-photo-img');
    var cap = document.getElementById('modal-photo-caption');
    if (!modal || !img) return;
    img.src = dataUrl;
    if (cap) cap.textContent = caption || '거래명세서 / 부품 사진';
    modal.classList.remove('hidden');
  }

  // ==================== 화면 렌더링 (헤더, 최근내역, 전체조회, 통계) ====================
  function getCategoryBadgeHtml(cat) {
    if (cat === '복사기 부품') {
      return '<span class="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">🖨️ 복사기 부품</span>';
    }
    if (cat === '컴퓨터 부품') {
      return '<span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">💻 컴퓨터 부품</span>';
    }
    if (cat === '프린터/소모품') {
      return '<span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">🖨️ 프린터/소모품</span>';
    }
    if (cat === '공구/자재') {
      return '<span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">🔧 공구/자재</span>';
    }
    return '<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold">📦 ' + escapeHtml(cat || '기타') + '</span>';
  }

  function createRecordCardHtml(r) {
    var hasPhoto = Boolean(r.photoDataUrl);
    var hasLineItems = Array.isArray(r.lineItems) && r.lineItems.length > 0;
    var lineItemsHtml = '';

    if (hasLineItems) {
      var rows = r.lineItems.map(function (li) {
        return '<div class="flex justify-between text-[11px] text-slate-600 py-0.5 border-b border-slate-100 last:border-0">' +
          '<span class="truncate pr-2">• ' + escapeHtml(li.name) + ' <strong class="text-slate-800">x' + Number(li.qty || 1) + '</strong></span>' +
          '<span class="shrink-0 font-mono">' + formatNumber(li.amount || 0) + '원</span>' +
        '</div>';
      }).join('');
      lineItemsHtml = '<div class="mt-2 bg-slate-50 rounded-lg p-2 border border-slate-200/80">' + rows + '</div>';
    }

    return (
      '<div class="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200 shadow-2xs hover:border-blue-300 transition flex flex-col sm:flex-row gap-3 justify-between">' +
        '<div class="flex gap-3 flex-1 min-w-0">' +
          (hasPhoto
            ? '<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 shrink-0 cursor-pointer relative group btn-view-photo" data-id="' + escapeHtml(r.id) + '" title="클릭하여 사진/명세서 확대">' +
                '<img src="' + r.photoDataUrl + '" alt="명세서 썸네일" class="w-full h-full object-cover group-hover:scale-105 transition">' +
                '<span class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">🔍 확대</span>' +
              '</div>'
            : '<div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 text-xl">' +
                (r.category === '복사기 부품' ? '🖨️' : (r.category === '컴퓨터 부품' ? '💻' : '🧾')) +
              '</div>') +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex flex-wrap items-center gap-1.5 mb-1">' +
              '<span class="text-xs font-bold text-slate-500 font-mono">' + escapeHtml(r.date) + '</span>' +
              getCategoryBadgeHtml(r.category) +
              '<span class="text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">🏢 ' + escapeHtml(r.vendor) + '</span>' +
              (r.payment ? '<span class="text-[11px] text-slate-400">' + escapeHtml(r.payment) + '</span>' : '') +
            '</div>' +
            '<div class="text-sm sm:text-base font-extrabold text-slate-900 break-words">' + escapeHtml(r.summary) + '</div>' +
            (r.memo ? '<div class="text-xs text-slate-500 mt-0.5">📝 ' + escapeHtml(r.memo) + '</div>' : '') +
            lineItemsHtml +
          '</div>' +
        '</div>' +
        '<div class="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 shrink-0 gap-2">' +
          '<div class="text-base sm:text-lg font-extrabold text-blue-700 font-mono">' + formatNumber(r.amount) + '원</div>' +
          '<div class="flex items-center gap-1.5">' +
            (hasPhoto ? '<button type="button" data-id="' + escapeHtml(r.id) + '" class="btn-view-photo text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold">명세서 사진</button>' : '') +
            '<button type="button" data-id="' + escapeHtml(r.id) + '" class="btn-edit-record text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold">수정</button>' +
            '<button type="button" data-id="' + escapeHtml(r.id) + '" class="btn-delete-record text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-semibold">삭제</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function bindCardActionEvents(container) {
    if (!container) return;
    container.querySelectorAll('.btn-view-photo').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        var rec = state.records.find(function (r) { return r && r.id === id; });
        if (rec && rec.photoDataUrl) {
          openPhotoViewer(rec.photoDataUrl, '[' + rec.date + '] ' + rec.vendor + ' - ' + rec.summary, rec.id);
        }
      });
    });

    container.querySelectorAll('.btn-edit-record').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        startEditRecord(id);
      });
    });

    container.querySelectorAll('.btn-delete-record').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        deleteRecord(id);
      });
    });
  }

  function getSortedRecords() {
    return state.records.slice().sort(function (a, b) {
      var dA = (a && a.date) ? a.date : '';
      var dB = (b && b.date) ? b.date : '';
      if (dA !== dB) return dB.localeCompare(dA);
      var uA = (a && a.updatedAt) ? a.updatedAt : '';
      var uB = (b && b.updatedAt) ? b.updatedAt : '';
      return uB.localeCompare(uA);
    });
  }

  function renderHeaderSummary() {
    var currentMonth = getTodayStr().slice(0, 7);
    var monthRecords = state.records.filter(function (r) {
      return r && r.date && r.date.slice(0, 7) === currentMonth;
    });
    var monthSum = monthRecords.reduce(function (acc, cur) {
      return acc + (Number(cur.amount) || 0);
    }, 0);

    var countEl = document.getElementById('header-month-count');
    var totalEl = document.getElementById('header-month-total');
    if (countEl) countEl.textContent = monthRecords.length + '건';
    if (totalEl) totalEl.textContent = formatNumber(monthSum) + '원';
  }

  function renderRecentPreview() {
    var container = document.getElementById('recent-records-preview');
    if (!container) return;

    var sorted = getSortedRecords().slice(0, 5);
    if (sorted.length === 0) {
      container.innerHTML =
        '<div class="text-center py-8 text-xs sm:text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">' +
          '아직 등록된 구매이력이 없습니다.<br>위에서 거래명세서 사진을 찍거나 구매내역을 입력해보세요!' +
        '</div>';
      return;
    }

    container.innerHTML = sorted.map(createRecordCardHtml).join('');
    bindCardActionEvents(container);
  }

  function formatDateObj(d) {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function applyQuickDateRange(rangeKey) {
    var startEl = document.getElementById('filter-start-date');
    var endEl = document.getElementById('filter-end-date');
    var monthEl = document.getElementById('filter-month');
    if (!startEl || !endEl) return;

    if (monthEl) monthEl.value = '';

    var now = new Date();
    var endStr = formatDateObj(now);
    var startStr = endStr;

    if (rangeKey === 'today') {
      startStr = endStr;
    } else if (rangeKey === '7days') {
      var d7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      startStr = formatDateObj(d7);
    } else if (rangeKey === '1month') {
      var d30 = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      startStr = formatDateObj(d30);
    } else if (rangeKey === '3months') {
      var d90 = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      startStr = formatDateObj(d90);
    } else if (rangeKey === 'thisMonth') {
      var firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
      startStr = formatDateObj(firstThis);
    } else if (rangeKey === 'lastMonth') {
      var firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var lastLast = new Date(now.getFullYear(), now.getMonth(), 0);
      startStr = formatDateObj(firstLast);
      endStr = formatDateObj(lastLast);
    } else if (rangeKey === 'thisYear') {
      startStr = now.getFullYear() + '-01-01';
      endStr = now.getFullYear() + '-12-31';
    }

    startEl.value = startStr;
    endEl.value = endStr;

    document.querySelectorAll('.btn-quick-date-range').forEach(function (btn) {
      if (btn.getAttribute('data-range') === rangeKey) {
        btn.className = 'btn-quick-date-range text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 text-white border border-blue-600 font-bold transition shadow-2xs';
      } else {
        btn.className = 'btn-quick-date-range text-[11px] px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 font-bold transition';
      }
    });

    renderHistoryList();
  }

  function clearQuickDateRangeHighlight() {
    document.querySelectorAll('.btn-quick-date-range').forEach(function (btn) {
      btn.className = 'btn-quick-date-range text-[11px] px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 font-bold transition';
    });
  }

  function getFilteredRecords() {
    var kwEl = document.getElementById('filter-keyword');
    var catEl = document.getElementById('filter-category');
    var monthEl = document.getElementById('filter-month');
    var startEl = document.getElementById('filter-start-date');
    var endEl = document.getElementById('filter-end-date');

    var kw = (kwEl && kwEl.value.trim()) ? kwEl.value.trim().toLowerCase() : '';
    var cat = (catEl && catEl.value) ? catEl.value : 'ALL';
    var month = (monthEl && monthEl.value) ? monthEl.value : '';
    var startDate = (startEl && startEl.value) ? startEl.value : '';
    var endDate = (endEl && endEl.value) ? endEl.value : '';

    return getSortedRecords().filter(function (r) {
      if (!r) return false;
      if (cat !== 'ALL' && r.category !== cat) return false;
      if (month && (!r.date || r.date.slice(0, 7) !== month)) return false;
      if (startDate && (!r.date || r.date < startDate)) return false;
      if (endDate && (!r.date || r.date > endDate)) return false;
      if (kw) {
        var lineText = Array.isArray(r.lineItems)
          ? r.lineItems.map(function (li) { return li.name || ''; }).join(' ')
          : '';
        var haystack = [r.vendor, r.summary, r.memo, r.category, lineText].join(' ').toLowerCase();
        if (haystack.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  function formatMonthLabel(ym) {
    if (!ym || ym.length < 7) return '날짜 미지정';
    var parts = ym.split('-');
    return parts[0] + '년 ' + parseInt(parts[1], 10) + '월';
  }

  function renderMonthQuickTabs() {
    var tabBar = document.getElementById('month-quick-tabs');
    var monthInput = document.getElementById('filter-month');
    if (!tabBar) return;

    var currentSelectedMonth = (monthInput && monthInput.value) ? monthInput.value : '';
    var monthMap = {};

    state.records.forEach(function (r) {
      if (!r || !r.date || r.date.length < 7) return;
      var ym = r.date.slice(0, 7);
      if (!monthMap[ym]) monthMap[ym] = { count: 0, sum: 0 };
      monthMap[ym].count += 1;
      monthMap[ym].sum += Number(r.amount) || 0;
    });

    var sortedMonths = Object.keys(monthMap).sort(function (a, b) {
      return b.localeCompare(a);
    });

    var html =
      '<button type="button" data-ym="" class="month-quick-btn shrink-0 text-xs px-3 py-1.5 rounded-full font-bold border transition ' +
        (currentSelectedMonth === ''
          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200') +
      '">전체 월 보기 (' + state.records.length + '건)</button>';

    sortedMonths.forEach(function (ym) {
      var active = currentSelectedMonth === ym;
      html +=
        '<button type="button" data-ym="' + escapeHtml(ym) + '" class="month-quick-btn shrink-0 text-xs px-3 py-1.5 rounded-full font-bold border transition ' +
          (active
            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
            : 'bg-blue-50/60 text-blue-800 border-blue-200 hover:bg-blue-100') +
        '">📅 ' + escapeHtml(formatMonthLabel(ym)) + ' (' + monthMap[ym].count + '건 · ' + formatNumber(monthMap[ym].sum) + '원)</button>';
    });

    tabBar.innerHTML = html;

    tabBar.querySelectorAll('.month-quick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ym = btn.getAttribute('data-ym') || '';
        if (monthInput) monthInput.value = ym;
        var startEl = document.getElementById('filter-start-date');
        var endEl = document.getElementById('filter-end-date');
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';
        clearQuickDateRangeHighlight();
        renderHistoryList();
      });
    });
  }

  function renderHistoryList() {
    var container = document.getElementById('history-list-container');
    var countEl = document.getElementById('filtered-count');
    var sumEl = document.getElementById('filtered-sum');
    if (!container) return;

    renderMonthQuickTabs();

    var filtered = getFilteredRecords();
    var totalSum = filtered.reduce(function (acc, cur) {
      return acc + (Number(cur.amount) || 0);
    }, 0);

    if (countEl) countEl.textContent = filtered.length + '건';
    if (sumEl) sumEl.textContent = formatNumber(totalSum) + '원';

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="bg-white rounded-2xl p-10 text-center text-sm text-slate-400 border border-slate-200">' +
          '조건에 맞는 구매이력이 없습니다.' +
        '</div>';
      return;
    }

    // 월별(YYYY-MM)로 그룹핑하여 섹션 헤더와 월 소계를 명확히 구분하여 렌더링
    var groups = [];
    var groupMap = {};

    filtered.forEach(function (r) {
      var ym = (r && r.date && r.date.length >= 7) ? r.date.slice(0, 7) : '기타';
      if (!groupMap[ym]) {
        groupMap[ym] = { ym: ym, records: [], sum: 0 };
        groups.push(groupMap[ym]);
      }
      groupMap[ym].records.push(r);
      groupMap[ym].sum += Number(r.amount) || 0;
    });

    container.innerHTML = groups.map(function (g) {
      return (
        '<div class="space-y-2.5 pt-2 first:pt-0">' +
          '<div class="flex items-center justify-between bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-xs">' +
            '<div class="flex items-center gap-2">' +
              '<span class="text-sm">🗓️</span>' +
              '<span class="text-sm sm:text-base font-extrabold tracking-tight">' + escapeHtml(formatMonthLabel(g.ym)) + ' 구매내역</span>' +
              '<span class="text-xs px-2 py-0.5 rounded-full bg-white/15 text-slate-200 font-bold">' + g.records.length + '건</span>' +
            '</div>' +
            '<div class="text-xs sm:text-sm font-bold text-slate-300">' +
              '월 합계: <strong class="text-emerald-400 font-extrabold font-mono text-sm sm:text-base">' + formatNumber(g.sum) + '원</strong>' +
            '</div>' +
          '</div>' +
          '<div class="space-y-2.5 pl-0 sm:pl-1">' +
            g.records.map(createRecordCardHtml).join('') +
          '</div>' +
        '</div>'
      );
    }).join('');

    bindCardActionEvents(container);
  }

  function renderStatsView() {
    var totalAmount = 0;
    var copierAmount = 0;
    var pcAmount = 0;
    var vendorMap = {};
    var catMap = {};
    var monthStatMap = {};

    state.records.forEach(function (r) {
      if (!r) return;
      var amt = Number(r.amount) || 0;
      totalAmount += amt;
      if (r.category === '복사기 부품') copierAmount += amt;
      if (r.category === '컴퓨터 부품') pcAmount += amt;

      var vName = r.vendor || '기타';
      if (!vendorMap[vName]) vendorMap[vName] = { count: 0, amount: 0 };
      vendorMap[vName].count += 1;
      vendorMap[vName].amount += amt;

      var cName = r.category || '기타';
      if (!catMap[cName]) catMap[cName] = { count: 0, amount: 0 };
      catMap[cName].count += 1;
      catMap[cName].amount += amt;

      var ym = (r.date && r.date.length >= 7) ? r.date.slice(0, 7) : '기타';
      if (!monthStatMap[ym]) monthStatMap[ym] = { count: 0, amount: 0, copier: 0, pc: 0 };
      monthStatMap[ym].count += 1;
      monthStatMap[ym].amount += amt;
      if (r.category === '복사기 부품') monthStatMap[ym].copier += amt;
      if (r.category === '컴퓨터 부품') monthStatMap[ym].pc += amt;
    });

    var totalAmtEl = document.getElementById('stat-total-amount');
    var totalCntEl = document.getElementById('stat-total-count');
    var copierAmtEl = document.getElementById('stat-copier-amount');
    var copierRatioEl = document.getElementById('stat-copier-ratio');
    var pcAmtEl = document.getElementById('stat-pc-amount');
    var pcRatioEl = document.getElementById('stat-pc-ratio');

    if (totalAmtEl) totalAmtEl.textContent = formatNumber(totalAmount) + '원';
    if (totalCntEl) totalCntEl.textContent = '총 ' + state.records.length + '건 기록됨';
    if (copierAmtEl) copierAmtEl.textContent = formatNumber(copierAmount) + '원';
    if (copierRatioEl) {
      var cRatio = totalAmount > 0 ? Math.round((copierAmount / totalAmount) * 100) : 0;
      copierRatioEl.textContent = '전체의 ' + cRatio + '%';
    }
    if (pcAmtEl) pcAmtEl.textContent = formatNumber(pcAmount) + '원';
    if (pcRatioEl) {
      var pRatio = totalAmount > 0 ? Math.round((pcAmount / totalAmount) * 100) : 0;
      pcRatioEl.textContent = '전체의 ' + pRatio + '%';
    }

    // 거래처별 리스트
    var vendorListEl = document.getElementById('stat-vendor-list');
    if (vendorListEl) {
      var vendorEntries = Object.keys(vendorMap).map(function (k) {
        return { name: k, count: vendorMap[k].count, amount: vendorMap[k].amount };
      }).sort(function (a, b) { return b.amount - a.amount; });

      if (vendorEntries.length === 0) {
        vendorListEl.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">데이터가 없습니다.</div>';
      } else {
        vendorListEl.innerHTML = vendorEntries.map(function (v) {
          var pct = totalAmount > 0 ? Math.max(4, Math.round((v.amount / totalAmount) * 100)) : 0;
          return (
            '<div class="space-y-1">' +
              '<div class="flex justify-between text-xs">' +
                '<span class="font-bold text-slate-800">' + escapeHtml(v.name) + ' <span class="text-slate-400 font-normal">(' + v.count + '건)</span></span>' +
                '<span class="font-extrabold text-slate-900 font-mono">' + formatNumber(v.amount) + '원</span>' +
              '</div>' +
              '<div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">' +
                '<div class="bg-blue-600 h-full rounded-full" style="width:' + pct + '%"></div>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }
    }

    // 카테고리별 리스트
    var catListEl = document.getElementById('stat-category-list');
    if (catListEl) {
      var catEntries = Object.keys(catMap).map(function (k) {
        return { name: k, count: catMap[k].count, amount: catMap[k].amount };
      }).sort(function (a, b) { return b.amount - a.amount; });

      if (catEntries.length === 0) {
        catListEl.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">데이터가 없습니다.</div>';
      } else {
        catListEl.innerHTML = catEntries.map(function (c) {
          var pct = totalAmount > 0 ? Math.max(4, Math.round((c.amount / totalAmount) * 100)) : 0;
          return (
            '<div class="space-y-1">' +
              '<div class="flex justify-between text-xs">' +
                '<span class="font-bold text-slate-800">' + escapeHtml(c.name) + ' <span class="text-slate-400 font-normal">(' + c.count + '건)</span></span>' +
                '<span class="font-extrabold text-indigo-700 font-mono">' + formatNumber(c.amount) + '원</span>' +
              '</div>' +
              '<div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">' +
                '<div class="bg-indigo-600 h-full rounded-full" style="width:' + pct + '%"></div>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }
    }

    // 월별 리스트
    var monthlyListEl = document.getElementById('stat-monthly-list');
    if (monthlyListEl) {
      var monthEntries = Object.keys(monthStatMap).map(function (k) {
        return {
          ym: k,
          count: monthStatMap[k].count,
          amount: monthStatMap[k].amount,
          copier: monthStatMap[k].copier,
          pc: monthStatMap[k].pc
        };
      }).sort(function (a, b) { return b.ym.localeCompare(a.ym); });

      if (monthEntries.length === 0) {
        monthlyListEl.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">데이터가 없습니다.</div>';
      } else {
        monthlyListEl.innerHTML = monthEntries.map(function (m) {
          var pct = totalAmount > 0 ? Math.max(4, Math.round((m.amount / totalAmount) * 100)) : 0;
          return (
            '<div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">' +
              '<div class="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">' +
                '<span class="font-extrabold text-slate-900">🗓️ ' + escapeHtml(formatMonthLabel(m.ym)) + ' <span class="text-xs text-slate-500 font-semibold">(' + m.count + '건)</span></span>' +
                '<span class="font-extrabold text-blue-700 font-mono text-sm sm:text-base">' + formatNumber(m.amount) + '원</span>' +
              '</div>' +
              '<div class="flex flex-wrap gap-3 text-[11px] text-slate-500">' +
                '<span>🖨️ 복사기 부품: <strong class="text-slate-700">' + formatNumber(m.copier) + '원</strong></span>' +
                '<span>💻 컴퓨터 부품: <strong class="text-slate-700">' + formatNumber(m.pc) + '원</strong></span>' +
              '</div>' +
              '<div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">' +
                '<div class="bg-emerald-600 h-full rounded-full" style="width:' + pct + '%"></div>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }
    }
  }

  function renderAllViews() {
    renderCategoryOptionsAndChips();
    renderHeaderSummary();
    renderVendorChips();
    renderRecentPreview();
    renderHistoryList();
    renderStatsView();
  }

  // ==================== 엑셀(CSV) 내보내기 및 JSON 백업/복원 ====================
  function exportToCsv() {
    var filtered = getFilteredRecords();
    if (filtered.length === 0) {
      showToast('내보낼 구매내역이 없습니다.', 'error');
      return;
    }

    var headers = ['구매일자', '카테고리', '구매처(거래처)', '구매내용(품목요약)', '세부품목내역', '구매금액(원)', '결제구분', '메모'];
    var rows = filtered.map(function (r) {
      var detailStr = Array.isArray(r.lineItems)
        ? r.lineItems.map(function (li) {
            return (li.name || '') + '(' + (li.qty || 1) + '개/' + (li.amount || 0) + '원)';
          }).join('; ')
        : '';
      return [
        r.date || '',
        r.category || '',
        r.vendor || '',
        r.summary || '',
        detailStr,
        String(r.amount || 0),
        r.payment || '',
        r.memo || ''
      ].map(function (cell) {
        return '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(',');
    });

    var csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '부품구매이력_' + getTodayStr() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📊 엑셀(CSV) 파일이 다운로드되었습니다.');
  }

  function exportToJson() {
    var dataStr = JSON.stringify(state.records, null, 2);
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '구매이력백업_' + getTodayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('백업 파일(.json)이 저장되었습니다.');
  }

  function importFromJsonFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('올바른 백업 파일 형식이 아닙니다.');
        state.records = imported;
        saveLocalRecords();
        renderAllViews();
        showToast('✅ 총 ' + imported.length + '건의 구매내역이 복원되었습니다.');
      } catch (err) {
        showToast('복원 실패: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  // ==================== 샘플 데모 데이터 생성 ====================
  function seedSampleData() {
    var today = getTodayStr();
    var sampleRecords = [
      {
        id: 'pm_demo_1',
        date: today,
        category: '복사기 부품',
        vendor: '대원오피스(복사기부품)',
        summary: '캐논 IR ADV C3520 드럼유닛(검정) 외 2건',
        amount: 245000,
        payment: '세금계산서(월결제)',
        memo: '세무회계법인 정기점검 교체용',
        lineItems: [
          { name: '캐논 NPG-67 드럼유닛 (BK)', qty: 1, unitPrice: 125000, amount: 125000 },
          { name: '급지 픽업롤러 세트 (IR-C3520)', qty: 4, unitPrice: 15000, amount: 60000 },
          { name: '폐토너통 WT-202', qty: 2, unitPrice: 30000, amount: 60000 }
        ],
        photoDataUrl: '',
        updatedAt: new Date().toISOString()
      },
      {
        id: 'pm_demo_2',
        date: today,
        category: '컴퓨터 부품',
        vendor: '컴퓨존',
        summary: '삼성 DDR4 16GB 메모리 및 마이크론 SSD 500GB',
        amount: 198000,
        payment: '법인/사업자카드',
        memo: '거래처 사무용 PC 업그레이드 납품',
        lineItems: [
          { name: '삼성전자 DDR4-3200 16GB', qty: 2, unitPrice: 46000, amount: 92000 },
          { name: '마이크론 Crucial MX500 500GB SSD', qty: 1, unitPrice: 68000, amount: 68000 },
          { name: '마이크로닉스 Classic II 500W 파워', qty: 1, unitPrice: 38000, amount: 38000 }
        ],
        photoDataUrl: '',
        updatedAt: new Date().toISOString()
      },
      {
        id: 'pm_demo_3',
        date: today,
        category: '복사기 부품',
        vendor: '신도테크',
        summary: '신도리코 D420 정착기(퓨저) 어셈블리 1개',
        amount: 165000,
        payment: '세금계산서(월결제)',
        memo: '열롤러 손상 수리건',
        lineItems: [
          { name: '신도리코 D420 정착기 유닛', qty: 1, unitPrice: 165000, amount: 165000 }
        ],
        photoDataUrl: '',
        updatedAt: new Date().toISOString()
      }
    ];

    sampleRecords.forEach(function (sample) {
      var exists = state.records.some(function (r) { return r && r.id === sample.id; });
      if (!exists) {
        state.records.unshift(sample);
      }
    });

    saveLocalRecords();
    renderAllViews();
    showToast('✨ 복사기·컴퓨터 부품 샘플 구매내역 3건이 추가되었습니다!');
  }

  // ==================== 클라우드(Firebase Firestore) 실시간 연동 ====================
  function initCloudSync() {
    try {
      if (typeof firebase === 'undefined' || !window.PURCHASE_APP_FIREBASE_CONFIG) {
        updateSyncBadge(false, '로컬 저장 모드');
        return;
      }
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(window.PURCHASE_APP_FIREBASE_CONFIG);
      }
      state.db = firebase.firestore();
      subscribeWorkspaceCollection();
    } catch (e) {
      console.warn('Firebase Init Skipped:', e);
      updateSyncBadge(false, '로컬 저장 모드');
    }
  }

  function subscribeWorkspaceCollection() {
    if (!state.db) return;
    try {
      if (state.unsubscribeSnapshot) {
        state.unsubscribeSnapshot();
        state.unsubscribeSnapshot = null;
      }

      var colRef = state.db
        .collection('purchase_manager_workspaces')
        .doc(state.workspaceCode)
        .collection('records');

      state.unsubscribeSnapshot = colRef.onSnapshot(
        function (snapshot) {
          state.isCloudConnected = true;
          updateSyncBadge(true, '클라우드 연동중');

          var changed = false;
          snapshot.docChanges().forEach(function (change) {
            var docData = change.doc.data();
            if (!docData || !docData.id) return;

            var idx = state.records.findIndex(function (r) { return r && r.id === docData.id; });
            if (change.type === 'removed') {
              if (idx !== -1) {
                state.records.splice(idx, 1);
                changed = true;
              }
            } else {
              if (idx === -1) {
                state.records.push(docData);
                changed = true;
              } else {
                var localTime = state.records[idx].updatedAt || '';
                var remoteTime = docData.updatedAt || '';
                if (remoteTime > localTime) {
                  state.records[idx] = docData;
                  changed = true;
                }
              }
            }
          });

          if (changed) {
            saveLocalRecords();
            renderAllViews();
          }
        },
        function (err) {
          console.warn('Firestore snapshot fallback to local:', err);
          state.isCloudConnected = false;
          updateSyncBadge(false, '로컬 저장됨');
        }
      );
    } catch (e) {
      updateSyncBadge(false, '로컬 저장됨');
    }
  }

  function syncRecordToCloud(recordObj) {
    if (!state.db || !recordObj || !recordObj.id) return;
    try {
      state.db
        .collection('purchase_manager_workspaces')
        .doc(state.workspaceCode)
        .collection('records')
        .doc(recordObj.id)
        .set(recordObj)
        .catch(function (err) {
          console.warn('Cloud sync set warning:', err);
        });
    } catch (e) {
      // ignore cloud errors so UI never breaks
    }
  }

  function deleteRecordFromCloud(recordId) {
    if (!state.db || !recordId) return;
    try {
      state.db
        .collection('purchase_manager_workspaces')
        .doc(state.workspaceCode)
        .collection('records')
        .doc(recordId)
        .delete()
        .catch(function () {});
    } catch (e) {
      // ignore
    }
  }

  function updateSyncBadge(isOnline, labelText) {
    var dot = document.getElementById('sync-status-dot');
    var txt = document.getElementById('sync-status-text');
    var aiBadge = document.getElementById('ai-badge-status');

    if (dot) {
      dot.className = 'w-2 h-2 rounded-full ' + (isOnline ? 'bg-emerald-400' : 'bg-amber-400');
    }
    if (txt) {
      txt.textContent = labelText || '설정/연동';
    }
    if (aiBadge) {
      if (state.geminiApiKey) {
        aiBadge.textContent = '✨ Gemini AI 활성';
        aiBadge.className = 'text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200';
      } else {
        aiBadge.textContent = '⚙️ AI 키 설정 필요';
        aiBadge.className = 'text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200 cursor-pointer';
      }
    }
  }

  // ==================== 탭 전환 및 모달 조작 (최우선 보호) ====================
  function switchTab(tabName) {
    var buttons = document.querySelectorAll('.tab-nav-btn');
    buttons.forEach(function (btn) {
      var target = btn.getAttribute('data-tab');
      if (target === tabName) {
        btn.className = 'tab-nav-btn flex-1 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 border-blue-500 text-blue-400 bg-slate-800/50 flex items-center justify-center gap-1.5 shrink-0 transition';
      } else {
        btn.className = 'tab-nav-btn flex-1 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 shrink-0 transition';
      }
    });

    var panels = {
      register: document.getElementById('tab-register'),
      history: document.getElementById('tab-history'),
      stats: document.getElementById('tab-stats')
    };

    Object.keys(panels).forEach(function (k) {
      if (!panels[k]) return;
      if (k === tabName) {
        panels[k].classList.remove('hidden');
      } else {
        panels[k].classList.add('hidden');
      }
    });

    if (tabName === 'history') renderHistoryList();
    if (tabName === 'stats') renderStatsView();
  }

  function openSettingsModal() {
    var modal = document.getElementById('modal-settings');
    var keyInput = document.getElementById('input-gemini-key');
    var wsInput = document.getElementById('input-workspace-code');
    if (keyInput) keyInput.value = state.geminiApiKey || '';
    if (wsInput) wsInput.value = state.workspaceCode || 'default-parts-room';
    if (modal) modal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    var modal = document.getElementById('modal-settings');
    if (modal) modal.classList.add('hidden');
  }

  // ==================== 초기화 (DOMContentLoaded 최상단 UI 이벤트 보호) ====================
  document.addEventListener('DOMContentLoaded', function () {
    // 1. 탭 네비게이션 및 모달 닫기 등 기본 UI 이벤트 최우선 등록
    try {
      document.querySelectorAll('.tab-nav-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          switchTab(btn.getAttribute('data-tab'));
        });
      });

      var btnGoAllHistory = document.getElementById('btn-go-all-history');
      if (btnGoAllHistory) {
        btnGoAllHistory.addEventListener('click', function () {
          switchTab('history');
        });
      }

      var btnOpenSettings = document.getElementById('btn-open-settings');
      if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);

      var aiBadge = document.getElementById('ai-badge-status');
      if (aiBadge) aiBadge.addEventListener('click', openSettingsModal);

      var btnCloseSettings = document.getElementById('btn-close-settings');
      if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);

      var btnClosePhotoModal = document.getElementById('btn-close-photo-modal');
      if (btnClosePhotoModal) {
        btnClosePhotoModal.addEventListener('click', function () {
          var m = document.getElementById('modal-photo-viewer');
          if (m) m.classList.add('hidden');
        });
      }

      // 카테고리 관리 모달 열기/닫기/추가/초기화 이벤트
      var openCategoryModal = function () {
        renderCategoryManagerModalList();
        var m = document.getElementById('modal-category-manager');
        if (m) m.classList.remove('hidden');
      };
      var closeCategoryModal = function () {
        var m = document.getElementById('modal-category-manager');
        if (m) m.classList.add('hidden');
      };

      var btnOpenCatModal = document.getElementById('btn-open-category-modal');
      var btnCloseCatModal = document.getElementById('btn-close-category-modal');
      var btnDoneCatModal = document.getElementById('btn-done-category-modal');
      if (btnOpenCatModal) btnOpenCatModal.addEventListener('click', openCategoryModal);
      if (btnCloseCatModal) btnCloseCatModal.addEventListener('click', closeCategoryModal);
      if (btnDoneCatModal) btnDoneCatModal.addEventListener('click', closeCategoryModal);

      var handleAddNewCategory = function () {
        var inp = document.getElementById('input-new-category-name');
        if (!inp) return;
        var val = inp.value.trim();
        if (!val) {
          showToast('추가할 카테고리 이름을 입력해주세요.', 'error');
          return;
        }
        if (state.categories.indexOf(val) !== -1) {
          showToast('이미 등록된 카테고리입니다.', 'error');
          return;
        }
        state.categories.push(val);
        inp.value = '';
        saveCategories();
        renderCategoryManagerModalList();
        renderAllViews();
        var selectInput = document.getElementById('input-category');
        if (selectInput) selectInput.value = val;
        showToast('➕ [' + val + '] 카테고리가 추가되었습니다!');
      };

      var btnAddCategory = document.getElementById('btn-add-category');
      var inputNewCatName = document.getElementById('input-new-category-name');
      if (btnAddCategory) btnAddCategory.addEventListener('click', handleAddNewCategory);
      if (inputNewCatName) {
        inputNewCatName.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAddNewCategory();
          }
        });
      }

      var btnResetDefaultCats = document.getElementById('btn-reset-default-categories');
      if (btnResetDefaultCats) {
        btnResetDefaultCats.addEventListener('click', function () {
          if (!confirm('카테고리 목록을 기본값(복사기 부품, 컴퓨터 부품 등 5개)으로 초기화하시겠습니까?')) return;
          state.categories = DEFAULT_CATEGORIES.slice();
          saveCategories();
          renderCategoryManagerModalList();
          renderAllViews();
          showToast('기본 카테고리로 복원되었습니다.');
        });
      }
    } catch (uiErr) {
      console.error('UI Navigation Binding Error:', uiErr);
    }

    // 2. 폼 기본값 및 빠른 칩 이벤트 등록
    try {
      var dateInput = document.getElementById('input-date');
      if (dateInput && !dateInput.value) {
        dateInput.value = getTodayStr();
      }

      // 카테고리 빠른 선택 칩
      document.querySelectorAll('.category-quick-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var catSelect = document.getElementById('input-category');
          if (catSelect) catSelect.value = chip.getAttribute('data-cat');
        });
      });

      // 자주 쓰는 부품 키워드 칩
      document.querySelectorAll('.part-quick-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var summaryInput = document.getElementById('input-summary');
          if (!summaryInput) return;
          var partName = chip.getAttribute('data-part') || '';
          summaryInput.value = summaryInput.value.trim()
            ? (summaryInput.value.trim() + ', ' + partName)
            : partName;
          summaryInput.focus();
        });
      });

      // 금액 입력 시 천단위 콤마 자동 포맷팅
      var amountInput = document.getElementById('input-amount');
      if (amountInput) {
        amountInput.addEventListener('input', function (e) {
          var num = parseAmount(e.target.value);
          e.target.value = num > 0 ? formatNumber(num) : '';
        });
      }

      // 세부 품목 줄 추가 버튼
      var btnAddItemRow = document.getElementById('btn-add-item-row');
      if (btnAddItemRow) {
        btnAddItemRow.addEventListener('click', function () {
          state.currentLineItems.push({ name: '', qty: 1, unitPrice: 0, amount: 0 });
          renderLineItems();
        });
      }

      // 사진 촬영 / 갤러리 선택 이벤트 (세로 사진은 자동으로 가로 회전)
      var handleFileSelect = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        compressImageFile(file, function (err, dataUrl, w, h, wasRotated) {
          if (err) {
            showToast(err.message, 'error');
            return;
          }
          state.currentPhotoDataUrl = dataUrl;
          updatePhotoPreviewUI();
          var sizeInfo = document.getElementById('photo-size-info');
          if (sizeInfo) {
            var kb = Math.round((dataUrl.length * 3) / 4 / 1024);
            sizeInfo.textContent = w + 'x' + h + 'px (' + kb + 'KB' + (wasRotated ? ' · 가로 자동회전됨' : ' 최적화됨') + ')';
          }
          if (wasRotated) {
            showToast('📸 명세서 사진을 보기 편하게 가로 방향으로 자동 회전했습니다!');
          } else {
            showToast('📸 사진이 첨부되었습니다. [AI 자동 입력] 또는 [사진만 바로 저장]을 선택하세요.');
          }
        });
      };

      var camInput = document.getElementById('input-camera-photo');
      var galInput = document.getElementById('input-gallery-photo');
      if (camInput) camInput.addEventListener('change', handleFileSelect);
      if (galInput) galInput.addEventListener('change', handleFileSelect);

      var previewImg = document.getElementById('photo-preview-img');
      if (previewImg) {
        previewImg.addEventListener('click', function () {
          openPhotoViewer(state.currentPhotoDataUrl, '첨부된 거래명세서/부품 사진', null);
        });
      }

      // 미리보기 좌/우 회전 버튼
      var handlePreviewRotate = function (deg) {
        if (!state.currentPhotoDataUrl) return;
        rotateDataUrlImage(state.currentPhotoDataUrl, deg, function (rotatedUrl, rw, rh) {
          state.currentPhotoDataUrl = rotatedUrl;
          updatePhotoPreviewUI();
          var sizeInfo = document.getElementById('photo-size-info');
          if (sizeInfo && rw && rh) {
            var kb = Math.round((rotatedUrl.length * 3) / 4 / 1024);
            sizeInfo.textContent = rw + 'x' + rh + 'px (' + kb + 'KB · 회전됨)';
          }
        });
      };

      var btnRotateLeft = document.getElementById('btn-rotate-left');
      var btnRotateRight = document.getElementById('btn-rotate-right');
      if (btnRotateLeft) btnRotateLeft.addEventListener('click', function () { handlePreviewRotate(-90); });
      if (btnRotateRight) btnRotateRight.addEventListener('click', function () { handlePreviewRotate(90); });

      // 확대 모달 내 좌/우 회전 버튼 (저장된 내역 사진도 회전 즉시 반영)
      var handleModalRotate = function (deg) {
        var modalImg = document.getElementById('modal-photo-img');
        if (!modalImg || !modalImg.src) return;
        rotateDataUrlImage(modalImg.src, deg, function (rotatedUrl) {
          modalImg.src = rotatedUrl;
          if (currentViewingRecordId) {
            var rec = state.records.find(function (r) { return r && r.id === currentViewingRecordId; });
            if (rec) {
              rec.photoDataUrl = rotatedUrl;
              rec.updatedAt = new Date().toISOString();
              saveLocalRecords();
              syncRecordToCloud(rec);
              renderAllViews();
            }
          } else if (state.currentPhotoDataUrl) {
            state.currentPhotoDataUrl = rotatedUrl;
            updatePhotoPreviewUI();
          }
        });
      };

      var btnModalRotateLeft = document.getElementById('btn-modal-rotate-left');
      var btnModalRotateRight = document.getElementById('btn-modal-rotate-right');
      if (btnModalRotateLeft) btnModalRotateLeft.addEventListener('click', function () { handleModalRotate(-90); });
      if (btnModalRotateRight) btnModalRotateRight.addEventListener('click', function () { handleModalRotate(90); });

      var btnRemovePhoto = document.getElementById('btn-remove-photo');
      if (btnRemovePhoto) {
        btnRemovePhoto.addEventListener('click', function () {
          state.currentPhotoDataUrl = '';
          updatePhotoPreviewUI();
        });
      }

      // AI OCR 실행 버튼
      var btnRunAiOcr = document.getElementById('btn-run-ai-ocr');
      if (btnRunAiOcr) {
        btnRunAiOcr.addEventListener('click', analyzeInvoiceWithGemini);
      }

      // 사진만 바로 저장 버튼
      var btnQuickPhotoSave = document.getElementById('btn-quick-photo-save');
      if (btnQuickPhotoSave) {
        btnQuickPhotoSave.addEventListener('click', function () {
          savePurchaseRecord(true);
        });
      }

      // 폼 제출 저장
      var purchaseForm = document.getElementById('purchase-form');
      if (purchaseForm) {
        purchaseForm.addEventListener('submit', function (e) {
          e.preventDefault();
          savePurchaseRecord(false);
        });
      }

      // 폼 초기화
      var btnResetForm = document.getElementById('btn-reset-form');
      if (btnResetForm) {
        btnResetForm.addEventListener('click', resetPurchaseForm);
      }

      // 검색 필터 및 기간 지정 이벤트
      var filterKw = document.getElementById('filter-keyword');
      var filterCat = document.getElementById('filter-category');
      var filterMonth = document.getElementById('filter-month');
      var filterStartDate = document.getElementById('filter-start-date');
      var filterEndDate = document.getElementById('filter-end-date');

      if (filterKw) filterKw.addEventListener('input', renderHistoryList);
      if (filterCat) filterCat.addEventListener('change', renderHistoryList);
      if (filterMonth) {
        filterMonth.addEventListener('change', function () {
          if (filterMonth.value) {
            if (filterStartDate) filterStartDate.value = '';
            if (filterEndDate) filterEndDate.value = '';
            clearQuickDateRangeHighlight();
          }
          renderHistoryList();
        });
      }
      if (filterStartDate) {
        filterStartDate.addEventListener('change', function () {
          if (filterStartDate.value && filterMonth) filterMonth.value = '';
          clearQuickDateRangeHighlight();
          renderHistoryList();
        });
      }
      if (filterEndDate) {
        filterEndDate.addEventListener('change', function () {
          if (filterEndDate.value && filterMonth) filterMonth.value = '';
          clearQuickDateRangeHighlight();
          renderHistoryList();
        });
      }

      document.querySelectorAll('.btn-quick-date-range').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var rangeKey = btn.getAttribute('data-range');
          if (rangeKey) applyQuickDateRange(rangeKey);
        });
      });

      var btnClearFilters = document.getElementById('btn-clear-filters');
      if (btnClearFilters) {
        btnClearFilters.addEventListener('click', function () {
          if (filterKw) filterKw.value = '';
          if (filterCat) filterCat.value = 'ALL';
          if (filterMonth) filterMonth.value = '';
          if (filterStartDate) filterStartDate.value = '';
          if (filterEndDate) filterEndDate.value = '';
          clearQuickDateRangeHighlight();
          renderHistoryList();
        });
      }

      // 엑셀 다운로드 & 백업/복원
      var btnExportCsv = document.getElementById('btn-export-csv');
      if (btnExportCsv) btnExportCsv.addEventListener('click', exportToCsv);

      var btnExportJson = document.getElementById('btn-export-json');
      if (btnExportJson) btnExportJson.addEventListener('click', exportToJson);

      var inputImportJson = document.getElementById('input-import-json');
      if (inputImportJson) {
        inputImportJson.addEventListener('change', function (e) {
          var f = e.target.files && e.target.files[0];
          if (f) importFromJsonFile(f);
          e.target.value = '';
        });
      }

      // 스마트폰 접속 링크 복사 버튼
      var btnCopySyncLink = document.getElementById('btn-copy-sync-link');
      if (btnCopySyncLink) {
        btnCopySyncLink.addEventListener('click', function () {
          var wsInput = document.getElementById('input-workspace-code');
          var code = (wsInput && wsInput.value.trim()) ? wsInput.value.trim() : state.workspaceCode;
          var baseUrl = window.location.origin + window.location.pathname;
          var shareUrl = baseUrl + '?room=' + encodeURIComponent(code);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(function () {
              showToast('🔗 연동 링크가 복사되었습니다! 카톡 나에게 보내기로 스마트폰에서 열어보세요.', 'info');
            }).catch(function () {
              prompt('아래 주소를 복사하여 스마트폰에서 접속하세요:', shareUrl);
            });
          } else {
            prompt('아래 주소를 복사하여 스마트폰에서 접속하세요:', shareUrl);
          }
        });
      }

      // API 키 연결 테스트 버튼
      var btnTestGeminiKey = document.getElementById('btn-test-gemini-key');
      if (btnTestGeminiKey) {
        btnTestGeminiKey.addEventListener('click', function () {
          var keyInput = document.getElementById('input-gemini-key');
          var resultBox = document.getElementById('gemini-key-test-result');
          var rawKey = keyInput ? keyInput.value : '';
          var cleanKey = String(rawKey || '').replace(/\s+/g, '');
          if (keyInput) keyInput.value = cleanKey;

          if (!cleanKey) {
            if (resultBox) {
              resultBox.className = 'text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700 font-bold';
              resultBox.textContent = '❌ 먼저 AIzaSy... 로 시작하는 API 키를 입력해주세요.';
              resultBox.classList.remove('hidden');
            }
            return;
          }

          btnTestGeminiKey.disabled = true;
          btnTestGeminiKey.textContent = '⏳ 확인 중...';
          if (resultBox) {
            resultBox.className = 'text-xs px-3 py-2 rounded-lg border bg-slate-50 border-slate-200 text-slate-600';
            resultBox.textContent = '구글 Gemini 서버와 통신하여 사용 가능한 AI 모델을 확인하고 있습니다...';
            resultBox.classList.remove('hidden');
          }

          resolveAvailableModels(cleanKey)
            .then(function (models) {
              var testReq = {
                contents: [{ parts: [{ text: 'OK' }] }]
              };
              return callGeminiWithModels(cleanKey, testReq, models, 0).then(function () {
                return models[0];
              });
            })
            .then(function (activeModel) {
              state.geminiApiKey = cleanKey;
              try { localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, cleanKey); } catch (e) {}
              updateSyncBadge(state.isCloudConnected, state.isCloudConnected ? '클라우드 연동중' : '로컬 저장됨');
              if (resultBox) {
                resultBox.className = 'text-xs px-3 py-2 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800 font-bold';
                resultBox.textContent = '✅ 연결 성공! (' + activeModel + ' 모델 활성화됨 & 자동 저장 완료)';
              }
              showToast('✅ Gemini API 키 연결 테스트 성공!', 'info');
            })
            .catch(function (err) {
              if (resultBox) {
                resultBox.className = 'text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700 font-bold';
                resultBox.textContent = '❌ ' + err.message + ' (키에 오타나 공백이 없는지, AI Studio에서 발급된 키인지 확인해주세요)';
              }
            })
            .finally(function () {
              btnTestGeminiKey.disabled = false;
              btnTestGeminiKey.textContent = '🔍 키 연결 테스트';
            });
        });
      }

      // 설정 저장 버튼
      var btnSaveSettings = document.getElementById('btn-save-settings');
      if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', function () {
          var keyInput = document.getElementById('input-gemini-key');
          var wsInput = document.getElementById('input-workspace-code');
          state.geminiApiKey = keyInput ? String(keyInput.value || '').replace(/\s+/g, '') : '';
          state.workspaceCode = (wsInput && wsInput.value.trim()) ? wsInput.value.trim() : 'default-parts-room';

          try {
            localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, state.geminiApiKey);
            localStorage.setItem(STORAGE_KEYS.WORKSPACE, state.workspaceCode);
          } catch (e) {}

          closeSettingsModal();
          subscribeWorkspaceCollection();
          updateSyncBadge(state.isCloudConnected, state.isCloudConnected ? '클라우드 연동중' : '로컬 저장됨');
          showToast('⚙️ 설정이 저장되었습니다.');
        });
      }
    } catch (formErr) {
      console.error('Form Binding Error:', formErr);
    }

    // 3. 데이터 로드 및 클라우드 초기화
    try {
      loadLocalData();
      renderAllViews();
      initCloudSync();
    } catch (dataErr) {
      console.error('Data Init Error:', dataErr);
    }
  });

  window.PurchaseManagerApp = {
    switchTab: switchTab,
    seedSampleData: seedSampleData
  };
})();
