// ===== Navigation Guard =====
// Pages can set window._navGuard to a function(url) that returns false to block navigation.
function navGuard(url) {
  if (typeof window._navGuard === 'function') {
    window._navGuard(url);
  } else {
    location.href = url;
  }
}

// ===== Settings Page =====

// Display name
let _nameDebounce = null;
function saveDisplayName(input) {
  clearTimeout(_nameDebounce);
  _nameDebounce = setTimeout(() => {
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: input.value.trim() || 'Lian' })
    }).catch(console.error);
  }, 500);
}

function updateAvatarInitials(name) {
  const el = document.getElementById('avatar-initials');
  if (!el) return;
  const trimmed = (name || '').trim();
  el.textContent = trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

// Theme
function setTheme(theme) {
  const shell = document.getElementById('app-shell');
  if (!shell) return;
  if (theme === 'dark') {
    shell.classList.add('dark-mode');
    document.body.style.background = '#191919';
  } else {
    shell.classList.remove('dark-mode');
    document.body.style.background = '#ffffff';
  }
  // Update Safari/Chrome theme-color
  const themeMeta = document.getElementById('theme-color-meta');
  if (themeMeta) {
    themeMeta.setAttribute('content', theme === 'dark' ? '#191919' : '#ffffff');
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
  const card = select.closest('.expanded-card-wrapper');
  if (card) {
    const colors = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
    const color = colors[newStage] || '#9ca3af';
    select.style.color = color;
    var innerCard = card.querySelector('.expanded-card');
    if (innerCard) innerCard.style.borderLeftColor = hexToRGBA(color, 0.35);
    card.dataset.stage = newStage;

    // Update section nav pill for this exercise's section
    updateSectionPill(card.dataset.sectionId);
  }
}

function updateSectionPill(sectionId) {
  if (!sectionId) return;
  var pill = document.querySelector('.section-pill[data-section-id="' + sectionId + '"]');
  if (!pill) return;

  // Find all exercise cards in this section and compute lowest stage
  var cards = document.querySelectorAll('.expanded-card-wrapper[data-section-id="' + sectionId + '"]');
  var lowest = 5;
  cards.forEach(function(c) {
    var s = parseInt(c.dataset.stage) || 1;
    if (s < lowest) lowest = s;
  });

  var colors = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
  var color = colors[lowest] || '#9ca3af';
  pill.style.color = hexToRGBA(color, 0.7);
  pill.style.background = hexToRGBA(color, 0.1);
  pill.style.borderColor = hexToRGBA(color, 0.35);
}

function hexToRGBA(hex, alpha) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// ===== Smooth transition: returning from editor to practice view =====
document.addEventListener('DOMContentLoaded', function() {
  var view = document.getElementById('exercise-view');
  if (view && sessionStorage.getItem('avoidnt_from_editor') === '1') {
    sessionStorage.removeItem('avoidnt_from_editor');
    view.classList.add('returning-from-editor');
    setTimeout(function() { view.classList.remove('returning-from-editor'); }, 400);
  }
});

// ===== Keyboard shortcuts =====
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeCtxMenu();
    closeSongDetailMenu();
    closePractice();
    // Exit edit mode if active
    var view = document.getElementById('exercise-view');
    if (view && view.classList.contains('editing-exercises')) {
      toggleEditExercises();
    }
  }
});

// Close user menu on outside click
document.addEventListener('click', function(e) {
  const menu = document.getElementById('user-menu');
  if (menu && menu.open && !menu.contains(e.target)) {
    menu.open = false; 
  }
  // Close song detail dropdown on outside click
  var sdMenu = document.getElementById('song-detail-menu');
  var sdDropdown = document.getElementById('song-detail-dropdown');
  if (sdDropdown && sdDropdown.classList.contains('open') && sdMenu && !sdMenu.contains(e.target)) {
    sdDropdown.classList.remove('open');
  }
});

