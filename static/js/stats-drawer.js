// ===== Stats Drawer =====
var _statsDrawerOpen = false;
var _statsWeekOffset = 0;
var _statsSongData = null;
var _statsSectionMap = {};
var _statsWeekLogs = null;
var _statsGroupMode = 'song-order';
var _statsCurrentMonday = null;

// ===== Open / Close =====
function openStatsDrawer() {
  var drawer = document.getElementById('stats-drawer');
  var backdrop = document.getElementById('stats-drawer-backdrop');
  if (!drawer) return;

  // Parse song data
  _statsSongData = JSON.parse(drawer.dataset.songJson || '{}');
  _buildSectionMap();

  drawer.style.display = 'flex';
  backdrop.style.display = 'block';
  // Force reflow then add class for animation
  drawer.offsetHeight;
  drawer.classList.add('open');
  backdrop.classList.add('open');
  _statsDrawerOpen = true;
  document.body.style.overflow = 'hidden';

  // Render all sections
  renderHealthBar();
  loadWeeklyChart();
  renderHeatMap();

  // Close bar detail on outside click
  var scroll = drawer.querySelector('.stats-drawer-scroll');
  if (scroll) {
    scroll.addEventListener('click', _onDrawerScrollClick);
  }
}

function _onDrawerScrollClick(e) {
  // Close bar detail if click is outside chart/detail area
  if (!e.target.closest('#stats-weekly-chart') && !e.target.closest('#stats-bar-detail')) {
    hideBarDetail();
  }
}

function closeStatsDrawer() {
  var drawer = document.getElementById('stats-drawer');
  var backdrop = document.getElementById('stats-drawer-backdrop');
  if (!drawer) return;

  hideBarDetail();
  var scroll = drawer.querySelector('.stats-drawer-scroll');
  if (scroll) scroll.removeEventListener('click', _onDrawerScrollClick);

  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  _statsDrawerOpen = false;
  document.body.style.overflow = '';

  setTimeout(function() {
    drawer.style.display = 'none';
    backdrop.style.display = 'none';
  }, 300);
}

// Override the existing toggleStats to open the drawer instead
function toggleStats() {
  if (_statsDrawerOpen) {
    closeStatsDrawer();
  } else {
    openStatsDrawer();
  }
}

// ===== Helpers =====
function _buildSectionMap() {
  _statsSectionMap = {};
  if (!_statsSongData || !_statsSongData.structure) return;
  var typeCounts = {};
  var typeOccurrence = {};
  _statsSongData.structure.forEach(function(s) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  });
  // Sort by order
  var sorted = _statsSongData.structure.slice().sort(function(a,b) { return a.order - b.order; });
  sorted.forEach(function(s) {
    typeOccurrence[s.type] = (typeOccurrence[s.type] || 0) + 1;
    var label = s.type.charAt(0).toUpperCase() + s.type.slice(1);
    if (typeCounts[s.type] > 1) {
      label += ' (' + typeOccurrence[s.type] + ')';
    }
    _statsSectionMap[s.id] = { label: label, type: s.type, order: s.order };
  });
}

var _stageColors = ['#ef4444','#f97316','#eab308','#84cc16','#22c55e'];

function _stageColor(stage) {
  if (stage >= 1 && stage <= 5) return _stageColors[stage - 1];
  return '#d1d5db';
}

function _formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0 min';
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + ' min';
  return totalSeconds + 's';
}

function _formatTimer(totalSeconds) {
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  var pad = function(n) { return n.toString().padStart(2, '0'); };
  if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
  return m + ':' + pad(s);
}

function _relativeDate(dateStr) {
  if (!dateStr) return 'Never';
  var now = new Date();
  var d = new Date(dateStr);
  var diffMs = now - d;
  var diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return diffDays + ' days ago';
  if (diffDays < 14) return '1 week ago';
  return Math.floor(diffDays / 7) + ' weeks ago';
}

// Section colors for chart segments (distinct from stage colors)
var _sectionColors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#6366f1','#f43f5e'];

function _sectionColor(sectionId) {
  if (!_statsSongData || !_statsSongData.structure) return '#9ca3af';
  var sorted = _statsSongData.structure.slice().sort(function(a,b) { return a.order - b.order; });
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].id === sectionId) return _sectionColors[i % _sectionColors.length];
  }
  return '#9ca3af';
}

