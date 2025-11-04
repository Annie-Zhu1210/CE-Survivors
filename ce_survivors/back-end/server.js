// server.js
// Node.js HTTP server that serves the static front-end and proxies Police API data
// Provides borough-level aggregations using a supplied London TopoJSON file.

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'front-end');
const BOROUGH_TOPO_PATH = path.join(PUBLIC_DIR, 'london-topojson.json');
const POLICE_BASE = 'https://data.police.uk/api';
const DEFAULT_CATEGORY = 'all-crime';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (in-memory cache)
const DB_CACHE_TTL_MS = Number(process.env.DB_CACHE_TTL_MS) || 6 * 60 * 60 * 1000; // 6 hours
const MAX_POLY_POINTS = 35; // limit to keep poly query comfortably < 4KB

// Legacy fallback values used by older front-end screens until they are fully migrated.
const fallbackBoroughCounts = [
  { borough: 'Camden', count: 12410 },
  { borough: 'Westminster', count: 18234 },
  { borough: 'Hackney', count: 9321 },
  { borough: 'Tower Hamlets', count: 14200 },
  { borough: 'Islington', count: 8700 },
  { borough: 'Kensington & Chelsea', count: 4050 }
];

const fallbackLocations = {
  Camden: ['Camden Town', 'Kentish Town', 'Bloomsbury'],
  Westminster: ['Soho', 'Mayfair', 'Belgravia'],
  Hackney: ['Dalston', 'Hoxton', 'Shoreditch'],
  'Tower Hamlets': ['Whitechapel', 'Canary Wharf'],
  Islington: ['Angel', 'Highbury'],
  'Kensington & Chelsea': ['Kensington', 'South Kensington']
};

const fallbackTimes = ['2025-10', '2025-09', '2025-08', '2025-07', '2025-06'];

const fallbackCrimeTypes = ['All', 'Violence and Sexual Offences', 'Burglary', 'Vehicle Crime', 'Theft', 'Drugs'];

const contentTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const boroughTopology = loadTopology(BOROUGH_TOPO_PATH);
const boroughs = boroughTopology ? buildBoroughs(boroughTopology) : [];
const boroughIndex = new Map(boroughs.map(b => [b.id, b]));

const crimeCache = new Map();
const trendCache = new Map();
let crimeMonthsCache = { data: null, fetchedAt: 0 };
const databaseConfigured = db.isConfigured();

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!boroughs.length) {
    console.warn('Warning: london-topojson.json not found or empty. Borough endpoints will be unavailable.');
  }
  if (databaseConfigured) {
    console.log('MySQL integration enabled. Results will be cached to the configured database.');
  } else {
    console.warn('MySQL integration disabled or misconfigured. API results will not be persisted.');
  }
});

// Request routing

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    await handleApiRequest(req, res, pathname, parsed.query);
    return;
  }

  await serveStatic(pathname, res);
}

