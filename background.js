const DEFAULT_SETTINGS = {
  waitMode: false,
  waitTime: 3000,
  waitKey: 'Alt',
  showContextMenu: true,
  restrictedPageFeedback: 'badge',
};

const OFFSCREEN_PATH = 'offscreen/offscreen.html';
const BADGE_CLEAR_MS = 1600;
const WAIT_TIME_MIN_MS = 100;
const WAIT_TIME_MAX_MS = 10000;

const pendingWaitRequests = new Map();
let creatingOffscreenDocument = null;

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTabUrl(tab) {
  return tab?.url || tab?.pendingUrl || '';
}

function canReadTabUrl(tab) {
  return Boolean(tab?.id && getTabUrl(tab));
}

function canInjectUi(tab) {
  const url = getTabUrl(tab);
  if (!tab?.id || !url) {
    return false;
  }

  const blockedSchemes = [
    'chrome://',
    'chrome-extension://',
    'chrome-untrusted://',
    'edge://',
    'devtools://',
  ];

  if (blockedSchemes.some((scheme) => url.startsWith(scheme))) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.host !== 'chrome.google.com' && parsed.host !== 'chromewebstore.google.com';
  } catch (_error) {
    return false;
  }
}

function getKeyDisplayName(key) {
  const keyNames = {
    Alt: '⌥',
    Meta: '⌘',
    Shift: '⇧',
    Control: '⌃',
  };
  return keyNames[key] || key;
}

function getMarkdownUrl(title, url) {
  const safeTitle = title || url || 'Untitled';
  return `[${safeTitle}](${url})`;
}

function normalizeWaitTimeMs(waitTime) {
  const parsed = Number(waitTime);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.waitTime;
  }

  return Math.min(WAIT_TIME_MAX_MS, Math.max(WAIT_TIME_MIN_MS, Math.round(parsed)));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!tab) {
    console.warn('未找到活动标签页，无法执行复制');
    return null;
  }

  return hydrateTab(tab);
}

async function hydrateTab(tab) {
  if (!tab?.id) {
    return tab;
  }

  if (tab.title && getTabUrl(tab)) {
    return tab;
  }

  try {
    const fullTab = await chrome.tabs.get(tab.id);
    return fullTab || tab;
  } catch (_error) {
    return tab;
  }
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function createContextMenus() {
  const settings = await chrome.storage.sync.get(['showContextMenu']);
  await chrome.contextMenus.removeAll();

  if (!settings.showContextMenu) {
    return;
  }

  chrome.contextMenus.create({
    id: 'copy-url',
    title: '复制URL',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'copy-markdown-url',
    title: '复制Markdown URL',
    contexts: ['page'],
  });
}

function scheduleWaitRequestCleanup(requestId, waitTimeMs) {
  setTimeout(() => {
    pendingWaitRequests.delete(requestId);
  }, waitTimeMs + 5000);
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) {
    return false;
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    return creatingOffscreenDocument;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['CLIPBOARD'],
    justification: 'Copy URL text to the system clipboard.',
  }).catch((error) => {
    const message = String(error?.message || error || '');
    if (!message.includes('Only a single offscreen document')) {
      throw error;
    }
  }).finally(() => {
    creatingOffscreenDocument = null;
  });

  return creatingOffscreenDocument;
}

async function copyText(text) {
  const requestId = generateRequestId();
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    action: 'clipboard-copy',
    text,
    requestId,
  });

  if (!response?.ok) {
    throw new Error(response?.error || '复制失败：offscreen 未返回成功状态');
  }
}

async function showBadge(tabId, text, color, title) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    if (title) {
      await chrome.action.setTitle({ tabId, title });
    }
  } catch (_error) {
    return;
  }

  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => null);
  }, BADGE_CLEAR_MS);
}

async function showRestrictedFeedback(tab, settings, message, success = true) {
  if (settings.restrictedPageFeedback === 'none') {
    return;
  }

  const color = success ? '#2e7d32' : '#c62828';
  const text = success ? 'OK' : 'ERR';
  await showBadge(tab?.id, text, color, message);
}

async function showNotificationInTab(tabId, message, type) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'showNotification',
      message,
      type,
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function startWaitModeInTab(tabId, waitTime, waitKey, requestId, deadlineAt) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'startWaitMode',
      waitTime,
      waitKey,
      requestId,
      deadlineAt,
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function notifyResult(tab, settings, message, type) {
  if (canInjectUi(tab)) {
    const shown = await showNotificationInTab(tab.id, message, type);
    if (shown) {
      return;
    }
  }

  await showRestrictedFeedback(tab, settings, message, true);
}

async function handleCopyFailure(tab, settings, error) {
  console.error('复制失败:', error);
  const message = '复制失败';

  if (canInjectUi(tab)) {
    const shown = await showNotificationInTab(tab?.id, message, 'url');
    if (shown) {
      return;
    }
  }

  await showRestrictedFeedback(tab, settings, message, false);
}

