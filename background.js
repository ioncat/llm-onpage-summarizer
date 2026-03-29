'use strict';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'analyze-selection',
    title: 'Analyze with LLM Summarizer',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'analyze-selection' || !info.selectionText) return;
  chrome.storage.session.set({ pendingSelection: info.selectionText.trim() }, () => {
    chrome.sidePanel.open({ tabId: tab.id });
    // Notify sidepanel if it's already open
    chrome.runtime.sendMessage({ type: 'selection-ready' }).catch(() => {});
  });
});
