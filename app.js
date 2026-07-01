// app.js - State management, calculations, and UI rendering

// --- State and Constants ---
let state = {
    customers: [],
    inspections: [],
    parts: []
};

// Storage keys
const STORAGE_KEY = 'smartcounter_data';
const FIREBASE_CONFIG_KEY = 'smartcounter_firebase_config';
const INVOICE_CONFIG_KEY = 'smartcounter_invoice_config';

const defaultInvoiceConfig = {
    regNo: '210-01-60844',
    name: '하영통신',
    ceo: '공종훈',
    stampText: '하영통신',
    address: '서울시 성북구 삼선교로16길 35',
    bizType: '도소매, 서비스',
    bizItem: '사무기기 임대, 수리',
    account: '국민은행 023-24-0270-172',
    accHolder: '공종훈(하영통신)',
    greeting: '위와 같이 계산하오니 청구하여 주시기 바랍니다.',
    theme: 'blue',
    templateHtml: '',
    customCss: ''
};

const defaultInvoiceTemplateHTML = `
<div class="receipt-container">
    <div class="receipt-title">
        {{TITLE}} <span>(공급받는자 보관용)</span>
    </div>

    <div class="info-section">
        <div class="buyer-info-table">
            <div class="buyer-date-row">
                {{ISSUE_DATE}}
            </div>
            <div class="buyer-name-row">
                <div class="buyer-name-cell">
                    {{CUSTOMER_NAME}}
                </div>
                <div class="buyer-suffix-cell">
                    귀하
                </div>
            </div>
            <div class="buyer-msg-row">
                아래와 같이 계산합니다.
            </div>
        </div>
        
        <div class="seller-info">
            <table class="receipt-table seller-table" style="border: none; border-bottom: none; width: 100%;">
                <tr>
                    <th rowspan="4" style="border-top: none; border-left: none; width: 10%;">공<br><br>급<br><br>자</th>
                    <th style="border-top: none; width: 22%;">등록번호</th>
                    <td colspan="3" style="border-top: none; border-right: none; font-weight: bold; letter-spacing: 0.5px;">{{SUPPLIER_REG_NO}}</td>
                </tr>
                <tr>
                    <th style="width: 22%;">상호</th>
                    <td style="width: 28%; text-align: left; padding-left: 8px;">{{SUPPLIER_NAME}}</td>
                    <th style="width: 15%;">성명</th>
                    <td style="text-align: center;">{{SUPPLIER_CEO}}</td>
                    <td style="border-right: none; position: relative; width: 45px; text-align: center; font-size: 0.8rem; color: #475569;">
                        (인)
                        <div class="ti-stamp" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 35px; height: 35px; border: 1.5px solid #ef4444 !important; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-sizing: border-box; background: transparent; pointer-events: none;">
                            <div class="ti-stamp-inner" style="font-family: 'Gungsuh', serif; color: #ef4444 !important; font-size: 0.65rem; font-weight: bold; text-align: center; line-height: 1.1; letter-spacing: -1px;">
                                {{SUPPLIER_STAMP}}
                            </div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <th>사업장<br>주소</th>
                    <td colspan="3" style="border-right: none; text-align: left; padding-left: 8px;">{{SUPPLIER_ADDRESS}}</td>
                </tr>
                <tr>
                    <th>업태</th>
                    <td style="text-align: left; padding-left: 8px; font-size: 0.8rem; line-height: 1.2;">{{SUPPLIER_BIZ_TYPE}}</td>
                    <th>종목</th>
                    <td style="border-right: none; text-align: left; padding-left: 8px; font-size: 0.8rem; line-height: 1.2;">{{SUPPLIER_BIZ_ITEM}}</td>
                </tr>
            </table>
        </div>
    </div>

    <div class="total-amount-row">
        <div class="label">합 계 금 액</div>
        <div class="korean-amount">{{TOTAL_AMOUNT_TEXT}}</div>
        <div class="currency-symbol">(₩</div>
        <div class="number-amount">{{TOTAL_AMOUNT_NUM}}</div>
        <div class="close-bracket">)</div>
    </div>

    <table class="receipt-table items-table" style="border-left: none; border-right: none; width: 100%;">
        <thead>
            <tr>
                <th style="width: 20%; border-left: none;">품 목</th>
                <th style="width: 15%;">규 격</th>
                <th style="width: 10%;">수 량</th>
                <th style="width: 15%;">단 가</th>
                <th style="width: 25%;">공 급 가 액</th>
                <th style="width: 15%; border-right: none;">VAT</th>
            </tr>
        </thead>
        <tbody>
            {{ITEMS_BODY}}
        </tbody>
    </table>

    <div class="ti-counter-area">
        {{COUNTER_AREA}}
    </div>

    <div class="footer-info">
        <div class="footer-account">&nbsp;&nbsp;입금계좌 : {{FOOTER_ACCOUNT}}</div>
        <div class="footer-holder">&nbsp;&nbsp;예금주 : {{FOOTER_ACC_HOLDER}}</div>
    </div>
</div>
`;

let invoiceConfig = {...defaultInvoiceConfig};

function getLocalDateString(date = new Date()) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date';
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

// Navigation & Active View
let currentView = 'dashboard';

// Chart instance reference
let usageChart = null;

// Firebase State Variables
let db = null;
let isCloudMode = false;
let customersUnsubscribe = null;
let inspectionsUnsubscribe = null;
let partsUnsubscribe = null;
let settingsUnsubscribe = null;

// Local cache to prevent remote snapshots from dropping newly saved inspections during race condition sync
let lastSavedInspections = {};

// Global state for uploaded serial photo Base64
let currentSerialImageBase64 = null;
let currentInspectionParts = [];

// --- Demo Data ---
const demoData = {
    customers: [],
    inspections: [],
    parts: []
};

// --- Toast Notification ---
function showToast(message, type = 'info') {
    const existing = document.getElementById('appToast');
    if (existing) existing.remove();

    const colors = { success: '#10b981', error: '#ef4444', info: '#6366f1', warning: '#f59e0b' };
    const icons  = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };

    const toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `
        position:fixed; bottom:1.5rem; right:1.5rem; z-index:99999;
        background:#1e293b; border:1px solid ${colors[type]};
        color:#f1f5f9; padding:0.75rem 1.1rem; border-radius:10px;
        display:flex; align-items:center; gap:0.6rem;
        box-shadow:0 4px 24px rgba(0,0,0,0.35);
        font-size:0.875rem; font-weight:500;
        animation: toastIn 0.3s ease;
        max-width: 360px;
    `;
    toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]};"></i> ${message}`;
    document.body.appendChild(toast);

    // Add keyframe if not already added
    if (!document.getElementById('toastKeyframe')) {
        const style = document.createElement('style');
        style.id = 'toastKeyframe';
        style.textContent = '@keyframes toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }';
        document.head.appendChild(style);
    }

    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function applyCustomCss() {
    let styleTag = document.getElementById('invoiceCustomCssTag');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'invoiceCustomCssTag';
        document.head.appendChild(styleTag);
    }
    styleTag.textContent = (invoiceConfig && invoiceConfig.customCss) ? invoiceConfig.customCss : '';
}

// Load Invoice Configuration from localStorage
function loadInvoiceConfig() {
    const saved = localStorage.getItem(INVOICE_CONFIG_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                invoiceConfig = { ...defaultInvoiceConfig, ...parsed };
            } else {
                invoiceConfig = { ...defaultInvoiceConfig };
            }
        } catch (e) {
            console.error('명세서 설정 파싱 실패:', e);
            invoiceConfig = { ...defaultInvoiceConfig };
        }
    } else {
        invoiceConfig = { ...defaultInvoiceConfig };
    }
    invoiceConfig = { ...defaultInvoiceConfig, ...invoiceConfig };
    applyCustomCss();
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadInvoiceConfig();
    initFirebase();
    setupEventListeners();
    initDateInputs();
    switchView('dashboard');
});

// Load state from localStorage or seed demo data
function loadData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            state = JSON.parse(data);
            // Verify structure
            if (!state.customers) state.customers = [];
            if (!state.inspections) state.inspections = [];
            if (!state.parts) state.parts = [];
        } catch (e) {
            console.error('Failed to parse localStorage data', e);
            loadDemoData();
        }
    } else {
        loadDemoData();
    }
    migrateState();
}

function migrateState() {
    let migrated = false;
    
    // Migrate customers
    state.customers.forEach(c => {
        let customerMigrated = false;

        // 1. If devices is an object (Map) instead of an array, convert it to array
        if (c.devices && typeof c.devices === 'object' && !Array.isArray(c.devices)) {
            try {
                c.devices = Object.keys(c.devices)
                    .sort((a, b) => {
                        const numA = parseInt(a, 10);
                        const numB = parseInt(b, 10);
                        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                        return a.localeCompare(b);
                    })
                    .map(key => c.devices[key]);
                customerMigrated = true;
            } catch (err) {
                console.error("devices Map to Array conversion failed for customer", c.name, err);
                c.devices = [];
            }
        }

        // 2. If devices is missing or empty, assign default device
        if (!c.devices || !Array.isArray(c.devices) || c.devices.length === 0) {
            c.devices = [{
                id: c.id + '-dev1',
                type: '복사기',
                name: '복사기 기본',
                model: c.copierModel || '미지정',
                serial: c.serialNumber || '',
                image: c.serialImage || '',
                price: c.contractAmount || 0,
                contractBw: c.contractBw || 0,
                contractColor: c.contractColor || 0,
                overBwPrice: c.overBwPrice || 0,
                overColorPrice: c.overColorPrice || 0
            }];
            // Cleanup old properties
            delete c.copierModel;
            delete c.serialNumber;
            delete c.serialImage;
            
            customerMigrated = true;
        }

        // 3. Migrate global billing to first device if exists
        if (c.contractAmount !== undefined || c.contractBw !== undefined || c.overBwPrice !== undefined) {
            if (c.devices && c.devices.length > 0) {
                if (c.devices[0].price === undefined || c.devices[0].price === 0) c.devices[0].price = c.contractAmount || 0;
                if (c.devices[0].contractBw === undefined) c.devices[0].contractBw = c.contractBw || 0;
                if (c.devices[0].contractColor === undefined) c.devices[0].contractColor = c.contractColor || 0;
                if (c.devices[0].overBwPrice === undefined) c.devices[0].overBwPrice = c.overBwPrice || 0;
                if (c.devices[0].overColorPrice === undefined) c.devices[0].overColorPrice = c.overColorPrice || 0;
            }
            
            delete c.contractAmount;
            delete c.contractBw;
            delete c.contractColor;
            delete c.overBwPrice;
            delete c.overColorPrice;

            customerMigrated = true;
        }

        // If this customer was migrated, save it back to Firestore and mark global migrated flag
        if (customerMigrated) {
            migrated = true;
            if (isCloudMode && db) {
                db.collection('customers').doc(c.id).set(c, {merge: true});
            }
        }
    });

    // Migrate inspections
    state.inspections.forEach(i => {
        let localMigrated = false;

        // Ensure date is a valid string
        if (!i.date) {
            i.date = getLocalDateString();
            localMigrated = true;
            migrated = true;
        } else if (typeof i.date !== 'string') {
            if (i.date.toDate && typeof i.date.toDate === 'function') {
                i.date = getLocalDateString(i.date.toDate());
            } else {
                try {
                    const parsedDate = getLocalDateString(new Date(i.date));
                    if (parsedDate === 'Invalid Date') {
                        i.date = getLocalDateString();
                    } else {
                        i.date = parsedDate;
                    }
                } catch (e) {
                    i.date = getLocalDateString();
                }
            }
            localMigrated = true;
            migrated = true;
        }

        if (!i.deviceId) {
            i.deviceId = i.customerId + '-dev1';
            localMigrated = true;
            migrated = true;
        }

        if (localMigrated && isCloudMode && db) {
            db.collection('inspections').doc(i.id).set(i, {merge: true});
        }
    });

    if (migrated && !isCloudMode) {
        saveToStorage();
    }
}

function loadDemoData() {
    state = JSON.parse(JSON.stringify(demoData)); // Deep clone
    if (!state.parts) state.parts = [];
    saveToStorage();
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Navigation ---
function setupEventListeners() {
    // Sidebar view toggle
    document.querySelectorAll('.sidebar .nav-links li').forEach(li => {
        li.addEventListener('click', (e) => {
            e.preventDefault();
            const view = li.getAttribute('data-view');
            switchView(view);
        });
    });

    // Header Action Button (Contextual)
    const headerActionBtn = document.getElementById('headerActionBtn');
    headerActionBtn.addEventListener('click', () => {
        if (currentView === 'customers') {
            openCustomerModal();
        } else if (currentView === 'parts') {
            openPartModal();
        } else {
            openInspectionModal();
        }
    });

    // Customer Form Submit
    document.getElementById('customerForm').addEventListener('submit', handleCustomerFormSubmit);

    // Inspection Form Submit
    document.getElementById('inspectionForm').addEventListener('submit', handleInspectionFormSubmit);

    // Search & Filters
    document.getElementById('customerSearchInput').addEventListener('input', renderCustomersTable);
    document.getElementById('inspectionSearchInput').addEventListener('input', renderInspectionsTable);
    document.getElementById('inspectionMonthFilter').addEventListener('change', renderInspectionsTable);
    document.getElementById('clearInspectionMonthBtn').addEventListener('click', () => {
        document.getElementById('inspectionMonthFilter').value = '';
        renderInspectionsTable();
    });

    // Backup & Restore
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataFile').addEventListener('change', importData);
    document.getElementById('clearAllDataBtn').addEventListener('click', () => {
        const msg = isCloudMode 
            ? '클라우드와 로컬 저장소의 모든 고객 정보 및 점검 기록이 영구적으로 삭제됩니다. 계속하시겠습니까?'
            : '저장된 모든 고객 정보와 점검 기록이 영구적으로 삭제됩니다. 계속하시겠습니까?';
        if (confirm(msg)) {
            if (isCloudMode && db) {
                const batch = db.batch();
                state.customers.forEach(c => batch.delete(db.collection('customers').doc(c.id)));
                state.inspections.forEach(i => batch.delete(db.collection('inspections').doc(i.id)));
                batch.commit().then(() => {
                    state.customers = [];
                    state.inspections = [];
                    saveToStorage();
                    alert('모든 클라우드 및 로컬 데이터가 초기화되었습니다.');
                    location.reload();
                }).catch(err => {
                    console.error("클라우드 초기화 실패:", err);
                    alert("클라우드 데이터 초기화 중 오류가 발생했습니다: " + err.message);
                });
            } else {
                state.customers = [];
                state.inspections = [];
                saveToStorage();
                alert('모든 데이터가 초기화되었습니다.');
                location.reload();
            }
        }
    });

    // Customer Add button inside customer view
    document.getElementById('addCustomerBtn').addEventListener('click', () => openCustomerModal());
    document.getElementById('addInspectionBtn').addEventListener('click', () => openInspectionModal());

    // Parts Event Listeners
    const addPartBtn = document.getElementById('addPartBtn');
    if (addPartBtn) {
        addPartBtn.addEventListener('click', () => openPartModal());
    }
    const partSearchInput = document.getElementById('partSearchInput');
    if (partSearchInput) {
        partSearchInput.addEventListener('input', renderPartsTable);
    }
    const partForm = document.getElementById('partForm');
    if (partForm) {
        partForm.addEventListener('submit', handlePartFormSubmit);
    }
    
    const manualInvoiceForm = document.getElementById('manualInvoiceForm');
    if (manualInvoiceForm) {
        manualInvoiceForm.addEventListener('submit', handleManualInvoiceFormSubmit);
    }
    
    // Replaced parts in inspection modal
    const addInspectionPartBtn = document.getElementById('addInspectionPartBtn');
    if (addInspectionPartBtn) {
        addInspectionPartBtn.addEventListener('click', addInspectionPart);
    }

    // Firebase Settings Trigger
    document.getElementById('openFirebaseModalBtn').addEventListener('click', openFirebaseModal);
    const headerSettingsBtn = document.getElementById('headerSettingsBtn');
    if (headerSettingsBtn) {
        headerSettingsBtn.addEventListener('click', openFirebaseModal);
    }
    document.getElementById('firebaseConfigForm').addEventListener('submit', handleFirebaseConfigSubmit);
    document.getElementById('clearFirebaseConfigBtn').addEventListener('click', clearFirebaseConfig);

    const fbConfigFileInput = document.getElementById('fbConfigFileInput');
    if (fbConfigFileInput) {
        fbConfigFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target.result;
                try {
                    const parsed = parseFirebaseConfig(text);
                    document.getElementById('fbConfigJson').value = JSON.stringify(parsed, null, 2);
                    
                    const testResult = document.getElementById('firebaseConnectionTestResult');
                    testResult.style.display = 'block';
                    testResult.className = 'success';
                    testResult.innerHTML = '<i class="fa-solid fa-circle-check"></i> 파일에서 설정을 성공적으로 읽어왔습니다. [연동 및 저장]을 클릭하여 완료해주세요.';
                } catch (err) {
                    alert('설정 파일을 분석하지 못했습니다. 형식을 확인해주세요.\n(' + err.message + ')');
                }
            };
            reader.readAsText(file);
        });
    }

    // Serial Image Upload Trigger
    document.getElementById('serialImageInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const previewContainer = document.getElementById('serialImagePreviewContainer');
            const previewImg = document.getElementById('serialImagePreview');

            // Set loading spinner SVG
            previewImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="%230ea5e9" d="M12,4V2A10,10,0,0,0,2,12H4A8,8,0,0,1,12,4Z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>';
            previewContainer.style.display = 'block';

            const compressedBase64 = await compressSerialImage(file);
            currentSerialImageBase64 = compressedBase64;
            previewImg.src = compressedBase64;
        } catch (err) {
            console.error("사진 압축 가공 에러:", err);
            alert("사진을 첨부하는 중 오류가 발생했습니다.");
        }
    });

    document.getElementById('deleteSerialImageBtn').addEventListener('click', () => {
        currentSerialImageBase64 = null;
        document.getElementById('serialImageInput').value = '';
        document.getElementById('serialImagePreviewContainer').style.display = 'none';
        document.getElementById('serialImagePreview').src = '';
    });

    // Report Event Listeners
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', generateMonthlyReport);
    }


    // Window resize event for report scaling
    window.addEventListener('resize', () => {
        const reportView = document.getElementById('reportView');
        if (reportView && reportView.classList.contains('active')) {
            adjustReportScale();
        }
    });
}

function initDateInputs() {
    const today = getLocalDateString();
    document.getElementById('inspectionDate').value = today;
    
    // Set default month filter to current year/month
    const currentYearMonth = today.substring(0, 7); // "YYYY-MM"
    const inspectionMonthFilter = document.getElementById('inspectionMonthFilter');
    if (inspectionMonthFilter) {
        inspectionMonthFilter.value = currentYearMonth;
    }
    
    const reportMonthFilter = document.getElementById('reportMonthFilter');
    if (reportMonthFilter) {
        reportMonthFilter.value = currentYearMonth;
    }
}