// ===== Stats Group Mode Toggle =====
function setStatsGroupMode(btn, mode) {
  var container = btn.closest('.drawer-segmented-sm');
  if (!container) return;
  container.querySelectorAll('.seg-btn-sm').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  _statsGroupMode = mode;

  // Re-render all sections
  renderHealthBar();
  if (_statsWeekLogs !== null && _statsCurrentMonday) {
    renderWeeklyChart(_statsWeekLogs, _statsCurrentMonday);
  }
  renderHeatMap();
}

function _buildMergedTypeMap() {
  if (!_statsSongData || !_statsSongData.structure) return { typeOrder: [], typeToSectionIds: {} };
  var sorted = _statsSongData.structure.slice().sort(function(a,b) { return a.order - b.order; });
  var typeToSectionIds = {};
  var typeOrder = [];
  sorted.forEach(function(s) {
    if (!typeToSectionIds[s.type]) {
      typeToSectionIds[s.type] = [];
      typeOrder.push(s.type);
    }
    typeToSectionIds[s.type].push(s.id);
  });
  return { typeOrder: typeOrder, typeToSectionIds: typeToSectionIds };
}

function _mergedSectionColor(type) {
  var merged = _buildMergedTypeMap();
  var idx = merged.typeOrder.indexOf(type);
  return idx >= 0 ? _sectionColors[idx % _sectionColors.length] : '#9ca3af';
}

function _findExerciseSectionType(exerciseId) {
  var ex = _findExercise(exerciseId);
  if (!ex) return '__unknown__';
  var sectionId = ex.sectionId || '__none__';
  var info = _statsSectionMap[sectionId];
  return info ? info.type : '__unknown__';
}

// ===== Section 1: Song Health Bar =====
function renderHealthBar() {
  var drawer = document.getElementById('stats-drawer');
  if (!drawer) return;

  var stageCounts = JSON.parse(drawer.dataset.stageCounts || '[]');
  var exerciseCount = parseInt(drawer.dataset.exerciseCount) || 0;
  var totalTime = parseInt(drawer.dataset.totalTime) || 0;
  var stageNames = JSON.parse(drawer.dataset.stageNames || '[]');

  // Summary (same for both modes)
  var mastered = stageCounts[4] || 0;
  var pctEl = document.getElementById('stats-health-pct');
  var pct = exerciseCount > 0 ? Math.round((mastered / exerciseCount) * 100) : 0;
  pctEl.textContent = pct + '% mastered';

  var detailEl = document.getElementById('stats-health-detail');
  detailEl.textContent = exerciseCount + ' exercises · ' + _formatDuration(totalTime) + ' total';

  var bar = document.getElementById('stats-health-bar');

  if (_statsGroupMode === 'by-section' && _statsSongData && _statsSongData.structure && _statsSongData.structure.length > 0) {
    _renderHealthBarBySection(bar, stageNames);
  } else {
    _renderHealthBarSongOrder(bar, stageCounts);
  }

  // Legend
  var legend = document.getElementById('stats-health-legend');
  legend.innerHTML = '';
  for (var i = 0; i < 5; i++) {
    if (stageCounts[i] > 0) {
      var row = document.createElement('span');
      row.className = 'stats-legend-item';
      row.innerHTML = '<span class="stats-legend-dot" style="background:' + _stageColors[i] + '"></span>' +
        (stageNames[i] || ('Stage ' + (i+1))) + ': ' + stageCounts[i];
      legend.appendChild(row);
    }
  }
}

function _renderHealthBarSongOrder(bar, stageCounts) {
  bar.innerHTML = '';
  bar.classList.remove('health-bar-sectioned');
  for (var i = 0; i < 5; i++) {
    if (stageCounts[i] > 0) {
      var seg = document.createElement('div');
      seg.className = 'progress-stage-segment';
      seg.style.flex = stageCounts[i];
      seg.style.background = _stageColors[i];
      bar.appendChild(seg);
    }
  }
}

