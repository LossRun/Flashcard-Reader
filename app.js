let decks = [];
let activeDeckId = null;
let cards = [];
let idx = 0;
let historyState = [];
let isFlipped = false;
let isAnimating = false;
let activeThemeSetting = "auto";
let cachedReportBlob = null;
let cachedReportDataUrl = null;

// IndexedDB Multi-Deck Storage (v2 Upgrade)
const DB_NAME = "FlashcardsReaderDB";
const DB_VERSION = 2;
const STORE_DECKS = "decks_store";
const STORE_SESSION = "session_store";
let db = null;

function initDatabase() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_DECKS)) {
        database.createObjectStore(STORE_DECKS, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(STORE_SESSION)) {
        database.createObjectStore(STORE_SESSION, { keyPath: "key" });
      }
    };

    req.onsuccess = async (e) => {
      db = e.target.result;
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (err) {}
      }
      resolve(db);
    };

    req.onerror = () => resolve(null);
  });
}

function fetchAllDecks() {
  return new Promise((resolve) => {
    if (!db) { resolve([]); return; }
    try {
      const tx = db.transaction(STORE_DECKS, "readonly");
      const store = tx.objectStore(STORE_DECKS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

function saveDeckToStorage(deck) {
  if (!db) return;
  try {
    const tx = db.transaction(STORE_DECKS, "readwrite");
    const store = tx.objectStore(STORE_DECKS);
    store.put(deck);
  } catch (e) {
    console.error("Failed to save deck:", e);
  }
}

function deleteDeckFromStorage(deckId) {
  if (!db) return;
  try {
    const tx = db.transaction(STORE_DECKS, "readwrite");
    const store = tx.objectStore(STORE_DECKS);
    store.delete(deckId);
  } catch (e) {
    console.error("Failed to delete deck:", e);
  }
}

function saveActiveSession() {
  if (!db || !activeDeckId || cards.length === 0) return;
  try {
    const tx = db.transaction(STORE_SESSION, "readwrite");
    const store = tx.objectStore(STORE_SESSION);
    store.put({
      key: "active_session",
      deckId: activeDeckId,
      idx: idx,
      historyState: historyState,
      updatedAt: Date.now()
    });
  } catch (err) {}
}

function clearSavedSession() {
  if (!db) return;
  try {
    const tx = db.transaction(STORE_SESSION, "readwrite");
    const store = tx.objectStore(STORE_SESSION);
    store.delete("active_session");
  } catch (err) {}
}

// Banner Notification System
const toastBanner = document.getElementById("toast-banner");
const toastTitle = document.getElementById("toast-title");
const toastMessage = document.getElementById("toast-message");
const toastClose = document.getElementById("toast-close");
let toastTimeout = null;

function showToast(title, message, isError = true) {
  if (!toastBanner) return;
  clearTimeout(toastTimeout);
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toastBanner.classList.add("show");
  triggerHaptic(isError ? [20, 60, 20] : 12);
  toastTimeout = setTimeout(hideToast, 6500);
}

function hideToast() {
  if (toastBanner) toastBanner.classList.remove("show");
}

if (toastClose) {
  toastClose.addEventListener("click", () => {
    hideToast();
    triggerHaptic(8);
  });
}

function triggerHaptic(type = 10) {
  if ("vibrate" in navigator) {
    try { navigator.vibrate(type); } catch(e) {}
  }
}

// AMBIENT FLUID LIGHTING ENGINE
const canvas = document.getElementById("fluid-canvas");
const ctx = canvas.getContext("2d");
let animRunning = false;
let animSpeed = 0.006;
let animIntensity = 0.55;
let time = 0;

let c1 = { r: 29, g: 78, b: 216 };
let c2 = { r: 5, g: 150, b: 105 };
let c3 = { r: 217, g: 119, b: 6 };

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace("#", ""), 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function resizeCanvas() {
  canvas.width = Math.floor(window.innerWidth / 2);
  canvas.height = Math.floor(window.innerHeight / 2);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function renderFluid() {
  if (!animRunning) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  time += animSpeed;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const x1 = w * (0.5 + 0.3 * Math.sin(time * 0.8));
  const y1 = h * (0.3 + 0.25 * Math.cos(time * 0.6));
  const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, w * 0.55);
  g1.addColorStop(0, `rgba(${c1.r}, ${c1.g}, ${c1.b}, 0.75)`);
  g1.addColorStop(1, `rgba(${c1.r}, ${c1.g}, ${c1.b}, 0)`);
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const x2 = w * (0.35 + 0.35 * Math.cos(time * 0.9));
  const y2 = h * (0.65 + 0.2 * Math.sin(time * 0.7));
  const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, w * 0.5);
  g2.addColorStop(0, `rgba(${c2.r}, ${c2.g}, ${c2.b}, 0.7)`);
  g2.addColorStop(1, `rgba(${c2.r}, ${c2.g}, ${c2.b}, 0)`);
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);

  const x3 = w * (0.7 + 0.25 * Math.sin(time * 1.1));
  const y3 = h * (0.5 + 0.3 * Math.cos(time * 1.2));
  const g3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, w * 0.45);
  g3.addColorStop(0, `rgba(${c3.r}, ${c3.g}, ${c3.b}, 0.7)`);
  g3.addColorStop(1, `rgba(${c3.r}, ${c3.g}, ${c3.b}, 0)`);
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, w, h);

  requestAnimationFrame(renderFluid);
}

// UI Selectors
const libraryViewport = document.getElementById("library-viewport");
const carouselStage = document.getElementById("carousel-stage");
const carouselDots = document.getElementById("carousel-dots");
const cinematicOverlay = document.getElementById("cinematic-overlay");

const deleteConfirmModal = document.getElementById("delete-confirm-modal");
const deleteDeckName = document.getElementById("delete-deck-name");
const btnConfirmDelete = document.getElementById("btn-confirm-delete");
const btnCancelDelete = document.getElementById("btn-cancel-delete");

const editDeckModal = document.getElementById("edit-deck-modal");
const editDeckTitleInput = document.getElementById("edit-deck-title");
const editSelectedCoverLabel = document.getElementById("edit-selected-cover-label");
const editCoverFileInput = document.getElementById("edit-cover-file-input");
const btnSaveEditDeck = document.getElementById("btn-save-edit-deck");
const btnEditDeleteTrigger = document.getElementById("btn-edit-delete-trigger");
const closeEdit = document.getElementById("close-edit");

const infoModal = document.getElementById("info-modal");
const openInfoModal = document.getElementById("open-info-modal");
const closeInfo = document.getElementById("close-info");

const resetConfirmModal = document.getElementById("reset-confirm-modal");
const btnOpenResetModal = document.getElementById("btn-open-reset-modal");
const btnConfirmReset = document.getElementById("btn-confirm-reset");
const btnCancelReset = document.getElementById("btn-cancel-reset");

const cardScene = document.getElementById("card-scene");
const card = document.getElementById("card");
const stackLayer1 = document.getElementById("stack-layer-1");
const stackLayer2 = document.getElementById("stack-layer-2");
const qText = document.getElementById("q-text");
const aText = document.getElementById("a-text");
const dock = document.getElementById("dock");
const counter = document.getElementById("counter");
const changeDeckBtn = document.getElementById("change-deck-btn");
const btnHomeNav = document.getElementById("btn-home-nav");
const progressFill = document.getElementById("progress-fill");

const swipeBacklight = document.getElementById("swipe-backlight");
const badgeRight = document.getElementById("badge-right-overlay");
const badgeLeft = document.getElementById("badge-left-overlay");

const reportCard = document.getElementById("report-card");
const reportAccuracyNum = document.getElementById("report-accuracy-num");
const reportRatio = document.getElementById("report-ratio");
const reportRight = document.getElementById("report-right");
const reportWrong = document.getElementById("report-wrong");
const ringFill = document.getElementById("ring-fill");
const btnRestartDeck = document.getElementById("btn-restart-deck");
const btnReviewMissed = document.getElementById("btn-review-missed");
const btnExportImage = document.getElementById("btn-export-image");

const scoreStats = document.getElementById("score-stats");
const wrongCountEl = document.getElementById("wrong-count");
const rightCountEl = document.getElementById("right-count");
const wrongBadge = document.getElementById("wrong-badge");
const rightBadge = document.getElementById("right-badge");

const btnWrong = document.getElementById("btn-wrong");
const btnRight = document.getElementById("btn-right");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");

const fileInput = document.getElementById("file-input");
const coverFileInput = document.getElementById("cover-file-input");
const createModal = document.getElementById("create-modal");
const closeCreate = document.getElementById("close-create");
const newDeckTitle = document.getElementById("new-deck-title");
const selectedFileLabel = document.getElementById("selected-file-label");
const selectedCoverLabel = document.getElementById("selected-cover-label");
const deckColorGrid = document.getElementById("deck-color-grid");
const btnSaveNewDeck = document.getElementById("btn-save-new-deck");

let stagingCards = null;
let stagingCoverDataUrl = null;
let editStagingCoverDataUrl = null;
let chosenDeckTint = "#38bdf8";
let pendingDeleteDeckId = null;
let editingDeckId = null;

// =========================================================
// UNIVERSAL BACKDROP & DRAG-TO-MINIMIZE HANDLING
// =========================================================
document.querySelectorAll(".modal-overlay, .save-modal-backdrop").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    if (!e.target.closest(".settings-sheet") && !e.target.closest(".save-modal-card")) {
      overlay.classList.remove("open");
      triggerHaptic(8);
    }
  });
});

