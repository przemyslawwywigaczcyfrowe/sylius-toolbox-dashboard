// dashboard/lib/charts.js — Wrappery Chart.js dla Sylius Toolbox Dashboard

var chartInstances = {};
var TOOL_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

var CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { labels: { font: { size: 12 }, padding: 12 } }
  }
};

// ===== PRZEGLĄD =====

function createUsageOverTimeChart(canvasId, data) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function(d) { return d.day; }),
      datasets: [{
        label: 'Użycia',
        data: data.map(function(d) { return d.total_uses; }),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true, tension: 0.3, pointRadius: 3
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

function createTimeSavedChart(canvasId, data) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function(d) { return d.day; }),
      datasets: [{
        label: 'Zaoszczędzony czas (min)',
        data: data.map(function(d) { return d.total_time_saved_minutes || 0; }),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139,92,246,0.08)',
        fill: true, tension: 0.3, pointRadius: 3
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    })
  });
}

function createByToolChart(canvasId, data) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(function(d) { return d.tool_name; }),
      datasets: [{
        data: data.map(function(d) { return d.total_uses; }),
        backgroundColor: TOOL_COLORS.slice(0, data.length)
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { position: 'bottom' } }
    })
  });
}

function createSuccessRateChart(canvasId, data) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(function(d) { return d.tool_name; }),
      datasets: [
        { label: 'Sukces', data: data.map(function(d) { return d.successes || 0; }), backgroundColor: '#22c55e' },
        { label: 'Błąd', data: data.map(function(d) { return d.errors || 0; }), backgroundColor: '#ef4444' },
        { label: 'Cofnięte', data: data.map(function(d) { return d.undos || 0; }), backgroundColor: '#f59e0b' }
      ]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

function createUserActivityChart(canvasId, data) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  var top = data.slice(0, 10);
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(function(d) { return d.user_name || d.user_email; }),
      datasets: [{
        label: 'Użycia',
        data: top.map(function(d) { return d.total_uses; }),
        backgroundColor: '#3b82f6'
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

// ===== NARZĘDZIA =====

function createToolsOverTimeChart(canvasId, dailyByTool) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;

  var toolIds = Object.keys(dailyByTool);
  var allDays = {};
  toolIds.forEach(function(tid) {
    dailyByTool[tid].forEach(function(d) { allDays[d.day] = true; });
  });
  var days = Object.keys(allDays).sort();

  var datasets = toolIds.map(function(tid, i) {
    var dayMap = {};
    dailyByTool[tid].forEach(function(d) { dayMap[d.day] = d.count; });
    return {
      label: tid,
      data: days.map(function(day) { return dayMap[day] || 0; }),
      borderColor: TOOL_COLORS[i % TOOL_COLORS.length],
      backgroundColor: 'transparent',
      tension: 0.3, pointRadius: 2
    };
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets: datasets },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

function createToolsLatencyChart(canvasId, dailyLatency) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;

  var toolIds = Object.keys(dailyLatency);
  var allDays = {};
  toolIds.forEach(function(tid) {
    dailyLatency[tid].forEach(function(d) { allDays[d.day] = true; });
  });
  var days = Object.keys(allDays).sort();

  var datasets = toolIds.map(function(tid, i) {
    var dayMap = {};
    dailyLatency[tid].forEach(function(d) { dayMap[d.day] = d.avg_latency; });
    return {
      label: tid,
      data: days.map(function(day) { return dayMap[day] || 0; }),
      borderColor: TOOL_COLORS[i % TOOL_COLORS.length],
      backgroundColor: 'transparent',
      tension: 0.3, pointRadius: 2
    };
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets: datasets },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'ms' } } }
    })
  });
}

// ===== WZORCE CZASOWE =====

function createByHourChart(canvasId, hourData) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  var labels = [];
  var values = [];
  for (var h = 0; h < 24; h++) {
    labels.push(h + ':00');
    values.push(hourData[h] || 0);
  }
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'Użycia', data: values, backgroundColor: '#22c55e' }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

function createByWeekdayChart(canvasId, weekdayData) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  var dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  var values = [];
  for (var d = 0; d < 7; d++) { values.push(weekdayData[d] || 0); }
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dayNames,
      datasets: [{ label: 'Użycia', data: values, backgroundColor: '#3b82f6' }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

// ===== UŻYTKOWNIK - SZCZEGÓŁY =====

function createUserDetailTimeline(canvasId, dailyData) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dailyData.map(function(d) { return d.day; }),
      datasets: [{
        label: 'Użycia',
        data: dailyData.map(function(d) { return d.count; }),
        backgroundColor: '#22c55e'
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    })
  });
}

// ===== ADOPCJA =====

function createAdoptionChart(canvasId, data) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function(d) { return d.day; }),
      datasets: [
        {
          label: 'Nowi użytkownicy',
          data: data.map(function(d) { return d.newUsers; }),
          type: 'bar',
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          yAxisID: 'y1',
          order: 2
        },
        {
          label: 'Łącznie użytkowników',
          data: data.map(function(d) { return d.cumulativeUsers; }),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.08)',
          fill: true, tension: 0.3, pointRadius: 3,
          yAxisID: 'y',
          order: 1
        }
      ]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Łącznie' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Nowi' }, ticks: { stepSize: 1 } }
      }
    })
  });
}

// ===== ROI =====

function createRoiOverTimeChart(canvasId, dailyData, hourlyRate) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  var cumulative = 0;
  var cumulativeData = dailyData.map(function(d) {
    cumulative += (d.total_time_saved_minutes || 0) / 60 * hourlyRate;
    return { day: d.day, value: Math.round(cumulative) };
  });
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: cumulativeData.map(function(d) { return d.day; }),
      datasets: [{
        label: 'Skumulowane oszczędności (PLN)',
        data: cumulativeData.map(function(d) { return d.value; }),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true, tension: 0.3
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    })
  });
}

function createRoiByToolChart(canvasId, toolData, hourlyRate) {
  destroyChart(canvasId);
  var ctx = document.getElementById(canvasId);
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: toolData.map(function(d) { return d.tool_name; }),
      datasets: [{
        label: 'Oszczędności (PLN)',
        data: toolData.map(function(d) { return Math.round((d.time_saved || 0) / 60 * hourlyRate); }),
        backgroundColor: TOOL_COLORS.slice(0, toolData.length)
      }]
    },
    options: Object.assign({}, CHART_DEFAULTS, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    })
  });
}
