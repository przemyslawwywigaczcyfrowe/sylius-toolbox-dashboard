// dashboard.js — Sylius Toolbox: centralny panel zarządzania i analizy

// ============================================================
// GLOBALNY STAN
// ============================================================

var allEvents = [];
var totalTimeSavedMinutes = 0;
var dailyData = [];
var toolData = [];
var userData = [];
var feedPage = 0;
var feedPageSize = 50;
var feedAutoTimer = null;
var userSortField = 'uses';
var userSortDir = -1;

// ============================================================
// INICJALIZACJA
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // Auto-connect jeśli credentials zapisane
  var sb = getSupabase();
  if (sb) { showDashboard(); loadData(); }

  // Login
  document.getElementById('cfg-connect').addEventListener('click', function() {
    var url = document.getElementById('cfg-url').value.trim();
    var key = document.getElementById('cfg-key').value.trim();
    if (!url || !key) { showLoginError('Podaj URL i klucz Supabase.'); return; }
    initSupabase(url, key);
    showDashboard();
    loadData();
  });

  // Disconnect
  document.getElementById('btn-disconnect').addEventListener('click', function() {
    disconnectSupabase();
    stopAutoRefresh();
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  });

  // Refresh + date range
  document.getElementById('btn-refresh').addEventListener('click', loadData);
  document.getElementById('date-range').addEventListener('change', loadData);

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      switchTab(this.dataset.tab);
    });
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebar-toggle').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // ROI inputs
  document.getElementById('roi-hourly-rate').addEventListener('input', updateROI);
  document.getElementById('roi-work-days').addEventListener('input', updateROI);

  // User search
  document.getElementById('user-search').addEventListener('input', function() {
    renderUsersTable(filterUsers(this.value));
  });

  // User detail close
  document.getElementById('btn-close-user-detail').addEventListener('click', function() {
    document.getElementById('user-detail').classList.add('hidden');
  });

  // User table sorting
  document.querySelectorAll('.sortable').forEach(function(th) {
    th.addEventListener('click', function() {
      var field = this.dataset.sort;
      if (userSortField === field) userSortDir *= -1;
      else { userSortField = field; userSortDir = -1; }
      renderUsersTable(filterUsers(document.getElementById('user-search').value));
    });
  });

  // Feed pagination
  document.getElementById('feed-prev').addEventListener('click', function() {
    if (feedPage > 0) { feedPage--; renderFeed(); }
  });
  document.getElementById('feed-next').addEventListener('click', function() {
    feedPage++;
    renderFeed();
  });

  // Feed auto-refresh
  document.getElementById('feed-auto-refresh').addEventListener('change', function() {
    if (this.checked) startAutoRefresh();
    else stopAutoRefresh();
  });

  // Export buttons
  document.getElementById('btn-export-users').addEventListener('click', exportUsersCSV);
  document.getElementById('btn-export-feed').addEventListener('click', exportFeedCSV);
  document.getElementById('btn-export-report').addEventListener('click', exportFullReport);
});

// ============================================================
// NAWIGACJA
// ============================================================

function switchTab(tabId) {
  // Ukryj wszystkie taby
  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.add('hidden'); });
  // Pokaż wybrany
  var tab = document.getElementById('tab-' + tabId);
  if (tab) tab.classList.remove('hidden');
  // Aktywny nav
  document.querySelectorAll('.nav-item').forEach(function(el) { el.classList.remove('active'); });
  var nav = document.querySelector('.nav-item[data-tab="' + tabId + '"]');
  if (nav) nav.classList.add('active');
  // Tytuł
  var titles = { overview: 'Przegląd', users: 'Użytkownicy', tools: 'Narzędzia', patterns: 'Wzorce czasowe', feed: 'Live feed', roi: 'ROI i raporty' };
  document.getElementById('page-title').textContent = titles[tabId] || tabId;
  // Zamknij sidebar na mobile
  document.querySelector('.sidebar').classList.remove('open');
}

