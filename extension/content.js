const DEFAULT_SETTINGS = {
  enabled: true,
  appUrl: "http://localhost:3000",
  apiUrl: "http://localhost:3000/api/summarize",
  apiKey: "",
  sleepThresholdMs: 2000,
  minSleepMs: 5000
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  overlay: null,
  detectorFrame: null,
  isSleeping: false,
  sleepStart: null,
  mediaRecorder: null,
  recordedChunks: [],
  mediaStream: null,
  activeMedia: null,
  transcriptSegments: [],
  transcriptListeners: [],
  lastTranscriptText: "",
  initialized: false,
  domCaptionObserver: null,
  domCaptionSearchTimer: null,
  domCaptionContainer: null,
  audioContext: null,
  audioSourceNode: null,
  audioDestination: null,
  audioSourceElement: null,
  tabCaptureActive: false,
  pendingInterval: null
};

const loadSettings = async () => {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  state.settings = { ...DEFAULT_SETTINGS, ...stored };
};

const saveSummary = async (payload) => {
  const { summaries = [] } = await chrome.storage.local.get({ summaries: [] });
  summaries.unshift(payload);
  try {
    await chrome.storage.local.set({ summaries: summaries.slice(0, 20) });
  } catch (error) {
    await chrome.storage.local.set({ summaries: summaries.slice(0, 5) });
  }
  await postRecord("summary", payload);
};

const compressDataUrl = (dataUrl, maxSize = 320, quality = 0.7) => new Promise((resolve) => {
  if (!dataUrl || !dataUrl.startsWith("data:image")) {
    resolve(dataUrl);
    return;
  }

  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(dataUrl);
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);
    resolve(canvas.toDataURL("image/jpeg", quality));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

const saveScreenshot = async (payload) => {
  const compressedDataUrl = await compressDataUrl(payload.dataUrl);
  const entry = { ...payload, dataUrl: compressedDataUrl };
  const { screenshots = [] } = await chrome.storage.local.get({ screenshots: [] });
  screenshots.unshift(entry);
  try {
    await chrome.storage.local.set({ screenshots: screenshots.slice(0, 10) });
  } catch (error) {
    await chrome.storage.local.set({ screenshots: screenshots.slice(0, 3) });
  }
  await postRecord("screenshot", entry);
};

const ensureStyles = () => {
  const existing = document.querySelector("link[data-sleep-detector-style]");
  if (existing) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("styles.css");
  link.dataset.sleepDetectorStyle = "true";
  document.documentElement.appendChild(link);
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
  overlay.innerHTML = [
    '<div class="sleep-detector-card">',
    '  <div class="sleep-detector-title">Sleep Detector</div>',
    '  <div class="sleep-detector-status" data-status>Initializing...</div>',
    '  <div class="sleep-detector-summary" data-summary></div>',
    "</div>"
  ].join("");
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

const sendRuntimeMessage = (message) => new Promise((resolve) => {
  if (!chrome?.runtime?.sendMessage) {
    resolve({ ok: false, error: "Extension messaging unavailable." });
    return;
  }
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      resolve({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    resolve(response || { ok: false, error: "No response." });
  });
});

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

const buildAppEndpoint = (path) => {
  if (!state.settings.appUrl) return "";
  try {
    const url = new URL(state.settings.appUrl);
    url.pathname = path;
    return url.toString();
  } catch (error) {
    return "";
  }
};

const postRecord = async (type, payload) => {
  const endpoint = buildAppEndpoint("/api/records");
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload })
    });
  } catch (error) {
    // ignore transient network errors
  }
};

const buildOverlayUrl = () => {
  if (!state.settings.appUrl) return "";
  try {
    const url = new URL(state.settings.appUrl);
    url.pathname = "/overlay";
    url.searchParams.set("sleepThresholdMs", String(state.settings.sleepThresholdMs));
    return url.toString();
  } catch (error) {
    return "";
  }
};