document.querySelectorAll(".settings-sheet").forEach(sheet => {
  const handle = sheet.querySelector(".sheet-handle") || sheet.querySelector(".sheet-head");
  if (!handle) return;
  const overlay = sheet.closest(".modal-overlay");
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  function startDrag(y) {
    isDragging = true;
    startY = y;
    sheet.style.transition = "none";
  }

  function moveDrag(y) {
    if (!isDragging) return;
    currentY = y - startY;
    if (currentY > 0) {
      sheet.style.transform = `translate3d(0, ${currentY}px, 0)`;
    }
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = "transform 0.35s var(--ease-spring)";
    if (currentY > 80 && overlay) {
      overlay.classList.remove("open");
      triggerHaptic(8);
    }
    sheet.style.transform = "";
    currentY = 0;
  }

  handle.addEventListener("touchstart", (e) => startDrag(e.touches[0].clientY), { passive: true });
  window.addEventListener("touchmove", (e) => { if (isDragging) moveDrag(e.touches[0].clientY); }, { passive: true });
  window.addEventListener("touchend", () => { if (isDragging) endDrag(); });

  handle.addEventListener("mousedown", (e) => startDrag(e.clientY));
  window.addEventListener("mousemove", (e) => { if (isDragging) moveDrag(e.clientY); });
  window.addEventListener("mouseup", () => { if (isDragging) endDrag(); });
});

if (openInfoModal) {
  openInfoModal.addEventListener("click", () => {
    document.getElementById("prefs-modal").classList.remove("open");
    infoModal.classList.add("open");
    triggerHaptic(10);
  });
}
if (closeInfo) {
  closeInfo.addEventListener("click", () => {
    infoModal.classList.remove("open");
    triggerHaptic(8);
  });
}

// =========================================================
// 3D CYLINDRICAL CAROUSEL (PEEK PREVIEW)
// =========================================================
let carouselOffset = 0;
let carouselStartOffset = 0;
let isDraggingCarousel = false;
let carouselTouchStartX = 0;
let activeSlotIndex = 0;
const PACK_SPACING = 310;

function renderCarousel() {
  carouselStage.innerHTML = "";
  carouselDots.innerHTML = "";

  const totalSlots = decks.length + 1;

  for (let i = 0; i < totalSlots; i++) {
    const isAddSlot = (i === decks.length);
    const wrap = document.createElement("div");
    wrap.className = "pack-card-wrap";
    wrap.dataset.index = i;

    if (isAddSlot) {
      wrap.innerHTML = `
        <div class="deck-card deck-add-card">
          <div class="deck-add-icon">+</div>
          <div class="deck-title-huge" style="font-size: 1.6rem;">New Deck</div>
          <div class="deck-subtitle">Import CSV File</div>
        </div>
      `;
    } else {
      const d = decks[i];
      const coverStyle = d.coverImg ? `style="background-image: url('${d.coverImg}');"` : '';
      wrap.innerHTML = `
        <div class="deck-card" data-deck-id="${d.id}">
          <div class="deck-cover-img" ${coverStyle}></div>
          <div class="deck-card-top-bar">
            <span class="deck-badge-pill">DECK #${i + 1}</span>
            <button class="deck-edit-trigger" data-edit-id="${d.id}" title="Edit Deck" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
          <div class="deck-art-artwork">
            <div class="deck-title-huge">${d.title}</div>
            <div class="deck-subtitle">TAP TO STUDY</div>
          </div>
          <div class="deck-footer-meta">
            <span>${d.cards.length} CARDS</span>
            <span>VAULT LOCAL</span>
          </div>
        </div>
      `;
    }

    carouselStage.appendChild(wrap);

    const dot = document.createElement("div");
    dot.className = `carousel-dot ${i === 0 ? 'active' : ''}`;
    carouselDots.appendChild(dot);
  }

  updateCylinderTransforms();
}