// ============================================================
// LOGIN / DASHBOARD
// ============================================================

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function showLoginError(msg) {
  var el = document.getElementById('cfg-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 5000);
}

// ============================================================
// ŁADOWANIE DANYCH
// ============================================================

async function loadData() {
  var sb = getSupabase();
  if (!sb) return;

  var days = parseInt(document.getElementById('date-range').value, 10);
  var since = null;
  if (days > 0) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    since = d.toISOString();
  }

  try {
    var query = sb.from('events').select('*').order('created_at', { ascending: false });
    if (since) query = query.gte('created_at', since);
    var result = await query.limit(10000);

    if (result.error) {
      showLoginError('Błąd: ' + result.error.message);
      return;
    }

    allEvents = result.data || [];
    processAllData();

    // Timestamp
    document.getElementById('last-refresh').textContent = 'Odświeżono: ' + new Date().toLocaleTimeString('pl-PL');

    // Start auto-refresh jeśli na feed
    if (document.getElementById('feed-auto-refresh').checked) startAutoRefresh();

  } catch (e) {
    showLoginError('Błąd połączenia: ' + e.message);
  }
}

// ============================================================
// PRZETWARZANIE DANYCH
// ============================================================

function processAllData() {
  var events = allEvents;
  var generateEvents = events.filter(function(e) { return e.action === 'generate'; });
  var successEvents = generateEvents.filter(function(e) { return e.status === 'success'; });
  var errorEvents = generateEvents.filter(function(e) { return e.status === 'error'; });
  var uniqueUsers = {};
  events.forEach(function(e) { if (e.user_email) uniqueUsers[e.user_email] = true; });

  totalTimeSavedMinutes = 0;
  successEvents.forEach(function(e) { totalTimeSavedMinutes += (e.time_saved_minutes || 0); });

  var avgLatency = 0;
  var latencyEvents = generateEvents.filter(function(e) { return e.webhook_latency_ms > 0; });
  if (latencyEvents.length > 0) {
    var totalLatency = 0;
    latencyEvents.forEach(function(e) { totalLatency += e.webhook_latency_ms; });
    avgLatency = Math.round(totalLatency / latencyEvents.length);
  }

  var successRate = generateEvents.length > 0 ? Math.round((successEvents.length / generateEvents.length) * 100) : 0;

  // KPI
  document.getElementById('kpi-total-uses').textContent = generateEvents.length;
  document.getElementById('kpi-time-saved').textContent = (totalTimeSavedMinutes / 60).toFixed(1) + 'h';
  document.getElementById('kpi-active-users').textContent = Object.keys(uniqueUsers).length;
  document.getElementById('kpi-success-rate').textContent = successRate + '%';
  document.getElementById('kpi-error-count').textContent = errorEvents.length;
  document.getElementById('kpi-avg-latency').textContent = avgLatency + 'ms';

  // Trendy KPI — porównanie pierwszej i drugiej połowy okresu
  calculateAndShowTrends(events);

  // Dzienne agregaty
  var dailyMap = {};
  events.forEach(function(e) {
    var day = e.created_at.substring(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { day: day, total_uses: 0, total_time_saved_minutes: 0 };
    if (e.action === 'generate') {
      dailyMap[day].total_uses++;
      dailyMap[day].total_time_saved_minutes += (e.time_saved_minutes || 0);
    }
  });
  dailyData = Object.values(dailyMap).sort(function(a, b) { return a.day.localeCompare(b.day); });

  // Per-tool
  var toolMap = {};
  generateEvents.forEach(function(e) {
    var tid = e.tool_id || 'unknown';
    if (!toolMap[tid]) toolMap[tid] = { tool_id: tid, tool_name: e.tool_name || tid, total_uses: 0, successes: 0, errors: 0, undos: 0, time_saved: 0, total_latency: 0, latency_count: 0 };
    toolMap[tid].total_uses++;
    if (e.status === 'success') { toolMap[tid].successes++; toolMap[tid].time_saved += (e.time_saved_minutes || 0); }
    if (e.status === 'error') toolMap[tid].errors++;
    if (e.webhook_latency_ms > 0) { toolMap[tid].total_latency += e.webhook_latency_ms; toolMap[tid].latency_count++; }
  });
  events.filter(function(e) { return e.action === 'undo'; }).forEach(function(e) {
    var tid = e.tool_id || 'unknown';
    if (toolMap[tid]) toolMap[tid].undos++;
  });
  toolData = Object.values(toolMap);

  // Per-user
  var userMap = {};
  events.forEach(function(e) {
    var email = e.user_email || 'unknown';
    if (!userMap[email]) userMap[email] = { user_email: email, user_name: e.user_name || email, total_uses: 0, successes: 0, errors: 0, total_time_saved_minutes: 0, tools_used: {}, last_active: e.created_at, events: [] };
    userMap[email].events.push(e);
    if (e.action === 'generate') {
      userMap[email].total_uses++;
      if (e.status === 'success') { userMap[email].successes++; userMap[email].total_time_saved_minutes += (e.time_saved_minutes || 0); }
      if (e.status === 'error') userMap[email].errors++;
      userMap[email].tools_used[e.tool_id || 'unknown'] = true;
    }
    if (e.created_at > userMap[email].last_active) userMap[email].last_active = e.created_at;
  });
  userData = Object.values(userMap).sort(function(a, b) { return b.total_uses - a.total_uses; });

  // Per-user first seen (adopcja)
  var adoptionMap = {};
  events.forEach(function(e) {
    var email = e.user_email || 'unknown';
    if (!adoptionMap[email] || e.created_at < adoptionMap[email]) {
      adoptionMap[email] = e.created_at;
    }
  });
  // Sortuj wg daty pierwszego użycia
  var adoptionDays = {};
  for (var email in adoptionMap) {
    var day = adoptionMap[email].substring(0, 10);
    adoptionDays[day] = (adoptionDays[day] || 0) + 1;
  }
  var adoptionTimeline = Object.keys(adoptionDays).sort().map(function(day) { return { day: day, newUsers: adoptionDays[day] }; });
  // Kumulatywna adopcja
  var cumUsers = 0;
  adoptionTimeline.forEach(function(d) { cumUsers += d.newUsers; d.cumulativeUsers = cumUsers; });

  // Render everything
  renderOverview();
  renderUsersTable(userData);
  renderAdoption(adoptionTimeline);
  renderToolsTab();
  renderPatternsTab();
  renderFeed();
  updateROI();
  renderReportSummary();
}

// ============================================================
// TRENDY KPI
// ============================================================

function calculateAndShowTrends(events) {
  if (events.length === 0) return;

  // Znajdź zakres dat
  var sorted = events.slice().sort(function(a, b) { return a.created_at.localeCompare(b.created_at); });
  var firstDate = new Date(sorted[0].created_at);
  var lastDate = new Date(sorted[sorted.length - 1].created_at);
  var midDate = new Date((firstDate.getTime() + lastDate.getTime()) / 2);
  var midISO = midDate.toISOString();

  var firstHalf = events.filter(function(e) { return e.created_at < midISO; });
  var secondHalf = events.filter(function(e) { return e.created_at >= midISO; });

  // Metryki per połowa
  function calcMetrics(evts) {
    var gen = evts.filter(function(e) { return e.action === 'generate'; });
    var succ = gen.filter(function(e) { return e.status === 'success'; });
    var users = {};
    evts.forEach(function(e) { if (e.user_email) users[e.user_email] = true; });
    var timeSaved = 0;
    succ.forEach(function(e) { timeSaved += (e.time_saved_minutes || 0); });
    return {
      uses: gen.length,
      timeSaved: timeSaved,
      users: Object.keys(users).length
    };
  }

  var m1 = calcMetrics(firstHalf);
  var m2 = calcMetrics(secondHalf);

  function showTrend(elementId, current, previous) {
    var el = document.getElementById(elementId);
    if (!el) return;
    if (previous === 0 && current === 0) { el.textContent = ''; el.className = 'kpi-trend flat'; return; }
    if (previous === 0) { el.textContent = '+100%'; el.className = 'kpi-trend up'; return; }
    var pct = Math.round(((current - previous) / previous) * 100);
    var arrow = pct > 0 ? '+' : '';
    el.textContent = arrow + pct + '% vs poprz. okres';
    el.className = 'kpi-trend ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat');
  }

  showTrend('kpi-total-uses-trend', m2.uses, m1.uses);
  showTrend('kpi-time-saved-trend', m2.timeSaved, m1.timeSaved);
  showTrend('kpi-active-users-trend', m2.users, m1.users);
}