function _renderHealthBarBySection(bar, stageNames) {
  bar.innerHTML = '';
  bar.classList.add('health-bar-sectioned');

  var merged = _buildMergedTypeMap();
  var exercises = (_statsSongData.exercises || []).filter(function(ex) { return !ex.isTransition; });

  merged.typeOrder.forEach(function(type) {
    var sectionIds = merged.typeToSectionIds[type];
    var typeExercises = exercises.filter(function(ex) {
      return sectionIds.indexOf(ex.sectionId) !== -1;
    });
    if (typeExercises.length === 0) return;

    var label = sectionIds.length > 1 ? _pluralize(type) : _capitalize(type);

    var typeStageCounts = [0,0,0,0,0];
    typeExercises.forEach(function(ex) {
      var s = (ex.stage || 1) - 1;
      if (s >= 0 && s < 5) typeStageCounts[s]++;
    });

    var row = document.createElement('div');
    row.className = 'health-bar-type-row';

    var labelEl = document.createElement('span');
    labelEl.className = 'health-bar-type-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    var miniBar = document.createElement('div');
    miniBar.className = 'progress-stage-bar health-bar-type-bar';
    for (var i = 0; i < 5; i++) {
      if (typeStageCounts[i] > 0) {
        var seg = document.createElement('div');
        seg.className = 'progress-stage-segment';
        seg.style.flex = typeStageCounts[i];
        seg.style.background = _stageColors[i];
        miniBar.appendChild(seg);
      }
    }
    row.appendChild(miniBar);

    var countEl = document.createElement('span');
    countEl.className = 'health-bar-type-count';
    countEl.textContent = typeExercises.length;
    row.appendChild(countEl);

    bar.appendChild(row);
  });
}

// ===== Section 2: Weekly Practice Chart =====
function loadWeeklyChart() {
  var drawer = document.getElementById('stats-drawer');
  if (!drawer) return;
  var songId = drawer.dataset.songId;

  // Compute date range for the week
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0=Sun
  var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset - (_statsWeekOffset * 7));
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  var from = monday.toISOString().slice(0, 10);
  var to = sunday.toISOString().slice(0, 10);

  // Update label
  var label = document.getElementById('stats-week-label');
  if (_statsWeekOffset === 0) {
    label.textContent = 'This week';
  } else if (_statsWeekOffset === 1) {
    label.textContent = 'Last week';
  } else {
    label.textContent = from + ' — ' + to;
  }

  // Disable next button if current week
  var nextBtn = document.getElementById('stats-week-next');
  nextBtn.disabled = _statsWeekOffset === 0;
  nextBtn.style.opacity = _statsWeekOffset === 0 ? '0.3' : '1';

  fetch('/api/songs/' + songId + '/daily-log?from=' + from + '&to=' + to)
    .then(function(r) { return r.json(); })
    .then(function(logs) {
      renderWeeklyChart(logs, monday);
    })
    .catch(function() {
      renderWeeklyChart([], monday);
    });
}

