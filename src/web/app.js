import { loadDefaultJapaneseParser } from "budoux";
import * as htmlToImage from "html-to-image";
import JSZip from "jszip";

// BudouX Japanese parser
const jpParser = loadDefaultJapaneseParser();

// Default initial data
const DEFAULT_CONFIG = {
  date: "2026.08.29 FRI",
  event: "LT FES",
};

const DEFAULT_SCHEDULE = [
  {
    handleName: "",
    title: "",
    tags: [],
  },
];

// App State
const state = {
  config: { ...DEFAULT_CONFIG },
  schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
  activeTab: "timetable", // 'timetable' or index (0, 1, 2...)
  isProcessing: false,
};

// LocalStorage helpers
const STORAGE_KEY = "lt_slide_generator_data_v2";

function saveToLocalStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ config: state.config, schedule: state.schedule })
    );
  } catch (e) {
    console.warn("Failed to save to localStorage:", e);
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.config) state.config = { ...DEFAULT_CONFIG, ...data.config };
      if (Array.isArray(data.schedule) && data.schedule.length > 0) {
        state.schedule = data.schedule;
      }
    }
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
  }
}

// Formatting & HTML rendering functions
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLine(line) {
  const parts = jpParser.parse(line);
  return parts.map(escapeHtml).join("<wbr>");
}

function renderTitle(title) {
  return String(title || "")
    .split("\n")
    .map(renderLine)
    .join("<br>");
}

function fileName({ handleName, title }, index) {
  const slug = (handleName || `talk-${index + 1}`).replace(
    /[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]+/g,
    "_"
  );
  return `${String(index + 1).padStart(2, "0")}_${slug}.png`;
}