// ============================================================
// TAB: PRZEGLĄD
// ============================================================

function renderOverview() {
  createUsageOverTimeChart('chart-usage-over-time', dailyData);
  createTimeSavedChart('chart-time-saved', dailyData);
  createByToolChart('chart-by-tool', toolData);
  createSuccessRateChart('chart-success-rate', toolData);
  createUserActivityChart('chart-top-users', userData);
}

// ============================================================
// TAB: UŻYTKOWNICY
// ============================================================

function filterUsers(query) {
  var q = (query || '').toLowerCase();
  var filtered = userData;
  if (q) {
    filtered = userData.filter(function(u) {
      return u.user_email.toLowerCase().indexOf(q) !== -1 || u.user_name.toLowerCase().indexOf(q) !== -1;
    });
  }
  // Sort
  filtered = filtered.slice().sort(function(a, b) {
    var va, vb;
    switch (userSortField) {
      case 'name': va = a.user_name; vb = b.user_name; return va.localeCompare(vb) * userSortDir;
      case 'uses': va = a.total_uses; vb = b.total_uses; break;
      case 'time': va = a.total_time_saved_minutes; vb = b.total_time_saved_minutes; break;
      case 'last': va = a.last_active; vb = b.last_active; return va.localeCompare(vb) * userSortDir;
      default: va = a.total_uses; vb = b.total_uses;
    }
    return (va - vb) * userSortDir;
  });
  return filtered;
}

