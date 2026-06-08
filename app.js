// app.js - State management, calculations, and UI rendering

// --- State and Constants ---
let state = {
    customers: [],
    inspections: []
};

// Storage keys
const STORAGE_KEY = 'smartcounter_data';

// Navigation & Active View
let currentView = 'dashboard';

// Chart instance reference
let usageChart = null;

// --- Demo Data ---
const demoData = {
    customers: [
        { id: 'cust-1', name: '(주)미래기획', copierModel: 'Canon iR ADV DX C3826', serialNumber: 'CNB12345', contact: '010-1234-5678', location: '2층 관리부 사무실', createdAt: '2026-03-01', contractBw: 2000, contractColor: 300 },
        { id: 'cust-2', name: '현대법률사무소', copierModel: 'HP Color LaserJet E78330', serialNumber: 'HP987654', contact: '02-555-1234', location: '5층 회의실 앞', createdAt: '2026-03-05', contractBw: 5000, contractColor: 500 },
        { id: 'cust-3', name: '디자인연구소 숲', copierModel: 'Epson WorkForce C879R', serialNumber: 'EP881122', contact: '010-9876-5432', location: '3층 디자인실', createdAt: '2026-03-10', contractBw: 1500, contractColor: 3000 },
        { id: 'cust-4', name: '아이비 학원', copierModel: 'Sindoh D420', serialNumber: 'SD009988', contact: '031-777-8888', location: '1층 안내데스크', createdAt: '2026-03-12', contractBw: 3000, contractColor: 100 }
    ],
    inspections: [
        // March 2026
        { id: 'insp-1', customerId: 'cust-1', date: '2026-03-20', bwCounter: 5000, colorCounter: 1500, bwUsage: 0, colorUsage: 0, notes: '신규 점검 개시 - 기준 카운터 설정' },
        { id: 'insp-2', customerId: 'cust-2', date: '2026-03-21', bwCounter: 12000, colorCounter: 800, bwUsage: 0, colorUsage: 0, notes: '신규 점검 개시' },
        { id: 'insp-3', customerId: 'cust-3', date: '2026-03-22', bwCounter: 3200, colorCounter: 4500, bwUsage: 0, colorUsage: 0, notes: '신규 점검 개시' },
        { id: 'insp-4', customerId: 'cust-4', date: '2026-03-23', bwCounter: 8200, colorCounter: 200, bwUsage: 0, colorUsage: 0, notes: '신규 점검 개시' },
        
        // April 2026
        { id: 'insp-5', customerId: 'cust-1', date: '2026-04-20', bwCounter: 6200, colorCounter: 1850, bwUsage: 1200, colorUsage: 350, notes: '정기 점검. 흑백 토너 교체 완료.' },
        { id: 'insp-6', customerId: 'cust-2', date: '2026-04-21', bwCounter: 15400, colorCounter: 1100, bwUsage: 3400, colorUsage: 300, notes: '정기 점검. 급지 롤러 클리닝.' },
        { id: 'insp-7', customerId: 'cust-3', date: '2026-04-22', bwCounter: 4100, colorCounter: 6800, bwUsage: 900, colorUsage: 2300, notes: '정기 점검. 고사용 인쇄 패턴 확인.' },
        { id: 'insp-8', customerId: 'cust-4', date: '2026-04-23', bwCounter: 10500, colorCounter: 320, bwUsage: 2300, colorUsage: 120, notes: '정기 점검. 이상 없음.' },

        // May 2026
        { id: 'insp-9', customerId: 'cust-1', date: '2026-05-20', bwCounter: 7650, colorCounter: 2280, bwUsage: 1450, colorUsage: 430, notes: '정기 점검. 액정 화면 클리닝.' },
        { id: 'insp-10', customerId: 'cust-2', date: '2026-05-21', bwCounter: 19100, colorCounter: 1450, bwUsage: 3700, colorUsage: 350, notes: '정기 점검. 폐토너통 교체.' },
        { id: 'insp-11', customerId: 'cust-3', date: '2026-05-22', bwCounter: 5050, colorCounter: 9350, bwUsage: 950, colorUsage: 2550, notes: '정기 점검. 컬러 출력 많음.' },
        { id: 'insp-12', customerId: 'cust-4', date: '2026-05-23', bwCounter: 13100, colorCounter: 480, bwUsage: 2600, colorUsage: 160, notes: '정기 점검. 테스트 페이지 인쇄 양호.' },

        // June 2026 (Current Month)
        { id: 'insp-13', customerId: 'cust-1', date: '2026-06-05', bwCounter: 8450, colorCounter: 2510, bwUsage: 800, colorUsage: 230, notes: '정기 점검. 기기 상태 양호.' },
        { id: 'insp-14', customerId: 'cust-2', date: '2026-06-07', bwCounter: 21200, colorCounter: 1690, bwUsage: 2100, colorUsage: 240, notes: '정기 점검. 용지 걸림 빈번 보고로 급지부 패드 교체.' }
    ]
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
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
        } catch (e) {
            console.error('Failed to parse localStorage data', e);
            loadDemoData();
        }
    } else {
        loadDemoData();
    }
}

