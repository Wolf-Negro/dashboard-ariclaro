// State Management & Cache Control
const APP_CACHE_VERSION = 'v2.0';
const currentCacheVersion = localStorage.getItem('app_cache_version');

if (currentCacheVersion !== APP_CACHE_VERSION) {
    console.warn("Versión de caché obsoleta detecada. Limpiando localStorage...");
    localStorage.clear();
    localStorage.setItem('app_cache_version', APP_CACHE_VERSION);
}

let currentSection = 'dashboard';
let apiData = null;
let charts = {};

// Selectors
const contentArea = document.getElementById('content-area');
const navBtns = document.querySelectorAll('.nav-btn');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const pageTitle = document.getElementById('page-title');
const monthFilter = document.getElementById('month-filter');

// --- CONFIGURACIÓN DE LIMA (ZONA HORARIA ÚNICA) ---
const TZ = 'America/Lima';
const CACHE_KEY = 'ariclaro_cache_v1';
const CACHE_DATE_KEY = 'ariclaro_cache_date_v1';

function getTodayString() {
    const options = { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options); // YYYY-MM-DD
    return formatter.format(new Date());
}

function generateMonthOptions() {
    if (!monthFilter) return;

    const todayStr = getTodayString();
    const nowParts = todayStr.split('-');
    const currentYear = nowParts[0];
    const currentMonthNum = parseInt(nowParts[1]); // 1-12

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    monthFilter.innerHTML = '';

    for (let i = 0; i < currentMonthNum; i++) {
        const monthVal = (i + 1).toString().padStart(2, '0');
        const value = `${currentYear}-${monthVal}`;
        const text = `${monthNames[i]} ${currentYear}`;

        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;

        if ((i + 1) === currentMonthNum) {
            option.selected = true;
        }

        monthFilter.appendChild(option);
    }
}

function checkCache() {
    const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
    const today = getTodayString();

    if (cachedDate && cachedDate !== today) {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_DATE_KEY);
        return null;
    }

    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    generateMonthOptions();
    fetchData();
    setupEventListeners();
});

// --- ENGINE DE DATOS ---
async function fetchData(month = '') {
    const todayStr = getTodayString();
    const currentMonth = todayStr.substring(0, 7);
    const isCurrentMonth = !month || month === currentMonth;
    const targetMonth = month || currentMonth;

    if (!isCurrentMonth) {
        const histCached = localStorage.getItem(`ariclaro_data_${targetMonth}`);
        if (histCached) {
            apiData = JSON.parse(histCached);
            renderCurrentSection();
            return;
        }
    }

    if (isCurrentMonth) {
        const cachedData = checkCache();
        if (cachedData) {
            apiData = cachedData;
            renderCurrentSection();
        }
    }

    await syncWithServer(targetMonth, isCurrentMonth);
}

async function syncWithServer(month, isCurrentMonth) {
    try {
        if (!apiData) contentArea.innerHTML = '<div class="flex items-center justify-center min-h-[50vh]"><div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div></div>';

        const url = month ? `/api/data?month=${month}` : '/api/data';
        const response = await fetch(url);
        const result = await response.json();

        if (result.status === 'error') {
            renderError(result.message);
            return;
        }

        apiData = result;

        if (isCurrentMonth) {
            localStorage.setItem(CACHE_KEY, JSON.stringify(apiData));
            localStorage.setItem(CACHE_DATE_KEY, getTodayString());
        } else {
            localStorage.setItem(`ariclaro_data_${month}`, JSON.stringify(apiData));
        }

        renderCurrentSection();

        if (isCurrentMonth) {
            fetchTodayDelta();
        }
    } catch (err) {
        console.error("Sync Engine Failure:", err);
        if (!apiData) renderError("Error de conexión crítica.");
    }
}

async function fetchTodayDelta() {
    try {
        const response = await fetch('/api/today');
        const result = await response.json();

        if (result.status === 'success' && currentSection === 'dashboard') {
            const today = result.data;
            updateHoyUIMetrics(today);
        }
    } catch (err) {
        console.warn("Delta Update silenciado:", err);
    }
}