function renderUsersTable(users) {
  var tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  users.forEach(function(user, i) {
    var hours = (user.total_time_saved_minutes / 60).toFixed(1);
    var toolCount = Object.keys(user.tools_used).length;
    var successRate = user.total_uses > 0 ? Math.round((user.successes / user.total_uses) * 100) : 0;
    var lastActive = new Date(user.last_active).toLocaleString('pl-PL');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td><strong>' + esc(user.user_name) + '</strong></td>' +
      '<td>' + user.total_uses + '</td>' +
      '<td>' + hours + 'h</td>' +
      '<td>' + successRate + '%</td>' +
      '<td>' + toolCount + '</td>' +
      '<td>' + lastActive + '</td>' +
      '<td><button class="btn-secondary btn-user-detail" data-email="' + esc(user.user_email) + '">Pokaż</button></td>';
    tbody.appendChild(tr);
  });
  // Bind detail buttons
  tbody.querySelectorAll('.btn-user-detail').forEach(function(btn) {
    btn.addEventListener('click', function() { showUserDetail(this.dataset.email); });
  });
}

function showUserDetail(email) {
  var user = userData.find(function(u) { return u.user_email === email; });
  if (!user) return;

  document.getElementById('user-detail').classList.remove('hidden');
  document.getElementById('user-detail-name').textContent = user.user_name + ' (' + user.user_email + ')';
  document.getElementById('ud-uses').textContent = user.total_uses;
  document.getElementById('ud-time').textContent = (user.total_time_saved_minutes / 60).toFixed(1) + 'h';
  document.getElementById('ud-success').textContent = user.total_uses > 0 ? Math.round((user.successes / user.total_uses) * 100) + '%' : '—';

  // Ulubione narzędzie
  var toolCounts = {};
  user.events.forEach(function(e) {
    if (e.action === 'generate') { toolCounts[e.tool_name || e.tool_id] = (toolCounts[e.tool_name || e.tool_id] || 0) + 1; }
  });
  var favTool = '—';
  var maxCount = 0;
  for (var t in toolCounts) { if (toolCounts[t] > maxCount) { maxCount = toolCounts[t]; favTool = t; } }
  document.getElementById('ud-fav-tool').textContent = favTool;

  // Timeline
  var dayMap = {};
  user.events.forEach(function(e) {
    if (e.action === 'generate') {
      var day = e.created_at.substring(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    }
  });
  var userDailyData = Object.keys(dayMap).sort().map(function(day) { return { day: day, count: dayMap[day] }; });
  createUserDetailTimeline('chart-user-detail-timeline', userDailyData);

  // Ostatnie eventy
  var tbody = document.getElementById('ud-events-tbody');
  tbody.innerHTML = '';
  user.events.slice(0, 30).forEach(function(e) {
    var hasMetadata = e.metadata && (e.metadata.request_payload || e.metadata.response_payload || e.metadata.error_message);
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + new Date(e.created_at).toLocaleString('pl-PL') + '</td>' +
      '<td>' + esc(e.tool_name || e.tool_id || '') + '</td>' +
      '<td>' + esc(e.action) + '</td>' +
      '<td><span class="status-badge ' + (e.status || '') + '">' + esc(e.status || '') + '</span></td>' +
      '<td>' + esc(e.product_name || '') + '</td>' +
      '<td>' + (hasMetadata ? '<button class="btn-detail btn-ud-detail">Pokaż</button>' : '—') + '</td>';
    // Store event reference on the row for detail button
    tr._eventData = e;
    tbody.appendChild(tr);
  });
  // Bind detail buttons
  tbody.querySelectorAll('.btn-ud-detail').forEach(function(btn) {
    btn.addEventListener('click', function() {
      showEventDetailModal(this.closest('tr')._eventData);
    });
  });

  // Scroll to detail
  document.getElementById('user-detail').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// ADOPCJA UŻYTKOWNIKÓW
// ============================================================

function renderAdoption(adoptionTimeline) {
  createAdoptionChart('chart-adoption', adoptionTimeline);

  // Tabela nowych użytkowników
  var tbody = document.getElementById('adoption-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  // Znajdź pierwszą aktywność per user
  var firstSeen = {};
  allEvents.forEach(function(e) {
    var email = e.user_email || 'unknown';
    if (!firstSeen[email] || e.created_at < firstSeen[email].created_at) {
      firstSeen[email] = e;
    }
  });
  var adoptionList = Object.values(firstSeen).sort(function(a, b) { return b.created_at.localeCompare(a.created_at); });
  adoptionList.forEach(function(e, i) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td><strong>' + esc(e.user_name || e.user_email) + '</strong></td>' +
      '<td>' + esc(e.user_email) + '</td>' +
      '<td>' + new Date(e.created_at).toLocaleDateString('pl-PL') + '</td>' +
      '<td>' + esc(e.tool_name || e.tool_id || '') + '</td>';
    tbody.appendChild(tr);
  });
}

// ============================================================
// TAB: NARZĘDZIA
// ============================================================

function renderToolsTab() {
  // Karty narzędzi
  var container = document.getElementById('tools-cards-grid');
  container.innerHTML = '';
  toolData.forEach(function(tool) {
    var avgLat = tool.latency_count > 0 ? Math.round(tool.total_latency / tool.latency_count) : 0;
    var successRate = tool.total_uses > 0 ? Math.round((tool.successes / tool.total_uses) * 100) : 0;
    var card = document.createElement('div');
    card.className = 'tool-stat-card';
    card.innerHTML =
      '<h4>' + esc(tool.tool_name) + '</h4>' +
      '<div class="tool-stat-row"><span>Użycia:</span><strong>' + tool.total_uses + '</strong></div>' +
      '<div class="tool-stat-row"><span>Sukces:</span><strong>' + successRate + '%</strong></div>' +
      '<div class="tool-stat-row"><span>Błędy:</span><strong>' + tool.errors + '</strong></div>' +
      '<div class="tool-stat-row"><span>Cofnięcia:</span><strong>' + tool.undos + '</strong></div>' +
      '<div class="tool-stat-row"><span>Czas zaoszcz.:</span><strong>' + (tool.time_saved / 60).toFixed(1) + 'h</strong></div>' +
      '<div class="tool-stat-row"><span>Śr. latency:</span><strong>' + avgLat + 'ms</strong></div>';
    container.appendChild(card);
  });

  // Wykresy - narzędzia w czasie
  var dailyByTool = {};
  var dailyLatency = {};
  allEvents.forEach(function(e) {
    if (e.action !== 'generate') return;
    var tid = e.tool_name || e.tool_id || 'unknown';
    var day = e.created_at.substring(0, 10);

    if (!dailyByTool[tid]) dailyByTool[tid] = {};
    dailyByTool[tid][day] = (dailyByTool[tid][day] || 0) + 1;

    if (e.webhook_latency_ms > 0) {
      if (!dailyLatency[tid]) dailyLatency[tid] = {};
      if (!dailyLatency[tid][day]) dailyLatency[tid][day] = { sum: 0, count: 0 };
      dailyLatency[tid][day].sum += e.webhook_latency_ms;
      dailyLatency[tid][day].count++;
    }
  });

  var formattedDaily = {};
  for (var tid in dailyByTool) {
    formattedDaily[tid] = Object.keys(dailyByTool[tid]).sort().map(function(day) {
      return { day: day, count: dailyByTool[tid][day] };
    });
  }

  var formattedLatency = {};
  for (var tid2 in dailyLatency) {
    formattedLatency[tid2] = Object.keys(dailyLatency[tid2]).sort().map(function(day) {
      var dl = dailyLatency[tid2][day];
      return { day: day, avg_latency: Math.round(dl.sum / dl.count) };
    });
  }

  createToolsOverTimeChart('chart-tools-over-time', formattedDaily);
  createToolsLatencyChart('chart-tools-latency', formattedLatency);

  // Produkty
  var productMap = {};
  allEvents.forEach(function(e) {
    if (e.action === 'generate' && e.product_name) {
      if (!productMap[e.product_name]) productMap[e.product_name] = { name: e.product_name, url: e.page_url || '', count: 0, last: e.created_at };
      productMap[e.product_name].count++;
      if (e.created_at > productMap[e.product_name].last) productMap[e.product_name].last = e.created_at;
    }
  });
  var products = Object.values(productMap).sort(function(a, b) { return b.count - a.count; }).slice(0, 20);
  var ptbody = document.getElementById('products-tbody');
  ptbody.innerHTML = '';
  products.forEach(function(p, i) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td>' + esc(p.name) + '</td>' +
      '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis">' + esc(p.url) + '</td>' +
      '<td>' + p.count + '</td>' +
      '<td>' + new Date(p.last).toLocaleDateString('pl-PL') + '</td>';
    ptbody.appendChild(tr);
  });
}

// ============================================================
// TAB: WZORCE CZASOWE
// ============================================================

function renderPatternsTab() {
  var hourData = {};
  var weekdayData = {};
  var heatData = {};
  var dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

  allEvents.forEach(function(e) {
    if (e.action !== 'generate') return;
    var dt = new Date(e.created_at);
    var h = dt.getHours();
    var wd = dt.getDay();
    hourData[h] = (hourData[h] || 0) + 1;
    weekdayData[wd] = (weekdayData[wd] || 0) + 1;
    var key = wd + '-' + h;
    heatData[key] = (heatData[key] || 0) + 1;
  });

  createByHourChart('chart-by-hour', hourData);
  createByWeekdayChart('chart-by-weekday', weekdayData);

  // Heatmapa
  var container = document.getElementById('heatmap-container');
  var maxVal = 0;
  for (var k in heatData) { if (heatData[k] > maxVal) maxVal = heatData[k]; }

  var html = '<table class="heatmap-table"><thead><tr><th></th>';
  for (var hh = 0; hh < 24; hh++) html += '<th>' + hh + '</th>';
  html += '</tr></thead><tbody>';

  for (var dd = 1; dd <= 6; dd++) {
    html += '<tr><th>' + dayNames[dd] + '</th>';
    for (var hh2 = 0; hh2 < 24; hh2++) {
      var val = heatData[dd + '-' + hh2] || 0;
      var intensity = maxVal > 0 ? val / maxVal : 0;
      var bg = val === 0 ? '#f3f4f6' : 'rgba(34,197,94,' + (0.15 + intensity * 0.85).toFixed(2) + ')';
      var color = intensity > 0.5 ? '#fff' : '#333';
      html += '<td class="heatmap-cell" style="background:' + bg + ';color:' + color + '">' + (val || '') + '</td>';
    }
    html += '</tr>';
  }
  // Niedziela
  html += '<tr><th>' + dayNames[0] + '</th>';
  for (var hh3 = 0; hh3 < 24; hh3++) {
    var val2 = heatData['0-' + hh3] || 0;
    var intensity2 = maxVal > 0 ? val2 / maxVal : 0;
    var bg2 = val2 === 0 ? '#f3f4f6' : 'rgba(34,197,94,' + (0.15 + intensity2 * 0.85).toFixed(2) + ')';
    var color2 = intensity2 > 0.5 ? '#fff' : '#333';
    html += '<td class="heatmap-cell" style="background:' + bg2 + ';color:' + color2 + '">' + (val2 || '') + '</td>';
  }
  html += '</tr></tbody></table>';
  container.innerHTML = html;
}

// ============================================================
// TAB: LIVE FEED
// ============================================================

function renderFeed() {
  var events = allEvents;
  var start = feedPage * feedPageSize;
  var page = events.slice(start, start + feedPageSize);

  var tbody = document.getElementById('feed-tbody');
  tbody.innerHTML = '';
  page.forEach(function(e, idx) {
    var hasMetadata = e.metadata && (e.metadata.request_payload || e.metadata.response_payload || e.metadata.error_message);
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + new Date(e.created_at).toLocaleString('pl-PL') + '</td>' +
      '<td>' + esc(e.user_name || e.user_email || '') + '</td>' +
      '<td>' + esc(e.tool_name || e.tool_id || '') + '</td>' +
      '<td>' + esc(e.action) + '</td>' +
      '<td><span class="status-badge ' + (e.status || '') + '">' + esc(e.status || '') + '</span></td>' +
      '<td>' + esc(e.product_name || '') + '</td>' +
      '<td>' + (e.fields_updated || 0) + '</td>' +
      '<td>' + (e.webhook_latency_ms || '—') + '</td>' +
      '<td>' + esc(e.extension_version || '') + '</td>' +
      '<td>' + (hasMetadata ? '<button class="btn-detail" data-event-idx="' + (start + idx) + '">Pokaż</button>' : '—') + '</td>';
    tbody.appendChild(tr);
  });

  // Bind detail buttons
  tbody.querySelectorAll('.btn-detail').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var eventIdx = parseInt(this.dataset.eventIdx, 10);
      showEventDetailModal(allEvents[eventIdx]);
    });
  });

  var totalPages = Math.ceil(events.length / feedPageSize) || 1;
  document.getElementById('feed-page-info').textContent = 'Strona ' + (feedPage + 1) + ' z ' + totalPages + ' (' + events.length + ' zdarzeń)';
  document.getElementById('feed-prev').disabled = feedPage === 0;
  document.getElementById('feed-next').disabled = start + feedPageSize >= events.length;
}