function updateCylinderTransforms() {
  const wraps = carouselStage.querySelectorAll(".pack-card-wrap");
  const dots = carouselDots.querySelectorAll(".carousel-dot");
  const totalSlots = wraps.length;

  activeSlotIndex = Math.max(0, Math.min(totalSlots - 1, Math.round(-carouselOffset / PACK_SPACING)));

  wraps.forEach((wrap, i) => {
    const dist = (i * PACK_SPACING) + carouselOffset;
    const normDist = dist / PACK_SPACING;

    const rotateY = Math.max(-42, Math.min(42, normDist * 32));
    const translateZ = -Math.abs(normDist) * 140;
    const scale = Math.max(0.76, 1 - Math.abs(normDist) * 0.18);
    const opacity = Math.max(0.2, 1 - Math.abs(normDist) * 0.45);

    wrap.style.transform = `translate3d(${dist.toFixed(2)}px, 0, ${translateZ.toFixed(2)}px) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    wrap.style.opacity = opacity.toFixed(2);
    wrap.style.pointerEvents = (Math.abs(normDist) < 1.1) ? 'auto' : 'none';
  });

  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === activeSlotIndex);
  });
}

function onCarouselStart(clientX) {
  isDraggingCarousel = true;
  carouselTouchStartX = clientX;
  carouselStartOffset = carouselOffset;
}

function onCarouselMove(clientX) {
  if (!isDraggingCarousel) return;
  const deltaX = clientX - carouselTouchStartX;
  const totalSlots = decks.length + 1;
  const minOffset = -(totalSlots - 1) * PACK_SPACING;
  const maxOffset = 0;

  let tentative = carouselStartOffset + (deltaX * 1.45);

  if (tentative > maxOffset) {
    tentative = maxOffset + (tentative - maxOffset) * 0.22;
  } else if (tentative < minOffset) {
    tentative = minOffset + (tentative - minOffset) * 0.22;
  }

  carouselOffset = tentative;
  updateCylinderTransforms();
}

function onCarouselEnd() {
  if (!isDraggingCarousel) return;
  isDraggingCarousel = false;

  const totalSlots = decks.length + 1;
  const targetIndex = Math.max(0, Math.min(totalSlots - 1, Math.round(-carouselOffset / PACK_SPACING)));
  const targetOffset = -targetIndex * PACK_SPACING;

  function snapStep() {
    if (isDraggingCarousel) return;
    const diff = targetOffset - carouselOffset;
    if (Math.abs(diff) < 0.3) {
      carouselOffset = targetOffset;
      updateCylinderTransforms();
      triggerHaptic(6);
      return;
    }
    carouselOffset += diff * 0.24;
    updateCylinderTransforms();
    requestAnimationFrame(snapStep);
  }
  requestAnimationFrame(snapStep);
}

carouselStage.addEventListener("touchstart", (e) => onCarouselStart(e.touches[0].clientX), { passive: true });
window.addEventListener("touchmove", (e) => { if (isDraggingCarousel) onCarouselMove(e.touches[0].clientX); }, { passive: true });
window.addEventListener("touchend", onCarouselEnd);

carouselStage.addEventListener("mousedown", (e) => onCarouselStart(e.clientX));
window.addEventListener("mousemove", (e) => { if (isDraggingCarousel) onCarouselMove(e.clientX); });
window.addEventListener("mouseup", onCarouselEnd);

carouselStage.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".deck-edit-trigger");
  if (editBtn) {
    e.stopPropagation();
    editingDeckId = editBtn.getAttribute("data-edit-id");
    const targetDeck = decks.find(d => d.id === editingDeckId);
    if (targetDeck) {
      editDeckTitleInput.value = targetDeck.title;
      editStagingCoverDataUrl = targetDeck.coverImg || null;
      editSelectedCoverLabel.textContent = targetDeck.coverImg ? "Change Cover Image..." : "Select Cover Image...";
      editDeckModal.classList.add("open");
      triggerHaptic(10);
    }
    return;
  }

  const activeWrap = e.target.closest(".pack-card-wrap");
  if (!activeWrap) return;

  const slotIdx = parseInt(activeWrap.dataset.index, 10);

  if (slotIdx === decks.length) {
    stagingCards = null;
    stagingCoverDataUrl = null;
    newDeckTitle.value = "";
    selectedFileLabel.textContent = "Choose CSV File...";
    selectedCoverLabel.textContent = "Select Cover Image...";
    createModal.classList.add("open");
    triggerHaptic(10);
    return;
  }

  triggerHaptic([15, 60, 20]);
  cinematicOverlay.classList.add("active");
  libraryViewport.classList.add("blur-exit");

  setTimeout(() => {
    cinematicOverlay.classList.remove("active");
    launchStudySession(decks[slotIdx]);
    setTimeout(() => {
      libraryViewport.classList.remove("blur-exit");
    }, 400);
  }, 220);
});

// Edit & Delete Handlers
if (closeEdit) {
  closeEdit.addEventListener("click", () => {
    editDeckModal.classList.remove("open");
  });
}

if (editCoverFileInput) {
  editCoverFileInput.addEventListener("change", (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    editSelectedCoverLabel.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
      editStagingCoverDataUrl = evt.target.result;
      triggerHaptic(10);
    };
    reader.readAsDataURL(file);
  });
}

if (btnSaveEditDeck) {
  btnSaveEditDeck.addEventListener("click", () => {
    if (!editingDeckId) return;
    const targetDeck = decks.find(d => d.id === editingDeckId);
    if (targetDeck) {
      targetDeck.title = editDeckTitleInput.value.trim() || targetDeck.title;
      targetDeck.coverImg = editStagingCoverDataUrl;
      saveDeckToStorage(targetDeck);
    }
    editDeckModal.classList.remove("open");
    renderCarousel();
    triggerHaptic([15, 40, 15]);
  });
}

if (btnEditDeleteTrigger) {
  btnEditDeleteTrigger.addEventListener("click", () => {
    editDeckModal.classList.remove("open");
    pendingDeleteDeckId = editingDeckId;
    const targetDeck = decks.find(d => d.id === pendingDeleteDeckId);
    deleteDeckName.textContent = `Are you sure you want to permanently delete "${targetDeck ? targetDeck.title : 'this deck'}"?`;
    deleteConfirmModal.classList.add("open");
    triggerHaptic(12);
  });
}

if (btnCancelDelete) {
  btnCancelDelete.addEventListener("click", () => {
    deleteConfirmModal.classList.remove("open");
    pendingDeleteDeckId = null;
  });
}

if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener("click", () => {
    if (!pendingDeleteDeckId) return;
    const id = pendingDeleteDeckId;
    decks = decks.filter(d => d.id !== id);
    deleteDeckFromStorage(id);
    deleteConfirmModal.classList.remove("open");
    pendingDeleteDeckId = null;
    renderCarousel();
    triggerHaptic([20, 50, 20]);
  });
}

// Database Reset Feature in Settings
btnOpenResetModal.addEventListener("click", () => {
  document.getElementById("prefs-modal").classList.remove("open");
  resetConfirmModal.classList.add("open");
  triggerHaptic(12);
});

btnCancelReset.addEventListener("click", () => {
  resetConfirmModal.classList.remove("open");
});

btnConfirmReset.addEventListener("click", async () => {
  triggerHaptic([30, 80, 40]);
  if (window.indexedDB) {
    indexedDB.deleteDatabase(DB_NAME);
  }
  localStorage.clear();
  decks = [];
  resetConfirmModal.classList.remove("open");
  window.location.reload();
});

function launchStudySession(deckToOpen) {
  activeDeckId = deckToOpen.id;
  cards = deckToOpen.cards;
  idx = 0;
  historyState = new Array(cards.length).fill(null);

  recalculateScores();
  saveActiveSession();

  libraryViewport.classList.add("hidden");
  reportCard.classList.add("hidden");

  cardScene.classList.remove("hidden");
  dock.classList.remove("hidden");
  scoreStats.classList.remove("hidden");
  changeDeckBtn.classList.remove("hidden");

  cardScene.classList.add("mount-enter");
  dock.classList.add("mount-enter");
  render();

  setTimeout(() => {
    cardScene.classList.remove("mount-enter");
    dock.classList.remove("mount-enter");
  }, 500);
}

function returnToLibrary() {
  clearSavedSession();
  activeDeckId = null;

  cardScene.classList.add("mount-exit");
  dock.classList.add("mount-exit");
  triggerHaptic(10);

  setTimeout(() => {
    cardScene.classList.add("hidden");
    cardScene.classList.remove("mount-exit");
    dock.classList.add("hidden");
    dock.classList.remove("mount-exit");
    reportCard.classList.add("hidden");
    scoreStats.classList.add("hidden");
    changeDeckBtn.classList.add("hidden");

    libraryViewport.classList.remove("hidden");
    libraryViewport.classList.add("mount-enter");
    counter.textContent = "Deck Vault";
    progressFill.style.width = "0%";
    renderCarousel();

    setTimeout(() => {
      libraryViewport.classList.remove("mount-enter");
    }, 450);
  }, 300);
}

btnHomeNav.addEventListener("click", returnToLibrary);
changeDeckBtn.addEventListener("click", returnToLibrary);

// CSV Parser
function validateAndParseCSV(raw) {
  if (!raw || !raw.trim()) {
    return { error: "The uploaded file is empty. Please select a valid CSV deck." };
  }

  const str = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let entry = "";
  let inQuotes = false;
  let quoteLineStart = 1;
  let currentLine = 1;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];

    if (c === "\n") currentLine++;

    if (c === '"') {
      if (!inQuotes) {
        inQuotes = true;
        quoteLineStart = currentLine;
      } else if (next === '"') {
        entry += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(entry.trim());
      entry = "";
    } else if (c === '\n' && !inQuotes) {
      row.push(entry.trim());
      if (row.some(f => f.length > 0)) rows.push({ line: currentLine - 1, data: row });
      row = [];
      entry = "";
    } else {
      entry += c;
    }
  }

  if (inQuotes) {
    return { error: `Unclosed quotation mark starting around line ${quoteLineStart}. Check double-quotes.` };
  }

  if (entry.length > 0 || row.length > 0) {
    row.push(entry.trim());
    if (row.some(f => f.length > 0)) rows.push({ line: currentLine, data: row });
  }

  const validCards = [];
  for (let i = 0; i < rows.length; i++) {
    const q = rows[i].data[0] || "";
    const a = rows[i].data[1] || "";
    if (q && a) validCards.push({ q, a });
  }

  if (validCards.length === 0) {
    return { error: "No valid Question/Answer columns found in this CSV file." };
  }

  return { cards: validCards };
}

fileInput.addEventListener("change", (e) => {
  if (!e.target.files || e.target.files.length === 0) return;
  const file = e.target.files[0];
  selectedFileLabel.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const res = validateAndParseCSV(evt.target.result);
    if (res.error) {
      showToast("CSV Parse Error", res.error);
      stagingCards = null;
      selectedFileLabel.textContent = "Choose CSV File...";
    } else {
      stagingCards = res.cards;
      if (!newDeckTitle.value.trim()) {
        newDeckTitle.value = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      }
      triggerHaptic(12);
    }
  };
  reader.readAsText(file);
});

coverFileInput.addEventListener("change", (e) => {
  if (!e.target.files || e.target.files.length === 0) return;
  const file = e.target.files[0];
  selectedCoverLabel.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (evt) => {
    stagingCoverDataUrl = evt.target.result;
    triggerHaptic(10);
  };
  reader.readAsDataURL(file);
});

closeCreate.addEventListener("click", () => {
  createModal.classList.remove("open");
});

btnSaveNewDeck.addEventListener("click", () => {
  if (!stagingCards || stagingCards.length === 0) {
    showToast("Missing Flashcards", "Please select a valid CSV file for this deck.");
    return;
  }

  const title = newDeckTitle.value.trim() || `Study Deck #${decks.length + 1}`;
  const newDeck = {
    id: `deck_${Date.now()}`,
    title: title,
    cards: stagingCards,
    themeColor: chosenDeckTint,
    coverImg: stagingCoverDataUrl || null,
    createdAt: Date.now()
  };

  decks.push(newDeck);
  saveDeckToStorage(newDeck);
  createModal.classList.remove("open");
  
  activeSlotIndex = decks.length - 1;
  carouselOffset = -activeSlotIndex * PACK_SPACING;
  renderCarousel();
  triggerHaptic([15, 40, 15]);
});

// Study Engine & 3D Flip
function recalculateScores() {
  const rights = historyState.filter(s => s === "right").length;
  const wrongs = historyState.filter(s => s === "wrong").length;
  rightCountEl.textContent = rights;
  wrongCountEl.textContent = wrongs;

  const answered = historyState.filter(s => s !== null).length;
  const pct = cards.length > 0 ? (answered / cards.length) * 100 : 0;
  progressFill.style.width = `${pct}%`;
}

function toggleFlip() {
  if (isAnimating) return;
  isAnimating = true;
  isFlipped = !isFlipped;
  triggerHaptic(12);

  const targetRotation = isFlipped ? 180 : 0;
  card.style.transition = 'transform var(--flip-speed) cubic-bezier(0.175, 0.885, 0.32, 1.15)';
  card.style.transform = `rotateY(${targetRotation}deg)`;

  setTimeout(() => { isAnimating = false; }, 480);
}

function render(direction = null) {
  isFlipped = false;
  isAnimating = false;
  card.style.transition = 'none';
  card.style.transform = 'rotateY(0deg)';

  swipeBacklight.style.opacity = "0";
  badgeRight.style.opacity = "0";
  badgeLeft.style.opacity = "0";

  stackLayer1.style.transform = "translateY(10px) scale(0.96)";
  stackLayer2.style.transform = "translateY(18px) scale(0.92)";

  void card.offsetWidth;

  qText.textContent = cards[idx].q;
  aText.textContent = cards[idx].a;
  counter.textContent = `${String(idx + 1).padStart(2, '0')} — ${String(cards.length).padStart(2, '0')}`;

  if (window.renderMathInElement) {
    renderMathInElement(card, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false}
      ],
      throwOnError: false
    });
  }

  if (direction) {
    card.classList.remove("slide-next", "slide-prev");
    void card.offsetWidth;
    card.classList.add(direction === "next" ? "slide-next" : "slide-prev");
  }

  prevBtn.disabled = (idx === 0);
  nextBtn.disabled = (idx === cards.length - 1);
}