// Generate Individual Talk Slide HTML
function renderPerTalkHtml(talk, index, total, config) {
  const slotStr = String(index + 1).padStart(2, "0");
  const tagsHtml = (talk.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  return `
    <div class="stage">
      <div class="corner tl"></div>
      <div class="corner tr"></div>
      <div class="corner bl"></div>
      <div class="corner br"></div>

      <div class="header">
        <div class="brand"><span class="dot"></span>LIGHTNING&nbsp;TALK</div>
        <div class="meta">${escapeHtml(config.date)}</div>
      </div>

      <div class="content">
        <div class="number">
          <span class="no-label">No.</span>
          <span class="no-value">${slotStr}</span>
        </div>
        <div class="title">${renderTitle(talk.title)}</div>
        <div class="divider"></div>
        <div class="handle">${escapeHtml(talk.handleName || "")}</div>
        <div class="tags">${tagsHtml}</div>
      </div>

      <div class="footer">
        <span>${escapeHtml(config.event)}</span>
        <span>全 ${total} セッション</span>
      </div>
    </div>
  `;
}

// Generate Timetable Slide HTML
function renderTimetableHtml(schedule, config) {
  const total = schedule.length;
  const stageClass = total > 3 ? "compact" : "";

  const cardsHtml = schedule
    .map((talk, i) => {
      const slotStr = String(i + 1).padStart(2, "0");
      const tagsHtml = (talk.tags || [])
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join("");
      return `
        <div class="tt-card">
          <div class="slot">No.${slotStr}</div>
          <div class="handle">${escapeHtml(talk.handleName || "")}</div>
          <div class="title">${renderTitle(talk.title)}</div>
          <div class="tags">${tagsHtml}</div>
        </div>
      `;
    })
    .join("\n");

  return `
    <div class="stage tt-stage ${stageClass}">
      <div class="tt-header">
        <div class="h-left">
          <div class="kicker">LIGHTNING&nbsp;TALK</div>
          <h1>タイムテーブル</h1>
        </div>
        <div class="h-right">
          <div class="num">${total}</div>
          <div>セッション</div>
        </div>
      </div>

      <div class="tt-grid">
        ${cardsHtml}
      </div>

      <div class="tt-footer">
        <span>${escapeHtml(config.date)}</span>
        <span>${escapeHtml(config.event)}</span>
      </div>
    </div>
  `;
}

// DOM Elements
const previewViewport = document.getElementById("preview-viewport");
const slideScaler = document.getElementById("slide-scaler");
const viewTabsContainer = document.getElementById("view-tabs");
const sessionListContainer = document.getElementById("session-list");
const offscreenContainer = document.getElementById("offscreen-container");
const eventInput = document.getElementById("event-name");
const dateInput = document.getElementById("event-date");
const btnAddSession = document.getElementById("btn-add-session");
const btnExportCurrent = document.getElementById("btn-export-current");
const btnExportAll = document.getElementById("btn-export-all");
const btnImportJson = document.getElementById("btn-import-json");
const btnExportJson = document.getElementById("btn-export-json");
const btnResetData = document.getElementById("btn-reset-data");
const fileInput = document.getElementById("file-input");
const modalOverlay = document.getElementById("progress-modal");
const modalStatus = document.getElementById("modal-status");
const progressBarFill = document.getElementById("progress-bar-fill");
const prevSlideBtn = document.getElementById("btn-prev-slide");
const nextSlideBtn = document.getElementById("btn-next-slide");

// Auto-scaler: fits 1920x1080 stage inside preview viewport
function updateScaler() {
  if (!previewViewport || !slideScaler) return;
  const rect = previewViewport.getBoundingClientRect();
  const pad = 48;
  const availableWidth = rect.width - pad;
  const availableHeight = rect.height - pad;

  if (availableWidth <= 0 || availableHeight <= 0) return;

  const scale = Math.min(availableWidth / 1920, availableHeight / 1080);
  slideScaler.style.transform = `scale(${scale})`;
}

const resizeObserver = new ResizeObserver(() => {
  updateScaler();
});
resizeObserver.observe(previewViewport);
window.addEventListener("resize", updateScaler);

// Update preview content
function updatePreview() {
  if (state.activeTab === "timetable") {
    slideScaler.innerHTML = renderTimetableHtml(state.schedule, state.config);
  } else {
    const idx = parseInt(state.activeTab, 10);
    const talk = state.schedule[idx];
    if (talk) {
      slideScaler.innerHTML = renderPerTalkHtml(
        talk,
        idx,
        state.schedule.length,
        state.config
      );
    } else {
      slideScaler.innerHTML = renderTimetableHtml(state.schedule, state.config);
      state.activeTab = "timetable";
    }
  }
}

// Render Tabs in Toolbar
function renderTabs() {
  viewTabsContainer.innerHTML = "";

  // Timetable tab
  const ttBtn = document.createElement("button");
  ttBtn.className = `view-tab ${state.activeTab === "timetable" ? "active" : ""}`;
  ttBtn.textContent = "タイムテーブル全体";
  ttBtn.addEventListener("click", () => {
    state.activeTab = "timetable";
    renderTabs();
    updatePreview();
    highlightActiveCard();
  });
  viewTabsContainer.appendChild(ttBtn);

  // Individual tabs
  state.schedule.forEach((talk, idx) => {
    const btn = document.createElement("button");
    const num = String(idx + 1).padStart(2, "0");
    const name = talk.handleName ? ` ${talk.handleName}` : "";
    btn.className = `view-tab ${state.activeTab === idx ? "active" : ""}`;
    btn.textContent = `No.${num}${name}`;
    btn.addEventListener("click", () => {
      state.activeTab = idx;
      renderTabs();
      updatePreview();
      highlightActiveCard();
    });
    viewTabsContainer.appendChild(btn);
  });
}

function highlightActiveCard() {
  const cards = sessionListContainer.querySelectorAll(".session-card");
  cards.forEach((card, idx) => {
    if (state.activeTab === idx) {
      card.classList.add("is-active");
    } else {
      card.classList.remove("is-active");
    }
  });
}

// Render Session list in Editor Pane
function renderSessionList() {
  sessionListContainer.innerHTML = "";

  state.schedule.forEach((talk, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const card = document.createElement("div");
    card.className = `session-card ${state.activeTab === idx ? "is-active" : ""}`;

    card.innerHTML = `
      <div class="session-card-header">
        <span class="session-badge">No. ${num}</span>
        <div class="session-card-actions">
          <button class="icon-btn btn-view" title="このスライドをプレビュー" data-action="preview">
            👁️ 表示
          </button>
          <button class="icon-btn" title="上へ移動" data-action="up" ${idx === 0 ? "disabled" : ""}>
            ↑
          </button>
          <button class="icon-btn" title="下へ移動" data-action="down" ${idx === state.schedule.length - 1 ? "disabled" : ""}>
            ↓
          </button>
          <button class="icon-btn btn-danger" title="削除" data-action="delete">
            ✕
          </button>
        </div>
      </div>
      <div class="field-group">
        <label>登壇者 (handleName)</label>
        <input type="text" class="input-text handle-input" value="${escapeHtml(talk.handleName || "")}" placeholder="例: 登壇者A" />
      </div>
      <div class="field-group">
        <label>発表タイトル (改行可)</label>
        <textarea class="input-textarea title-input" rows="2" placeholder="例: 発表タイトルを入力">${escapeHtml(talk.title || "")}</textarea>
      </div>
      <div class="field-group">
        <label>タグ (カンマまたはスペース区切り)</label>
        <input type="text" class="input-text tags-input" value="${escapeHtml((talk.tags || []).join(", "))}" placeholder="例: Web, 設計, Tips" />
      </div>
    `;

    // Event listeners
    const handleInput = card.querySelector(".handle-input");
    const titleInput = card.querySelector(".title-input");
    const tagsInput = card.querySelector(".tags-input");

    handleInput.addEventListener("input", (e) => {
      talk.handleName = e.target.value;
      updatePreview();
      renderTabs();
      saveToLocalStorage();
    });

    titleInput.addEventListener("input", (e) => {
      talk.title = e.target.value;
      updatePreview();
      saveToLocalStorage();
    });

    tagsInput.addEventListener("input", (e) => {
      const raw = e.target.value;
      talk.tags = raw
        .split(/[,、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      updatePreview();
      saveToLocalStorage();
    });

    // Header actions
    card.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === "preview") {
        state.activeTab = idx;
        renderTabs();
        updatePreview();
        highlightActiveCard();
      } else if (action === "up" && idx > 0) {
        const temp = state.schedule[idx - 1];
        state.schedule[idx - 1] = state.schedule[idx];
        state.schedule[idx] = temp;
        if (state.activeTab === idx) state.activeTab = idx - 1;
        else if (state.activeTab === idx - 1) state.activeTab = idx;
        refreshAll();
      } else if (action === "down" && idx < state.schedule.length - 1) {
        const temp = state.schedule[idx + 1];
        state.schedule[idx + 1] = state.schedule[idx];
        state.schedule[idx] = temp;
        if (state.activeTab === idx) state.activeTab = idx + 1;
        else if (state.activeTab === idx + 1) state.activeTab = idx;
        refreshAll();
      } else if (action === "delete") {
        if (state.schedule.length <= 1) {
          alert("最後の1セッションは削除できません。");
          return;
        }
        state.schedule.splice(idx, 1);
        if (state.activeTab === idx) {
          state.activeTab = "timetable";
        } else if (typeof state.activeTab === "number" && state.activeTab > idx) {
          state.activeTab -= 1;
        }
        refreshAll();
      }
    });

    sessionListContainer.appendChild(card);
  });
}

