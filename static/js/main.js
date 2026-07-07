let currentSection = 'dashboard';
let apiData = null;
let charts = {};
let accountsList = [];       // [{id, name}]
let selectedAccountId = null; // null = todas las cuentas

// Selectors
const contentArea = document.getElementById('content-area');
const navBtns = document.querySelectorAll('.nav-btn');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const pageTitle = document.getElementById('page-title');

function updatePageTitle() {
    pageTitle.textContent = currentSection === 'metrics' ? 'Métricas Diarias' : 'LEADS';
}

// --- CONFIGURACIÓN DE LIMA (ZONA HORARIA ÚNICA) ---
const TZ = 'America/Lima';

function getTodayString() {
    const options = { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options); // YYYY-MM-DD
    return formatter.format(new Date());
}

// ==================================================================
// SELECTOR DE CUENTA PUBLICITARIA
// ==================================================================

const accountWidgetEl = document.getElementById('account-selector-widget');
let accountDropdownOpen = false;

async function loadAccounts() {
    try {
        const res = await fetch('/api/accounts');
        const data = await res.json();
        accountsList = data.accounts || [];
    } catch {
        accountsList = [];
    }
    renderAccountSelector();
}

function renderAccountSelector() {
    if (!accountWidgetEl || accountsList.length < 2) return;

    const selected = selectedAccountId
        ? accountsList.find(a => a.id === selectedAccountId)
        : null;
    const label = selected ? selected.name : 'Todas las cuentas';
    const isFiltered = !!selectedAccountId;

    accountWidgetEl.innerHTML = `
        <button id="account-trigger" type="button" class="flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/20 ${isFiltered ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'}">
            <i data-lucide="building-2" class="w-4 h-4 ${isFiltered ? 'text-violet-500' : 'text-slate-400'}"></i>
            <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
            <i data-lucide="chevron-down" class="w-4 h-4 ${isFiltered ? 'text-violet-400' : 'text-slate-400'}"></i>
        </button>
        <div id="account-dropdown" class="${accountDropdownOpen ? '' : 'hidden'} absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50">
            <button data-account-id="" class="account-option w-full text-left px-4 py-3 text-sm transition-colors ${!selectedAccountId ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}">
                <div class="flex items-center gap-3">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center ${!selectedAccountId ? 'bg-violet-100' : 'bg-slate-100'}">
                        <i data-lucide="layers" class="w-3.5 h-3.5 ${!selectedAccountId ? 'text-violet-600' : 'text-slate-400'}"></i>
                    </div>
                    <div>
                        <div class="font-semibold">Todas las cuentas</div>
                        <div class="text-xs text-slate-400">${accountsList.length} cuentas combinadas</div>
                    </div>
                </div>
            </button>
            <div class="h-px bg-slate-100 mx-3 my-1"></div>
            ${accountsList.map((acc, i) => `
                <button data-account-id="${acc.id}" class="account-option w-full text-left px-4 py-3 text-sm transition-colors ${selectedAccountId === acc.id ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}">
                    <div class="flex items-center gap-3">
                        <div class="w-7 h-7 rounded-lg flex items-center justify-center ${selectedAccountId === acc.id ? 'bg-violet-100' : 'bg-slate-100'} text-xs font-black ${selectedAccountId === acc.id ? 'text-violet-600' : 'text-slate-500'}">
                            ${i + 1}
                        </div>
                        <div style="min-width:0">
                            <div class="font-medium" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${acc.name}</div>
                            <div class="text-xs text-slate-400" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${acc.id}</div>
                        </div>
                    </div>
                </button>
            `).join('')}
        </div>
    `;
    lucide.createIcons({ nodes: [accountWidgetEl] });
    attachAccountSelectorEvents();
}

function attachAccountSelectorEvents() {
    const trigger = accountWidgetEl.querySelector('#account-trigger');
    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            accountDropdownOpen = !accountDropdownOpen;
            renderAccountSelector();
        });
    }
    accountWidgetEl.querySelectorAll('.account-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const newId = btn.dataset.accountId || null;
            accountDropdownOpen = false;
            if (newId !== selectedAccountId) {
                selectedAccountId = newId;
                renderAccountSelector();
                fetchData(dateRangeState.applied.since, dateRangeState.applied.until);
            } else {
                renderAccountSelector();
            }
        });
    });
    document.addEventListener('click', (e) => {
        if (accountDropdownOpen && accountWidgetEl && !e.composedPath().includes(accountWidgetEl)) {
            accountDropdownOpen = false;
            renderAccountSelector();
        }
    }, { once: true });
}