function startAutoRefresh() {
  stopAutoRefresh();
  feedAutoTimer = setInterval(loadData, 30000);
}

function stopAutoRefresh() {
  if (feedAutoTimer) { clearInterval(feedAutoTimer); feedAutoTimer = null; }
}

// ============================================================
// TAB: ROI I RAPORTY
// ============================================================

function updateROI() {
  var rate = parseFloat(document.getElementById('roi-hourly-rate').value) || 100;
  var workDays = parseInt(document.getElementById('roi-work-days').value) || 21;
  var hours = totalTimeSavedMinutes / 60;
  var money = Math.round(hours * rate);

  // Ile miesięcy w danych
  var days = parseInt(document.getElementById('date-range').value, 10);
  var months = days > 0 ? days / 30 : (dailyData.length > 0 ? Math.max(1, Math.ceil((new Date(dailyData[dailyData.length - 1].day) - new Date(dailyData[0].day)) / (30 * 86400000))) : 1);
  var monthlyAvg = months > 0 ? Math.round(money / months) : 0;

  // FTE ekwiwalent (godziny robocze na miesiąc)
  var monthlyWorkHours = workDays * 8;
  var totalMonths = months || 1;
  var avgHoursPerMonth = hours / totalMonths;
  var fte = monthlyWorkHours > 0 ? (avgHoursPerMonth / monthlyWorkHours).toFixed(2) : '0';

  document.getElementById('roi-total-hours').textContent = hours.toFixed(1) + 'h';
  document.getElementById('roi-total-money').textContent = money.toLocaleString('pl-PL') + ' PLN';
  document.getElementById('roi-monthly-avg').textContent = monthlyAvg.toLocaleString('pl-PL') + ' PLN';
  document.getElementById('roi-fte-equivalent').textContent = fte + ' FTE';

  // Wykresy ROI
  createRoiOverTimeChart('chart-roi-over-time', dailyData, rate);
  createRoiByToolChart('chart-roi-by-tool', toolData, rate);
}

