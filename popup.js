"use strict";

const DEFAULT_SETTINGS = {
  enabled: true,
  kitsuUrl: ""
};

const enabledInput = document.getElementById("enabled");
const urlInput = document.getElementById("kitsu-url");
const saveButton = document.getElementById("save");
const currentTabButton = document.getElementById("use-current-tab");
const statusElement = document.getElementById("status");

function normalizeOrigin(rawUrl) {
  let value = String(rawUrl || "").trim();

  if (!value) {
    throw new Error("آدرس Kitsu را وارد کنید.");
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("آدرس واردشده معتبر نیست.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("آدرس باید با http یا https باشد.");
  }

  return parsed.origin;
}

function showStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`.trim();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0] || null;
}

async function reloadActiveTab() {
  const tab = await getActiveTab();

  if (tab?.id) {
    await chrome.tabs.reload(tab.id);
  }
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  enabledInput.checked = Boolean(settings.enabled);
  urlInput.value = settings.kitsuUrl || "";
}

currentTabButton.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();

    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
      throw new Error("آدرس تب فعلی قابل استفاده نیست.");
    }

    urlInput.value = new URL(tab.url).origin;
    showStatus("آدرس تب فعلی قرار گرفت.", "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  showStatus("");

  try {
    const normalizedUrl = normalizeOrigin(urlInput.value);

    await chrome.storage.sync.set({
      enabled: enabledInput.checked,
      kitsuUrl: normalizedUrl
    });

    urlInput.value = normalizedUrl;

    showStatus(
      enabledInput.checked
        ? "تنظیمات ذخیره شد. صفحه در حال بازخوانی است."
        : "اکستنشن غیرفعال شد. صفحه در حال بازخوانی است.",
      "success"
    );

    await reloadActiveTab();

    setTimeout(() => window.close(), 350);
  } catch (error) {
    showStatus(error.message, "error");
    saveButton.disabled = false;
  }
});

enabledInput.addEventListener("change", () => {
  showStatus(
    enabledInput.checked
      ? "برای اعمال، تنظیمات را ذخیره کنید."
      : "پس از ذخیره، تبدیل تاریخ‌ها متوقف می‌شود."
  );
});

loadSettings().catch(error => {
  showStatus(error.message, "error");
});
