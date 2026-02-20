// ===== Song Edit Mode (inline on song-detail page) =====
(function() {
  'use strict';

  const STAGE_COLORS = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
  const STAGE_BORDER_COLORS = { 1:'rgba(239,68,68,0.35)', 2:'rgba(249,115,22,0.35)', 3:'rgba(234,179,8,0.35)', 4:'rgba(132,204,22,0.35)', 5:'rgba(34,197,94,0.35)' };
  const DEFAULT_STAGE_COLOR = '#9ca3af';
  const DEFAULT_STAGE_BORDER = 'rgba(156,163,175,0.35)';

  // State
  let editing = false;
  let songId = '';
  let songTitle = '', artist = '', tempo = null, youtubeUrl = null, spotifyUrl = null;
  let structure = [];
  let exercises = [];
  let existingExercises = []; // original exercises w/ practice data
  let jobId = null, pageCount = 0;
  let createdAt = '';
  let isDirty = false, saving = false;
  let zoom = 1;
  let pdfVisible = false;
  let stageNames = ['Stage 1','Stage 2','Stage 3','Stage 4','Stage 5'];

  // Crop drawing state
  let selecting = false, dragStart = null, dragCurrent = null;

  // DOM refs
  let pagesScroll, pagesInner, uploadZone, selectionBoxEl;

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const root = document.getElementById('exercise-view');
    if (!root) return;

    songId = root.dataset.songId || '';
    if (!songId) return; // not a song detail page

    // Parse stage names
    if (root.dataset.stageNames) {
      try { stageNames = JSON.parse(root.dataset.stageNames); } catch(e) {}
    }

    // Parse song data
    if (root.dataset.song) {
      try {
        const song = JSON.parse(root.dataset.song);
        loadFromSong(song);
      } catch(e) {
        console.error('Failed to parse song data for edit mode', e);
      }
    }

    // If page loaded in edit mode (via ?edit=1), enter edit mode
    if (root.dataset.editMode === 'true') {
      enterEditMode();
    }

    pagesScroll = document.getElementById('se-pages');
    pagesInner = document.getElementById('se-pages-inner');
    uploadZone = document.getElementById('se-upload-zone');
    selectionBoxEl = document.getElementById('se-selection-box');

    // PDF resize handle
    initPdfResizeHandle();
  }

  function loadFromSong(song) {
    songTitle = song.title || '';
    artist = song.artist || '';
    tempo = song.tempo;
    youtubeUrl = song.youtubeUrl || null;
    spotifyUrl = song.spotifyUrl || null;
    structure = (song.structure || []).map(function(s) { return { id: s.id, type: s.type, order: s.order }; });
    jobId = song.jobId || null;
    pageCount = song.pageCount || 0;
    createdAt = song.createdAt || new Date().toISOString();
    existingExercises = (song.exercises || []).map(function(ex) { return Object.assign({}, ex); });

    // Build internal exercise representation
    let seq = 1;
    exercises = existingExercises.map(function(ex) {
      return {
        id: ex.id,
        crops: (ex.crops || []).map(function(c) {
          return {
            cropId: c.id,
            pageIndex: c.pageIndex,
            rect: c.rect ? { x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h } : null,
            previewDataUrl: null,
            previewBase64: null
          };
        }),
        sequenceNumber: seq++,
        description: ex.name || '',
        sectionId: ex.sectionId || '',
        difficulty: ex.difficulty || 1,
        cropScale: ex.cropScale || 100,
        stage: ex.stage || 1,
        totalPracticedSeconds: ex.totalPracticedSeconds || 0,
        totalReps: ex.totalReps || 0,
        lastPracticedAt: ex.lastPracticedAt || null,
        createdAt: ex.createdAt || new Date().toISOString()
      };
    });
  }

  // ===== Toggle Edit Mode =====
  window.seToggleEditMode = function() {
    if (editing) {
      exitEditMode();
    } else {
      enterEditMode();
    }
  };

  function enterEditMode() {
    editing = true;
    isDirty = false;

    const root = document.getElementById('exercise-view');
    if (root) root.classList.add('edit-mode');

    // Show edit-only elements, hide view-only elements
    toggleEditVisibility(true);

    // Render section pills for editing
    renderSectionPills();

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('edit', '1');
    history.replaceState(null, '', url.toString());

    // Show autofill btn if we have a PDF
    updateAutoFillBtn();

    // Set selected sections in exercise card dropdowns
    updateExerciseSectionSelects();

    // Activate nav guard
    window._navGuard = function(navUrl) {
      if (isDirty) {
        showConfirmModal('You have unsaved changes. Are you sure you want to leave?', 'Leave', 'danger', function() {
          isDirty = false;
          location.href = navUrl;
        });
      } else {
        location.href = navUrl;
      }
    };
  }

  function exitEditMode() {
    if (isDirty) {
      showConfirmModal('You have unsaved changes. Discard them?', 'Discard', 'danger', function() {
        isDirty = false;
        doExitEditMode();
      });
      return;
    }
    doExitEditMode();
  }

  function doExitEditMode() {
    editing = false;

    const root = document.getElementById('exercise-view');
    if (root) root.classList.remove('edit-mode');

    // Hide edit elements, show view elements
    toggleEditVisibility(false);

    // Hide PDF panel
    if (pdfVisible) {
      seTogglePdf();
    }

    // Update URL
    const url = new URL(window.location);
    url.searchParams.delete('edit');
    history.replaceState(null, '', url.toString());

    // Remove nav guard
    window._navGuard = null;
  }

  function toggleEditVisibility(isEdit) {
    // Toggle se-view-text / se-edit-text
    document.querySelectorAll('.se-view-text').forEach(function(el) {
      el.style.display = isEdit ? 'none' : '';
    });
    document.querySelectorAll('.se-edit-text').forEach(function(el) {
      el.style.display = isEdit ? '' : 'none';
    });

    // Toggle se-view-only / se-edit-only
    document.querySelectorAll('.se-view-only').forEach(function(el) {
      el.style.display = isEdit ? 'none' : '';
    });
    document.querySelectorAll('.se-edit-only').forEach(function(el) {
      el.style.display = isEdit ? '' : 'none';
    });

    // Toggle practice / edit controls
    document.querySelectorAll('.se-practice-controls').forEach(function(el) {
      el.style.display = isEdit ? 'none' : '';
    });
    document.querySelectorAll('.se-edit-controls').forEach(function(el) {
      el.style.display = isEdit ? '' : 'none';
    });

    // Section nav wrapper (edit mode sections)
    var sectionNav = document.getElementById('se-section-nav-wrapper');
    if (sectionNav) sectionNav.style.display = isEdit ? '' : 'none';

    // Edit toolbar
    var toolbar = document.getElementById('se-edit-toolbar');
    if (toolbar) toolbar.style.display = isEdit ? 'flex' : 'none';

    // Edit toggle button icons
    var editIcon = document.querySelector('#edit-toggle-btn .icon-edit');
    var checkIcon = document.querySelector('#edit-toggle-btn .icon-check');
    if (editIcon) editIcon.style.display = isEdit ? 'none' : '';
    if (checkIcon) checkIcon.style.display = isEdit ? '' : 'none';

    // Empty state CTA changes
    var emptyState = document.getElementById('se-empty-state');
    if (emptyState && isEdit) {
      emptyState.querySelector('h3').textContent = 'No Exercises Yet';
      emptyState.querySelector('p').textContent = 'Upload a PDF and draw crops to create exercises';
    }
  }

  // ===== WYSIWYG Header Editing =====
  window.seEditField = function(field) {
    if (!editing) return;

    var fieldMap = {
      title:   { elId: 'se-title-display',   type: 'text', placeholder: 'Song title', getValue: function() { return songTitle; }, setValue: function(v) { songTitle = v; } },
      artist:  { elId: 'se-artist-display',   type: 'text', placeholder: 'Artist', getValue: function() { return artist; }, setValue: function(v) { artist = v; } },
      tempo:   { elId: 'se-tempo-display',    type: 'text', placeholder: 'BPM', inputmode: 'numeric', getValue: function() { return tempo || ''; }, setValue: function(v) { tempo = v ? parseFloat(v) : null; } },
      youtube: { elId: 'se-youtube-display',  type: 'url', placeholder: 'YouTube URL', getValue: function() { return youtubeUrl || ''; }, setValue: function(v) { youtubeUrl = v || null; } },
      spotify: { elId: 'se-spotify-display',  type: 'url', placeholder: 'Spotify URL', getValue: function() { return spotifyUrl || ''; }, setValue: function(v) { spotifyUrl = v || null; } }
    };

    var config = fieldMap[field];
    if (!config) return;

    // For title/artist, the edit text span is inside the h1/p
    var el;
    if (field === 'title' || field === 'artist') {
      el = document.querySelector('#' + config.elId + ' .se-edit-text');
    } else {
      el = document.getElementById(config.elId);
    }
    if (!el || el.querySelector('.pd-inline-input')) return;

    var textEl = el.querySelector('.pd-display-text');
    var iconEl = el.querySelector('.pd-edit-icon');
    if (textEl) textEl.style.display = 'none';
    if (iconEl) iconEl.style.display = 'none';

    var input = document.createElement('input');
    input.type = config.type;
    input.className = 'pd-inline-input';
    input.placeholder = config.placeholder;
    input.value = config.getValue();
    if (config.inputmode) { input.inputMode = config.inputmode; input.style.width = '80px'; }
    el.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      config.setValue(input.value.trim());
      isDirty = true;
      input.remove();
      if (textEl) textEl.style.display = '';
      if (iconEl) iconEl.style.display = '';
      updateHeaderDisplay(field);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = config.getValue(); input.blur(); }
    });
    input.addEventListener('click', function(e) { e.stopPropagation(); });
  };

  function updateHeaderDisplay(field) {
    if (field === 'title') {
      var el = document.querySelector('#se-title-display .se-edit-text .pd-display-text');
      if (el) {
        el.textContent = songTitle || 'Song title';
        el.classList.toggle('pd-placeholder', !songTitle);
      }
    }
    if (field === 'artist') {
      var el = document.querySelector('#se-artist-display .se-edit-text .pd-display-text');
      if (el) {
        el.textContent = artist || 'Artist';
        el.classList.toggle('pd-placeholder', !artist);
      }
    }
    if (field === 'tempo') {
      var el = document.querySelector('#se-tempo-display .pd-display-text');
      if (el) {
        el.textContent = tempo ? tempo + ' BPM' : 'BPM';
        el.classList.toggle('pd-placeholder', !tempo);
      }
    }
    if (field === 'youtube') {
      var el = document.querySelector('#se-youtube-display .pd-display-text');
      if (el) el.classList.toggle('pd-placeholder', !youtubeUrl);
    }
    if (field === 'spotify') {
      var el = document.querySelector('#se-spotify-display .pd-display-text');
      if (el) el.classList.toggle('pd-placeholder', !spotifyUrl);
      // Re-fetch album art
      if (spotifyUrl && window.fetchSpotifyThumbnail) {
        window.fetchSpotifyThumbnail(spotifyUrl).then(function(thumbUrl) {
          var artDiv = document.getElementById('song-album-art');
          var artImg = document.getElementById('song-album-art-img');
          if (artDiv && artImg && thumbUrl) { artImg.src = thumbUrl; artDiv.style.display = ''; }
        });
      }
    }
  }

  // ===== Section Management =====
  function renderSectionPills() {
    var container = document.getElementById('se-section-pills');
    if (!container) return;
    container.innerHTML = '';

    structure.forEach(function(sec, i) {
      var label = getSectionLabel(sec);
      var secExercises = exercises.filter(function(ex) { return ex.sectionId === sec.id; });
      var lowestDiff = 0;
      secExercises.forEach(function(ex) {
        var d = ex.difficulty || 0;
        if (d >= 1 && d <= 5) {
          if (lowestDiff === 0 || d < lowestDiff) lowestDiff = d;
        }
      });
      var stageNum = lowestDiff || 1;
      var color = STAGE_COLORS[stageNum] || DEFAULT_STAGE_COLOR;
      var tint = hexToRGBA(color, 0.1);
      var border = hexToRGBA(color, 0.35);

      var wrap = document.createElement('span');
      wrap.className = 'pd-section-pill-wrap';

      var pill = document.createElement('button');
      pill.className = 'section-pill';
      pill.style.background = tint;
      pill.style.borderColor = border;
      pill.style.color = color;
      pill.textContent = label;
      pill.title = label;

      var removeBtn = document.createElement('button');
      removeBtn.className = 'pd-pill-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.title = 'Remove ' + label;
      removeBtn.onclick = function(e) {
        e.stopPropagation();
        removeSection(i);
      };

      wrap.appendChild(pill);
      wrap.appendChild(removeBtn);
      container.appendChild(wrap);
    });

    // Add "+" pill
    var addPill = document.createElement('button');
    addPill.className = 'section-pill pd-add-section-pill';
    addPill.textContent = '+';
    addPill.title = 'Add section';
    addPill.onclick = function(e) {
      e.stopPropagation();
      seTogglePopover();
    };
    container.appendChild(addPill);
  }

  function seTogglePopover() {
    var popover = document.getElementById('se-section-popover');
    if (!popover) return;
    popover.style.display = popover.style.display === 'none' ? 'flex' : 'none';
  }

  window.seClosePopover = function() {
    var popover = document.getElementById('se-section-popover');
    if (popover) popover.style.display = 'none';
    seHideCustomInput();
  };

  window.seAddSection = function(type) {
    structure.push({
      id: generateUuid(),
      type: type.toLowerCase(),
      order: structure.length
    });
    isDirty = true;
    renderSectionPills();
    updateExerciseSectionSelects();
  };

  window.seToggleCustomInput = function() {
    var row = document.getElementById('se-custom-row');
    if (row) row.style.display = 'flex';
    var toggle = document.getElementById('se-custom-toggle');
    if (toggle) toggle.style.display = 'none';
    var input = document.getElementById('se-custom-name');
    if (input) input.focus();
  };

  function seHideCustomInput() {
    var row = document.getElementById('se-custom-row');
    if (row) row.style.display = 'none';
    var toggle = document.getElementById('se-custom-toggle');
    if (toggle) toggle.style.display = '';
    var input = document.getElementById('se-custom-name');
    if (input) input.value = '';
  }

  window.seAddCustomSection = function() {
    var input = document.getElementById('se-custom-name');
    var name = input ? input.value.trim() : '';
    if (!name) return;
    seAddSection(name);
    seHideCustomInput();
  };

  function removeSection(index) {
    var removed = structure[index];
    structure.splice(index, 1);
    structure.forEach(function(s, i) { s.order = i; });
    exercises.forEach(function(ex) {
      if (ex.sectionId === removed.id) {
        ex.sectionId = '';
      }
    });
    isDirty = true;
    renderSectionPills();
    updateExerciseSectionSelects();
  }

  function getSectionLabel(section) {
    var cap = section.type.charAt(0).toUpperCase() + section.type.slice(1);
    var same = structure.filter(function(s) { return s.type === section.type; });
    if (same.length <= 1) return cap;
    var occ = same.findIndex(function(s) { return s.id === section.id; }) + 1;
    return cap + ' (' + occ + ')';
  }

  function updateExerciseSectionSelects() {
    // Update the section <select> in each card's edit controls
    document.querySelectorAll('.se-edit-controls .card-section-select').forEach(function(sel) {
      var currentVal = sel.value;
      // Remove all options except first
      while (sel.options.length > 1) sel.remove(1);
      // Add structure options
      structure.forEach(function(sec) {
        var opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = getSectionLabel(sec);
        if (sec.id === currentVal) opt.selected = true;
        sel.appendChild(opt);
      });
    });
  }

  // ===== Exercise Edit Functions =====
  window.seSetDesc = function(id, value) {
    var ex = exercises.find(function(e) { return e.id === id; });
    if (ex) { ex.description = value; isDirty = true; }
  };

  window.seSetDifficulty = function(id, val) {
    var ex = exercises.find(function(e) { return e.id === id; });
    if (ex) {
      ex.difficulty = parseInt(val) || 1;
      isDirty = true;
      // Update card border color
      var card = document.getElementById('card-' + id);
      if (card) {
        var innerCard = card.querySelector('.expanded-card');
        if (innerCard) innerCard.style.borderLeftColor = STAGE_BORDER_COLORS[ex.difficulty] || DEFAULT_STAGE_BORDER;
        var sel = card.querySelector('.se-edit-controls .card-stage-select');
        if (sel) sel.style.color = STAGE_COLORS[ex.difficulty] || DEFAULT_STAGE_COLOR;
      }
      renderSectionPills();
    }
  };

  window.seSetSection = function(id, sectionId) {
    var ex = exercises.find(function(e) { return e.id === id; });
    if (ex) {
      ex.sectionId = sectionId;
      isDirty = true;
      renderSectionPills();
    }
  };

  window.seDeleteExercise = function(id) {
    showConfirmModal('Are you sure you want to remove this exercise?', 'Remove', 'danger', function() {
      exercises = exercises.filter(function(e) { return e.id !== id; });
      exercises.forEach(function(e, i) { e.sequenceNumber = i + 1; });
      isDirty = true;
      // Remove card from DOM
      var card = document.getElementById('card-' + id);
      if (card) card.remove();
      renderSectionPills();
      refreshAllCropOverlays();
    });
  };

  // ===== PDF Panel =====
  window.seTogglePdf = function() {
    var panel = document.getElementById('edit-pdf-panel');
    if (!panel) return;

    pdfVisible = !pdfVisible;
    panel.style.display = pdfVisible ? 'flex' : 'none';

    var btn = document.getElementById('se-pdf-toggle-btn');
    if (btn) {
      var label = btn.querySelector('span');
      if (label) label.textContent = pdfVisible ? 'Hide PDF' : 'Show PDF';
    }

    if (pdfVisible && jobId && pageCount > 0 && pagesInner && pagesInner.children.length === 0) {
      loadPageImages(jobId, pageCount);
    }

    if (pdfVisible && (!jobId || pageCount === 0)) {
      if (uploadZone) uploadZone.style.display = '';
    }

    // Attach pointer events for crop drawing
    if (pdfVisible && pagesScroll) {
      pagesScroll.addEventListener('pointerdown', onPointerDown);
      pagesScroll.addEventListener('pointermove', onPointerMove);
      pagesScroll.addEventListener('pointerup', onPointerUp);
    }
  };

  // ===== PDF Upload =====
  window.seOnDrop = function(event) {
    event.preventDefault();
    if (uploadZone) uploadZone.classList.remove('drag-over');
    var files = event.dataTransfer && event.dataTransfer.files;
    if (files && files.length > 0) {
      var file = files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        doUpload(file);
      } else {
        showUploadError('Please upload a PDF file');
      }
    }
  };

  window.seOnFileSelected = function(event) {
    var input = event.target;
    if (input.files && input.files.length > 0) doUpload(input.files[0]);
  };

  function doUpload(file) {
    showUploadError('');
    var progressEl = document.getElementById('se-upload-progress');
    if (uploadZone) uploadZone.style.display = 'none';
    if (progressEl) progressEl.style.display = 'flex';

    var formData = new FormData();
    formData.append('file', file);

    fetch('/api/convert', { method: 'POST', body: formData })
      .then(function(res) {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      })
      .then(function(data) {
        if (progressEl) progressEl.style.display = 'none';
        jobId = data.id;
        pageCount = data.pageCount;
        if (!songTitle) {
          songTitle = file.name.replace(/\.pdf$/i, '');
          updateHeaderDisplay('title');
        }
        isDirty = true;
        loadPageImages(data.id, data.pageCount);
        updateAutoFillBtn();
      })
      .catch(function(err) {
        if (progressEl) progressEl.style.display = 'none';
        if (uploadZone) uploadZone.style.display = '';
        showUploadError(err.message || 'Upload failed');
      });
  }

  function showUploadError(msg) {
    var el = document.getElementById('se-upload-error');
    var msgEl = document.getElementById('se-upload-error-msg');
    if (el && msgEl) {
      msgEl.textContent = msg;
      el.style.display = msg ? 'flex' : 'none';
    }
  }

  // ===== Page Images =====
  function loadPageImages(jId, pCount) {
    if (uploadZone) uploadZone.style.display = 'none';
    if (pagesScroll) pagesScroll.style.display = 'flex';
    showZoomControls(true);

    pagesInner.innerHTML = '';
    for (var i = 1; i <= pCount; i++) {
      var wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.dataset.pageIndex = i - 1;

      var label = document.createElement('span');
      label.className = 'page-label';
      label.textContent = 'Page ' + i;
      wrapper.appendChild(label);

      var container = document.createElement('div');
      container.className = 'page-image-container';

      var img = document.createElement('img');
      img.className = 'page-image';
      img.dataset.pageIndex = i - 1;
      img.src = '/api/pages/' + jId + '/' + i;
      img.alt = 'Page ' + i;
      img.loading = 'lazy';
      img.draggable = false;
      img.ondragstart = function(e) { e.preventDefault(); };
      (function(cont, pi) {
        img.onload = function() { renderCropOverlays(cont, pi, img); };
      })(container, i - 1);

      container.appendChild(img);
      wrapper.appendChild(container);
      pagesInner.appendChild(wrapper);
    }
  }

  function showZoomControls(show) {
    var el = document.getElementById('se-zoom-controls');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  window.seZoom = function(delta) {
    zoom = Math.max(0.5, Math.min(3, zoom + delta));
    var label = document.getElementById('se-zoom-label');
    if (label) label.textContent = Math.round(zoom * 100) + '%';
    if (pagesInner) {
      pagesInner.style.transform = 'scale(' + zoom + ')';
      pagesInner.style.transformOrigin = 'top center';
    }
  };

  // ===== Crop Overlays =====
  function renderCropOverlays(container, pageIndex, img) {
    container.querySelectorAll('.crop-overlay').forEach(function(el) { el.remove(); });

    exercises.forEach(function(ex) {
      ex.crops.forEach(function(crop) {
        if (crop.pageIndex !== pageIndex) return;
        if (!crop.rect) return;
        var overlay = document.createElement('div');
        overlay.className = 'crop-overlay';
        overlay.style.left = (crop.rect.x * 100) + '%';
        overlay.style.top = (crop.rect.y * 100) + '%';
        overlay.style.width = (crop.rect.w * 100) + '%';
        overlay.style.height = (crop.rect.h * 100) + '%';
        overlay.onclick = function(e) {
          e.stopPropagation();
          scrollToCard(ex.id);
        };
        overlay.onpointerdown = function(e) { e.stopPropagation(); };

        var badge = document.createElement('span');
        badge.className = 'overlay-badge';
        badge.textContent = ex.sequenceNumber;
        overlay.appendChild(badge);

        container.appendChild(overlay);
      });
    });
  }

  function refreshAllCropOverlays() {
    if (!pagesInner) return;
    var wrappers = pagesInner.querySelectorAll('.page-wrapper');
    wrappers.forEach(function(wrapper) {
      var container = wrapper.querySelector('.page-image-container');
      var img = wrapper.querySelector('.page-image');
      var pi = parseInt(wrapper.dataset.pageIndex || 0);
      if (container && img) renderCropOverlays(container, pi, img);
    });
  }

  function scrollToCard(id) {
    var card = document.getElementById('card-' + id);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.style.outline = '2px solid #3b82f6';
      card.style.outlineOffset = '2px';
      setTimeout(function() { card.style.outline = ''; card.style.outlineOffset = ''; }, 1200);
    }
  }

  // ===== Crop Drawing =====
  function onPointerDown(event) {
    if (pageCount === 0 || !pagesScroll) return;
    if (event.button !== 0) return;
    if (event.target.closest('.crop-overlay')) return;

    event.preventDefault();
    event.stopPropagation();
    pagesScroll.setPointerCapture(event.pointerId);

    var point = toContainerPoint(event);
    selecting = true;
    dragStart = point;
    dragCurrent = point;
    updateSelectionBox();
  }

  function onPointerMove(event) {
    if (!selecting) return;
    dragCurrent = toContainerPoint(event);
    updateSelectionBox();
  }

  function onPointerUp(event) {
    if (!selecting) return;
    pagesScroll.releasePointerCapture(event.pointerId);
    selecting = false;
    dragCurrent = toContainerPoint(event);
    updateSelectionBox();

    if (selectionBoxEl && (parseInt(selectionBoxEl.style.width) < 10 || parseInt(selectionBoxEl.style.height) < 10)) {
      clearSelection();
      return;
    }
    addCropFromSelection();
  }

  function toContainerPoint(event) {
    var rect = pagesScroll.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + pagesScroll.scrollLeft,
      y: event.clientY - rect.top + pagesScroll.scrollTop
    };
  }

  function updateSelectionBox() {
    if (!dragStart || !dragCurrent || !selectionBoxEl) return;
    var left = Math.min(dragStart.x, dragCurrent.x);
    var top = Math.min(dragStart.y, dragCurrent.y);
    var width = Math.abs(dragCurrent.x - dragStart.x);
    var height = Math.abs(dragCurrent.y - dragStart.y);
    selectionBoxEl.style.display = 'block';
    selectionBoxEl.style.left = left + 'px';
    selectionBoxEl.style.top = top + 'px';
    selectionBoxEl.style.width = width + 'px';
    selectionBoxEl.style.height = height + 'px';
  }

  function clearSelection() {
    selecting = false;
    dragStart = null;
    dragCurrent = null;
    if (selectionBoxEl) selectionBoxEl.style.display = 'none';
  }

  function addCropFromSelection() {
    if (!selectionBoxEl || !pagesScroll) { clearSelection(); return; }

    var containerRect = pagesScroll.getBoundingClientRect();
    var scrollLeft = pagesScroll.scrollLeft;
    var scrollTop = pagesScroll.scrollTop;
    var selLeft = parseFloat(selectionBoxEl.style.left);
    var selTop = parseFloat(selectionBoxEl.style.top);
    var selW = parseFloat(selectionBoxEl.style.width);
    var selH = parseFloat(selectionBoxEl.style.height);
    var selRight = selLeft + selW;
    var selBottom = selTop + selH;

    var pageImages = pagesScroll.querySelectorAll('.page-image');
    var hitCrops = [];

    pageImages.forEach(function(img, idx) {
      if (!img.complete || img.naturalWidth === 0) return;
      var pageIndex = parseInt(img.dataset.pageIndex || idx);
      var imgRect = img.getBoundingClientRect();
      var imgLeft = imgRect.left - containerRect.left + scrollLeft;
      var imgTop = imgRect.top - containerRect.top + scrollTop;
      var imgRight = imgLeft + imgRect.width;
      var imgBottom = imgTop + imgRect.height;

      if (selRight <= imgLeft || selLeft >= imgRight || selBottom <= imgTop || selTop >= imgBottom) return;

      var ix0 = Math.max(imgLeft, selLeft);
      var iy0 = Math.max(imgTop, selTop);
      var ix1 = Math.min(imgRight, selRight);
      var iy1 = Math.min(imgBottom, selBottom);
      var clipW = ix1 - ix0;
      var clipH = iy1 - iy0;
      if (clipW <= 0 || clipH <= 0) return;

      var localX = ix0 - imgLeft;
      var localY = iy0 - imgTop;
      var scaleX = img.naturalWidth / imgRect.width;
      var scaleY = img.naturalHeight / imgRect.height;
      var sx = Math.floor(localX * scaleX);
      var sy = Math.floor(localY * scaleY);
      var sw = Math.floor(clipW * scaleX);
      var sh = Math.floor(clipH * scaleY);

      if (sw > 0 && sh > 0) {
        hitCrops.push({
          pageIndex: pageIndex, img: img, sx: sx, sy: sy, sw: sw, sh: sh,
          rect: {
            x: sx / img.naturalWidth,
            y: sy / img.naturalHeight,
            w: sw / img.naturalWidth,
            h: sh / img.naturalHeight
          }
        });
      }
    });

    if (hitCrops.length === 0) { clearSelection(); return; }
    hitCrops.sort(function(a, b) { return a.pageIndex - b.pageIndex; });
    if (hitCrops.length > 2) hitCrops = hitCrops.slice(0, 2);
    if (hitCrops.length === 2 && hitCrops[1].pageIndex - hitCrops[0].pageIndex !== 1) {
      hitCrops = [hitCrops[0]];
    }

    // Build crop canvases
    var canvases = [];
    var totalH = 0;
    var maxW = 0;
    for (var i = 0; i < hitCrops.length; i++) {
      var c = hitCrops[i];
      var cvs = document.createElement('canvas');
      cvs.width = c.sw; cvs.height = c.sh;
      var cx = cvs.getContext('2d');
      if (!cx) { clearSelection(); return; }
      cx.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, 0, 0, c.sw, c.sh);
      canvases.push(cvs);
      totalH += c.sh;
      if (c.sw > maxW) maxW = c.sw;
    }

    var newCrops = hitCrops.map(function(c, ci) {
      var cropCanvas = canvases[ci];
      var cropDataUrl = cropCanvas.toDataURL('image/png');
      return {
        cropId: generateUuid(),
        pageIndex: c.pageIndex,
        rect: c.rect,
        previewDataUrl: cropDataUrl,
        previewBase64: cropDataUrl.split(',')[1]
      };
    });

    var newCard = {
      id: generateUuid(),
      crops: newCrops,
      sequenceNumber: exercises.length + 1,
      description: '',
      sectionId: '',
      difficulty: 1,
      cropScale: 100,
      stage: 1,
      totalPracticedSeconds: 0,
      totalReps: 0,
      lastPracticedAt: null,
      createdAt: new Date().toISOString()
    };

    exercises.push(newCard);
    isDirty = true;
    clearSelection();

    // Add card to DOM
    addExerciseCardToDOM(newCard);
    refreshAllCropOverlays();

    setTimeout(function() {
      var el = document.getElementById('card-' + newCard.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  function addExerciseCardToDOM(ex) {
    // Remove empty state if present
    var emptyState = document.getElementById('se-empty-state');
    if (emptyState) emptyState.remove();

    var container = document.getElementById('se-exercises-container');
    if (!container) return;

    // Find or create the unsorted section group
    var targetGroup = container.querySelector('.section-group:last-child .expanded-list');
    if (!targetGroup) {
      // Create a flat section group
      var groupDiv = document.createElement('div');
      groupDiv.className = 'section-group';
      groupDiv.id = 'section-new';
      var listDiv = document.createElement('div');
      listDiv.className = 'expanded-list';
      groupDiv.appendChild(listDiv);
      container.appendChild(groupDiv);
      targetGroup = listDiv;
    }

    var borderColor = STAGE_BORDER_COLORS[ex.difficulty] || DEFAULT_STAGE_BORDER;

    var html = '<div class="expanded-card-wrapper" id="card-' + ex.id + '"' +
      ' data-song-id="' + songId + '" data-exercise-id="' + ex.id + '"' +
      ' data-section-id="" data-stage="1" data-difficulty="1"' +
      ' data-crop-scale="100" data-total-seconds="0" data-total-reps="0">';

    html += '<div class="expanded-card" style="border-left-color:' + borderColor + '">';
    html += '<div class="card-crop-area">';

    html += '<div class="card-overlay-header">';
    html += '<h3 class="card-title-name se-view-text" style="display:none"></h3>';
    html += '<input type="text" class="card-title-edit se-edit-text" value="" placeholder="e.g., Main riff" maxlength="100"' +
      ' oninput="seSetDesc(\'' + ex.id + '\',this.value)" onclick="event.stopPropagation()" />';
    html += '</div>';

    // Show crop previews
    ex.crops.forEach(function(crop) {
      if (crop.previewDataUrl) {
        html += '<div class="card-crop-item"><img src="' + crop.previewDataUrl + '" alt="Crop" class="card-crop-img" loading="lazy" /></div>';
      }
    });

    // Resize handle
    html += '<div class="card-crop-resize-handle se-edit-only" onmousedown="cropResizeStart(event,this)" ontouchstart="cropResizeStart(event,this)">';
    html += '<span class="resize-handle-bar"></span>';
    html += '</div>';

    html += '</div></div>'; // .card-crop-area + .expanded-card

    // Practice controls (hidden in edit mode)
    html += '<div class="card-controls-bar se-practice-controls" style="display:none" onclick="event.stopPropagation()">';
    html += '<select class="card-stage-select" aria-label="Stage" style="color:' + DEFAULT_STAGE_COLOR + '">';
    for (var s = 1; s <= 5; s++) {
      html += '<option value="' + s + '"' + (s === 1 ? ' selected' : '') + '>' + escHtml(stageNames[s - 1]) + '</option>';
    }
    html += '</select>';
    html += '<span class="card-timer-display">0:00</span>';
    html += '</div>';

    // Edit controls (visible)
    html += '<div class="card-controls-bar se-edit-controls" onclick="event.stopPropagation()">';
    html += '<select class="card-stage-select" aria-label="Difficulty" style="color:' + (STAGE_COLORS[1] || DEFAULT_STAGE_COLOR) + '"' +
      ' onchange="seSetDifficulty(\'' + ex.id + '\',parseInt(this.value))">';
    for (var d = 1; d <= 5; d++) {
      html += '<option value="' + d + '"' + (d === 1 ? ' selected' : '') + '>' + escHtml(stageNames[d - 1]) + '</option>';
    }
    html += '</select>';

    html += '<select class="card-section-select" onchange="seSetSection(\'' + ex.id + '\',this.value)">';
    html += '<option value="" disabled selected>Section…</option>';
    structure.forEach(function(sec) {
      html += '<option value="' + sec.id + '">' + escHtml(getSectionLabel(sec)) + '</option>';
    });
    html += '</select>';

    html += '<button class="card-delete-btn" onclick="event.stopPropagation();seDeleteExercise(\'' + ex.id + '\')">Remove</button>';
    html += '<button class="card-zoom-btn" onclick="event.stopPropagation();cropZoomBtn(this,-10)" title="Zoom out">−</button>';
    html += '<button class="card-zoom-btn" onclick="event.stopPropagation();cropZoomBtn(this,10)" title="Zoom in">+</button>';
    html += '</div>';

    html += '</div>'; // .expanded-card-wrapper

    targetGroup.insertAdjacentHTML('beforeend', html);
  }

  // ===== Auto-fill =====
  window.seAutoFill = async function() {
    if (!jobId || pageCount === 0) return;
    var btn = document.getElementById('se-autofill-btn');
    var errEl = document.getElementById('se-save-error');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-small"></span> Analyzing\u2026'; }
    if (errEl) errEl.style.display = 'none';

    try {
      // Collect page images
      var pageImages = [];
      var imgs = pagesInner ? pagesInner.querySelectorAll('.page-image') : [];
      var maxPages = Math.min(imgs.length, 10);

      for (var i = 0; i < maxPages; i++) {
        var img = imgs[i];
        if (!img.complete || img.naturalWidth === 0) continue;
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        pageImages.push(canvas.toDataURL('image/jpeg', 0.8));
      }

      if (pageImages.length === 0) throw new Error('No page images available');

      // Analyze PDF for metadata
      var metadataRes = await fetch('/api/analyze-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageImages: pageImages })
      });

      if (!metadataRes.ok) {
        var metaBody = await metadataRes.json().catch(function() { return null; });
        throw new Error((metaBody && metaBody.error) || 'Analysis failed');
      }

      var metadata = await metadataRes.json();

      // Apply metadata (only fill empty fields)
      if (metadata.title && !songTitle.trim()) { songTitle = metadata.title; updateHeaderDisplay('title'); }
      if (metadata.artist && !artist.trim()) { artist = metadata.artist; updateHeaderDisplay('artist'); }
      if (metadata.tempo && tempo === null) { tempo = metadata.tempo; updateHeaderDisplay('tempo'); }

      if (metadata.sections && metadata.sections.length > 0 && structure.length === 0) {
        structure = metadata.sections.map(function(name, i) {
          return { id: generateUuid(), type: name.toLowerCase().replace(/\s*\d+\s*$/, '').trim(), order: i };
        });
        renderSectionPills();
        updateExerciseSectionSelects();
      }

      isDirty = true;

      // Label exercises if any
      if (exercises.length > 0 && structure.length > 0) {
        if (btn) btn.innerHTML = '<span class="spinner-small"></span> Labeling\u2026';

        var exerciseInputs = exercises.map(function(ex) {
          return {
            id: ex.id,
            crops: ex.crops.map(function(c) { return { pageIndex: c.pageIndex, rect: c.rect }; }),
            currentName: ex.description || '',
            currentSectionId: ex.sectionId || '',
            currentDifficulty: ex.difficulty || 0
          };
        });

        var labelResp = await fetch('/api/label-exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songTitle: songTitle || '',
            artist: artist || '',
            pageImages: pageImages,
            sections: structure.map(function(s) { return { id: s.id, type: s.type, order: s.order }; }),
            exercises: exerciseInputs
          })
        });

        if (labelResp.ok) {
          var labelResult = await labelResp.json();
          (labelResult.exercises || []).forEach(function(labelEx) {
            if (labelEx.confidence === 'low') return;
            var ex = exercises.find(function(e) { return e.id === labelEx.id; });
            if (!ex) return;
            if (labelEx.name && !ex.description) ex.description = labelEx.name;
            if (labelEx.sectionId && !ex.sectionId) {
              if (structure.some(function(s) { return s.id === labelEx.sectionId; })) {
                ex.sectionId = labelEx.sectionId;
              }
            }
          });

          // Update card inputs
          exercises.forEach(function(ex) {
            var card = document.getElementById('card-' + ex.id);
            if (!card) return;
            var titleInput = card.querySelector('.card-title-edit');
            if (titleInput && ex.description) titleInput.value = ex.description;
            var sectionSelect = card.querySelector('.se-edit-controls .card-section-select');
            if (sectionSelect && ex.sectionId) sectionSelect.value = ex.sectionId;
          });

          renderSectionPills();
        }
      }

    } catch(err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '\u2728 Auto-fill'; }
      updateAutoFillBtn();
    }
  };

  function updateAutoFillBtn() {
    var btn = document.getElementById('se-autofill-btn');
    if (btn) {
      btn.disabled = !(jobId && pageCount > 0);
      btn.style.display = (jobId && pageCount > 0) ? '' : 'none';
    }
  }

  // ===== Save =====
  window.seSave = async function() {
    if (saving) return;
    saving = true;

    var btn = document.getElementById('se-save-btn');
    if (btn) btn.innerHTML = '<span class="spinner-small"></span> Saving...';

    var songExercises = exercises.map(function(card) {
      var existing = existingExercises.find(function(e) { return e.id === card.id; });
      return {
        id: card.id,
        name: card.description.trim() || 'Exercise ' + card.sequenceNumber,
        sectionId: card.sectionId,
        difficulty: card.difficulty,
        stage: existing ? (existing.stage || card.stage) : card.stage,
        crops: card.crops.map(function(crop) {
          return {
            id: crop.cropId,
            pageIndex: crop.pageIndex,
            rect: crop.rect,
            previewBase64: crop.previewBase64 || undefined
          };
        }),
        cropScale: card.cropScale !== 100 ? card.cropScale : undefined,
        totalPracticedSeconds: existing ? existing.totalPracticedSeconds : card.totalPracticedSeconds,
        totalReps: existing ? existing.totalReps : card.totalReps,
        lastPracticedAt: existing ? existing.lastPracticedAt : card.lastPracticedAt,
        createdAt: existing ? existing.createdAt : card.createdAt
      };
    });

    var song = {
      id: songId,
      title: songTitle.trim(),
      artist: artist.trim(),
      tempo: tempo,
      youtubeUrl: youtubeUrl,
      spotifyUrl: spotifyUrl,
      jobId: jobId,
      pageCount: pageCount,
      structure: structure,
      exercises: songExercises,
      createdAt: createdAt
    };

    try {
      var res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      });
      if (!res.ok) {
        var body = await res.json().catch(function() { return null; });
        throw new Error((body && body.error) || 'Save failed');
      }
      isDirty = false;
      // Reload the page to reflect saved state
      location.href = '/songs/' + songId;
    } catch(err) {
      var errEl = document.getElementById('se-save-error');
      if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
    } finally {
      saving = false;
      if (btn) btn.textContent = 'Save';
    }
  };

  // ===== Delete =====
  window.seShowDeleteModal = function() {
    showConfirmModal('Are you sure you want to delete this song? This cannot be undone.', 'Delete', 'danger', function() {
      fetch('/api/songs/' + songId, { method: 'DELETE' })
        .then(function(res) {
          if (res.ok) {
            isDirty = false;
            location.href = '/songs';
          } else {
            alert('Failed to delete song');
          }
        })
        .catch(function(err) { console.error(err); alert('Failed to delete song'); });
    });
  };

  // ===== Confirm Modal =====
  function showConfirmModal(message, confirmLabel, style, onConfirm) {
    var backdrop = document.getElementById('confirm-modal-backdrop');
    var msgEl = document.getElementById('confirm-modal-msg');
    var confirmBtn = document.getElementById('confirm-modal-confirm');
    var cancelBtn = document.getElementById('confirm-modal-cancel');
    if (!backdrop || !msgEl || !confirmBtn || !cancelBtn) return;

    msgEl.textContent = message;
    confirmBtn.textContent = confirmLabel || 'Confirm';
    confirmBtn.className = 'confirm-modal-btn confirm' + (style === 'danger' ? ' danger' : '');
    backdrop.style.display = 'flex';

    function cleanup() {
      backdrop.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirmClick);
      cancelBtn.removeEventListener('click', onCancelClick);
      backdrop.removeEventListener('click', onBackdropClick);
    }
    function onConfirmClick() { cleanup(); onConfirm(); }
    function onCancelClick() { cleanup(); }
    function onBackdropClick(e) { if (e.target === backdrop) cleanup(); }

    confirmBtn.addEventListener('click', onConfirmClick);
    cancelBtn.addEventListener('click', onCancelClick);
    backdrop.addEventListener('click', onBackdropClick);
  }

  // ===== PDF Panel Resize Handle =====
  function initPdfResizeHandle() {
    var handle = document.getElementById('edit-pdf-resize-handle');
    if (!handle) return;

    var dragging = false;
    var startX, startWidth, panel;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      panel = document.getElementById('edit-pdf-panel');
      if (!panel) return;
      dragging = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      var delta = e.clientX - startX;
      var newWidth = Math.min(1200, Math.max(280, startWidth + delta));
      panel.style.width = newWidth + 'px';
    }

    function onUp() {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  // ===== Warn on unsaved changes =====
  window.addEventListener('beforeunload', function(e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ===== Helpers =====
  function generateUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function hexToRGBA(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length !== 6) return 'rgba(156,163,175,' + alpha + ')';
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function escHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escAttr(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
