// ===== Song Detail: Practice Mode =====
let _activeCard = null;
let _timerInterval = null;
let _localSeconds = 0;
let _lastSaveTime = 0;
let _isTimerRunning = false;
const SAVE_INTERVAL = 30;
const INACTIVITY_LIMIT = 120000;
let _inactivityTimeout = null;

function openPractice(card) {
  if (_activeCard && _activeCard !== card) {
    closePractice();
  }
  _activeCard = card;

  // Show practice controls
  const controls = card.querySelector('.practice-controls');
  if (controls) controls.style.display = 'flex';

  // Show expanded crops, hide thumbnail
  const thumb = card.querySelector('.expanded-thumbnail');
  if (thumb) {
    const defaultImg = thumb.querySelector(':scope > img');
    const defaultPlaceholder = thumb.querySelector(':scope > .thumbnail-placeholder');
    const cropStack = thumb.querySelector('.inline-crop-stack');
    if (defaultImg) defaultImg.style.display = 'none';
    if (defaultPlaceholder) defaultPlaceholder.style.display = 'none';
    if (cropStack) cropStack.style.display = 'flex';
  }

  // Add active class
  card.classList.add('active-card');

  // Show backdrop
  const backdrop = document.getElementById('practice-backdrop');
  if (backdrop) backdrop.style.display = 'block';

  // Lock scroll
  const view = document.getElementById('exercise-view');
  if (view) view.classList.add('scroll-locked');

  // Initialize timer
  _localSeconds = parseInt(card.dataset.totalSeconds) || 0;
  _lastSaveTime = _localSeconds;
  updateTimerDisplay(card);
  startTimer(card);

  // Scroll card into view
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.setAttribute('tabindex', '-1');
    card.focus({ preventScroll: true });
  }, 50);
}

function closePractice() {
  if (!_activeCard) return;
  pauseTimer();
  saveTimeIfNeeded();
  clearInactivityTimeout();

  const card = _activeCard;

  // Hide practice controls
  const controls = card.querySelector('.practice-controls');
  if (controls) controls.style.display = 'none';

  // Restore thumbnail
  const thumb = card.querySelector('.expanded-thumbnail');
  if (thumb) {
    const defaultImg = thumb.querySelector(':scope > img');
    const defaultPlaceholder = thumb.querySelector(':scope > .thumbnail-placeholder');
    const cropStack = thumb.querySelector('.inline-crop-stack');
    if (defaultImg) defaultImg.style.display = '';
    if (defaultPlaceholder && !defaultImg) defaultPlaceholder.style.display = '';
    if (cropStack) cropStack.style.display = 'none';
  }

  // Remove active class
  card.classList.remove('active-card');

  // Hide backdrop
  const backdrop = document.getElementById('practice-backdrop');
  if (backdrop) backdrop.style.display = 'none';

  // Unlock scroll
  const view = document.getElementById('exercise-view');
  if (view) view.classList.remove('scroll-locked');

  _activeCard = null;
}

function startTimer(card) {
  pauseTimer();
  _isTimerRunning = true;
  resetInactivityTimeout();
  const toggle = card.querySelector('.inline-timer-toggle');
  if (toggle) toggle.textContent = 'Pause';

  _timerInterval = setInterval(() => {
    _localSeconds++;
    updateTimerDisplay(card);
    if (_localSeconds - _lastSaveTime >= SAVE_INTERVAL) saveTime();
  }, 1000);
}

function pauseTimer() {
  _isTimerRunning = false;
  clearInactivityTimeout();
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  if (_activeCard) {
    const toggle = _activeCard.querySelector('.inline-timer-toggle');
    if (toggle) toggle.textContent = 'Play';
  }
}

function toggleTimer(btn) {
  if (!_activeCard) return;
  if (_isTimerRunning) {
    pauseTimer();
    saveTimeIfNeeded();
  } else {
    startTimer(_activeCard);
  }
}

function updateTimerDisplay(card) {
  const display = card.querySelector('.inline-timer-display');
  if (!display) return;
  const hours = Math.floor(_localSeconds / 3600);
  const minutes = Math.floor((_localSeconds % 3600) / 60);
  const seconds = _localSeconds % 60;
  const pad = n => n.toString().padStart(2, '0');
  display.textContent = hours > 0
    ? hours + ':' + pad(minutes) + ':' + pad(seconds)
    : minutes + ':' + pad(seconds);
}

function saveTimeIfNeeded() {
  if (_localSeconds > _lastSaveTime) saveTime();
}

function saveTime() {
  if (!_activeCard) return;
  const songId = _activeCard.dataset.songId;
  const exerciseId = _activeCard.dataset.exerciseId;
  fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalPracticedSeconds: _localSeconds,
      lastPracticedAt: new Date().toISOString()
    })
  }).then(() => {
    _lastSaveTime = _localSeconds;
    _activeCard.dataset.totalSeconds = _localSeconds;
  }).catch(console.error);
}

// ===== Reps =====
function addReps(btn, count) {
  if (!_activeCard) return;
  const songId = _activeCard.dataset.songId;
  const exerciseId = _activeCard.dataset.exerciseId;
  let totalReps = parseInt(_activeCard.dataset.totalReps) || 0;
  totalReps += count;
  _activeCard.dataset.totalReps = totalReps;

  const display = _activeCard.querySelector('.inline-reps-count');
  if (display) display.textContent = totalReps;

  fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalReps: totalReps,
      lastPracticedAt: new Date().toISOString()
    })
  }).catch(console.error);
}

// ===== Inactivity =====
function resetInactivityTimeout() {
  clearInactivityTimeout();
  _inactivityTimeout = setTimeout(() => {
    if (_isTimerRunning) {
      pauseTimer();
      saveTimeIfNeeded();
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
['click', 'touchstart', 'wheel', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (_isTimerRunning) resetInactivityTimeout();
  });
});

// Save on page unload
window.addEventListener('beforeunload', () => {
  pauseTimer();
  saveTimeIfNeeded();
});
