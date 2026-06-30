// 메시지 수신 (popup → background)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start') {
    startRefresh(msg.tabId, msg.intervalSec, msg.startedAt, msg.domain, msg.remember);
  } else if (msg.action === 'stop') {
    stopRefresh(msg.tabId, msg.domain, msg.forget);
  }
});

// 탭이 새 URL을 로드 완료하면, 그 도메인에 저장된 자동시작 설정이 있는지 확인
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const domain = getDomain(tab.url);
  if (!domain) return;

  // 이미 이 탭에서 실행 중이면 중복 시작 방지
  const tabState = await chrome.storage.local.get(`tab_${tabId}`);
  if (tabState[`tab_${tabId}`]) return;

  // 이 도메인에 저장된 자동시작 설정이 있으면 시작
  const domainState = await chrome.storage.local.get(`domain_${domain}`);
  const saved = domainState[`domain_${domain}`];
  if (saved && saved.autoStart) {
    startRefresh(tabId, saved.intervalSec, Date.now(), domain, true);
  }
});

// 알람 발생 시 해당 탭 새로고침
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('refresh_')) return;

  const tabId = parseInt(alarm.name.replace('refresh_', ''));
  const stored = await chrome.storage.local.get(`tab_${tabId}`);
  if (!stored[`tab_${tabId}`]) return;

  try {
    await chrome.tabs.reload(tabId);
  } catch (e) {
    // 탭이 닫힌 경우 자동 정리
    stopRefresh(tabId);
  }
});

// 탭이 닫히면 자동 정지
chrome.tabs.onRemoved.addListener((tabId) => {
  stopRefresh(tabId);
});

// ── 내부 함수 ──────────────────────────────────────────

function getDomain(url) {
  try {
    const u = new URL(url);
    if (!u.protocol.startsWith('http')) return null;
    return u.hostname;
  } catch (e) {
    return null;
  }
}

async function startRefresh(tabId, intervalSec, startedAt, domain, remember) {
  const alarmName = `refresh_${tabId}`;

  // 기존 알람 제거 후 재생성
  await chrome.alarms.clear(alarmName);
  chrome.alarms.create(alarmName, {
    delayInMinutes: intervalSec / 60,
    periodInMinutes: intervalSec / 60
  });

  // 탭별 실행 상태 저장
  await chrome.storage.local.set({
    [`tab_${tabId}`]: { intervalSec, startedAt, domain }
  });

  // 도메인별 자동시작 설정 저장 (사이트 재접속 시 사용)
  if (domain && remember) {
    await chrome.storage.local.set({
      [`domain_${domain}`]: { intervalSec, autoStart: true }
    });
  }

  // 아이콘에 배지 표시
  chrome.action.setBadgeText({ text: 'ON', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
}

async function stopRefresh(tabId, domain, forget) {
  const alarmName = `refresh_${tabId}`;
  await chrome.alarms.clear(alarmName);
  await chrome.storage.local.remove(`tab_${tabId}`);

  // 사용자가 명시적으로 "이 사이트 자동시작 끄기"를 선택한 경우만 도메인 설정 삭제
  if (domain && forget) {
    await chrome.storage.local.remove(`domain_${domain}`);
  }

  try {
    chrome.action.setBadgeText({ text: '', tabId });
  } catch (e) {}
}