async function handleApiRequest(req, res, pathname, query) {
  if (pathname === '/api/borough-latest' && req.method === 'GET') {
    try {
      ensureBoroughData();
      const summaries = [];
      for (const borough of boroughs) {
        try {
          const summary = await getBoroughSummary(borough.id, { category: DEFAULT_CATEGORY });
          summaries.push({ borough: summary.borough, count: summary.totalCrimes, date: summary.date });
        } catch (err) {
          summaries.push({ borough: borough.id, error: err.message });
        }
      }
      sendJson(res, summaries);
    } catch (err) {
      console.warn('Falling back to mock borough counts:', err.message);
      sendJson(res, fallbackBoroughCounts);
    }
    return;
  }

  if (pathname === '/api/locations' && req.method === 'GET') {
    const borough = query.borough || '';
    sendJson(res, fallbackLocations[borough] || []);
    return;
  }

  if (pathname === '/api/times' && req.method === 'GET') {
    sendJson(res, fallbackTimes);
    return;
  }

  if (pathname === '/api/crime-types' && req.method === 'GET') {
    sendJson(res, fallbackCrimeTypes);
    return;
  }

  if (pathname === '/api/boroughs' && req.method === 'GET') {
    ensureBoroughData();
    sendJson(res, {
      boroughs: boroughs.map(b => ({
        id: b.id,
        centroid: b.centroid,
        polygons: b.polygons.length
      }))
    });
    return;
  }

  if (pathname === '/api/crime-months' && req.method === 'GET') {
    const months = await getCrimeMonths();
    sendJson(res, { months });
    return;
  }

  if (pathname === '/api/boroughs/crime-totals' && req.method === 'GET') {
    ensureBoroughData();
    const category = (query.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
    const requestedDate = query.date ? String(query.date).trim() : null;

    const summaries = [];
    for (const borough of boroughs) {
      try {
        const summary = await getBoroughSummary(borough.id, { date: requestedDate, category });
        summaries.push(summary);
      } catch (err) {
        summaries.push({
          borough: borough.id,
          error: err.message,
          status: err.statusCode || 500
        });
      }
    }

    sendJson(res, {
      category,
      requestedDate,
      generatedAt: new Date().toISOString(),
      summaries
    });
    return;
  }

  if (pathname.startsWith('/api/boroughs/') && pathname.endsWith('/trend') && req.method === 'GET') {
    ensureBoroughData();
    const parts = pathname.split('/'); // ['', 'api', 'boroughs', '<id>', 'trend']
    const boroughId = decodeURIComponent(parts[3] || '').trim();
    if (!boroughId) {
      throw createHttpError(400, 'Missing borough id');
    }

    const months = parsePositiveInt(query.months, 12);
    const category = (query.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
    const trend = await getBoroughTrend(boroughId, { months, category });
    sendJson(res, trend);
    return;
  }

  if (pathname === '/api/crimes' && req.method === 'GET') {
    ensureBoroughData();
    const boroughId = query.borough ? String(query.borough).trim() : '';
    if (!boroughId) {
      throw createHttpError(400, 'Query parameter "borough" is required');
    }
    const category = (query.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
    const date = query.date ? String(query.date).trim() : null;
    const summary = await getBoroughSummary(boroughId, { date, category });
    sendJson(res, summary);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API route not found' }));
}

async function serveStatic(pathname, res) {
  let requestedPath = pathname === '/' ? '/index.html' : pathname;
  requestedPath = path.normalize(requestedPath).replace(/^([\.]{2}[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, requestedPath);

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': getContentType(ext) });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      throw err;
    }
  }
}

function getContentType(ext) {
  return contentTypes[ext] || 'text/plain';
}

function sendJson(res, payload, statusCode = 200) {
  if (!res.headersSent) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify(payload));
}

function ensureBoroughData() {
  if (!boroughs.length) {
    throw createHttpError(503, 'Borough topology unavailable. Please ensure london-topojson.json is present.');
  }
}

// Borough data preparation helpers

function loadTopology(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Topology file not found at ${filePath}`);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load London TopoJSON:', err.message);
    return null;
  }
}

function buildBoroughs(topology) {
  const collection = topology?.objects?.london_geo;
  if (!collection || !Array.isArray(collection.geometries)) {
    console.warn('London topology does not contain expected objects.london_geo.geometries array.');
    return [];
  }

  const decodedArcs = decodeArcs(topology.arcs || [], topology.transform);

  return collection.geometries.map(geometry => {
    const polygonArcSets = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
    const polygons = polygonArcSets.map(rings => rings.map(ring => closeRing(extractRing(ring, decodedArcs))));
    const outerRings = polygons.map(rings => rings[0] || []);
    const centroid = computeCentroid(outerRings);
    const polyStrings = outerRings.map(ring => ringToPolyString(simplifyRing(ring, MAX_POLY_POINTS)));

    return {
      id: geometry.id,
      polygons,
      outerRings,
      polyStrings,
      centroid
    };
  });
}

function decodeArcs(rawArcs, transform = { scale: [1, 1], translate: [0, 0] }) {
  const scaleX = transform.scale?.[0] ?? 1;
  const scaleY = transform.scale?.[1] ?? 1;
  const translateX = transform.translate?.[0] ?? 0;
  const translateY = transform.translate?.[1] ?? 0;

  return (rawArcs || []).map(arc => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [translateX + x * scaleX, translateY + y * scaleY];
    });
  });
}

function extractRing(arcIndexes, decodedArcs) {
  const coords = [];
  (arcIndexes || []).forEach((index, i) => {
    const arc = index >= 0 ? decodedArcs[index] : reverseArc(decodedArcs[-index - 1]);
    if (!arc || !arc.length) return;
    if (i === 0) {
      coords.push(...arc);
    } else {
      coords.push(...arc.slice(1));
    }
  });
  return coords;
}

function reverseArc(arc = []) {
  return [...arc].reverse();
}

function closeRing(ring = []) {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!pointsEqual(first, last)) {
    return [...ring, first];
  }
  return ring;
}

function simplifyRing(ring = [], maxPoints) {
  if (!Array.isArray(ring) || ring.length <= maxPoints) {
    return ring;
  }
  const step = Math.max(1, Math.ceil(ring.length / maxPoints));
  const simplified = [];
  for (let i = 0; i < ring.length; i += step) {
    simplified.push(ring[i]);
  }
  const last = ring[ring.length - 1];
  if (!pointsEqual(simplified[simplified.length - 1], last)) {
    simplified.push(last);
  }
  return simplified;
}

function ringToPolyString(ring = []) {
  return ring
    .map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
    .join(':');
}

function computeCentroid(rings = []) {
  let xSum = 0;
  let ySum = 0;
  let count = 0;
  rings.forEach(ring => {
    ring.forEach(([lng, lat]) => {
      xSum += lng;
      ySum += lat;
      count += 1;
    });
  });
  if (!count) return [0, 0];
  return [xSum / count, ySum / count];
}

function pointsEqual(a = [], b = []) {
  return a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

// Police API helpers

async function getBoroughSummary(boroughId, { date = null, category = DEFAULT_CATEGORY } = {}) {
  const borough = boroughIndex.get(boroughId);
  if (!borough) {
    throw createHttpError(404, `Unknown borough: ${boroughId}`);
  }

  const requestedCategory = (category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
  const requestedDate = date ? String(date).trim() : null;
  const cacheKey = `${boroughId}|${requestedCategory}|${requestedDate || 'latest'}`;
  const cached = crimeCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  try {
    const dbRow = await db.getBoroughAggregate({
      borough: boroughId,
      category: requestedCategory,
      date: requestedDate
    });

    const isHistorical = Boolean(requestedDate);
    if (dbRow && isDbResultFresh(dbRow?.fetched_at, isHistorical)) {
      const payload = {
        borough: boroughId,
        totalCrimes: Number(dbRow.total_crimes) || 0,
        date: dbRow.crime_month,
        category: requestedCategory
      };
      crimeCache.set(cacheKey, { fetchedAt: Date.now(), payload });
      return payload;
    }
  } catch (error) {
    console.error(`Database lookup failed for ${boroughId}:`, error.message || error);
  }

  const fetched = await fetchBoroughSummaryFromPolice(borough, {
    date: requestedDate,
    category: requestedCategory
  });

  if (fetched.date) {
    db.saveBoroughAggregate({
      borough: boroughId,
      category: requestedCategory,
      date: fetched.date,
      totalCrimes: fetched.totalCrimes
    }).catch(error => {
      console.error(`Failed to persist borough summary for ${boroughId}:`, error.message || error);
    });
  }

  crimeCache.set(cacheKey, { fetchedAt: Date.now(), payload: fetched });
  return fetched;
}

async function getBoroughTrend(boroughId, { months = 12, category = DEFAULT_CATEGORY } = {}) {
  const requestedCategory = (category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
  const key = `${boroughId}|trend|${requestedCategory}|${months}`;
  const cached = trendCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  const monthEntries = await getCrimeMonths();
  const selectedMonths = monthEntries.slice(0, months).map(entry => entry.date);
  const timeline = [];

  for (const month of selectedMonths) {
    try {
      const summary = await getBoroughSummary(boroughId, { date: month, category: requestedCategory });
      timeline.push({ date: month, totalCrimes: summary.totalCrimes });
    } catch (err) {
      timeline.push({ date: month, error: err.message, status: err.statusCode || 500 });
    }
  }

  const payload = {
    borough: boroughId,
    category: requestedCategory,
    months: timeline
  };

  trendCache.set(key, { fetchedAt: Date.now(), payload });
  return payload;
}

async function fetchBoroughSummaryFromPolice(borough, { date, category }) {
  if (!borough || !Array.isArray(borough.polyStrings) || !borough.polyStrings.length) {
    const id = borough?.id || 'unknown';
    throw createHttpError(500, `Borough ${id} is missing polygon data and cannot be queried.`);
  }

  let totalCrimes = 0;
  let resolvedDate = date || null;

  for (const poly of borough.polyStrings) {
    const params = new URLSearchParams();
    params.set('poly', poly);
    if (date) params.set('date', date);

    const apiUrl = `${POLICE_BASE}/crimes-street/${category}?${params.toString()}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw createHttpError(response.status, `Police API error (${response.status}): ${body || 'request failed'}`);
    }

    const crimes = await response.json();
    if (!resolvedDate && Array.isArray(crimes) && crimes.length) {
      resolvedDate = crimes[0]?.month || resolvedDate;
    }
    totalCrimes += Array.isArray(crimes) ? crimes.length : 0;
  }

  return {
    borough: borough.id,
    totalCrimes,
    date: resolvedDate || date || null,
    category
  };
}

function isDbResultFresh(fetchedAt, isHistorical = false) {
  if (isHistorical) {
    return true;
  }
  if (!fetchedAt) {
    return false;
  }
  const timestamp = fetchedAt instanceof Date ? fetchedAt.getTime() : new Date(fetchedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Date.now() - timestamp < DB_CACHE_TTL_MS;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function getCrimeMonths() {
  const now = Date.now();
  if (crimeMonthsCache.data && now - crimeMonthsCache.fetchedAt < CACHE_TTL_MS) {
    return crimeMonthsCache.data;
  }

  try {
    const dbResult = await db.getCrimeMonthsFromDb();
    if (dbResult && Array.isArray(dbResult.months) && dbResult.months.length) {
      const fetchedAtMs = toTimestamp(dbResult.fetchedAt);
      if (!fetchedAtMs || now - fetchedAtMs < DB_CACHE_TTL_MS) {
        crimeMonthsCache = { data: dbResult.months, fetchedAt: now };
        return dbResult.months;
      }
    }
  } catch (error) {
    console.error('Failed to read cached crime months from database:', error.message || error);
  }

  const response = await fetch(`${POLICE_BASE}/crimes-street-dates`);
  if (!response.ok) {
    throw createHttpError(response.status, `Failed to load crime months (${response.status})`);
  }
  const months = await response.json();
  if (!Array.isArray(months)) {
    throw createHttpError(500, 'Unexpected response when loading crime months');
  }

  crimeMonthsCache = { data: months, fetchedAt: now };

  db.replaceCrimeMonths(months).catch(error => {
    console.error('Failed to persist crime months to database:', error.message || error);
  });

  return months;
}

// Utilities

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