// ==================================================================
// SELECTOR DE RANGO DE FECHAS
// ==================================================================
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_NAMES_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PRESETS = [
    { key: 'today', label: 'Hoy' },
    { key: 'yesterday', label: 'Ayer' },
    { key: 'last7', label: 'Últimos 7 días' },
    { key: 'last14', label: 'Últimos 14d' },
    { key: 'last30', label: 'Últimos 30d' },
    { key: 'thisMonth', label: 'Este mes' },
    { key: 'lastMonth', label: 'Mes anterior' }
];

const dateRangeState = {
    applied: { since: null, until: null, presetKey: 'thisMonth', label: 'Este mes' },
    pending: { since: null, until: null, presetKey: null },
    calendarBaseYear: null,
    calendarBaseMonth: null
};

const dateTriggerEl = document.getElementById('date-range-trigger');
const dateLabelEl = document.getElementById('date-range-label');
const datePanelEl = document.getElementById('date-range-panel');
const dateWidgetEl = document.getElementById('date-range-widget');

function parseDateStr(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function formatDateStr(dateObj) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDaysStr(s, n) {
    const d = parseDateStr(s);
    d.setUTCDate(d.getUTCDate() + n);
    return formatDateStr(d);
}

function formatShort(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MONTH_NAMES_SHORT_ES[m - 1]}`;
}

function isTodayRange(since, until) {
    const todayStr = getTodayString();
    return since === todayStr && until === todayStr;
}

function computePresetRange(key, todayStr) {
    switch (key) {
        case 'today':
            return { since: todayStr, until: todayStr };
        case 'yesterday': {
            const y = addDaysStr(todayStr, -1);
            return { since: y, until: y };
        }
        case 'last7':
            return { since: addDaysStr(todayStr, -6), until: todayStr };
        case 'last14':
            return { since: addDaysStr(todayStr, -13), until: todayStr };
        case 'last30':
            return { since: addDaysStr(todayStr, -29), until: todayStr };
        case 'thisMonth': {
            const [y, m] = todayStr.split('-');
            return { since: `${y}-${m}-01`, until: todayStr };
        }
        case 'lastMonth': {
            const [y, m] = todayStr.split('-').map(Number);
            const lastOfPrev = new Date(Date.UTC(y, m - 1, 0));
            const firstOfPrev = new Date(Date.UTC(lastOfPrev.getUTCFullYear(), lastOfPrev.getUTCMonth(), 1));
            return { since: formatDateStr(firstOfPrev), until: formatDateStr(lastOfPrev) };
        }
        default:
            return { since: todayStr, until: todayStr };
    }
}

function computeRangeLabel(p) {
    if (p.presetKey) {
        const found = PRESETS.find(pr => pr.key === p.presetKey);
        if (found) return found.label;
    }
    if (!p.since || !p.until) return 'Seleccionar';
    if (p.since === p.until) return formatShort(p.since);
    return `${formatShort(p.since)} - ${formatShort(p.until)}`;
}

function initDateRangeWidget() {
    const todayStr = getTodayString();
    const { since, until } = computePresetRange('thisMonth', todayStr);
    dateRangeState.applied = { since, until, presetKey: 'thisMonth', label: 'Este mes' };
    updateTriggerLabel();

    if (dateTriggerEl) {
        dateTriggerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDatePanel();
        });
    }

    document.addEventListener('click', (e) => {
        // Usamos composedPath (capturada al momento del evento) en vez de
        // dateWidgetEl.contains(e.target): los clics que re-renderizan el
        // panel (innerHTML) desconectan e.target del DOM antes de que este
        // listener corra, haciendo que contains() falle y cierre el panel.
        if (dateWidgetEl && !e.composedPath().includes(dateWidgetEl)) {
            closeDatePanel();
        }
    });
}

function updateTriggerLabel() {
    if (dateLabelEl) dateLabelEl.textContent = dateRangeState.applied.label;
}

function toggleDatePanel() {
    if (!datePanelEl) return;
    if (datePanelEl.classList.contains('hidden')) openDatePanel();
    else closeDatePanel();
}

function openDatePanel() {
    dateRangeState.pending = {
        since: dateRangeState.applied.since,
        until: dateRangeState.applied.until,
        presetKey: dateRangeState.applied.presetKey
    };
    const [y, m] = dateRangeState.applied.since.split('-').map(Number);
    dateRangeState.calendarBaseYear = y;
    dateRangeState.calendarBaseMonth = m - 1;
    renderDatePanelContent();
    datePanelEl.classList.remove('hidden');
}

function closeDatePanel() {
    if (datePanelEl) datePanelEl.classList.add('hidden');
}

function buildMonthGrid(year, monthIndex0) {
    const firstDow = new Date(Date.UTC(year, monthIndex0, 1)).getUTCDay();
    const leadingBlanks = (firstDow + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({ day, dateStr });
    }
    return cells;
}

function renderMonthCalendar(year, monthIndex0) {
    const cells = buildMonthGrid(year, monthIndex0);
    const p = dateRangeState.pending;
    const todayStr = getTodayString();
    const title = `${MONTH_NAMES_ES[monthIndex0]} ${year}`;

    let html = `<div class="flex-1 min-w-0">
        <p class="text-center text-sm font-bold text-[#1E0B42] mb-3">${title}</p>
        <div class="grid grid-cols-7 mb-2">
            ${WEEKDAY_LABELS.map(w => `<span class="text-center text-[10px] font-bold text-slate-400">${w}</span>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-y-1">`;

    cells.forEach(cell => {
        if (!cell) {
            html += `<span></span>`;
            return;
        }
        const { day, dateStr } = cell;
        const disabled = dateStr > todayStr;
        const isToday = dateStr === todayStr;
        const isStart = p.since === dateStr;
        const isEnd = p.until === dateStr;
        const inRange = p.since && p.until && dateStr > p.since && dateStr < p.until;

        let cls = 'date-cell w-8 h-8 flex items-center justify-center rounded-full text-xs mx-auto transition-colors ';
        if (disabled) {
            cls += 'text-slate-300 cursor-not-allowed';
        } else if (isStart || isEnd) {
            cls += 'bg-violet-600 text-white font-bold cursor-pointer';
        } else if (inRange) {
            cls += 'bg-violet-100 text-violet-700 font-semibold cursor-pointer';
        } else if (isToday) {
            cls += 'text-violet-600 font-bold ring-1 ring-violet-300 cursor-pointer hover:bg-violet-50';
        } else {
            cls += 'text-slate-600 font-medium cursor-pointer hover:bg-violet-50';
        }

        html += `<button type="button" data-date="${dateStr}" ${disabled ? 'disabled' : ''} class="${cls}">${day}</button>`;
    });

    html += `</div></div>`;
    return html;
}

function renderDatePanelContent() {
    if (!datePanelEl) return;
    const p = dateRangeState.pending;
    const y1 = dateRangeState.calendarBaseYear;
    const m1 = dateRangeState.calendarBaseMonth;
    let y2 = y1, m2 = m1 + 1;
    if (m2 > 11) { m2 = 0; y2 = y1 + 1; }

    const canUpdate = !!(p.since && p.until);
    let hint = 'Haz clic para seleccionar inicio';
    if (p.since && !p.until) hint = 'Haz clic para seleccionar fin';
    else if (p.since && p.until) hint = `${formatShort(p.since)} — ${formatShort(p.until)}`;

    datePanelEl.innerHTML = `
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Seleccionar período</p>
        <div class="grid grid-cols-4 gap-2 mb-5">
            ${PRESETS.map(pr => `
                <button type="button" data-preset="${pr.key}" class="preset-btn px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${p.presetKey === pr.key ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${pr.label}</button>
            `).join('')}
        </div>
        <div class="border-t border-slate-100 pt-5">
            <div class="flex items-start gap-2">
                <button type="button" id="cal-prev" class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 mt-6 shrink-0">
                    <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>
                <div class="flex-1 flex gap-6 min-w-0">
                    ${renderMonthCalendar(y1, m1)}
                    ${renderMonthCalendar(y2, m2)}
                </div>
                <button type="button" id="cal-next" class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 mt-6 shrink-0">
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-100">
            <p class="text-xs text-violet-500 font-medium">${hint}</p>
            <div class="flex items-center gap-2">
                <button type="button" id="date-quitar" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Quitar</button>
                <button type="button" id="date-cancelar" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
                <button type="button" id="date-actualizar" ${canUpdate ? '' : 'disabled'} class="px-5 py-2 rounded-xl text-xs font-bold text-white transition-colors ${canUpdate ? 'bg-violet-600 hover:bg-violet-700' : 'bg-slate-200 cursor-not-allowed'}">Actualizar</button>
            </div>
        </div>
    `;
    lucide.createIcons();
    attachDatePanelEvents();
}

function attachDatePanelEvents() {
    datePanelEl.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => onPresetClick(btn.dataset.preset));
    });
    datePanelEl.querySelectorAll('.date-cell:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => onDayClick(btn.dataset.date));
    });
    const prevBtn = datePanelEl.querySelector('#cal-prev');
    const nextBtn = datePanelEl.querySelector('#cal-next');
    if (prevBtn) prevBtn.addEventListener('click', () => shiftCalendar(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => shiftCalendar(1));

    const quitarBtn = datePanelEl.querySelector('#date-quitar');
    if (quitarBtn) quitarBtn.addEventListener('click', onQuitar);
    const cancelarBtn = datePanelEl.querySelector('#date-cancelar');
    if (cancelarBtn) cancelarBtn.addEventListener('click', closeDatePanel);
    const actualizarBtn = datePanelEl.querySelector('#date-actualizar');
    if (actualizarBtn) actualizarBtn.addEventListener('click', onActualizar);
}

