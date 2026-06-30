// 요소
const inputHour = document.getElementById('inputHour');
const inputMin  = document.getElementById('inputMin');
const inputSec  = document.getElementById('inputSec');
const mainBtn   = document.getElementById('mainBtn');
const btnIcon   = document.getElementById('btnIcon');
const btnText   = document.getElementById('btnText');
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const countdown  = document.getElementById('countdown');
const countdownTimer = document.getElementById('countdownTimer');
const quickBtns  = document.querySelectorAll('.quick-btn');
const autoStartCheck = document.getElementById('autoStartCheck');

let countdownInterval = null;

function getDomain(url) {
  try {
    const u = new URL(url);
    if (!u.protocol.startsWith('http')) return null;
    return u.hostname;
  } catch (e) {
    return null;
  }
}

// ── 유틸 ──────────────────────────────────────────────
function totalSeconds() {
  const h = parseInt(inputHour.value) || 0;
  const m = parseInt(inputMin.value)  || 0;
  const s = parseInt(inputSec.value)  || 0;
  return h * 3600 + m * 60 + s;
}

function formatTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function setInputsFromSec(sec) {
  inputHour.value = Math.floor(sec / 3600);
  inputMin.value  = Math.floor((sec % 3600) / 60);
  inputSec.value  = sec % 60;
}

// ── UI 상태 반영 ──────────────────────────────────────
function setActiveUI(intervalSec, startedAt) {
  // 버튼
  mainBtn.className = 'btn-main btn-stop';
  btnText.textContent = '정지';
  btnIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

  // 입력 비활성화
  [inputHour, inputMin, inputSec].forEach(el => el.disabled = true);
  quickBtns.forEach(b => b.disabled = true);
  autoStartCheck.disabled = true;

  // 상태 바
  statusDot.classList.add('active');
  statusText.innerHTML = `활성 — <span>${formatTime(intervalSec)}</span> 마다 새로고침`;

  // 카운트다운
  countdown.classList.add('visible');
  startCountdown(intervalSec, startedAt);
}

function setInactiveUI() {
  mainBtn.className = 'btn-main btn-start';
  btnText.textContent = '시작';
  btnIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';

  [inputHour, inputMin, inputSec].forEach(el => el.disabled = false);
  quickBtns.forEach(b => b.disabled = false);
  autoStartCheck.disabled = false;

  statusDot.classList.remove('active');
  statusText.textContent = '비활성';

  countdown.classList.remove('visible');
  clearInterval(countdownInterval);
}

function startCountdown(intervalSec, startedAt) {
  clearInterval(countdownInterval);

  function tick() {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000) % intervalSec;
    const remaining = intervalSec - elapsed;
    countdownTimer.textContent = formatTime(remaining);
  }
  tick();
  countdownInterval = setInterval(tick, 500);
}

// ── 빠른 선택 ─────────────────────────────────────────
quickBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    quickBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    setInputsFromSec(parseInt(btn.dataset.sec));
  });
});

// 입력 변경 시 빠른선택 해제
[inputHour, inputMin, inputSec].forEach(el => {
  el.addEventListener('input', () => {
    quickBtns.forEach(b => b.classList.remove('selected'));
  });
});

// ── 시작 / 정지 ───────────────────────────────────────
mainBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab.id;
  const domain = getDomain(tab.url);

  const stored = await chrome.storage.local.get(`tab_${tabId}`);
  const isActive = !!stored[`tab_${tabId}`];

  if (isActive) {
    // 정지 — 체크박스가 꺼져있으면 도메인 자동시작 설정도 함께 삭제
    const forget = !autoStartCheck.checked;
    await chrome.runtime.sendMessage({ action: 'stop', tabId, domain, forget });
    setInactiveUI();
  } else {
    // 시작
    const sec = totalSeconds();
    if (sec < 5) {
      alert('최소 5초 이상 설정해주세요.');
      return;
    }
    const startedAt = Date.now();
    const remember = autoStartCheck.checked;
    await chrome.runtime.sendMessage({ action: 'start', tabId, intervalSec: sec, startedAt, domain, remember });
    setActiveUI(sec, startedAt);
  }
});

// ── 초기 상태 복원 ─────────────────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab.id;
  const domain = getDomain(tab.url);

  const stored = await chrome.storage.local.get(`tab_${tabId}`);
  const info = stored[`tab_${tabId}`];

  if (info) {
    // 현재 탭에서 실행 중
    setInputsFromSec(info.intervalSec);
    quickBtns.forEach(b => {
      if (parseInt(b.dataset.sec) === info.intervalSec) b.classList.add('selected');
    });
    setActiveUI(info.intervalSec, info.startedAt);
  } else if (domain) {
    // 실행 중은 아니지만, 이 도메인에 저장된 설정이 있으면 입력칸에 미리 채워줌
    const domainStored = await chrome.storage.local.get(`domain_${domain}`);
    const saved = domainStored[`domain_${domain}`];
    if (saved) {
      setInputsFromSec(saved.intervalSec);
      quickBtns.forEach(b => {
        if (parseInt(b.dataset.sec) === saved.intervalSec) b.classList.add('selected');
      });
      autoStartCheck.checked = saved.autoStart;
    }
  }
})();
