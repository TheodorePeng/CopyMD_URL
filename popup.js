// 弹窗脚本
document.addEventListener('DOMContentLoaded', function() {
    const WAIT_TIME_MIN_SECONDS = 0.1;
    const WAIT_TIME_MAX_SECONDS = 10;
    const WAIT_TIME_DEFAULT_MS = 3000;
    const WAIT_TIME_MIN_MS = Math.round(WAIT_TIME_MIN_SECONDS * 1000);
    const WAIT_TIME_MAX_MS = Math.round(WAIT_TIME_MAX_SECONDS * 1000);

    // 获取DOM元素
    const copyUrlBtn = document.getElementById('copyUrl');
    const copyMarkdownUrlBtn = document.getElementById('copyMarkdownUrl');
    const waitModeCheckbox = document.getElementById('waitMode');
    const waitTimeInput = document.getElementById('waitTime');
    const waitTimeContainer = document.getElementById('waitTimeContainer');
    const waitKeyContainer = document.getElementById('waitKeyContainer');
    const waitKeySelect = document.getElementById('waitKey');
    const showContextMenuCheckbox = document.getElementById('showContextMenu');
    const openShortcutSettingsBtn = document.getElementById('openShortcutSettings');
    let restrictedPageFeedback = 'badge';

    // 加载设置
    loadSettings();

    // 绑定事件监听器
    copyUrlBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'copy-url'});
        window.close();
    });

    copyMarkdownUrlBtn.addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'copy-markdown-url'});
        window.close();
    });

    // 等待模式开关
    waitModeCheckbox.addEventListener('change', function() {
        const isEnabled = this.checked;
        toggleWaitContainers(isEnabled);
        saveSettings({ strictWaitTime: true });
    });

    // 等待时间设置
    waitTimeInput.addEventListener('input', function() {
        saveSettings({ strictWaitTime: false });
    });

    waitTimeInput.addEventListener('change', function() {
        saveSettings({ strictWaitTime: true });
    });

    // 等待按键设置
    waitKeySelect.addEventListener('change', function() {
        saveSettings({ strictWaitTime: true });
    });

    // 右键菜单开关
    showContextMenuCheckbox.addEventListener('change', function() {
        saveSettings({ strictWaitTime: true });
        // 通知background script更新右键菜单
        chrome.runtime.sendMessage({action: 'settings-changed'});
    });

    // 打开快捷键设置页面
    openShortcutSettingsBtn.addEventListener('click', function() {
        chrome.tabs.create({
            url: 'chrome://extensions/shortcuts'
        });
        window.close();
    });

    // 加载设置
    async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get({
                waitMode: false,
                waitTime: 3000,
                waitKey: 'Alt',
                showContextMenu: true,
                restrictedPageFeedback: 'badge'
            });

            waitModeCheckbox.checked = result.waitMode;
            const normalizedWaitTimeMs = normalizeStoredWaitTimeMs(result.waitTime);
            setWaitTimeInputValue(normalizedWaitTimeMs);
            waitKeySelect.value = result.waitKey;
            showContextMenuCheckbox.checked = result.showContextMenu;
            restrictedPageFeedback = result.restrictedPageFeedback || 'badge';

            const shouldPersistNormalizedWaitTime = (
                typeof result.waitTime !== 'number' ||
                !Number.isFinite(result.waitTime) ||
                normalizedWaitTimeMs !== result.waitTime
            );

            if (shouldPersistNormalizedWaitTime) {
                await chrome.storage.sync.set({ waitTime: normalizedWaitTimeMs });
            }

            // 根据等待模式状态显示/隐藏等待设置
            toggleWaitContainers(result.waitMode);
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    // 保存设置
    async function saveSettings({ strictWaitTime } = { strictWaitTime: true }) {
        try {
            const waitTimeMs = parseWaitTimeInputToMs(strictWaitTime);
            if (waitTimeMs === null) {
                return;
            }

            const settings = {
                waitMode: waitModeCheckbox.checked,
                waitTime: waitTimeMs,
                waitKey: waitKeySelect.value,
                showContextMenu: showContextMenuCheckbox.checked,
                restrictedPageFeedback
            };

            await chrome.storage.sync.set(settings);
            if (strictWaitTime) {
                setWaitTimeInputValue(waitTimeMs);
            }
            console.log('设置已保存:', settings);
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    function clampWaitTimeMs(waitTimeMs) {
        return Math.min(WAIT_TIME_MAX_MS, Math.max(WAIT_TIME_MIN_MS, Math.round(waitTimeMs)));
    }

    function normalizeStoredWaitTimeMs(waitTimeMs) {
        const parsed = Number(waitTimeMs);
        if (!Number.isFinite(parsed)) {
            return WAIT_TIME_DEFAULT_MS;
        }

        return clampWaitTimeMs(parsed);
    }

    function parseWaitTimeInputToMs(strictWaitTime) {
        const rawValue = String(waitTimeInput.value ?? '').trim();
        const isIncompleteInput = (
            rawValue === '' ||
            rawValue === '-' ||
            rawValue === '.' ||
            rawValue.endsWith('.')
        );

        if (!strictWaitTime && isIncompleteInput) {
            return null;
        }

        const parsedSeconds = Number(rawValue);
        if (!Number.isFinite(parsedSeconds)) {
            return strictWaitTime ? WAIT_TIME_DEFAULT_MS : null;
        }

        return clampWaitTimeMs(parsedSeconds * 1000);
    }

    function setWaitTimeInputValue(waitTimeMs) {
        waitTimeInput.value = (waitTimeMs / 1000).toFixed(1);
    }

    // 切换等待设置容器的显示/隐藏
    function toggleWaitContainers(show) {
        if (show) {
            waitTimeContainer.classList.remove('hidden');
            waitKeyContainer.classList.remove('hidden');
        } else {
            waitTimeContainer.classList.add('hidden');
            waitKeyContainer.classList.add('hidden');
        }
    }


}); 