function onPresetClick(key) {
    const todayStr = getTodayString();
    const range = computePresetRange(key, todayStr);
    dateRangeState.pending.since = range.since;
    dateRangeState.pending.until = range.until;
    dateRangeState.pending.presetKey = key;

    const d = parseDateStr(range.since);
    dateRangeState.calendarBaseYear = d.getUTCFullYear();
    dateRangeState.calendarBaseMonth = d.getUTCMonth();
    renderDatePanelContent();
}

function onDayClick(dateStr) {
    const p = dateRangeState.pending;
    if (!p.since || (p.since && p.until)) {
        p.since = dateStr;
        p.until = null;
        p.presetKey = null;
    } else if (dateStr < p.since) {
        p.until = p.since;
        p.since = dateStr;
        p.presetKey = null;
    } else {
        p.until = dateStr;
        p.presetKey = null;
    }
    renderDatePanelContent();
}

function shiftCalendar(delta) {
    let m = dateRangeState.calendarBaseMonth + delta;
    let y = dateRangeState.calendarBaseYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    dateRangeState.calendarBaseMonth = m;
    dateRangeState.calendarBaseYear = y;
    renderDatePanelContent();
}

function onQuitar() {
    dateRangeState.pending.since = null;
    dateRangeState.pending.until = null;
    dateRangeState.pending.presetKey = null;
    renderDatePanelContent();
}