function loadDemoData() {
    state = JSON.parse(JSON.stringify(demoData)); // Deep clone
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
        } else {
            openInspectionModal();
        }
    });

    // Customer Form Submit
    document.getElementById('customerForm').addEventListener('submit', handleCustomerFormSubmit);

    // Inspection Form Submit
    document.getElementById('inspectionForm').addEventListener('submit', handleInspectionFormSubmit);

    // Dynamic select field details in inspection form
    document.getElementById('inspectionCustomerSelect').addEventListener('change', (e) => {
        const id = document.getElementById('inspectionId').value || null;
        updatePreviousCountersInfo(e.target.value, id);
    });

    // Search & Filters
    document.getElementById('customerSearchInput').addEventListener('input', renderCustomersTable);
    document.getElementById('inspectionSearchInput').addEventListener('input', renderInspectionsTable);
    document.getElementById('inspectionMonthFilter').addEventListener('change', renderInspectionsTable);

    // Backup & Restore
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataFile').addEventListener('change', importData);

    // Customer Add button inside customer view
    document.getElementById('addCustomerBtn').addEventListener('click', () => openCustomerModal());
    document.getElementById('addInspectionBtn').addEventListener('click', () => openInspectionModal());
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('inspectionDate').value = today;
    
    // Set default month filter to current year/month
    const currentYearMonth = today.substring(0, 7); // "YYYY-MM"
    document.getElementById('inspectionMonthFilter').value = currentYearMonth;
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
        renderInspectionsTable();
    }
}

// --- Logic: Counter Calculations & Helper Functions ---

/**
 * Recalculate usage for a specific customer.
 * Sorts all inspections for that customer chronologically and calculates the usage difference.
 */
function recalculateUsageForCustomer(customerId) {
    // Get all inspections for this customer
    const custInspections = state.inspections.filter(i => i.customerId === customerId);
    
    // Sort by date ascending, then by ID (order of creation) if dates match
    custInspections.sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
    });

    // Recalculate diffs
    custInspections.forEach((insp, index) => {
        if (index === 0) {
            insp.bwUsage = 0;
            insp.colorUsage = 0;
        } else {
            const prev = custInspections[index - 1];
            insp.bwUsage = insp.bwCounter - prev.bwCounter;
            insp.colorUsage = insp.colorCounter - prev.colorCounter;
        }
    });

    // Update main state array
    state.inspections = state.inspections.map(insp => {
        if (insp.customerId === customerId) {
            const updated = custInspections.find(ci => ci.id === insp.id);
            return updated || insp;
        }
        return insp;
    });

    saveToStorage();
}