function switchView(viewName) {
    currentView = viewName;
    
    // Update active nav link
    document.querySelectorAll('.sidebar .nav-links li').forEach(li => {
        if (li.getAttribute('data-view') === viewName) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });

    // Show/hide view sections
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`${viewName}View`);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    // Update Header Context
    const viewTitle = document.getElementById('viewTitle');
    const viewSubtitle = document.getElementById('viewSubtitle');
    const headerActionBtn = document.getElementById('headerActionBtn');

    // Reset action button display by default
    headerActionBtn.style.display = 'inline-flex';

    if (viewName === 'dashboard') {
        viewTitle.textContent = '대시보드';
        viewSubtitle.textContent = '복사기 사용량 및 월간 점검 현황 요약';
        headerActionBtn.innerHTML = '<i class="fa-solid fa-file-signature"></i><span>점검 기록 등록</span>';
        renderDashboard();
    } else if (viewName === 'customers') {
        viewTitle.textContent = '고객사 관리';
        viewSubtitle.textContent = '등록된 관리 대상 고객사 목록 및 기기 현황';
        headerActionBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i><span>고객 등록</span>';
        renderCustomersTable();
    } else if (viewName === 'inspections') {
        viewTitle.textContent = '점검 대장';
        viewSubtitle.textContent = '월별 전체 복사기 점검 내역 및 사용량 증감';
        headerActionBtn.innerHTML = '<i class="fa-solid fa-file-signature"></i><span>점검 기록 등록</span>';
        const inspectionMonthFilter = document.getElementById('inspectionMonthFilter');
        if (inspectionMonthFilter && !inspectionMonthFilter.value) {
            const today = getLocalDateString();
            const currentYearMonth = today.substring(0, 7);
            inspectionMonthFilter.value = currentYearMonth;
        }
        renderInspectionsTable();
    } else if (viewName === 'parts') {
        viewTitle.textContent = '부품 관리';
        viewSubtitle.textContent = '복사기 점검 시 사용하는 교체 부품의 품목 및 단가 관리';
        headerActionBtn.innerHTML = '<i class="fa-solid fa-plus"></i><span>부품 등록</span>';
        renderPartsTable();
    } else if (viewName === 'report') {
        viewTitle.textContent = '월간 리포트';
        viewSubtitle.textContent = '월별 전체 점검 및 정산 보고서 인쇄 및 PDF 내보내기';
        headerActionBtn.style.display = 'none';
        
        const reportMonthFilter = document.getElementById('reportMonthFilter');
        if (reportMonthFilter && !reportMonthFilter.value) {
            const today = getLocalDateString();
            const currentYearMonth = today.substring(0, 7); // "YYYY-MM"
            reportMonthFilter.value = currentYearMonth;
        }
        
        generateMonthlyReport();
        setTimeout(adjustReportScale, 50);
    }
}

// --- Logic: Counter Calculations & Helper Functions ---

/**
 * Recalculate usage for a specific customer.
 * Sorts all inspections for that customer chronologically and calculates the usage difference.
 */
async function recalculateUsageForCustomer(customerId) {
    // Get all inspections for this customer
    const custInspections = state.inspections.filter(i => String(i.customerId) === String(customerId));
    
    // Sort by date ascending, then by ID (order of creation) if dates match
    custInspections.sort((a, b) => {
        const parsedA = a.date ? new Date(a.date).getTime() : 0;
        const parsedB = b.date ? new Date(b.date).getTime() : 0;
        const timeA = isNaN(parsedA) ? 0 : parsedA;
        const timeB = isNaN(parsedB) ? 0 : parsedB;
        if (timeA !== timeB) return timeA - timeB;
        return (a.id || '').localeCompare(b.id || '');
    });

    const changedInspections = [];

    // Group by deviceId
    const deviceIds = [...new Set(custInspections.map(i => i.deviceId))];

    deviceIds.forEach(devId => {
        const devInspections = custInspections.filter(i => i.deviceId === devId);
        
        devInspections.forEach((insp, index) => {
            let newBwUsage = 0;
            let newColorUsage = 0;
            if (index > 0) {
                const prev = devInspections[index - 1];
                const prevBw = Number(prev.bwCounter) || 0;
                const prevColor = Number(prev.colorCounter) || 0;
                const currBw = Number(insp.bwCounter) || 0;
                const currColor = Number(insp.colorCounter) || 0;
                
                newBwUsage = Math.max(0, currBw - prevBw);
                newColorUsage = Math.max(0, currColor - prevColor);
            }
            
            newBwUsage = Number(newBwUsage) || 0;
            newColorUsage = Number(newColorUsage) || 0;

            if (insp.bwUsage !== newBwUsage || insp.colorUsage !== newColorUsage) {
                insp.bwUsage = newBwUsage;
                insp.colorUsage = newColorUsage;
                changedInspections.push(insp);
            }
        });
    });

    // Update main state array
    state.inspections = state.inspections.map(insp => {
        if (String(insp.customerId) === String(customerId)) {
            const updated = custInspections.find(ci => String(ci.id) === String(insp.id));
            return updated || insp;
        }
        return insp;
    });

    saveToStorage();

    // If cloud mode is active and there are updates, batch update Firestore
    if (isCloudMode && db && changedInspections.length > 0) {
        try {
            const batch = db.batch();
            changedInspections.forEach(insp => {
                if (insp && insp.id) {
                    const docRef = db.collection('inspections').doc(insp.id);
                    batch.update(docRef, {
                        bwUsage: insp.bwUsage || 0,
                        colorUsage: insp.colorUsage || 0
                    });
                }
            });
            await batch.commit();
        } catch (err) {
            console.error("Firestore usage calculation sync failed:", err);
        }
    }
}

/**
 * Gets the latest inspection prior to a given date for a customer.
 */
function getPreviousInspection(deviceId, beforeDateStr, excludeId = null) {
    const beforeDate = new Date(beforeDateStr);
    
    const candidates = state.inspections.filter(i => {
        if (String(i.deviceId) !== String(deviceId)) return false;
        if (excludeId && String(i.id) === String(excludeId)) return false;
        return new Date(i.date) < beforeDate;
    });

    if (candidates.length === 0) return null;

    // Sort by date descending to get the closest one
    candidates.sort((a, b) => new Date(b.date) - new Date(a.date));
    return candidates[0];
}

// --- UI Rendering: Dashboard ---

