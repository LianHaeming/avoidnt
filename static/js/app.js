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
    // Close display settings drawer if open
    var drawer = document.getElementById('display-settings-drawer');
    if (drawer && drawer.style.display !== 'none') {
      drawer.style.display = 'none';
    }
    // Clear active section filter
    clearSectionFilter();
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
    document.querySelectorAll('.song-card[data-spotify-url], .continue-card[data-spotify-url], .attention-card[data-spotify-url]').forEach(function(card) {
      var spotifyUrl = card.getAttribute('data-spotify-url');
      if (!spotifyUrl) return;
      var container = card.querySelector('.card-thumbnail, .continue-thumbnail, .attention-art');
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
  applyCropScaleToCard(_resizeState.card, newScale);
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

// Zoom crop via +/- buttons
function cropZoomBtn(btn, delta) {
  var card = btn.closest('.expanded-card-wrapper');
  if (!card) return;
  var currentScale = parseFloat(card.dataset.cropScale) || 100;
  var newScale = Math.round(Math.max(30, Math.min(300, currentScale + delta)));
  card.dataset.cropScale = newScale;
  applyCropScaleToCard(card, newScale);
  // Save to server
  var songId = card.dataset.songId;
  var exerciseId = card.dataset.exerciseId;
  if (songId && exerciseId) {
    fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropScale: newScale })
    }).catch(console.error);
  }
}

// Apply a scale value to all crop images in a card.
// Default mode: sets image width as a percentage of the card (card height follows naturally).
// Full-fit mode: sets image width in absolute pixels based on natural image size, and
// constrains the card wrapper to that width so the card wraps the crop.
function applyCropScaleToCard(card, scale) {
  var fit = card.dataset.cropFit === 'true';

  if (fit) {
    var maxNaturalW = 0;
    var pending = 0;

    card.querySelectorAll('.card-crop-img').forEach(function(img) {
      img.style.transform = '';
      if (img.naturalWidth) {
        var px = Math.round(img.naturalWidth * scale / 100);
        img.style.width = px + 'px';
        if (img.naturalWidth > maxNaturalW) maxNaturalW = img.naturalWidth;
      } else {
        pending++;
        img.addEventListener('load', function onLoad() {
          img.removeEventListener('load', onLoad);
          // Re-apply once the image has loaded so naturalWidth is known
          applyCropScaleToCard(card, parseFloat(card.dataset.cropScale) || 100);
        });
      }
    });

    if (!pending && maxNaturalW > 0) {
      card.style.maxWidth = Math.round(maxNaturalW * scale / 100) + 'px';
    }
  } else {
    card.style.maxWidth = '';
    card.querySelectorAll('.card-crop-img').forEach(function(img) {
      img.style.transform = '';
      img.style.width = scale + '%';
    });
  }
}

// Set horizontal alignment of crops within their card.
function applyCropAlignToCard(card, align) {
  card.querySelectorAll('.card-crop-item').forEach(function(item) {
    item.style.justifyContent = align === 'center' ? 'center' : 'flex-start';
  });
}

// Called by align-left / align-center buttons in edit mode.
function cropAlignBtn(btn, align) {
  var card = btn.closest('.expanded-card-wrapper');
  if (!card) return;
  card.dataset.cropAlign = align;
  applyCropAlignToCard(card, align);
  // Update active state on sibling align buttons
  card.querySelectorAll('.card-align-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.align === align);
  });
  var songId = card.dataset.songId;
  var exerciseId = card.dataset.exerciseId;
  if (songId && exerciseId) {
    fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropAlign: align })
    }).catch(console.error);
  }
}