function showReport() {
  cardScene.classList.add("hidden");
  dock.classList.add("hidden");
  reportCard.classList.remove("hidden");
  reportCard.classList.add("mount-enter");

  const rights = historyState.filter(s => s === "right").length;
  const wrongs = historyState.filter(s => s === "wrong").length;
  const total = cards.length;
  const masteryPct = total > 0 ? Math.round((rights / total) * 100) : 0;

  reportRight.textContent = rights;
  reportWrong.textContent = wrongs;
  reportAccuracyNum.textContent = `${masteryPct}%`;
  reportRatio.textContent = `${rights} / ${total}`;

  const circumference = 364.4;
  const strokeOffset = circumference - (circumference * masteryPct) / 100;
  
  ringFill.style.strokeDashoffset = circumference.toString();
  setTimeout(() => {
    ringFill.style.strokeDashoffset = strokeOffset.toString();
    ringFill.style.stroke = masteryPct < 50 ? "var(--coral-text)" : "var(--green-text)";
  }, 100);

  btnReviewMissed.style.display = wrongs > 0 ? "flex" : "none";
  counter.textContent = "finished";
  progressFill.style.width = "100%";
  triggerHaptic([20, 50, 20]);
}

function markAnswer(isCorrect, isSwipe = false) {
  if (!cards.length) return;
  historyState[idx] = isCorrect ? "right" : "wrong";
  recalculateScores();
  saveActiveSession();
  triggerHaptic(isCorrect ? 15 : [10, 30, 10]);

  if (isSwipe) {
    card.classList.add(isCorrect ? "fling-right" : "fling-left");
    setTimeout(() => {
      card.classList.remove("fling-right", "fling-left");
      if (idx < cards.length - 1) {
        idx++;
        render("next");
      } else {
        showReport();
      }
    }, 320);
  } else {
    if (idx < cards.length - 1) {
      idx++;
      render("next");
    } else {
      showReport();
    }
  }
}