function onActualizar() {
    const p = dateRangeState.pending;
    if (!p.since || !p.until) return;
    dateRangeState.applied = {
        since: p.since,
        until: p.until,
        presetKey: p.presetKey,
        label: computeRangeLabel(p)
    };
    closeDatePanel();
    updateTriggerLabel();
    fetchData(dateRangeState.applied.since, dateRangeState.applied.until);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initDateRangeWidget();
    loadAccounts();
    fetchData(dateRangeState.applied.since, dateRangeState.applied.until);
    setupEventListeners();
});

// --- ENGINE DE DATOS ---
async function fetchData(since, until) {
    await syncWithServer(since, until);
}

async function syncWithServer(since, until) {
    try {
        if (!apiData) contentArea.innerHTML = '<div class="flex items-center justify-center min-h-[50vh]"><div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div></div>';

        const accountParam = selectedAccountId ? `&account_id=${encodeURIComponent(selectedAccountId)}` : '';
        const url = `/api/data?since=${since}&until=${until}${accountParam}`;
        const response = await fetch(url);
        const result = await response.json();

        if (result.status === 'error') {
            renderError(result.message);
            return;
        }

        apiData = result;
        renderCurrentSection();

        if (isTodayRange(since, until)) {
            fetchTodayDelta();
        }
    } catch (err) {
        console.error("Sync Engine Failure:", err);
        if (!apiData) renderError("Error de conexión crítica.");
    }
}

async function fetchTodayDelta() {
    try {
        const accountParam = selectedAccountId ? `?account_id=${encodeURIComponent(selectedAccountId)}` : '';
        const response = await fetch(`/api/today${accountParam}`);
        const result = await response.json();

        if (result.status === 'success' && currentSection === 'dashboard') {
            updateHoyUIMetrics(result.data);
        }
    } catch (err) {
        console.warn("Delta Update silenciado:", err);
    }
}

function updateHoyUIMetrics(today) {
    if (!isTodayRange(dateRangeState.applied.since, dateRangeState.applied.until)) return;

    const cards = document.querySelectorAll('p.text-3xl');
    if (cards.length >= 3) {
        cards[0].innerText = `S/. ${today.spend.toFixed(2)}`;
        cards[1].innerText = today.leads;
        cards[2].innerText = `S/. ${today.costoLead.toFixed(2)}`;
    }
}