function renderWeeklyChart(logs, monday) {
  var barsContainer = document.getElementById('stats-weekly-bars');
  var labelsContainer = document.getElementById('stats-weekly-labels');
  var emptyEl = document.getElementById('stats-weekly-empty');
  var chartEl = document.getElementById('stats-weekly-chart');

  _statsWeekLogs = logs;
  _statsCurrentMonday = monday;
  hideBarDetail();

  // Build day map: { "2025-02-20": { groupKey: seconds, ... }, ... }
  var dayMap = {};
  var totalWeekSeconds = 0;
  var daysWithPractice = 0;
  var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var isBySection = _statsGroupMode === 'by-section';

  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    var dateStr = d.toISOString().slice(0, 10);
    dayMap[dateStr] = {};
  }

  if (logs && logs.length) {
    logs.forEach(function(log) {
      if (dayMap[log.date] !== undefined) {
        log.entries.forEach(function(entry) {
          var groupKey = isBySection ? _findExerciseSectionType(entry.exerciseId) : _findExerciseSection(entry.exerciseId);
          dayMap[log.date][groupKey] = (dayMap[log.date][groupKey] || 0) + entry.seconds;
        });
      }
    });
  }

  // Find max seconds in a day for scaling
  var maxSeconds = 0;
  var dates = Object.keys(dayMap).sort();
  dates.forEach(function(date) {
    var dayTotal = 0;
    Object.values(dayMap[date]).forEach(function(s) { dayTotal += s; });
    if (dayTotal > maxSeconds) maxSeconds = dayTotal;
    if (dayTotal > 0) {
      totalWeekSeconds += dayTotal;
      daysWithPractice++;
    }
  });

  // Update summary
  var totalEl = document.getElementById('stats-weekly-total');
  var avgEl = document.getElementById('stats-weekly-avg');
  var streakEl = document.getElementById('stats-weekly-streak');

  totalEl.innerHTML = '<strong>' + _formatDuration(totalWeekSeconds) + '</strong><br><small>this week</small>';
  var avgSeconds = daysWithPractice > 0 ? Math.round(totalWeekSeconds / 7) : 0;
  avgEl.innerHTML = '<strong>' + _formatDuration(avgSeconds) + '</strong><br><small>daily avg</small>';
  // Streak: compute from all logs (simplified — just this week's consecutive days)
  streakEl.innerHTML = '<strong>' + daysWithPractice + '</strong><br><small>days this week</small>';

  if (maxSeconds === 0) {
    chartEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  chartEl.style.display = 'block';
  emptyEl.style.display = 'none';

  barsContainer.innerHTML = '';
  labelsContainer.innerHTML = '';

  dates.forEach(function(date, idx) {
    var sections = dayMap[date];
    var barWrapper = document.createElement('div');
    barWrapper.className = 'stats-bar-wrapper';

    var bar = document.createElement('div');
    bar.className = 'stats-bar';

    var dayTotal = 0;
    Object.values(sections).forEach(function(s) { dayTotal += s; });
    var barHeight = maxSeconds > 0 ? Math.max((dayTotal / maxSeconds) * 100, dayTotal > 0 ? 4 : 0) : 0;

    // Build stacked segments
    var sortedSections = Object.entries(sections).sort(function(a,b) { return b[1] - a[1]; });
    sortedSections.forEach(function(pair) {
      var key = pair[0];
      var secs = pair[1];
      var seg = document.createElement('div');
      seg.className = 'stats-bar-segment';
      seg.style.height = (dayTotal > 0 ? (secs / dayTotal) * 100 : 0) + '%';
      seg.style.background = isBySection ? _mergedSectionColor(key) : _sectionColor(key);
      bar.appendChild(seg);
    });

    bar.style.height = barHeight + '%';
    if (dayTotal === 0) {
      bar.classList.add('empty');
    }

    // Time label on hover/above
    if (dayTotal > 0) {
      var timeLabel = document.createElement('span');
      timeLabel.className = 'stats-bar-time';
      timeLabel.textContent = _formatDuration(dayTotal);
      barWrapper.appendChild(timeLabel);
    }

    barWrapper.appendChild(bar);

    if (dayTotal > 0) {
      barWrapper.style.cursor = 'pointer';
      barWrapper.dataset.date = date;
      barWrapper.onclick = function(e) {
        e.stopPropagation();
        toggleBarDetail(this.dataset.date);
      };
    }

    barsContainer.appendChild(barWrapper);

    var dayLabel = document.createElement('span');
    dayLabel.className = 'stats-day-label';
    dayLabel.textContent = dayNames[idx];
    labelsContainer.appendChild(dayLabel);
  });

  // Section color legend
  renderChartLegend(chartEl);
}

function renderChartLegend(chartEl) {
  var existing = chartEl.querySelector('.stats-chart-legend');
  if (existing) existing.remove();

  if (!_statsSongData || !_statsSongData.structure || _statsSongData.structure.length === 0) return;

  var legend = document.createElement('div');
  legend.className = 'stats-chart-legend';

  if (_statsGroupMode === 'by-section') {
    var merged = _buildMergedTypeMap();
    merged.typeOrder.forEach(function(type) {
      var sectionIds = merged.typeToSectionIds[type];
      var label = sectionIds.length > 1 ? _pluralize(type) : _capitalize(type);
      var color = _mergedSectionColor(type);
      var item = document.createElement('span');
      item.className = 'stats-chart-legend-item';
      item.innerHTML = '<span class="stats-chart-legend-dot" style="background:' + color + '"></span>' + label;
      legend.appendChild(item);
    });
  } else {
    var sorted = _statsSongData.structure.slice().sort(function(a,b) { return a.order - b.order; });
    sorted.forEach(function(section) {
      var label = _statsSectionMap[section.id] ? _statsSectionMap[section.id].label : section.type;
      var color = _sectionColor(section.id);
      var item = document.createElement('span');
      item.className = 'stats-chart-legend-item';
      item.innerHTML = '<span class="stats-chart-legend-dot" style="background:' + color + '"></span>' + label;
      legend.appendChild(item);
    });
  }

  chartEl.appendChild(legend);
}