function renderReportSummary() {
  var el = document.getElementById('report-summary');
  var generateCount = allEvents.filter(function(e) { return e.action === 'generate'; }).length;
  var successCount = allEvents.filter(function(e) { return e.action === 'generate' && e.status === 'success'; }).length;
  var undoCount = allEvents.filter(function(e) { return e.action === 'undo'; }).length;

  el.innerHTML =
    '<p><strong>Okres:</strong> ' + (dailyData.length > 0 ? dailyData[0].day + ' — ' + dailyData[dailyData.length - 1].day : 'brak danych') + '</p>' +
    '<p><strong>Łączne użycia (generate):</strong> ' + generateCount + '</p>' +
    '<p><strong>Sukces:</strong> ' + successCount + ' (' + (generateCount > 0 ? Math.round(successCount / generateCount * 100) : 0) + '%)</p>' +
    '<p><strong>Cofnięcia:</strong> ' + undoCount + '</p>' +
    '<p><strong>Aktywni użytkownicy:</strong> ' + userData.length + '</p>' +
    '<p><strong>Zaoszczędzony czas:</strong> ' + (totalTimeSavedMinutes / 60).toFixed(1) + 'h</p>' +
    '<p><strong>Narzędzia w użyciu:</strong> ' + toolData.length + '</p>';
}

