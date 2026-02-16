// ===== Plan Designer =====
(function() {
  'use strict';

  const STANDARD_SECTIONS = ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'];
  const DIFFICULTY_LABELS = { 1:'Easiest', 2:'Easy', 3:'Medium', 4:'Hard', 5:'Hardest' };

  // State
  let mode, songId, createdAt;
  let songTitle = '', artist = '', tempo = null, youtubeUrl = null, spotifyUrl = null;
  let structure = [];
  let jobId = null, pageCount = 0;
  let exercises = [];
  let selectedExerciseId = null;
  let isDirty = false, saving = false;
  let zoom = 1;
  let existingExercises = [];

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

    pagesScroll = document.getElementById('pd-pages');
    pagesInner = document.getElementById('pd-pages-inner');
    uploadZone = document.getElementById('pd-upload-zone');
    selectionBoxEl = document.getElementById('pd-selection-box');

    // Bind form inputs
    bindInput('pd-title', v => { songTitle = v; isDirty = true; updateSaveState(); });
    bindInput('pd-artist', v => { artist = v; isDirty = true; updateSaveState(); });
    bindInput('pd-tempo', v => { tempo = v ? parseFloat(v) : null; isDirty = true; updateSaveState(); });
    bindInput('pd-youtube', v => { youtubeUrl = v || null; isDirty = true; });
    bindInput('pd-spotify', v => { spotifyUrl = v || null; isDirty = true; });

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

    updateSaveState();
    updateExerciseUI();
    updateAutoFillBtn();
  }

  function bindInput(id, onChange) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => onChange(el.value));
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

    // Populate form fields
    setVal('pd-title', songTitle);
    setVal('pd-artist', artist);
    setVal('pd-tempo', tempo);
    setVal('pd-youtube', youtubeUrl || '');
    setVal('pd-spotify', spotifyUrl || '');

    renderStructure();

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
        if (ex.id === selectedExerciseId) overlay.classList.add('selected');
        if (ex.isComplete) overlay.classList.add('complete');
        overlay.style.left = (crop.rect.x * 100) + '%';
        overlay.style.top = (crop.rect.y * 100) + '%';
        overlay.style.width = (crop.rect.w * 100) + '%';
        overlay.style.height = (crop.rect.h * 100) + '%';
        overlay.onclick = (e) => {
          e.stopPropagation();
          selectExercise(ex.id);
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
      // Per-crop preview: first crop gets the combined preview for the card thumbnail
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
      difficulty: 0,
      isComplete: false
    };

    exercises.push(newCard);
    selectedExerciseId = newCard.id;
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
    renderStructure();
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
    renderStructure();
    renderExercises();
    updateSaveState();
  }

  function renderStructure() {
    const containerEl = document.getElementById('pd-structure-list');
    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (structure.length === 0) {
      containerEl.innerHTML = '<div class="structure-empty"><span>No sections added yet.</span></div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'structure-list';

    structure.forEach((sec, i) => {
      const row = document.createElement('div');
      row.className = 'structure-row';
      row.draggable = true;
      row.ondragstart = () => { row._dragIdx = i; };
      row.ondragover = (e) => e.preventDefault();
      row.ondrop = (e) => {
        e.preventDefault();
        const items = list.querySelectorAll('.structure-row');
        let fromI = null;
        items.forEach(el => { if (el._dragIdx !== undefined) fromI = el._dragIdx; });
        if (fromI !== null && fromI !== i) {
          const moved = structure.splice(fromI, 1)[0];
          structure.splice(i, 0, moved);
          structure.forEach((s, idx) => s.order = idx);
          isDirty = true;
          renderStructure();
          updateExerciseOptions();
        }
      };

      const label = getSectionLabel(sec);
      row.innerHTML =
        '<span class="drag-handle" title="Drag to reorder">⠿</span>' +
        '<span class="section-label-text">' + escHtml(label) + '</span>' +
        '<button class="remove-btn" title="Remove section">✕</button>';
      row.querySelector('.remove-btn').onclick = (e) => { e.stopPropagation(); removeSection(i); };
      list.appendChild(row);
    });

    containerEl.appendChild(list);
  }

  function getSectionLabel(section) {
    const cap = section.type.charAt(0).toUpperCase() + section.type.slice(1);
    const same = structure.filter(s => s.type === section.type);
    if (same.length <= 1) return cap;
    const occ = same.findIndex(s => s.id === section.id) + 1;
    return cap + ' (' + occ + ')';
  }

  // ===== Exercises =====
  function selectExercise(id) {
    selectedExerciseId = selectedExerciseId === id ? null : id;
    renderExercises();
    refreshAllCropOverlays();
  }

  function renderExercises() {
    const list = document.getElementById('pd-exercise-list');
    if (!list) return;
    list.innerHTML = '';

    exercises.forEach((ex, i) => {
      const card = document.createElement('div');
      card.className = 'exercise-card';
      card.id = 'card-' + ex.id;
      if (ex.id === selectedExerciseId) card.classList.add('selected');
      card.classList.add(ex.isComplete ? 'complete' : 'incomplete');

      const label = getCardLabel(ex);
      const isExpanded = ex.id === selectedExerciseId;

      // Collapsed row
      let html = '<div class="card-collapsed" onclick="pdSelectExercise(\'' + ex.id + '\')">';
      html += '<span class="drag-handle" title="Drag to reorder">⠿</span>';
      html += '<span class="card-number">#' + ex.sequenceNumber + '</span>';
      var thumbUrl = ex.previewDataUrl || (ex.crops[0] && ex.crops[0].previewDataUrl);
      if (thumbUrl) {
        html += '<div class="card-thumb-small"><img src="' + thumbUrl + '" alt="Crop" /></div>';
      }
      html += '<span class="card-name">';
      if (label) {
        html += escHtml(label);
      } else {
        html += '<span class="unnamed">(no label)</span>';
      }
      html += '</span>';
      html += '<span class="card-status">';
      if (ex.isComplete) {
        html += '<span class="status-dot-complete" title="Complete">✓</span>';
      } else {
        html += '<span class="status-dot-incomplete" title="Incomplete">●</span>';
      }
      html += '</span>';
      html += '</div>';

      // Expanded section
      if (isExpanded) {
        html += '<div class="card-expanded" onclick="event.stopPropagation()">';

        var expandThumb = ex.previewDataUrl || (ex.crops[0] && ex.crops[0].previewDataUrl);
        if (expandThumb) {
          html += '<div class="card-thumb-large">';
          html += '<img src="' + expandThumb + '" alt="Crop preview" />';
          var pageLabel = ex.crops.length === 1
            ? 'Page ' + (ex.crops[0].pageIndex + 1)
            : 'Pages ' + (ex.crops[0].pageIndex + 1) + '–' + (ex.crops[ex.crops.length - 1].pageIndex + 1);
          html += '<span class="thumb-page-label">' + pageLabel + '</span>';
          html += '</div>';
        }

        // Section field
        html += '<div class="field-group">';
        html += '<label class="field-label">Section <span class="required">*</span></label>';
        html += '<select class="field-select" onchange="pdSetSection(\'' + ex.id + '\',this.value)">';
        html += '<option value="" disabled' + (!ex.sectionId ? ' selected' : '') + '>Select section...</option>';
        structure.forEach(sec => {
          const sl = getSectionLabel(sec);
          html += '<option value="' + sec.id + '"' + (ex.sectionId === sec.id ? ' selected' : '') + '>' + escHtml(sl) + '</option>';
        });
        html += '</select></div>';

        // Description field
        html += '<div class="field-group">';
        html += '<label class="field-label">Description <span class="optional-tag">optional</span></label>';
        html += '<input type="text" class="field-input" value="' + escAttr(ex.description) + '" oninput="pdSetDesc(\'' + ex.id + '\',this.value)" placeholder="e.g., Main riff, Bar 47-48" maxlength="100" />';
        html += '</div>';

        // Difficulty picker (buttons)
        html += '<div class="field-group">';
        html += '<span class="field-label">Difficulty <span class="required">*</span></span>';
        html += '<div class="difficulty-picker">';
        for (let d = 1; d <= 5; d++) {
          html += '<button class="difficulty-btn' + (ex.difficulty === d ? ' selected' : '') + '" onclick="pdSetDifficulty(\'' + ex.id + '\',' + d + ')" title="' + DIFFICULTY_LABELS[d] + '" type="button">' + d + '</button>';
        }
        html += '</div>';
        if (ex.difficulty > 0) {
          html += '<span class="difficulty-hint">' + DIFFICULTY_LABELS[ex.difficulty] + '</span>';
        } else {
          html += '<span class="difficulty-hint muted">1 = easiest, 5 = hardest</span>';
        }
        html += '</div>';

        html += '<button class="delete-btn" onclick="event.stopPropagation();pdDeleteExercise(\'' + ex.id + '\')">Delete crop</button>';
        html += '</div>';
      }

      card.draggable = true;
      card.ondragstart = (e) => { card._exDragIdx = i; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; };
      card.ondragover = (e) => e.preventDefault();
      card.ondrop = (e) => {
        e.preventDefault();
        const items = list.querySelectorAll('.exercise-card');
        let fromI = null;
        items.forEach(el => { if (el._exDragIdx !== undefined) fromI = el._exDragIdx; });
        if (fromI !== null && fromI !== i) {
          const updated = [...exercises];
          const [moved] = updated.splice(fromI, 1);
          updated.splice(i, 0, moved);
          updated.forEach((ex, idx) => ex.sequenceNumber = idx + 1);
          exercises = updated;
          isDirty = true;
          renderExercises();
          refreshAllCropOverlays();
        }
      };

      card.innerHTML = html;
      list.appendChild(card);
    });

    updateExerciseUI();
  }

  function getCardLabel(ex) {
    const parts = [];
    if (ex.sectionId) {
      const sec = structure.find(s => s.id === ex.sectionId);
      if (sec) parts.push(getSectionLabel(sec));
    }
    if (ex.description && ex.description.trim()) parts.push(ex.description.trim());
    return parts.join(' — ');
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

  window.pdSelectExercise = function(id) { selectExercise(id); };

  window.pdDeleteExercise = function(id) {
    exercises = exercises.filter(e => e.id !== id);
    exercises.forEach((e, i) => e.sequenceNumber = i + 1);
    if (selectedExerciseId === id) selectedExerciseId = null;
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
      updateSaveState();
    }
  };

  function updateCompleteness(ex) {
    ex.isComplete = !!(ex.sectionId && ex.difficulty >= 1 && ex.difficulty <= 5);
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
        selectedExerciseId = null;
        jobId = data.id;
        pageCount = data.pageCount;
        if (!songTitle) {
          songTitle = file.name.replace(/\.pdf$/i, '');
          setVal('pd-title', songTitle);
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

      if (result.title && !songTitle.trim()) { songTitle = result.title; setVal('pd-title', songTitle); }
      if (result.artist && !artist.trim()) { artist = result.artist; setVal('pd-artist', artist); }
      if (result.tempo !== null && result.tempo !== undefined && tempo === null) { tempo = result.tempo; setVal('pd-tempo', tempo); }

      if (result.sections && result.sections.length > 0 && structure.length === 0) {
        structure = result.sections.map((name, i) => ({
          id: generateUuid(),
          type: name.toLowerCase().replace(/\s*\d+\s*$/, '').trim(),
          order: i
        }));
        renderStructure();
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
    const missing = [];
    if (!songTitle.trim()) missing.push('song title');
    if (!artist.trim()) missing.push('artist');
    if (tempo === null || tempo < 20 || tempo > 300) missing.push('valid tempo');
    if (structure.length === 0) missing.push('at least 1 section');
    if (!jobId) missing.push('PDF upload');
    if (exercises.length === 0) missing.push('at least 1 exercise');
    const incomplete = exercises.filter(e => !e.isComplete).length;
    if (incomplete > 0) missing.push(incomplete + ' exercise(s) need labels');

    const hintEl = document.getElementById('pd-missing-msg');
    if (hintEl) {
      if (missing.length > 0 && isDirty) {
        hintEl.style.display = '';
        hintEl.title = 'Missing: ' + missing.join(', ');
      } else {
        hintEl.style.display = 'none';
      }
    }

    const btn = document.getElementById('pd-save-btn');
    if (btn) {
      btn.disabled = missing.length > 0 || saving;
      btn.title = missing.length > 0 ? 'Missing: ' + missing.join(', ') : 'Save song';
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

// ===== Resizable Sidebars =====
(function() {
  'use strict';
  var MIN_WIDTH = 240;
  var MAX_WIDTH = 600;

  document.querySelectorAll('.col-resize-handle').forEach(function(handle) {
    var side = handle.dataset.side; // 'left' or 'right'
    var dragging = false;
    var startX, startWidth, panel;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      panel = side === 'left'
        ? document.getElementById('col-left')
        : document.getElementById('col-right');
      if (!panel) return;

      dragging = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      var delta = side === 'left'
        ? e.clientX - startX
        : startX - e.clientX;
      var newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      panel.style.width = newWidth + 'px';
    }

    function onUp() {
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  });
})();
