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

function handleSupabaseResult(result) {
  if (result.error) throw result.error;
  return result.data;
}

function normalizeHint(row) {
  return {
    ...row,
    favorite: row.favorite === true || row.favorite === 1
  };
}

function normalizeRule(row) {
  return {
    name: row.name,
    minLength: Number(row.min_length),
    maxLength: row.max_length ? Number(row.max_length) : null,
    requireUppercase: row.require_uppercase === true || row.require_uppercase === 1,
    requireLowercase: row.require_lowercase === true || row.require_lowercase === 1,
    requireNumber: row.require_number === true || row.require_number === 1,
    requireSpecial: row.require_special === true || row.require_special === 1,
    allowSpecial: row.allow_special === true || row.allow_special === 1,
    allowedSpecials: row.allowed_specials || '!@#$%^&*?',
    rawRules: `custom rule for ${row.name}`
  };
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

  await run(`
    CREATE TABLE IF NOT EXISTS user_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      site_key TEXT NOT NULL,
      name TEXT NOT NULL,
      min_length INTEGER NOT NULL DEFAULT 8,
      max_length INTEGER,
      require_uppercase INTEGER NOT NULL DEFAULT 0,
      require_lowercase INTEGER NOT NULL DEFAULT 0,
      require_number INTEGER NOT NULL DEFAULT 0,
      require_special INTEGER NOT NULL DEFAULT 0,
      allow_special INTEGER NOT NULL DEFAULT 1,
      allowed_specials TEXT NOT NULL DEFAULT '!@#$%^&*?',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, site_key),
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
    return handleSupabaseResult(
      await supabase
        .from('users')
        .select('id, username, password_hash')
        .eq('username', username)
        .maybeSingle()
    );
  }

  return get('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
}

async function createUser(username, passwordHash) {
  if (usesSupabase) {
    return handleSupabaseResult(
      await supabase
        .from('users')
        .insert({ username, password_hash: passwordHash })
        .select('id, username')
        .single()
    );
  }

  const result = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
    username,
    passwordHash
  ]);
  return { id: result.id, username };
}

async function listHints(userId, search = '', category = '') {
  if (usesSupabase) {
    let query = supabase
      .from('hints')
      .select('id, site, category, encrypted_hint, iv, auth_tag, favorite, created_at, updated_at')
      .eq('user_id', userId)
      .ilike('site', `%${search}%`)
      .order('favorite', { ascending: false })
      .order('updated_at', { ascending: false });

    if (category) query = query.eq('category', category);
    return handleSupabaseResult(await query).map(normalizeHint);
  }

  const params = [userId, `%${search}%`];
  const categoryClause = category ? 'AND category = ?' : '';
  if (category) params.push(category);

  const rows = await all(
    `SELECT id, site, category, encrypted_hint, iv, auth_tag, favorite, created_at, updated_at
     FROM hints
     WHERE user_id = ? AND site LIKE ? ${categoryClause}
     ORDER BY favorite DESC, updated_at DESC`,
    params
  );
  return rows.map(normalizeHint);
}

async function createHint(userId, { site, category, encryptedHint, iv, authTag }) {
  if (usesSupabase) {
    return handleSupabaseResult(
      await supabase
        .from('hints')
        .insert({ user_id: userId, site, category, encrypted_hint: encryptedHint, iv, auth_tag: authTag })
        .select('id')
        .single()
    );
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
    return handleSupabaseResult(
      await supabase.from('hints').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
    );
  }

  return get('SELECT id FROM hints WHERE id = ? AND user_id = ?', [id, userId]);
}

async function updateHint(id, userId, { site, category, encryptedHint, iv, authTag }) {
  if (usesSupabase) {
    handleSupabaseResult(
      await supabase
        .from('hints')
        .update({ site, category, encrypted_hint: encryptedHint, iv, auth_tag: authTag, updated_at: new Date().toISOString() })
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

  await run('UPDATE hints SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [
    favorite ? 1 : 0,
    id,
    userId
  ]);
}

async function deleteHint(id, userId) {
  if (usesSupabase) {
    handleSupabaseResult(await supabase.from('hints').delete().eq('id', id).eq('user_id', userId));
    return;
  }

  await run('DELETE FROM hints WHERE id = ? AND user_id = ?', [id, userId]);
}

async function listUserRules(userId) {
  if (usesSupabase) {
    const rows = handleSupabaseResult(
      await supabase
        .from('user_rules')
        .select('site_key, name, min_length, max_length, require_uppercase, require_lowercase, require_number, require_special, allow_special, allowed_specials')
        .eq('user_id', userId)
        .order('name')
    );
    return Object.fromEntries(rows.map((row) => [row.site_key, normalizeRule(row)]));
  }

  const rows = await all(
    `SELECT site_key, name, min_length, max_length, require_uppercase, require_lowercase,
            require_number, require_special, allow_special, allowed_specials
     FROM user_rules
     WHERE user_id = ?
     ORDER BY name`,
    [userId]
  );
  return Object.fromEntries(rows.map((row) => [row.site_key, normalizeRule(row)]));
}

async function saveUserRule(userId, rule) {
  const row = {
    user_id: userId,
    site_key: rule.siteKey,
    name: rule.name,
    min_length: rule.minLength,
    max_length: rule.maxLength || null,
    require_uppercase: Boolean(rule.requireUppercase),
    require_lowercase: Boolean(rule.requireLowercase),
    require_number: Boolean(rule.requireNumber),
    require_special: Boolean(rule.requireSpecial),
    allow_special: rule.allowSpecial !== false,
    allowed_specials: rule.allowedSpecials || '!@#$%^&*?'
  };

  if (usesSupabase) {
    handleSupabaseResult(
      await supabase.from('user_rules').upsert(row, { onConflict: 'user_id,site_key' }).select('id').single()
    );
    return;
  }

  await run(
    `INSERT INTO user_rules (
       user_id, site_key, name, min_length, max_length, require_uppercase, require_lowercase,
       require_number, require_special, allow_special, allowed_specials
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, site_key) DO UPDATE SET
       name = excluded.name,
       min_length = excluded.min_length,
       max_length = excluded.max_length,
       require_uppercase = excluded.require_uppercase,
       require_lowercase = excluded.require_lowercase,
       require_number = excluded.require_number,
       require_special = excluded.require_special,
       allow_special = excluded.allow_special,
       allowed_specials = excluded.allowed_specials,
       updated_at = CURRENT_TIMESTAMP`,
    [
      row.user_id,
      row.site_key,
      row.name,
      row.min_length,
      row.max_length,
      row.require_uppercase ? 1 : 0,
      row.require_lowercase ? 1 : 0,
      row.require_number ? 1 : 0,
      row.require_special ? 1 : 0,
      row.allow_special ? 1 : 0,
      row.allowed_specials
    ]
  );
}

async function listCategories(userId) {
  if (usesSupabase) {
    const rows = handleSupabaseResult(
      await supabase.from('user_categories').select('name').eq('user_id', userId).order('name')
    );
    return rows.map((row) => row.name);
  }

  const rows = await all('SELECT name FROM user_categories WHERE user_id = ? ORDER BY name', [userId]);
  return rows.map((row) => row.name);
}

async function createCategory(userId, name) {
  if (usesSupabase) {
    handleSupabaseResult(
      await supabase.from('user_categories').upsert({ user_id: userId, name }, { onConflict: 'user_id,name' }).select('id').single()
    );
    return;
  }

  await run('INSERT OR IGNORE INTO user_categories (user_id, name) VALUES (?, ?)', [userId, name]);
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
  deleteHint,
  listUserRules,
  saveUserRule,
  listCategories,
  createCategory
};
