const DEFAULT_SETTINGS = {
  enabled: true,
  appUrl: "http://localhost:3000",
  apiUrl: "http://localhost:3000/api/summarize",
  apiKey: "",
  sleepThresholdMs: 2000,
  minSleepMs: 5000
};

const fields = {
  enabled: document.getElementById("enabled"),
  appUrl: document.getElementById("appUrl"),
  apiUrl: document.getElementById("apiUrl"),
  apiKey: document.getElementById("apiKey"),
  sleepThresholdMs: document.getElementById("sleepThresholdMs"),
  minSleepMs: document.getElementById("minSleepMs")
};

const summariesEl = document.getElementById("summaries");
const screenshotsEl = document.getElementById("screenshots");

const loadSettings = async () => {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fields.enabled.checked = stored.enabled;
  fields.appUrl.value = stored.appUrl;
  fields.apiUrl.value = stored.apiUrl;
  fields.apiKey.value = stored.apiKey;
  fields.sleepThresholdMs.value = stored.sleepThresholdMs;
  fields.minSleepMs.value = stored.minSleepMs;
};

const saveSettings = async () => {
  await chrome.storage.sync.set({
    enabled: fields.enabled.checked,
    appUrl: fields.appUrl.value.trim(),
    apiUrl: fields.apiUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    sleepThresholdMs: Number(fields.sleepThresholdMs.value),
    minSleepMs: Number(fields.minSleepMs.value)
  });
};

const buildAppLink = (path) => {
  const base = fields.appUrl.value.trim() || DEFAULT_SETTINGS.appUrl;
  try {
    const url = new URL(base);
    url.pathname = path;
    return url.toString();
  } catch (error) {
    return "";
  }
};

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const renderScreenshots = async () => {
  const { screenshots = [] } = await chrome.storage.local.get({ screenshots: [] });
  screenshotsEl.innerHTML = "";

  if (screenshots.length === 0) {
    screenshotsEl.innerHTML = '<p style="font-size:12px; color:#94a3b8;">No snapshots yet.</p>';
    return;
  }

  screenshots.slice(0, 6).forEach((item) => {
    const div = document.createElement("div");
    div.className = "snapshot";
    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = item.title ? `Snapshot from ${item.title}` : "Snapshot";
    div.appendChild(img);
    screenshotsEl.appendChild(div);
  });
};

const renderSummaries = async () => {
  const { summaries = [] } = await chrome.storage.local.get({ summaries: [] });
  summariesEl.innerHTML = "";

  if (summaries.length === 0) {
    summariesEl.innerHTML = '<p style="font-size:12px; color:#94a3b8;">No summaries yet.</p>';
    return;
  }

  summaries.slice(0, 3).forEach((item) => {
    const div = document.createElement("div");
    div.className = "summary";
    div.innerHTML = `
      <strong>${formatTimestamp(item.interval.start)} → ${formatTimestamp(item.interval.end)}</strong>
      <span>${item.summary}</span>
    `;
    summariesEl.appendChild(div);
  });
};

const init = async () => {
  await loadSettings();
  await renderScreenshots();
  await renderSummaries();
  document.getElementById("save").addEventListener("click", async () => {
    await saveSettings();
    await renderScreenshots();
    await renderSummaries();
  });
  document.getElementById("openDashboard").addEventListener("click", () => {
    const url = buildAppLink("/dashboard");
    if (!url) return;
    chrome.tabs.create({ url });
  });
};

init();
