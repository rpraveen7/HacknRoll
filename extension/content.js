const DEFAULT_SETTINGS = {
  enabled: true,
  apiUrl: "",
  apiKey: "",
  sleepThresholdMs: 2000,
  minSleepMs: 5000
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  overlay: null
};

const loadSettings = async () => {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  state.settings = { ...DEFAULT_SETTINGS, ...stored };
};

const saveSummary = async (payload) => {
  const { summaries = [] } = await chrome.storage.local.get({ summaries: [] });
  summaries.unshift(payload);
  await chrome.storage.local.set({ summaries: summaries.slice(0, 20) });
};

const ensureOverlay = () => {
  if (state.overlay) return state.overlay;
  const overlay = document.createElement("div");
  overlay.id = "sleep-detector-overlay";
  overlay.className = "sleep-detector-overlay";
  overlay.innerHTML = `
    <div class="sleep-detector-card">
      <div class="sleep-detector-title">Sleep Detector</div>
      <div class="sleep-detector-status" data-status>Initializing…</div>
      <div class="sleep-detector-summary" data-summary></div>
    </div>
  `;
  document.documentElement.appendChild(overlay);
  state.overlay = overlay;
  return overlay;
};

const updateOverlay = (status, summary) => {
  const overlay = ensureOverlay();
  const statusEl = overlay.querySelector("[data-status]");
  const summaryEl = overlay.querySelector("[data-summary]");
  if (statusEl) statusEl.textContent = status;
  if (summaryEl) summaryEl.textContent = summary || "";
};

const injectScript = async () => {
  const existing = document.querySelector("script[data-sleep-detector]");
  if (existing) return;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.type = "module";
  script.dataset.sleepDetector = "true";
  document.documentElement.appendChild(script);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("styles.css");
  document.documentElement.appendChild(link);
};

const postSettings = () => {
  window.postMessage({
    source: "sleep-detector-extension",
    type: "settings",
    payload: {
      enabled: state.settings.enabled,
      sleepThresholdMs: state.settings.sleepThresholdMs,
      minSleepMs: state.settings.minSleepMs
    }
  }, "*");
};

const sendAudioForSummary = async (audioBlob, interval) => {
  if (!state.settings.apiUrl) {
    updateOverlay("Missing API URL", "Open the extension popup to configure.");
    return;
  }

  const formData = new FormData();
  formData.append("audio", audioBlob, "sleep-audio.webm");
  formData.append("sleepStart", interval.start.toString());
  formData.append("sleepEnd", interval.end.toString());

  const response = await fetch(state.settings.apiUrl, {
    method: "POST",
    headers: state.settings.apiKey
      ? { Authorization: `Bearer ${state.settings.apiKey}` }
      : undefined,
    body: formData
  });

  if (!response.ok) {
    const message = `Summary request failed (${response.status})`;
    updateOverlay(message, "");
    return;
  }

  const data = await response.json();
  const summary = data.summary || "No summary returned.";
  updateOverlay("Summary ready", summary);
  await saveSummary({
    summary,
    transcript: data.transcript || "",
    interval,
    createdAt: Date.now()
  });
};

const handleMessage = async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "sleep-detector-inject") return;

  const { type, payload } = event.data;
  if (type === "status") {
    updateOverlay(payload.status, payload.summary);
  }
  if (type === "sleep-interval" && payload?.audioBuffer) {
    const audioBlob = new Blob([payload.audioBuffer], { type: payload.mimeType || "audio/webm" });
    updateOverlay("Analyzing missed content…", "");
    await sendAudioForSummary(audioBlob, payload.interval);
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled || changes.apiUrl || changes.apiKey || changes.sleepThresholdMs || changes.minSleepMs) {
    loadSettings().then(postSettings);
  }
});

const init = async () => {
  await loadSettings();
  if (!state.settings.enabled) return;
  ensureOverlay();
  await injectScript();
  postSettings();
  window.addEventListener("message", handleMessage);
};

init();