function _findExerciseSection(exerciseId) {
  if (!_statsSongData || !_statsSongData.exercises) return '__unknown__';
  for (var i = 0; i < _statsSongData.exercises.length; i++) {
    if (_statsSongData.exercises[i].id === exerciseId) {
      return _statsSongData.exercises[i].sectionId || '__none__';
    }
  }
  return '__unknown__';
}

function statsWeekNav(delta) {
  _statsWeekOffset -= delta; // going back = +1 offset
  if (_statsWeekOffset < 0) _statsWeekOffset = 0;
  loadWeeklyChart();
}

function toggleBarDetail(date) {
  var existing = document.getElementById('stats-bar-detail');
  if (existing && existing.dataset.date === date) {
    hideBarDetail();
    return;
  }
  showBarDetail(date);
}

function showBarDetail(date) {
  hideBarDetail();

  // Find log for this date
  var log = null;
  if (_statsWeekLogs) {
    for (var i = 0; i < _statsWeekLogs.length; i++) {
      if (_statsWeekLogs[i].date === date) { log = _statsWeekLogs[i]; break; }
    }
  }
  if (!log || !log.entries || log.entries.length === 0) return;

  // Mark active bar
  document.querySelectorAll('.stats-bar-wrapper').forEach(function(w) {
    w.classList.toggle('active', w.dataset.date === date);
  });

  // Create detail container
  var detail = document.createElement('div');
  detail.id = 'stats-bar-detail';
  detail.className = 'stats-bar-detail';
  detail.dataset.date = date;
  detail.onclick = function(e) { e.stopPropagation(); };

  // Date header
  var d = new Date(date + 'T12:00:00');
  var dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  var totalSeconds = 0;
  var totalReps = 0;
  var entries = [];
  log.entries.forEach(function(e) {
    if (e.seconds <= 0 && e.reps <= 0) return;
    totalSeconds += e.seconds;
    totalReps += e.reps;
    entries.push(e);
  });

  var header = document.createElement('div');
  header.className = 'stats-bar-detail-header';
  header.innerHTML = '<span class="stats-bar-detail-date">' + dateStr + '</span>' +
    '<span class="stats-bar-detail-total">' + _formatDuration(totalSeconds) +
    (totalReps > 0 ? ' · ' + totalReps + ' reps' : '') + '</span>';
  detail.appendChild(header);

  // Exercise pills
  var pills = document.createElement('div');
  pills.className = 'stats-bar-detail-pills';

  entries.forEach(function(e) {
    var ex = _findExercise(e.exerciseId);
    if (!ex) return;

    var pill = document.createElement('span');
    pill.className = 'stats-bar-detail-pill';
    pill.style.background = _stageColor(ex.stage);
    pill.style.color = (ex.stage >= 3) ? '#1a1a1a' : '#fff';

    var label = ex.name || 'Exercise';
    label += ': ' + _formatDuration(e.seconds);
    if (e.reps > 0) label += ' · ' + e.reps + ' reps';
    pill.textContent = label;

    pills.appendChild(pill);
  });

  detail.appendChild(pills);

  // Insert after the chart element and animate open
  var chart = document.getElementById('stats-weekly-chart');
  chart.parentNode.insertBefore(detail, chart.nextSibling);

  // Slide down: set height after insert to trigger transition
  detail.style.maxHeight = '0';
  detail.style.overflow = 'hidden';
  detail.offsetHeight; // force reflow
  detail.style.maxHeight = detail.scrollHeight + 'px';
  // Clean up after animation
  setTimeout(function() {
    if (detail.parentNode) {
      detail.style.maxHeight = 'none';
      detail.style.overflow = '';
    }
  }, 300);
}

function hideBarDetail() {
  var existing = document.getElementById('stats-bar-detail');
  if (existing) existing.remove();
  document.querySelectorAll('.stats-bar-wrapper.active').forEach(function(w) {
    w.classList.remove('active');
  });
}