function updateHoyUIMetrics(today) {
    const todayStr = getTodayString();
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = monthFilter ? monthFilter.value : currentMonth;
    if (selectedMonth < currentMonth) return;

    const cards = document.querySelectorAll('p.text-3xl');
    if (cards.length >= 3) {
        cards[0].innerText = `S/. ${today.spend.toFixed(2)}`;
        cards[1].innerText = today.leads;
        cards[2].innerText = `S/. ${today.cpl.toFixed(2)}`;
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

    if (monthFilter) {
        monthFilter.addEventListener('change', (e) => {
            fetchData(e.target.value);
        });
    }
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

    const titles = {
        'dashboard': 'Dashboard de Resultados',
        'metrics': 'Métricas Diarias',
        'leads': 'Registro de Leads'
    };
    pageTitle.textContent = titles[section] || 'Dashboard';

    renderCurrentSection();
}

function renderCurrentSection() {
    if (!apiData) return;

    if (currentSection === 'dashboard') {
        renderDashboard();
    } else if (currentSection === 'metrics') {
        renderMetricsTable();
    } else if (currentSection === 'leads') {
        renderLeadsPlaceholder();
    }
}

function renderDashboard() {
    if (!apiData.dailyMetrics || apiData.dailyMetrics.length === 0) {
        contentArea.innerHTML = '<div class="text-center py-20 text-slate-400">Sin datos.</div>';
        return;
    }

    const today = apiData.dailyMetrics[0];
    const todayStr = getTodayString();
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = monthFilter ? monthFilter.value : currentMonth;
    const isHistorical = selectedMonth < currentMonth;

    const totalSpend = apiData.kpis.presupuestoConsumido;
    const totalLeads = apiData.kpis.leadsTotales;
    const monthDays = apiData.monthDays || 30;

    const avgSpend = (totalSpend / monthDays).toFixed(2);
    const avgLeads = (totalLeads / monthDays).toFixed(2);
    const avgCpl = apiData.kpis.costoPorLeadPromedio.replace('S/. ', '');

    contentArea.innerHTML = `
        <div class="space-y-10 animate-fade-in">
            
            <section id="top-metrics-section">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        ${!isHistorical ? `
                            <span class="w-2 h-2 bg-violet-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.6)]"></span>
                            Métricas de Hoy (${(() => {
                const parts = todayStr.split('-');
                const mos = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
                return `${parts[2]} ${mos[parseInt(parts[1]) - 1]}`;
            })()})
                        ` : `
                            <i data-lucide="calendar" class="w-4 h-4"></i>
                            Rendimiento Promedio Diario (${apiData.dailyMetrics[0].date.split(' ')[1]} ${selectedMonth.split('-')[0]})
                        `}
                    </h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                    <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-all">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center"><i data-lucide="zap" class="text-violet-600 w-5 h-5"></i></div>
                            <h3 class="text-slate-500 font-medium">${!isHistorical ? 'Gasto Hoy' : 'Gasto Promedio Diario'}</h3>
                        </div>
                        <p class="text-3xl font-bold tracking-tight text-slate-800">S/. ${!isHistorical ? today.spend.toFixed(2) : avgSpend}</p>
                    </div>
                    <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-all">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center"><i data-lucide="users" class="text-violet-600 w-5 h-5"></i></div>
                            <h3 class="text-slate-500 font-medium">${!isHistorical ? 'Leads Hoy' : 'Promedio Leads/Día'}</h3>
                        </div>
                        <p class="text-3xl font-bold tracking-tight text-slate-800">${!isHistorical ? today.leads : avgLeads}</p>
                    </div>
                    <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-all">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center"><i data-lucide="target" class="text-violet-600 w-5 h-5"></i></div>
                            <h3 class="text-slate-500 font-medium">${!isHistorical ? 'Costo/Lead Hoy' : 'CPL Promedio'}</h3>
                        </div>
                        <p class="text-3xl font-bold tracking-tight text-slate-800">S/. ${!isHistorical ? today.cpl.toFixed(2) : avgCpl}</p>
                    </div>
                </div>
            </section>

            <section>
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xs font-bold uppercase tracking-widest text-slate-400">Resultados Acumulados Mes</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                    <div class="bg-white/50 p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center"><i data-lucide="wallet" class="text-violet-600 w-5 h-5"></i></div>
                            <h3 class="text-slate-500 font-medium">Gasto Total</h3>
                        </div>
                        <p class="text-3xl font-bold tracking-tight text-slate-800">${apiData.kpis.gastoTotal}</p>
                    </div>
                    <div class="bg-white/50 p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><i data-lucide="users" class="text-emerald-600 w-5 h-5"></i></div>
                            <h3 class="text-slate-500 font-medium">Leads Totales</h3>
                        </div>
                        <p class="text-3xl font-bold tracking-tight text-slate-800">${apiData.kpis.leadsTotales}</p>
                    </div>
                    <div class="bg-white/50 p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><i data-lucide="line-chart" class="text-amber-600 w-5 h-5"></i></div>
                            <h3 class="text-slate-500 font-medium">Costo/Lead Promedio</h3>
                        </div>
                        <p class="text-3xl font-bold tracking-tight text-slate-800">${apiData.kpis.costoPorLeadPromedio}</p>
                    </div>
                </div>
            </section>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-violet-200 transition-all min-h-[400px]">
                    <div class="flex items-center justify-between mb-8">
                        <h3 class="font-bold text-lg text-slate-800">Tendencia CPL</h3>
                        <div class="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center"><i data-lucide="line-chart" class="text-indigo-600 w-5 h-5"></i></div>
                    </div>
                    <div class="h-64">
                        <canvas id="lineChart"></canvas>
                    </div>
                </div>

                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-violet-200 transition-all min-h-[400px]">
                    <div class="flex items-center justify-between mb-8">
                        <h3 class="font-bold text-lg text-slate-800">Leads Diarios</h3>
                        <div class="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><i data-lucide="users" class="text-emerald-600 w-5 h-5"></i></div>
                    </div>
                    <div class="h-64">
                        <canvas id="barChart"></canvas>
                    </div>
                </div>

                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-violet-200 transition-all min-h-[400px]">
                    <div class="flex items-center justify-between mb-8">
                        <h3 class="font-bold text-lg text-slate-800">Control de Presupuesto</h3>
                        <div class="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center"><i data-lucide="wallet" class="text-violet-600 w-5 h-5"></i></div>
                    </div>
                    <div class="relative h-64">
                        <canvas id="doughnutChart"></canvas>
                    </div>
                </div>

                <div class="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative group hover:border-violet-200 transition-all min-h-[400px]">
                    <div class="flex items-center justify-between mb-8">
                        <h3 class="font-bold text-lg text-slate-800">Inversión vs. Leads</h3>
                        <div class="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><i data-lucide="target" class="text-amber-600 w-5 h-5"></i></div>
                    </div>
                    <div class="h-64">
                        <canvas id="mixedChart"></canvas>
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

    const ctxDoughnut = document.getElementById('doughnutChart');
    if (ctxDoughnut) {
        if (charts.doughnut) charts.doughnut.destroy();
        const remaining = apiData.kpis.presupuestoRestante;
        charts.doughnut = new Chart(ctxDoughnut, {
            type: 'doughnut',
            data: {
                labels: apiData.charts.doughnut.labels,
                datasets: [{
                    data: apiData.charts.doughnut.data,
                    backgroundColor: ['#8B5CF6', '#F1F5F9'],
                    borderWidth: 0,
                    cutout: '80%'
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
                    ctx.font = 'bold 32px Outfit';
                    ctx.fillStyle = '#0F172A';
                    ctx.fillText(`S/. ${remaining.toFixed(2)}`, width / 2, height / 2 - 10);
                    ctx.font = '500 13px Outfit';
                    ctx.fillStyle = '#64748B';
                    ctx.fillText('Queda del presupuesto', width / 2, height / 2 + 25);
                    ctx.font = '400 12px Outfit';
                    ctx.fillText('mensual de S/. 12,000', width / 2, height / 2 + 42);
                    ctx.restore();
                }
            }]
        });
    }

    const ctxBar = document.getElementById('barChart');
    if (ctxBar) {
        if (charts.bar) charts.bar.destroy();
        charts.bar = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: apiData.charts.mixed.labels,
                datasets: [{
                    label: 'Leads',
                    data: apiData.charts.mixed.leads,
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    borderColor: '#8B5CF6',
                    borderWidth: 1,
                    borderRadius: 12
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    const ctxLine = document.getElementById('lineChart');
    if (ctxLine) {
        if (charts.line) charts.line.destroy();
        charts.line = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: apiData.charts.line.labels,
                datasets: [{
                    label: 'CPL S/',
                    data: apiData.charts.line.data,
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            optimalLine: {
                                type: 'line',
                                yMin: 5,
                                yMax: 5,
                                borderColor: '#F43F5E',
                                borderWidth: 2,
                                borderDash: [6, 4],
                                label: {
                                    display: true,
                                    content: 'CPL Óptimo: S/ 5.00',
                                    position: 'start',
                                    backgroundColor: '#F43F5E',
                                    color: '#fff',
                                    font: { size: 10, weight: 'bold' },
                                    padding: 4
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    const ctxMixed = document.getElementById('mixedChart');
    if (ctxMixed) {
        if (charts.mixed) charts.mixed.destroy();
        charts.mixed = new Chart(ctxMixed, {
            type: 'bar',
            data: {
                labels: apiData.charts.mixed.labels,
                datasets: [
                    {
                        label: 'Gasto S/',
                        data: apiData.charts.mixed.spend,
                        backgroundColor: 'rgba(45, 18, 99, 0.1)',
                        borderColor: 'rgba(45, 18, 99, 0.3)',
                        borderWidth: 1,
                        borderRadius: 10,
                        order: 2
                    },
                    {
                        label: 'Leads',
                        data: apiData.charts.mixed.leads,
                        type: 'line',
                        borderColor: '#8B5CF6',
                        borderWidth: 3,
                        tension: 0.4,
                        order: 1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                scales: {
                    y1: { position: 'right', grid: { display: false } }
                }
            }
        });
    }
}

function renderMetricsTable() {
    const metrics = apiData.dailyMetrics;
    const rows = metrics.map(item => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="py-4 px-6 font-medium text-slate-800">${item.date}</td>
            <td class="py-4 px-6 text-slate-600">S/. ${item.spend.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
            <td class="py-4 px-6 text-slate-600">${item.leads}</td>
            <td class="py-4 px-6 font-semibold text-violet-600">S/. ${item.cpl.toFixed(2)}</td>
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

function renderLeadsPlaceholder() {
    contentArea.innerHTML = `
        <div class="animate-fade-in flex flex-col items-center justify-center min-h-[50vh] bg-white rounded-3xl border border-slate-200">
            <div class="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center mb-6"><i data-lucide="clock" class="text-violet-600 w-8 h-8"></i></div>
            <h2 class="text-2xl font-bold text-slate-800 mb-2">Registro de Leads</h2>
            <p class="text-slate-500 text-center">Data del CRM próximamente disponible.</p>
        </div>
    `;
    lucide.createIcons();
}