const ensureDetectorFrame = () => {
  const overlayUrl = buildOverlayUrl();
  if (!overlayUrl) {
    updateOverlay("Missing detector app URL", "Set it in the extension popup.");
    return null;
  }

  if (state.detectorFrame) {
    if (state.detectorFrame.src !== overlayUrl) {
      state.detectorFrame.src = overlayUrl;
    }
    return state.detectorFrame;
  }

  const frame = document.createElement("iframe");
  frame.src = overlayUrl;
  frame.title = "Sleep Detector";
  frame.allow = "camera; microphone";
  frame.addEventListener("load", () => {
    if (!state.isSleeping) {
      updateOverlay("Detector ready", "Watching for sleep.");
    }
  });
  frame.addEventListener("error", () => {
    updateOverlay("Detector blocked", "Use an https app URL.");
  });
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.left = "0";
  frame.style.top = "0";
  frame.style.border = "0";
  frame.style.zIndex = "2147483647";
  frame.dataset.sleepDetectorFrame = "true";
  document.documentElement.appendChild(frame);
  state.detectorFrame = frame;
  return frame;
};

const postSettings = () => {
  if (!state.detectorFrame || !state.detectorFrame.contentWindow) return;
  state.detectorFrame.contentWindow.postMessage(
    {
      source: "sleep-detector-extension",
      type: "settings",
      payload: {
        enabled: state.settings.enabled,
        sleepThresholdMs: state.settings.sleepThresholdMs,
        minSleepMs: state.settings.minSleepMs
      }
    },
    "*"
  );
};

const findActiveMediaElement = () => {
  const elements = Array.from(document.querySelectorAll("video, audio"));
  const playing = elements.filter((element) => {
    return !element.paused && !element.muted && element.readyState >= 2 && element.currentTime > 0;
  });
  const candidates = playing.length > 0 ? playing : elements.filter((element) => element.readyState >= 2);
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = 0;
  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    const score = Math.max(1, rect.width * rect.height);
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }

  return best;
};

const isYouTubeHost = () => {
  const host = window.location.hostname;
  return host === "www.youtube.com" || host === "m.youtube.com" || host.endsWith(".youtube.com");
};

const findYouTubeCaptionContainer = () => {
  if (!isYouTubeHost()) return null;
  return document.querySelector(".ytp-caption-window-container");
};

const captureDomCaption = (container) => {
  if (!container) return;
  const segments = container.querySelectorAll(".ytp-caption-segment");
  const rawText = segments.length
    ? Array.from(segments).map((segment) => segment.textContent || "").join(" ")
    : container.textContent || "";
  const text = rawText.replace(/\s+/g, " ").trim();
  if (!text || text === state.lastTranscriptText) return;
  state.lastTranscriptText = text;
  state.transcriptSegments.push({ text, timestamp: Date.now() });
};

const attachDomCaptionObserver = (container) => {
  if (!container || state.domCaptionObserver) return;
  state.domCaptionContainer = container;
  const observer = new MutationObserver(() => captureDomCaption(container));
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  state.domCaptionObserver = observer;
  captureDomCaption(container);
};

const startDomCaptionCapture = () => {
  if (!isYouTubeHost()) return false;
  const found = findYouTubeCaptionContainer();
  if (found) {
    attachDomCaptionObserver(found);
    return true;
  }

  if (state.domCaptionSearchTimer) return true;
  state.domCaptionSearchTimer = window.setInterval(() => {
    const container = findYouTubeCaptionContainer();
    if (!container) return;
    window.clearInterval(state.domCaptionSearchTimer);
    state.domCaptionSearchTimer = null;
    attachDomCaptionObserver(container);
  }, 1000);

  return true;
};

const stopDomCaptionCapture = () => {
  if (state.domCaptionSearchTimer) {
    window.clearInterval(state.domCaptionSearchTimer);
    state.domCaptionSearchTimer = null;
  }
  if (state.domCaptionObserver) {
    state.domCaptionObserver.disconnect();
    state.domCaptionObserver = null;
  }
  state.domCaptionContainer = null;
};