// ===== Section 3: Song Heat Map =====
function renderHeatMap() {
  var container = document.getElementById('stats-heatmap');
  if (!container || !_statsSongData) return;

  container.innerHTML = '';

  var exercises = _statsSongData.exercises || [];
  if (exercises.length === 0) {
    container.innerHTML = '<div class="stats-heatmap-empty">No exercises yet</div>';
    return;
  }

  // Group exercises by section in song order
  var structure = (_statsSongData.structure || []).slice().sort(function(a,b) { return a.order - b.order; });

  // Get non-transition exercises in song order
  var regularExercises = exercises.filter(function(ex) { return !ex.isTransition; });
  var transitionExercises = exercises.filter(function(ex) { return ex.isTransition; });

  // Build transition lookup: key = "exId1:exId2"
  var transitionMap = {};
  transitionExercises.forEach(function(ex) {
    if (ex.transitionBetween) {
      var key1 = ex.transitionBetween[0] + ':' + ex.transitionBetween[1];
      var key2 = ex.transitionBetween[1] + ':' + ex.transitionBetween[0];
      transitionMap[key1] = ex;
      transitionMap[key2] = ex;
    }
  });

  if (structure.length === 0) {
    // No sections — flat list with transitions
    var row = document.createElement('div');
    row.className = 'stats-heatmap-row';
    regularExercises.forEach(function(ex, idx) {
      row.appendChild(_createHeatmapCell(ex));
      if (idx < regularExercises.length - 1) {
        var nextEx = regularExercises[idx + 1];
        row.appendChild(_createTransitionDivider(ex, nextEx, transitionMap));
      }
    });
    container.appendChild(row);
    return;
  }

  if (_statsGroupMode === 'by-section') {
    _renderHeatMapBySection(container, structure, regularExercises, transitionMap);
  } else {
    _renderHeatMapSongOrder(container, structure, regularExercises, transitionMap);
  }
}

function _renderHeatMapSongOrder(container, structure, regularExercises, transitionMap) {
  structure.forEach(function(section) {
    var sectionExercises = regularExercises.filter(function(ex) { return ex.sectionId === section.id; });
    if (sectionExercises.length === 0) return;

    var sectionInfo = _statsSectionMap[section.id];
    var label = sectionInfo ? sectionInfo.label : section.type;

    var sectionDiv = document.createElement('div');
    sectionDiv.className = 'stats-heatmap-section';

    var labelEl = document.createElement('div');
    labelEl.className = 'stats-heatmap-label';
    labelEl.textContent = label;
    sectionDiv.appendChild(labelEl);

    var row = document.createElement('div');
    row.className = 'stats-heatmap-row';
    sectionExercises.forEach(function(ex, idx) {
      row.appendChild(_createHeatmapCell(ex));
      if (idx < sectionExercises.length - 1) {
        var nextEx = sectionExercises[idx + 1];
        row.appendChild(_createTransitionDivider(ex, nextEx, transitionMap));
      }
    });
    sectionDiv.appendChild(row);
    container.appendChild(sectionDiv);
  });
}

function _renderHeatMapBySection(container, structure, regularExercises, transitionMap) {
  var merged = _buildMergedTypeMap();

  merged.typeOrder.forEach(function(type) {
    var sectionIds = merged.typeToSectionIds[type];
    var typeExercises = [];
    sectionIds.forEach(function(sid) {
      regularExercises.forEach(function(ex) {
        if (ex.sectionId === sid) typeExercises.push(ex);
      });
    });
    if (typeExercises.length === 0) return;

    var label = sectionIds.length > 1 ? _pluralize(type) : _capitalize(type);

    var sectionDiv = document.createElement('div');
    sectionDiv.className = 'stats-heatmap-section';

    var labelEl = document.createElement('div');
    labelEl.className = 'stats-heatmap-label';
    labelEl.textContent = label;
    sectionDiv.appendChild(labelEl);

    var row = document.createElement('div');
    row.className = 'stats-heatmap-row';
    typeExercises.forEach(function(ex) {
      row.appendChild(_createHeatmapCell(ex));
    });
    sectionDiv.appendChild(row);
    container.appendChild(sectionDiv);
  });
}

function _createHeatmapCell(exercise) {
  var cell = document.createElement('div');
  cell.className = 'stats-heatmap-cell';
  cell.style.background = _stageColor(exercise.stage);
  cell.title = (exercise.name || 'Exercise') + ' — ' + _getStageLabel(exercise.stage);
  cell.dataset.exerciseId = exercise.id;
  cell.onclick = function() { showCardDetail(exercise.id); };

  // Show exercise name as tiny text
  var nameEl = document.createElement('span');
  nameEl.className = 'stats-heatmap-cell-name';
  nameEl.textContent = exercise.name || '';
  cell.appendChild(nameEl);

  return cell;
}

