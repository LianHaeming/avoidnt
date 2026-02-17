// ===== Plan Designer =====
(function() {
  'use strict';

  const STANDARD_SECTIONS = ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'];
  const DIFFICULTY_LABELS = { 1:'Easiest', 2:'Easy', 3:'Medium', 4:'Hard', 5:'Hardest' };
  const STAGE_COLORS = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
  const DEFAULT_STAGE_COLOR = '#9ca3af';

  // State
  let mode, songId, createdAt;
  let songTitle = '', artist = '', tempo = null, youtubeUrl = null, spotifyUrl = null;
  let structure = [];
  let jobId = null, pageCount = 0;
  let exercises = [];
  let isDirty = false, saving = false;
  let zoom = 1;
  let existingExercises = [];
  let cropBgColor = null;
  let stageNames = ['Stage 1','Stage 2','Stage 3','Stage 4','Stage 5'];

  // Crop drawing state
  let selecting = false, dragStart = null, dragCurrent = null;

  // DOM refs
  let pagesScroll, pagesInner, uploadZone, selectionBoxEl;

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const root = document.getElementById('plan-designer');
    if (!root) return;

    mode = root.dataset.mode;
    songId = root.dataset.songId;
    createdAt = new Date().toISOString();

    // Parse stage names
    if (root.dataset.stageNames) {
      try { stageNames = JSON.parse(root.dataset.stageNames); } catch(e) {}
    }

    pagesScroll = document.getElementById('pd-pages');
    pagesInner = document.getElementById('pd-pages-inner');
    uploadZone = document.getElementById('pd-upload-zone');
    selectionBoxEl = document.getElementById('pd-selection-box');

    // Load existing song in edit mode
    if (mode === 'edit' && root.dataset.song) {
      try {
        const song = JSON.parse(root.dataset.song);
        loadFromSong(song);
      } catch(e) {
        console.error('Failed to parse song data', e);
      }
    }

    // Pointer events for crop drawing
    if (pagesScroll) {
      pagesScroll.addEventListener('pointerdown', onPointerDown);
      pagesScroll.addEventListener('pointermove', onPointerMove);
      pagesScroll.addEventListener('pointerup', onPointerUp);
    }

    renderHeader();
    renderSectionPills();
    updateSaveState();
    updateExerciseUI();
    updateAutoFillBtn();
  }

  // ===== Load existing song =====
  function loadFromSong(song) {
    songTitle = song.title || '';
    artist = song.artist || '';
    tempo = song.tempo;
    youtubeUrl = song.youtubeUrl;
    spotifyUrl = song.spotifyUrl;
    structure = (song.structure || []).map(s => ({ ...s }));
    jobId = song.jobId;
    pageCount = song.pageCount;
    createdAt = song.createdAt;
    existingExercises = song.exercises || [];
    cropBgColor = song.cropBgColor || null;

    renderHeader();
    renderSectionPills();
    renderCropToolbar();

    // Build exercise cards from existing
    let seq = 1;
    exercises = (song.exercises || [])
      .filter(ex => ex.crops && ex.crops.length > 0)
      .map(ex => {
        return {
          id: ex.id,
          crops: ex.crops.map(crop => ({
            cropId: crop.id,
            pageIndex: crop.pageIndex,
            rect: { ...crop.rect },
            previewDataUrl: null,
            previewBase64: null
          })),
          sequenceNumber: seq++,
          description: ex.name || '',
          sectionId: ex.sectionId,
          difficulty: ex.difficulty,
          cropScale: ex.cropScale || 100,
          isComplete: !!(ex.sectionId && ex.difficulty >= 1 && ex.difficulty <= 5)
        };
      });

    renderExercises();
    updateExerciseUI();

    // Load page images
    if (jobId && pageCount > 0) {
      loadPageImages(jobId, pageCount);
      exercises.forEach(card => {
        card.crops.forEach(crop => {
          loadCropPreview(songId, card, crop);
        });
      });
    }
    updateAutoFillBtn();
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  }

  // ===== WYSIWYG Header =====
  function renderHeader() {
    // Title
    var titleEl = document.getElementById('pd-title-display');
    if (titleEl && !titleEl.querySelector('.pd-inline-input')) {
      var textEl = titleEl.querySelector('.pd-display-text');
      if (textEl) {
        if (songTitle) {
          textEl.textContent = songTitle;
          textEl.classList.remove('pd-placeholder');
        } else {
          textEl.textContent = 'Song title';
          textEl.classList.add('pd-placeholder');
        }
      }
    }

    // Artist
    var artistEl = document.getElementById('pd-artist-display');
    if (artistEl && !artistEl.querySelector('.pd-inline-input')) {
      var textEl2 = artistEl.querySelector('.pd-display-text');
      if (textEl2) {
        if (artist) {
          textEl2.textContent = artist;
          textEl2.classList.remove('pd-placeholder');
        } else {
          textEl2.textContent = 'Artist';
          textEl2.classList.add('pd-placeholder');
        }
      }
    }

    // Tempo
    var tempoEl = document.getElementById('pd-tempo-display');
    if (tempoEl && !tempoEl.querySelector('.pd-inline-input')) {
      var textEl3 = tempoEl.querySelector('.pd-display-text');
      if (textEl3) {
        if (tempo) {
          textEl3.textContent = tempo + ' BPM';
          textEl3.classList.remove('pd-placeholder');
        } else {
          textEl3.textContent = 'BPM';
          textEl3.classList.add('pd-placeholder');
        }
      }
    }

    // YouTube
    var ytEl = document.getElementById('pd-youtube-display');
    if (ytEl && !ytEl.querySelector('.pd-inline-input')) {
      var textEl4 = ytEl.querySelector('.pd-display-text');
      if (textEl4) {
        if (youtubeUrl) {
          textEl4.textContent = 'YouTube';
          textEl4.classList.remove('pd-placeholder');
          ytEl.title = youtubeUrl;
        } else {
          textEl4.textContent = 'YouTube';
          textEl4.classList.add('pd-placeholder');
          ytEl.title = '';
        }
      }
    }

    // Spotify
    var spEl = document.getElementById('pd-spotify-display');
    if (spEl && !spEl.querySelector('.pd-inline-input')) {
      var textEl5 = spEl.querySelector('.pd-display-text');
      if (textEl5) {
        if (spotifyUrl) {
          textEl5.textContent = 'Spotify';
          textEl5.classList.remove('pd-placeholder');
          spEl.title = spotifyUrl;
        } else {
          textEl5.textContent = 'Spotify';
          textEl5.classList.add('pd-placeholder');
          spEl.title = '';
        }
      }
    }

    // Album art from Spotify
    if (spotifyUrl && window.fetchSpotifyThumbnail) {
      window.fetchSpotifyThumbnail(spotifyUrl).then(function(thumbUrl) {
        var artDiv = document.getElementById('pd-album-art');
        var artImg = document.getElementById('pd-album-art-img');
        if (artDiv && artImg && thumbUrl) {
          artImg.src = thumbUrl;
          artDiv.style.display = '';
        } else if (artDiv && !thumbUrl) {
          artDiv.style.display = 'none';
        }
      });
    } else {
      var artDiv = document.getElementById('pd-album-art');
      if (artDiv) artDiv.style.display = 'none';
    }
  }

  window.pdEditField = function(field) {
    var fieldMap = {
      title: { elId: 'pd-title-display', type: 'text', placeholder: 'Song title', getValue: function() { return songTitle; }, setValue: function(v) { songTitle = v; } },
      artist: { elId: 'pd-artist-display', type: 'text', placeholder: 'Artist', getValue: function() { return artist; }, setValue: function(v) { artist = v; } },
      tempo: { elId: 'pd-tempo-display', type: 'text', placeholder: 'BPM', inputmode: 'numeric', getValue: function() { return tempo || ''; }, setValue: function(v) { tempo = v ? parseFloat(v) : null; } },
      youtube: { elId: 'pd-youtube-display', type: 'url', placeholder: 'YouTube URL', getValue: function() { return youtubeUrl || ''; }, setValue: function(v) { youtubeUrl = v || null; } },
      spotify: { elId: 'pd-spotify-display', type: 'url', placeholder: 'Spotify URL', getValue: function() { return spotifyUrl || ''; }, setValue: function(v) { spotifyUrl = v || null; } }
    };

    var config = fieldMap[field];
    if (!config) return;

    var el = document.getElementById(config.elId);
    if (!el || el.querySelector('.pd-inline-input')) return;

    // Hide display content
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
      renderHeader();
      updateSaveState();
      if (field === 'spotify') renderHeader(); // re-fetch album art
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = config.getValue(); input.blur(); }
    });

    // Prevent parent onclick from re-triggering
    input.addEventListener('click', function(e) { e.stopPropagation(); });
  };

  // ===== Section Pills (WYSIWYG) =====
  function renderSectionPills() {
    var container = document.getElementById('pd-section-pills');
    if (!container) return;
    container.innerHTML = '';

    structure.forEach(function(sec, i) {
      var label = getSectionLabel(sec);
      // Compute color from exercises in this section
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
      pill.onclick = function() {
        var target = document.getElementById('pd-section-' + sec.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      var removeBtn = document.createElement('button');
      removeBtn.className = 'pd-pill-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.title = 'Remove ' + label;
      removeBtn.onclick = function(e) {
        e.stopPropagation();
        removeSection(i);
        renderSectionPills();
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
      pdTogglePopover();
    };
    container.appendChild(addPill);
  }

  function pdTogglePopover() {
    var popover = document.getElementById('pd-section-popover');
    if (!popover) return;
    popover.style.display = popover.style.display === 'none' ? 'flex' : 'none';
  }

  window.pdClosePopover = function() {
    var popover = document.getElementById('pd-section-popover');
    if (popover) popover.style.display = 'none';
    pdHideCustomInput();
  };

  // ===== Page Images =====
  function loadPageImages(jId, pCount) {
    if (uploadZone) uploadZone.style.display = 'none';
    if (pagesScroll) pagesScroll.style.display = 'flex';
    showZoomControls(true);

    pagesInner.innerHTML = '';
    for (let i = 1; i <= pCount; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      wrapper.dataset.pageIndex = i - 1;

      // Page label
      const label = document.createElement('span');
      label.className = 'page-label';
      label.textContent = 'Page ' + i;
      wrapper.appendChild(label);

      const container = document.createElement('div');
      container.className = 'page-image-container';

      const img = document.createElement('img');
      img.className = 'page-image';
      img.dataset.pageIndex = i - 1;
      img.src = '/api/pages/' + jId + '/' + i;
      img.alt = 'Page ' + i;
      img.loading = 'lazy';
      img.draggable = false;
      img.ondragstart = (e) => e.preventDefault();

      img.onload = () => {
        renderCropOverlays(container, i - 1, img);
      };

      container.appendChild(img);
      wrapper.appendChild(container);
      pagesInner.appendChild(wrapper);
    }

    updateHint();
    updateAutoFillBtn();
  }

  function showZoomControls(show) {
    const el = document.getElementById('pd-zoom-controls');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function updateHint() {
    const el = document.getElementById('pd-crop-hint');
    if (el) el.style.display = (jobId && exercises.length === 0) ? 'block' : 'none';
  }

  function renderCropOverlays(container, pageIndex, img) {
    container.querySelectorAll('.crop-overlay').forEach(el => el.remove());

    exercises.forEach(ex => {
      ex.crops.forEach(crop => {
        if (crop.pageIndex !== pageIndex) return;
        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';
        if (ex.isComplete) overlay.classList.add('complete');
        overlay.style.left = (crop.rect.x * 100) + '%';
        overlay.style.top = (crop.rect.y * 100) + '%';
        overlay.style.width = (crop.rect.w * 100) + '%';
        overlay.style.height = (crop.rect.h * 100) + '%';
        overlay.onclick = (e) => {
          e.stopPropagation();
          scrollToCard(ex.id);
        };
        overlay.onpointerdown = (e) => e.stopPropagation();

        const badge = document.createElement('span');
        badge.className = 'overlay-badge';
        badge.textContent = ex.sequenceNumber;
        overlay.appendChild(badge);

        container.appendChild(overlay);
      });
    });
  }

  function scrollToCard(id) {
    const card = document.getElementById('card-' + id);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Brief highlight
      card.style.outline = '2px solid #3b82f6';
      card.style.outlineOffset = '2px';
      setTimeout(() => { card.style.outline = ''; card.style.outlineOffset = ''; }, 1200);
      // Focus the title input for immediate editing
      var titleInput = card.querySelector('.card-title-edit');
      if (titleInput) setTimeout(function() { titleInput.focus(); }, 300);
    }
  }

  function loadCropPreview(sId, card, crop) {
    fetch('/api/songs/' + sId + '/preview/' + crop.cropId)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.blob();
      })
      .then(blob => {
        crop.previewDataUrl = URL.createObjectURL(blob);
        renderExercises();
      })
      .catch(() => {});
  }

  // ===== Crop Drawing =====
  function onPointerDown(event) {
    if (pageCount === 0 || !pagesScroll) return;
    if (event.button !== 0) return;
    if (event.target.closest('.crop-overlay')) return;

    event.preventDefault();
    event.stopPropagation();
    pagesScroll.setPointerCapture(event.pointerId);

    const point = toContainerPoint(event);
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
    const rect = pagesScroll.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + pagesScroll.scrollLeft,
      y: event.clientY - rect.top + pagesScroll.scrollTop
    };
  }

  function updateSelectionBox() {
    if (!dragStart || !dragCurrent || !selectionBoxEl) return;
    const left = Math.min(dragStart.x, dragCurrent.x);
    const top = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);
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

    const containerRect = pagesScroll.getBoundingClientRect();
    const scrollLeft = pagesScroll.scrollLeft;
    const scrollTop = pagesScroll.scrollTop;
    const selLeft = parseFloat(selectionBoxEl.style.left);
    const selTop = parseFloat(selectionBoxEl.style.top);
    const selW = parseFloat(selectionBoxEl.style.width);
    const selH = parseFloat(selectionBoxEl.style.height);
    const selRight = selLeft + selW;
    const selBottom = selTop + selH;

    const pageImages = pagesScroll.querySelectorAll('.page-image');
    var hitCrops = [];

    pageImages.forEach((img, idx) => {
      if (!img.complete || img.naturalWidth === 0) return;
      const pageIndex = parseInt(img.dataset.pageIndex || idx);
      const imgRect = img.getBoundingClientRect();
      const imgLeft = imgRect.left - containerRect.left + scrollLeft;
      const imgTop = imgRect.top - containerRect.top + scrollTop;
      const imgRight = imgLeft + imgRect.width;
      const imgBottom = imgTop + imgRect.height;

      if (selRight <= imgLeft || selLeft >= imgRight || selBottom <= imgTop || selTop >= imgBottom) return;

      const ix0 = Math.max(imgLeft, selLeft);
      const iy0 = Math.max(imgTop, selTop);
      const ix1 = Math.min(imgRight, selRight);
      const iy1 = Math.min(imgBottom, selBottom);
      const clipW = ix1 - ix0;
      const clipH = iy1 - iy0;
      if (clipW <= 0 || clipH <= 0) return;

      const localX = ix0 - imgLeft;
      const localY = iy0 - imgTop;
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;
      const sx = Math.floor(localX * scaleX);
      const sy = Math.floor(localY * scaleY);
      const sw = Math.floor(clipW * scaleX);
      const sh = Math.floor(clipH * scaleY);

      if (sw > 0 && sh > 0) {
        hitCrops.push({
          pageIndex, img, sx, sy, sw, sh,
          rect: {
            x: sx / img.naturalWidth,
            y: sy / img.naturalHeight,
            w: sw / img.naturalWidth,
            h: sh / img.naturalHeight
          }
        });
      }
    });

    // Limit to 2 consecutive pages
    if (hitCrops.length === 0) { clearSelection(); return; }
    hitCrops.sort((a, b) => a.pageIndex - b.pageIndex);
    if (hitCrops.length > 2) hitCrops = hitCrops.slice(0, 2);
    if (hitCrops.length === 2 && hitCrops[1].pageIndex - hitCrops[0].pageIndex !== 1) {
      hitCrops = [hitCrops[0]];
    }

    // Build combined preview by stitching crop canvases vertically
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

    var combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = maxW;
    combinedCanvas.height = totalH;
    var combinedCtx = combinedCanvas.getContext('2d');
    if (!combinedCtx) { clearSelection(); return; }
    var yOff = 0;
    for (var j = 0; j < canvases.length; j++) {
      combinedCtx.drawImage(canvases[j], 0, yOff);
      yOff += canvases[j].height;
    }
    var previewDataUrl = combinedCanvas.toDataURL('image/png');

    // Build crops array
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

    const newCard = {
      id: generateUuid(),
      crops: newCrops,
      previewDataUrl: previewDataUrl,
      sequenceNumber: exercises.length + 1,
      description: '',
      sectionId: '',
      difficulty: 1,
      cropScale: 100,
      isComplete: false
    };

    exercises.push(newCard);
    isDirty = true;
    clearSelection();

    renderExercises();
    updateExerciseUI();
    updateSaveState();
    refreshAllCropOverlays();
    updateHint();

    setTimeout(() => {
      const el = document.getElementById('card-' + newCard.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  // ===== Structure =====
  window.pdAddSection = function(type) {
    structure.push({
      id: generateUuid(),
      type: type.toLowerCase(),
      order: structure.length
    });
    isDirty = true;
    renderSectionPills();
    updateSaveState();
    updateExerciseOptions();
  };

  window.pdToggleCustomInput = function() {
    const row = document.getElementById('pd-custom-row');
    if (row) row.style.display = 'flex';
    const toggle = document.getElementById('pd-custom-toggle');
    if (toggle) toggle.style.display = 'none';
  };

  window.pdHideCustomInput = function() {
    const row = document.getElementById('pd-custom-row');
    if (row) row.style.display = 'none';
    const toggle = document.getElementById('pd-custom-toggle');
    if (toggle) toggle.style.display = '';
    const input = document.getElementById('pd-custom-name');
    if (input) input.value = '';
  };

  window.pdAddCustomSection = function() {
    const input = document.getElementById('pd-custom-name');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    pdAddSection(name);
    pdHideCustomInput();
  };

  function removeSection(index) {
    const removed = structure[index];
    structure.splice(index, 1);
    structure.forEach((s, i) => s.order = i);
    exercises.forEach(ex => {
      if (ex.sectionId === removed.id) {
        ex.sectionId = '';
        ex.isComplete = false;
      }
    });
    isDirty = true;
    renderSectionPills();
    renderExercises();
    updateSaveState();
  }

  function renderStructure() {
    renderSectionPills();
  }

  function getSectionLabel(section) {
    const cap = section.type.charAt(0).toUpperCase() + section.type.slice(1);
    const same = structure.filter(s => s.type === section.type);
    if (same.length <= 1) return cap;
    const occ = same.findIndex(s => s.id === section.id) + 1;
    return cap + ' (' + occ + ')';
  }

  // ===== Exercises =====

  function groupExercisesBySections() {
    var groups = [];
    // Build a group for each structure section in order
    structure.forEach(function(sec) {
      var secExercises = exercises.filter(function(ex) { return ex.sectionId === sec.id; });
      // Sort by sequenceNumber
      secExercises.sort(function(a, b) { return a.sequenceNumber - b.sequenceNumber; });
      var lowestDiff = 0;
      secExercises.forEach(function(ex) {
        var d = ex.difficulty || 0;
        if (d >= 1 && d <= 5) {
          if (lowestDiff === 0 || d < lowestDiff) lowestDiff = d;
        }
      });
      groups.push({
        section: sec,
        label: getSectionLabel(sec),
        exercises: secExercises,
        lowestStage: lowestDiff || 1
      });
    });
    // Unsorted group for exercises without a section
    var unsorted = exercises.filter(function(ex) { return !ex.sectionId; });
    unsorted.sort(function(a, b) { return a.sequenceNumber - b.sequenceNumber; });
    if (unsorted.length > 0) {
      groups.push({
        section: { id: '__unsorted', type: 'unsorted' },
        label: 'Unsorted',
        exercises: unsorted,
        lowestStage: 1
      });
    }
    return groups;
  }

  function hexToRGBA(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length !== 6) return 'rgba(156,163,175,' + alpha + ')';
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function renderExercises() {
    const list = document.getElementById('pd-exercise-list');
    if (!list) return;
    list.innerHTML = '';

    var groups = groupExercisesBySections();

    // Render each section group
    groups.forEach(function(g) {
      var groupHtml = '<div class="section-group" id="pd-section-' + g.section.id + '">';

      // Section divider
      groupHtml += '<div class="section-divider">';
      groupHtml += '<span class="section-line"></span>';
      groupHtml += '<span class="section-label">' + escHtml(g.label) + '</span>';
      groupHtml += '<span class="section-line"></span>';
      groupHtml += '</div>';

      if (g.exercises.length === 0) {
        groupHtml += '<p class="section-empty">No exercises</p>';
      } else {
        groupHtml += '<div class="expanded-list">';
        g.exercises.forEach(function(ex) {
          groupHtml += buildExerciseCard(ex);
        });
        groupHtml += '</div>';
      }

      groupHtml += '</div>';
      list.insertAdjacentHTML('beforeend', groupHtml);
    });

    // Re-bind drag-and-drop on wrappers
    list.querySelectorAll('.expanded-card-wrapper').forEach(function(wrapper) {
      var exId = wrapper.id.replace('card-', '');
      var idx = exercises.findIndex(function(e) { return e.id === exId; });
      wrapper.draggable = true;
      wrapper.ondragstart = function(e) { wrapper._exDragIdx = idx; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; };
      wrapper.ondragover = function(e) { e.preventDefault(); };
      wrapper.ondrop = function(e) {
        e.preventDefault();
        var fromI = null;
        list.querySelectorAll('.expanded-card-wrapper').forEach(function(el) {
          if (el._exDragIdx !== undefined) fromI = el._exDragIdx;
        });
        if (fromI !== null && fromI !== idx) {
          var updated = exercises.slice();
          var moved = updated.splice(fromI, 1)[0];
          updated.splice(idx, 0, moved);
          updated.forEach(function(ex, i) { ex.sequenceNumber = i + 1; });
          exercises = updated;
          isDirty = true;
          renderExercises();
          refreshAllCropOverlays();
        }
      };
    });

    updateExerciseUI();
  }

  function buildExerciseCard(ex) {
    var borderColor = STAGE_COLORS[ex.difficulty] || STAGE_COLORS[1] || DEFAULT_STAGE_COLOR;
    var cardLabel = ex.description || '';

    var html = '<div class="expanded-card-wrapper" id="card-' + ex.id + '">';

    // The visual card
    html += '<div class="expanded-card" style="border-left-color:' + borderColor + '">';
    var bgStyle = cropBgColor ? ' style="background:' + escAttr(cropBgColor) + '"' : '';
    html += '<div class="card-crop-area"' + bgStyle + '>';

    // Overlay header with editable title
    html += '<div class="card-overlay-header">';
    html += '<input type="text" class="card-title-edit" value="' + escAttr(cardLabel) + '" ' +
            'placeholder="e.g., Main riff, Bar 47-48" maxlength="100" ' +
            'oninput="pdSetDesc(\'' + ex.id + '\',this.value)" />';
    html += '</div>';

    // All crop images
    var scale = ex.cropScale || 100;
    var imgStyle = 'width:' + scale + '%';
    var isDark = cropBgColor && pdIsColorDark(cropBgColor);
    if (isDark) imgStyle += ';filter:invert(1);mix-blend-mode:difference';

    var hasCrops = false;
    ex.crops.forEach(function(crop) {
      var url = crop.previewDataUrl;
      if (url) {
        hasCrops = true;
        html += '<div class="card-crop-item"><img src="' + url + '" alt="Crop" class="card-crop-img" style="' + imgStyle + '" /></div>';
      }
    });
    if (!hasCrops) {
      var thumbUrl = ex.previewDataUrl || (ex.crops[0] && ex.crops[0].previewDataUrl);
      if (thumbUrl) {
        html += '<div class="card-crop-item"><img src="' + thumbUrl + '" alt="Crop" class="card-crop-img" style="' + imgStyle + '" /></div>';
      } else {
        html += '<div class="card-crop-placeholder"><span>🎵</span></div>';
      }
    }

    // Crop resize handle
    html += '<div class="card-crop-resize-handle pd-resize-handle" onmousedown="pdCropResizeStart(event,this)" ontouchstart="pdCropResizeStart(event,this)">';
    html += '<span class="resize-handle-bar"></span>';
    html += '</div>';

    html += '</div>'; // .card-crop-area
    html += '</div>'; // .expanded-card

    // Controls bar (matching song-detail style)
    html += '<div class="card-controls-bar" onclick="event.stopPropagation()">';

    // Stage select
    var stageColor = STAGE_COLORS[ex.difficulty] || DEFAULT_STAGE_COLOR;
    html += '<select class="card-stage-select" aria-label="Stage" style="color:' + stageColor + '" ' +
            'onchange="pdSetDifficulty(\'' + ex.id + '\',parseInt(this.value))">';
    for (var d = 1; d <= 5; d++) {
      html += '<option value="' + d + '"' + (ex.difficulty === d ? ' selected' : '') + '>' + escHtml(stageNames[d - 1]) + '</option>';
    }
    html += '</select>';

    // Section select
    html += '<select class="card-section-select" onchange="pdSetSection(\'' + ex.id + '\',this.value)">';
    html += '<option value="" disabled' + (!ex.sectionId ? ' selected' : '') + '>Section…</option>';
    structure.forEach(function(sec) {
      var sl = getSectionLabel(sec);
      html += '<option value="' + sec.id + '"' + (ex.sectionId === sec.id ? ' selected' : '') + '>' + escHtml(sl) + '</option>';
    });
    html += '</select>';

    // Delete button
    html += '<button class="card-delete-btn" onclick="event.stopPropagation();pdDeleteExercise(\'' + ex.id + '\')" title="Delete exercise">✕</button>';

    html += '</div>'; // .card-controls-bar

    html += '</div>'; // .expanded-card-wrapper
    return html;
  }

  function updateExerciseUI() {
    const emptyEl = document.getElementById('pd-exercises-empty');
    const listEl = document.getElementById('pd-exercise-list');
    const badgeEl = document.getElementById('pd-exercise-badge');

    if (exercises.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
      if (listEl) listEl.style.display = 'none';
      if (badgeEl) badgeEl.style.display = 'none';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      if (listEl) listEl.style.display = '';
      if (badgeEl) badgeEl.style.display = '';

      const done = exercises.filter(e => e.isComplete).length;
      const allDone = exercises.length > 0 && done === exercises.length;
      const countEl = document.getElementById('pd-exercise-count');

      if (badgeEl) {
        badgeEl.className = 'progress-badge' + (allDone ? ' complete' : '');
      }
      if (countEl) {
        countEl.textContent = allDone
          ? 'All ' + exercises.length + ' labeled \u2713'
          : done + ' of ' + exercises.length;
      }
    }
  }

  function updateExerciseOptions() {
    renderExercises();
  }

  window.pdDeleteExercise = function(id) {
    exercises = exercises.filter(e => e.id !== id);
    exercises.forEach((e, i) => e.sequenceNumber = i + 1);
    isDirty = true;
    renderExercises();
    updateSaveState();
    refreshAllCropOverlays();
    updateHint();
  };

  window.pdSetDesc = function(id, value) {
    const ex = exercises.find(e => e.id === id);
    if (ex) { ex.description = value; isDirty = true; }
  };

  window.pdSetSection = function(id, sectionId) {
    const ex = exercises.find(e => e.id === id);
    if (ex) {
      ex.sectionId = sectionId;
      updateCompleteness(ex);
      isDirty = true;
      renderExercises();
      renderSectionPills();
      updateSaveState();
      refreshAllCropOverlays();
    }
  };

  window.pdSetDifficulty = function(id, val) {
    const ex = exercises.find(e => e.id === id);
    if (ex) {
      ex.difficulty = parseInt(val) || 0;
      updateCompleteness(ex);
      isDirty = true;
      renderExercises();
      renderSectionPills();
      updateSaveState();
    }
  };

  function updateCompleteness(ex) {
    ex.isComplete = !!(ex.sectionId && ex.difficulty >= 1);
  }

  function refreshAllCropOverlays() {
    const wrappers = pagesInner ? pagesInner.querySelectorAll('.page-wrapper') : [];
    wrappers.forEach(wrapper => {
      const container = wrapper.querySelector('.page-image-container');
      const img = wrapper.querySelector('.page-image');
      const pi = parseInt(wrapper.dataset.pageIndex || 0);
      if (container && img) renderCropOverlays(container, pi, img);
    });
  }

  // ===== Crop Display Controls =====

  function pdIsColorDark(hex) {
    if (!hex || hex.length < 4) return false;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }

  function renderCropToolbar() {
    var toolbar = document.getElementById('pd-crop-toolbar');
    if (!toolbar) return;
    // Update active swatch
    toolbar.querySelectorAll('.color-swatch').forEach(function(s) {
      var c = s.dataset.color || '';
      s.classList.toggle('active', c === (cropBgColor || ''));
    });
  }

  window.pdSetCropBgColor = function(swatch, color) {
    cropBgColor = color || null;
    isDirty = true;
    updateSaveState();

    // Update active state
    var toolbar = document.getElementById('pd-crop-toolbar');
    if (toolbar) {
      toolbar.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
    }
    if (swatch) swatch.classList.add('active');

    // Re-render exercises with new bg
    renderExercises();
  };

  window.pdSetCropBgColorCustom = function(input) {
    cropBgColor = input.value || null;
    isDirty = true;
    updateSaveState();
    var toolbar = document.getElementById('pd-crop-toolbar');
    if (toolbar) {
      toolbar.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
    }
    renderExercises();
  };

  // Crop resize drag
  var _pdResizeState = null;

  window.pdCropResizeStart = function(event, handle) {
    event.preventDefault();
    event.stopPropagation();
    var card = handle.closest('.expanded-card-wrapper');
    if (!card) return;
    var cropArea = card.querySelector('.card-crop-area');
    if (!cropArea) return;

    var exId = card.id.replace('card-', '');
    var ex = exercises.find(function(e) { return e.id === exId; });
    if (!ex) return;

    var startY = event.type === 'touchstart' ? event.touches[0].clientY : event.clientY;
    var startHeight = cropArea.offsetHeight;
    var startScale = ex.cropScale || 100;

    _pdResizeState = { card: card, cropArea: cropArea, ex: ex, startY: startY, startHeight: startHeight, startScale: startScale };

    document.addEventListener('mousemove', pdCropResizeMove);
    document.addEventListener('mouseup', pdCropResizeEnd);
    document.addEventListener('touchmove', pdCropResizeMove, { passive: false });
    document.addEventListener('touchend', pdCropResizeEnd);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  function pdCropResizeMove(event) {
    if (!_pdResizeState) return;
    event.preventDefault();
    var clientY = event.type === 'touchmove' ? event.touches[0].clientY : event.clientY;
    var deltaY = clientY - _pdResizeState.startY;
    var ratio = (_pdResizeState.startHeight + deltaY) / _pdResizeState.startHeight;
    var newScale = Math.round(Math.max(30, Math.min(300, _pdResizeState.startScale * ratio)));

    _pdResizeState.ex.cropScale = newScale;
    _pdResizeState.card.querySelectorAll('.card-crop-img').forEach(function(img) {
      img.style.width = newScale + '%';
    });
  }

  function pdCropResizeEnd() {
    if (!_pdResizeState) return;
    isDirty = true;
    updateSaveState();
    _pdResizeState = null;
    document.removeEventListener('mousemove', pdCropResizeMove);
    document.removeEventListener('mouseup', pdCropResizeEnd);
    document.removeEventListener('touchmove', pdCropResizeMove);
    document.removeEventListener('touchend', pdCropResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // ===== Upload =====
  window.pdOnDrop = function(event) {
    event.preventDefault();
    if (uploadZone) uploadZone.classList.remove('drag-over');
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        doUpload(file);
      } else {
        showUploadError('Please upload a PDF file');
      }
    }
  };

  window.pdOnFileSelected = function(event) {
    const input = event.target;
    if (input.files && input.files.length > 0) doUpload(input.files[0]);
  };

  function doUpload(file) {
    showUploadError('');
    const progressEl = document.getElementById('pd-upload-progress');
    if (uploadZone) uploadZone.style.display = 'none';
    if (progressEl) progressEl.style.display = 'flex';

    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/convert', { method: 'POST', body: formData })
      .then(res => {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      })
      .then(data => {
        if (progressEl) progressEl.style.display = 'none';
        exercises = [];
        jobId = data.id;
        pageCount = data.pageCount;
        if (!songTitle) {
          songTitle = file.name.replace(/\.pdf$/i, '');
          renderHeader();
        }
        isDirty = true;
        loadPageImages(data.id, data.pageCount);
        renderExercises();
        updateExerciseUI();
        updateSaveState();
        updateAutoFillBtn();
      })
      .catch(err => {
        if (progressEl) progressEl.style.display = 'none';
        if (uploadZone) uploadZone.style.display = '';
        showUploadError(err.message || 'Upload failed');
      });
  }

  function showUploadError(msg) {
    const el = document.getElementById('pd-upload-error');
    const msgEl = document.getElementById('pd-upload-error-msg');
    if (el && msgEl) {
      msgEl.textContent = msg;
      el.style.display = msg ? 'flex' : 'none';
    }
  }

  // ===== AI Auto-fill =====
  window.pdAutoFill = async function() {
    if (!jobId || pageCount === 0) return;
    const btn = document.getElementById('pd-autofill-btn');
    const errEl = document.getElementById('pd-analyze-error');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-small"></span> Analyzing\u2026'; }
    if (errEl) errEl.style.display = 'none';

    try {
      const pageImages = [];
      const limit = Math.min(pageCount, 4);
      const imgs = pagesInner ? pagesInner.querySelectorAll('.page-image') : [];

      for (let i = 0; i < limit && i < imgs.length; i++) {
        const img = imgs[i];
        if (!img.complete || img.naturalWidth === 0) continue;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        pageImages.push(canvas.toDataURL('image/jpeg', 0.8));
      }

      if (pageImages.length === 0) throw new Error('No page images available');

      const res = await fetch('/api/analyze-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageImages })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Analysis failed (' + res.status + ')');
      }

      const result = await res.json();

      if (result.title && !songTitle.trim()) { songTitle = result.title; }
      if (result.artist && !artist.trim()) { artist = result.artist; }
      if (result.tempo !== null && result.tempo !== undefined && tempo === null) { tempo = result.tempo; }
      renderHeader();

      if (result.sections && result.sections.length > 0 && structure.length === 0) {
        structure = result.sections.map((name, i) => ({
          id: generateUuid(),
          type: name.toLowerCase().replace(/\s*\d+\s*$/, '').trim(),
          order: i
        }));
        renderSectionPills();
      }

      isDirty = true;
      updateSaveState();
    } catch(err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '\u2728 Auto-fill with AI'; }
      updateAutoFillBtn();
    }
  };

  function updateAutoFillBtn() {
    const btn = document.getElementById('pd-autofill-btn');
    const section = document.getElementById('pd-autofill-section');
    if (btn) btn.disabled = !(jobId && pageCount > 0);
    if (section) section.style.display = (jobId && pageCount > 0) ? '' : 'none';
  }

  // ===== Zoom =====
  window.pdZoom = function(delta) {
    zoom = Math.max(0.5, Math.min(3, zoom + delta));
    const label = document.getElementById('pd-zoom-label');
    if (label) label.textContent = Math.round(zoom * 100) + '%';
    if (pagesInner) {
      pagesInner.style.transform = 'scale(' + zoom + ')';
      pagesInner.style.transformOrigin = 'top center';
    }
  };

  // ===== Save =====
  function updateSaveState() {
    const hintEl = document.getElementById('pd-missing-msg');
    if (hintEl) hintEl.style.display = 'none';

    const btn = document.getElementById('pd-save-btn');
    if (btn) {
      btn.disabled = saving;
      btn.title = 'Save song';
    }
  }

  window.pdSave = async function() {
    if (saving) return;
    saving = true;
    updateSaveState();

    const btn = document.getElementById('pd-save-btn');
    if (btn) btn.innerHTML = '<span class="spinner-small"></span> Saving...';

    const songExercises = exercises.map(card => {
      const existing = existingExercises.find(e => e.id === card.id);
      return {
        id: card.id,
        name: card.description.trim() || 'Exercise ' + card.sequenceNumber,
        sectionId: card.sectionId,
        difficulty: card.difficulty,
        stage: existing ? existing.stage : 1,
        crops: card.crops.map(crop => ({
          id: crop.cropId,
          pageIndex: crop.pageIndex,
          rect: crop.rect,
          previewBase64: crop.previewBase64 || undefined
        })),
        cropScale: card.cropScale !== 100 ? card.cropScale : undefined,
        totalPracticedSeconds: existing ? existing.totalPracticedSeconds : 0,
        totalReps: existing ? existing.totalReps : 0,
        lastPracticedAt: existing ? existing.lastPracticedAt : null,
        createdAt: existing ? existing.createdAt : new Date().toISOString()
      };
    });

    const song = {
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
      cropBgColor: cropBgColor || undefined,
      createdAt: createdAt
    };

    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Save failed');
      }
      isDirty = false;
      location.href = '/songs/' + songId;
    } catch(err) {
      const errEl = document.getElementById('pd-save-error');
      if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
    } finally {
      saving = false;
      if (btn) btn.textContent = 'Save';
      updateSaveState();
    }
  };

  window.pdDiscard = function() {
    if (isDirty) {
      if (!confirm('Discard changes?\n\nYou have unsaved changes. Are you sure you want to leave?')) return;
    }
    if (mode === 'edit') {
      location.href = '/songs/' + songId;
    } else {
      location.href = '/songs';
    }
  };

  // ===== Helpers =====
  function generateUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escAttr(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Warn on unsaved changes
  window.addEventListener('beforeunload', function(e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();

// ===== Resizable Panels =====
(function() {
  'use strict';
  var MIN_WIDTH = 320;
  var MAX_WIDTH = 1200;

  document.querySelectorAll('.col-resize-handle').forEach(function(handle) {
    var dragging = false;
    var startX, startWidth, panel;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      panel = document.getElementById('col-editor');
      if (!panel) return;

      dragging = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    handle.addEventListener('dblclick', function(e) {
      e.preventDefault();
      panel = document.getElementById('col-editor');
      if (!panel) return;
      var halfWidth = Math.round(window.innerWidth * 0.5);
      halfWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, halfWidth));
      panel.style.width = halfWidth + 'px';
    });

    function onMove(e) {
      if (!dragging) return;
      var delta = startX - e.clientX;
      var newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      panel.style.width = newWidth + 'px';
    }

    function onUp() {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  });
})();