// Toggle full-fit mode (card wraps to crop dimensions).
function cropFitToggle(btn) {
  var card = btn.closest('.expanded-card-wrapper');
  if (!card) return;
  var newFit = card.dataset.cropFit !== 'true';
  card.dataset.cropFit = String(newFit);
  btn.classList.toggle('active', newFit);
  if (newFit) {
    card.classList.add('crop-fit-full');
  } else {
    card.classList.remove('crop-fit-full');
  }
  var scale = parseFloat(card.dataset.cropScale) || 100;
  applyCropScaleToCard(card, scale);
  var songId = card.dataset.songId;
  var exerciseId = card.dataset.exerciseId;
  if (songId && exerciseId) {
    fetch('/api/songs/' + songId + '/exercises/' + exerciseId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropFit: newFit })
    }).catch(console.error);
  }
}

// Apply saved crop scales, alignment, and fit mode on page load.
function applyCropScales() {
  document.querySelectorAll('.expanded-card-wrapper').forEach(function(card) {
    var scale = parseFloat(card.dataset.cropScale) || 100;
    var align = card.dataset.cropAlign || 'left';
    var fit = card.dataset.cropFit === 'true';
    if (fit) card.classList.add('crop-fit-full');
    applyCropScaleToCard(card, scale);
    applyCropAlignToCard(card, align);
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

// ===== View Mode Segmented Control (placeholder) =====
function setViewMode(btn) {
  var container = btn.closest('.view-mode-segmented');
  if (!container) return;
  container.querySelectorAll('.view-mode-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  // TODO: re-render exercise list based on btn.dataset.mode
}

// ===== Section Filter Pills =====
function toggleSectionFilter(btn) {
  if (btn.disabled) return;
  var wasActive = btn.classList.contains('pill-active');
  // Deselect all pills
  btn.closest('.section-nav').querySelectorAll('.section-pill').forEach(function(p) {
    p.classList.remove('pill-active');
  });
  if (!wasActive) {
    btn.classList.add('pill-active');
    applySectionFilter(btn.dataset.sectionId);
  } else {
    clearSectionFilter();
  }
}

function applySectionFilter(sectionId) {
  document.querySelectorAll('.section-group').forEach(function(group) {
    var id = group.id.replace('section-', '');
    if (id === sectionId) {
      group.style.display = '';
      // Hide the section divider inside the active section (redundant when filtering)
      var divider = group.querySelector('.section-divider');
      if (divider) divider.style.display = 'none';
    } else {
      group.style.display = 'none';
    }
  });
}

function clearSectionFilter() {
  document.querySelectorAll('.section-group').forEach(function(group) {
    group.style.display = '';
    var divider = group.querySelector('.section-divider');
    if (divider) divider.style.display = '';
  });
  document.querySelectorAll('.section-pill.pill-active').forEach(function(p) {
    p.classList.remove('pill-active');
  });
}

// ===== Display Settings Drawer =====
function toggleDisplayDrawer() {
  var drawer = document.getElementById('display-settings-drawer');
  var btn = document.getElementById('display-toggle-btn');
  if (!drawer) return;
  var isOpen = drawer.style.display !== 'none';
  drawer.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isOpen);
}

// Close panels on Escape
(function() {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var panels = [
        { el: 'display-settings-drawer', btn: 'display-toggle-btn' },
        { el: 'song-notes-section', btn: 'notes-toggle-btn' },
        { el: 'metronome-panel', btn: 'metronome-toggle-btn' },
        { el: 'stats-panel', btn: 'stats-toggle-btn' }
      ];
      panels.forEach(function(p) {
        var el = document.getElementById(p.el);
        if (el && el.style.display !== 'none') {
          el.style.display = 'none';
          var btn = document.getElementById(p.btn);
          if (btn) btn.classList.remove('active');
        }
      });
    }
  });
})();

// ===== Card Scale Slider (placeholder) =====
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var slider = document.getElementById('card-scale-slider');
    var valueLabel = document.getElementById('card-scale-value');
    if (!slider || !valueLabel) return;
    slider.addEventListener('input', function() {
      valueLabel.textContent = slider.value + '%';
      // TODO: apply scale to crop images
    });
  });
})();

// ===== Card Alignment (placeholder) =====
function setCardAlignment(btn) {
  var container = btn.closest('.drawer-segmented-sm');
  if (!container) return;
  container.querySelectorAll('.seg-btn-sm').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  // TODO: apply alignment btn.dataset.align to exercise cards
}