// ============================================================
// EKSPORT CSV
// ============================================================

function downloadCSV(filename, csvContent) {
  var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportUsersCSV() {
  var rows = [['Użytkownik', 'Email', 'Użycia', 'Czas zaoszczędzony (min)', 'Sukces %', 'Narzędzia', 'Ostatnia aktywność']];
  userData.forEach(function(u) {
    rows.push([u.user_name, u.user_email, u.total_uses, u.total_time_saved_minutes, u.total_uses > 0 ? Math.round(u.successes / u.total_uses * 100) : 0, Object.keys(u.tools_used).length, u.last_active]);
  });
  downloadCSV('sylius-toolbox-uzytkownicy.csv', rows.map(function(r) { return r.join(';'); }).join('\n'));
}

function exportFeedCSV() {
  var rows = [['Data', 'Użytkownik', 'Email', 'Narzędzie', 'Akcja', 'Status', 'Produkt', 'Pola', 'Latency (ms)', 'Wersja']];
  allEvents.forEach(function(e) {
    rows.push([e.created_at, e.user_name || '', e.user_email || '', e.tool_name || e.tool_id || '', e.action, e.status, e.product_name || '', e.fields_updated || 0, e.webhook_latency_ms || '', e.extension_version || '']);
  });
  downloadCSV('sylius-toolbox-zdarzenia.csv', rows.map(function(r) { return r.join(';'); }).join('\n'));
}

function exportFullReport() {
  var rows = [['=== RAPORT SYLIUS TOOLBOX ==='], ['Data eksportu: ' + new Date().toLocaleString('pl-PL')], [''], ['--- KPI ---']];
  rows.push(['Łączne użycia', allEvents.filter(function(e) { return e.action === 'generate'; }).length]);
  rows.push(['Zaoszczędzony czas (min)', totalTimeSavedMinutes]);
  rows.push(['Aktywni użytkownicy', userData.length]);
  rows.push([''], ['--- UŻYTKOWNICY ---'], ['Nazwa', 'Email', 'Użycia', 'Czas (min)', 'Sukces %']);
  userData.forEach(function(u) {
    rows.push([u.user_name, u.user_email, u.total_uses, u.total_time_saved_minutes, u.total_uses > 0 ? Math.round(u.successes / u.total_uses * 100) : 0]);
  });
  rows.push([''], ['--- NARZĘDZIA ---'], ['Narzędzie', 'Użycia', 'Sukces', 'Błędy', 'Cofnięcia', 'Czas (min)']);
  toolData.forEach(function(t) {
    rows.push([t.tool_name, t.total_uses, t.successes, t.errors, t.undos, t.time_saved]);
  });
  downloadCSV('sylius-toolbox-raport.csv', rows.map(function(r) { return r.join(';'); }).join('\n'));
}

// ============================================================
// HELPERS
// ============================================================

function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// MODAL SZCZEGÓŁÓW ZDARZENIA
// ============================================================

function showEventDetailModal(event) {
  var modal = document.getElementById('event-detail-modal');
  var meta = event.metadata || {};

  // Tytuł
  var dateStr = new Date(event.created_at).toLocaleString('pl-PL');
  var toolStr = event.tool_name || event.tool_id || '';
  document.getElementById('modal-title').textContent = toolStr + ' — ' + dateStr;

  // Request
  var reqEl = document.getElementById('modal-request');
  if (meta.request_payload && Object.keys(meta.request_payload).length > 0) {
    reqEl.textContent = JSON.stringify(meta.request_payload, null, 2);
  } else {
    reqEl.textContent = 'Brak danych (zdarzenie bez payloadu)';
  }

  // Response
  var respEl = document.getElementById('modal-response');
  if (meta.response_payload && Object.keys(meta.response_payload).length > 0) {
    respEl.textContent = JSON.stringify(meta.response_payload, null, 2);
  } else {
    respEl.textContent = 'Brak danych';
  }

  // Error
  var errSection = document.getElementById('modal-error-section');
  var errEl = document.getElementById('modal-error');
  if (meta.error_message) {
    errSection.style.display = 'block';
    errEl.textContent = meta.error_message;
  } else {
    errSection.style.display = 'none';
  }

  modal.classList.remove('hidden');
}

function closeEventDetailModal() {
  document.getElementById('event-detail-modal').classList.add('hidden');
}

// Bind modal close (after DOM ready)
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('btn-close-modal').addEventListener('click', closeEventDetailModal);
  document.getElementById('event-detail-modal').addEventListener('click', function(e) {
    if (e.target === this) closeEventDetailModal();
  });
});
