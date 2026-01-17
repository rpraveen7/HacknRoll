const DEFAULT_SETTINGS = {
  enabled: true,
  apiUrl: "",
  apiKey: "",
  sleepThresholdMs: 2000,
  minSleepMs: 5000
};

const fields = {
  enabled: document.getElementById("enabled"),
  apiUrl: document.getElementById("apiUrl"),
  apiKey: document.getElementById("apiKey"),
  sleepThresholdMs: document.getElementById("sleepThresholdMs"),
  minSleepMs: document.getElementById("minSleepMs")
};

const summariesEl = document.getElementById("summaries");

const loadSettings = async () => {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fields.enabled.checked = stored.enabled;
  fields.apiUrl.value = stored.apiUrl;
  fields.apiKey.value = stored.apiKey;
  fields.sleepThresholdMs.value = stored.sleepThresholdMs;
  fields.minSleepMs.value = stored.minSleepMs;
};

const saveSettings = async () => {
  await chrome.storage.sync.set({
    enabled: fields.enabled.checked,
    apiUrl: fields.apiUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    sleepThresholdMs: Number(fields.sleepThresholdMs.value),
    minSleepMs: Number(fields.minSleepMs.value)
  });
};

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
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
  await renderSummaries();
  document.getElementById("save").addEventListener("click", async () => {
    await saveSettings();
    await renderSummaries();
  });
};

init();
