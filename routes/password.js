const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const baseRules = require('../public/password-rules.json');
const { listUserRules, saveUserRule } = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

const commonPasswords = ['123456', 'password', 'qwerty', '111111', 'abcd', 'admin', 'letmein'];

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch {
    req.user = null;
  }
  return next();
}

function hasSequential(value) {
  const lowered = value.toLowerCase();
  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return sequences.some((sequence) => {
    for (let i = 0; i <= sequence.length - 4; i += 1) {
      if (lowered.includes(sequence.slice(i, i + 4))) return true;
    }
    return false;
  });
}

function getAllowedSpecialChars(siteRule) {
  if (siteRule.allowSpecial === false) return '';
  if (siteRule.allowedSpecials) return siteRule.allowedSpecials;

  const rawRules = siteRule.rawRules || '';
  const matches = [...rawRules.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1])
    .filter((value) => /[^A-Za-z0-9,\s]/.test(value));

  if (!matches.length) return '!@#$%^&*?';

  const chars = [...new Set(matches.join('').replace(/[A-Za-z0-9,\s]/g, '').split(''))].join('');
  return chars || '!@#$%^&*?';
}

async function getRulesForRequest(req) {
  if (!req.user) return baseRules;
  const userRules = await listUserRules(req.user.id);
  return { ...baseRules, ...userRules };
}

function getRule(rules, site = '') {
  return rules[site] || rules.Default;
}

function buildRiskSummary(score, checks, password) {
  if (!password) {
    return {
      level: '대기',
      text: '비밀번호를 입력하면 규칙 기반 위험도를 표시합니다.'
    };
  }

  const reasons = [];
  if (!checks.length) reasons.push('사이트의 최소 길이보다 짧음');
  if (!checks.maxLength) reasons.push('사이트의 최대 길이 제한 초과');
  if (checks.common) reasons.push('흔히 쓰이는 취약 패턴 포함');
  if (checks.sequential) reasons.push('연속 문자 패턴 포함');
  if (checks.repeated) reasons.push('같은 문자 반복 포함');
  if (!checks.number || !checks.uppercase || !checks.lowercase || !checks.special) {
    reasons.push('문자 종류 조합이 제한적임');
  }

  let level = '낮음';
  if (score < 45 || checks.common) level = '높음';
  else if (score < 70 || checks.sequential || checks.repeated) level = '주의';
  else if (score >= 85 && reasons.length === 0) level = '매우 낮음';

  return {
    level,
    text: `해킹 또는 추측 위험도: ${level}. ${reasons.length ? `근거: ${reasons.join(', ')}.` : '현재 규칙 기준에서 눈에 띄는 약한 패턴이 적습니다.'}`
  };
}

function analyzePassword(password = '', site = '', rules = baseRules) {
  const siteRule = getRule(rules, site);
  const checks = {
    length: password.length >= siteRule.minLength,
    maxLength: !siteRule.maxLength || password.length <= siteRule.maxLength,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    repeated: /(.)\1{2,}/.test(password),
    sequential: hasSequential(password),
    common: commonPasswords.some((item) => password.toLowerCase().includes(item))
  };

  let score = 0;
  score += Math.min(password.length * 4, 40);
  if (checks.uppercase) score += 12;
  if (checks.lowercase) score += 12;
  if (checks.number) score += 12;
  if (checks.special) score += 14;
  if (password.length >= 16) score += 10;
  if (checks.repeated) score -= 15;
  if (checks.sequential) score -= 15;
  if (checks.common) score -= 30;
  if (site && password.toLowerCase().includes(site.toLowerCase())) score -= 15;

  if (siteRule.requireUppercase && !checks.uppercase) score -= 10;
  if (siteRule.requireLowercase && !checks.lowercase) score -= 10;
  if (siteRule.requireNumber && !checks.number) score -= 10;
  if (siteRule.requireSpecial && !checks.special) score -= 10;
  if (!checks.length || !checks.maxLength) score -= 20;

  score = Math.max(0, Math.min(100, score));

  let label = '위험';
  if (score >= 85) label = '강력';
  else if (score >= 70) label = '안전';
  else if (score >= 45) label = '보통';

  const advice = [];
  if (!checks.length) advice.push(`${siteRule.name} 규칙에 맞게 ${siteRule.minLength}자 이상으로 늘려 주세요.`);
  if (!checks.maxLength) advice.push(`${siteRule.name}은 최대 ${siteRule.maxLength}자까지 허용합니다.`);
  if (!checks.uppercase) advice.push('대문자를 1개 이상 포함하면 더 안전합니다.');
  if (!checks.lowercase || (siteRule.requireLowercase && !checks.lowercase)) advice.push('소문자를 1개 이상 포함해 주세요.');
  if (!checks.number) advice.push('숫자를 섞으면 추측하기 어려워집니다.');
  if (!checks.special && siteRule.allowSpecial !== false) advice.push('특수문자를 추가하면 강도가 올라갑니다.');
  if (checks.repeated) advice.push('같은 문자가 3번 이상 반복되어 예측 위험이 있습니다.');
  if (checks.sequential) advice.push('1234 또는 abcd 같은 연속 패턴은 피하는 것이 좋습니다.');
  if (checks.common) advice.push('자주 쓰이는 취약 단어 또는 패턴이 포함되어 있습니다.');
  if (site && password.toLowerCase().includes(site.toLowerCase())) advice.push('사이트 이름이 포함되어 있어 추측 가능성이 있습니다.');
  if (!advice.length) advice.push('현재 조합은 규칙 기준에서 안정적입니다. 사이트마다 서로 다른 비밀번호를 사용하세요.');

  return {
    score,
    label,
    checks,
    advice,
    risk: buildRiskSummary(score, checks, password),
    rule: siteRule
  };
}