function renderError(message) {
    contentArea.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-white rounded-3xl border border-red-100">
            <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                <i data-lucide="alert-circle" class="w-8 h-8"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-800 mb-2">Error de Integridad</h3>
            <p class="text-slate-500 max-w-sm">${message}</p>
            <button onclick="window.location.reload()" class="mt-6 px-6 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-all">Reintentar</button>
        </div>
    `;
    lucide.createIcons();
}

function setupEventListeners() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            switchSection(section);
            if (window.innerWidth < 1024) toggleSidebar(false);
        });
    });

    mobileMenuToggle.addEventListener('click', () => toggleSidebar(true));
    sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
}

function toggleSidebar(show) {
    if (show) {
        sidebar.classList.remove('-translate-x-full');
        sidebarOverlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('hidden');
    }
}

function switchSection(section) {
    currentSection = section;

    navBtns.forEach(btn => {
        if (btn.getAttribute('data-section') === section) {
            btn.classList.add('bg-violet-600', 'text-white');
            btn.classList.remove('text-slate-400', 'hover:bg-slate-100');
        } else {
            btn.classList.remove('bg-violet-600', 'text-white');
            btn.classList.add('text-slate-400', 'hover:bg-slate-100');
        }
    });

    updatePageTitle();
    renderCurrentSection();
}

function renderCurrentSection() {
    if (!apiData) return;

    try {
        if (currentSection === 'dashboard') {
            renderDashboard();
        } else if (currentSection === 'metrics') {
            renderMetricsTable();
        }
    } catch (err) {
        console.error("Render Error:", err);
        contentArea.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-[50vh] text-center p-10">
                <div class="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red-100">
                    <i data-lucide="alert-triangle" class="w-10 h-10"></i>
                </div>
                <h3 class="text-2xl font-bold text-slate-800 mb-2">Error de Visualización</h3>
                <p class="text-slate-500 max-w-md">Hubo un problema al procesar los gráficos: ${err.message}</p>
                <button onclick="localStorage.clear(); window.location.reload();" class="mt-8 px-8 py-3 bg-[#1E0B42] text-white rounded-2xl hover:bg-violet-900 transition-all font-bold">Limpiar Cache y Reintentar</button>
            </div>
        `;
        lucide.createIcons();
    }
}

