const state = {
  token: localStorage.getItem('pm_token'),
  user: JSON.parse(localStorage.getItem('pm_user') || 'null'),
  rules: {},
  analysis: null,
  authMode: 'login',
  editingHintId: null
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
  return data;
}

function setAuth(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem('pm_user', JSON.stringify(user));
  localStorage.setItem('pm_token', token);
  renderAuth();
  loadHints();
}

function clearAuth() {
  state.user = null;
  state.token = null;
  localStorage.removeItem('pm_user');
  localStorage.removeItem('pm_token');
  renderAuth();
  $('#hintList').innerHTML = '<p class="muted">로그인하면 암호화된 힌트를 저장하고 조회할 수 있습니다.</p>';
}

function renderAuth() {
  const isLoggedIn = Boolean(state.token && state.user);
  $('#userBadge').classList.toggle('hidden', !isLoggedIn);
  $('#logoutButton').classList.toggle('hidden', !isLoggedIn);
  $('#openLogin').classList.toggle('hidden', isLoggedIn);
  $('#openRegister').classList.toggle('hidden', isLoggedIn);
  if (isLoggedIn) $('#userBadge').textContent = `${state.user.username}님`;
}

function openAuth(mode) {
  state.authMode = mode;
  $('#authTitle').textContent = mode === 'login' ? '로그인' : '회원가입';
  $('#authConfirm').classList.toggle('hidden', mode === 'login');
  $('#authMessage').textContent = '';
  $('#authForm').reset();
  $('#authDialog').showModal();
}

async function submitAuth(event) {
  event.preventDefault();
  const payload = {
    username: $('#authUsername').value.trim(),
    password: $('#authPassword').value,
    confirmPassword: $('#authConfirm').value
  };

  try {
    const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const data = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    setAuth(data.user, data.token);
    $('#authDialog').close();
  } catch (error) {
    $('#authMessage').textContent = error.message;
  }
}

function populateSites() {
  const sites = Object.keys(state.rules);
  for (const select of [$('#analysisSite'), $('#generatorSite')]) {
    select.innerHTML = sites.map((site) => `<option value="${site}">${state.rules[site].name}</option>`).join('');
  }
  $('#analysisSite').value = 'Google';
  $('#generatorSite').value = 'Google';
  renderRule();
}

function renderRule() {
  const site = $('#analysisSite').value || $('#generatorSite').value || 'Default';
  const rule = state.rules[site] || state.rules.Default;
  $('#ruleBox').innerHTML = `
    <strong>${rule.name}</strong><br>
    최소 길이: ${rule.minLength}자<br>
    최대 길이: ${rule.maxLength || '제한 없음'}<br>
    대문자 필수: ${rule.requireUppercase ? '예' : '아니오'}<br>
    소문자 필수: ${rule.requireLowercase ? '예' : '아니오'}<br>
    숫자 필수: ${rule.requireNumber ? '예' : '아니오'}<br>
    특수문자 필수: ${rule.requireSpecial ? '예' : '아니오'}<br>
    <span>원본 규칙: ${rule.rawRules || '기본 규칙'}</span>
  `;
}

function meterColor(score) {
  if (score >= 85) return 'var(--green)';
  if (score >= 70) return 'var(--blue)';
  if (score >= 45) return 'var(--yellow)';
  return 'var(--red)';
}