/**
 * Gets the latest inspection prior to a given date for a customer.
 */
function getPreviousInspection(customerId, beforeDateStr, excludeId = null) {
    const beforeDate = new Date(beforeDateStr);
    
    const candidates = state.inspections.filter(i => {
        if (i.customerId !== customerId) return false;
        if (excludeId && i.id === excludeId) return false;
        return new Date(i.date) < beforeDate;
    });

    if (candidates.length === 0) return null;

    // Sort by date descending to get the closest one
    candidates.sort((a, b) => new Date(b.date) - new Date(a.date));
    return candidates[0];
}

// --- UI Rendering: Dashboard ---

function renderDashboard() {
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
    const thisMonthInsps = state.inspections.filter(i => i.date.startsWith(currentMonthStr));
    const prevMonthInsps = state.inspections.filter(i => i.date.startsWith(prevMonthStr));

    // Stat 1: Total Customers
    const totalCustomers = state.customers.length;
    document.getElementById('totalCustomersVal').textContent = totalCustomers;
    
    // Customer growth this month
    const addedThisMonth = state.customers.filter(c => c.createdAt && c.createdAt.startsWith(currentMonthStr)).length;
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

    // Stat 4: Inspection Progress (Inspected Customers this month / Total Customers)
    const inspectedCustomerIds = new Set(thisMonthInsps.map(i => i.customerId));
    const inspectedCount = inspectedCustomerIds.size;
    const progressPercent = totalCustomers > 0 ? Math.round((inspectedCount / totalCustomers) * 100) : 0;
    
    document.getElementById('inspectionProgressVal').textContent = `${progressPercent}%`;
    const progressDiffEl = document.getElementById('inspectionProgressDiffVal');
    progressDiffEl.className = 'diff zero';
    progressDiffEl.innerHTML = `점검 완료: ${inspectedCount} / 전체: ${totalCustomers} 개소`;

    // Render Recent Inspections Table
    renderRecentInspections();

    // Render Charts
    renderUsageChart();

    // Render Top Usage Customers
    renderTopUsageCustomers(currentMonthStr);
}

