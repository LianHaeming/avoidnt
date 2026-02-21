// ===== Song Detail: Practice Mode =====
let _activeCard = null;
let _timerInterval = null;
let _localSeconds = 0;
let _lastSaveTime = 0;
let _isTimerRunning = false;
const SAVE_INTERVAL = 30;
const INACTIVITY_LIMIT = 120000;
let _inactivityTimeout = null;

// ===== Play button starts timer =====
function cardStartTimer(card) {
  if (!card) return;

  // If already timing this card, ignore (use crop to pause)
  if (_activeCard === card && _isTimerRunning) return;

  // If another card is actively timing, stop it first
  if (_activeCard && _activeCard !== card) {
    _stopCardTimer(_activeCard);
  }

  _activeCard = card;
  _localSeconds = parseInt(card.dataset.totalSeconds) || 0;
  _lastSaveTime = _localSeconds;
  _isTimerRunning = true;
  resetInactivityTimeout();

  card.classList.add('timing');

  _timerInterval = setInterval(function() {
    _localSeconds++;
    card.dataset.totalSeconds = _localSeconds;
    _updateCardTimerDisplay(card);
    if (_localSeconds - _lastSaveTime >= SAVE_INTERVAL) saveTime();
  }, 1000);
}

// ===== Clicking crop toggles timer =====
function cardCropClick(card) {
  if (!card) return;
  if (_activeCard === card && _isTimerRunning) {
    _stopCardTimer(card);
  } else {
    cardStartTimer(card);
  }
}

function _stopCardTimer(card) {
  _isTimerRunning = false;
  clearInactivityTimeout();
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  saveTimeIfNeeded();

  card.classList.remove('timing');
  _activeCard = null;
}

function _updateCardTimerDisplay(card) {
  var display = card.querySelector('.card-timer-display');
  if (!display) return;
  var hours = Math.floor(_localSeconds / 3600);
  var minutes = Math.floor((_localSeconds % 3600) / 60);
  var seconds = _localSeconds % 60;
  var pad = function(n) { return n.toString().padStart(2, '0'); };
  if (hours > 0) {
    display.textContent = hours + ':' + pad(minutes) + ':' + pad(seconds);
  } else {
    display.textContent = minutes + ':' + pad(seconds);
  }
}

// ===== Card-level reps (always visible) =====
function cardAddReps(btn, count) {
  var card = btn.closest('.expanded-card-wrapper');
  if (!card) return;
  var songId = card.dataset.songId;
  var exerciseId = card.dataset.exerciseId;
  var totalReps = parseInt(card.dataset.totalReps) || 0;
  totalReps += count;
  card.dataset.totalReps = totalReps;

  var display = card.querySelector('.card-reps-count');
  if (display) display.textContent = totalReps;

  fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalReps: totalReps,
      lastPracticedAt: new Date().toISOString()
    })
  }).catch(console.error);

  // Also log reps to daily log
  var today = new Date().toISOString().slice(0, 10);
  fetch('/api/songs/' + songId + '/daily-log', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: today,
      exerciseId: exerciseId,
      seconds: 0,
      reps: count
    })
  }).catch(console.error);
}

function closePractice() {
  if (!_activeCard) return;
  _stopCardTimer(_activeCard);
}

function saveTimeIfNeeded() {
  if (_localSeconds > _lastSaveTime) saveTime();
}

function saveTime() {
  if (!_activeCard) return;
  var songId = _activeCard.dataset.songId;
  var exerciseId = _activeCard.dataset.exerciseId;
  var secondsDelta = _localSeconds - _lastSaveTime;
  fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalPracticedSeconds: _localSeconds,
      lastPracticedAt: new Date().toISOString()
    })
  }).then(function() {
    _lastSaveTime = _localSeconds;
    _activeCard.dataset.totalSeconds = _localSeconds;
  }).catch(console.error);

  // Also log to daily log
  if (secondsDelta > 0) {
    var today = new Date().toISOString().slice(0, 10);
    fetch('/api/songs/' + songId + '/daily-log', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: today,
        exerciseId: exerciseId,
        seconds: secondsDelta,
        reps: 0
      })
    }).catch(console.error);
  }
}

// ===== Inactivity =====
function resetInactivityTimeout() {
  clearInactivityTimeout();
  _inactivityTimeout = setTimeout(function() {
    if (_isTimerRunning && _activeCard) {
      _stopCardTimer(_activeCard);
    }
  }, INACTIVITY_LIMIT);
}

function clearInactivityTimeout() {
  if (_inactivityTimeout) {
    clearTimeout(_inactivityTimeout);
    _inactivityTimeout = null;
  }
}

// User activity resets inactivity
['click', 'touchstart', 'wheel', 'keydown'].forEach(function(evt) {
  document.addEventListener(evt, function() {
    if (_isTimerRunning) resetInactivityTimeout();
  });
});

// Save on page unload
window.addEventListener('beforeunload', function() {
  if (_activeCard) _stopCardTimer(_activeCard);
});
