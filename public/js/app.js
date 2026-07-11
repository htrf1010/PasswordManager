const DEFAULT_CATEGORIES = ['금융', 'SNS', '게임', '학업', '회사', '기타'];

const state = {
  token: localStorage.getItem('pm_token'),
  user: JSON.parse(localStorage.getItem('pm_user') || 'null'),
  rules: {},
  categories: [],
  hints: [],
  analysis: null,
  authMode: 'login',
  editingHintId: null,
  activeTool: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const toolIds = ['analyzer', 'generator', 'hints'];
const statusClasses = ['status-error', 'status-warning', 'status-success'];

function setStatusMessage(selector, message, type = 'success') {
  const element = typeof selector === 'string' ? $(selector) : selector;
  element.classList.remove(...statusClasses);
  if (type) element.classList.add(`status-${type}`);
  element.textContent = message;
}

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
  refreshAccountData();
}

function clearAuth() {
  state.user = null;
  state.token = null;
  state.categories = [];
  localStorage.removeItem('pm_user');
  localStorage.removeItem('pm_token');
  renderAuth();
  renderCategories();
  renderHints([]);
  showTool(null);
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
  setStatusMessage(
    '#authMessage',
    mode === 'login' ? '아이디와 비밀번호를 입력해 주세요.' : '아이디는 영문, 숫자, 밑줄 3~20자로 입력해 주세요.',
    null
  );
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
    setStatusMessage('#authMessage', error.message, 'error');
  }
}

function getSiteValue(inputId) {
  const value = $(inputId).value.trim();
  return state.rules[value] ? value : value || 'Default';
}

function getRule(site) {
  return state.rules[site] || state.rules.Default;
}

function getAllowedSpecialText(rule) {
  if (rule.allowSpecial === false) return '없음';
  if (rule.allowedSpecials) return [...rule.allowedSpecials].join(' ');

  const rawRules = rule.rawRules || '';
  const bracketGroups = [...rawRules.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1])
    .filter((value) => /[^A-Za-z0-9,\s]/.test(value));

  if (bracketGroups.length) {
    const specials = [...new Set(bracketGroups.join('').replace(/[A-Za-z0-9,\s]/g, '').split(''))];
    return specials.length ? specials.join(' ') : '! @ # $ % ^ & * ?';
  }

  return '! @ # $ % ^ & * ?';
}

function formatRule(rule) {
  return `
    <strong>${rule.name}</strong><br>
    최소 길이: ${rule.minLength}자<br>
    최대 길이: ${rule.maxLength || '제한 없음'}<br>
    대문자 필수: ${rule.requireUppercase ? '예' : '아니오'}<br>
    소문자 필수: ${rule.requireLowercase ? '예' : '아니오'}<br>
    숫자 필수: ${rule.requireNumber ? '예' : '아니오'}<br>
    특수문자 필수: ${rule.requireSpecial ? '예' : '아니오'}<br>
    <span>가능한 특수문자: ${getAllowedSpecialText(rule)}</span>
  `;
}

function populateSites() {
  const sites = Object.keys(state.rules);
  $('#siteOptions').innerHTML = sites
    .map((site) => `<option value="${site}">${state.rules[site].name}</option>`)
    .join('');

  if (!$('#analysisSiteSearch').value) $('#analysisSiteSearch').value = 'Google';
  if (!$('#generatorSiteSearch').value) $('#generatorSiteSearch').value = 'Google';
  renderRule();
  applyGeneratorRule();
}

function renderRule() {
  $('#ruleBox').innerHTML = formatRule(getRule(getSiteValue('#analysisSiteSearch')));
}

function applyRequiredOption(input, required, allowed = true) {
  input.checked = required || (allowed && input.checked);
  input.disabled = required || !allowed;
}

function applyGeneratorRule() {
  const rule = getRule(getSiteValue('#generatorSiteSearch'));
  const lengthInput = $('#lengthInput');
  lengthInput.min = rule.minLength;
  lengthInput.max = rule.maxLength || 64;

  const currentLength = Number(lengthInput.value) || rule.minLength;
  const maxLength = Number(lengthInput.max);
  lengthInput.value = Math.min(Math.max(currentLength, rule.minLength), maxLength);

  applyRequiredOption($('#upperOption'), Boolean(rule.requireUppercase));
  applyRequiredOption($('#lowerOption'), Boolean(rule.requireLowercase));
  applyRequiredOption($('#numberOption'), Boolean(rule.requireNumber));
  applyRequiredOption($('#specialOption'), Boolean(rule.requireSpecial), rule.allowSpecial !== false);
  $('#generatorRuleBox').innerHTML = formatRule(rule);
}

