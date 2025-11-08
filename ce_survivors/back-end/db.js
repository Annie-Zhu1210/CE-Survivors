const mysql = require('mysql2/promise');

const DEFAULT_POOL_LIMIT = 10;

let configCache;
let poolPromise;

function resolveConfig() {
  if (configCache !== undefined) {
    return configCache;
  }

  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const user = process.env.MYSQL_USER || process.env.DB_USER;
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME;
  const port = process.env.MYSQL_PORT || process.env.DB_PORT || 3306;

  if (!host || !user || !database) {
    console.warn('MySQL configuration incomplete: host, user, and database are required.');
    configCache = null;
    return null;
  }

  configCache = {
    host,
    user,
    password,
    database,
    port: Number(port) || 3306,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || DEFAULT_POOL_LIMIT) || DEFAULT_POOL_LIMIT,
    queueLimit: 0,
    timezone: 'Z',
    namedPlaceholders: true,
    supportBigNumbers: true,
    bigNumberStrings: false
  };

  return configCache;
}

async function getPool() {
  if (poolPromise) {
    return poolPromise;
  }

  const config = resolveConfig();
  if (!config) {
    poolPromise = Promise.resolve(null);
    return poolPromise;
  }

  poolPromise = (async () => {
    try {
      const pool = mysql.createPool(config);
      await ensureSchema(pool);
      console.log('MySQL connection pool initialised');
      return pool;
    } catch (error) {
      console.error('Failed to initialise MySQL pool:', error.message);
      return null;
    }
  })();

  return poolPromise;
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS borough_crime_totals (
      borough VARCHAR(80) NOT NULL,
      category VARCHAR(80) NOT NULL,
      crime_month CHAR(7) NOT NULL,
      total_crimes INT UNSIGNED NOT NULL,
      fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (borough, category, crime_month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crime_months_cache (
      crime_month CHAR(7) NOT NULL PRIMARY KEY,
      fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function withPool(action) {
  const pool = await getPool();
  if (!pool) {
    return null;
  }
  return action(pool);
}

async function getBoroughAggregate({ borough, category, date }) {
  return withPool(async (pool) => {
    const params = [borough, category];
    let sql = `
      SELECT borough, category, crime_month, total_crimes, fetched_at
      FROM borough_crime_totals
      WHERE borough = ? AND category = ?
    `;

    if (date) {
      sql += ' AND crime_month = ?';
      params.push(date);
    }

    sql += ' ORDER BY crime_month DESC LIMIT 1';

    const [rows] = await pool.query(sql, params);
    if (!rows || !rows.length) {
      return null;
    }
    return rows[0];
  });
}

async function saveBoroughAggregate({ borough, category, date, totalCrimes }) {
  return withPool(async (pool) => {
    await pool.query(
      `
        INSERT INTO borough_crime_totals (borough, category, crime_month, total_crimes)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_crimes = VALUES(total_crimes),
          fetched_at = CURRENT_TIMESTAMP
      `,
      [borough, category, date, totalCrimes]
    );
  });
}

async function getCrimeMonthsFromDb() {
  return withPool(async (pool) => {
    const [rows] = await pool.query(
      `SELECT crime_month, fetched_at FROM crime_months_cache ORDER BY crime_month DESC`
    );
    if (!rows || !rows.length) {
      return { months: [], fetchedAt: null };
    }
    return {
      months: rows.map(row => ({ date: row.crime_month })),
      fetchedAt: rows[0].fetched_at
    };
  });
}

async function replaceCrimeMonths(monthEntries = []) {
  return withPool(async (pool) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM crime_months_cache');

      for (const entry of monthEntries) {
        const month = typeof entry === 'string' ? entry : entry?.date;
        if (!month) continue;
        await connection.query('INSERT INTO crime_months_cache (crime_month) VALUES (?)', [month]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

function isConfigured() {
  return Boolean(resolveConfig());
}

module.exports = {
  isConfigured,
  getBoroughAggregate,
  saveBoroughAggregate,
  getCrimeMonthsFromDb,
  replaceCrimeMonths
};