function renderMetricsTable() {
    const metrics = apiData.dailyMetrics;
    const rows = metrics.map(item => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="py-4 px-6 font-medium text-slate-800">${item.date}</td>
            <td class="py-4 px-6 text-slate-600">S/. ${item.spend.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
            <td class="py-4 px-6 text-slate-600">${item.leads}</td>
            <td class="py-4 px-6 font-semibold text-violet-600">S/. ${item.costoLead.toFixed(2)}</td>
            <td class="py-4 px-6">
                <span class="px-3 py-1 bg-violet-50 text-violet-700 rounded-full text-xs font-bold">${item.ctr}%</span>
            </td>
        </tr>
    `).join('');

    contentArea.innerHTML = `
        <div class="animate-fade-in bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 text-slate-500 uppercase text-xs font-bold tracking-wider">
                            <th class="py-4 px-6">Fecha</th>
                            <th class="py-4 px-6">Gasto</th>
                            <th class="py-4 px-6">Leads</th>
                            <th class="py-4 px-6">Costo/Lead</th>
                            <th class="py-4 px-6">CTR</th>
                        </tr>
                    </thead>
                    <tbody class="text-slate-600">${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderDashboard() {
    // Leads = leads nativos de Meta (solo campañas con objetivo "Clientes potenciales")
    // + oportunidades de GHL ("Se realiza la llamada"). Gasto siempre de Meta.
    const kpi = apiData.kpis || {};

    const totalSpend = kpi.presupuestoConsumido || 0;
    const totalLeads = kpi.leadsTotales || 0;
    const reach = kpi.reachTotal || 0;
    const clicks = kpi.clicksTotal || 0;
    const visits = kpi.visitsTotal || 0;
    const ctr = reach > 0 ? ((clicks / reach) * 100).toFixed(2) : '0.00';
    const conv = clicks > 0 ? ((totalLeads / clicks) * 100).toFixed(2) : '0.00';

    let costoLeadRaw = kpi.costoPorLeadPromedio || "S/. 0.00";
    let costoLead = typeof costoLeadRaw === 'string' ? costoLeadRaw.replace('S/. ', '') : "0.00";

    const isToday = isTodayRange(dateRangeState.applied.since, dateRangeState.applied.until);
    const periodBadge = (dateRangeState.applied.label || 'Período').toUpperCase();
    const suffix = isToday ? 'Hoy' : 'del Período';

    contentArea.innerHTML = `
        <div class="space-y-12 animate-fade-in pb-20">

            <!-- TOP METRICS SECTION -->
            <section id="top-metrics-leads-section">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm card-hover group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-200"><i data-lucide="zap" class="w-6 h-6"></i></div>
                            <span class="px-2 py-1 bg-violet-50 text-violet-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">${periodBadge}</span>
                        </div>
                        <p class="text-slate-500 text-sm font-medium mb-1">Gasto ${suffix}</p>
                        <h4 class="text-3xl font-black text-[#1E0B42] tracking-tighter">S/. ${totalSpend.toFixed(2)}</h4>
                    </div>
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm card-hover group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-100"><i data-lucide="users" class="w-6 h-6"></i></div>
                            <span class="px-2 py-1 bg-orange-50 text-orange-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">${periodBadge}</span>
                        </div>
                        <p class="text-slate-500 text-sm font-medium mb-1">Leads ${suffix}</p>
                        <h4 class="text-3xl font-black text-[#1E0B42] tracking-tighter">${totalLeads}</h4>
                    </div>
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm card-hover group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-100"><i data-lucide="target" class="w-6 h-6"></i></div>
                            <span class="px-2 py-1 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">${periodBadge}</span>
                        </div>
                        <p class="text-slate-500 text-sm font-medium mb-1">Costo/Lead ${suffix}</p>
                        <h4 class="text-3xl font-black text-[#1E0B42] tracking-tighter">S/. ${costoLead}</h4>
                    </div>
                </div>
            </section>

            <!-- BLOQUE DE GRÁFICOS -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

                <!-- 1. CRECIMIENTO ACUMULADO -->
                <div class="lg:col-span-8 bg-[#1E0B42] p-6 lg:p-8 rounded-[2.5rem] lg:rounded-[3.5rem] dark-card relative overflow-hidden flex flex-col min-h-[400px] lg:min-h-[420px] card-hover group">
                    <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-orange-600/5 to-transparent"></div>
                    <div class="flex items-center justify-between mb-12 relative">
                        <div>
                            <h3 class="font-bold text-2xl text-white tracking-tight">Crecimiento de Leads</h3>
                            <p class="text-orange-300/60 text-sm font-medium uppercase tracking-widest">Progreso diario de captación</p>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Acumulado</p>
                            <p class="text-3xl font-black text-orange-400 tracking-tighter">${totalLeads}</p>
                        </div>
                    </div>
                    <div class="relative flex-1 min-h-0">
                        <canvas id="leadsGrowthChart"></canvas>
                    </div>
                </div>

                <!-- 2. INVERSIÓN DEL PERÍODO -->
                <div class="lg:col-span-4 bg-white p-6 lg:p-8 rounded-[2.5rem] lg:rounded-[3.5rem] floating-card border border-slate-100 relative overflow-hidden flex flex-col min-h-[400px] lg:min-h-[420px] card-hover">
                    <div class="relative mb-10 text-center">
                        <h3 class="font-bold text-xl text-[#1E0B42]">Inversión del Período</h3>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">${periodBadge}</p>
                    </div>
                    <div class="relative flex-1 flex flex-col items-center justify-center">
                        <div class="w-full h-64 relative">
                            <canvas id="leadsDoughnutChart"></canvas>
                        </div>
                        <div class="mt-8 grid grid-cols-2 gap-4 w-full">
                            <div class="p-4 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                                <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Gasto</p>
                                <p class="text-sm font-black text-[#1E0B42]">${kpi.gastoTotal || 'S/. 0.00'}</p>
                            </div>
                            <div class="p-4 bg-violet-50 rounded-3xl border border-violet-100 text-center">
                                <p class="text-[10px] font-bold text-violet-400 uppercase mb-1">Costo/Lead Prom.</p>
                                <p class="text-sm font-black text-violet-600">S/. ${costoLead}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. LEADS DIARIOS -->
                <div class="lg:col-span-6 bg-white p-6 lg:p-8 rounded-[2.5rem] lg:rounded-[3.5rem] floating-card border border-slate-100 relative overflow-hidden flex flex-col min-h-[400px] lg:min-h-[420px] card-hover">
                    <div class="flex items-center justify-between mb-12">
                        <div>
                            <h3 class="font-bold text-2xl text-[#1E0B42] tracking-tight">Leads Diarios</h3>
                            <p class="text-sm text-slate-400 font-medium">Registro de captación por día</p>
                        </div>
                        <div class="w-14 h-14 bg-violet-50 rounded-3xl flex items-center justify-center"><i data-lucide="bar-chart-3" class="text-violet-600 w-7 h-7"></i></div>
                    </div>
                    <div class="flex-1 min-h-0">
                        <canvas id="leadsBarChart"></canvas>
                    </div>
                </div>

                <!-- 4. TENDENCIA COSTO/LEAD -->
                <div class="lg:col-span-6 bg-[#1E0B42] p-6 lg:p-8 rounded-[2.5rem] lg:rounded-[3.5rem] dark-card relative overflow-hidden flex flex-col min-h-[400px] lg:min-h-[420px] group card-hover">
                    <div class="absolute top-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full -mr-48 -mt-48 blur-[100px] group-hover:bg-violet-600/20 transition-all duration-700"></div>
                    <div class="relative flex items-center justify-between mb-12">
                        <div>
                            <div class="flex items-center gap-3 mb-2">
                                <span class="w-3 h-3 bg-orange-400 rounded-full shadow-[0_0_15px_#FB923C] animate-pulse"></span>
                                <h3 class="font-bold text-2xl text-white tracking-tight">Tendencia Costo/Lead</h3>
                            </div>
                            <p class="text-slate-500 text-sm font-medium">Fluctuación diaria</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Promedio</p>
                            <p class="text-2xl font-black text-orange-400 tracking-tighter">${costoLeadRaw}</p>
                        </div>
                    </div>
                    <div class="relative flex-1 min-h-0">
                        <canvas id="leadsLineChart"></canvas>
                    </div>
                </div>

                <!-- 5. EMBUDO DE CONVERSIÓN -->
                <div class="lg:col-span-12 bg-white p-8 lg:p-10 rounded-[3rem] lg:rounded-[4rem] floating-card border border-slate-100 relative overflow-hidden card-hover group mt-4">
                    <div class="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:opacity-[0.05] transition-opacity duration-700">
                        <i data-lucide="filter" class="w-64 h-64 text-[#1E0B42]"></i>
                    </div>
                    <div class="mb-12">
                        <h3 class="font-bold text-3xl text-[#1E0B42] tracking-tight">Embudo de Conversión</h3>
                        <p class="text-slate-400 font-medium">Análisis de eficiencia del funnel de Leads · ${dateRangeState.applied.label}</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-12 items-center">
                        <div class="md:col-span-2">
                            <div class="funnel-container">
                                <div class="funnel-stage stage-reach group/s1">
                                    <p class="funnel-label text-slate-500">Alcance (Reach)</p>
                                    <p class="funnel-value text-[#1E0B42]">${reach.toLocaleString()}</p>
                                    <div class="conversion-tag text-orange-500">
                                        ${ctr}% CTR
                                    </div>
                                </div>

                                <div class="funnel-stage stage-clicks group/s2">
                                    <p class="funnel-label text-orange-600">Clics en el Enlace</p>
                                    <p class="funnel-value text-[#1E0B42]">${clicks.toLocaleString()}</p>
                                    <div class="conversion-tag text-orange-600 bg-orange-50 border-orange-100">
                                        ${((visits / (clicks || 1)) * 100).toFixed(1)}% VISITA
                                    </div>
                                </div>

                                <div class="funnel-stage stage-visits group/s3">
                                    <p class="funnel-label text-orange-700">Visitas a la página</p>
                                    <p class="funnel-value text-[#1E0B42]">${visits.toLocaleString()}</p>
                                    <div class="conversion-tag text-white bg-[#FB923C] border-none shadow-orange-200">
                                        ${conv}% CONV.
                                    </div>
                                </div>

                                <div class="funnel-stage stage-leads group/s4">
                                    <p class="funnel-label text-orange-100">Leads Finales</p>
                                    <p class="funnel-value text-white">${totalLeads.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-6">
                            <div class="p-8 bg-violet-50/80 rounded-[2.5rem] border border-violet-100 relative group overflow-hidden">
                                <div class="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><i data-lucide="mouse-pointer-2" class="w-12 h-12 text-[#1E0B42]"></i></div>
                                <p class="text-xs font-bold text-violet-400 uppercase tracking-widest mb-4">Costo por Clic Promedio</p>
                                <div class="flex items-baseline gap-1">
                                    <p class="text-sm font-bold text-slate-400">S/.</p>
                                    <p class="text-4xl font-black text-[#1E0B42]">${(totalSpend / (clicks || 1)).toFixed(2)}</p>
                                </div>
                                <p class="text-[10px] text-slate-400 mt-2 font-medium">Inversión por cada clic generado</p>
                            </div>

                            <div class="p-8 bg-[#1E0B42] rounded-[2.5rem] relative overflow-hidden group">
                                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><i data-lucide="user-check" class="w-12 h-12 text-white"></i></div>
                                <div class="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>
                                <p class="text-xs font-bold text-violet-300/50 uppercase tracking-widest mb-4">Costo/Lead del Período</p>
                                <div class="flex items-baseline gap-1">
                                    <p class="text-sm font-bold text-violet-300/30">S/.</p>
                                    <p class="text-4xl font-black text-white">${costoLead}</p>
                                </div>
                                <p class="text-[10px] text-violet-300/40 mt-2 font-medium">Eficiencia de captación del período</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    lucide.createIcons();
    initCharts();
}

function initCharts() {
    Chart.defaults.font.family = 'Outfit';
    Chart.defaults.color = '#94A3B8';

    const leadsCharts = apiData.charts || { line: { labels: [], data: [] }, mixed: { labels: [], spend: [], leads: [] } };

    // --- GROWTH CHART (LEADS ACUMULADOS) ---
    const ctxGrowth = document.getElementById('leadsGrowthChart');
    if (ctxGrowth) {
        if (charts.leadsGrowth) charts.leadsGrowth.destroy();

        let cumulative = 0;
        const cumulativeData = leadsCharts.mixed.leads.map(val => {
            cumulative += val;
            return cumulative;
        });

        const grad = ctxGrowth.getContext('2d').createLinearGradient(0, 0, 0, 400);
        grad.addColorStop(0, 'rgba(251, 146, 60, 0.2)');
        grad.addColorStop(1, 'rgba(251, 146, 60, 0)');

        charts.leadsGrowth = new Chart(ctxGrowth, {
            type: 'line',
            data: {
                labels: leadsCharts.mixed.labels,
                datasets: [{
                    label: 'Leads Acumulados',
                    data: cumulativeData,
                    borderColor: '#FB923C',
                    backgroundColor: grad,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 5,
                    pointRadius: 4,
                    pointBackgroundColor: '#FB923C',
                    pointBorderColor: '#1E0B42',
                    pointBorderWidth: 3,
                    pointHoverRadius: 8,
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1E0B42',
                        padding: 16,
                        cornerRadius: 12,
                        titleColor: '#FB923C',
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 16, weight: '900' }
                    }
                },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748B' } },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                        border: { display: false },
                        beginAtZero: true,
                        ticks: { color: '#64748B' }
                    }
                }
            }
        });
    }

    // --- TENDENCIA COSTO/LEAD ---
    const ctxLine = document.getElementById('leadsLineChart');
    if (ctxLine) {
        if (charts.leadsLine) charts.leadsLine.destroy();

        const grad = ctxLine.getContext('2d').createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, 'rgba(251, 146, 60, 0.2)');
        grad.addColorStop(1, 'rgba(251, 146, 60, 0)');

        charts.leadsLine = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: leadsCharts.line.labels,
                datasets: [{
                    label: 'Costo/Lead S/',
                    data: leadsCharts.line.data,
                    borderColor: '#FB923C',
                    backgroundColor: grad,
                    fill: true,
                    tension: 0.45,
                    borderWidth: 4,
                    pointRadius: 4,
                    pointBackgroundColor: '#FB923C',
                    pointBorderColor: '#0F172A',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#FB923C',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 3,
                }]
            },
            options: {
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0F172A',
                        padding: 16,
                        cornerRadius: 12,
                        titleColor: '#FB923C',
                        titleFont: { size: 14, weight: 'bold' },
                        bodyColor: '#fff',
                        bodyFont: { size: 16, weight: '900' },
                        borderColor: 'rgba(251, 146, 60, 0.2)',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return 'Costo/Lead: S/ ' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#475569' } },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false },
                        border: { display: false },
                        ticks: { color: '#475569', callback: v => 'S/.' + v }
                    }
                }
            }
        });
    }

    // --- LEADS DIARIOS (BARRAS) ---
    const ctxBar = document.getElementById('leadsBarChart');
    if (ctxBar) {
        if (charts.leadsBar) charts.leadsBar.destroy();

        const grad = ctxBar.getContext('2d').createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, '#8B5CF6');
        grad.addColorStop(1, '#C4B5FD');

        charts.leadsBar = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: leadsCharts.mixed.labels,
                datasets: [{
                    label: 'Leads',
                    data: leadsCharts.mixed.leads,
                    backgroundColor: grad,
                    borderRadius: 30,
                    borderSkipped: false,
                    barThickness: 16,
                    hoverBackgroundColor: '#7C3AED',
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#fff',
                        titleColor: '#1E0B42',
                        bodyColor: '#1E0B42',
                        padding: 12,
                        cornerRadius: 12,
                        borderColor: '#F1F5F9',
                        borderWidth: 1,
                        shadowBlur: 10,
                        shadowColor: 'rgba(0,0,0,0.1)'
                    }
                },
                scales: {
                    x: { grid: { display: false }, border: { display: false } },
                    y: {
                        grid: { color: 'rgba(226, 232, 240, 0.4)', drawBorder: false },
                        border: { display: false }
                    }
                }
            }
        });
    }

    // --- INVERSIÓN DEL PERÍODO (DOUGHNUT) ---
    const ctxDoughnut = document.getElementById('leadsDoughnutChart');
    if (ctxDoughnut) {
        if (charts.doughnut) charts.doughnut.destroy();
        charts.doughnut = new Chart(ctxDoughnut, {
            type: 'doughnut',
            data: {
                labels: apiData.charts.doughnut.labels,
                datasets: [{
                    data: apiData.charts.doughnut.data,
                    backgroundColor: ['#8B5CF6', '#F1F5F9'],
                    borderWidth: 0,
                    hoverOffset: 4,
                    cutout: '88%',
                    borderRadius: 20
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            },
            plugins: [{
                id: 'centerText',
                beforeDraw: (chart) => {
                    const { width, height, ctx } = chart;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 36px Outfit';
                    ctx.fillStyle = '#1E0B42';
                    const consumido = apiData.kpis.presupuestoConsumido || 0;
                    ctx.fillText(`S/. ${consumido.toFixed(0)}`, width / 2, height / 2 - 5);
                    ctx.font = '700 11px Outfit';
                    ctx.fillStyle = '#94A3B8';
                    ctx.fillText('GASTADO', width / 2, height / 2 + 25);
                    ctx.restore();
                }
            }]
        });
    }
}
