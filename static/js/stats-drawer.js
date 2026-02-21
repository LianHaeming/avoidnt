// ===== Stats Drawer =====
var _statsDrawerOpen = false;
var _statsWeekOffset = 0;
var _statsHistoryDays = 7;
var _statsSongData = null;
var _statsSectionMap = {};

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
  renderAdjustedHeatMap();
  loadPracticeHistory();
  renderSimilarityGroupsList();
  loadRecommendations();
}

function closeStatsDrawer() {
  var drawer = document.getElementById('stats-drawer');
  var backdrop = document.getElementById('stats-drawer-backdrop');
  if (!drawer) return;

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

// ===== Section 1: Song Health Bar =====
function renderHealthBar() {
  var drawer = document.getElementById('stats-drawer');
  if (!drawer) return;

  var stageCounts = JSON.parse(drawer.dataset.stageCounts || '[]');
  var exerciseCount = parseInt(drawer.dataset.exerciseCount) || 0;
  var totalTime = parseInt(drawer.dataset.totalTime) || 0;

  // Health bar
  var bar = document.getElementById('stats-health-bar');
  bar.innerHTML = '';
  for (var i = 0; i < 5; i++) {
    if (stageCounts[i] > 0) {
      var seg = document.createElement('div');
      seg.className = 'progress-stage-segment';
      seg.style.flex = stageCounts[i];
      seg.style.background = _stageColors[i];
      bar.appendChild(seg);
    }
  }

  // Percentage mastered
  var mastered = stageCounts[4] || 0;
  var pctEl = document.getElementById('stats-health-pct');
  var pct = exerciseCount > 0 ? Math.round((mastered / exerciseCount) * 100) : 0;
  pctEl.textContent = pct + '% mastered';

  var detailEl = document.getElementById('stats-health-detail');
  detailEl.textContent = exerciseCount + ' exercises · ' + _formatDuration(totalTime) + ' total';

  // Legend
  var stageNames = JSON.parse(drawer.dataset.stageNames || '[]');
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

  // Build day map: { "2025-02-20": { sectionId: seconds, ... }, ... }
  var dayMap = {};
  var totalWeekSeconds = 0;
  var daysWithPractice = 0;
  var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

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
          // Find the section for this exercise
          var sectionId = _findExerciseSection(entry.exerciseId);
          dayMap[log.date][sectionId] = (dayMap[log.date][sectionId] || 0) + entry.seconds;
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
      var sectionId = pair[0];
      var secs = pair[1];
      var seg = document.createElement('div');
      seg.className = 'stats-bar-segment';
      seg.style.height = (dayTotal > 0 ? (secs / dayTotal) * 100 : 0) + '%';
      seg.style.background = _sectionColor(sectionId);
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
    barsContainer.appendChild(barWrapper);

    var dayLabel = document.createElement('span');
    dayLabel.className = 'stats-day-label';
    dayLabel.textContent = dayNames[idx];
    labelsContainer.appendChild(dayLabel);
  });
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
      // Add transition divider between adjacent exercises
      if (idx < regularExercises.length - 1) {
        var nextEx = regularExercises[idx + 1];
        row.appendChild(_createTransitionDivider(ex, nextEx, transitionMap));
      }
    });
    container.appendChild(row);
    return;
  }

  // Collect all exercises in song order across sections
  var allOrdered = [];
  structure.forEach(function(section) {
    var sectionExs = regularExercises.filter(function(ex) { return ex.sectionId === section.id; });
    sectionExs.forEach(function(ex) { allOrdered.push(ex); });
  });

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
      // Add transition between exercises within the same section
      if (idx < sectionExercises.length - 1) {
        var nextEx = sectionExercises[idx + 1];
        row.appendChild(_createTransitionDivider(ex, nextEx, transitionMap));
      }
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