function goPrevious() {
  if (idx > 0) {
    idx--;
    historyState[idx] = null;
    recalculateScores();
    saveActiveSession();
    render("prev");
    triggerHaptic(10);
  }
}

function goNext() {
  if (idx < cards.length - 1) {
    idx++;
    saveActiveSession();
    render("next");
    triggerHaptic(10);
  } else {
    showReport();
  }
}

// Fixed Restart Button Flow
btnRestartDeck.addEventListener("click", () => {
  triggerHaptic(18);
  btnRestartDeck.style.transform = "scale(0.92)";
  setTimeout(() => {
    btnRestartDeck.style.transform = "scale(1)";
  }, 150);

  idx = 0;
  historyState = new Array(cards.length).fill(null);
  recalculateScores();
  saveActiveSession();
  
  reportCard.classList.add("hidden");
  reportCard.classList.remove("mount-enter");
  
  cardScene.classList.remove("hidden");
  dock.classList.remove("hidden");
  cardScene.classList.add("mount-enter");
  
  render();
  setTimeout(() => {
    cardScene.classList.remove("mount-enter");
  }, 500);
});

btnReviewMissed.addEventListener("click", () => {
  const missedCards = cards.filter((_, i) => historyState[i] === "wrong");
  if (missedCards.length > 0) {
    cards = missedCards;
    idx = 0;
    historyState = new Array(cards.length).fill(null);
    recalculateScores();
    reportCard.classList.add("hidden");
    cardScene.classList.remove("hidden");
    dock.classList.remove("hidden");
    render();
  }
});

btnWrong.addEventListener("click", () => markAnswer(false));
btnRight.addEventListener("click", () => markAnswer(true));
prevBtn.addEventListener("click", goPrevious);
nextBtn.addEventListener("click", goNext);

shuffleBtn.addEventListener("click", () => {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  idx = 0;
  historyState = new Array(cards.length).fill(null);
  recalculateScores();
  saveActiveSession();
  render("next");
  triggerHaptic(15);
});

// 1:1 PHYSICAL CARD DRAGGING
let cardStartX = 0, cardStartY = 0;
let cardCurrentX = 0, cardCurrentY = 0;
let isTrackingCard = false;
let hasMovedCard = false;
let cardStartTime = 0;
const SWIPE_THRESHOLD = 135;

function gestureStart(x, y) {
  if (cardScene.classList.contains("hidden") || cards.length === 0 || isAnimating) return;
  isTrackingCard = true;
  hasMovedCard = false;
  cardStartTime = Date.now();
  cardStartX = x; cardStartY = y;
  cardCurrentX = x; cardCurrentY = y;
  card.style.transition = "none";
}

function gestureMove(x, y) {
  if (!isTrackingCard) return;
  cardCurrentX = x; cardCurrentY = y;
  const deltaX = cardCurrentX - cardStartX;
  const deltaY = cardCurrentY - cardStartY;

  if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) hasMovedCard = true;
  if (!hasMovedCard) return;

  const rotateDeg = deltaX * 0.07;
  const rotateYDeg = isFlipped ? 180 + (deltaX * 0.04) : -(deltaX * 0.04);
  const dragScale = Math.max(0.95, 1 - Math.abs(deltaX) * 0.0003);

  card.style.transform = `translate3d(${deltaX}px, ${deltaY * 0.35}px, 0) rotateY(${rotateYDeg}deg) rotateZ(${rotateDeg}deg) scale(${dragScale})`;

  const stackProgress = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1);
  stackLayer1.style.transform = `translate3d(${deltaX * 0.08}px, ${10 - stackProgress * 3}px, 0) scale(${0.96 + stackProgress * 0.02})`;
  stackLayer2.style.transform = `translate3d(${deltaX * 0.04}px, ${18 - stackProgress * 4}px, 0) scale(${0.92 + stackProgress * 0.02})`;

  const badgeOpacity = Math.min(Math.abs(deltaX) / (SWIPE_THRESHOLD * 0.8), 1);
  if (deltaX > 0) {
    swipeBacklight.style.background = "radial-gradient(ellipse at center, rgba(34, 197, 94, 0.35) 0%, transparent 70%)";
    swipeBacklight.style.opacity = badgeOpacity.toString();
    badgeRight.style.opacity = badgeOpacity.toString();
    badgeLeft.style.opacity = "0";
  } else {
    swipeBacklight.style.background = "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.35) 0%, transparent 70%)";
    swipeBacklight.style.opacity = badgeOpacity.toString();
    badgeLeft.style.opacity = badgeOpacity.toString();
    badgeRight.style.opacity = "0";
  }
}