function refreshAll() {
  saveToLocalStorage();
  renderSessionList();
  renderTabs();
  updatePreview();
}

// Navigation buttons (Prev / Next)
prevSlideBtn.addEventListener("click", () => {
  if (state.activeTab === "timetable") {
    state.activeTab = state.schedule.length - 1;
  } else if (state.activeTab === 0) {
    state.activeTab = "timetable";
  } else {
    state.activeTab -= 1;
  }
  renderTabs();
  updatePreview();
  highlightActiveCard();
});

nextSlideBtn.addEventListener("click", () => {
  if (state.activeTab === "timetable") {
    state.activeTab = 0;
  } else if (state.activeTab === state.schedule.length - 1) {
    state.activeTab = "timetable";
  } else {
    state.activeTab += 1;
  }
  renderTabs();
  updatePreview();
  highlightActiveCard();
});

// Event Settings Input handlers
eventInput.addEventListener("input", (e) => {
  state.config.event = e.target.value;
  updatePreview();
  saveToLocalStorage();
});

dateInput.addEventListener("input", (e) => {
  state.config.date = e.target.value;
  updatePreview();
  saveToLocalStorage();
});

// Add new session
btnAddSession.addEventListener("click", () => {
  const newIndex = state.schedule.length;
  state.schedule.push({
    handleName: "",
    title: "",
    tags: [],
  });
  state.activeTab = newIndex;
  refreshAll();

  // Scroll to bottom of editor
  setTimeout(() => {
    const cards = sessionListContainer.querySelectorAll(".session-card");
    const lastCard = cards[cards.length - 1];
    if (lastCard) {
      lastCard.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = lastCard.querySelector(".handle-input");
      if (input) input.focus();
    }
  }, 50);
});

// Helper: Download Blob as file
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// High-res Image capture via html-to-image
async function captureSlideToBlob(htmlContent) {
  offscreenContainer.innerHTML = htmlContent;
  await document.fonts.ready;
  // Let DOM layout finish
  await new Promise((resolve) => setTimeout(resolve, 50));

  const targetNode = offscreenContainer.firstElementChild;
  const blob = await htmlToImage.toBlob(targetNode, {
    pixelRatio: 1,
    width: 1920,
    height: 1080,
    canvasWidth: 1920,
    canvasHeight: 1080,
    cacheBust: true,
    skipFonts: true,
  });
  offscreenContainer.innerHTML = "";
  return blob;
}

