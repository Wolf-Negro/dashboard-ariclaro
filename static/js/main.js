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

    // Se ha desactivado el caché local por solicitud para garantizar data en tiempo real 100%

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

        apiData = result;
        // Caché desactivado: localStorage.setItem(CACHE_KEY, JSON.stringify(apiData));

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

    try {
        if (currentSection === 'dashboard') {
            renderDashboard();
        } else if (currentSection === 'metrics') {
            renderMetricsTable();
        } else if (currentSection === 'leads') {
            renderLeadsPlaceholder();
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

function renderDashboard() {
    // Definir valores por defecto extremadamente seguros
    const kpi = apiData.kpis || {};
    const metrics = apiData.dailyMetrics || [];
    const today = metrics[0] || { spend: 0, leads: 0, cpl: 0 };
    
    const todayStr = getTodayString();
    const currentMonth = todayStr.substring(0, 7);
    const selectedMonth = monthFilter ? monthFilter.value : currentMonth;
    const isHistorical = selectedMonth < currentMonth;

    const totalSpend = kpi.presupuestoConsumido || 0;
    const totalLeads = kpi.leadsTotales || 0;
    const monthDays = apiData.monthDays || 30;

    const avgSpend = (totalSpend / monthDays).toFixed(2);
    const avgLeads = (totalLeads / monthDays).toFixed(2);
    
    // Formateo seguro de CPL
    let avgCplRaw = kpi.costoPorLeadPromedio || "S/. 0.00";
    let avgCpl = typeof avgCplRaw === 'string' ? avgCplRaw.replace('S/. ', '') : "0.00";

    // Métricas del embudo
    const reach = kpi.reachTotal || 0;
    const clicks = kpi.clicksTotal || 0;
    const visits = kpi.visitsTotal || 0;
    const ctr = reach > 0 ? ((clicks / reach) * 100).toFixed(2) : '0.00';
    const conv = clicks > 0 ? ((totalLeads / clicks) * 100).toFixed(2) : '0.00';
    const todayCpl = today.leads > 0 ? (today.spend / today.leads).toFixed(2) : "0.00";
    
    console.log("--- VALIDACIÓN CPL HOY ---");
    console.log("Gasto de hoy:", today.spend);
    console.log("Leads de hoy:", today.leads);
    console.log("CPL Hoy calculado:", todayCpl);
    console.log("--------------------------");

    contentArea.innerHTML = `
        <div class="space-y-12 animate-fade-in pb-20">
            
            <!-- TOP METRICS SECTION -->
            <section id="top-metrics-section">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm card-hover group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-200"><i data-lucide="zap" class="w-6 h-6"></i></div>
                            <span class="px-2 py-1 bg-violet-50 text-violet-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">Actual</span>
                        </div>
                        <p class="text-slate-500 text-sm font-medium mb-1">${!isHistorical ? 'Gasto Hoy' : 'Gasto Diario'}</p>
                        <h4 class="text-3xl font-black text-[#1E0B42] tracking-tighter">S/. ${!isHistorical ? (today.spend || 0).toFixed(2) : avgSpend}</h4>
                    </div>
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm card-hover group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-100"><i data-lucide="users" class="w-6 h-6"></i></div>
                            <span class="px-2 py-1 bg-orange-50 text-orange-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">Live</span>
                        </div>
                        <p class="text-slate-500 text-sm font-medium mb-1">${!isHistorical ? 'Leads Captados' : 'Leads/Día'}</p>
                        <h4 class="text-3xl font-black text-[#1E0B42] tracking-tighter">${!isHistorical ? (today.leads || 0) : avgLeads}</h4>
                    </div>
                    <div class="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm card-hover group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full -mr-10 -mt-10 group-hover:scale-110 transition-transform"></div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-100"><i data-lucide="target" class="w-6 h-6"></i></div>
                            <span class="px-2 py-1 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">Target</span>
                        </div>
                        <p class="text-slate-500 text-sm font-medium mb-1">CPL Hoy</p>
                        <h4 class="text-3xl font-black text-[#1E0B42] tracking-tighter">S/. ${!isHistorical ? todayCpl : avgCpl}</h4>
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
                        <canvas id="growthChart"></canvas>
                    </div>
                </div>

                <!-- 2. CONTROL DE PRESUPUESTO -->
                <div class="lg:col-span-4 bg-white p-6 lg:p-8 rounded-[2.5rem] lg:rounded-[3.5rem] floating-card border border-slate-100 relative overflow-hidden flex flex-col min-h-[400px] lg:min-h-[420px] card-hover">
                    <div class="relative mb-10 text-center">
                        <h3 class="font-bold text-xl text-[#1E0B42]">Control de Presupuesto</h3>
                        <p class="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">Mensual: S/. 12,000</p>
                    </div>
                    <div class="relative flex-1 flex flex-col items-center justify-center">
                        <div class="w-full h-64 relative">
                            <canvas id="doughnutChart"></canvas>
                        </div>
                        <div class="mt-8 grid grid-cols-2 gap-4 w-full">
                            <div class="p-4 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                                <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Consumido</p>
                                <p class="text-sm font-black text-[#1E0B42]">${kpi.gastoTotal || 'S/. 0.00'}</p>
                            </div>
                            <div class="p-4 bg-violet-50 rounded-3xl border border-violet-100 text-center">
                                <p class="text-[10px] font-bold text-violet-400 uppercase mb-1">Queda</p>
                                <p class="text-sm font-black text-violet-600">S/. ${(kpi.presupuestoRestante || 0).toFixed(2)}</p>
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
                        <canvas id="barChart"></canvas>
                    </div>
                </div>

                <!-- 4. TENDENCIA CPL -->
                <div class="lg:col-span-6 bg-[#1E0B42] p-6 lg:p-8 rounded-[2.5rem] lg:rounded-[3.5rem] dark-card relative overflow-hidden flex flex-col min-h-[400px] lg:min-h-[420px] group card-hover">
                    <div class="absolute top-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full -mr-48 -mt-48 blur-[100px] group-hover:bg-violet-600/20 transition-all duration-700"></div>
                    <div class="relative flex items-center justify-between mb-12">
                        <div>
                            <div class="flex items-center gap-3 mb-2">
                                <span class="w-3 h-3 bg-orange-400 rounded-full shadow-[0_0_15px_#FB923C] animate-pulse"></span>
                                <h3 class="font-bold text-2xl text-white tracking-tight">Tendencia CPL</h3>
                            </div>
                            <p class="text-slate-500 text-sm font-medium">Fluctuación diaria</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Promedio</p>
                            <p class="text-2xl font-black text-orange-400 tracking-tighter">${avgCplRaw}</p>
                        </div>
                    </div>
                    <div class="relative flex-1 min-h-0">
                        <canvas id="lineChart"></canvas>
                    </div>
                </div>

                <!-- 5. EMBUDO DE CONVERSIÓN -->
                <div class="lg:col-span-12 bg-white p-8 lg:p-10 rounded-[3rem] lg:rounded-[4rem] floating-card border border-slate-100 relative overflow-hidden card-hover group mt-4">
                    <div class="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:opacity-[0.05] transition-opacity duration-700">
                        <i data-lucide="filter" class="w-64 h-64 text-[#1E0B42]"></i>
                    </div>
                    <div class="mb-12">
                        <h3 class="font-bold text-3xl text-[#1E0B42] tracking-tight">Embudo de Conversión</h3>
                        <p class="text-slate-400 font-medium">Análisis de eficiencia del funnel publicitario</p>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-12 items-center">
                        <div class="md:col-span-2">
                            <div class="funnel-container">
                                <!-- Stage 1: Alcance -->
                                <div class="funnel-stage stage-reach group/s1">
                                    <p class="funnel-label text-slate-500">Alcance (Reach)</p>
                                    <p class="funnel-value text-[#1E0B42]">${reach.toLocaleString()}</p>
                                    <div class="conversion-tag text-orange-500">
                                        ${ctr}% CTR
                                    </div>
                                </div>

                                <!-- Stage 2: Clics -->
                                <div class="funnel-stage stage-clicks group/s2">
                                    <p class="funnel-label text-orange-600">Clics en el Enlace</p>
                                    <p class="funnel-value text-[#1E0B42]">${clicks.toLocaleString()}</p>
                                    <div class="conversion-tag text-orange-600 bg-orange-50 border-orange-100">
                                        ${((visits / (clicks || 1)) * 100).toFixed(1)}% VISITA
                                    </div>
                                </div>

                                <!-- Stage 3: Visitas -->
                                <div class="funnel-stage stage-visits group/s3">
                                    <p class="funnel-label text-orange-700">Visitas a la página</p>
                                    <p class="funnel-value text-[#1E0B42]">${(apiData.kpis.visitsTotal || 0).toLocaleString()}</p>
                                    <div class="conversion-tag text-white bg-[#FB923C] border-none shadow-orange-200">
                                        ${((totalLeads / (apiData.kpis.visitsTotal || 1)) * 100).toFixed(1)}% CONV.
                                    </div>
                                </div>

                                <!-- Stage 4: Leads -->
                                <div class="funnel-stage stage-leads group/s4">
                                    <p class="funnel-label text-orange-100">Leads Finales</p>
                                    <p class="funnel-value text-white">${totalLeads.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-6">
                            <!-- COSTO POR CLIC -->
                            <div class="p-8 bg-violet-50/80 rounded-[2.5rem] border border-violet-100 relative group overflow-hidden">
                                <div class="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><i data-lucide="mouse-pointer-2" class="w-12 h-12 text-[#1E0B42]"></i></div>
                                <p class="text-xs font-bold text-violet-400 uppercase tracking-widest mb-4">Costo por Clic Promedio</p>
                                <div class="flex items-baseline gap-1">
                                    <p class="text-sm font-bold text-slate-400">S/.</p>
                                    <p class="text-4xl font-black text-[#1E0B42]">${(totalSpend / (clicks || 1)).toFixed(2)}</p>
                                </div>
                                <p class="text-[10px] text-slate-400 mt-2 font-medium">Inversión por cada clic generado</p>
                            </div>
                            
                            <!-- COSTO POR LEAD -->
                            <div class="p-8 bg-[#1E0B42] rounded-[2.5rem] relative overflow-hidden group">
                                <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><i data-lucide="user-check" class="w-12 h-12 text-white"></i></div>
                                <div class="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>
                                <p class="text-xs font-bold text-violet-300/50 uppercase tracking-widest mb-4">Costo por Lead Promedio</p>
                                <div class="flex items-baseline gap-1">
                                    <p class="text-sm font-bold text-violet-300/30">S/.</p>
                                    <p class="text-4xl font-black text-white">${(totalSpend / (totalLeads || 1)).toFixed(2)}</p>
                                </div>
                                <p class="text-[10px] text-violet-300/40 mt-2 font-medium">Eficiencia de captación mensual</p>
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

    // --- NEW: GROWTH CHART (LEADS ACUMULADOS) ---
    const ctxGrowth = document.getElementById('growthChart');
    if (ctxGrowth) {
        if (charts.growth) charts.growth.destroy();

        // Calcular leads acumulados
        let cumulative = 0;
        const cumulativeData = apiData.charts.mixed.leads.map(val => {
            cumulative += val;
            return cumulative;
        });

        const grad = ctxGrowth.getContext('2d').createLinearGradient(0, 0, 0, 400);
        grad.addColorStop(0, 'rgba(251, 146, 60, 0.2)');
        grad.addColorStop(1, 'rgba(251, 146, 60, 0)');

        charts.growth = new Chart(ctxGrowth, {
            type: 'line',
            data: {
                labels: apiData.charts.mixed.labels,
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
    
    // --- CHART 1: TENDENCIA CPL (DARK NEON LINE) ---
    const ctxLine = document.getElementById('lineChart');
    if (ctxLine) {
        if (charts.line) charts.line.destroy();
        
        const grad = ctxLine.getContext('2d').createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, 'rgba(251, 146, 60, 0.2)');
        grad.addColorStop(1, 'rgba(251, 146, 60, 0)');

        charts.line = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: apiData.charts.line.labels,
                datasets: [{
                    label: 'CPL S/',
                    data: apiData.charts.line.data,
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
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
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
                                return 'CPL: S/ ' + context.parsed.y.toFixed(2);
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: 5.5,
                                yMax: 5.5,
                                borderColor: 'rgba(251, 146, 60, 0.3)',
                                borderWidth: 2,
                                borderDash: [6, 6],
                                label: {
                                    display: true,
                                    content: 'CPL Óptimo: S/ 5.50',
                                    position: 'end',
                                    backgroundColor: 'rgba(251, 146, 60, 0.8)',
                                    color: '#fff',
                                    font: { size: 10, weight: 'bold', family: 'Outfit' },
                                    padding: 6,
                                    borderRadius: 6
                                }
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

    // --- CHART 2: LEADS DIARIOS (MODERN PILLAR BARS) ---
    const ctxBar = document.getElementById('barChart');
    if (ctxBar) {
        if (charts.bar) charts.bar.destroy();
        
        const grad = ctxBar.getContext('2d').createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, '#8B5CF6');
        grad.addColorStop(1, '#C4B5FD');

        charts.bar = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: apiData.charts.mixed.labels,
                datasets: [{
                    label: 'Leads',
                    data: apiData.charts.mixed.leads,
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

    // (Mixed chart removed as per client request)

    // --- CHART 4: CONTROL DE PRESUPUESTO (MODERN DOUGHNUT) ---
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
                    const pct = ((apiData.kpis.presupuestoConsumido / 12000) * 100).toFixed(0);
                    ctx.fillText(`${pct}%`, width / 2, height / 2 - 5);
                    ctx.font = '700 11px Outfit';
                    ctx.fillStyle = '#94A3B8';
                    ctx.fillText('CONSUMIDO', width / 2, height / 2 + 25);
                    ctx.restore();
                }
            }]
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