const startTranscriptCapture = (mediaElement) => {
  state.transcriptSegments = [];
  state.transcriptListeners = [];
  state.lastTranscriptText = "";

  if (!mediaElement || !mediaElement.textTracks || mediaElement.textTracks.length === 0) {
    return startDomCaptionCapture();
  }

  const tracks = Array.from(mediaElement.textTracks).filter((track) => {
    return track.kind === "subtitles" || track.kind === "captions";
  });
  if (tracks.length === 0) {
    return startDomCaptionCapture();
  }

  tracks.forEach((track) => {
    track.mode = "hidden";
    const handler = () => {
      const cues = Array.from(track.activeCues || []);
      cues.forEach((cue) => {
        const text = typeof cue.text === "string" ? cue.text.replace(/\s+/g, " ").trim() : "";
        if (!text || text === state.lastTranscriptText) return;
        state.lastTranscriptText = text;
        state.transcriptSegments.push({ text, timestamp: Date.now() });
      });
    };
    track.addEventListener("cuechange", handler);
    state.transcriptListeners.push({ track, handler });
  });

  startDomCaptionCapture();
  return true;
};

const stopTranscriptCapture = () => {
  state.transcriptListeners.forEach(({ track, handler }) => {
    track.removeEventListener("cuechange", handler);
  });
  state.transcriptListeners = [];
  stopDomCaptionCapture();

  const transcript = state.transcriptSegments
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  state.transcriptSegments = [];
  state.lastTranscriptText = "";

  return transcript;
};

const summarizeTranscript = (transcript) => {
  const cleaned = transcript.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) {
    return cleaned.slice(0, 400);
  }
  return sentences.slice(0, 3).join(" ").trim();
};

const getPreferredMimeType = () => {
  if (!window.MediaRecorder) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const buildAudioStreamFromMediaElement = (mediaElement) => {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  try {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }

    if (state.audioSourceElement !== mediaElement || !state.audioSourceNode) {
      const source = state.audioContext.createMediaElementSource(mediaElement);
      state.audioSourceNode = source;
      state.audioSourceElement = mediaElement;
    }

    if (!state.audioDestination) {
      state.audioDestination = state.audioContext.createMediaStreamDestination();
    }

    state.audioSourceNode.connect(state.audioDestination);
    return state.audioDestination.stream;
  } catch (error) {
    return null;
  }
};

const cleanupAudioNodes = () => {
  if (state.audioSourceNode) {
    try {
      state.audioSourceNode.disconnect();
    } catch (error) {
      // ignore
    }
  }
  if (state.audioDestination) {
    try {
      state.audioDestination.disconnect();
    } catch (error) {
      // ignore
    }
  }
  state.audioSourceNode = null;
  state.audioDestination = null;
  state.audioSourceElement = null;
};

const startTabCapture = async () => {
  if (state.tabCaptureActive) return true;
  const response = await sendRuntimeMessage({
    source: "sleep-detector-extension",
    type: "tab-capture-start"
  });
  if (!response?.ok) {
    return false;
  }
  state.tabCaptureActive = true;
  updateOverlay("Sleeping", "Capturing tab audio...");
  return true;
};

const stopTabCapture = async () => {
  if (!state.tabCaptureActive) return;
  await sendRuntimeMessage({
    source: "sleep-detector-extension",
    type: "tab-capture-stop"
  });
};

const startAudioCapture = async (mediaElement) => {
  if (state.mediaRecorder) return true;
  if (!mediaElement) return false;

  try {
    if (!window.MediaRecorder) {
      updateOverlay("Audio capture unsupported", "Enable captions or use a supported browser.");
      return;
    }

    let audioStream = null;
    if (typeof mediaElement.captureStream === "function") {
      const stream = mediaElement.captureStream();
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioStream = new MediaStream(audioTracks);
      }
    }

    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      audioStream = buildAudioStreamFromMediaElement(mediaElement);
    }

    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      updateOverlay("Audio capture blocked", "Trying tab capture.");
      return false;
    }

    const mimeType = getPreferredMimeType();
    const recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
    state.mediaRecorder = recorder;
    state.recordedChunks = [];
    state.mediaStream = audioStream;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    });

    recorder.start(1000);
    return true;
  } catch (error) {
    updateOverlay("Audio capture failed", "Captions-only summary will be used.");
    return false;
  }
};