function gestureEnd() {
  if (!isTrackingCard) return;
  isTrackingCard = false;
  const deltaX = cardCurrentX - cardStartX;
  const duration = Date.now() - cardStartTime;

  if (!hasMovedCard && duration < 300) {
    toggleFlip();
    return;
  }

  if (deltaX > SWIPE_THRESHOLD) {
    markAnswer(true, true);
  } else if (deltaX < -SWIPE_THRESHOLD) {
    markAnswer(false, true);
  } else {
    card.style.transition = 'transform 0.4s var(--ease-spring)';
    const currentRotation = isFlipped ? 180 : 0;
    card.style.transform = `rotateY(${currentRotation}deg)`;
    swipeBacklight.style.opacity = "0";
    badgeRight.style.opacity = "0";
    badgeLeft.style.opacity = "0";
    stackLayer1.style.transform = "translateY(10px) scale(0.96)";
    stackLayer2.style.transform = "translateY(18px) scale(0.92)";
  }
}

cardScene.addEventListener("touchstart", (e) => gestureStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
window.addEventListener("touchmove", (e) => { if (isTrackingCard) gestureMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
window.addEventListener("touchend", gestureEnd);

cardScene.addEventListener("mousedown", (e) => gestureStart(e.clientX, e.clientY));
window.addEventListener("mousemove", (e) => { if (isTrackingCard) gestureMove(e.clientX, e.clientY); });
window.addEventListener("mouseup", () => { if (isTrackingCard) gestureEnd(); });

// =========================================================
// HIGH-RESOLUTION LIGHT THEME STUDIO REPORT GENERATOR
// =========================================================
function generateReportImage() {
  triggerHaptic(15);
  const btn = btnExportImage;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<span class="btn-spinner"></span> Generating Report...`;
  btn.disabled = true;

  const rights = historyState.filter(s => s === "right").length;
  const wrongs = historyState.filter(s => s === "wrong").length;
  const total = cards.length || 1;
  const masteryPct = Math.round((rights / total) * 100);

  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const rCtx = c.getContext("2d");

  function roundRect(x, y, w, h, r) {
    rCtx.beginPath();
    rCtx.moveTo(x + r, y);
    rCtx.arcTo(x + w, y, x + w, y + h, r);
    rCtx.arcTo(x + w, y + h, x, y + h, r);
    rCtx.arcTo(x, y + h, x, y, r);
    rCtx.arcTo(x, y, x + w, y, r);
    rCtx.closePath();
  }

  // Pure Studio Light Palette
  rCtx.fillStyle = "#f1f5f9";
  rCtx.fillRect(0, 0, 1080, 1350);

  // Soft Ambient Glow Behind Main Card
  const glow = rCtx.createRadialGradient(540, 600, 100, 540, 600, 550);
  glow.addColorStop(0, "rgba(56, 189, 248, 0.08)");
  glow.addColorStop(1, "rgba(241, 245, 249, 0)");
  rCtx.fillStyle = glow;
  rCtx.fillRect(0, 0, 1080, 1350);

  const cardX = 70, cardY = 60, cardW = 940, cardH = 1230;

  // Crisp Off-White Surface Card
  rCtx.save();
  roundRect(cardX, cardY, cardW, cardH, 52);
  rCtx.fillStyle = "#ffffff";
  rCtx.shadowColor = "rgba(15, 23, 42, 0.08)";
  rCtx.shadowBlur = 50;
  rCtx.shadowOffsetY = 20;
  rCtx.fill();
  rCtx.lineWidth = 2;
  rCtx.strokeStyle = "#e2e8f0";
  rCtx.stroke();
  rCtx.restore();

  // Header Title
  rCtx.textAlign = "center";
  rCtx.fillStyle = "#0f172a";
  rCtx.font = "700 64px sans-serif";
  rCtx.fillText("Session Complete", 540, 215);

  rCtx.fillStyle = "#64748b";
  rCtx.font = "600 20px sans-serif";
  rCtx.letterSpacing = "3px";
  rCtx.fillText("PERFORMANCE BREAKDOWN", 540, 280);

  // Circular Score Gauge
  const cx = 540, cy = 540, cr = 180;
  rCtx.beginPath();
  rCtx.arc(cx, cy, cr, 0, 2 * Math.PI);
  rCtx.lineWidth = 18;
  rCtx.strokeStyle = "#f1f5f9";
  rCtx.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (2 * Math.PI * (masteryPct / 100));
  const gaugeColor = masteryPct >= 50 ? "#10b981" : "#ef4444";

  rCtx.save();
  rCtx.beginPath();
  rCtx.arc(cx, cy, cr, startAngle, endAngle);
  rCtx.lineWidth = 18;
  rCtx.lineCap = "round";
  rCtx.strokeStyle = gaugeColor;
  rCtx.stroke();
  rCtx.restore();

  rCtx.fillStyle = "#0f172a";
  rCtx.font = "800 84px monospace";
  rCtx.fillText(`${masteryPct}%`, cx, cy + 18);

  rCtx.fillStyle = "#64748b";
  rCtx.font = "600 26px monospace";
  rCtx.fillText(`${rights} / ${total}`, cx, cy + 76);

  // Mastered & Needs Work Stat Boxes
  const boxY = 820, boxW = 380, boxH = 210;
  
  // Mastered Box (Soft Mint Fill)
  roundRect(110, boxY, boxW, boxH, 28);
  rCtx.fillStyle = "rgba(16, 185, 129, 0.06)";
  rCtx.fill();
  rCtx.strokeStyle = "rgba(16, 185, 129, 0.25)";
  rCtx.lineWidth = 1.5;
  rCtx.stroke();

  rCtx.fillStyle = "#059669";
  rCtx.font = "700 20px sans-serif";
  rCtx.fillText("MASTERED", 110 + boxW / 2, boxY + 58);
  rCtx.font = "800 76px monospace";
  rCtx.fillText(rights, 110 + boxW / 2, boxY + 155);

  // Needs Work Box (Soft Coral Fill)
  roundRect(590, boxY, boxW, boxH, 28);
  rCtx.fillStyle = "rgba(239, 68, 68, 0.06)";
  rCtx.fill();
  rCtx.strokeStyle = "rgba(239, 68, 68, 0.25)";
  rCtx.lineWidth = 1.5;
  rCtx.stroke();

  rCtx.fillStyle = "#dc2626";
  rCtx.font = "700 20px sans-serif";
  rCtx.fillText("NEEDS WORK", 590 + boxW / 2, boxY + 58);
  rCtx.font = "800 76px monospace";
  rCtx.fillText(wrongs, 590 + boxW / 2, boxY + 155);

  // Footer Timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  rCtx.fillStyle = "#94a3b8";
  rCtx.font = "500 20px sans-serif";
  rCtx.fillText(`Completed on ${dateStr} • ${timeStr}`, 540, 1160);

  requestAnimationFrame(() => {
    c.toBlob((blob) => {
      cachedReportBlob = blob;
      cachedReportDataUrl = c.toDataURL("image/png");
      document.getElementById("save-modal-img").src = cachedReportDataUrl;
      
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      document.getElementById("save-modal-backdrop").classList.add("open");
    }, "image/png");
  });
}

btnExportImage.addEventListener("click", generateReportImage);

document.getElementById("save-modal-close").addEventListener("click", () => {
  document.getElementById("save-modal-backdrop").classList.remove("open");
});

// =========================================================
// UNIVERSAL SAVE & DOWNLOAD (APK WEBVIEW + DESKTOP/MOBILE)
// =========================================================
document.getElementById("save-modal-download").addEventListener("click", async () => {
  triggerHaptic(15);
  if (!cachedReportBlob && !cachedReportDataUrl) return;

  const btn = document.getElementById("save-modal-download");
  const origBtnText = btn.innerHTML;
  btn.innerHTML = "<span class=\"btn-spinner\"></span> Saving...";
  btn.disabled = true;

  const filename = "Flashcard-Report-" + Date.now() + ".png";

  // 1. Cordova Native FileSystem writing to Pictures directory (Verified Write)
  if (window.cordova && window.resolveLocalFileSystemURL && cachedReportBlob) {
    try {
      const storageBase = cordova.file.externalRootDirectory ? (cordova.file.externalRootDirectory + "Pictures/") : (cordova.file.dataDirectory || cordova.file.externalDataDirectory);
      window.resolveLocalFileSystemURL(storageBase, (dirEntry) => {
        dirEntry.getFile(filename, { create: true, exclusive: false }, (fileEntry) => {
          fileEntry.createWriter((fileWriter) => {
            fileWriter.onwriteend = () => {
              btn.innerHTML = origBtnText;
              btn.disabled = false;
              if (window.cordova.plugins && window.cordova.plugins.MediaScannerPlugin) {
                window.cordova.plugins.MediaScannerPlugin.scanFile(fileEntry.nativeURL);
              }
              showToast("Report Saved", "Verified: Saved to Pictures folder!", false);
              triggerHaptic([20, 60, 20]);
            };
            fileWriter.onerror = (e) => {
              btn.innerHTML = origBtnText;
              btn.disabled = false;
              showToast("Storage Error", "Could not write image to device storage.");
            };
            fileWriter.write(cachedReportBlob);
          });
        }, (err) => {
          btn.innerHTML = origBtnText;
          btn.disabled = false;
          showToast("File Error", "Could not create target image file.");
        });
      }, (err) => {
        btn.innerHTML = origBtnText;
        btn.disabled = false;
        showToast("Access Error", "Pictures directory not accessible.");
      });
      return;
    } catch (err) {
      console.warn("Cordova File API issue, falling back to Web Share / Download:", err);
    }
  }

  // 2. Android Native Web Share API (System Save / Drive / Photos)
  if (navigator.canShare && cachedReportBlob) {
    try {
      const file = new File([cachedReportBlob], filename, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Flashcard Study Report",
          text: "My Flashcards Study Report"
        });
        btn.innerHTML = origBtnText;
        btn.disabled = false;
        showToast("Report Shared", "Action completed successfully.", false);
        return;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        btn.innerHTML = origBtnText;
        btn.disabled = false;
        return;
      }
    }
  }

  // 3. Web Anchor Download Fallback
  try {
    const a = document.createElement("a");
    a.href = cachedReportDataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      btn.innerHTML = origBtnText;
      btn.disabled = false;
      showToast("Report Downloaded", "Downloaded to your browser files.", false);
    }, 500);
  } catch (err) {
    btn.innerHTML = origBtnText;
    btn.disabled = false;
    window.open(cachedReportDataUrl, "_blank");
  }
});

// RESTORED PREFERENCES & AMBIENT ENGINE CONTROLS
const prefsModal = document.getElementById("prefs-modal");
const openPrefs = document.getElementById("open-prefs");
const closePrefs = document.getElementById("close-prefs");
const themeGrid = document.getElementById("theme-grid");
const fontSlider = document.getElementById("font-slider");
const fontVal = document.getElementById("font-val");
const animStateGrid = document.getElementById("anim-state-grid");
const accordionStage = document.getElementById("accordion-stage");
const speedSlider = document.getElementById("speed-slider");
const speedVal = document.getElementById("speed-val");
const intensitySlider = document.getElementById("intensity-slider");
const intensityVal = document.getElementById("intensity-val");
const paletteGrid = document.getElementById("palette-grid");
const customC1 = document.getElementById("custom-c1");
const customC2 = document.getElementById("custom-c2");
const customC3 = document.getElementById("custom-c3");

openPrefs.addEventListener("click", () => {
  triggerHaptic(10);
  prefsModal.classList.add("open");
});

closePrefs.addEventListener("click", () => {
  prefsModal.classList.remove("open");
});

prefsModal.addEventListener("click", (e) => {
  if (e.target === prefsModal) prefsModal.classList.remove("open");
});

function applyTheme(theme) {
  activeThemeSetting = theme;
  if (theme === "auto") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.setAttribute("data-theme", isDark ? "dark" : "chalk");
  } else {
    document.body.setAttribute("data-theme", theme);
  }
  localStorage.setItem("fc_theme", theme);
}

themeGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".pref-tile-btn");
  if (!btn) return;
  themeGrid.querySelectorAll(".pref-tile-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  applyTheme(btn.dataset.val);
});

fontSlider.addEventListener("input", (e) => {
  const val = `${parseFloat(e.target.value).toFixed(2)}rem`;
  fontVal.textContent = val;
  document.documentElement.style.setProperty("--font-size", val);
  localStorage.setItem("fc_fontsize", val);
});

animStateGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".pref-tile-btn");
  if (!btn) return;
  triggerHaptic(10);
  animStateGrid.querySelectorAll(".pref-tile-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const val = btn.dataset.val;

  if (val === "off") {
    animRunning = false;
    canvas.style.display = "none";
    accordionStage.classList.remove("is-open");
    localStorage.setItem("fc_anim", "off");
  } else {
    animRunning = true;
    canvas.style.display = "block";
    accordionStage.classList.add("is-open");
    localStorage.setItem("fc_anim", "on");
    renderFluid();
  }
});

speedSlider.addEventListener("input", (e) => {
  animSpeed = parseFloat(e.target.value);
  speedVal.textContent = animSpeed.toFixed(3);
  localStorage.setItem("fc_anim_speed", animSpeed);
});

intensitySlider.addEventListener("input", (e) => {
  animIntensity = parseFloat(e.target.value);
  intensityVal.textContent = `${Math.round(animIntensity * 100)}%`;
  canvas.style.opacity = animIntensity.toString();
  localStorage.setItem("fc_anim_intensity", animIntensity);
});

paletteGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".pref-tile-btn");
  if (!btn) return;
  triggerHaptic(10);
  paletteGrid.querySelectorAll(".pref-tile-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const hex1 = btn.dataset.c1, hex2 = btn.dataset.c2, hex3 = btn.dataset.c3;
  c1 = hexToRgb(hex1); c2 = hexToRgb(hex2); c3 = hexToRgb(hex3);
  customC1.value = hex1; customC2.value = hex2; customC3.value = hex3;
  localStorage.setItem("fc_colors", JSON.stringify({ c1: hex1, c2: hex2, c3: hex3 }));
});

function updateCustomColors() {
  c1 = hexToRgb(customC1.value); c2 = hexToRgb(customC2.value); c3 = hexToRgb(customC3.value);
  paletteGrid.querySelectorAll(".pref-tile-btn").forEach(b => b.classList.remove("active"));
  localStorage.setItem("fc_colors", JSON.stringify({ c1: customC1.value, c2: customC2.value, c3: customC3.value }));
}
customC1.addEventListener("input", updateCustomColors);
customC2.addEventListener("input", updateCustomColors);
customC3.addEventListener("input", updateCustomColors);

// Initialize on Boot
window.addEventListener("DOMContentLoaded", async () => {
  const savedTheme = localStorage.getItem("fc_theme") || "auto";
  applyTheme(savedTheme);
  const themeBtn = themeGrid.querySelector(`[data-val="${savedTheme}"]`);
  if (themeBtn) {
    themeGrid.querySelectorAll(".pref-tile-btn").forEach(b => b.classList.remove("active"));
    themeBtn.classList.add("active");
  }

  const savedFontSize = localStorage.getItem("fc_fontsize");
  if (savedFontSize) {
    document.documentElement.style.setProperty("--font-size", savedFontSize);
    fontVal.textContent = savedFontSize;
    fontSlider.value = parseFloat(savedFontSize);
  }

  const savedAnim = localStorage.getItem("fc_anim");
  if (savedAnim === "on") {
    animRunning = true;
    canvas.style.display = "block";
    accordionStage.classList.add("is-open");
    animStateGrid.querySelectorAll(".pref-tile-btn").forEach(b => b.classList.remove("active"));
    const onBtn = animStateGrid.querySelector('[data-val="on"]');
    if (onBtn) onBtn.classList.add("active");
    renderFluid();
  }

  const savedColors = localStorage.getItem("fc_colors");
  if (savedColors) {
    try {
      const parsed = JSON.parse(savedColors);
      customC1.value = parsed.c1;
      customC2.value = parsed.c2;
      customC3.value = parsed.c3;
      c1 = hexToRgb(parsed.c1);
      c2 = hexToRgb(parsed.c2);
      c3 = hexToRgb(parsed.c3);
    } catch (e) {}
  }

  await initDatabase();
  decks = await fetchAllDecks();
  renderCarousel();
});



// =========================================================
// FOOLPROOF ANDROID APK IMAGE SAVE & EXPORT
// =========================================================
document.getElementById("save-modal-download").addEventListener("click", async () => {
  triggerHaptic(15);
  const btn = document.getElementById("save-modal-download");
  const origText = btn.innerHTML;
  btn.innerHTML = "<span class=\"btn-spinner\"></span> Saving...";
  btn.disabled = true;

  const filename = "Flashcard-Report-" + Date.now() + ".png";

  try {
    if (navigator.canShare && cachedReportBlob) {
      const file = new File([cachedReportBlob], filename, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Flashcard Report",
          text: "Session breakdown report"
        });
        btn.innerHTML = origText;
        btn.disabled = false;
        showToast("Report Exported", "Action completed successfully.", false);
        return;
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      btn.innerHTML = origText;
      btn.disabled = false;
      return;
    }
  }

  try {
    const blobUrl = URL.createObjectURL(cachedReportBlob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      btn.innerHTML = origText;
      btn.disabled = false;
      showToast("Report Saved", "Saved to device downloads!", false);
      triggerHaptic([20, 60, 20]);
    }, 600);
  } catch (e) {
    btn.innerHTML = origText;
    btn.disabled = false;
    window.open(cachedReportDataUrl, "_blank");
  }
});

// =========================================================
// RELIABLE OTA BACKGROUND UPDATE CHECKER (v1.0.4)
// =========================================================
const LOCAL_CURRENT_VER = "1.0.2"; 
const REMOTE_MANIFEST = "https://Flashcard-Reader.surge.sh/version.json";

async function triggerOTACheck() {
  const otaModal = document.getElementById("ota-update-modal");
  const otaNewVer = document.getElementById("ota-new-ver");
  const otaBtnLater = document.getElementById("ota-btn-later");
  const otaBtnApply = document.getElementById("ota-btn-apply");

  if (!otaModal) return;

  try {
    const response = await fetch(REMOTE_MANIFEST + "?nocache=" + new Date().getTime(), {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) return;
    const remoteData = await response.json();
    const installedVer = localStorage.getItem("fc_installed_ver") || LOCAL_CURRENT_VER;

    if (remoteData.version && remoteData.version !== installedVer) {
      otaNewVer.textContent = "v" + remoteData.version;
      otaModal.classList.add("open");
      triggerHaptic(14);

      otaBtnLater.onclick = () => {
        otaModal.classList.remove("open");
        triggerHaptic(8);
      };

      otaBtnApply.onclick = async () => {
        otaBtnApply.textContent = "Updating...";
        otaBtnApply.disabled = true;

        try {
          const [hRes, cRes, jRes] = await Promise.all([
            fetch("https://Flashcard-Reader.surge.sh/index.html?t=" + Date.now()),
            fetch("https://Flashcard-Reader.surge.sh/style.css?t=" + Date.now()),
            fetch("https://Flashcard-Reader.surge.sh/app.js?t=" + Date.now())
          ]);

          localStorage.setItem("fc_installed_ver", remoteData.version);
          triggerHaptic([20, 50, 20]);
          window.location.reload();
        } catch (e) {
          showToast("Update Failed", "Could not complete update. Retrying later.");
          otaModal.classList.remove("open");
        }
      };
    }
  } catch (err) {
    console.log("Silent OTA check completed without updates.");
  }
}

setTimeout(triggerOTACheck, 1500);
window.addEventListener("online", triggerOTACheck);