function _createTransitionDivider(ex1, ex2, transitionMap) {
  var key = ex1.id + ':' + ex2.id;
  var transition = transitionMap[key];

  var divider = document.createElement('div');
  divider.className = 'stats-heatmap-transition';

  if (transition && transition.isTracked) {
    // Tracked transition — color by stage
    divider.style.background = _stageColor(transition.stage);
    divider.classList.add('tracked');
    divider.title = transition.name + ' — ' + _getStageLabel(transition.stage);
    divider.onclick = function() { showCardDetail(transition.id); };
  } else {
    // Untracked — grey, clickable to opt in
    divider.style.background = '#d1d5db';
    divider.title = 'Click to track this transition';
    divider.onclick = function() {
      _toggleTransition(ex1.id, ex2.id, true);
    };
  }

  return divider;
}

function _toggleTransition(exId1, exId2, track) {
  var songId = document.getElementById('stats-drawer').dataset.songId;
  fetch('/api/songs/' + songId + '/transitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseId1: exId1, exerciseId2: exId2, track: track })
  }).then(function(r) { return r.json(); })
  .then(function() {
    // Reload song data and re-render heatmap
    fetch('/api/songs/' + songId + '/daily-log')
      .catch(function() {});
    // Refresh the page data
    location.reload();
  })
  .catch(console.error);
}

function _getStageLabel(stage) {
  var drawer = document.getElementById('stats-drawer');
  if (!drawer) return 'Stage ' + stage;
  var names = JSON.parse(drawer.dataset.stageNames || '[]');
  return names[stage - 1] || ('Stage ' + stage);
}

// ===== Section 4: Per-Card Detail =====
function showCardDetail(exerciseId) {
  var section = document.getElementById('stats-card-detail-section');
  var container = document.getElementById('stats-card-detail');
  if (!section || !container || !_statsSongData) return;

  var exercise = null;
  (_statsSongData.exercises || []).forEach(function(ex) {
    if (ex.id === exerciseId) exercise = ex;
  });
  if (!exercise) return;

  section.style.display = 'block';

  var sectionInfo = _statsSectionMap[exercise.sectionId];
  var sectionLabel = sectionInfo ? sectionInfo.label : '';

  container.innerHTML = '';

  // Header
  var header = document.createElement('div');
  header.className = 'stats-card-header';
  header.innerHTML = '<strong>' + (exercise.name || 'Exercise') + '</strong>' +
    (sectionLabel ? '<span class="stats-card-section-label">' + sectionLabel + '</span>' : '');
  container.appendChild(header);

  // Stats grid
  var grid = document.createElement('div');
  grid.className = 'stats-card-grid';
  grid.innerHTML =
    '<div class="stats-card-stat">' +
      '<span class="stats-card-stat-value" style="color:' + _stageColor(exercise.stage) + '">' + _getStageLabel(exercise.stage) + '</span>' +
      '<span class="stats-card-stat-label">Current stage</span>' +
    '</div>' +
    '<div class="stats-card-stat">' +
      '<span class="stats-card-stat-value">' + _formatDuration(exercise.totalPracticedSeconds) + '</span>' +
      '<span class="stats-card-stat-label">Direct time</span>' +
    '</div>' +
    '<div class="stats-card-stat">' +
      '<span class="stats-card-stat-value">' + (exercise.totalReps || 0) + '</span>' +
      '<span class="stats-card-stat-label">Reps</span>' +
    '</div>' +
    '<div class="stats-card-stat">' +
      '<span class="stats-card-stat-value">' + _relativeDate(exercise.lastPracticedAt) + '</span>' +
      '<span class="stats-card-stat-label">Last practiced</span>' +
    '</div>';
  container.appendChild(grid);

  // Stage over time chart (load from stage log)
  var stageChart = document.createElement('div');
  stageChart.className = 'stats-card-stage-chart';
  stageChart.id = 'stats-card-stage-chart';
  stageChart.innerHTML = '<span class="stats-card-loading">Loading stage history...</span>';
  container.appendChild(stageChart);

  // Load stage log
  var songId = document.getElementById('stats-drawer').dataset.songId;
  fetch('/api/songs/' + songId + '/stage-log')
    .then(function(r) { return r.json(); })
    .then(function(logs) {
      renderStageTimeline(stageChart, exerciseId, logs, exercise.stage);
    })
    .catch(function() {
      stageChart.innerHTML = '<span class="stats-card-empty">No stage history available</span>';
    });

  // Daily breakdown mini chart (last 7 days)
  var dailyChart = document.createElement('div');
  dailyChart.className = 'stats-card-daily-chart';
  dailyChart.id = 'stats-card-daily-chart';
  container.appendChild(dailyChart);

  var today = new Date();
  var weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  var from = weekAgo.toISOString().slice(0, 10);
  var to = today.toISOString().slice(0, 10);

  fetch('/api/songs/' + songId + '/daily-log?from=' + from + '&to=' + to)
    .then(function(r) { return r.json(); })
    .then(function(logs) {
      renderCardDailyChart(dailyChart, exerciseId, logs, weekAgo, today);
    })
    .catch(function() {
      dailyChart.innerHTML = '';
    });

  // Scroll to the detail section
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Highlight the active cell in heatmap
  document.querySelectorAll('.stats-heatmap-cell').forEach(function(c) {
    c.classList.toggle('active', c.dataset.exerciseId === exerciseId);
  });
}

