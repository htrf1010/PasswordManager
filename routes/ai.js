const express = require('express');
const OpenAI = require('openai');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/advice', requireAuth, async (req, res) => {
  const { password, site, score, label, ruleAdvice = [] } = req.body;

  if (!password) {
    return res.status(400).json({ message: '분석할 비밀번호를 입력해 주세요.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      fallback: true,
      advice: [
        `현재 강도는 ${label || '분석 중'}(${score ?? 0}점)입니다.`,
        ...ruleAdvice,
        'OPENAI_API_KEY를 .env에 입력하면 GPT 기반 보안 조언이 표시됩니다.'
      ]
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    '너는 한국어로 답하는 비밀번호 보안 조언 도우미다.',
    '실제 비밀번호를 그대로 반복해서 쓰지 말고, 위험 요인과 개선 방향을 짧은 bullet로 설명해라.',
    '마지막에는 비슷한 의미나 패턴을 피한 더 안전한 예시 비밀번호 1개를 제안해라.',
    `사이트: ${site || '미지정'}`,
    `점수: ${score}`,
    `등급: ${label}`,
    `규칙 기반 진단: ${ruleAdvice.join(' / ')}`,
    `비밀번호: ${password}`
  ].join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    });

    res.json({ advice: completion.choices[0].message.content });
  } catch (error) {
    res.status(502).json({ message: 'AI 조언 생성에 실패했습니다.', detail: error.message });
  }
});

module.exports = router;