function renderRecentInspections() {
    const tbody = document.getElementById('recentInspectionsTbody');
    tbody.innerHTML = '';

    // Take top 5 most recent inspections
    const sorted = [...state.inspections].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">점검 기록이 없습니다.</td></tr>';
        return;
    }

    sorted.forEach(insp => {
        const customer = state.customers.find(c => c.id === insp.customerId);
        const customerName = customer ? customer.name : '알 수 없는 고객';
        
        let bwBadge = '';
        if (insp.bwUsage > 0) {
            bwBadge = `<span class="badge badge-success">+${insp.bwUsage.toLocaleString()}</span>`;
            if (customer && customer.contractBw > 0 && insp.bwUsage > customer.contractBw) {
                const over = insp.bwUsage - customer.contractBw;
                bwBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
            }
        } else {
            bwBadge = '<span class="badge badge-info">기준</span>';
        }

        let colorBadge = '';
        if (insp.colorUsage > 0) {
            colorBadge = `<span class="badge badge-success" style="background:rgba(217,70,239,0.15); color:#f472b6;">+${insp.colorUsage.toLocaleString()}</span>`;
            if (customer && customer.contractColor > 0 && insp.colorUsage > customer.contractColor) {
                const over = insp.colorUsage - customer.contractColor;
                colorBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
            }
        } else {
            colorBadge = '<span class="badge badge-info">기준</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="점검일" style="font-weight:600;">${insp.date}</td>
            <td data-label="고객사명"><span style="font-weight: 500;">${customerName}</span></td>
            <td data-label="흑백 카운터">${insp.bwCounter.toLocaleString()}</td>
            <td data-label="컬러 카운터" style="color:#d8b4fe;">${insp.colorCounter.toLocaleString()}</td>
            <td data-label="흑백 사용량">
                <span style="font-weight:600;">${insp.bwUsage.toLocaleString()}</span>
                ${bwBadge}
            </td>
            <td data-label="컬러 사용량">
                <span style="font-weight:600;">${insp.colorUsage.toLocaleString()}</span>
                ${colorBadge}
            </td>
            <td data-label="특이사항"><span style="font-size:0.85rem; color:var(--text-secondary);">${insp.notes || '-'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTopUsageCustomers(currentMonthStr) {
    const container = document.getElementById('topUsageCustomers');
    container.innerHTML = '';

    // Filter inspections for this month
    const thisMonthInsps = state.inspections.filter(i => i.date.startsWith(currentMonthStr));

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
        card.style.gap = '0.25rem';
        card.style.padding = '0.5rem 0';
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                <span style="font-weight:600;">${item.name} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(${item.model})</span></span>
                <span style="font-weight:700; color:var(--primary);">${item.total.toLocaleString()} 매</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.15rem;">
                <span>흑백: ${item.bw.toLocaleString()}매</span>
                <span>컬러: ${item.color.toLocaleString()}매</span>
            </div>
            <div style="width:100%; height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
                <div style="width:${percent}%; height:100%; background:var(--primary-gradient); border-radius:3px;"></div>
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
        const insps = state.inspections.filter(i => i.date.startsWith(m));
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
        return c.name.toLowerCase().includes(query) || 
               c.copierModel.toLowerCase().includes(query) ||
               (c.serialNumber && c.serialNumber.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">등록된 고객사가 없거나 검색 결과가 없습니다.</td></tr>';
        return;
    }

    const todayStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"

    filtered.forEach(cust => {
        // Find inspections for this customer
        const custInsps = state.inspections.filter(i => i.customerId === cust.id);
        
        // Sort to find latest
        let lastInspectionDate = '-';
        let isInspectedThisMonth = false;
        
        if (custInsps.length > 0) {
            custInsps.sort((a, b) => new Date(b.date) - new Date(a.date));
            lastInspectionDate = custInsps[0].date;
            
            // Check if there's any inspection this month
            isInspectedThisMonth = custInsps.some(i => i.date.startsWith(todayStr));
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="고객사명"><span style="font-weight: 600; font-size:1rem; cursor:pointer; color:var(--primary);" onclick="openDetailModal('${cust.id}')">${cust.name}</span></td>
            <td data-label="복사기 모델">
                <span style="font-weight:500;">${cust.copierModel}</span>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                    계약: 흑백 ${(cust.contractBw || 0).toLocaleString()} / 컬러 ${(cust.contractColor || 0).toLocaleString()}
                </div>
            </td>
            <td data-label="일련번호(S/N)"><code style="color:var(--text-secondary); font-family: monospace;">${cust.serialNumber || '-'}</code></td>
            <td data-label="연락처">${cust.contact || '-'}</td>
            <td data-label="최근 점검일">${lastInspectionDate}</td>
            <td data-label="점검 여부">
                ${isInspectedThisMonth 
                    ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> 완료</span>' 
                    : '<span class="badge badge-warning"><i class="fa-solid fa-circle-minus"></i> 예정</span>'}
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

function handleCustomerFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('customerId').value;
    const name = document.getElementById('customerName').value.trim();
    const model = document.getElementById('copierModel').value.trim();
    const serial = document.getElementById('serialNumber').value.trim();
    const contact = document.getElementById('customerContact').value.trim();
    const contractBw = parseInt(document.getElementById('contractBw').value, 10) || 0;
    const contractColor = parseInt(document.getElementById('contractColor').value, 10) || 0;
    const location = document.getElementById('customerLocation').value.trim();

    if (!name || !model) return;

    if (id) {
        // Edit existing customer
        const customer = state.customers.find(c => c.id === id);
        if (customer) {
            customer.name = name;
            customer.copierModel = model;
            customer.serialNumber = serial;
            customer.contact = contact;
            customer.contractBw = contractBw;
            customer.contractColor = contractColor;
            customer.location = location;
        }
    } else {
        // Add new customer
        const newCust = {
            id: 'cust-' + Date.now(),
            name: name,
            copierModel: model,
            serialNumber: serial,
            contact: contact,
            contractBw: contractBw,
            contractColor: contractColor,
            location: location,
            createdAt: new Date().toISOString().split('T')[0]
        };
        state.customers.push(newCust);
    }

    saveToStorage();
    closeCustomerModal();
    renderCustomersTable();
}

function deleteCustomer(id) {
    const customer = state.customers.find(c => c.id === id);
    if (!customer) return;

    if (confirm(`고객사 "${customer.name}"을(를) 삭제하시겠습니까?\n삭제 시 해당 고객의 모든 월간 점검 기록도 영구적으로 삭제됩니다.`)) {
        // Remove customer
        state.customers = state.customers.filter(c => c.id !== id);
        // Remove their inspections
        state.inspections = state.inspections.filter(i => i.customerId !== id);

        saveToStorage();
        renderCustomersTable();
    }
}

// --- UI Rendering: Inspection Table & Management ---

function renderInspectionsTable() {
    const tbody = document.getElementById('inspectionsTbody');
    tbody.innerHTML = '';

    const query = document.getElementById('inspectionSearchInput').value.toLowerCase().trim();
    const monthFilter = document.getElementById('inspectionMonthFilter').value; // "YYYY-MM"

    // Filter inspections
    const filtered = state.inspections.filter(insp => {
        const customer = state.customers.find(c => c.id === insp.customerId);
        const customerName = customer ? customer.name.toLowerCase() : '';
        const modelName = customer ? customer.copierModel.toLowerCase() : '';
        
        const matchesQuery = customerName.includes(query) || modelName.includes(query);
        const matchesMonth = monthFilter ? insp.date.startsWith(monthFilter) : true;

        return matchesQuery && matchesMonth;
    });

    // Sort inspections by date descending, then ID
    filtered.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        return dateDiff !== 0 ? dateDiff : b.id.localeCompare(a.id);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">점검 기록이 없거나 검색 필터와 일치하는 내역이 없습니다.</td></tr>';
        return;
    }

    filtered.forEach(insp => {
        const customer = state.customers.find(c => c.id === insp.customerId);
        const customerName = customer ? customer.name : '알 수 없음';
        const model = customer ? customer.copierModel : '-';

        let bwBadge = '';
        if (insp.bwUsage > 0) {
            bwBadge = `<span class="badge badge-success">+${insp.bwUsage.toLocaleString()}</span>`;
            if (customer && customer.contractBw > 0 && insp.bwUsage > customer.contractBw) {
                const over = insp.bwUsage - customer.contractBw;
                bwBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
            }
        } else if (insp.bwUsage < 0) {
            bwBadge = `<span class="badge badge-danger">${insp.bwUsage.toLocaleString()} (감소)</span>`;
        } else {
            bwBadge = '<span class="badge badge-info">기준</span>';
        }

        let colorBadge = '';
        if (insp.colorUsage > 0) {
            colorBadge = `<span class="badge badge-success" style="background:rgba(217,70,239,0.15); color:#f472b6;">+${insp.colorUsage.toLocaleString()}</span>`;
            if (customer && customer.contractColor > 0 && insp.colorUsage > customer.contractColor) {
                const over = insp.colorUsage - customer.contractColor;
                colorBadge += `<span class="badge badge-danger" style="margin-left:0.25rem;">초과 (+${over.toLocaleString()})</span>`;
            }
        } else if (insp.colorUsage < 0) {
            colorBadge = `<span class="badge badge-danger">${insp.colorUsage.toLocaleString()} (감소)</span>`;
        } else {
            colorBadge = '<span class="badge badge-info">기준</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="점검일" style="font-weight: 600;">${insp.date}</td>
            <td data-label="고객사명"><span style="font-weight: 600;">${customerName}</span></td>
            <td data-label="복사기 모델">${model}</td>
            <td data-label="흑백 카운터">
                <div>${insp.bwCounter.toLocaleString()}</div>
                ${bwBadge}
            </td>
            <td data-label="컬러 카운터">
                <div>${insp.colorCounter.toLocaleString()}</div>
                ${colorBadge}
            </td>
            <td data-label="특이사항 / 메모"><span style="font-size: 0.85rem; color: var(--text-secondary);">${insp.notes || '-'}</span></td>
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
}

function handleInspectionFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('inspectionId').value;
    const customerId = document.getElementById('inspectionCustomerSelect').value;
    const date = document.getElementById('inspectionDate').value;
    const bwCounter = parseInt(document.getElementById('bwCounter').value, 10);
    const colorCounter = parseInt(document.getElementById('colorCounter').value, 10);
    const notes = document.getElementById('inspectionNotes').value.trim();

    if (!customerId || !date || isNaN(bwCounter) || isNaN(colorCounter)) return;

    if (id) {
        // Edit Mode
        const insp = state.inspections.find(i => i.id === id);
        if (insp) {
            const oldCustomerId = insp.customerId;
            insp.customerId = customerId;
            insp.date = date;
            insp.bwCounter = bwCounter;
            insp.colorCounter = colorCounter;
            insp.notes = notes;

            saveToStorage();
            
            // Recalculate for both old and new customers in case the customer was changed
            recalculateUsageForCustomer(oldCustomerId);
            if (oldCustomerId !== customerId) {
                recalculateUsageForCustomer(customerId);
            }
        }
    } else {
        // Add Mode
        // Check for duplicate inspections for the same customer on the same date
        const duplicate = state.inspections.find(i => i.customerId === customerId && i.date === date);
        if (duplicate) {
            if (!confirm('해당 날짜에 이미 등록된 점검 기록이 있습니다. 덮어쓰시겠습니까?')) {
                return;
            }
            // Delete the duplicate first
            state.inspections = state.inspections.filter(i => i.id !== duplicate.id);
        }

        const newInspection = {
            id: 'insp-' + Date.now(),
            customerId: customerId,
            date: date,
            bwCounter: bwCounter,
            colorCounter: colorCounter,
            bwUsage: 0, // Will be calculated below
            colorUsage: 0, // Will be calculated below
            notes: notes
        };

        state.inspections.push(newInspection);
        saveToStorage();

        // Recalculate usage for this customer (this handles chronological order automatically!)
        recalculateUsageForCustomer(customerId);
    }

    closeInspectionModal();
    renderInspectionsTable();
}

function deleteInspection(id, customerId) {
    if (confirm('이 점검 기록을 삭제하시겠습니까? 삭제 후 점검 대장의 사용량(증감)이 재계산됩니다.')) {
        state.inspections = state.inspections.filter(i => i.id !== id);
        saveToStorage();
        
        // Recalculate usage for this customer because chronological order changed
        recalculateUsageForCustomer(customerId);
        
        renderInspectionsTable();
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

    if (id) {
        title.textContent = '고객사 정보 수정';
        saveBtn.textContent = '수정 완료';
        const customer = state.customers.find(c => c.id === id);
        if (customer) {
            document.getElementById('customerId').value = customer.id;
            document.getElementById('customerName').value = customer.name;
            document.getElementById('copierModel').value = customer.copierModel;
            document.getElementById('serialNumber').value = customer.serialNumber || '';
            document.getElementById('customerContact').value = customer.contact || '';
            document.getElementById('contractBw').value = customer.contractBw || '';
            document.getElementById('contractColor').value = customer.contractColor || '';
            document.getElementById('customerLocation').value = customer.location || '';
        }
    } else {
        title.textContent = '고객사 신규 등록';
        saveBtn.textContent = '등록';
        document.getElementById('contractBw').value = '';
        document.getElementById('contractColor').value = '';
    }

    modal.classList.add('active');
}

function closeCustomerModal() {
    document.getElementById('customerModalBackdrop').classList.remove('active');
}

// Inspection Modal
function openInspectionModal(id = null) {
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
        option.textContent = `${cust.name} (${cust.copierModel})`;
        select.appendChild(option);
    });

    if (id) {
        title.textContent = '복사기 점검 기록 수정';
        const insp = state.inspections.find(i => i.id === id);
        if (insp) {
            document.getElementById('inspectionId').value = insp.id;
            document.getElementById('inspectionCustomerSelect').value = insp.customerId;
            document.getElementById('inspectionDate').value = insp.date;
            document.getElementById('bwCounter').value = insp.bwCounter;
            document.getElementById('colorCounter').value = insp.colorCounter;
            document.getElementById('inspectionNotes').value = insp.notes || '';
            
            // Show previous info (excluding this record)
            updatePreviousCountersInfo(insp.customerId, insp.id);
        }
    } else {
        title.textContent = '복사기 점검 기록 등록';
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('inspectionDate').value = today;
        document.getElementById('previousCountersInfo').style.display = 'none';
    }

    modal.classList.add('active');
}

function closeInspectionModal() {
    document.getElementById('inspectionModalBackdrop').classList.remove('active');
}

/**
 * Show previous month's counters in the modal when a customer is selected.
 */
function updatePreviousCountersInfo(customerId, excludeId = null) {
    const infoBox = document.getElementById('previousCountersInfo');
    if (!customerId) {
        infoBox.style.display = 'none';
        return;
    }

    const dateVal = document.getElementById('inspectionDate').value;
    
    // Find the closest previous inspection
    const prev = getPreviousInspection(customerId, dateVal || new Date().toISOString().split('T')[0], excludeId);

    if (prev) {
        infoBox.style.display = 'block';
        infoBox.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.15rem; color: var(--primary);">
                <i class="fa-solid fa-clock-rotate-left"></i> 직전 점검 내역 (${prev.date})
            </div>
            <div>흑백 카운터: <span style="font-weight:600; color:var(--text-primary);">${prev.bwCounter.toLocaleString()}</span></div>
            <div>컬러 카운터: <span style="font-weight:600; color:var(--text-primary);">${prev.colorCounter.toLocaleString()}</span></div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top: 0.25rem;">* 입력하시는 카운터 값과 비교하여 사용량을 자동 계산합니다.</div>
        `;
        // Pre-populate input fields as suggestion (so user doesn't start from 0 if they don't want to)
        document.getElementById('bwCounter').placeholder = prev.bwCounter;
        document.getElementById('colorCounter').placeholder = prev.colorCounter;
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
    document.getElementById('detailCopierModel').textContent = customer.copierModel;
    document.getElementById('detailSerial').textContent = customer.serialNumber || '-';
    document.getElementById('detailContact').textContent = customer.contact || '-';
    
    const bwContractText = customer.contractBw ? `${customer.contractBw.toLocaleString()}매` : '0매';
    const colorContractText = customer.contractColor ? `${customer.contractColor.toLocaleString()}매` : '0매';
    document.getElementById('detailContract').innerHTML = `흑백: <span style="font-weight:600; color:var(--text-primary);">${bwContractText}</span> / 컬러: <span style="font-weight:600; color:#c084fc;">${colorContractText}</span>`;
    
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
                </div>
                <div class="counters">
                    <div class="bw">흑백: ${insp.bwCounter.toLocaleString()}</div>
                    <div class="color">컬러: ${insp.colorCounter.toLocaleString()}</div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    modal.classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detailModalBackdrop').classList.remove('active');
}

// --- Import / Export Backups (JSON) ---

function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
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
