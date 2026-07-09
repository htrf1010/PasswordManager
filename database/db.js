const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usesSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);

let db = null;
let supabase = null;

if (usesSupabase) {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
} else {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');
  db = new sqlite3.Database(dbPath);
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function normalizeHint(row) {
  return {
    ...row,
    favorite: row.favorite === true || row.favorite === 1
  };
}

function handleSupabaseResult(result) {
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

async function initSqliteDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS hints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      site TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '기타',
      encrypted_hint TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function initSupabaseDatabase() {
  const result = await supabase.from('users').select('id').limit(1);
  if (result.error) {
    throw new Error(
      `Supabase tables are not ready: ${result.error.message}. Run supabase-schema.sql in the Supabase SQL editor.`
    );
  }
}

async function initDatabase() {
  if (usesSupabase) {
    await initSupabaseDatabase();
    return;
  }

  await initSqliteDatabase();
}

async function findUserByUsername(username) {
  if (usesSupabase) {
    const data = handleSupabaseResult(
      await supabase
        .from('users')
        .select('id, username, password_hash')
        .eq('username', username)
        .maybeSingle()
    );
    return data;
  }

  return get('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
}

async function createUser(username, passwordHash) {
  if (usesSupabase) {
    const data = handleSupabaseResult(
      await supabase
        .from('users')
        .insert({ username, password_hash: passwordHash })
        .select('id, username')
        .single()
    );
    return data;
  }

  const result = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
    username,
    passwordHash
  ]);
  return { id: result.id, username };
}

async function listHints(userId, search = '') {
  if (usesSupabase) {
    const data = handleSupabaseResult(
      await supabase
        .from('hints')
        .select('id, site, category, encrypted_hint, iv, auth_tag, favorite, created_at, updated_at')
        .eq('user_id', userId)
        .ilike('site', `%${search}%`)
        .order('favorite', { ascending: false })
        .order('updated_at', { ascending: false })
    );
    return data.map(normalizeHint);
  }

  const rows = await all(
    `SELECT id, site, category, encrypted_hint, iv, auth_tag, favorite, created_at, updated_at
     FROM hints
     WHERE user_id = ? AND site LIKE ?
     ORDER BY favorite DESC, updated_at DESC`,
    [userId, `%${search}%`]
  );
  return rows.map(normalizeHint);
}

async function createHint(userId, { site, category, encryptedHint, iv, authTag }) {
  if (usesSupabase) {
    const data = handleSupabaseResult(
      await supabase
        .from('hints')
        .insert({
          user_id: userId,
          site,
          category,
          encrypted_hint: encryptedHint,
          iv,
          auth_tag: authTag
        })
        .select('id')
        .single()
    );
    return data;
  }

  const result = await run(
    `INSERT INTO hints (user_id, site, category, encrypted_hint, iv, auth_tag)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, site, category, encryptedHint, iv, authTag]
  );
  return { id: result.id };
}

async function findHintByIdForUser(id, userId) {
  if (usesSupabase) {
    const data = handleSupabaseResult(
      await supabase
        .from('hints')
        .select('id')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()
    );
    return data;
  }

  return get('SELECT id FROM hints WHERE id = ? AND user_id = ?', [id, userId]);
}

async function updateHint(id, userId, { site, category, encryptedHint, iv, authTag }) {
  if (usesSupabase) {
    handleSupabaseResult(
      await supabase
        .from('hints')
        .update({
          site,
          category,
          encrypted_hint: encryptedHint,
          iv,
          auth_tag: authTag,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', userId)
    );
    return;
  }

  await run(
    `UPDATE hints
     SET site = ?, category = ?, encrypted_hint = ?, iv = ?, auth_tag = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
    [site, category, encryptedHint, iv, authTag, id, userId]
  );
}

async function setHintFavorite(id, userId, favorite) {
  if (usesSupabase) {
    handleSupabaseResult(
      await supabase
        .from('hints')
        .update({ favorite, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
    );
    return;
  }

  await run(
    'UPDATE hints SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [favorite ? 1 : 0, id, userId]
  );
}

async function deleteHint(id, userId) {
  if (usesSupabase) {
    handleSupabaseResult(
      await supabase
        .from('hints')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
    );
    return;
  }

  await run('DELETE FROM hints WHERE id = ? AND user_id = ?', [id, userId]);
}

module.exports = {
  db,
  supabase,
  usesSupabase,
  initDatabase,
  findUserByUsername,
  createUser,
  listHints,
  createHint,
  findHintByIdForUser,
  updateHint,
  setHintFavorite,
  deleteHint
};