function renderDashboard() {
    try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11
        
        const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        
        // Previous month details
        let prevYear = currentYear;
        let prevMonth = currentMonth - 1;
        if (prevMonth < 0) {
            prevMonth = 11;
            prevYear -= 1;
        }
        const prevMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;

        // Filter inspections for this month and previous month
        const thisMonthInsps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(currentMonthStr));
        const prevMonthInsps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(prevMonthStr));

        // Stat 1: Total Customers
        const totalCustomers = state.customers.length;
        document.getElementById('totalCustomersVal').textContent = totalCustomers;
        
        // Customer growth this month
        const addedThisMonth = state.customers.filter(c => c.createdAt && typeof c.createdAt === 'string' && c.createdAt.startsWith(currentMonthStr)).length;
        const customerDiffEl = document.getElementById('customersDiffVal');
        if (addedThisMonth > 0) {
            customerDiffEl.className = 'diff plus';
            customerDiffEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> 이번 달 +${addedThisMonth} 신규`;
        } else {
            customerDiffEl.className = 'diff zero';
            customerDiffEl.innerHTML = '변동 없음';
        }

        // Stat 2: Total B&W Usage
        const thisMonthBwUsage = thisMonthInsps.reduce((sum, curr) => sum + (curr.bwUsage || 0), 0);
        const prevMonthBwUsage = prevMonthInsps.reduce((sum, curr) => sum + (curr.bwUsage || 0), 0);
        document.getElementById('monthlyBwVal').textContent = thisMonthBwUsage.toLocaleString();
        
        const bwDiffEl = document.getElementById('monthlyBwDiffVal');
        const bwDiffVal = thisMonthBwUsage - prevMonthBwUsage;
        if (bwDiffVal > 0) {
            bwDiffEl.className = 'diff plus';
            bwDiffEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> 전월대비 +${bwDiffVal.toLocaleString()}`;
        } else if (bwDiffVal < 0) {
            bwDiffEl.className = 'diff minus';
            bwDiffEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> 전월대비 ${bwDiffVal.toLocaleString()}`;
        } else {
            bwDiffEl.className = 'diff zero';
            bwDiffEl.innerHTML = '전월 대비 동일';
        }

        // Stat 3: Total Color Usage
        const thisMonthColorUsage = thisMonthInsps.reduce((sum, curr) => sum + (curr.colorUsage || 0), 0);
        const prevMonthColorUsage = prevMonthInsps.reduce((sum, curr) => sum + (curr.colorUsage || 0), 0);
        document.getElementById('monthlyColorVal').textContent = thisMonthColorUsage.toLocaleString();
        
        const colorDiffEl = document.getElementById('monthlyColorDiffVal');
        const colorDiffVal = thisMonthColorUsage - prevMonthColorUsage;
        if (colorDiffVal > 0) {
            colorDiffEl.className = 'diff plus';
            colorDiffEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> 전월대비 +${colorDiffVal.toLocaleString()}`;
        } else if (colorDiffVal < 0) {
            colorDiffEl.className = 'diff minus';
            colorDiffEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> 전월대비 ${colorDiffVal.toLocaleString()}`;
        } else {
            colorDiffEl.className = 'diff zero';
            colorDiffEl.innerHTML = '전월 대비 동일';
        }

        // Stat 4: Inspection Progress (Inspected TARGET Customers this month / Total TARGET Customers)
        const targetCustomers = state.customers.filter(c => c.isMonthlyInspection !== false);
        const totalTargetCount = targetCustomers.length;
        const targetCustomerIds = new Set(targetCustomers.map(c => c.id));
        
        const inspectedCustomerIds = new Set(thisMonthInsps.map(i => i.customerId));
        const inspectedTargetCount = [...inspectedCustomerIds].filter(id => targetCustomerIds.has(id)).length;
        
        const progressPercent = totalTargetCount > 0 ? Math.round((inspectedTargetCount / totalTargetCount) * 100) : 0;
        
        document.getElementById('inspectionProgressVal').textContent = `${progressPercent}%`;
        const progressDiffEl = document.getElementById('inspectionProgressDiffVal');
        progressDiffEl.className = 'diff zero';
        progressDiffEl.innerHTML = `점검 완료: ${inspectedTargetCount} / 전체 대상: ${totalTargetCount} 개소`;

        // Render Recent Inspections Table
        renderRecentInspections();

        // Render Charts
        renderUsageChart();

        // Render Top Usage Customers
        renderTopUsageCustomers(currentMonthStr);
    } catch (err) {
        console.error("대시보드 렌더링 중 오류:", err);
    }
}

function renderRecentInspections() {
    const tbody = document.getElementById('recentInspectionsTbody');
    tbody.innerHTML = '';

    // Take top 5 most recent inspections, sorting by date descending, then ID descending
    const sorted = [...state.inspections].sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
    }).slice(0, 5);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">점검 기록이 없습니다.</td></tr>';
        return;
    }

    sorted.forEach(insp => {
        const customer = state.customers.find(c => String(c.id) === String(insp.customerId));
        const customerName = customer ? customer.name : '알 수 없는 고객';
        
        const bwCounterVal = Number(insp.bwCounter) || 0;
        const colorCounterVal = Number(insp.colorCounter) || 0;
        const bwUsageVal = Number(insp.bwUsage) || 0;
        const colorUsageVal = Number(insp.colorUsage) || 0;

        let bwBadge = '';
        if (bwUsageVal > 0) {
            bwBadge = `<span class="badge badge-success">+${bwUsageVal.toLocaleString()}</span>`;
            if (customer) {
                const dev = customer.devices ? customer.devices.find(d => String(d.id) === String(insp.deviceId)) : null;
                const limit = dev ? Number(dev.contractBw) : (Number(customer.contractBw) || 0);
                if (limit > 0 && bwUsageVal > limit) {
                    const over = bwUsageVal - limit;
                    bwBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
                }
            }
        } else {
            bwBadge = '<span class="badge badge-info">기준</span>';
        }

        let colorBadge = '';
        if (colorUsageVal > 0) {
            colorBadge = `<span class="badge badge-success" style="background:rgba(217,70,239,0.15); color:#f472b6;">+${colorUsageVal.toLocaleString()}</span>`;
            if (customer) {
                const dev = customer.devices ? customer.devices.find(d => String(d.id) === String(insp.deviceId)) : null;
                const limit = dev ? Number(dev.contractColor) : (Number(customer.contractColor) || 0);
                if (limit > 0 && colorUsageVal > limit) {
                    const over = colorUsageVal - limit;
                    colorBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
                }
            }
        } else {
            colorBadge = '<span class="badge badge-info">기준</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="점검일" style="font-weight:600;">${insp.date || '-'}</td>
            <td data-label="고객사명"><span style="font-weight: 500;">${customerName}</span></td>
            <td data-label="흑백 카운터">${bwCounterVal.toLocaleString()}</td>
            <td data-label="컬러 카운터" style="color:#d8b4fe;">${colorCounterVal.toLocaleString()}</td>
            <td data-label="흑백 사용량">
                <div style="display: flex; align-items: center; gap: 0.35rem; justify-content: flex-end;">
                    <span style="font-weight:600;">${bwUsageVal.toLocaleString()}</span>
                    ${bwBadge}
                </div>
            </td>
            <td data-label="컬러 사용량">
                <div style="display: flex; align-items: center; gap: 0.35rem; justify-content: flex-end;">
                    <span style="font-weight:600;">${colorUsageVal.toLocaleString()}</span>
                    ${colorBadge}
                </div>
            </td>
            <td data-label="특이사항">
                <span style="font-size:0.85rem; color:var(--text-secondary);">${insp.notes || '-'}</span>
                ${insp.parts && Array.isArray(insp.parts) && insp.parts.length > 0 ? `
                    <div style="margin-top: 0.35rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                        ${insp.parts.map(p => `
                            <span class="badge badge-info" style="font-size: 0.75rem; background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 0.15rem 0.35rem; display: inline-flex; align-items: center; gap: 0.15rem;">
                                <i class="fa-solid fa-screwdriver-wrench" style="font-size:0.65rem;"></i>
                                ${p.name} (${p.quantity}개)
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </td>
            <td data-label="관리">
                <div style="display:flex; gap:0.35rem;">
                    <button class="btn-icon btn-secondary" onclick="openInspectionModal('${insp.id}')" title="수정"><i class="fa-solid fa-pen-to-square" style="color: var(--warning);"></i></button>
                    <button class="btn-icon btn-danger" onclick="deleteInspection('${insp.id}', '${insp.customerId}')" title="삭제"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTopUsageCustomers(currentMonthStr) {
    const container = document.getElementById('topUsageCustomers');
    container.innerHTML = '';

    // Filter inspections for this month
    const thisMonthInsps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(currentMonthStr));

    // Calculate usage per customer
    const usageMap = {};
    thisMonthInsps.forEach(insp => {
        if (!usageMap[insp.customerId]) {
            usageMap[insp.customerId] = { bw: 0, color: 0, total: 0 };
        }
        usageMap[insp.customerId].bw += insp.bwUsage;
        usageMap[insp.customerId].color += insp.colorUsage;
        usageMap[insp.customerId].total += (insp.bwUsage + insp.colorUsage);
    });

    // Convert to list & sort
    const list = Object.keys(usageMap).map(id => {
        const customer = state.customers.find(c => c.id === id);
        return {
            id,
            name: customer ? customer.name : '알 수 없음',
            model: customer ? customer.copierModel : '-',
            bw: usageMap[id].bw,
            color: usageMap[id].color,
            total: usageMap[id].total
        };
    }).sort((a, b) => b.total - a.total).slice(0, 4);

    if (list.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 3rem;">이번 달 사용 기록이 없습니다.</p>';
        return;
    }

    // Find max total to calculate percentages
    const maxTotal = list[0].total || 1;

    list.forEach(item => {
        const percent = Math.round((item.total / maxTotal) * 100);
        
        const card = document.createElement('div');
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '0.4rem';
        card.style.padding = '0.75rem 0';
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                <span style="font-weight:600;">${item.name} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(${item.model})</span></span>
                <span style="font-weight:700; color:var(--primary);">${(Number(item.total) || 0).toLocaleString()} 매</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.2rem;">
                <span>흑백: ${(Number(item.bw) || 0).toLocaleString()}매</span>
                <span>컬러: ${(Number(item.color) || 0).toLocaleString()}매</span>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                <div style="width:${percent}%; height:100%; background:var(--primary-gradient); border-radius:4px;"></div>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderUsageChart() {
    const ctx = document.getElementById('usageChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (usageChart) {
        usageChart.destroy();
    }

    // Get last 6 months list (chronological)
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const yStr = d.getFullYear();
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        months.push(`${yStr}-${mStr}`);
    }

    // Sum usage per month
    const bwData = [];
    const colorData = [];
    const labels = months.map(m => {
        const [y, mm] = m.split('-');
        return `${parseInt(mm)}월`;
    });

    months.forEach(m => {
        const insps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(m));
        const bwSum = insps.reduce((sum, curr) => sum + (curr.bwUsage || 0), 0);
        const colorSum = insps.reduce((sum, curr) => sum + (curr.colorUsage || 0), 0);
        bwData.push(bwSum);
        colorData.push(colorSum);
    });

    usageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '흑백 사용량',
                    data: bwData,
                    backgroundColor: 'rgba(59, 130, 246, 0.65)',
                    borderColor: '#60a5fa',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: '컬러 사용량',
                    data: colorData,
                    backgroundColor: 'rgba(168, 85, 247, 0.65)',
                    borderColor: '#c084fc',
                    borderWidth: 1.5,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: {
                            family: 'Inter, Noto Sans KR'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toLocaleString()} 매`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.04)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Inter, Noto Sans KR'
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.04)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Inter, Noto Sans KR'
                        },
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// --- UI Rendering: Customer Table & Management ---

function renderCustomersTable() {
    const tbody = document.getElementById('customersTbody');
    tbody.innerHTML = '';

    const query = document.getElementById('customerSearchInput').value.toLowerCase().trim();
    
    // Filter customers
    const filtered = state.customers.filter(c => {
        const queryMatchName = c.name.toLowerCase().includes(query);
        const queryMatchDevice = c.devices && c.devices.some(d => 
            (d.model && d.model.toLowerCase().includes(query)) || 
            (d.serial && d.serial.toLowerCase().includes(query)) ||
            (d.name && d.name.toLowerCase().includes(query))
        );
        return queryMatchName || queryMatchDevice;
    });

    // Sort alphabetically (가나다 순)
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' }));

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">등록된 고객사가 없거나 검색 결과가 없습니다.</td></tr>';
        return;
    }

    const todayStr = getLocalDateString().substring(0, 7); // "YYYY-MM"

    filtered.forEach(cust => {
        // Find inspections for this customer
        const custInsps = state.inspections.filter(i => String(i.customerId) === String(cust.id));
        
        // Sort to find latest
        let lastInspectionDate = '-';
        let isInspectedThisMonth = false;
        
        if (custInsps.length > 0) {
            custInsps.sort((a, b) => new Date(b.date) - new Date(a.date));
            lastInspectionDate = custInsps[0].date;
            
            // Check if there's any inspection this month
            isInspectedThisMonth = custInsps.some(i => i.date && typeof i.date === 'string' && i.date.startsWith(todayStr));
        }

        let totalBw = 0;
        let totalColor = 0;
        let mainModel = '-';
        let mainSerial = '-';

        if (cust.devices && cust.devices.length > 0) {
            const firstDev = cust.devices[0];
            mainModel = firstDev.model || '-';
            mainSerial = firstDev.serial || '-';
            if (cust.devices.length > 1) {
                mainModel += ` 외 ${cust.devices.length - 1}대`;
            }
            
            cust.devices.forEach(d => {
                totalBw += (d.contractBw || 0);
                totalColor += (d.contractColor || 0);
            });
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="고객사명"><span style="font-weight: 600; font-size:1rem; cursor:pointer; color:var(--primary);" onclick="openDetailModal('${cust.id}')">${cust.name}</span></td>
            <td data-label="보유 기기"><span style="font-weight:500;">${mainModel}</span></td>
            <td data-label="계약 흑백"><span style="font-weight: 500;">${totalBw.toLocaleString()} 매</span></td>
            <td data-label="계약 컬러"><span style="font-weight: 500; color: #c084fc;">${totalColor.toLocaleString()} 매</span></td>
            <td data-label="일련번호(S/N)"><code style="color:var(--text-secondary); font-family: monospace;">${mainSerial}</code></td>
            <td data-label="연락처">${cust.contact || '-'}</td>
            <td data-label="최근 점검일">${lastInspectionDate}</td>
            <td data-label="점검 여부">
                ${cust.isMonthlyInspection === false
                    ? '<span class="badge badge-secondary"><i class="fa-solid fa-circle-minus"></i> 제외</span>'
                    : (isInspectedThisMonth 
                        ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> 완료</span>' 
                        : '<span class="badge badge-warning"><i class="fa-solid fa-circle-minus"></i> 예정</span>')}
            </td>
            <td data-label="관리">
                <div style="display:flex; gap:0.35rem;">
                    <button class="btn-icon btn-secondary" onclick="openDetailModal('${cust.id}')" title="상세 정보"><i class="fa-solid fa-eye" style="color: var(--primary);"></i></button>
                    <button class="btn-icon btn-secondary" onclick="openCustomerModal('${cust.id}')" title="수정"><i class="fa-solid fa-pen-to-square" style="color: var(--warning);"></i></button>
                    <button class="btn-icon btn-danger" onclick="deleteCustomer('${cust.id}')" title="삭제"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

let customerDevicesCount = 0;

function addCustomerDeviceForm(device = null) {
    const container = document.getElementById('customerDevicesContainer');
    const id = `dev_${Date.now()}_${customerDevicesCount++}`;
    
    const div = document.createElement('div');
    div.className = 'device-entry';
    div.style.cssText = 'background: rgba(0,0,0,0.1); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 0.75rem; position: relative;';
    
    div.innerHTML = `
        <button type="button" class="btn-icon btn-danger" style="position: absolute; top: 0.5rem; right: 0.5rem;" onclick="this.parentElement.remove()" title="기기 삭제">
            <i class="fa-solid fa-trash"></i>
        </button>
        <input type="hidden" class="dev-id" value="${device ? device.id : id}">
        
        <div class="form-row">
            <div class="form-group">
                <label>품목명 (예: 복사기 RT) <span style="color:var(--danger)">*</span></label>
                <input type="text" class="form-control dev-name" required placeholder="명세서에 출력될 이름" value="${device ? device.name : '복사기 RT'}">
            </div>
            <div class="form-group">
                <label>기기 모델</label>
                <input type="text" class="form-control dev-model" placeholder="예: Canon C3525" value="${device ? device.model : ''}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>일련번호 (S/N)</label>
                <input type="text" class="form-control dev-serial" placeholder="예: SN12345678" value="${device ? device.serial : ''}">
            </div>
            <div class="form-group">
                <label>기본 임대료 (원)</label>
                <input type="number" class="form-control dev-price" min="0" placeholder="예: 210000" value="${device ? device.price || 0 : 0}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>흑백 기본 계약 (매)</label>
                <input type="number" class="form-control dev-contract-bw" min="0" placeholder="예: 2000" value="${device ? device.contractBw || 0 : 0}">
            </div>
            <div class="form-group">
                <label>컬러 기본 계약 (매)</label>
                <input type="number" class="form-control dev-contract-color" min="0" placeholder="예: 200" value="${device ? device.contractColor || 0 : 0}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>흑백 초과 단가 (원)</label>
                <input type="number" class="form-control dev-over-bw" min="0" placeholder="예: 15" value="${device ? device.overBwPrice || 0 : 0}">
            </div>
            <div class="form-group">
                <label>컬러 초과 단가 (원)</label>
                <input type="number" class="form-control dev-over-color" min="0" placeholder="예: 100" value="${device ? device.overColorPrice || 0 : 0}">
            </div>
        </div>
        <div class="form-group" style="margin-top:0.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
                <label style="margin-bottom:0;">기기 / 일련번호 사진 첨부</label>
                <button type="button" class="btn btn-secondary" style="font-size:0.72rem; padding:0.25rem 0.6rem;" onclick="triggerDeviceImageUpload(this)">
                    <i class="fa-solid fa-plus"></i> 사진 추가
                </button>
            </div>
            <input type="file" accept="image/*" style="display:none;" onchange="handleDeviceImageAdd(this)" multiple>
            <div class="dev-images-grid" style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.4rem;">
                ${(device && (device.images || device.image) ? (device.images || [device.image]) : []).map((img, imgIdx) => `
                    <div class="dev-image-thumb" style="position:relative; width:70px; height:70px; border-radius:6px; border:1px solid var(--border-color); overflow:hidden; flex-shrink:0;" data-img="${encodeURIComponent(img)}">
                        <img src="${img}" style="width:100%;height:100%;object-fit:cover;">
                        <button type="button" onclick="removeDeviceImageThumb(this)" style="position:absolute;top:1px;right:1px;background:rgba(239,68,68,0.85);border:none;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;">
                            <i class="fa-solid fa-xmark" style="color:#fff;font-size:9px;"></i>
                        </button>
                        <button type="button" onclick="extractSerialFromThumb(this)" style="position:absolute;bottom:1px;left:1px;background:rgba(16,185,129,0.88);border:none;border-radius:3px;font-size:8px;color:#fff;cursor:pointer;padding:1px 3px;font-weight:600;" title="이 사진에서 S/N 추출">
                            OCR
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    container.appendChild(div);
}

function triggerDeviceImageUpload(btn) {
    // Find the hidden file input inside this device-entry
    const deviceEntry = btn.closest('.device-entry');
    deviceEntry.querySelector('input[type="file"]').click();
}

function handleDeviceImageAdd(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const deviceEntry = input.closest('.device-entry');
    const grid = deviceEntry.querySelector('.dev-images-grid');
    const serialInput = deviceEntry.querySelector('.dev-serial');

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            compressImage(e.target.result, 600, 0.65).then(compressed => {
                // Build thumbnail
                const thumb = document.createElement('div');
                thumb.className = 'dev-image-thumb';
                thumb.style.cssText = 'position:relative; width:70px; height:70px; border-radius:6px; border:1px solid var(--border-color); overflow:hidden; flex-shrink:0;';
                thumb.dataset.img = encodeURIComponent(compressed);
                thumb.innerHTML = `
                    <img src="${compressed}" style="width:100%;height:100%;object-fit:cover;">
                    <button type="button" onclick="removeDeviceImageThumb(this)" style="position:absolute;top:1px;right:1px;background:rgba(239,68,68,0.85);border:none;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;">
                        <i class="fa-solid fa-xmark" style="color:#fff;font-size:9px;"></i>
                    </button>
                    <div class="ocr-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">
                        <i class="fa-solid fa-spinner fa-spin" style="color:#fff;font-size:14px;"></i>
                        <span style="color:#fff;font-size:7px;font-weight:600;">S/N 추출 중</span>
                    </div>
                    <button type="button" onclick="extractSerialFromThumb(this)" class="ocr-retry-btn" style="display:none;position:absolute;bottom:1px;left:1px;background:rgba(16,185,129,0.88);border:none;border-radius:3px;font-size:8px;color:#fff;cursor:pointer;padding:1px 3px;font-weight:600;" title="S/N 다시 추출">
                        OCR
                    </button>
                `;
                grid.appendChild(thumb);

                // Auto-run OCR immediately after thumbnail is appended
                runOCR(compressed, serialInput, thumb);
            });
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
}

/**
 * Shared OCR runner — used by auto-trigger and manual retry button.
 */
async function runOCR(imgSrc, serialInput, thumb) {
    const overlay = thumb.querySelector('.ocr-overlay');
    const retryBtn = thumb.querySelector('.ocr-retry-btn');

    if (overlay) overlay.style.display = 'flex';
    if (retryBtn) retryBtn.style.display = 'none';

    try {
        const result = await Tesseract.recognize(imgSrc, 'eng', {
            logger: () => {}
        });
        const rawText = result.data.text;

        const snPatterns = [
            /(?:S\/N|SN|Serial(?:\s*No\.?)?|번호)\s*[:\-]?\s*([A-Za-z0-9\-]{4,20})/i,
            /([A-Z]{1,3}[0-9]{6,15})/,
            /([A-Z0-9]{8,20})/
        ];

        let extracted = '';
        for (const pattern of snPatterns) {
            const match = rawText.match(pattern);
            if (match) { extracted = match[1].trim(); break; }
        }

        if (extracted) {
            // Only fill if empty (don't overwrite user's manual input)
            if (!serialInput.value.trim()) {
                serialInput.value = extracted;
                serialInput.style.boxShadow = '0 0 0 2px rgba(16,185,129,0.5)';
                setTimeout(() => { serialInput.style.boxShadow = ''; }, 2500);
            }
            showToast(`S/N 추출 완료: ${extracted}`, 'success');
            // Show a small green checkmark badge on the thumbnail
            if (overlay) {
                overlay.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;font-size:18px;"></i>';
                overlay.style.background = 'rgba(0,0,0,0.2)';
                setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 1800);
            }
        } else {
            if (overlay) overlay.style.display = 'none';
            showToast('S/N 자동 추출 실패 — OCR 버튼으로 재시도하세요.', 'warning');
        }
    } catch (err) {
        console.error('OCR error:', err);
        if (overlay) overlay.style.display = 'none';
        showToast('OCR 처리 중 오류가 발생했습니다.', 'error');
    } finally {
        if (retryBtn) retryBtn.style.display = 'block';
    }
}

/**
 * Manual retry — called when user clicks the OCR button on a thumbnail.
 */
async function extractSerialFromThumb(ocrBtn) {
    const thumb = ocrBtn.closest('.dev-image-thumb');
    const imgSrc = thumb.querySelector('img').src;
    const deviceEntry = thumb.closest('.device-entry');
    const serialInput = deviceEntry.querySelector('.dev-serial');

    ocrBtn.disabled = true;
    ocrBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:8px;"></i>';

    // Temporarily clear serial so runOCR always fills it on retry
    const prev = serialInput.value;
    serialInput.value = '';

    await runOCR(imgSrc, serialInput, thumb);

    // If runOCR still couldn't extract, restore previous value and prompt
    if (!serialInput.value.trim()) {
        serialInput.value = prev;
        try {
            const result = await Tesseract.recognize(imgSrc, 'eng', { logger: () => {} });
            const cleaned = result.data.text.replace(/\s+/g, ' ').trim().substring(0, 300);
            if (cleaned) {
                const manual = prompt(`자동 추출 실패.\n인식된 텍스트:\n\n${cleaned}\n\n일련번호를 직접 입력하세요:`, prev);
                if (manual !== null) serialInput.value = manual.trim();
            }
        } catch (_) {}
    }

    ocrBtn.disabled = false;
    ocrBtn.innerHTML = 'OCR';
}

async function handleCustomerFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('customerId').value;
    const name = document.getElementById('customerName').value.trim();
    const contact = document.getElementById('customerContact').value.trim();
    const vatEnabled = document.getElementById('vatEnabled').checked;
    const location = document.getElementById('customerLocation').value.trim();
    const isMonthly = document.getElementById('isMonthlyInspection').checked;

    // Parse devices
    const deviceEntries = document.querySelectorAll('.device-entry');
    const devices = [];
    deviceEntries.forEach(entry => {
        devices.push({
            id: entry.querySelector('.dev-id').value,
            name: entry.querySelector('.dev-name').value.trim(),
            model: entry.querySelector('.dev-model').value.trim(),
            serial: entry.querySelector('.dev-serial').value.trim(),
            price: parseInt(entry.querySelector('.dev-price').value, 10) || 0,
            contractBw: parseInt(entry.querySelector('.dev-contract-bw').value, 10) || 0,
            contractColor: parseInt(entry.querySelector('.dev-contract-color').value, 10) || 0,
            overBwPrice: parseInt(entry.querySelector('.dev-over-bw').value, 10) || 0,
            overColorPrice: parseInt(entry.querySelector('.dev-over-color').value, 10) || 0,
            images: Array.from(entry.querySelectorAll('.dev-image-thumb')).map(t => decodeURIComponent(t.dataset.img)).filter(Boolean)
        });
    });

    if (!name || devices.length === 0) {
        alert("고객사명과 최소 1개 이상의 기기를 등록해주세요.");
        return;
    }

    let targetId = id || 'cust-' + Date.now();
    let createdAt = getLocalDateString();

    const customerData = {
        id: targetId,
        name: name,
        devices: devices,
        contact: contact,
        vatEnabled: vatEnabled,
        location: location,
        isMonthlyInspection: isMonthly
    };

    if (id) {
        const existing = state.customers.find(c => c.id === id);
        if (existing) {
            customerData.createdAt = existing.createdAt || createdAt;
        } else {
            customerData.createdAt = createdAt;
        }
    } else {
        customerData.createdAt = createdAt;
    }

    if (isCloudMode && db) {
        try {
            // Pre-compress any images that might exceed Firestore limits
            const safeDevices = await Promise.all(devices.map(async dev => {
                if (dev.images && dev.images.length > 0) {
                    const compressed = await Promise.all(dev.images.map(img => compressImage(img, 500, 0.55)));
                    return { ...dev, images: compressed };
                }
                return dev;
            }));
            const safeData = { ...customerData, devices: safeDevices };
            await db.collection('customers').doc(targetId).set(safeData);
        } catch (err) {
            console.error("고객사 저장 중 오류:", err);
            alert("클라우드 저장에 실패했습니다: " + err.message);
            return;
        }
    } else {
        if (id) {
            state.customers = state.customers.map(c => c.id === id ? customerData : c);
        } else {
            state.customers.push(customerData);
        }
        saveToStorage();
        renderCustomersTable();
    }

    closeCustomerModal();
}

async function deleteCustomer(id) {
    const customer = state.customers.find(c => c.id === id);
    if (!customer) return;

    if (confirm(`고객사 "${customer.name}"을(를) 삭제하시겠습니까?\n삭제 시 해당 고객의 모든 월간 점검 기록도 영구적으로 삭제됩니다.`)) {
        if (isCloudMode && db) {
            try {
                const batch = db.batch();
                batch.delete(db.collection('customers').doc(id));
                
                const customerInspections = state.inspections.filter(i => String(i.customerId) === String(id));
                customerInspections.forEach(insp => {
                    batch.delete(db.collection('inspections').doc(insp.id));
                });
                
                await batch.commit();
            } catch (err) {
                console.error("고객사 삭제 실패:", err);
                alert("삭제 처리에 실패했습니다: " + err.message);
            }
        } else {
            state.customers = state.customers.filter(c => String(c.id) !== String(id));
            state.inspections = state.inspections.filter(i => String(i.customerId) !== String(id));

            saveToStorage();
            renderCustomersTable();
        }
    }
}

// --- UI Rendering: Inspection Table & Management ---

function renderInspectionsTable() {
    try {
        const tbody = document.getElementById('inspectionsTbody');
        tbody.innerHTML = '';

        const query = document.getElementById('inspectionSearchInput').value.toLowerCase().trim();
    const monthFilter = document.getElementById('inspectionMonthFilter').value; // "YYYY-MM"

    // Filter inspections
    const filtered = state.inspections.filter(insp => {
        const customer = state.customers.find(c => String(c.id) === String(insp.customerId));
        const customerName = customer ? customer.name.toLowerCase() : '';
        const dev = customer && customer.devices ? customer.devices.find(d => String(d.id) === String(insp.deviceId)) || customer.devices[0] : null;
        
        const modelName = dev && dev.model ? dev.model.toLowerCase() : '';
        const devName = dev && dev.name ? dev.name.toLowerCase() : '';
        
        const matchesQuery = customerName.includes(query) || modelName.includes(query) || devName.includes(query);
        const matchesMonth = (monthFilter && insp.date && typeof insp.date === 'string') ? insp.date.startsWith(monthFilter) : true;

        return matchesQuery && matchesMonth;
    });

    // Sort inspections by date descending, then ID
    filtered.sort((a, b) => {
        let timeA = a.date ? new Date(a.date).getTime() : 0;
        let timeB = b.date ? new Date(b.date).getTime() : 0;
        if (isNaN(timeA)) timeA = 0;
        if (isNaN(timeB)) timeB = 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">점검 기록이 없거나 검색 필터와 일치하는 내역이 없습니다.</td></tr>';
        return;
    }

    filtered.forEach(insp => {
        const customer = state.customers.find(c => String(c.id) === String(insp.customerId));
        const dev = customer && customer.devices ? customer.devices.find(d => String(d.id) === String(insp.deviceId)) || customer.devices[0] : null;
        const customerName = customer ? customer.name : '알 수 없음';
        const model = dev ? (dev.model || dev.name) : '-';

        const bwCounterVal = Number(insp.bwCounter) || 0;
        const colorCounterVal = Number(insp.colorCounter) || 0;
        const bwUsageVal = Number(insp.bwUsage) || 0;
        const colorUsageVal = Number(insp.colorUsage) || 0;

        let bwBadge = '';
        if (bwUsageVal > 0) {
            bwBadge = `<span class="badge badge-success">+${bwUsageVal.toLocaleString()}</span>`;
            if (dev && dev.contractBw > 0 && bwUsageVal > dev.contractBw) {
                const over = bwUsageVal - dev.contractBw;
                bwBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
            }
        } else if (bwUsageVal < 0) {
            bwBadge = `<span class="badge badge-danger">${bwUsageVal.toLocaleString()} (감소)</span>`;
        } else {
            bwBadge = '<span class="badge badge-info">기준</span>';
        }

        let colorBadge = '';
        if (colorUsageVal > 0) {
            colorBadge = `<span class="badge badge-success" style="background:rgba(217,70,239,0.15); color:#f472b6;">+${colorUsageVal.toLocaleString()}</span>`;
            if (dev && dev.contractColor > 0 && colorUsageVal > dev.contractColor) {
                const over = colorUsageVal - dev.contractColor;
                colorBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
            }
        } else if (colorUsageVal < 0) {
            colorBadge = `<span class="badge badge-danger">${colorUsageVal.toLocaleString()} (감소)</span>`;
        } else {
            colorBadge = '<span class="badge badge-info">기준</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="점검일" style="font-weight: 600;">${insp.date || '-'}</td>
            <td data-label="고객사명"><span style="font-weight: 600;">${customerName}</span></td>
            <td data-label="복사기 모델">${model}</td>
            <td data-label="흑백 카운터">
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    <span>${bwCounterVal.toLocaleString()}</span>
                    ${bwBadge}
                </div>
            </td>
            <td data-label="컬러 카운터">
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                    <span>${colorCounterVal.toLocaleString()}</span>
                    ${colorBadge}
                </div>
            </td>
            <td data-label="특이사항 / 메모">
                <span style="font-size: 0.85rem; color: var(--text-secondary);">${insp.notes || '-'}</span>
                ${insp.parts && Array.isArray(insp.parts) && insp.parts.length > 0 ? `
                    <div style="margin-top: 0.35rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                        ${insp.parts.map(p => `
                            <span class="badge badge-info" style="font-size: 0.75rem; background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 0.15rem 0.35rem; display: inline-flex; align-items: center; gap: 0.15rem;">
                                <i class="fa-solid fa-screwdriver-wrench" style="font-size:0.65rem;"></i>
                                ${p.name} (${p.quantity}개)
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </td>
            <td data-label="관리">
                <div style="display:flex; gap:0.35rem;">
                    <button class="btn-icon btn-secondary" onclick="openInspectionModal('${insp.id}')" title="수정">
                        <i class="fa-solid fa-pen-to-square" style="color: var(--warning);"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="deleteInspection('${insp.id}', '${insp.customerId}')" title="삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    } catch (error) {
        console.error("점검 대장 렌더링 중 오류 발생:", error);
        alert("점검 대장 렌더링 중 오류가 발생했습니다: " + error.message);
    }
}

async function handleInspectionFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('inspectionId').value;
    const customerId = document.getElementById('inspectionCustomerSelect').value;
    const deviceId = document.getElementById('inspectionDeviceSelect').value;
    const date = document.getElementById('inspectionDate').value;
    const bwCounter = parseInt(document.getElementById('bwCounter').value, 10);
    const colorCounter = parseInt(document.getElementById('colorCounter').value, 10);
    const discountAmount = parseInt(document.getElementById('discountAmount').value, 10) || 0;
    const notes = document.getElementById('inspectionNotes').value.trim();

    if (!customerId || !deviceId || !date || isNaN(bwCounter) || isNaN(colorCounter)) {
        alert("모든 필수 항목을 입력해주세요.");
        return;
    }

    if (!id) {
        const duplicate = state.inspections.find(i => String(i.deviceId) === String(deviceId) && i.date === date);
        if (duplicate) {
            if (!confirm('해당 기기에 이미 등록된 같은 날짜의 점검 기록이 있습니다. 덮어쓰시겠습니까?')) {
                return;
            }
            if (isCloudMode && db) {
                try {
                    await db.collection('inspections').doc(duplicate.id).delete();
                } catch (err) {
                    console.error("기존 중복 점검 기록 삭제 실패:", err);
                }
            } else {
                state.inspections = state.inspections.filter(i => String(i.id) !== String(duplicate.id));
            }
        }
    }

    const targetId = id || 'insp-' + Date.now();
    const inspectionData = {
        id: targetId,
        customerId: customerId,
        deviceId: deviceId,
        date: date,
        bwCounter: bwCounter,
        colorCounter: colorCounter,
        bwUsage: 0,
        colorUsage: 0,
        discountAmount: discountAmount,
        notes: notes,
        parts: currentInspectionParts
    };

    if (isCloudMode && db) {
        try {
            const oldCustomerId = id ? (state.inspections.find(i => String(i.id) === String(id))?.customerId) : null;
            
            // Temporary local sync for recalculation
            const exists = state.inspections.find(i => String(i.id) === String(targetId));
            if (exists) {
                state.inspections = state.inspections.map(i => String(i.id) === String(targetId) ? inspectionData : i);
            } else {
                state.inspections.push(inspectionData);
            }

            // Recalculate
            await recalculateUsageForCustomer(customerId);
            if (oldCustomerId && oldCustomerId !== customerId) {
                await recalculateUsageForCustomer(oldCustomerId);
            }

            // Sync the recalculated result back to Firestore
            const calculatedInsp = state.inspections.find(i => String(i.id) === String(targetId));
            if (calculatedInsp) {
                const cleanedData = JSON.parse(JSON.stringify(calculatedInsp));
                lastSavedInspections[targetId] = {
                    data: cleanedData,
                    timestamp: Date.now()
                };
                await db.collection('inspections').doc(targetId).set(cleanedData);
            }
        } catch (err) {
            console.error("점검 기록 저장 중 오류:", err);
            alert("클라우드 저장에 실패했습니다: " + err.message);
            return;
        }
    } else {
        if (id) {
            const insp = state.inspections.find(i => String(i.id) === String(id));
            if (insp) {
                const oldCustomerId = insp.customerId;
                insp.customerId = customerId;
                insp.deviceId = deviceId;
                insp.date = date;
                insp.bwCounter = bwCounter;
                insp.colorCounter = colorCounter;
                insp.discountAmount = discountAmount;
                insp.notes = notes;
                insp.parts = currentInspectionParts;

                saveToStorage();
                recalculateUsageForCustomer(oldCustomerId);
                if (oldCustomerId !== customerId) {
                    recalculateUsageForCustomer(customerId);
                }
            }
        } else {
            state.inspections.push(inspectionData);
            saveToStorage();
            recalculateUsageForCustomer(customerId);
        }
    }

    if (date) {
        const targetMonth = date.substring(0, 7); // "YYYY-MM"
        const monthFilter = document.getElementById('inspectionMonthFilter');
        if (monthFilter) {
            monthFilter.value = targetMonth;
        }
    }

    closeInspectionModal();
    refreshAllViews();
}

function refreshAllViews() {
    if (currentView === 'dashboard') {
        renderDashboard();
    } else if (currentView === 'customers') {
        renderCustomersTable();
    } else if (currentView === 'inspections') {
        renderInspectionsTable();
    } else if (currentView === 'parts') {
        renderPartsTable();
    }
}

async function deleteInspection(id, customerId) {
    if (confirm('이 점검 기록을 삭제하시겠습니까? 삭제 후 점검 대장의 사용량(증감)이 재계산됩니다.')) {
        if (isCloudMode && db) {
            try {
                await db.collection('inspections').doc(id).delete();
                state.inspections = state.inspections.filter(i => i.id !== id);
                await recalculateUsageForCustomer(customerId);
            } catch (err) {
                console.error("점검 기록 삭제 실패:", err);
                alert("삭제에 실패했습니다: " + err.message);
            }
        } else {
            state.inspections = state.inspections.filter(i => i.id !== id);
            saveToStorage();
            recalculateUsageForCustomer(customerId);
            refreshAllViews();
        }
    }
}

function editInspectionFromDetail(id, customerId) {
    closeDetailModal();
    openInspectionModal(id);
}

async function deleteInspectionFromDetail(id, customerId) {
    if (confirm('이 점검 기록을 삭제하시겠습니까? 삭제 후 사용량(증감)이 재계산됩니다.')) {
        if (isCloudMode && db) {
            try {
                await db.collection('inspections').doc(id).delete();
                state.inspections = state.inspections.filter(i => i.id !== id);
                await recalculateUsageForCustomer(customerId);
                openDetailModal(customerId); // refresh detail popup
                refreshAllViews();
            } catch (err) {
                console.error("점검 기록 삭제 실패:", err);
                alert("삭제에 실패했습니다: " + err.message);
            }
        } else {
            state.inspections = state.inspections.filter(i => i.id !== id);
            saveToStorage();
            recalculateUsageForCustomer(customerId);
            openDetailModal(customerId); // refresh detail popup
            refreshAllViews();
        }
    }
}

// --- Modals Management ---

// Customer Modal
function openCustomerModal(id = null) {
    const modal = document.getElementById('customerModalBackdrop');
    const form = document.getElementById('customerForm');
    const title = document.getElementById('customerModalTitle');
    const saveBtn = document.getElementById('saveCustomerBtn');

    form.reset();
    document.getElementById('customerId').value = '';

    document.getElementById('customerDevicesContainer').innerHTML = '';

    if (id) {
        title.textContent = '고객사 정보 수정';
        saveBtn.textContent = '수정 완료';
        const customer = state.customers.find(c => c.id === id);
        if (customer) {
            document.getElementById('customerId').value = customer.id;
            document.getElementById('customerName').value = customer.name;
            document.getElementById('customerContact').value = customer.contact || '';
            document.getElementById('vatEnabled').checked = customer.vatEnabled !== false;
            document.getElementById('customerLocation').value = customer.location || '';
            document.getElementById('isMonthlyInspection').checked = customer.isMonthlyInspection !== false;
            
            if (customer.devices && customer.devices.length > 0) {
                customer.devices.forEach(dev => {
                    addCustomerDeviceForm(dev);
                });
            } else {
                addCustomerDeviceForm();
            }
        }
    } else {
        title.textContent = '고객사 신규 등록';
        saveBtn.textContent = '등록';
        document.getElementById('vatEnabled').checked = true;
        document.getElementById('isMonthlyInspection').checked = true;
        
        addCustomerDeviceForm();
    }

    modal.classList.add('active');
}

function closeCustomerModal() {
    document.getElementById('customerModalBackdrop').classList.remove('active');
}

// --- Parts Management Logic ---

function renderPartsTable() {
    const tbody = document.getElementById('partsTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const query = document.getElementById('partSearchInput') ? document.getElementById('partSearchInput').value.toLowerCase().trim() : '';

    // Filter parts
    const filtered = state.parts.filter(part => {
        return part.name.toLowerCase().includes(query);
    });

    // Sort parts alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">부품 데이터가 없거나 검색 필터와 일치하는 내역이 없습니다.</td></tr>';
        return;
    }

    filtered.forEach(part => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="부품명 (품목)" style="font-weight: 600;">${part.name}</td>
            <td data-label="가격 (단가)">₩${part.price.toLocaleString()}</td>
            <td data-label="관리">
                <div style="display:flex; gap:0.35rem;">
                    <button class="btn-icon btn-secondary" onclick="openPartModal('${part.id}')" title="수정">
                        <i class="fa-solid fa-pen-to-square" style="color: var(--warning);"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="deletePart('${part.id}')" title="삭제">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openPartModal(id = null) {
    const modal = document.getElementById('partModalBackdrop');
    const form = document.getElementById('partForm');
    const title = document.getElementById('partModalTitle');
    const saveBtn = document.getElementById('savePartBtn');

    form.reset();
    document.getElementById('partId').value = '';

    if (id) {
        title.textContent = '부품 수정';
        saveBtn.textContent = '수정';
        const part = state.parts.find(p => p.id === id);
        if (part) {
            document.getElementById('partId').value = part.id;
            document.getElementById('partName').value = part.name;
            document.getElementById('partPrice').value = part.price;
        }
    } else {
        title.textContent = '부품 등록';
        saveBtn.textContent = '등록';
    }

    modal.classList.add('active');
}

function closePartModal() {
    document.getElementById('partModalBackdrop').classList.remove('active');
}

async function handlePartFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('partId').value;
    const name = document.getElementById('partName').value.trim();
    const price = parseInt(document.getElementById('partPrice').value, 10) || 0;

    if (!name) {
        alert('부품명을 입력해 주세요.');
        return;
    }

    const partData = {
        id: id || 'part-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        name: name,
        price: price
    };

    if (isCloudMode && db) {
        try {
            await db.collection('parts').doc(partData.id).set(partData);
        } catch (err) {
            console.error('부품 저장 실패:', err);
            alert('클라우드에 부품을 저장하는 데 실패했습니다: ' + err.message);
            return;
        }
    } else {
        if (id) {
            // Edit
            const idx = state.parts.findIndex(p => p.id === id);
            if (idx > -1) {
                state.parts[idx] = partData;
            }
        } else {
            // Add new
            state.parts.push(partData);
        }
        saveToStorage();
        renderPartsTable();
    }

    closePartModal();
}

async function deletePart(id) {
    if (!confirm('정말로 이 부품을 삭제하시겠습니까?')) return;

    if (isCloudMode && db) {
        try {
            await db.collection('parts').doc(id).delete();
        } catch (err) {
            console.error('부품 삭제 실패:', err);
            alert('클라우드에서 부품을 삭제하는 데 실패했습니다: ' + err.message);
        }
    } else {
        state.parts = state.parts.filter(p => p.id !== id);
        saveToStorage();
        renderPartsTable();
    }
}

// --- Inspection Replaced Parts Helper Logic ---

function updateInspectionPartDropdown() {
    const select = document.getElementById('inspectionPartSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- 부품을 선택하세요 --</option>';

    // Sort parts alphabetically
    const sortedParts = [...state.parts].sort((a, b) => a.name.localeCompare(b.name));

    sortedParts.forEach(part => {
        const option = document.createElement('option');
        option.value = part.id;
        option.textContent = `${part.name} (₩${part.price.toLocaleString()})`;
        select.appendChild(option);
    });
}

function addInspectionPart() {
    const partSelect = document.getElementById('inspectionPartSelect');
    const partQtyInput = document.getElementById('inspectionPartQty');
    if (!partSelect || !partQtyInput) return;

    const partId = partSelect.value;
    const qty = parseInt(partQtyInput.value, 10) || 1;

    if (!partId) {
        alert('추가할 부품을 선택해 주세요.');
        return;
    }
    if (qty < 1) {
        alert('수량은 1개 이상이어야 합니다.');
        return;
    }

    const part = state.parts.find(p => p.id === partId);
    if (!part) return;

    // Check if already exists in current inspection parts list
    const existing = currentInspectionParts.find(p => p.id === partId);
    if (existing) {
        existing.quantity += qty;
    } else {
        currentInspectionParts.push({
            id: part.id,
            name: part.name,
            price: part.price,
            quantity: qty
        });
    }

    // Reset dropdown and qty
    partSelect.value = '';
    partQtyInput.value = 1;

    renderAddedPartsList();
}

function removeInspectionPart(partId) {
    currentInspectionParts = currentInspectionParts.filter(p => p.id !== partId);
    renderAddedPartsList();
}

function renderAddedPartsList() {
    const container = document.getElementById('addedPartsListContainer');
    if (!container) return;
    container.innerHTML = '';

    currentInspectionParts.forEach(part => {
        const div = document.createElement('div');
        div.className = 'added-part-item';
        div.innerHTML = `
            <span>${part.name} x ${part.quantity} (₩${(part.price * part.quantity).toLocaleString()})</span>
            <button type="button" class="remove-btn" onclick="removeInspectionPart('${part.id}')" title="삭제">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

// Inspection Modal
function openInspectionModal(id = null, customerId = null) {
    const modal = document.getElementById('inspectionModalBackdrop');
    const form = document.getElementById('inspectionForm');
    const title = document.getElementById('inspectionModalTitle');
    
    form.reset();
    document.getElementById('inspectionId').value = '';
    
    // Populated customer select dropdown
    const select = document.getElementById('inspectionCustomerSelect');
    select.innerHTML = '<option value="">-- 고객사를 선택하세요 --</option>';
    
    // Sort customers alphabetically
    const sortedCustomers = [...state.customers].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedCustomers.forEach(cust => {
        const option = document.createElement('option');
        option.value = cust.id;
        option.textContent = cust.name;
        select.appendChild(option);
    });

    document.getElementById('inspectionDeviceSelectGroup').style.display = 'none';
    document.getElementById('inspectionDeviceSelect').innerHTML = '<option value="">-- 기기를 선택하세요 --</option>';

    // Populate parts select dropdown
    updateInspectionPartDropdown();

    // Reset part inputs inside modal
    const partQty = document.getElementById('inspectionPartQty');
    if (partQty) partQty.value = 1;
    const partSelect = document.getElementById('inspectionPartSelect');
    if (partSelect) partSelect.value = '';

    if (id) {
        title.textContent = '복사기 점검 기록 수정';
        const insp = state.inspections.find(i => String(i.id) === String(id));
        if (insp) {
            document.getElementById('inspectionId').value = insp.id;
            document.getElementById('inspectionCustomerSelect').value = insp.customerId;
            handleInspectionCustomerChange();
            document.getElementById('inspectionDeviceSelect').value = insp.deviceId;
            
            document.getElementById('inspectionDate').value = insp.date;
            document.getElementById('bwCounter').value = insp.bwCounter;
            document.getElementById('colorCounter').value = insp.colorCounter;
            document.getElementById('discountAmount').value = insp.discountAmount || 0;
            document.getElementById('inspectionNotes').value = insp.notes || '';
            
            // Show previous info (excluding this record)
            updatePreviousCountersInfo(insp.deviceId, insp.id);
            
            // Load existing parts
            currentInspectionParts = insp.parts ? [...insp.parts] : [];
        }
    } else {
        title.textContent = '복사기 점검 기록 등록';
        // Set default date to today
        const today = getLocalDateString();
        document.getElementById('inspectionDate').value = today;
        document.getElementById('previousCountersInfo').style.display = 'none';
        
        if (customerId) {
            document.getElementById('inspectionCustomerSelect').value = customerId;
            handleInspectionCustomerChange();
        }

        // Reset inspection parts
        currentInspectionParts = [];
    }

    renderAddedPartsList();
    modal.classList.add('active');
}

function closeInspectionModal() {
    document.getElementById('inspectionModalBackdrop').classList.remove('active');
}

function handleInspectionCustomerChange() {
    const customerId = document.getElementById('inspectionCustomerSelect').value;
    const deviceSelect = document.getElementById('inspectionDeviceSelect');
    const deviceGroup = document.getElementById('inspectionDeviceSelectGroup');
    const infoBox = document.getElementById('previousCountersInfo');
    
    deviceSelect.innerHTML = '<option value="">-- 기기를 선택하세요 --</option>';
    infoBox.style.display = 'none';
    document.getElementById('bwCounter').placeholder = '0';
    document.getElementById('colorCounter').placeholder = '0';

    if (!customerId) {
        deviceGroup.style.display = 'none';
        return;
    }

    const customer = state.customers.find(c => String(c.id) === String(customerId));
    if (customer && customer.devices && customer.devices.length > 0) {
        customer.devices.forEach(dev => {
            const option = document.createElement('option');
            option.value = dev.id;
            option.textContent = `${dev.name} (${dev.model})`;
            deviceSelect.appendChild(option);
        });
        deviceGroup.style.display = 'block';
        
        // Auto-select if only 1 device
        if (customer.devices.length === 1) {
            deviceSelect.value = customer.devices[0].id;
            updatePreviousCountersInfo();
        }
    } else {
        deviceGroup.style.display = 'none';
    }
}

/**
 * Show previous month's counters in the modal when a device is selected.
 */
function updatePreviousCountersInfo(overrideDeviceId = null, excludeId = null) {
    const infoBox = document.getElementById('previousCountersInfo');
    const deviceId = overrideDeviceId || document.getElementById('inspectionDeviceSelect').value;
    
    if (!deviceId) {
        infoBox.style.display = 'none';
        return;
    }

    const dateVal = document.getElementById('inspectionDate').value;
    
    // Find the closest previous inspection
    const prev = getPreviousInspection(deviceId, dateVal || getLocalDateString(), excludeId);

    if (prev) {
        infoBox.style.display = 'block';
        infoBox.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.15rem; color: var(--primary);">
                <i class="fa-solid fa-clock-rotate-left"></i> 직전 점검 내역 (${prev.date})
            </div>
            <div>흑백 카운터: <span style="font-weight:600; color:var(--text-primary);">${Number(prev.bwCounter || 0).toLocaleString()}</span></div>
            <div>컬러 카운터: <span style="font-weight:600; color:var(--text-primary);">${Number(prev.colorCounter || 0).toLocaleString()}</span></div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top: 0.25rem;">* 입력하시는 카운터 값과 비교하여 사용량을 자동 계산합니다.</div>
        `;
        // Pre-populate input fields as suggestion (so user doesn't start from 0 if they don't want to)
        document.getElementById('bwCounter').placeholder = prev.bwCounter !== undefined ? prev.bwCounter : '0';
        document.getElementById('colorCounter').placeholder = prev.colorCounter !== undefined ? prev.colorCounter : '0';
    } else {
        infoBox.style.display = 'block';
        infoBox.innerHTML = `
            <div style="color: var(--warning); font-weight: 500;">
                <i class="fa-solid fa-circle-info"></i> 첫 점검 기록입니다.
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top: 0.15rem;">* 이 카운터 값은 최초의 기준선(사용량 0)으로 설정됩니다.</div>
        `;
        document.getElementById('bwCounter').placeholder = '0';
        document.getElementById('colorCounter').placeholder = '0';
    }
}

// Customer Detail & History Modal
function openDetailModal(customerId) {
    const modal = document.getElementById('detailModalBackdrop');
    const customer = state.customers.find(c => c.id === customerId);
    if (!customer) return;

    // Fill customer info
    document.getElementById('detailCustomerName').textContent = customer.name;
    document.getElementById('detailContact').textContent = customer.contact || '-';

    // Fill device list
    const deviceListEl = document.getElementById('detailDeviceList');
    deviceListEl.innerHTML = '';
    if (customer.devices && customer.devices.length > 0) {
        customer.devices.forEach(d => {
            const row = document.createElement('div');
            row.style.cssText = 'background:rgba(255,255,255,0.04); border:1px solid var(--border-color); border-radius:6px; padding:0.45rem 0.65rem; font-size:0.85rem;';
            row.innerHTML = `
                <div style="font-weight:600; color:var(--primary); margin-bottom:0.2rem;"><i class="fa-solid fa-print" style="font-size:0.75rem;"></i> ${d.name || d.model || '-'}</div>
                <div style="color:var(--text-secondary); font-size:0.78rem;">
                    ${d.model ? `모델: <strong>${d.model}</strong> &nbsp;` : ''}
                    ${d.serial ? `S/N: <code style="font-family:monospace; font-size:0.8rem; color:var(--text-primary);">${d.serial}</code>` : ''}
                </div>
                ${(d.contractBw || d.contractColor) ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">계약: 흑백 ${(d.contractBw||0).toLocaleString()}매 / 컬러 ${(d.contractColor||0).toLocaleString()}매</div>` : ''}
            `;
            deviceListEl.appendChild(row);
        });
    } else {
        deviceListEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">등록된 기기가 없습니다.</span>';
    }

    // Collect all images from all devices (support legacy single-image format)
    const gallery = document.getElementById('detailImageGallery');
    gallery.innerHTML = '';
    const allImages = [];
    if (customer.devices) {
        customer.devices.forEach(d => {
            const imgs = d.images && d.images.length > 0 ? d.images : (d.image ? [d.image] : []);
            imgs.forEach(img => allImages.push({ src: img, devName: d.name || d.model || '' }));
        });
    }
    // Legacy: top-level serialImage
    if (allImages.length === 0 && customer.serialImage) {
        allImages.push({ src: customer.serialImage, devName: '' });
    }

    if (allImages.length > 0) {
        allImages.forEach(({ src, devName }) => {
            const thumb = document.createElement('div');
            thumb.style.cssText = 'position:relative; width:70px; height:70px; border-radius:6px; border:1px solid var(--border-color); overflow:hidden; cursor:pointer; flex-shrink:0;';
            thumb.title = devName ? `${devName} 사진` : '기기 사진';
            thumb.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;">
                <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.75rem;opacity:0;transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                    <i class="fa-solid fa-magnifying-glass-plus"></i>
                </div>`;
            thumb.addEventListener('click', () => openImageViewer(src));
            gallery.appendChild(thumb);
        });
    } else {
        gallery.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">첨부된 사진이 없습니다.</span>';
    }

    // Billing summary
    let totalBwContract = 0;
    let totalColorContract = 0;
    let totalBaseRent = 0;
    if (customer.devices && customer.devices.length > 0) {
        customer.devices.forEach(d => {
            totalBwContract += (d.contractBw || 0);
            totalColorContract += (d.contractColor || 0);
            totalBaseRent += (d.price || 0);
        });
    }

    const bwContractText = `${totalBwContract.toLocaleString()}매`;
    const colorContractText = `${totalColorContract.toLocaleString()}매`;
    document.getElementById('detailContract').innerHTML = `총 흑백: <span style="font-weight:600; color:var(--text-primary);">${bwContractText}</span> / 총 컬러: <span style="font-weight:600; color:#c084fc;">${colorContractText}</span>`;
    
    const amtText = `${totalBaseRent.toLocaleString()}원`;
    const vatText = customer.vatEnabled !== false ? '(VAT 별도)' : '(VAT 포함/없음)';
    document.getElementById('detailBilling').innerHTML = `총 기본료: <span style="font-weight:600;">${amtText}</span> ${vatText}<br><span style="font-size:0.85em; color:var(--text-secondary);">기기별 계약 매수 및 초과 단가는 수정 화면에서 확인하세요.</span>`;
    
    document.getElementById('detailLocation').textContent = customer.location || '-';

    // Get historical inspections
    const history = state.inspections.filter(i => i.customerId === customerId);
    // Sort descending by date
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById('detailHistoryCount').textContent = `${history.length}건`;

    const listContainer = document.getElementById('detailHistoryList');
    listContainer.innerHTML = '';

    if (history.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 3rem;">등록된 점검 이력이 없습니다.</p>';
    } else {
        history.forEach(insp => {
            const card = document.createElement('div');
            card.className = 'inspection-mini-card';
            card.innerHTML = `
                <div class="info">
                    <span class="date">${insp.date}</span>
                    <span class="usage">
                        사용량: 
                        흑백 <strong style="color:var(--success)">+${insp.bwUsage.toLocaleString()}</strong> / 
                        컬러 <strong style="color:#d8b4fe;">+${insp.colorUsage.toLocaleString()}</strong>
                    </span>
                    ${insp.notes ? `<span style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">메모: ${insp.notes}</span>` : ''}
                    ${insp.parts && Array.isArray(insp.parts) && insp.parts.length > 0 ? `
                        <div style="margin-top: 0.35rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">
                            ${insp.parts.map(p => `
                                <span class="badge badge-info" style="font-size: 0.75rem; background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 0.15rem 0.35rem; display: inline-flex; align-items: center; gap: 0.15rem;">
                                    <i class="fa-solid fa-screwdriver-wrench" style="font-size:0.65rem;"></i>
                                    ${p.name} (${p.quantity}개)
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
                    <div class="counters" style="text-align:right;">
                        <div class="bw">흑백: ${insp.bwCounter.toLocaleString()}</div>
                        <div class="color">컬러: ${insp.colorCounter.toLocaleString()}</div>
                    </div>
                    <div style="display:flex; gap:0.25rem;">
                        <button class="btn-icon btn-secondary" style="padding:0.25rem 0.4rem; font-size:0.75rem;" onclick="editInspectionFromDetail('${insp.id}', '${customerId}')" title="수정"><i class="fa-solid fa-pen-to-square" style="color: var(--warning);"></i></button>
                        <button class="btn-icon btn-danger" style="padding:0.25rem 0.4rem; font-size:0.75rem;" onclick="deleteInspectionFromDetail('${insp.id}', '${customerId}')" title="삭제"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    modal.classList.add('active');

    // Bind edit button in details popup
    const editBtn = document.getElementById('editCustomerFromDetailBtn');
    editBtn.onclick = () => {
        closeDetailModal();
        openCustomerModal(customerId);
    };
}

function closeDetailModal() {
    document.getElementById('detailModalBackdrop').classList.remove('active');
}

// --- Import / Export Backups (JSON) ---

function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const today = getLocalDateString().replace(/-/g, '');
    const filename = `smartcounter_backup_${today}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const parsed = JSON.parse(evt.target.result);
            
            // Validation
            if (!parsed.customers || !parsed.inspections || !Array.isArray(parsed.customers) || !Array.isArray(parsed.inspections)) {
                alert('올바른 백업 파일 형식이 아닙니다. (customers 및 inspections 배열이 포함되어야 합니다)');
                return;
            }

            if (confirm('백업 파일을 가져오시겠습니까? 가져오면 현재 저장된 데이터가 모두 덮어써집니다.')) {
                if (!parsed.parts || !Array.isArray(parsed.parts)) {
                    parsed.parts = [];
                }
                state = parsed;
                saveToStorage();
                
                // Recalculate usage for all customers to ensure everything is correct
                const uniqueCustomerIds = new Set(state.inspections.map(i => i.customerId));
                uniqueCustomerIds.forEach(cid => {
                    recalculateUsageForCustomer(cid);
                });

                alert('데이터 복원이 완료되었습니다.');
                location.reload();
            }
        } catch (err) {
            alert('파일을 분석하는 데 실패했습니다. 올바른 JSON 파일인지 확인하세요.');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// --- Firebase sync and configuration management ---

window.handleSyncBadgeClick = async function() {
    const configStr = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (!configStr) {
        openFirebaseModal();
        return;
    }

    if (isCloudMode && db) {
        openFirebaseModal();
        return;
    }

    // Attempt background reconnect with saved config
    const badge = document.getElementById('syncStatusBadge');
    if (badge) {
        badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 연결 중...`;
    }

    try {
        const config = JSON.parse(configStr);
        // Test connectivity
        const testAppName = 'badgeTestApp-' + Date.now();
        const testApp = firebase.initializeApp(config, testAppName);
        const testDb = testApp.firestore();
        await testDb.collection('_connection_test_').limit(1).get();
        await testApp.delete();

        // Successful!
        initFirebase();
        alert('클라우드 동기화가 성공적으로 재연결되었습니다!');
    } catch (err) {
        console.error('원클릭 재연결 실패:', err);
        alert('저장된 설정으로 연결할 수 없습니다. 설정 창에서 세부 정보를 확인해 주세요.');
        openFirebaseModal();
    }
};

window.addEventListener('online', initFirebase);

window.addEventListener('beforeprint', () => {
    const invoiceModal = document.getElementById('invoiceModalBackdrop');
    const bulkArea = document.getElementById('bulkInvoicePrintArea');
    
    if (bulkArea && bulkArea.style.display !== 'none') {
        document.body.classList.add('print-bulk-invoice');
    } else if (invoiceModal && invoiceModal.classList.contains('active')) {
        document.body.classList.add('print-invoice');
    }
});

window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-report', 'print-invoice', 'print-bulk-invoice');
    const bulkArea = document.getElementById('bulkInvoicePrintArea');
    if (bulkArea) {
        bulkArea.style.display = 'none';
    }
});

function initFirebase() {
    const configStr = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (!configStr) {
        isCloudMode = false;
        loadData();
        updateSyncStatusUI();
        return;
    }

    try {
        const config = JSON.parse(configStr);
        let app;
        if (firebase.apps.length === 0) {
            app = firebase.initializeApp(config);
        } else {
            app = firebase.app();
        }
        
        db = app.firestore();
        isCloudMode = true;
        updateSyncStatusUI();
        setupFirebaseListeners();
    } catch (e) {
        console.error('Firebase 초기화 실패, 로컬 모드로 전환합니다.', e);
        isCloudMode = false;
        loadData();
        updateSyncStatusUI(e);
    }
}

function setupFirebaseListeners() {
    if (customersUnsubscribe) customersUnsubscribe();
    if (inspectionsUnsubscribe) inspectionsUnsubscribe();
    if (partsUnsubscribe) partsUnsubscribe();
    if (settingsUnsubscribe) settingsUnsubscribe();

    customersUnsubscribe = db.collection('customers').onSnapshot(snapshot => {
        const customersList = [];
        snapshot.forEach(doc => {
            customersList.push(doc.data());
        });
        state.customers = customersList;
        migrateState();
        saveToStorage();
        refreshAllViews();
    }, error => {
        console.error("고객사 동기화 실패:", error);
        updateSyncStatusUI(error);
    });

    inspectionsUnsubscribe = db.collection('inspections').onSnapshot(snapshot => {
        const inspectionsList = [];
        snapshot.forEach(doc => {
            inspectionsList.push(doc.data());
        });

        // Merge recently saved inspections that haven't synced to server yet to prevent race condition rollbacks
        const now = Date.now();
        const incomingIds = new Set(inspectionsList.map(i => i.id));
        
        Object.keys(lastSavedInspections).forEach(id => {
            const entry = lastSavedInspections[id];
            if (now - entry.timestamp < 5000) {
                if (!incomingIds.has(id)) {
                    inspectionsList.push(entry.data);
                } else {
                    delete lastSavedInspections[id];
                }
            } else {
                delete lastSavedInspections[id];
            }
        });

        state.inspections = inspectionsList;
        migrateState();
        saveToStorage();
        refreshAllViews();
    }, error => {
        console.error("점검기록 동기화 실패:", error);
        updateSyncStatusUI(error);
    });

    partsUnsubscribe = db.collection('parts').onSnapshot(snapshot => {
        const partsList = [];
        snapshot.forEach(doc => {
            partsList.push(doc.data());
        });
        state.parts = partsList;
        saveToStorage();
        refreshAllViews();
    }, error => {
        console.error("부품 동기화 실패:", error);
        updateSyncStatusUI(error);
    });

    settingsUnsubscribe = db.collection('settings').doc('invoiceConfig').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data && typeof data === 'object') {
                invoiceConfig = { ...defaultInvoiceConfig, ...data };
                localStorage.setItem(INVOICE_CONFIG_KEY, JSON.stringify(invoiceConfig));
                fillInvoiceConfigInputs();
                applyCustomCss();
                const invoiceModal = document.getElementById('invoiceModalBackdrop');
                if (invoiceModal && invoiceModal.classList.contains('active') && currentInvoiceData && !currentInvoiceData.isManual) {
                    openInvoiceModal(currentInvoiceData.cust.id, currentInvoiceData.month);
                }
            }
        }
    }, error => {
        console.error("명세서 설정 동기화 실패:", error);
    });
}

