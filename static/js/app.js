// ===== Settings Modal =====
function openSettings() {
  const menu = document.getElementById('user-menu');
  if (menu) menu.open = false;
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSettings() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.style.display = 'none';
}

// Theme
function setTheme(theme) {
  const shell = document.getElementById('app-shell');
  if (!shell) return;
  if (theme === 'dark') {
    shell.classList.add('dark-mode');
  } else {
    shell.classList.remove('dark-mode');
  }
  // Update active buttons
  document.querySelectorAll('.theme-segment').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase().includes(theme));
  });
  // Save to server
  fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme })
  }).catch(console.error);
}

// Stage names
let _stageDebounce = null;
function onStageNameInput(input) {
  clearTimeout(_stageDebounce);
  _stageDebounce = setTimeout(() => saveStageNames(), 500);
}

function onStageNameBlur(input) {
  const idx = parseInt(input.dataset.stageIndex);
  if (!input.value.trim()) {
    const defaults = ['Learning', 'Developing', 'Confident', 'Polishing', 'Mastered'];
    input.value = defaults[idx] || 'Stage ' + (idx + 1);
  }
  saveStageNames();
}

function saveStageNames() {
  const inputs = document.querySelectorAll('.stage-name-input');
  const stageNames = Array.from(inputs).map(i => i.value.trim() || 'Stage');
  fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageNames })
  }).catch(console.error);
}

function resetStageNames() {
  const defaults = ['Learning', 'Developing', 'Confident', 'Polishing', 'Mastered'];
  const inputs = document.querySelectorAll('.stage-name-input');
  inputs.forEach((input, i) => { input.value = defaults[i]; });
  saveStageNames();
}

// ===== Songs Browse: Context Menu =====
let _ctxSongId = null;

function openCtxMenu(event, songId) {
  event.stopPropagation();
  _ctxSongId = songId;
  const btn = event.target;
  const rect = btn.getBoundingClientRect();
  const menu = document.getElementById('ctx-menu');
  const backdrop = document.getElementById('ctx-menu-backdrop');
  if (!menu || !backdrop) return;
  menu.style.display = 'block';
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  backdrop.style.display = 'block';
}

function closeCtxMenu() {
  const menu = document.getElementById('ctx-menu');
  const backdrop = document.getElementById('ctx-menu-backdrop');
  if (menu) menu.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
  _ctxSongId = null;
}

function editCtxSong() {
  if (_ctxSongId) location.href = '/songs/' + _ctxSongId + '/edit';
  closeCtxMenu();
}

function deleteCtxSong() {
  if (!_ctxSongId) return;
  if (!confirm('Are you sure you want to delete this song? This cannot be undone.')) {
    closeCtxMenu();
    return;
  }
  fetch('/api/songs/' + _ctxSongId, { method: 'DELETE' })
    .then(res => {
      if (res.ok) location.reload();
      else alert('Failed to delete song');
    })
    .catch(err => { console.error(err); alert('Failed to delete song'); });
  closeCtxMenu();
}

// ===== Search =====
function toggleSearch() {
  const bar = document.getElementById('search-bar');
  if (!bar) return;
  if (bar.style.display === 'none') {
    bar.style.display = 'flex';
    document.getElementById('search-input')?.focus();
  } else {
    closeSearch();
  }
}

function closeSearch() {
  const bar = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  if (bar) bar.style.display = 'none';
  if (input) {
    input.value = '';
    // Trigger htmx to reload all songs
    htmx.trigger(input, 'keyup');
  }
}

// ===== Song Detail: Stage Change =====
function onStageChange(select, songId, exerciseId) {
  const newStage = parseInt(select.value);
  fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: newStage })
  }).catch(console.error);

  // Update card colors
  const card = select.closest('.expanded-card');
  if (card) {
    const colors = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
    const color = colors[newStage] || '#9ca3af';
    select.style.color = color;
    card.style.background = hexToRgba(color, 0.1);
    card.style.borderColor = hexToRgba(color, 0.35);
  }
}

function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// ===== Keyboard shortcuts =====
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeSettings();
    closeCtxMenu();
    closePractice();
  }
});

// Close user menu on outside click
document.addEventListener('click', function(e) {
  const menu = document.getElementById('user-menu');
  if (menu && menu.open && !menu.contains(e.target)) {
    menu.open = false; 
  }
});

// ===== Spotify Album Art (oEmbed) =====
(function() {
  const inflight = {};

  function fetchSpotifyThumbnail(spotifyUrl) {
    if (inflight[spotifyUrl] !== undefined) return inflight[spotifyUrl];
    if (!spotifyUrl || !/^https?:\/\/(open\.)?spotify\.com\/(track|album|playlist|artist)\//.test(spotifyUrl)) {
      return Promise.resolve('');
    }
    inflight[spotifyUrl] = fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(spotifyUrl))
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        return (data && data.thumbnail_url) || '';
      })
      .catch(function() { return ''; });
    return inflight[spotifyUrl];
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Song cards on browse page: swap in Spotify album art
    document.querySelectorAll('.song-card[data-spotify-url]').forEach(function(card) {
      var spotifyUrl = card.getAttribute('data-spotify-url');
      if (!spotifyUrl) return;
      var container = card.querySelector('.card-thumbnail');
      if (!container) return;
      // Show spinner immediately while waiting for Spotify art
      container.innerHTML = '<div class="thumbnail-spinner"></div>';
      fetchSpotifyThumbnail(spotifyUrl).then(function(thumbUrl) {
        if (!thumbUrl) {
          // Restore placeholder if fetch failed
          container.innerHTML = '<div class="thumbnail-placeholder">🎵</div>';
          return;
        }
        // Replace spinner with album art
        container.innerHTML = '<img src="' + thumbUrl + '" alt="" class="thumbnail-img" loading="lazy" />';
      });
    });

    // Song detail page: show album art in header
    var header = document.querySelector('.song-header-wrapper[data-spotify-url]');
    if (header) {
      var spotifyUrl = header.getAttribute('data-spotify-url');
      fetchSpotifyThumbnail(spotifyUrl).then(function(thumbUrl) {
        if (!thumbUrl) return;
        var artDiv = document.getElementById('song-album-art');
        var artImg = document.getElementById('song-album-art-img');
        if (artDiv && artImg) {
          artImg.src = thumbUrl;
          artDiv.style.display = '';
        }
      });
    }
  });
})();