function renderAnalysis(data) {
  state.analysis = data;
  $('#meterFill').style.width = `${data.score}%`;
  $('#meterFill').style.background = meterColor(data.score);
  $('#scoreText').textContent = `${data.score}점`;
  $('#labelText').textContent = data.label;

  const checkLabels = [
    ['length', '길이 규칙'],
    ['uppercase', '대문자 포함'],
    ['lowercase', '소문자 포함'],
    ['number', '숫자 포함'],
    ['special', '특수문자 포함']
  ];

  $('#checkList').innerHTML = checkLabels
    .map(([key, label]) => `<li>${data.checks[key] ? 'OK' : 'NO'} ${label}</li>`)
    .join('');

  $('#adviceBox').innerHTML = `<ul>${data.advice.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

async function analyzeCurrentPassword() {
  const password = $('#passwordInput').value;
  const site = $('#analysisSite').value;
  if (!password) {
    renderAnalysis({
      score: 0,
      label: '대기',
      checks: { length: false, uppercase: false, lowercase: false, number: false, special: false },
      advice: ['비밀번호를 입력하면 실시간 분석이 시작됩니다.']
    });
    return;
  }

  const data = await api('/api/password/analyze', {
    method: 'POST',
    body: JSON.stringify({ password, site })
  });
  renderAnalysis(data);
}

async function generatePassword() {
  const data = await api('/api/password/generate', {
    method: 'POST',
    body: JSON.stringify({
      site: $('#generatorSite').value,
      length: Number($('#lengthInput').value),
      uppercase: $('#upperOption').checked,
      lowercase: $('#lowerOption').checked,
      number: $('#numberOption').checked,
      special: $('#specialOption').checked
    })
  });

  $('#generatedPassword').textContent = data.password;
  $('#passwordInput').value = data.password;
  $('#analysisSite').value = $('#generatorSite').value;
  renderRule();
  renderAnalysis(data.analysis);
}

async function copyGeneratedPassword() {
  const value = $('#generatedPassword').textContent;
  if (!value || value.includes('아직')) return;
  await navigator.clipboard.writeText(value);
  $('#copyMessage').textContent = '클립보드에 복사되었습니다. 30초 후 자동으로 비웁니다.';
  setTimeout(async () => {
    try {
      await navigator.clipboard.writeText('');
      $('#copyMessage').textContent = '클립보드를 비웠습니다.';
    } catch {
      $('#copyMessage').textContent = '브라우저 정책상 클립보드 자동 초기화가 제한되었습니다.';
    }
  }, 30000);
}

async function requestAiAdvice() {
  if (!state.token) {
    $('#aiAdviceBox').textContent = 'AI 보안 조언은 로그인 후 사용할 수 있습니다.';
    return;
  }
  if (!state.analysis || !$('#passwordInput').value) {
    $('#aiAdviceBox').textContent = '먼저 분석할 비밀번호를 입력해 주세요.';
    return;
  }

  $('#aiAdviceBox').textContent = 'AI가 보안 조언을 작성하는 중입니다...';
  try {
    const data = await api('/api/ai/advice', {
      method: 'POST',
      body: JSON.stringify({
        password: $('#passwordInput').value,
        site: $('#analysisSite').value,
        score: state.analysis.score,
        label: state.analysis.label,
        ruleAdvice: state.analysis.advice
      })
    });
    if (Array.isArray(data.advice)) {
      $('#aiAdviceBox').innerHTML = `<ul>${data.advice.map((item) => `<li>${item}</li>`).join('')}</ul>`;
    } else {
      $('#aiAdviceBox').textContent = data.advice;
    }
  } catch (error) {
    $('#aiAdviceBox').textContent = error.message;
  }
}

async function saveHint() {
  if (!state.token) {
    $('#hintMessage').textContent = '로그인 후 힌트를 저장할 수 있습니다.';
    return;
  }

  const payload = {
    site: $('#hintSite').value.trim(),
    category: $('#hintCategory').value,
    hint: $('#hintText').value.trim()
  };

  try {
    const path = state.editingHintId ? `/api/hints/${state.editingHintId}` : '/api/hints';
    const method = state.editingHintId ? 'PUT' : 'POST';
    const data = await api(path, { method, body: JSON.stringify(payload) });
    $('#hintMessage').textContent = data.message;
    state.editingHintId = null;
    $('#saveHintButton').textContent = '암호화 저장';
    $('#hintSite').value = '';
    $('#hintText').value = '';
    loadHints();
  } catch (error) {
    $('#hintMessage').textContent = error.message;
  }
}

function renderHints(hints) {
  if (!state.token) {
    $('#hintList').innerHTML = '<p class="muted">로그인하면 암호화된 힌트를 저장하고 조회할 수 있습니다.</p>';
    return;
  }
  if (!hints.length) {
    $('#hintList').innerHTML = '<p class="muted">저장된 힌트가 없습니다.</p>';
    return;
  }

  $('#hintList').innerHTML = hints.map((hint) => `
    <article class="hint-card">
      <header>
        <h3>${hint.favorite ? '★ ' : ''}${hint.site}</h3>
        <span>${hint.category}</span>
      </header>
      <p>${hint.hint}</p>
      <p>DB 저장 형태: ${hint.encryptedPreview}</p>
      <div class="hint-actions">
        <button class="small-button" data-action="favorite" data-id="${hint.id}" data-value="${!hint.favorite}">
          ${hint.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
        </button>
        <button class="small-button" data-action="edit" data-id="${hint.id}">수정</button>
        <button class="small-button" data-action="delete" data-id="${hint.id}">삭제</button>
      </div>
    </article>
  `).join('');
}

async function loadHints() {
  if (!state.token) {
    renderHints([]);
    return;
  }
  try {
    const hints = await api(`/api/hints?search=${encodeURIComponent($('#hintSearch').value)}`);
    state.hints = hints;
    renderHints(hints);
  } catch (error) {
    $('#hintList').innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function handleHintAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === 'edit') {
    const hint = state.hints.find((item) => String(item.id) === String(id));
    $('#hintSite').value = hint.site;
    $('#hintCategory').value = hint.category;
    $('#hintText').value = hint.hint;
    state.editingHintId = id;
    $('#saveHintButton').textContent = '수정 저장';
    return;
  }

  if (action === 'favorite') {
    await api(`/api/hints/${id}/favorite`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite: button.dataset.value === 'true' })
    });
  }

  if (action === 'delete') {
    await api(`/api/hints/${id}`, { method: 'DELETE' });
  }

  loadHints();
}

async function init() {
  state.rules = await api('/api/password/rules');
  populateSites();
  renderAuth();
  analyzeCurrentPassword();
  loadHints();
}

$('#openLogin').addEventListener('click', () => openAuth('login'));
$('#openRegister').addEventListener('click', () => openAuth('register'));
$('#closeAuth').addEventListener('click', () => $('#authDialog').close());
$('#authForm').addEventListener('submit', submitAuth);
$('#logoutButton').addEventListener('click', clearAuth);
$('#passwordInput').addEventListener('input', analyzeCurrentPassword);
$('#analysisSite').addEventListener('change', () => {
  renderRule();
  analyzeCurrentPassword();
});
$('#generatorSite').addEventListener('change', renderRule);
$('#generateButton').addEventListener('click', generatePassword);
$('#copyButton').addEventListener('click', copyGeneratedPassword);
$('#aiAdviceButton').addEventListener('click', requestAiAdvice);
$('#saveHintButton').addEventListener('click', saveHint);
$('#hintSearch').addEventListener('input', loadHints);
$('#hintList').addEventListener('click', handleHintAction);

init().catch((error) => {
  document.body.insertAdjacentHTML('afterbegin', `<p class="muted">${error.message}</p>`);
});
