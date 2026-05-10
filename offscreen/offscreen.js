function copyWithExecCommand(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);

  let ok = false;
  try {
    textarea.focus();
    textarea.select();
    ok = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }

  if (!ok) {
    throw new Error('document.execCommand("copy") returned false');
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'clipboard-copy' && message?.action !== 'offscreen-copy') {
    return;
  }

  const response = { ok: false, requestId: message.requestId };
  try {
    copyWithExecCommand(String(message.text ?? ''));
    response.ok = true;
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  }

  sendResponse(response);
});