function updateSyncStatusUI(error = null) {
    const badge = document.getElementById('syncStatusBadge');
    if (!badge) return;

    badge.className = 'badge';
    
    if (error) {
        badge.classList.add('badge-cloud-error');
        badge.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 연결 오류`;
        badge.title = `동기화 오류: ${error.message || error}`;
    } else if (isCloudMode) {
        badge.classList.add('badge-cloud-active');
        badge.innerHTML = `<i class="fa-solid fa-cloud"></i> 클라우드 동기화`;
        badge.title = '실시간 클라우드 동기화 모드가 활성화되었습니다.';
    } else {
        badge.classList.add('badge-info');
        badge.innerHTML = `<i class="fa-solid fa-circle-dot"></i> 로컬 모드`;
        badge.title = '로컬 브라우저 저장소(localStorage)에만 데이터가 기록됩니다.';
    }

    const clearBtn = document.getElementById('clearFirebaseConfigBtn');
    if (clearBtn) {
        const hasConfig = localStorage.getItem(FIREBASE_CONFIG_KEY) !== null;
        clearBtn.style.display = hasConfig ? 'block' : 'none';
    }
}

function fillInvoiceConfigInputs() {
    if (!invoiceConfig) {
        invoiceConfig = { ...defaultInvoiceConfig };
    }
    const regNo = document.getElementById('invConfRegNo');
    if (regNo) regNo.value = invoiceConfig.regNo || '';
    
    const name = document.getElementById('invConfName');
    if (name) name.value = invoiceConfig.name || '';
    
    const ceo = document.getElementById('invConfCeo');
    if (ceo) ceo.value = invoiceConfig.ceo || '';
    
    const stampText = document.getElementById('invConfStampText');
    if (stampText) stampText.value = invoiceConfig.stampText || '';
    
    const address = document.getElementById('invConfAddress');
    if (address) address.value = invoiceConfig.address || '';
    
    const bizType = document.getElementById('invConfBizType');
    if (bizType) bizType.value = invoiceConfig.bizType || '';
    
    const bizItem = document.getElementById('invConfBizItem');
    if (bizItem) bizItem.value = invoiceConfig.bizItem || '';
    
    const account = document.getElementById('invConfAccount');
    if (account) account.value = invoiceConfig.account || '';
    
    const accHolder = document.getElementById('invConfAccHolder');
    if (accHolder) accHolder.value = invoiceConfig.accHolder || '';
    
    const greeting = document.getElementById('invConfGreeting');
    if (greeting) greeting.value = invoiceConfig.greeting || '';

    const theme = document.getElementById('invConfTheme');
    if (theme) theme.value = invoiceConfig.theme || 'blue';

    const templateHtml = document.getElementById('invConfTemplateHtml');
    if (templateHtml) {
        templateHtml.value = (invoiceConfig.templateHtml && invoiceConfig.templateHtml.trim() !== '') ? invoiceConfig.templateHtml : defaultInvoiceTemplateHTML.trim();
    }

    const customCss = document.getElementById('invConfCustomCss');
    if (customCss) customCss.value = invoiceConfig.customCss !== undefined ? invoiceConfig.customCss : '';
}

window.handleInvoiceConfigSubmit = async function(e) {
    e.preventDefault();
    
    const getValue = (id, fallback = '') => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : fallback;
    };

    const config = {
        regNo: getValue('invConfRegNo'),
        name: getValue('invConfName'),
        ceo: getValue('invConfCeo'),
        stampText: getValue('invConfStampText'),
        address: getValue('invConfAddress'),
        bizType: getValue('invConfBizType'),
        bizItem: getValue('invConfBizItem'),
        account: getValue('invConfAccount'),
        accHolder: getValue('invConfAccHolder'),
        greeting: getValue('invConfGreeting'),
        theme: document.getElementById('invConfTheme') ? document.getElementById('invConfTheme').value : 'blue',
        templateHtml: document.getElementById('invConfTemplateHtml') ? document.getElementById('invConfTemplateHtml').value : '',
        customCss: document.getElementById('invConfCustomCss') ? document.getElementById('invConfCustomCss').value : ''
    };

    invoiceConfig = { ...defaultInvoiceConfig, ...config };
    localStorage.setItem(INVOICE_CONFIG_KEY, JSON.stringify(invoiceConfig));
    applyCustomCss();

    if (isCloudMode && db) {
        try {
            await db.collection('settings').doc('invoiceConfig').set(invoiceConfig);
        } catch (err) {
            console.error("명세서 설정 클라우드 저장 실패:", err);
            alert("클라우드 저장에 실패했습니다. 로컬 브라우저에는 저장되었습니다.");
        }
    }

    alert('명세서 설정이 성공적으로 저장되었습니다!');
    closeFirebaseModal();
    
    const invoiceModal = document.getElementById('invoiceModalBackdrop');
    if (invoiceModal && invoiceModal.classList.contains('active') && currentInvoiceData && !currentInvoiceData.isManual) {
        openInvoiceModal(currentInvoiceData.cust.id, currentInvoiceData.month);
    }
};

window.resetInvoiceTemplate = function() {
    if (confirm('거래명세서 HTML 템플릿을 기본 양식으로 복원하시겠습니까? (작성 중인 내용은 삭제됩니다.)')) {
        const textarea = document.getElementById('invConfTemplateHtml');
        if (textarea) {
            textarea.value = defaultInvoiceTemplateHTML.trim();
        }
    }
};

function openFirebaseModal() {
    const modal = document.getElementById('firebaseModalBackdrop');
    const configInput = document.getElementById('fbConfigJson');
    const testResult = document.getElementById('firebaseConnectionTestResult');
    
    testResult.style.display = 'none';
    
    const existingConfig = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (existingConfig) {
        try {
            configInput.value = JSON.stringify(JSON.parse(existingConfig), null, 2);
        } catch (e) {
            configInput.value = existingConfig;
        }
    } else {
        configInput.value = '';
    }
    
    updateSyncStatusUI();
    fillInvoiceConfigInputs();
    
    // Always default to the cloud tab when opening settings modal
    if (window.switchSettingsTab) {
        window.switchSettingsTab('cloud');
    }
    
    modal.classList.add('active');
}

function closeFirebaseModal() {
    document.getElementById('firebaseModalBackdrop').classList.remove('active');
}

// Global settings modal tab switching function
window.switchSettingsTab = function(tabName) {
    const cloudBtn = document.getElementById('settingsTabCloudBtn');
    const backupBtn = document.getElementById('settingsTabBackupBtn');
    const invoiceBtn = document.getElementById('settingsTabInvoiceBtn');
    const cloudTab = document.getElementById('settingsTabCloud');
    const backupTab = document.getElementById('settingsTabBackup');
    const invoiceTab = document.getElementById('settingsTabInvoice');

    if (cloudBtn) cloudBtn.classList.toggle('active', tabName === 'cloud');
    if (backupBtn) backupBtn.classList.toggle('active', tabName === 'backup');
    if (invoiceBtn) invoiceBtn.classList.toggle('active', tabName === 'invoice');

    if (cloudTab) cloudTab.style.display = tabName === 'cloud' ? 'block' : 'none';
    if (backupTab) backupTab.style.display = tabName === 'backup' ? 'block' : 'none';
    if (invoiceTab) invoiceTab.style.display = tabName === 'invoice' ? 'block' : 'none';
};

function parseFirebaseConfig(text) {
    text = text.trim();
    
    // 1. If it's already a valid JSON, parse it
    try {
        const obj = JSON.parse(text);
        if (obj && typeof obj === 'object' && obj.apiKey) {
            return obj;
        }
    } catch (e) {
        // Fallback to regex parser
    }

    // 2. Parse via Regex to support arbitrary JS object copied directly from Firebase console
    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
    const config = {};
    let found = false;

    keys.forEach(key => {
        const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]([^'"]+)['"]`, 'i');
        const match = text.match(regex);
        if (match && match[1]) {
            config[key] = match[1].trim();
            found = true;
        }
    });

    if (found && config.apiKey && config.projectId) {
        return config;
    }

    throw new Error("올바른 Firebase 설정 형식이 아닙니다. apiKey 및 projectId 등을 포함해야 합니다.");
}