function renderStageTimeline(container, exerciseId, logs, currentStage) {
  // Filter logs for this exercise
  var entries = logs.filter(function(l) { return l.exerciseId === exerciseId; });

  if (entries.length === 0) {
    container.innerHTML = '<span class="stats-card-empty">No stage changes recorded yet</span>';
    return;
  }

  container.innerHTML = '<div class="stats-card-subtitle">Stage over time</div>';
  var timeline = document.createElement('div');
  timeline.className = 'stats-stage-timeline';

  // Build segments: each segment = time spent at a stage
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var nextEntry = entries[i + 1];
    var startDate = new Date(entry.timestamp);
    var endDate = nextEntry ? new Date(nextEntry.timestamp) : new Date();
    var durationDays = Math.max(1, Math.round((endDate - startDate) / 86400000));

    var seg = document.createElement('div');
    seg.className = 'stats-stage-segment';
    seg.style.flex = durationDays;
    seg.style.background = _stageColor(entry.stage);
    seg.title = _getStageLabel(entry.stage) + ' — ' + durationDays + ' day' + (durationDays !== 1 ? 's' : '');
    timeline.appendChild(seg);
  }

  container.appendChild(timeline);
}

function renderCardDailyChart(container, exerciseId, logs, startDate, endDate) {
  container.innerHTML = '<div class="stats-card-subtitle">Last 7 days</div>';

  var dayData = {};
  var maxSeconds = 0;

  // Initialize all 7 days
  for (var i = 0; i < 7; i++) {
    var d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dayData[d.toISOString().slice(0, 10)] = 0;
  }

  // Fill in data
  (logs || []).forEach(function(log) {
    (log.entries || []).forEach(function(entry) {
      if (entry.exerciseId === exerciseId && dayData[log.date] !== undefined) {
        dayData[log.date] += entry.seconds;
      }
    });
  });

  Object.values(dayData).forEach(function(s) {
    if (s > maxSeconds) maxSeconds = s;
  });

  if (maxSeconds === 0) {
    container.innerHTML += '<div class="stats-card-empty">No practice in the last 7 days</div>';
    return;
  }

  var chart = document.createElement('div');
  chart.className = 'stats-mini-bars';

  var dates = Object.keys(dayData).sort();
  var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dates.forEach(function(date) {
    var wrapper = document.createElement('div');
    wrapper.className = 'stats-mini-bar-wrapper';

    var bar = document.createElement('div');
    bar.className = 'stats-mini-bar';
    var h = maxSeconds > 0 ? Math.max((dayData[date] / maxSeconds) * 100, dayData[date] > 0 ? 4 : 0) : 0;
    bar.style.height = h + '%';
    bar.style.background = dayData[date] > 0 ? '#3b82f6' : 'transparent';

    var label = document.createElement('span');
    label.className = 'stats-mini-bar-label';
    var dayIdx = new Date(date + 'T12:00:00').getDay();
    label.textContent = dayNames[dayIdx];

    wrapper.appendChild(bar);
    wrapper.appendChild(label);
    chart.appendChild(wrapper);
  });

  container.appendChild(chart);
}

function _findExercise(exerciseId) {
  if (!_statsSongData || !_statsSongData.exercises) return null;
  for (var i = 0; i < _statsSongData.exercises.length; i++) {
    if (_statsSongData.exercises[i].id === exerciseId) return _statsSongData.exercises[i];
  }
  return null;
}