// ===== Clean View Toggles (placeholder) =====
function toggleCleanView(key, checked) {
  var view = document.getElementById('exercise-view');
  if (!view) return;
  var cls = 'cv-hide-' + key;
  if (checked) {
    view.classList.remove(cls);
  } else {
    view.classList.add(cls);
  }
  // TODO: persist via PATCH /api/songs/{songId}/display
}

// ===== Smart Practice (placeholder) =====
function toggleSmartPractice(btn) {
  var isActive = btn.classList.toggle('active');
  // Deselect view mode segmented when smart practice is active
  if (isActive) {
    document.querySelectorAll('.view-mode-btn').forEach(function(b) {
      b.classList.remove('active');
    });
  } else {
    // Re-activate "Song order" as default
    var defaultBtn = document.querySelector('.view-mode-btn[data-mode="song-order"]');
    if (defaultBtn) defaultBtn.classList.add('active');
  }
  // TODO: reorder exercises based on recommendation algorithm
}

// ===== Progress Summary Bar =====
function toggleStats() {
  var panel = document.getElementById('stats-panel');
  var btn = document.getElementById('stats-toggle-btn');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isOpen);
}

// Keep old name as alias in case anything calls it
function toggleProgressExpand() { toggleStats(); }

// ===== Song Notes =====
function toggleSongNotes() {
  var section = document.getElementById('song-notes-section');
  var btn = document.getElementById('notes-toggle-btn');
  if (!section) return;
  var isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isOpen);
  if (!isOpen) {
    var ta = document.getElementById('song-notes-textarea');
    if (ta) ta.focus();
  }
}

// ===== Metronome =====
function toggleMetronome() {
  var panel = document.getElementById('metronome-panel');
  var btn = document.getElementById('metronome-toggle-btn');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'flex';
  if (btn) btn.classList.toggle('active', !isOpen);
}

function onMetronomeBpmChange(val) {
  var display = document.getElementById('metronome-bpm-display');
  if (display) display.textContent = val;
  // Update preset active states
  var panel = document.getElementById('metronome-panel');
  var baseBpm = panel ? parseInt(panel.dataset.defaultBpm) : 0;
  if (baseBpm > 0) {
    document.querySelectorAll('.metronome-preset-btn').forEach(function(btn) {
      var pct = parseInt(btn.textContent);
      var targetBpm = Math.round(baseBpm * pct / 100);
      btn.classList.toggle('active', parseInt(val) === targetBpm);
    });
  }
}

function setMetronomePercent(pct) {
  var panel = document.getElementById('metronome-panel');
  var baseBpm = panel ? parseInt(panel.dataset.defaultBpm) : 120;
  var bpm = Math.round(baseBpm * pct / 100);
  var slider = document.getElementById('metronome-slider');
  if (slider) { slider.value = bpm; }
  onMetronomeBpmChange(bpm);
  // Update preset buttons
  document.querySelectorAll('.metronome-preset-btn').forEach(function(btn) {
    btn.classList.toggle('active', parseInt(btn.textContent) === pct);
  });
}

function toggleMetronomePlay() {
  var btn = document.getElementById('metronome-play-btn');
  if (!btn) return;
  btn.classList.toggle('playing');
  // TODO: actual Web Audio API metronome implementation
}

function metronomeTap() {
  // TODO: tap tempo implementation
}

function setTimeSig(btn, sig) {
  btn.closest('.metronome-time-sig').querySelectorAll('.metronome-sig-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  // Update beat dots count
  var dotsContainer = document.getElementById('metronome-beat-dots');
  if (!dotsContainer) return;
  var beats = sig === '3/4' ? 3 : sig === '6/8' ? 6 : 4;
  dotsContainer.innerHTML = '';
  for (var i = 0; i < beats; i++) {
    var dot = document.createElement('span');
    dot.className = 'beat-dot';
    dotsContainer.appendChild(dot);
  }
}
