const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const { initDatabase } = require('./database/db');
const authRoutes = require('./routes/auth');
const passwordRoutes = require('./routes/password');
const hintRoutes = require('./routes/hint');
const aiRoutes = require('./routes/ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/hints', hintRoutes);
app.use('/api/ai', aiRoutes);

app.get('/health', (req, res) => {
  res.json({ ok: true });
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
