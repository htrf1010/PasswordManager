const express = require('express');
const crypto = require('crypto');
const rules = require('../public/password-rules.json');

const router = express.Router();

const commonPasswords = ['123456', 'password', 'qwerty', '111111', 'abcd', 'admin', 'letmein'];

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

function analyzePassword(password = '', site = '') {
  const siteRule = rules[site] || rules.Default;
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
  if (!checks.maxLength) advice.push(`${siteRule.name}는 최대 ${siteRule.maxLength}자까지만 허용합니다.`);
  if (!checks.uppercase) advice.push('대문자를 1개 이상 포함하면 더 안전합니다.');
  if (!checks.lowercase || siteRule.requireLowercase && !checks.lowercase) advice.push('소문자를 1개 이상 포함해 주세요.');
  if (!checks.number) advice.push('숫자를 섞으면 추측하기 어려워집니다.');
  if (!checks.special && siteRule.allowSpecial !== false) advice.push('특수문자를 추가하면 강도가 올라갑니다.');
  if (checks.repeated) advice.push('같은 문자가 3번 이상 반복되어 예측 위험이 있습니다.');
  if (checks.sequential) advice.push('1234 또는 abcd 같은 연속 패턴은 피하는 것이 좋습니다.');
  if (checks.common) advice.push('흔히 사용되는 취약한 단어 또는 패턴이 포함되어 있습니다.');
  if (site && password.toLowerCase().includes(site.toLowerCase())) advice.push('사이트 이름이 포함되어 있어 추측될 가능성이 있습니다.');
  if (!advice.length) advice.push('현재 조합은 전반적으로 안정적입니다. 사이트마다 서로 다른 비밀번호를 사용하세요.');

  return { score, label, checks, advice, rule: siteRule };
}

function randomChar(chars) {
  return chars[crypto.randomInt(0, chars.length)];
}

function getAllowedSpecialChars(siteRule) {
  if (siteRule.allowSpecial === false) return '';

  const rawRules = siteRule.rawRules || '';
  const matches = [...rawRules.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1])
    .filter((value) => /[^A-Za-z0-9,\s]/.test(value));

  if (!matches.length) return '!@#$%^&*?';

  const chars = [...new Set(matches.join('').replace(/[A-Za-z0-9,\s]/g, '').split(''))].join('');
  return chars || '!@#$%^&*?';
}

function shuffle(value) {
  const items = value.split('');
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.join('');
}

function generatePassword(options = {}) {
  const siteRule = rules[options.site] || rules.Default;
  const length = Math.max(siteRule.minLength, Math.min(Number(options.length) || 16, siteRule.maxLength || 64));
  const sets = {
    uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lowercase: 'abcdefghijkmnopqrstuvwxyz',
    number: '23456789',
    special: getAllowedSpecialChars(siteRule)
  };

  const enabled = [];
  if (options.uppercase !== false || siteRule.requireUppercase) enabled.push('uppercase');
  if (options.lowercase !== false) enabled.push('lowercase');
  if (options.number !== false || siteRule.requireNumber) enabled.push('number');
  if ((options.special !== false && siteRule.allowSpecial !== false) || siteRule.requireSpecial) enabled.push('special');
  if (!enabled.length) enabled.push('lowercase');

  let password = '';
  if (siteRule.requireUppercase) password += randomChar(sets.uppercase);
  if (siteRule.requireLowercase) password += randomChar(sets.lowercase);
  if (siteRule.requireNumber) password += randomChar(sets.number);
  if (siteRule.requireSpecial) password += randomChar(sets.special);

  const pool = enabled.map((key) => sets[key]).join('');
  while (password.length < length) {
    password += randomChar(pool);
  }

  return shuffle(password);
}

router.get('/rules', (req, res) => {
  res.json(rules);
});

router.post('/analyze', (req, res) => {
  res.json(analyzePassword(req.body.password, req.body.site));
});

router.post('/generate', (req, res) => {
  const password = generatePassword(req.body);
  res.json({ password, analysis: analyzePassword(password, req.body.site) });
});

module.exports = router;