// ===== Spotify Album Art (oEmbed) =====
(function() {
  const inflight = {};
  const CACHE_KEY = 'spotify_thumb_cache';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  function getCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    } catch(e) { return {}; }
  }

  function setCache(url, thumbUrl) {
    try {
      var cache = getCache();
      cache[url] = { thumb: thumbUrl, ts: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch(e) { /* quota exceeded, ignore */ }
  }

  function getCached(url) {
    var cache = getCache();
    var entry = cache[url];
    if (entry && (Date.now() - entry.ts) < CACHE_TTL) {
      return entry.thumb;
    }
    return null;
  }

  window.fetchSpotifyThumbnail = function fetchSpotifyThumbnail(spotifyUrl) {
    if (inflight[spotifyUrl] !== undefined) return inflight[spotifyUrl];
    if (!spotifyUrl || !/^https?:\/\/(open\.)?spotify\.com\/(track|album|playlist|artist)\//.test(spotifyUrl)) {
      return Promise.resolve('');
    }
    // Check localStorage cache first
    var cached = getCached(spotifyUrl);
    if (cached !== null) {
      return Promise.resolve(cached);
    }
    inflight[spotifyUrl] = fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(spotifyUrl))
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        var thumb = (data && data.thumbnail_url) || '';
        setCache(spotifyUrl, thumb);
        return thumb;
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

    // Apply initial crop scales on page load
    applyCropScales();
    // Apply initial crop background color styling (invert for dark bg)
    applyInitialCropBgStyles();
  });
})();

// ===== Song Detail: Three-dot menu =====
function toggleSongDetailMenu(event) {
  event.stopPropagation();
  var dropdown = document.getElementById('song-detail-dropdown');
  if (dropdown) dropdown.classList.toggle('open');
}

function closeSongDetailMenu() {
  var dropdown = document.getElementById('song-detail-dropdown');
  if (dropdown) dropdown.classList.remove('open');
}

// ===== Song Detail: Edit Exercises Mode =====
function toggleEditExercises() {
  var view = document.getElementById('exercise-view');
  var toolbar = document.getElementById('edit-exercises-toolbar');
  if (!view || !toolbar) return;

  var editing = view.classList.toggle('editing-exercises');
  toolbar.style.display = editing ? 'block' : 'none';
}

// Regenerate HD previews from source pages
function regeneratePreviews(btn) {
  var toolbar = document.getElementById('edit-exercises-toolbar');
  if (!toolbar) return;
  var songId = toolbar.dataset.songId;

  btn.disabled = true;
  btn.textContent = '⏳ Regenerating...';

  fetch('/api/songs/' + songId + '/regenerate-previews', { method: 'POST' })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) {
        alert('Error: ' + data.error);
        btn.textContent = '🔄 Regenerate HD Previews';
      } else {
        btn.textContent = '✅ Done! (' + (data.regenerated || 0) + ' crops)';
        // Reload images by busting cache
        document.querySelectorAll('.card-crop-img').forEach(function(img) {
          var src = img.getAttribute('src');
          if (src) img.src = src.split('?')[0] + '?t=' + Date.now();
        });
      }
    })
    .catch(function(err) {
      console.error(err);
      alert('Failed to regenerate previews');
      btn.textContent = '🔄 Regenerate HD Previews';
    })
    .finally(function() {
      btn.disabled = false;
    });
}

// ===== Crop resize: drag handle =====
var _resizeState = null;

function cropResizeStart(event, handle) {
  event.preventDefault();
  event.stopPropagation();
  var card = handle.closest('.expanded-card-wrapper');
  if (!card) return;

  var cropArea = card.querySelector('.card-crop-area');
  if (!cropArea) return;

  var startY = event.type === 'touchstart' ? event.touches[0].clientY : event.clientY;
  var startHeight = cropArea.offsetHeight;
  var currentScale = parseFloat(card.dataset.cropScale) || 100;

  _resizeState = {
    card: card,
    cropArea: cropArea,
    startY: startY,
    startHeight: startHeight,
    startScale: currentScale
  };

  document.addEventListener('mousemove', cropResizeMove);
  document.addEventListener('mouseup', cropResizeEnd);
  document.addEventListener('touchmove', cropResizeMove, { passive: false });
  document.addEventListener('touchend', cropResizeEnd);
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
}

