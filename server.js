const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const { initDatabase } = require('./database/db');
const authRoutes = require('./routes/auth');
const passwordRoutes = require('./routes/password');
const hintRoutes = require('./routes/hint');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/hints', hintRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  const status = error.status && error.status >= 400 ? error.status : 500;
  console.error('Request failed:', {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    path: req.path
  });
  res.status(status).json({ message: error.message || '서버 오류가 발생했습니다.' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason instanceof Error ? reason.stack : JSON.stringify(reason));
});

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Password Manager running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