function setActiveNav() {
  $$('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === state.activeTool);
  });
}

function showTool(toolId, shouldPushState = true) {
  state.activeTool = toolIds.includes(toolId) ? toolId : null;
  $('#home').classList.toggle('is-hidden', Boolean(state.activeTool));
  for (const id of toolIds) {
    $(`#${id}`).classList.toggle('is-active', id === state.activeTool);
  }
  setActiveNav();

  if (!state.activeTool) {
    if (shouldPushState) history.pushState({ tool: null }, '', '#home');
    return;
  }

  if (shouldPushState) history.pushState({ tool: state.activeTool }, '', `#${state.activeTool}`);
}

function handleNavigation(event) {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;

  const target = link.getAttribute('href').slice(1);
  if (target === 'home') {
    event.preventDefault();
    showTool(null);
    return;
  }

  if (toolIds.includes(target)) {
    event.preventDefault();
    showTool(target);
  }
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
    .map(([key, label]) => `<li class="${data.checks[key] ? 'pass' : 'fail'}">${data.checks[key] ? 'OK' : 'NO'} ${label}</li>`)
    .join('');

  $('#riskBox').textContent = data.risk?.text || '근거 있는 위험도 정보가 없습니다.';
  $('#riskBox').classList.toggle('status-error', data.risk?.level === '높음');
  $('#riskBox').classList.toggle('status-warning', data.risk?.level === '주의');
  $('#adviceBox').innerHTML = `<ul>${data.advice.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

async function analyzeCurrentPassword() {
  const password = $('#passwordInput').value;
  const site = getSiteValue('#analysisSiteSearch');
  if (!password) {
    renderAnalysis({
      score: 0,
      label: '대기',
      checks: { length: false, uppercase: false, lowercase: false, number: false, special: false },
      advice: ['비밀번호를 입력하면 실시간 분석을 시작합니다.'],
      risk: { text: '비밀번호를 입력하면 규칙 기반 위험도를 표시합니다.' }
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
  applyGeneratorRule();
  const site = getSiteValue('#generatorSiteSearch');
  const data = await api('/api/password/generate', {
    method: 'POST',
    body: JSON.stringify({
      site,
      length: Number($('#lengthInput').value),
      uppercase: $('#upperOption').checked,
      lowercase: $('#lowerOption').checked,
      number: $('#numberOption').checked,
      special: $('#specialOption').checked,
      requiredChars: $('#requiredCharsInput').value,
      extraChars: $('#extraCharsInput').value
    })
  });

  $('#generatedPassword').textContent = data.password;
  $('#passwordInput').value = data.password;
  $('#analysisSiteSearch').value = site;
  renderRule();
  renderAnalysis(data.analysis);
}

async function copyGeneratedPassword() {
  const value = $('#generatedPassword').textContent;
  if (!value || value.includes('아직')) return;
  await navigator.clipboard.writeText(value);
  $('#copyMessage').textContent = '클립보드에 복사했습니다. 30초 후 비우기를 시도합니다.';
  setTimeout(async () => {
    try {
      await navigator.clipboard.writeText('');
      setStatusMessage('#copyMessage', '클립보드를 비웠습니다.', 'success');
    } catch {
      setStatusMessage('#copyMessage', '브라우저 정책상 클립보드 자동 비우기가 제한되었습니다.', 'warning');
    }
  }, 30000);
}

function renderCategories() {
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...state.categories])];
  $('#hintCategory').innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join('');
  $('#hintCategoryFilter').innerHTML = [
    '<option value="">전체 카테고리</option>',
    ...categories.map((category) => `<option value="${category}">${category}</option>`)
  ].join('');
}

async function loadCategories() {
  if (!state.token) {
    state.categories = [];
    renderCategories();
    return;
  }

  state.categories = await api('/api/hints/categories');
  renderCategories();
}

async function addCategory() {
  if (!state.token) {
    setStatusMessage('#hintMessage', '로그인해야 카테고리를 저장할 수 있습니다.', 'error');
    return;
  }

  const input = $('#newCategoryInput');
  if (input.classList.contains('hidden')) {
    input.classList.remove('hidden');
    input.focus();
    return;
  }

  const name = input.value.trim();
  if (!name) return;
  const data = await api('/api/hints/categories', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  setStatusMessage('#hintMessage', data.message, 'success');
  input.value = '';
  input.classList.add('hidden');
  await loadCategories();
  $('#hintCategory').value = name;
}

async function saveHint() {
  if (!state.token) {
    setStatusMessage('#hintMessage', '로그인해야 힌트를 저장할 수 있습니다.', 'error');
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
    setStatusMessage('#hintMessage', data.message, 'success');
    state.editingHintId = null;
    $('#saveHintButton').textContent = '암호화 저장';
    $('#hintSite').value = '';
    $('#hintText').value = '';
    await loadCategories();
    loadHints();
  } catch (error) {
    setStatusMessage('#hintMessage', error.message, 'error');
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
        <h3><span class="favorite-star ${hint.favorite ? 'is-on' : ''}">★</span>${hint.site}</h3>
        <span>${hint.category}</span>
      </header>
      <p>${hint.hint}</p>
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
    const search = encodeURIComponent($('#hintSearch').value);
    const category = encodeURIComponent($('#hintCategoryFilter').value);
    const hints = await api(`/api/hints?search=${search}&category=${category}`);
    state.hints = hints;
    renderHints(hints);
  } catch (error) {
    $('#hintList').innerHTML = `<p class="muted status-error">${error.message}</p>`;
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

async function saveCustomRule() {
  if (!state.token) {
    setStatusMessage('#ruleMessage', '로그인해야 사이트별 규칙을 계정에 저장할 수 있습니다.', 'error');
    return;
  }

  const name = $('#customRuleSite').value.trim();
  if (!name) {
    setStatusMessage('#ruleMessage', '사이트 이름을 입력해 주세요.', 'error');
    return;
  }

  try {
    const data = await api('/api/password/rules', {
      method: 'POST',
      body: JSON.stringify({
        name,
        minLength: Number($('#customRuleMin').value),
        maxLength: $('#customRuleMax').value ? Number($('#customRuleMax').value) : null,
        allowedSpecials: $('#customRuleSpecials').value,
        requireUppercase: $('#customRuleUpper').checked,
        requireLowercase: $('#customRuleLower').checked,
        requireNumber: $('#customRuleNumber').checked,
        requireSpecial: $('#customRuleSpecial').checked
      })
    });

    setStatusMessage('#ruleMessage', data.message, 'success');
    await loadRules();
    $('#generatorSiteSearch').value = name;
    $('#analysisSiteSearch').value = name;
    applyGeneratorRule();
    renderRule();
  } catch (error) {
    setStatusMessage('#ruleMessage', error.message, 'error');
  }
}

async function loadRules() {
  state.rules = await api('/api/password/rules');
  populateSites();
}

async function refreshAccountData() {
  await loadRules();
  await loadCategories();
  await loadHints();
}

async function init() {
  await loadRules();
  renderAuth();
  await loadCategories();
  analyzeCurrentPassword();
  loadHints();
  history.replaceState({ tool: null }, '', '#home');
  showTool(null, false);
}

$('#openLogin').addEventListener('click', () => openAuth('login'));
$('#openRegister').addEventListener('click', () => openAuth('register'));
$('#closeAuth').addEventListener('click', () => $('#authDialog').close());
$('#authForm').addEventListener('submit', submitAuth);
$('#logoutButton').addEventListener('click', clearAuth);
$('#passwordInput').addEventListener('input', analyzeCurrentPassword);
$('#analysisSiteSearch').addEventListener('input', () => {
  renderRule();
  analyzeCurrentPassword();
});
$('#generatorSiteSearch').addEventListener('input', applyGeneratorRule);
$('#generateButton').addEventListener('click', generatePassword);
$('#copyButton').addEventListener('click', copyGeneratedPassword);
$('#saveHintButton').addEventListener('click', saveHint);
$('#hintSearch').addEventListener('input', loadHints);
$('#hintCategoryFilter').addEventListener('change', loadHints);
$('#hintList').addEventListener('click', handleHintAction);
$('#addCategoryButton').addEventListener('click', addCategory);
$('#saveRuleButton').addEventListener('click', saveCustomRule);
document.addEventListener('click', handleNavigation);
window.addEventListener('popstate', () => {
  const tool = window.location.hash.replace('#', '');
  showTool(toolIds.includes(tool) ? tool : null, false);
});

init().catch((error) => {
  document.body.insertAdjacentHTML('afterbegin', `<p class="muted status-error">${error.message}</p>`);
});