function cropResizeMove(event) {
  if (!_resizeState) return;
  event.preventDefault();
  var clientY = event.type === 'touchmove' ? event.touches[0].clientY : event.clientY;
  var deltaY = clientY - _resizeState.startY;
  var ratio = (_resizeState.startHeight + deltaY) / _resizeState.startHeight;
  var newScale = Math.round(Math.max(30, Math.min(300, _resizeState.startScale * ratio)));

  _resizeState.card.dataset.cropScale = newScale;
  _resizeState.card.querySelectorAll('.card-crop-img').forEach(function(img) {
    img.style.width = newScale + '%';
  });
}

function cropResizeEnd() {
  if (!_resizeState) return;
  var card = _resizeState.card;
  var scale = parseFloat(card.dataset.cropScale) || 100;

  // Save to server
  var songId = card.dataset.songId;
  var exerciseId = card.dataset.exerciseId;
  fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cropScale: scale })
  }).catch(console.error);

  _resizeState = null;
  document.removeEventListener('mousemove', cropResizeMove);
  document.removeEventListener('mouseup', cropResizeEnd);
  document.removeEventListener('touchmove', cropResizeMove);
  document.removeEventListener('touchend', cropResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

// Apply saved crop scales on page load
function applyCropScales() {
  document.querySelectorAll('.expanded-card-wrapper[data-crop-scale]').forEach(function(card) {
    var scale = parseFloat(card.dataset.cropScale);
    if (!scale || scale === 100) return;
    var imgs = card.querySelectorAll('.card-crop-img');
    imgs.forEach(function(img) {
      img.style.width = scale + '%';
    });
  });
}

// Toggle crop background between light and dark
function toggleCropBg() {
  var toggle = document.getElementById('bg-toggle');
  if (!toggle) return;
  var isDark = toggle.classList.toggle('bg-toggle--dark');
  var color = isDark ? '#1e1e1e' : '';
  setCropBgColor(null, color);
}

// Crop background color
function setCropBgColor(swatch, color) {
  var toolbar = document.getElementById('edit-exercises-toolbar');
  if (!toolbar) return;
  var songId = toolbar.dataset.songId;

  // Determine if this is a dark background
  var isDark = isColorDark(color);

  // Update data attribute for persistence across page loads
  var view = document.getElementById('exercise-view');
  if (view) {
    if (color) {
      view.setAttribute('data-crop-bg-color', color);
    } else {
      view.removeAttribute('data-crop-bg-color');
    }
  }

  // Apply to all crop areas
  document.querySelectorAll('.card-crop-area').forEach(function(area) {
    area.style.background = color || '';
  });

  // Apply invert filter for dark backgrounds so notes become white
  document.querySelectorAll('.card-crop-img').forEach(function(img) {
    if (isDark) {
      img.style.filter = 'invert(1)';
      img.style.mixBlendMode = 'difference';
    } else {
      img.style.filter = '';
      img.style.mixBlendMode = '';
    }
  });

  // Update text colors for contrast
  document.querySelectorAll('.card-title-name').forEach(function(el) {
    el.style.color = isDark ? '#e5e7eb' : '';
  });

  // Save to server
  fetch('/api/songs/' + songId + '/display', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cropBgColor: color })
  }).catch(console.error);
}

// Apply initial crop bg styles on page load (for dark backgrounds)
function applyInitialCropBgStyles() {
  var view = document.getElementById('exercise-view');
  if (!view) return;
  var bg = view.getAttribute('data-crop-bg-color');
  if (!bg) return;
  var isDark = isColorDark(bg);
  if (!isDark) return;

  document.querySelectorAll('.card-crop-img').forEach(function(img) {
    img.style.filter = 'invert(1)';
    img.style.mixBlendMode = 'difference';
  });
  document.querySelectorAll('.card-title-name').forEach(function(el) {
    el.style.color = '#e5e7eb';
  });
}

// Helper: determine if a hex color is dark
function isColorDark(hex) {
  if (!hex || hex.length < 4) return false;
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  // Perceived luminance
  var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5;
}