async function handleFirebaseConfigSubmit(e) {
    e.preventDefault();
    const configInput = document.getElementById('fbConfigJson').value.trim();
    const testResult = document.getElementById('firebaseConnectionTestResult');
    const saveBtn = document.getElementById('saveFirebaseConfigBtn');

    testResult.className = '';
    testResult.style.display = 'block';
    testResult.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 연결 테스트 중...';
    saveBtn.disabled = true;

    let config;
    try {
        config = parseFirebaseConfig(configInput);
        document.getElementById('fbConfigJson').value = JSON.stringify(config, null, 2);
    } catch (err) {
        testResult.className = 'error';
        testResult.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 올바른 Firebase 설정 형식이 아닙니다. 자바스크립트 객체 또는 JSON을 복사했는지 확인해주세요.';
        saveBtn.disabled = false;
        return;
    }

    try {
        const testAppName = 'testApp-' + Date.now();
        const testApp = firebase.initializeApp(config, testAppName);
        const testDb = testApp.firestore();
        
        await testDb.collection('_connection_test_').limit(1).get();
        await testApp.delete();

        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
        
        testResult.className = 'success';
        testResult.innerHTML = '<i class="fa-solid fa-circle-check"></i> 연결 성공! 클라우드 동기화를 시작합니다.';
        
        const hasLocalData = state.customers.length > 0 || state.inspections.length > 0;
        let migrationConfirmed = false;
        if (hasLocalData) {
            migrationConfirmed = confirm(
                '연결에 성공했습니다!\n\n현재 브라우저에 저장되어 있는 데이터(고객사 및 점검기록)를 클라우드로 이전하시겠습니까?\n(클라우드에 기존 데이터가 있다면 중복될 수 있습니다.)'
            );
        }

        initFirebase();

        if (migrationConfirmed) {
            testResult.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 데이터를 클라우드로 복사하는 중...';
            await migrateLocalDataToCloud();
            testResult.className = 'success';
            testResult.innerHTML = '<i class="fa-solid fa-circle-check"></i> 데이터 마이그레이션 완료!';
        }

        setTimeout(() => {
            closeFirebaseModal();
            refreshAllViews();
        }, 1500);

    } catch (err) {
        console.error("Firebase 연결 실패:", err);
        testResult.className = 'error';
        testResult.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 연결 실패: ${err.message || err}`;
    } finally {
        saveBtn.disabled = false;
    }
}

async function migrateLocalDataToCloud() {
    if (!db) return;
    const batchSize = 100;
    
    for (let i = 0; i < state.customers.length; i += batchSize) {
        const batch = db.batch();
        const chunk = state.customers.slice(i, i + batchSize);
        chunk.forEach(cust => {
            const docRef = db.collection('customers').doc(cust.id);
            batch.set(docRef, cust);
        });
        await batch.commit();
    }

    for (let i = 0; i < state.inspections.length; i += batchSize) {
        const batch = db.batch();
        const chunk = state.inspections.slice(i, i + batchSize);
        chunk.forEach(insp => {
            const docRef = db.collection('inspections').doc(insp.id);
            batch.set(docRef, insp);
        });
        await batch.commit();
    }

    for (let i = 0; i < state.parts.length; i += batchSize) {
        const batch = db.batch();
        const chunk = state.parts.slice(i, i + batchSize);
        chunk.forEach(part => {
            const docRef = db.collection('parts').doc(part.id);
            batch.set(docRef, part);
        });
        await batch.commit();
    }
}

function clearFirebaseConfig() {
    if (!confirm('클라우드 동기화 설정을 해제하고 로컬 모드로 전환하시겠습니까?\n(클라우드 데이터는 보존되며, 로컬 저장소의 데이터를 이어서 사용합니다.)')) {
        return;
    }

    if (customersUnsubscribe) {
        customersUnsubscribe();
        customersUnsubscribe = null;
    }
    if (inspectionsUnsubscribe) {
        inspectionsUnsubscribe();
        inspectionsUnsubscribe = null;
    }
    if (partsUnsubscribe) {
        partsUnsubscribe();
        partsUnsubscribe = null;
    }
    if (settingsUnsubscribe) {
        settingsUnsubscribe();
        settingsUnsubscribe = null;
    }

    if (firebase.apps.length > 0) {
        firebase.apps.forEach(app => {
            app.delete().catch(err => console.error("Firebase 앱 삭제 실패:", err));
        });
    }

    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    db = null;
    isCloudMode = false;

    loadData();
    updateSyncStatusUI();
    refreshAllViews();
    closeFirebaseModal();
    alert('클라우드 연동이 해제되었습니다. 로컬 모드로 전환합니다.');
}

// --- Image Compression & Viewer Helpers ---

function compressSerialImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600;
                let width = img.width;
                let height = img.height;
                
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG with 60% quality
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(dataUrl);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

function compressImage(base64Str, maxWidth = 600, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
        };
        img.onerror = function(err) {
            reject(err);
        };
    });
}

function openImageViewer(base64) {
    const backdrop = document.getElementById('imageViewerBackdrop');
    const img = document.getElementById('viewerImage');
    img.src = base64;
    backdrop.classList.add('active');
}

function closeImageViewer() {
    const backdrop = document.getElementById('imageViewerBackdrop');
    const img = document.getElementById('viewerImage');
    backdrop.classList.remove('active');
    setTimeout(() => {
        img.src = '';
    }, 300);
}

// --- Logic & Helpers for Uninspected Customers modal (Triggered by Dashboard Progress card) ---
window.openUninspectedModal = function() {
    const modal = document.getElementById('uninspectedModalBackdrop');
    const container = document.getElementById('uninspectedListContainer');
    const countSpan = document.getElementById('uninspectedCount');
    
    container.innerHTML = '';
    
    // Get current year and month
    const currentMonthStr = getLocalDateString().substring(0, 7); // "YYYY-MM"
    
    // Filter target customers (isMonthlyInspection !== false)
    const targetCustomers = state.customers.filter(c => c.isMonthlyInspection !== false);
    
    // Get inspected customer IDs this month
    const thisMonthInsps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(currentMonthStr));
    const inspectedIds = new Set(thisMonthInsps.map(i => i.customerId));
    
    // Filter uninspected customers
    const uninspected = targetCustomers.filter(c => !inspectedIds.has(c.id));
    
    // Sort alphabetically
    uninspected.sort((a, b) => a.name.localeCompare(b.name));
    
    countSpan.textContent = uninspected.length;
    
    if (uninspected.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">이번 달 점검 대상 업체의 점검이 모두 완료되었습니다! 🎉</p>';
    } else {
        uninspected.forEach(cust => {
            let copierModelStr = '-';
            if (cust.devices && cust.devices.length > 0) {
                const firstDev = cust.devices[0];
                copierModelStr = firstDev.model || '미지정';
                if (cust.devices.length > 1) {
                    copierModelStr += ` 외 ${cust.devices.length - 1}대`;
                }
            } else if (cust.copierModel) {
                copierModelStr = cust.copierModel;
            }

            const card = document.createElement('div');
            card.style.display = 'flex';
            card.style.justifyContent = 'space-between';
            card.style.alignItems = 'center';
            card.style.padding = '0.85rem 1rem';
            card.style.background = 'rgba(255, 255, 255, 0.02)';
            card.style.border = '1px solid var(--border-color)';
            card.style.borderRadius = 'var(--radius-md)';
            card.style.gap = '1rem';
            
            card.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:0.25rem;">
                    <span style="font-weight:600; font-size:0.95rem; color:var(--text-primary);">${cust.name}</span>
                    <span style="font-size:0.8rem; color:var(--text-secondary);">${copierModelStr} | ${cust.location || '위치 미지정'}</span>
                    ${cust.contact ? `<span style="font-size:0.75rem; color:var(--text-muted);"><i class="fa-solid fa-phone" style="margin-right:0.25rem;"></i>${cust.contact}</span>` : ''}
                </div>
                <button type="button" class="btn btn-primary" style="padding:0.4rem 0.75rem; font-size:0.8rem; border-radius:6px; flex-shrink:0; cursor:pointer;" onclick="registerInspectionForCustomer('${cust.id}')">
                    <i class="fa-solid fa-file-signature"></i> 점검
                </button>
            `;
            container.appendChild(card);
        });
    }
    
    modal.classList.add('active');
};