// Export Current Slide
btnExportCurrent.addEventListener("click", async () => {
  if (state.isProcessing) return;
  state.isProcessing = true;
  btnExportCurrent.disabled = true;
  btnExportCurrent.textContent = "生成中...";

  try {
    let html = "";
    let filename = "";
    if (state.activeTab === "timetable") {
      html = renderTimetableHtml(state.schedule, state.config);
      filename = "timetable.png";
    } else {
      const idx = parseInt(state.activeTab, 10);
      const talk = state.schedule[idx];
      html = renderPerTalkHtml(talk, idx, state.schedule.length, state.config);
      filename = fileName(talk, idx);
    }

    const blob = await captureSlideToBlob(html);
    downloadBlob(blob, filename);
  } catch (err) {
    console.error("Export failed:", err);
    alert("画像のエクスポートに失敗しました: " + err.message);
  } finally {
    state.isProcessing = false;
    btnExportCurrent.disabled = false;
    btnExportCurrent.textContent = "現在のスライドを保存 (PNG)";
  }
});

// Export All Slides as ZIP
btnExportAll.addEventListener("click", async () => {
  if (state.isProcessing) return;
  state.isProcessing = true;
  modalOverlay.classList.add("is-visible");
  progressBarFill.style.width = "0%";

  const totalSteps = state.schedule.length + 1; // timetable + all talks
  let currentStep = 0;

  function updateProgress(step, message) {
    const pct = Math.round((step / totalSteps) * 100);
    progressBarFill.style.width = `${pct}%`;
    modalStatus.textContent = `${message} (${step}/${totalSteps})`;
  }

  try {
    const zip = new JSZip();

    // 1. Timetable
    updateProgress(0, "タイムテーブル画像を生成中...");
    const ttHtml = renderTimetableHtml(state.schedule, state.config);
    const ttBlob = await captureSlideToBlob(ttHtml);
    zip.file("timetable.png", ttBlob);
    currentStep++;

    // 2. Individual talks
    const perTalkFolder = zip.folder("per-talk");
    for (let i = 0; i < state.schedule.length; i++) {
      const talk = state.schedule[i];
      const fn = fileName(talk, i);
      updateProgress(currentStep, `No.${i + 1} (${talk.handleName || "未定"}) 生成中...`);
      const talkHtml = renderPerTalkHtml(
        talk,
        i,
        state.schedule.length,
        state.config
      );
      const talkBlob = await captureSlideToBlob(talkHtml);
      perTalkFolder.file(fn, talkBlob);
      currentStep++;
    }

    // 3. Zip compression
    modalStatus.textContent = "ZIPアーカイブを作成中...";
    progressBarFill.style.width = "100%";
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const safeDate = (state.config.date || "LT").replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadBlob(zipBlob, `LT_slides_${safeDate}.zip`);
  } catch (err) {
    console.error("ZIP export failed:", err);
    alert("ZIPの生成に失敗しました: " + err.message);
  } finally {
    setTimeout(() => {
      modalOverlay.classList.remove("is-visible");
      state.isProcessing = false;
    }, 500);
  }
});

// JSON Export
btnExportJson.addEventListener("click", () => {
  const data = {
    config: state.config,
    schedule: state.schedule,
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  downloadBlob(blob, "schedule_export.json");
});

// JSON Import
btnImportJson.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const content = JSON.parse(event.target.result);
      if (Array.isArray(content)) {
        // Standard schedule.json format
        state.schedule = content;
      } else if (content && typeof content === "object") {
        if (content.config) state.config = { ...state.config, ...content.config };
        if (Array.isArray(content.schedule)) state.schedule = content.schedule;
      }
      eventInput.value = state.config.event;
      dateInput.value = state.config.date;
      state.activeTab = "timetable";
      refreshAll();
      alert("JSONファイルを正常に読み込みました！");
    } catch (err) {
      alert("JSONファイルの解析に失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
  fileInput.value = "";
});

// Reset Data
btnResetData.addEventListener("click", () => {
  if (!confirm("初期サンプルデータにリセットしますか？現在の編集内容は失われます。")) {
    return;
  }
  state.config = { ...DEFAULT_CONFIG };
  state.schedule = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
  eventInput.value = state.config.event;
  dateInput.value = state.config.date;
  state.activeTab = "timetable";
  refreshAll();
});

// Drag and drop JSON file onto window
window.addEventListener("dragover", (e) => {
  e.preventDefault();
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.name.endsWith(".json")) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const content = JSON.parse(event.target.result);
      if (Array.isArray(content)) {
        state.schedule = content;
      } else if (content && typeof content === "object") {
        if (content.config) state.config = { ...state.config, ...content.config };
        if (Array.isArray(content.schedule)) state.schedule = content.schedule;
      }
      eventInput.value = state.config.event;
      dateInput.value = state.config.date;
      state.activeTab = "timetable";
      refreshAll();
      alert(`「${file.name}」を読み込みました！`);
    } catch (err) {
      alert("JSONの読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
});

// Initialization
function init() {
  loadFromLocalStorage();
  eventInput.value = state.config.event;
  dateInput.value = state.config.date;
  renderSessionList();
  renderTabs();
  updatePreview();
  setTimeout(updateScaler, 50);
}

init();