async function copyUrl(tab) {
  const activeTab = await hydrateTab(tab);
  const settings = await getSettings();

  if (!canReadTabUrl(activeTab)) {
    await handleCopyFailure(activeTab, settings, new Error('当前页面没有可复制 URL'));
    return;
  }

  const url = getTabUrl(activeTab);

  try {
    await copyText(url);

    if (settings.waitMode && canInjectUi(activeTab)) {
      const waitTimeMs = normalizeWaitTimeMs(settings.waitTime);
      const deadlineAt = Date.now() + waitTimeMs;
      const requestId = generateRequestId();
      pendingWaitRequests.set(requestId, {
        tabId: activeTab.id,
        deadlineAt,
      });

      scheduleWaitRequestCleanup(requestId, waitTimeMs);
      await notifyResult(activeTab, settings, `复制 URL ${getKeyDisplayName(settings.waitKey)}`, 'waiting');

      const started = await startWaitModeInTab(
        activeTab.id,
        waitTimeMs,
        settings.waitKey,
        requestId,
        deadlineAt,
      );

      if (!started) {
        pendingWaitRequests.delete(requestId);
        await showRestrictedFeedback(
          activeTab,
          settings,
          '当前页面不支持等待模式，已复制 URL',
          true,
        );
      }
      return;
    }

    if (settings.waitMode && !canInjectUi(activeTab)) {
      await showRestrictedFeedback(activeTab, settings, '受保护页面已复制 URL（等待模式自动降级）', true);
      return;
    }

    await notifyResult(activeTab, settings, '复制 URL', 'url');
  } catch (error) {
    await handleCopyFailure(activeTab, settings, error);
  }
}

async function copyMarkdownUrl(tab, overrideTitle, overrideUrl) {
  const activeTab = await hydrateTab(tab);
  const settings = await getSettings();

  const url = overrideUrl || getTabUrl(activeTab);
  const title = overrideTitle || activeTab?.title || url;

  if (!activeTab?.id || !url) {
    await handleCopyFailure(activeTab, settings, new Error('当前页面没有可复制 URL'));
    return;
  }

  try {
    await copyText(getMarkdownUrl(title, url));
    await notifyResult(activeTab, settings, '复制 Markdown URL', 'markdown');
  } catch (error) {
    await handleCopyFailure(activeTab, settings, error);
  }
}

async function handleWaitKeyTriggered(request, sender) {
  const requestId = request?.requestId;
  if (!requestId || !pendingWaitRequests.has(requestId)) {
    return;
  }

  const waitState = pendingWaitRequests.get(requestId);
  pendingWaitRequests.delete(requestId);

  const senderTabId = sender?.tab?.id;
  const triggeredAt = Number(request?.triggeredAt);
  if (
    !waitState ||
    waitState.tabId !== senderTabId ||
    !Number.isFinite(triggeredAt) ||
    triggeredAt > waitState.deadlineAt
  ) {
    return;
  }

  const title = request.title || sender?.tab?.title;
  const url = request.url || getTabUrl(sender?.tab);

  if (!url) {
    return;
  }

  await copyMarkdownUrl(sender.tab, title, url);
}

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(result);
  await createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus().catch((error) => console.error('创建右键菜单失败:', error));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetTab = tab ? await hydrateTab(tab) : await getActiveTab();
  if (!targetTab) {
    return;
  }

  if (info.menuItemId === 'copy-url') {
    await copyUrl(targetTab);
  } else if (info.menuItemId === 'copy-markdown-url') {
    await copyMarkdownUrl(targetTab);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await getActiveTab();
  if (!tab) {
    return;
  }

  if (command === 'copy-url') {
    await copyUrl(tab);
  } else if (command === 'copy-markdown-url') {
    await copyMarkdownUrl(tab);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.action === 'clipboard-copy' || request?.action === 'offscreen-copy') {
    return false;
  }

  if (request?.action === 'copy-url') {
    (async () => {
      const tab = await getActiveTab();
      if (tab) {
        await copyUrl(tab);
      }
      sendResponse({ ok: true });
    })().catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (request?.action === 'copy-markdown-url') {
    (async () => {
      const tab = await getActiveTab();
      if (tab) {
        await copyMarkdownUrl(tab);
      }
      sendResponse({ ok: true });
    })().catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (request?.action === 'settings-changed') {
    createContextMenus()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (request?.action === 'waitKeyTriggered' || request?.action === 'wait-mode-triggered') {
    handleWaitKeyTriggered(request, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.showContextMenu) {
    createContextMenus().catch((error) => console.error('更新右键菜单失败:', error));
  }
});

createContextMenus().catch((error) => console.error('初始化右键菜单失败:', error));
