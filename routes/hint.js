const crypto = require('crypto');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { all, get, run } = require('../database/db');

const router = express.Router();

function getKey() {
  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'dev-encryption-key').digest();
}

function encryptHint(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return {
    encryptedHint: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  };
}

function decryptHint(row) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(row.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_hint, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const search = `%${req.query.search || ''}%`;
  const rows = await all(
    `SELECT id, site, category, encrypted_hint, iv, auth_tag, favorite, created_at, updated_at
     FROM hints
     WHERE user_id = ? AND site LIKE ?
     ORDER BY favorite DESC, updated_at DESC`,
    [req.user.id, search]
  );

  res.json(rows.map((row) => ({
    id: row.id,
    site: row.site,
    category: row.category,
    hint: decryptHint(row),
    encryptedPreview: `${row.encrypted_hint.slice(0, 22)}...`,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })));
});

router.post('/', async (req, res) => {
  const { site, hint, category = '기타' } = req.body;
  if (!site || !hint) {
    return res.status(400).json({ message: '사이트와 힌트를 입력해 주세요.' });
  }

  const encrypted = encryptHint(hint);
  const result = await run(
    `INSERT INTO hints (user_id, site, category, encrypted_hint, iv, auth_tag)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, site, category, encrypted.encryptedHint, encrypted.iv, encrypted.authTag]
  );

  return res.status(201).json({ id: result.id, message: '힌트가 암호화되어 저장되었습니다.' });
});

router.put('/:id', async (req, res) => {
  const row = await get('SELECT id FROM hints WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ message: '힌트를 찾을 수 없습니다.' });

  const { site, hint, category = '기타' } = req.body;
  const encrypted = encryptHint(hint);
  await run(
    `UPDATE hints
     SET site = ?, category = ?, encrypted_hint = ?, iv = ?, auth_tag = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
    [site, category, encrypted.encryptedHint, encrypted.iv, encrypted.authTag, req.params.id, req.user.id]
  );

  return res.json({ message: '힌트가 수정되었습니다.' });
});

router.patch('/:id/favorite', async (req, res) => {
  const favorite = req.body.favorite ? 1 : 0;
  await run(
    'UPDATE hints SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [favorite, req.params.id, req.user.id]
  );
  res.json({ message: '즐겨찾기가 변경되었습니다.' });
});

router.delete('/:id', async (req, res) => {
  await run('DELETE FROM hints WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: '힌트가 삭제되었습니다.' });
});

module.exports = router;