const stopAudioCapture = async () => {
  const recorder = state.mediaRecorder;
  if (!recorder) return null;

  return new Promise((resolve) => {
    const chunks = state.recordedChunks;
    const finalize = () => {
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
      state.mediaRecorder = null;
      state.recordedChunks = [];
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach((track) => track.stop());
        state.mediaStream = null;
      }
      cleanupAudioNodes();
      resolve(blob);
    };

    if (recorder.state === "inactive") {
      finalize();
      return;
    }

    recorder.addEventListener("stop", finalize, { once: true });
    recorder.stop();
  });
};

const sendAudioForSummary = async (audioBlob, interval, transcript) => {
  if (!state.settings.apiUrl) {
    throw new Error("Missing API URL");
  }

  const formData = new FormData();
  formData.append("audio", audioBlob, "sleep-audio.webm");
  formData.append("sleepStart", interval.start.toString());
  formData.append("sleepEnd", interval.end.toString());
  if (transcript) {
    formData.append("captions", transcript);
  }

  const response = await fetch(state.settings.apiUrl, {
    method: "POST",
    headers: state.settings.apiKey
      ? { Authorization: `Bearer ${state.settings.apiKey}` }
      : undefined,
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Summary request failed (${response.status})`);
  }

  const data = await response.json();
  return {
    summary: data.summary || "No summary returned.",
    transcript: data.transcript || transcript || ""
  };
};

const finalizeSummary = async ({ interval, transcript, audioBlob, pageTitle, pageUrl }) => {
  let summaryText = "";
  let transcriptText = transcript || "";

  if (state.settings.apiUrl && audioBlob) {
    updateOverlay("Analyzing missed content...", "");
    try {
      const result = await sendAudioForSummary(audioBlob, interval, transcriptText);
      summaryText = result.summary;
      transcriptText = result.transcript;
      updateOverlay("Summary ready", summaryText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Summary failed.";
      updateOverlay("Summary failed", message);
    }
  }

  if (!summaryText) {
    summaryText = summarizeTranscript(transcriptText);
    if (!summaryText) {
      summaryText = "No transcript captured.";
    }
    updateOverlay("Summary ready", summaryText);
  }

  await saveSummary({
    summary: summaryText,
    transcript: transcriptText || "",
    interval,
    createdAt: Date.now(),
    title: pageTitle,
    url: pageUrl
  });
};

const beginSleepInterval = async (timestamp) => {
  if (state.isSleeping) return;
  state.isSleeping = true;
  state.sleepStart = timestamp || Date.now();

  state.activeMedia = findActiveMediaElement();
  const hasTranscript = startTranscriptCapture(state.activeMedia);

  let summary = "Capturing missed content...";
  if (!state.activeMedia) {
    summary = "No active media found. Tracking time only.";
  } else if (!hasTranscript && !state.settings.apiUrl) {
    summary = "Enable captions or configure summary API.";
  }

  updateOverlay("Sleeping", summary);

  if (state.settings.apiUrl) {
    let audioStarted = false;
    if (state.activeMedia) {
      audioStarted = await startAudioCapture(state.activeMedia);
    }
    if (!audioStarted) {
      audioStarted = await startTabCapture();
      if (audioStarted) {
        updateOverlay("Sleeping", "Capturing tab audio...");
      }
    }
  }
};

const endSleepInterval = async (timestamp) => {
  if (!state.isSleeping) return;
  state.isSleeping = false;

  const start = state.sleepStart || Date.now();
  const end = timestamp || Date.now();
  state.sleepStart = null;

  const durationMs = end - start;
  const transcript = stopTranscriptCapture();
  state.activeMedia = null;

  if (durationMs < state.settings.minSleepMs) {
    updateOverlay("Sleep too short", "No summary saved.");
    return;
  }

  const interval = { start, end };
  const pageTitle = document.title;
  const pageUrl = window.location.href;

  if (state.tabCaptureActive) {
    state.pendingInterval = {
      interval,
      transcript,
      pageTitle,
      pageUrl
    };
    updateOverlay("Analyzing missed content...", "");
    await stopTabCapture();
    return;
  }

  let audioBlob = await stopAudioCapture();
  if (audioBlob && audioBlob.size > MAX_AUDIO_BYTES) {
    updateOverlay("Audio too long", "Turn on captions or shorten the sleep window.");
    audioBlob = null;
  }
  if (!audioBlob || !audioBlob.size) {
    updateOverlay("Audio capture empty", "Turn on captions or keep the tab active.");
  }
  await finalizeSummary({
    interval,
    transcript,
    audioBlob,
    pageTitle,
    pageUrl
  });
};

const handleOverlayMessage = async (event) => {
  if (!state.settings.enabled) return;
  if (!event.data || event.data.source !== "sleep-detector-overlay") return;

  const { type, payload } = event.data;
  if (type === "sleep-state" && payload) {
    if (payload.isAsleep) {
      await beginSleepInterval(payload.timestamp);
    } else {
      await endSleepInterval(payload.timestamp);
    }
  }

  if (type === "screenshot" && payload && payload.dataUrl) {
    await saveScreenshot({
      dataUrl: payload.dataUrl,
      createdAt: payload.createdAt || Date.now(),
      title: document.title,
      url: window.location.href
    });
  }
};

const handleTabCaptureMessage = async (message) => {
  if (!message || message.source !== "sleep-detector-tab-capture") return;

  if (message.type === "tab-capture-error") {
    state.tabCaptureActive = false;
    state.pendingInterval = null;
    updateOverlay("Audio capture blocked", message.error || "Turn on captions or check API.");
    return;
  }

  if (message.type === "tab-capture-data") {
    state.tabCaptureActive = false;
    const pending = state.pendingInterval;
    state.pendingInterval = null;
    if (!pending) return;

    if (message.byteLength && message.byteLength > MAX_AUDIO_BYTES) {
      updateOverlay("Audio too long", "Turn on captions or shorten the sleep window.");
    }

    const audioBlob = message.audioBuffer
      ? new Blob([message.audioBuffer], { type: message.mimeType || "audio/webm" })
      : null;
    if (!audioBlob || !audioBlob.size) {
      updateOverlay("Audio capture empty", "Turn on captions or keep the tab active.");
    }

    await finalizeSummary({
      interval: pending.interval,
      transcript: pending.transcript,
      audioBlob,
      pageTitle: pending.pageTitle,
      pageUrl: pending.pageUrl
    });
  }
};

const teardown = () => {
  stopTranscriptCapture();
  stopAudioCapture();
  state.isSleeping = false;
  state.sleepStart = null;
  state.pendingInterval = null;
  if (state.tabCaptureActive) {
    stopTabCapture();
    state.tabCaptureActive = false;
  }
  if (state.detectorFrame) {
    state.detectorFrame.remove();
    state.detectorFrame = null;
  }
  if (state.overlay) {
    state.overlay.remove();
    state.overlay = null;
  }
};

const syncWithSettings = async () => {
  if (!state.settings.enabled) {
    teardown();
    return;
  }

  ensureStyles();
  ensureOverlay();
  ensureDetectorFrame();
  if (!state.isSleeping) {
    updateOverlay("Watching for sleep", "Keep the video playing.");
  }
  postSettings();
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
  if (changes.enabled || changes.apiUrl || changes.apiKey || changes.sleepThresholdMs || changes.minSleepMs || changes.appUrl) {
    loadSettings().then(syncWithSettings);
  }
});

const init = async () => {
  await loadSettings();
  if (!state.initialized) {
    window.addEventListener("message", handleOverlayMessage);
    chrome.runtime.onMessage.addListener(handleTabCaptureMessage);
    state.initialized = true;
  }
  await syncWithSettings();
};

init();