// ===== Section 3b: Adjusted Heat Map =====
function renderAdjustedHeatMap() {
  var section = document.getElementById('stats-heatmap-adjusted-section');
  var container = document.getElementById('stats-heatmap-adjusted');
  if (!section || !container || !_statsSongData) return;

  var groups = _statsSongData.similarityGroups || [];
  if (groups.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  // Compute effective time and adjusted data per exercise
  var adjustedExercises = _computeAdjustedExercises();

  container.innerHTML = '';
  var exercises = adjustedExercises;
  if (exercises.length === 0) {
    container.innerHTML = '<div class="stats-heatmap-empty">No exercises yet</div>';
    return;
  }

  var structure = (_statsSongData.structure || []).slice().sort(function(a,b) { return a.order - b.order; });

  if (structure.length === 0) {
    var row = document.createElement('div');
    row.className = 'stats-heatmap-row';
    exercises.forEach(function(ex) {
      row.appendChild(_createAdjustedHeatmapCell(ex));
    });
    container.appendChild(row);
    return;
  }

  structure.forEach(function(sec) {
    var sectionExercises = exercises.filter(function(ex) { return ex.sectionId === sec.id; });
    if (sectionExercises.length === 0) return;

    var sectionInfo = _statsSectionMap[sec.id];
    var label = sectionInfo ? sectionInfo.label : sec.type;

    var sectionDiv = document.createElement('div');
    sectionDiv.className = 'stats-heatmap-section';

    var labelEl = document.createElement('div');
    labelEl.className = 'stats-heatmap-label';
    labelEl.textContent = label;
    sectionDiv.appendChild(labelEl);

    var row = document.createElement('div');
    row.className = 'stats-heatmap-row';
    sectionExercises.forEach(function(ex) {
      row.appendChild(_createAdjustedHeatmapCell(ex));
    });
    sectionDiv.appendChild(row);
    container.appendChild(sectionDiv);
  });
}

function _computeAdjustedExercises() {
  if (!_statsSongData || !_statsSongData.exercises) return [];
  var exercises = _statsSongData.exercises;
  var groups = _statsSongData.similarityGroups || [];

  // Build exercise lookup
  var exMap = {};
  exercises.forEach(function(ex) { exMap[ex.id] = ex; });

  return exercises.map(function(ex) {
    var adjusted = Object.assign({}, ex);
    adjusted.effectiveTime = ex.totalPracticedSeconds || 0;
    adjusted.transferredTime = 0;

    // Check if in any similarity group
    groups.forEach(function(group) {
      if (group.exerciseIds.indexOf(ex.id) < 0) return;

      if (group.type === 'identical') {
        // Identical: all share the same stats (already synced server-side)
        // No visual change needed beyond what's already shown
      } else if (group.type === 'similar') {
        // Similar: bidirectional transfer at 0.8 ratio
        group.exerciseIds.forEach(function(otherId) {
          if (otherId === ex.id) return;
          var other = exMap[otherId];
          if (!other) return;
          var transfer = Math.round((other.totalPracticedSeconds || 0) * 0.8);
          adjusted.transferredTime += transfer;
          adjusted.effectiveTime += transfer;
        });
      }
    });

    return adjusted;
  });
}

function _createAdjustedHeatmapCell(exercise) {
  var cell = document.createElement('div');
  cell.className = 'stats-heatmap-cell';
  cell.style.background = _stageColor(exercise.stage);
  cell.dataset.exerciseId = exercise.id;
  cell.onclick = function() { showCardDetail(exercise.id); };

  var nameEl = document.createElement('span');
  nameEl.className = 'stats-heatmap-cell-name';
  nameEl.textContent = exercise.name || '';
  cell.appendChild(nameEl);

  // Show transfer indicator if there's transferred time
  if (exercise.transferredTime > 0) {
    var transferEl = document.createElement('span');
    transferEl.className = 'stats-heatmap-transfer';
    transferEl.textContent = '+' + _formatDuration(exercise.transferredTime);
    transferEl.title = 'Transferred from similar exercises';
    cell.appendChild(transferEl);
    cell.title = (exercise.name || 'Exercise') + ' — ' + _getStageLabel(exercise.stage) +
      ' — ' + _formatDuration(exercise.totalPracticedSeconds) + ' direct + ' +
      _formatDuration(exercise.transferredTime) + ' transferred';
  } else {
    cell.title = (exercise.name || 'Exercise') + ' — ' + _getStageLabel(exercise.stage);
  }

  return cell;
}

// Render similarity groups list in the drawer
function renderSimilarityGroupsList() {
  var container = document.getElementById('sim-group-list');
  if (!container || !_statsSongData) return;

  var groups = _statsSongData.similarityGroups || [];
  container.innerHTML = '';

  if (groups.length === 0) {
    container.innerHTML = '<div class="sim-group-empty">No similarity groups yet. Create one to link exercises that share practice transfer.</div>';
    return;
  }

  var exercises = _statsSongData.exercises || [];
  var exMap = {};
  exercises.forEach(function(ex) { exMap[ex.id] = ex; });

  groups.forEach(function(group) {
    var div = document.createElement('div');
    div.className = 'sim-group-item';

    var typeLabel = group.type === 'identical' ? 'Identical' : 'Similar';
    var typeBadge = '<span class="sim-group-type-badge ' + group.type + '">' + typeLabel + '</span>';

    var names = group.exerciseIds.map(function(id) {
      var ex = exMap[id];
      return ex ? (ex.name || 'Exercise') : 'Unknown';
    });

    div.innerHTML = typeBadge +
      '<span class="sim-group-names">' + names.join(' <span class="sim-group-link-icon">↔</span> ') + '</span>' +
      '<button class="sim-group-delete" onclick="deleteSimGroup(\'' + group.id + '\')" title="Remove group">×</button>';

    container.appendChild(div);
  });
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

// ===== Section 6: Practice History =====
function loadPracticeHistory() {
  var container = document.getElementById('stats-history');
  var moreBtn = document.getElementById('stats-history-more');
  if (!container) return;

  var songId = document.getElementById('stats-drawer').dataset.songId;
  var today = new Date();
  var startDate = new Date(today);
  startDate.setDate(today.getDate() - (_statsHistoryDays - 1));

  var from = startDate.toISOString().slice(0, 10);
  var to = today.toISOString().slice(0, 10);

  fetch('/api/songs/' + songId + '/daily-log?from=' + from + '&to=' + to)
    .then(function(r) { return r.json(); })
    .then(function(logs) {
      renderPracticeHistory(container, logs, moreBtn);
    })
    .catch(function() {
      container.innerHTML = '<div class="stats-history-empty">Failed to load practice history</div>';
    });
}

function renderPracticeHistory(container, logs, moreBtn) {
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="stats-history-empty">No practice history yet</div>';
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  container.innerHTML = '';

  // Sort logs by date descending
  var sorted = logs.slice().sort(function(a,b) { return b.date.localeCompare(a.date); });

  // Filter to days that actually have practice
  var daysWithData = sorted.filter(function(log) {
    return log.entries && log.entries.length > 0 && log.entries.some(function(e) { return e.seconds > 0 || e.reps > 0; });
  });

  if (daysWithData.length === 0) {
    container.innerHTML = '<div class="stats-history-empty">No practice history yet</div>';
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  daysWithData.forEach(function(log) {
    var entry = document.createElement('div');
    entry.className = 'stats-history-entry';

    // Date
    var dateEl = document.createElement('div');
    dateEl.className = 'stats-history-date';
    var d = new Date(log.date + 'T12:00:00');
    var options = { weekday: 'long', month: 'short', day: 'numeric' };
    dateEl.textContent = d.toLocaleDateString('en-US', options);
    entry.appendChild(dateEl);

    // Total time
    var totalSeconds = 0;
    var totalReps = 0;
    log.entries.forEach(function(e) {
      totalSeconds += e.seconds;
      totalReps += e.reps;
    });

    var summaryEl = document.createElement('div');
    summaryEl.className = 'stats-history-summary';
    summaryEl.textContent = _formatDuration(totalSeconds) + (totalReps > 0 ? ' · ' + totalReps + ' reps' : '');
    entry.appendChild(summaryEl);

    // Cards touched as pills
    var pillsEl = document.createElement('div');
    pillsEl.className = 'stats-history-pills';
    log.entries.forEach(function(e) {
      if (e.seconds <= 0 && e.reps <= 0) return;
      var ex = _findExercise(e.exerciseId);
      if (!ex) return;

      var pill = document.createElement('span');
      pill.className = 'stats-history-pill';
      pill.style.background = _stageColor(ex.stage);
      pill.style.color = (ex.stage >= 3) ? '#1a1a1a' : '#fff';
      pill.textContent = ex.name || 'Exercise';
      pillsEl.appendChild(pill);
    });
    entry.appendChild(pillsEl);

    container.appendChild(entry);
  });

  // Show more button if we might have more data
  if (moreBtn) {
    moreBtn.style.display = daysWithData.length >= 3 ? 'block' : 'none';
  }
}

function _findExercise(exerciseId) {
  if (!_statsSongData || !_statsSongData.exercises) return null;
  for (var i = 0; i < _statsSongData.exercises.length; i++) {
    if (_statsSongData.exercises[i].id === exerciseId) return _statsSongData.exercises[i];
  }
  return null;
}

function loadMoreHistory() {
  _statsHistoryDays += 14;
  loadPracticeHistory();
}

// ===== Section 5: Recommendations =====
function loadRecommendations() {
  var container = document.getElementById('stats-recommend');
  if (!container) return;

  var songId = document.getElementById('stats-drawer').dataset.songId;

  fetch('/api/songs/' + songId + '/stats/recommend')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      renderRecommendations(container, data);
    })
    .catch(function() {
      container.innerHTML = '<div class="stats-recommend-empty">Unable to load recommendations</div>';
    });
}

function renderRecommendations(container, data) {
  var recs = data.recommendations || [];
  var totalMins = data.totalMins || 0;

  if (recs.length === 0) {
    container.innerHTML = '<div class="stats-recommend-empty">Start practicing to get recommendations</div>';
    return;
  }

  container.innerHTML = '';

  // Header
  var header = document.createElement('div');
  header.className = 'stats-recommend-header';
  header.innerHTML = '<strong>Suggested Practice</strong> <span class="stats-recommend-time">~' + totalMins + ' min</span>';
  container.appendChild(header);

  // Recommendation list
  var list = document.createElement('ol');
  list.className = 'stats-recommend-list';

  recs.forEach(function(rec, idx) {
    var li = document.createElement('li');
    li.className = 'stats-recommend-item';

    var stageEmoji = '';
    if (rec.exerciseId === '__runthrough__') {
      stageEmoji = '🎵';
    } else {
      var ex = _findExercise(rec.exerciseId);
      if (ex) {
        var stage = ex.stage || 1;
        if (stage <= 1) stageEmoji = '🔴';
        else if (stage <= 2) stageEmoji = '🟠';
        else if (stage <= 3) stageEmoji = '🟡';
        else if (stage <= 4) stageEmoji = '🟢';
        else stageEmoji = '✅';
      }
    }

    li.innerHTML =
      '<span class="stats-recommend-emoji">' + stageEmoji + '</span>' +
      '<div class="stats-recommend-content">' +
        '<span class="stats-recommend-name">' + rec.name + '</span>' +
        '<span class="stats-recommend-reason">' + rec.reason + '</span>' +
      '</div>' +
      '<span class="stats-recommend-mins">' + rec.suggestedMins + ' min</span>';

    // Highlight the corresponding cell in the heatmap
    if (rec.exerciseId !== '__runthrough__') {
      li.style.cursor = 'pointer';
      li.onclick = function() {
        showCardDetail(rec.exerciseId);
        // Also highlight in heatmap
        document.querySelectorAll('.stats-heatmap-cell').forEach(function(c) {
          c.classList.toggle('recommended', c.dataset.exerciseId === rec.exerciseId);
        });
      };
    }

    list.appendChild(li);
  });

  container.appendChild(list);
}