function randomChar(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function shuffle(value) {
  const items = value.split('');
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.join('');
}

function uniqueChars(value = '') {
  return [...new Set(String(value).split(''))].join('');
}

function generatePassword(options = {}, rules = baseRules) {
  const siteRule = getRule(rules, options.site);
  const length = Math.max(siteRule.minLength, Math.min(Number(options.length) || 16, siteRule.maxLength || 64));
  const requiredChars = uniqueChars(options.requiredChars || '').slice(0, length);
  const extraChars = uniqueChars(options.extraChars || '');
  const sets = {
    uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lowercase: 'abcdefghijkmnopqrstuvwxyz',
    number: '23456789',
    special: getAllowedSpecialChars(siteRule)
  };

  const enabled = [];
  if (options.uppercase !== false || siteRule.requireUppercase) enabled.push('uppercase');
  if (options.lowercase !== false || siteRule.requireLowercase) enabled.push('lowercase');
  if (options.number !== false || siteRule.requireNumber) enabled.push('number');
  if ((options.special !== false && siteRule.allowSpecial !== false) || siteRule.requireSpecial) enabled.push('special');
  if (!enabled.length && !extraChars && !requiredChars) enabled.push('lowercase');

  let password = requiredChars;
  if (siteRule.requireUppercase && !/[A-Z]/.test(password)) password += randomChar(sets.uppercase);
  if (siteRule.requireLowercase && !/[a-z]/.test(password)) password += randomChar(sets.lowercase);
  if (siteRule.requireNumber && !/\d/.test(password)) password += randomChar(sets.number);
  if (siteRule.requireSpecial && !/[^A-Za-z0-9]/.test(password)) password += randomChar(sets.special || '!@#$%^&*?');

  let pool = enabled.map((key) => sets[key]).join('') + extraChars;
  if (!pool) pool = requiredChars || sets.lowercase;

  while (password.length < length) {
    password += randomChar(pool);
  }

  return shuffle(password.slice(0, length));
}

router.get('/rules', optionalAuth, asyncHandler(async (req, res) => {
  res.json(await getRulesForRequest(req));
}));

router.post('/rules', requireAuth, asyncHandler(async (req, res) => {
  const siteName = String(req.body.name || req.body.site || '').trim();
  if (!siteName) {
    return res.status(400).json({ message: '사이트 이름을 입력해 주세요.' });
  }

  const minLength = Math.max(4, Math.min(Number(req.body.minLength) || 8, 128));
  const maxLength = req.body.maxLength ? Math.max(minLength, Math.min(Number(req.body.maxLength), 128)) : null;
  const allowedSpecials = uniqueChars(req.body.allowedSpecials || '!@#$%^&*?') || '!@#$%^&*?';

  await saveUserRule(req.user.id, {
    siteKey: siteName,
    name: siteName,
    minLength,
    maxLength,
    requireUppercase: Boolean(req.body.requireUppercase),
    requireLowercase: Boolean(req.body.requireLowercase),
    requireNumber: Boolean(req.body.requireNumber),
    requireSpecial: Boolean(req.body.requireSpecial),
    allowSpecial: allowedSpecials.length > 0,
    allowedSpecials
  });

  return res.status(201).json({ message: '사이트별 비밀번호 규칙이 저장되었습니다.' });
}));

router.post('/analyze', optionalAuth, asyncHandler(async (req, res) => {
  const rules = await getRulesForRequest(req);
  res.json(analyzePassword(req.body.password, req.body.site, rules));
}));

router.post('/generate', optionalAuth, asyncHandler(async (req, res) => {
  const rules = await getRulesForRequest(req);
  const password = generatePassword(req.body, rules);
  res.json({ password, analysis: analyzePassword(password, req.body.site, rules) });
}));

module.exports = router;
