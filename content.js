let activeWaitMode = null;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    sendResponse({
      title: document.title,
      url: window.location.href,
    });
    return;
  }

  if (request.action === 'showNotification') {
    showNotification(request.message, request.type);
    sendResponse({ ok: true });
    return;
  }

  if (request.action === 'startWaitMode') {
    startWaitMode(request.waitTime, request.waitKey, request.requestId, request.deadlineAt);
    sendResponse({ ok: true });
  }
});

function normalizeWaitTimeMs(waitTime) {
  const parsed = Number(waitTime);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function startWaitMode(waitTime, waitKey, requestId, deadlineAt) {
  stopWaitMode();

  const waitTimeMs = normalizeWaitTimeMs(waitTime);
  const parsedDeadline = Number(deadlineAt);
  const effectiveDeadlineAt = Number.isFinite(parsedDeadline)
    ? parsedDeadline
    : Date.now() + waitTimeMs;

  const keyListener = (event) => {
    if (!isTargetKey(event, waitKey)) {
      return;
    }

    const triggeredAt = Date.now();
    if (triggeredAt > effectiveDeadlineAt) {
      stopWaitMode();
      return;
    }

    stopWaitMode();
    chrome.runtime.sendMessage({
      action: 'waitKeyTriggered',
      requestId,
      title: document.title,
      url: window.location.href,
      triggeredAt,
    }).catch(() => null);
  };

  document.addEventListener('keydown', keyListener, true);

  const cleanupDelay = Math.max(0, effectiveDeadlineAt - Date.now());
  const timer = setTimeout(() => {
    stopWaitMode();
  }, cleanupDelay);

  activeWaitMode = { keyListener, timer, deadlineAt: effectiveDeadlineAt };
}

function stopWaitMode() {
  if (!activeWaitMode) {
    return;
  }

  document.removeEventListener('keydown', activeWaitMode.keyListener, true);
  clearTimeout(activeWaitMode.timer);
  activeWaitMode = null;
}

function isTargetKey(event, waitKey) {
  switch (waitKey) {
    case 'Alt':
      return event.key === 'Alt' || event.altKey;
    case 'Meta':
      return event.key === 'Meta' || event.metaKey;
    case 'Shift':
      return event.key === 'Shift' || event.shiftKey;
    case 'Control':
      return event.key === 'Control' || event.ctrlKey;
    default:
      return false;
  }
}

function showNotification(message, type = 'info') {
  const existingNotification = document.querySelector('.url-copy-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = 'url-copy-notification';
  notification.textContent = message;

  const colors = {
    url: {
      bg: '#ffc107',
      border: '#f39c12',
    },
    markdown: {
      bg: '#28a745',
      border: '#20c997',
    },
    waiting: {
      bg: '#ffc107',
      border: '#f39c12',
    },
  };

  const color = colors[type] || colors.url;

  notification.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: ${color.bg};
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    text-align: center;
    white-space: nowrap;
    animation: fadeInOut 0.3s ease-out;
    opacity: 0.7;
    backdrop-filter: blur(5px);
  `;

  if (!document.querySelector('#url-copy-animations')) {
    const style = document.createElement('style');
    style.id = 'url-copy-animations';
    style.textContent = `
      @keyframes fadeInOut {
        from {
          transform: translateX(-50%) translateY(-10px);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 0.7;
        }
      }
      @keyframes fadeOut {
        from {
          transform: translateX(-50%) translateY(0);
          opacity: 0.7;
        }
        to {
          transform: translateX(-50%) translateY(-10px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    if (!notification.parentNode) {
      return;
    }

    notification.style.animation = 'fadeOut 0.3s ease-in forwards';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}