window.closeUninspectedModal = function() {
    document.getElementById('uninspectedModalBackdrop').classList.remove('active');
};

window.registerInspectionForCustomer = function(customerId) {
    window.closeUninspectedModal();
    openInspectionModal(null, customerId);
};

// --- Monthly Report Generation & Export PDF ---

function adjustReportScale() {
    const container = document.querySelector('.report-paper-container');
    const paper = document.getElementById('reportPrintArea');
    if (!container || !paper) return;
    
    // Skip scaling adjustments while exporting PDF
    if (container.classList.contains('report-exporting')) return;
    
    const containerWidth = container.offsetWidth;
    const targetWidth = 820; // Original width of report-paper
    const availableWidth = containerWidth - 16; // 8px margin on each side
    
    if (availableWidth < targetWidth && availableWidth > 100) {
        const scaleVal = availableWidth / targetWidth;
        paper.style.transform = `scale(${scaleVal})`;
        
        // Scale reduces visual size but does not change layout box flow.
        // We must calculate original height and scale it to prevent giant blank space under the paper.
        const paperHeight = paper.scrollHeight;
        container.style.height = (paperHeight * scaleVal + 32) + 'px';
    } else {
        paper.style.transform = 'none';
        container.style.height = 'auto';
    }
}

function generateMonthlyReport() {
    try {
        const selectedMonth = document.getElementById('reportMonthFilter').value;
        const printArea = document.getElementById('reportPrintArea');
    
    if (!selectedMonth) {
        alert('대상 월을 선택해 주세요.');
        return;
    }

    // Filter inspections for the selected month
    const filteredInsps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(selectedMonth));
    
    if (filteredInsps.length === 0) {
        printArea.innerHTML = `
            <div class="report-placeholder">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 1rem; color: var(--warning);"></i>
                <p>선택하신 월(${selectedMonth})에 등록된 점검 기록이 없습니다.</p>
            </div>
        `;
        
        // Reset scale style
        const container = document.querySelector('.report-paper-container');
        if (container) {
            container.style.height = 'auto';
            printArea.style.transform = 'none';
        }
        return;
    }

    // Sort inspections chronologically by date safely
    filteredInsps.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.id || '').localeCompare(b.id || '');
    });

    // Calculate metrics
    const totalCustomers = state.customers.filter(c => c.isMonthlyInspection !== false).length;
    const inspectedCount = filteredInsps.length;
    const progressRate = totalCustomers > 0 ? Math.round((inspectedCount / totalCustomers) * 100) : 0;
    
    const totalBwUsage = filteredInsps.reduce((sum, i) => sum + i.bwUsage, 0);
    const totalColorUsage = filteredInsps.reduce((sum, i) => sum + i.colorUsage, 0);
    
    // Calculate total excesses and parts costs
    let totalBwOver = 0;
    let totalColorOver = 0;
    let totalPartCost = 0;

    filteredInsps.forEach(insp => {
        const cust = state.customers.find(c => String(c.id) === String(insp.customerId));
        if (cust && cust.devices) {
            const dev = cust.devices.find(d => String(d.id) === String(insp.deviceId)) || cust.devices[0];
            if (dev) {
                const bwOver = Math.max(0, Number(insp.bwUsage || 0) - Number(dev.contractBw || 0));
                const colorOver = Math.max(0, Number(insp.colorUsage || 0) - Number(dev.contractColor || 0));
                totalBwOver += bwOver;
                totalColorOver += colorOver;
            }
        }
        
        if (insp.parts && Array.isArray(insp.parts)) {
            insp.parts.forEach(p => {
                totalPartCost += (Number(p.price || 0) * Number(p.quantity || 0));
            });
        }
    });

    // Group inspections by customer
    const groupedInspections = {};
    filteredInsps.forEach(insp => {
        if (!groupedInspections[insp.customerId]) {
            groupedInspections[insp.customerId] = [];
        }
        groupedInspections[insp.customerId].push(insp);
    });

    // Formatting date strings
    const reportYear = selectedMonth.split('-')[0];
    const reportMonth = selectedMonth.split('-')[1];
    const today = getLocalDateString();

    // Build Report Content HTML
    let tableRowsHtml = '';
    
    let grandTotalBilling = 0;
    let totalDiscountSum = 0;
    filteredInsps.forEach(insp => {
        totalDiscountSum += Number(insp.discountAmount || 0);
    });

    // Render each inspection as an independent row sorted by date
    filteredInsps.forEach((insp, idx) => {
        const customerId = insp.customerId;
        const cust = state.customers.find(c => String(c.id) === String(customerId));
        const customerName = cust ? cust.name : '알 수 없음';
        
        const dev = cust && cust.devices ? cust.devices.find(d => String(d.id) === String(insp.deviceId)) : null;
        const model = dev ? `${dev.name} (${dev.model})` : '-';
        
        let partsText = '-';
        if (insp.parts && Array.isArray(insp.parts) && insp.parts.length > 0) {
            partsText = insp.parts.map(p => `${p.name} x${p.quantity}<br>(₩${(Number(p.price || 0) * Number(p.quantity || 0)).toLocaleString()})`).join('<br>');
        }
        
        const bwCounterVal = Number(insp.bwCounter) || 0;
        const bwUsageVal = Number(insp.bwUsage) || 0;
        const colorCounterVal = Number(insp.colorCounter) || 0;
        const colorUsageVal = Number(insp.colorUsage) || 0;
        
        // Calculate device-specific billing
        const vatEnabled = cust ? cust.vatEnabled !== false : true;
        const baseRent = dev ? Number(dev.price || 0) : 0;
        
        const devBwOver = dev ? Math.max(0, bwUsageVal - Number(dev.contractBw || 0)) : 0;
        const devColorOver = dev ? Math.max(0, colorUsageVal - Number(dev.contractColor || 0)) : 0;
        
        const devBwOverFee = dev ? devBwOver * Number(dev.overBwPrice || 0) : 0;
        const devColorOverFee = dev ? devColorOver * Number(dev.overColorPrice || 0) : 0;
        
        const devPartsCost = insp.parts && Array.isArray(insp.parts) ? insp.parts.reduce((sum, p) => sum + (Number(p.price || 0) * Number(p.quantity || 0)), 0) : 0;
        const devDiscount = Number(insp.discountAmount || 0);
        
        let devSubtotal = baseRent + devBwOverFee + devColorOverFee + devPartsCost - devDiscount;
        devSubtotal = Math.max(0, devSubtotal);
        const devVat = vatEnabled ? Math.floor(devSubtotal * 0.1) : 0;
        let devTotal = devSubtotal + devVat;
        devTotal = Math.floor(devTotal / 100) * 100;
        
        grandTotalBilling += devTotal;
        
        const bwOverBadge = devBwOver > 0 ? `<div style="margin-top:0.25rem;"><span class="paper-badge paper-badge-danger">+${devBwOver.toLocaleString()}(흑백)</span></div>` : '';
        const colorOverBadge = devColorOver > 0 ? `<div style="margin-top:0.25rem;"><span class="paper-badge paper-badge-danger">+${devColorOver.toLocaleString()}(컬러)</span></div>` : '';
        const discountVal = Number(insp.discountAmount) || 0;
        const discountBadge = discountVal > 0 ? `<div style="margin-top:0.25rem;"><span class="paper-badge" style="background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; font-size:0.6rem; padding: 0.1rem 0.25rem; font-weight:600; border-radius:3px; display:inline-block;">D/C -₩${discountVal.toLocaleString()}</span></div>` : '';

        tableRowsHtml += `
            <tr>
                <td class="center">${idx + 1}</td>
                <td class="center" style="font-size:0.68rem; letter-spacing:-0.5px;">${insp.date || '-'}</td>
                <td style="font-weight:600; font-size:0.75rem; word-break:break-all;">${customerName}</td>
                <td class="center" style="font-size:0.68rem; color:#475569;">${model}</td>
                <td class="right" style="line-height:1.25;">
                    <div style="font-weight:600;">${bwCounterVal.toLocaleString()}</div>
                    <div style="font-size:0.65rem; color:#22c55e; display:flex; align-items:center; justify-content:flex-end; gap:0.15rem; margin-top:0.1rem;">
                        <span>+${bwUsageVal.toLocaleString()}</span>
                    </div>
                </td>
                <td class="right" style="line-height:1.25;">
                    <div style="font-weight:600;">${colorCounterVal.toLocaleString()}</div>
                    <div style="font-size:0.65rem; color:#a855f7; display:flex; align-items:center; justify-content:flex-end; gap:0.15rem; margin-top:0.1rem;">
                        <span>+${colorUsageVal.toLocaleString()}</span>
                    </div>
                </td>
                <td style="font-size:0.65rem; line-height:1.2; word-break:break-all;">${partsText}</td>
                <td class="right">
                    <div style="font-weight:600; color:#0f172a;">₩${devTotal.toLocaleString()}</div>
                    <div style="font-size:0.65rem; color:var(--text-secondary); margin-top:0.1rem;">${vatEnabled ? '(VAT포함)' : '(VAT면세)'}</div>
                    ${bwOverBadge}
                    ${colorOverBadge}
                    ${discountBadge}
                </td>
                <td class="center">
                    <button class="btn-icon btn-secondary" onclick="openInvoiceModal('${customerId}', '${selectedMonth}')" title="거래명세서 발급" style="padding: 0.3rem 0.5rem; font-size: 0.75rem; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-weight:600;">
                        <i class="fa-solid fa-file-invoice-dollar" style="color:#10b981;"></i> 발급
                    </button>
                </td>
            </tr>
        `;
    });

    const reportHtml = `
        <div class="report-header-section">
            <h1>복사기 정기점검 및 사용량 보고서</h1>
            <div style="font-size: 1.15rem; font-weight: 600; color: #1e293b; margin-top: 0.5rem;">
                - ${reportYear}년 ${reportMonth}월분 전체 사용 결과 보고 -
            </div>
            <div class="report-meta-info">
                <span>보고서 생성일: ${today}</span>
                <span style="font-weight: 600;">점검 책임 업체: SmartCounter 관리부</span>
            </div>
        </div>

        <div class="report-section-title">
            <span><i class="fa-solid fa-chart-column"></i> 월간 점검 요약 지표</span>
        </div>
        <div class="report-summary-grid">
            <div class="report-summary-card">
                <h4>점검 진행 현황</h4>
                <div class="value">${inspectedCount} / ${totalCustomers} 개소</div>
                <div class="sub-value">정기점검 진행률 ${progressRate}%</div>
            </div>
            <div class="report-summary-card">
                <h4>총 복사 사용량</h4>
                <div class="value" style="font-size:1.05rem; line-height:1.3;">
                    흑백: ${totalBwUsage.toLocaleString()}매<br>
                    컬러: ${totalColorUsage.toLocaleString()}매
                </div>
            </div>
            <div class="report-summary-card">
                <h4>계약 초과 사용량</h4>
                <div class="value" style="font-size:1.05rem; line-height:1.3; color:#ef4444;">
                    흑백: +${totalBwOver.toLocaleString()}매<br>
                    컬러: +${totalColorOver.toLocaleString()}매
                </div>
            </div>
            <div class="report-summary-card">
                <h4>월간 청구 금액</h4>
                <div class="value" style="color:#2563eb; font-size:1.1rem;">₩${grandTotalBilling.toLocaleString()}</div>
                <div class="sub-value">당월 청구 금액 합계</div>
            </div>
        </div>

        <div class="report-section-title">
            <span><i class="fa-solid fa-list-check"></i> 고객사별 점검 및 복사기 사용 상세 내역</span>
            <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">* 사용량은 직전 점검 카운터 기준 차이값입니다.</span>
        </div>
        <div class="report-table-wrapper">
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width: 30px;">순번</th>
                        <th style="width: 75px;">점검일</th>
                        <th style="width: 125px;">고객사명</th>
                        <th style="width: 70px;">기기 모델</th>
                        <th style="width: 120px;">흑백 카운터 / 사용량</th>
                        <th style="width: 120px;">컬러 카운터 / 사용량</th>
                        <th style="width: 130px;">교체 부품</th>
                        <th style="width: 90px;">청구 금액</th>
                        <th style="width: 80px;">명세서</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
                <tfoot>
                    <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1;">
                        <td colspan="4" style="text-align: center;">합계</td>
                        <td class="right" style="color: #22c55e;">+${totalBwUsage.toLocaleString()} 매</td>
                        <td class="right" style="color: #a855f7;">+${totalColorUsage.toLocaleString()} 매</td>
                        <td class="right" style="color: #ef4444; font-size: 0.7rem; font-weight: bold; vertical-align: middle;">
                            ${totalDiscountSum > 0 ? `총 D/C: -₩${totalDiscountSum.toLocaleString()}` : ''}
                        </td>
                        <td class="right" style="color: #0f172a; font-size: 0.85rem; line-height: 1.3;">
                            <div>₩${grandTotalBilling.toLocaleString()}</div>
                            <div style="font-size:0.65rem; color:#64748b; font-weight:normal; margin-top:0.15rem;">(D/C 및 VAT 반영)</div>
                        </td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <div class="report-signature-section">
            <div style="font-weight: 700; font-size: 0.85rem; color:#0f172a; margin-bottom: 0.5rem; line-height:1.4;">
                위와 같이 ${reportYear}년 ${reportMonth}월 정기 점검 사용 카운터 및 소모 부품 내역을 보고하며, 해당 내용을 상호 확인합니다.
            </div>
            <table class="report-signature-table">
                <tr>
                    <td>
                        <div style="font-weight:700; margin-bottom:0.75rem;">보고자 (점검 수탁인)</div>
                        <div class="signature-box">SmartCounter 점검원 (서명/인)</div>
                    </td>
                    <td>
                        <div style="font-weight:700; margin-bottom:0.75rem;">확인자 (관리 위탁인)</div>
                        <div class="signature-box">고객사 관리 담당자 (서명/인)</div>
                    </td>
                </tr>
            </table>
        </div>
    `;

    printArea.innerHTML = reportHtml;
    
    // Recalculate scaling for current screen width
    setTimeout(adjustReportScale, 20);
    } catch (error) {
        console.error("월간 리포트 생성 중 오류 발생:", error);
        alert("월간 리포트 생성 중 오류가 발생했습니다: " + error.message);
    }
}

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) 
        || window.innerWidth <= 768;
}

function isInAppBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.indexOf('kakaotalk') > -1 || ua.indexOf('line') > -1 || ua.indexOf('instagram') > -1 || ua.indexOf('fb') > -1;
}



// ==========================================
// INVOICE LOGIC
// ==========================================

let currentInvoiceData = null;

function numToKoreanStr(num) {
    const hanA = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
    const danA = ["", "십", "백", "천"];
    let result = "";
    const str = String(Math.floor(num));
    let groupStr = "";
    
    for (let i = 0; i < str.length; i++) {
        const digit = parseInt(str[i], 10);
        const dan = (str.length - 1 - i) % 4;
        
        if (digit !== 0) {
            groupStr += hanA[digit] + danA[dan];
        }
        
        if (dan === 0) {
            if (groupStr !== "") {
                const unit = ["", "만", "억", "조", "경"][Math.floor((str.length - 1 - i) / 4)];
                result += groupStr + unit;
            }
            groupStr = "";
        }
    }
    return result || "영";
}

function openInvoiceModal(customerId, month, deviceId = null) {
    const cust = state.customers.find(c => c.id === customerId);
    if (!cust) return;

    // Default to today if month isn't fully given or is just for current context
    const insps = state.inspections.filter(i => {
        const matchesCustomer = i.customerId === customerId;
        const matchesMonth = i.date && typeof i.date === 'string' && i.date.startsWith(month);
        const matchesDevice = deviceId ? String(i.deviceId) === String(deviceId) : true;
        return matchesCustomer && matchesMonth && matchesDevice;
    });
    if (insps.length === 0) return;

    currentInvoiceData = { insps, cust, month, deviceId };

    const issueDateStr = getLocalDateString();
    const issueDateArr = issueDateStr.split('-');
    const issueDateFormatted = `${issueDateArr[0]}년 ${issueDateArr[1]}월 ${issueDateArr[2]}일`;

    const vatEnabled = cust.vatEnabled !== false;

    let html = '';
    let subTotal = 0;

    // Group inspections by device
    const deviceUsages = {};
    insps.forEach(insp => {
        if (!deviceUsages[insp.deviceId]) {
            deviceUsages[insp.deviceId] = { bw: 0, color: 0, parts: [] };
        }
        deviceUsages[insp.deviceId].bw += insp.bwUsage;
        deviceUsages[insp.deviceId].color += insp.colorUsage;
        if (insp.parts && Array.isArray(insp.parts)) {
            deviceUsages[insp.deviceId].parts.push(...insp.parts);
        }
    });

    if (cust.devices && cust.devices.length > 0) {
        cust.devices.forEach(dev => {
            // 특정 기기만 청구할 때 다른 기기는 스킵
            if (deviceId && String(dev.id) !== String(deviceId)) return;
            // 1. Base rent
            const price = dev.price || 0;
            if (price > 0) {
                const vatAmt = vatEnabled ? Math.floor(price * 0.1) : 0;
                html += `
                    <tr>
                        <td class="text-left">${dev.name} 임대료</td>
                        <td>식</td>
                        <td>1</td>
                        <td class="text-right">${price.toLocaleString()}</td>
                        <td class="text-right">${price.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += price;
            }

            // 2. Overages
            const usage = deviceUsages[dev.id] || { bw: 0, color: 0 };
            const bwOver = Math.max(0, usage.bw - (dev.contractBw || 0));
            const colorOver = Math.max(0, usage.color - (dev.contractColor || 0));
            const overBwPrice = dev.overBwPrice || 0;
            const overColorPrice = dev.overColorPrice || 0;

            if (bwOver > 0 && overBwPrice > 0) {
                const amt = bwOver * overBwPrice;
                const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
                html += `
                    <tr>
                        <td class="text-left">${dev.name} 흑백 초과</td>
                        <td>매</td>
                        <td>${bwOver.toLocaleString()}</td>
                        <td class="text-right">${overBwPrice.toLocaleString()}</td>
                        <td class="text-right">${amt.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += amt;
            }

            if (colorOver > 0 && overColorPrice > 0) {
                const amt = colorOver * overColorPrice;
                const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
                html += `
                    <tr>
                        <td class="text-left">${dev.name} 컬러 초과</td>
                        <td>매</td>
                        <td>${colorOver.toLocaleString()}</td>
                        <td class="text-right">${overColorPrice.toLocaleString()}</td>
                        <td class="text-right">${amt.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += amt;
            }
        });
    }

    // 3. Parts
    insps.forEach(insp => {
        if (insp.parts && Array.isArray(insp.parts) && insp.parts.length > 0) {
            insp.parts.forEach(p => {
                const amt = p.price * p.quantity;
                const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
                html += `
                    <tr>
                        <td class="text-left">${p.name}</td>
                        <td>개</td>
                        <td>${p.quantity.toLocaleString()}</td>
                        <td class="text-right">${p.price.toLocaleString()}</td>
                        <td class="text-right">${amt.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += amt;
            });
        }
    });

    // 4. Discount (D/C)
    let totalDiscount = 0;
    insps.forEach(insp => {
        const disc = Number(insp.discountAmount || 0);
        if (disc > 0) {
            const vatAmt = vatEnabled ? Math.floor(disc * 0.1) : 0;
            html += `
                <tr style="color: #dc2626; font-weight: 500;">
                    <td class="text-left">[할인] 추가요금 D/C</td>
                    <td>식</td>
                    <td>1</td>
                    <td class="text-right">-${disc.toLocaleString()}</td>
                    <td class="text-right">-${disc.toLocaleString()}</td>
                    <td class="text-right">-${vatAmt.toLocaleString()}</td>
                </tr>
            `;
            totalDiscount += disc;
        }
    });
    subTotal = Math.max(0, subTotal - totalDiscount);

    // Fill empty rows to make it look like a standard receipt (8 rows)
    const rowCount = (html.match(/<tr/g) || []).length;
    for (let i = rowCount; i < 8; i++) {
        html += `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }

    const vat = vatEnabled ? Math.floor(subTotal * 0.1) : 0;
    let total = subTotal + vat;
    total = Math.floor(total / 100) * 100;

    // Counter table at the bottom
    let counterHtml = `
        <div class="ti-counter-title"><i class="fa-solid fa-list-ol"></i> 당월 기기 카운터 내역</div>
        <table class="ti-counter-table">
            <tr>
                <th>기기명</th>
                <th>점검일</th>
                <th>흑백 카운터</th>
                <th>흑백 사용량</th>
                <th>컬러 카운터</th>
                <th>컬러 사용량</th>
            </tr>
    `;
    insps.forEach(insp => {
        const dev = cust.devices ? cust.devices.find(d => String(d.id) === String(insp.deviceId)) : null;
        const devName = dev ? dev.name : '-';
        counterHtml += `
            <tr>
                <td>${devName}</td>
                <td>${insp.date}</td>
                <td>${insp.bwCounter.toLocaleString()}</td>
                <td>+${insp.bwUsage.toLocaleString()}</td>
                <td>${insp.colorCounter.toLocaleString()}</td>
                <td>+${insp.colorUsage.toLocaleString()}</td>
            </tr>
        `;
    });
    counterHtml += `</table>`;
    
    const data = {
        issueDate: issueDateFormatted,
        customerName: cust.name,
        itemsBody: html,
        totalAmountText: `${numToKoreanStr(total)}원`,
        totalAmountNum: `${total.toLocaleString()}`,
        counterArea: counterHtml
    };
    renderInvoiceTemplate(document.getElementById('invoicePrintArea'), data);

    // Setup events
    document.getElementById('invPrintBtn').onclick = () => {
        if (isInAppBrowser()) {
            alert('카카오톡/네이버 등 모바일 인앱 브라우저에서는 PDF 인쇄 기능이 제한될 수 있습니다.\n외부 브라우저(Safari, Chrome 등)를 통해 접속하시거나 "이미지 다운로드" 기능을 이용해 주세요.');
        }
        document.body.classList.add('print-invoice');
        const cleanupPrint = () => {
            document.body.classList.remove('print-invoice');
            window.removeEventListener('afterprint', cleanupPrint);
        };
        window.addEventListener('afterprint', cleanupPrint);
        setTimeout(() => {
            window.print();
            setTimeout(cleanupPrint, 3000); // afterprint 미발생 브라우저 백업
        }, 50);
    };

    document.getElementById('invImageBtn').onclick = () => {
        downloadInvoiceImage();
    };

    document.getElementById('invEmailBtn').onclick = () => {
        downloadInvoiceImage();
        setTimeout(() => {
            sendInvoiceEmail(cust.name, month, total);
        }, 800);
    };

    document.getElementById('invoiceModalBackdrop').classList.add('active');
}

function closeInvoiceModal() {
    document.getElementById('invoiceModalBackdrop').classList.remove('active');
}

// 모바일 기기 판단 유틸
function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}

// 인앱 브라우저 판단 유틸
function isInAppBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    return (ua.indexOf('kakao') > -1 || ua.indexOf('naver') > -1 || ua.indexOf('line') > -1 || ua.indexOf('fb') > -1 || ua.indexOf('instagram') > -1);
}

window.closeMobileImageModal = function() {
    const modal = document.getElementById('mobileImageModalBackdrop');
    if (modal) modal.classList.remove('active');
};

function downloadInvoiceImage() {
    const element = document.getElementById('invoicePrintArea');
    if (!element) return;

    // 모바일 렌더링 시 너비를 800px로 일치시켜 html2canvas가 찌그러진 뷰포트 크기로 렌더링하는 것을 방지
    const opt = {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        backgroundColor: '#ffffff',
        width: 800,
        windowWidth: 800
    };

    // Show loading overlay
    const overlay = document.getElementById('imageLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';

    if (typeof html2canvas === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => execDownloadInvoice(element, opt, overlay);
        document.head.appendChild(script);
    } else {
        execDownloadInvoice(element, opt, overlay);
    }
}

function execDownloadInvoice(element, opt, overlay) {
    html2canvas(element, opt).then(canvas => {
        if (overlay) overlay.style.display = 'none';

        const custName = currentInvoiceData ? currentInvoiceData.cust.name : '고객사';
        let monthStr = '00';
        if (currentInvoiceData) {
            if (currentInvoiceData.month) {
                const parts = currentInvoiceData.month.split('-');
                monthStr = parts[1] || parts[0];
            } else if (currentInvoiceData.insp && currentInvoiceData.insp.date) {
                const parts = currentInvoiceData.insp.date.split('-');
                monthStr = parts[1] || '00';
            }
        }

        let deviceSuffix = '';
        if (currentInvoiceData && currentInvoiceData.deviceId) {
            const dev = currentInvoiceData.cust.devices ? currentInvoiceData.cust.devices.find(d => String(d.id) === String(currentInvoiceData.deviceId)) : null;
            if (dev) {
                deviceSuffix = `_${dev.name}`;
            }
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

        // 모바일 기기이거나 인앱 브라우저인 경우 다운로드(a tag click) 대신 저장 안내 모달 띄우기
        if (isMobileDevice() || isInAppBrowser()) {
            const mobileModal = document.getElementById('mobileImageModalBackdrop');
            const mobileImg = document.getElementById('mobileInvoiceImg');
            if (mobileModal && mobileImg) {
                mobileImg.src = dataUrl;
                mobileModal.classList.add('active');
            } else {
                // 모달이 없을 경우 새 창으로 대체
                const newWindow = window.open();
                if (newWindow) {
                    newWindow.document.write(`<img src="${dataUrl}" style="width:100%; height:auto;" alt="거래명세서 이미지"><p style="text-align:center; font-size:1.2rem; font-weight:bold; margin-top:20px;">이미지를 길게 누르면 기기에 저장하실 수 있습니다.</p>`);
                } else {
                    alert('새 창 차단을 해제해 주시거나 PC 환경에서 다운로드 해주세요.');
                }
            }
        } else {
            const link = document.createElement('a');
            link.download = `거래명세서_${custName}${deviceSuffix}_${monthStr}월.jpg`;
            link.href = dataUrl;
            link.click();
        }
    }).catch(err => {
        console.error("명세서 이미지 다운로드 에러:", err);
        alert("이미지 생성을 실패했습니다. 인쇄 기능을 사용해주세요.");
        if (overlay) overlay.style.display = 'none';
    });
}

function sendInvoiceEmail(customerName, month, totalAmt) {
    // month가 YYYY-MM 형태일 수도 있으므로 split 가드
    let monthVal = month || '00';
    if (monthVal && typeof monthVal === 'string' && monthVal.includes('-')) {
        monthVal = monthVal.split('-')[1];
    }
    
    if (isInAppBrowser()) {
        alert('카카오톡/네이버 등 모바일 인앱 브라우저에서는 이메일 연동이 보안상 차단될 수 있습니다.\n화면 우측 상단의 메뉴를 눌러 "다른 브라우저(Chrome, Safari 등)로 열기"를 하신 후 재시도하시거나, 이미지를 저장하여 직접 전송해주세요.');
    }

    let deviceSuffix = '';
    if (currentInvoiceData && currentInvoiceData.deviceId) {
        const dev = currentInvoiceData.cust.devices ? currentInvoiceData.cust.devices.find(d => String(d.id) === String(currentInvoiceData.deviceId)) : null;
        if (dev) {
            deviceSuffix = ` (${dev.name})`;
        }
    }

    const subject = encodeURIComponent(`[SmartCounter] ${customerName}${deviceSuffix} ${monthVal}월분 복사기 유지보수 및 청구 내역`);
    const body = encodeURIComponent(`안녕하세요, ${customerName} 담당자님.\n\n${monthVal}월분 복사기 정기점검 및 유지보수 청구 내역(거래명세서)을 안내해 드립니다.\n청구 금액: ${totalAmt.toLocaleString()}원\n\n상세 내역은 첨부해 드린 거래명세서 파일을 참고해 주시기 바랍니다.\n\n감사합니다.\nSmartCounter 관리부 드림.`);
    
    // Gmail 웹 작성 페이지 열기 (새 탭)
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`;
    window.open(gmailUrl, '_blank');
    
    alert('구글 Gmail 작성 창이 새 탭(창)으로 열립니다.\n\n[파일 첨부 안내]\n보안 정책상 메일에 파일이 자동으로 첨부되지는 않으므로, 방금 자동 다운로드(저장)된 거래명세서 이미지 파일을 새로 열린 Gmail 창에 마우스로 끌어다 놓거나(드래그) 첨부 버튼을 눌러 직접 첨부해 주세요!');
}

// --- Manual Invoice Logic ---

window.calculateManualRowAmount = function(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    const amountInput = row.querySelector('.item-amount');
    if (qtyInput && priceInput && amountInput) {
        const qty = parseInt(qtyInput.value, 10) || 0;
        const price = parseInt(priceInput.value, 10) || 0;
        amountInput.value = (qty * price).toLocaleString();
    }
};

window.addManualInvoiceItemRow = function(date = '', name = '', unit = '개', qty = 1, price = 0, note = '') {
    const tbody = document.getElementById('manualInvoiceItemsTbody');
    if (!tbody) return;

    const rowId = 'manual-row-' + Date.now() + Math.random().toString(36).substring(2, 7);
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.innerHTML = `
        <td style="padding: 0.4rem 0.2rem;"><input type="number" class="form-control item-date" min="1" max="31" value="${date}" placeholder="일" required style="padding: 0.35rem 0.5rem; text-align:center;"></td>
        <td style="padding: 0.4rem 0.2rem;"><input type="text" class="form-control item-name" value="${name}" placeholder="예: 잉크 납품, A4 용지 등" required style="padding: 0.35rem 0.5rem;"></td>
        <td style="padding: 0.4rem 0.2rem;"><input type="text" class="form-control item-unit" value="${unit}" placeholder="규격" style="padding: 0.35rem 0.5rem; text-align:center;"></td>
        <td style="padding: 0.4rem 0.2rem;"><input type="number" class="form-control item-qty" min="1" value="${qty}" required oninput="calculateManualRowAmount('${rowId}')" style="padding: 0.35rem 0.5rem; text-align:right;"></td>
        <td style="padding: 0.4rem 0.2rem;"><input type="number" class="form-control item-price" min="0" value="${price}" required oninput="calculateManualRowAmount('${rowId}')" style="padding: 0.35rem 0.5rem; text-align:right;"></td>
        <td style="padding: 0.4rem 0.2rem;"><input type="text" class="form-control item-amount" readonly style="padding: 0.35rem 0.5rem; text-align:right; background: rgba(255,255,255,0.05); border:none;" value="${(qty * price).toLocaleString()}"></td>
        <td style="padding: 0.4rem 0.2rem;"><input type="text" class="form-control item-note" value="${note}" placeholder="비고" style="padding: 0.35rem 0.5rem;"></td>
        <td style="padding: 0.4rem 0.2rem; text-align:center;">
            <button type="button" class="btn-icon btn-danger" onclick="removeManualInvoiceItemRow('${rowId}')" style="width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.removeManualInvoiceItemRow = function(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
};

window.openManualInvoiceModal = function() {
    const modal = document.getElementById('manualInvoiceModalBackdrop');
    if (!modal) return;
    
    // Reset form
    document.getElementById('manualInvoiceForm').reset();
    
    // Fill customer select
    const select = document.getElementById('manualInvoiceCustomerSelect');
    select.innerHTML = '<option value="">-- 고객사를 선택하세요 --</option>';
    const sorted = [...state.customers].sort((a,b) => a.name.localeCompare(b.name));
    sorted.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
    
    // Default month to current month
    const todayStr = getLocalDateString();
    document.getElementById('manualInvoiceDate').value = todayStr.substring(0, 7);
    
    // Clear item table body & add one empty row
    const tbody = document.getElementById('manualInvoiceItemsTbody');
    tbody.innerHTML = '';
    addManualInvoiceItemRow('', '', '개', 1, 0, '');
    
    modal.classList.add('active');
};

window.closeManualInvoiceModal = function() {
    const modal = document.getElementById('manualInvoiceModalBackdrop');
    if (modal) modal.classList.remove('active');
};

window.handleManualInvoiceCustomerChange = function() {
    const custId = document.getElementById('manualInvoiceCustomerSelect').value;
    const cust = state.customers.find(c => c.id === custId);
    const vatCheckbox = document.getElementById('manualInvoiceVatEnabled');
    if (cust && vatCheckbox) {
        vatCheckbox.checked = cust.vatEnabled !== false;
    }
};

async function handleManualInvoiceFormSubmit(e) {
    e.preventDefault();
    
    const custId = document.getElementById('manualInvoiceCustomerSelect').value;
    const month = document.getElementById('manualInvoiceDate').value; // YYYY-MM
    const vatEnabled = document.getElementById('manualInvoiceVatEnabled').checked;
    
    const cust = state.customers.find(c => c.id === custId);
    if (!cust) return;
    
    const tbody = document.getElementById('manualInvoiceItemsTbody');
    const rows = tbody.querySelectorAll('tr');
    
    const items = [];
    rows.forEach(row => {
        const dateDay = parseInt(row.querySelector('.item-date').value, 10) || 1;
        const name = row.querySelector('.item-name').value.trim();
        const unit = row.querySelector('.item-unit').value.trim() || '개';
        const qty = parseInt(row.querySelector('.item-qty').value, 10) || 1;
        const price = parseInt(row.querySelector('.item-price').value, 10) || 0;
        const note = row.querySelector('.item-note').value.trim();
        
        // Format date as month split + day (e.g. "06/15")
        const formattedDate = `${month.split('-')[1]}/${String(dateDay).padStart(2, '0')}`;
        
        items.push({
            date: formattedDate,
            name,
            unit,
            quantity: qty,
            price,
            note
        });
    });
    
    if (items.length === 0) {
        alert('최소 1개 이상의 품목을 작성해 주세요.');
        return;
    }
    
    closeManualInvoiceModal();
    openManualInvoice(custId, month, vatEnabled, items);
}

function renderInvoiceTemplate(container, data) {
    if (!container) return;
    
    let template = invoiceConfig.templateHtml || defaultInvoiceTemplateHTML;
    
    const stampText = invoiceConfig.stampText || '하영통신';
    let stampHtml = '';
    if (stampText.length === 4) {
        stampHtml = `${stampText.substring(0, 2)}<br>${stampText.substring(2, 4)}<br>인`;
    } else {
        stampHtml = stampText.split('').join('<br>');
    }
    
    let html = template
        .replace(/{{TITLE}}/g, invoiceConfig.title || '거 래 명 세 표')
        .replace(/{{ISSUE_DATE}}/g, data.issueDate || '')
        .replace(/{{CUSTOMER_NAME}}/g, data.customerName || '')
        .replace(/{{ITEMS_BODY}}/g, data.itemsBody || '')
        .replace(/{{TOTAL_AMOUNT_TEXT}}/g, data.totalAmountText || '영원')
        .replace(/{{TOTAL_AMOUNT_NUM}}/g, data.totalAmountNum || '0')
        .replace(/{{COUNTER_AREA}}/g, data.counterArea || '')
        .replace(/{{SUPPLIER_REG_NO}}/g, invoiceConfig.regNo || '')
        .replace(/{{SUPPLIER_NAME}}/g, invoiceConfig.name || '')
        .replace(/{{SUPPLIER_CEO}}/g, invoiceConfig.ceo || '')
        .replace(/{{SUPPLIER_STAMP}}/g, stampHtml)
        .replace(/{{SUPPLIER_ADDRESS}}/g, invoiceConfig.address || '')
        .replace(/{{SUPPLIER_BIZ_TYPE}}/g, invoiceConfig.bizType || '')
        .replace(/{{SUPPLIER_BIZ_ITEM}}/g, invoiceConfig.bizItem || '')
        .replace(/{{FOOTER_GREETING}}/g, invoiceConfig.greeting || '')
        .replace(/{{FOOTER_ACCOUNT}}/g, invoiceConfig.account || '')
        .replace(/{{FOOTER_ACC_HOLDER}}/g, invoiceConfig.accHolder || '');
        
    container.innerHTML = html;
    
    // Apply color theme class
    container.classList.remove('theme-blue', 'theme-slate', 'theme-green');
    const theme = invoiceConfig.theme || 'blue';
    container.classList.add('theme-' + theme);
}

function renderInvoiceTemplateToString(data) {
    let template = invoiceConfig.templateHtml || defaultInvoiceTemplateHTML;
    
    const stampText = invoiceConfig.stampText || '하영통신';
    let stampHtml = '';
    if (stampText.length === 4) {
        stampHtml = `${stampText.substring(0, 2)}<br>${stampText.substring(2, 4)}<br>인`;
    } else {
        stampHtml = stampText.split('').join('<br>');
    }
    
    let html = template
        .replace(/{{TITLE}}/g, invoiceConfig.title || '거 래 명 세 표')
        .replace(/{{ISSUE_DATE}}/g, data.issueDate || '')
        .replace(/{{CUSTOMER_NAME}}/g, data.customerName || '')
        .replace(/{{ITEMS_BODY}}/g, data.itemsBody || '')
        .replace(/{{TOTAL_AMOUNT_TEXT}}/g, data.totalAmountText || '영원')
        .replace(/{{TOTAL_AMOUNT_NUM}}/g, data.totalAmountNum || '0')
        .replace(/{{COUNTER_AREA}}/g, data.counterArea || '')
        .replace(/{{SUPPLIER_REG_NO}}/g, invoiceConfig.regNo || '')
        .replace(/{{SUPPLIER_NAME}}/g, invoiceConfig.name || '')
        .replace(/{{SUPPLIER_CEO}}/g, invoiceConfig.ceo || '')
        .replace(/{{SUPPLIER_STAMP}}/g, stampHtml)
        .replace(/{{SUPPLIER_ADDRESS}}/g, invoiceConfig.address || '')
        .replace(/{{SUPPLIER_BIZ_TYPE}}/g, invoiceConfig.bizType || '')
        .replace(/{{SUPPLIER_BIZ_ITEM}}/g, invoiceConfig.bizItem || '')
        .replace(/{{FOOTER_GREETING}}/g, invoiceConfig.greeting || '')
        .replace(/{{FOOTER_ACCOUNT}}/g, invoiceConfig.account || '')
        .replace(/{{FOOTER_ACC_HOLDER}}/g, invoiceConfig.accHolder || '');
        
    const theme = invoiceConfig.theme || 'blue';
    return `
        <div class="bulk-invoice-page traditional-invoice theme-${theme}">
            ${html}
        </div>
    `;
}

function openManualInvoice(customerId, month, vatEnabled, items) {
    const cust = state.customers.find(c => c.id === customerId);
    if (!cust) return;

    const issueDateStr = getLocalDateString();
    const issueDateArr = issueDateStr.split('-');
    const issueDateFormatted = `${issueDateArr[0]}년 ${issueDateArr[1]}월 ${issueDateArr[2]}일`;

    let html = '';
    let subTotal = 0;

    items.forEach(item => {
        const amt = item.price * item.quantity;
        const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
        html += `
            <tr>
                <td class="text-left">${item.name}</td>
                <td>${item.unit}</td>
                <td>${item.quantity.toLocaleString()}</td>
                <td class="text-right">${item.price.toLocaleString()}</td>
                <td class="text-right">${amt.toLocaleString()}</td>
                <td class="text-right">${vatAmt.toLocaleString()}</td>
            </tr>
        `;
        subTotal += amt;
    });

    // Fill empty rows to make it look like a standard receipt (8 rows)
    const rowCount = items.length;
    for (let i = rowCount; i < 8; i++) {
        html += `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }

    const vat = vatEnabled ? Math.floor(subTotal * 0.1) : 0;
    const total = subTotal + vat;

    const data = {
        issueDate: issueDateFormatted,
        customerName: cust.name,
        itemsBody: html,
        totalAmountText: `${numToKoreanStr(total)}원`,
        totalAmountNum: `${total.toLocaleString()}`,
        counterArea: ''
    };
    renderInvoiceTemplate(document.getElementById('invoicePrintArea'), data);

    // Set currentInvoiceData mock so that download / email sends can read name and month
    currentInvoiceData = {
        isManual: true,
        cust: cust,
        month: month,
        total: total,
        date: issueDateStr,
        insp: { date: month + '-01' } // fallback for download filename
    };

    // Bind event handlers for manual invoice print/download/email buttons
    document.getElementById('invPrintBtn').onclick = () => {
        if (isInAppBrowser()) {
            alert('카카오톡/네이버 등 모바일 인앱 브라우저에서는 PDF 인쇄 기능이 제한될 수 있습니다.\n외부 브라우저(Safari, Chrome 등)를 통해 접속하시거나 "이미지 다운로드" 기능을 이용해 주세요.');
        }
        document.body.classList.add('print-invoice');
        const cleanupPrint = () => {
            document.body.classList.remove('print-invoice');
            window.removeEventListener('afterprint', cleanupPrint);
        };
        window.addEventListener('afterprint', cleanupPrint);
        setTimeout(() => {
            window.print();
            setTimeout(cleanupPrint, 3000); // afterprint 미발생 브라우저 백업
        }, 50);
    };

    document.getElementById('invImageBtn').onclick = () => {
        downloadInvoiceImage();
    };

    document.getElementById('invEmailBtn').onclick = () => {
        downloadInvoiceImage();
        setTimeout(() => {
            sendInvoiceEmail(cust.name, month, total);
        }, 800);
    };

    document.getElementById('invoiceModalBackdrop').classList.add('active');
}

// Helper to generate Invoice HTML for Bulk Print
function generateInvoiceHtmlForCustomer(cust, month, deviceId = null) {
    const insps = state.inspections.filter(i => {
        const matchesCustomer = i.customerId === cust.id;
        const matchesMonth = i.date && typeof i.date === 'string' && i.date.startsWith(month);
        const matchesDevice = deviceId ? String(i.deviceId) === String(deviceId) : true;
        return matchesCustomer && matchesMonth && matchesDevice;
    });
    if (insps.length === 0) return '';

    const issueDateStr = getLocalDateString();
    const issueDateArr = issueDateStr.split('-');
    const issueDateFormatted = `${issueDateArr[0]}년 ${issueDateArr[1]}월 ${issueDateArr[2]}일`;

    const vatEnabled = cust.vatEnabled !== false;
    let htmlItems = '';
    let subTotal = 0;

    // Group inspections by device
    const deviceUsages = {};
    insps.forEach(insp => {
        if (!deviceUsages[insp.deviceId]) {
            deviceUsages[insp.deviceId] = { bw: 0, color: 0, parts: [] };
        }
        deviceUsages[insp.deviceId].bw += insp.bwUsage;
        deviceUsages[insp.deviceId].color += insp.colorUsage;
        if (insp.parts && Array.isArray(insp.parts)) {
            deviceUsages[insp.deviceId].parts.push(...insp.parts);
        }
    });

    if (cust.devices && cust.devices.length > 0) {
        cust.devices.forEach(dev => {
            // 특정 기기만 청구할 때 다른 기기는 스킵
            if (deviceId && String(dev.id) !== String(deviceId)) return;
            // 1. Base rent
            const price = dev.price || 0;
            if (price > 0) {
                const vatAmt = vatEnabled ? Math.floor(price * 0.1) : 0;
                htmlItems += `
                    <tr>
                        <td class="text-left">${dev.name} 임대료</td>
                        <td>식</td>
                        <td>1</td>
                        <td class="text-right">${price.toLocaleString()}</td>
                        <td class="text-right">${price.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += price;
            }

            // 2. Overages
            const usage = deviceUsages[dev.id] || { bw: 0, color: 0 };
            const bwOver = Math.max(0, usage.bw - (dev.contractBw || 0));
            const colorOver = Math.max(0, usage.color - (dev.contractColor || 0));
            const overBwPrice = dev.overBwPrice || 0;
            const overColorPrice = dev.overColorPrice || 0;

            if (bwOver > 0 && overBwPrice > 0) {
                const amt = bwOver * overBwPrice;
                const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
                htmlItems += `
                    <tr>
                        <td class="text-left">${dev.name} 흑백 초과</td>
                        <td>매</td>
                        <td>${bwOver.toLocaleString()}</td>
                        <td class="text-right">${overBwPrice.toLocaleString()}</td>
                        <td class="text-right">${amt.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += amt;
            }

            if (colorOver > 0 && overColorPrice > 0) {
                const amt = colorOver * overColorPrice;
                const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
                htmlItems += `
                    <tr>
                        <td class="text-left">${dev.name} 컬러 초과</td>
                        <td>매</td>
                        <td>${colorOver.toLocaleString()}</td>
                        <td class="text-right">${overColorPrice.toLocaleString()}</td>
                        <td class="text-right">${amt.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += amt;
            }
        });
    }

    // 3. Parts
    insps.forEach(insp => {
        if (insp.parts && Array.isArray(insp.parts) && insp.parts.length > 0) {
            insp.parts.forEach(p => {
                const amt = p.price * p.quantity;
                const vatAmt = vatEnabled ? Math.floor(amt * 0.1) : 0;
                htmlItems += `
                    <tr>
                        <td class="text-left">${p.name}</td>
                        <td>개</td>
                        <td>${p.quantity.toLocaleString()}</td>
                        <td class="text-right">${p.price.toLocaleString()}</td>
                        <td class="text-right">${amt.toLocaleString()}</td>
                        <td class="text-right">${vatAmt.toLocaleString()}</td>
                    </tr>
                `;
                subTotal += amt;
            });
        }
    });

    // 4. Discount (D/C)
    let totalDiscount = 0;
    insps.forEach(insp => {
        const disc = Number(insp.discountAmount || 0);
        if (disc > 0) {
            const vatAmt = vatEnabled ? Math.floor(disc * 0.1) : 0;
            htmlItems += `
                <tr style="color: #dc2626; font-weight: 500;">
                    <td class="text-left">[할인] 추가요금 D/C</td>
                    <td>식</td>
                    <td>1</td>
                    <td class="text-right">-${disc.toLocaleString()}</td>
                    <td class="text-right">-${disc.toLocaleString()}</td>
                    <td class="text-right">-${vatAmt.toLocaleString()}</td>
                </tr>
            `;
            totalDiscount += disc;
        }
    });
    subTotal = Math.max(0, subTotal - totalDiscount);

    // Fill empty rows to make it look like a standard receipt (8 rows)
    const rowCount = (htmlItems.match(/<tr/g) || []).length;
    for (let i = rowCount; i < 8; i++) {
        htmlItems += `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }

    const vat = vatEnabled ? Math.floor(subTotal * 0.1) : 0;
    let total = subTotal + vat;
    total = Math.floor(total / 100) * 100;

    const totalAmountNum = `${total.toLocaleString()}`;
    const totalAmountText = `${numToKoreanStr(total)}원`;

    // Counter table
    let counterHtml = `
        <div class="ti-counter-title"><i class="fa-solid fa-list-ol"></i> 당월 기기 카운터 내역</div>
        <table class="ti-counter-table">
            <tr>
                <th>기기명</th>
                <th>점검일</th>
                <th>흑백 카운터</th>
                <th>흑백 사용량</th>
                <th>컬러 카운터</th>
                <th>컬러 사용량</th>
            </tr>
    `;
    insps.forEach(insp => {
        const dev = cust.devices ? cust.devices.find(d => String(d.id) === String(insp.deviceId)) : null;
        const devName = dev ? dev.name : '-';
        counterHtml += `
            <tr>
                <td>${devName}</td>
                <td>${insp.date}</td>
                <td>${insp.bwCounter.toLocaleString()}</td>
                <td>+${insp.bwUsage.toLocaleString()}</td>
                <td>${insp.colorCounter.toLocaleString()}</td>
                <td>+${insp.colorUsage.toLocaleString()}</td>
            </tr>
        `;
    });
    counterHtml += `</table>`;

    const data = {
        issueDate: issueDateFormatted,
        customerName: cust.name,
        itemsBody: htmlItems,
        totalAmountText: totalAmountText,
        totalAmountNum: totalAmountNum,
        counterArea: counterHtml
    };

    return renderInvoiceTemplateToString(data);
}

// Print All Invoices
window.printAllInvoices = function() {
    const selectedMonth = document.getElementById('reportMonthFilter').value;
    if (!selectedMonth) {
        alert("리포트 조회 월이 지정되지 않았습니다.");
        return;
    }

    const filteredInsps = state.inspections.filter(i => i.date && typeof i.date === 'string' && i.date.startsWith(selectedMonth));
    if (filteredInsps.length === 0) {
        alert("선택하신 월에 등록된 점검 기록이 없어 일괄 명세서를 발행할 수 없습니다.");
        return;
    }

    const customerIds = [...new Set(filteredInsps.map(i => i.customerId))];
    const activeCustomers = state.customers.filter(c => customerIds.includes(c.id));
    activeCustomers.sort((a, b) => a.name.localeCompare(b.name));

    let bulkHtml = '';
    activeCustomers.forEach(cust => {
        bulkHtml += generateInvoiceHtmlForCustomer(cust, selectedMonth);
    });

    const bulkPrintArea = document.getElementById('bulkInvoicePrintArea');
    if (bulkPrintArea) {
        bulkPrintArea.innerHTML = bulkHtml;
        bulkPrintArea.style.display = 'block';
        document.body.classList.add('print-bulk-invoice');
        setTimeout(() => {
            window.print();
        }, 50);
    }
};
