const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, findUserByUsername } = require('../database/db');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );
}

router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, confirmPassword } = req.body;

  if (!username || !password || !confirmPassword) {
    return res.status(400).json({ message: '아이디와 비밀번호를 모두 입력해 주세요.' });
  }

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ message: '아이디는 영문, 숫자, 밑줄만 사용해서 3~20자로 입력해 주세요.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: '비밀번호는 8자 이상이어야 합니다.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: '비밀번호 확인이 일치하지 않습니다.' });
  }

  const exists = await findUserByUsername(username);
  if (exists) {
    return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser(username, passwordHash);

  return res.status(201).json({ token: createToken(user), user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '아이디와 비밀번호를 입력해 주세요.' });
  }

  const user = await findUserByUsername(username);
  if (!user) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  return res.json({
    token: createToken(user),
    user: { id: user.id, username: user.username }
  });
}));

module.exports = router;
