// server.js
// Pure Node.js HTTP server for static files + mock API endpoints
// Run with: node server.js (from project root or back-end folder using path)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

// ---------- Mock data for APIs ----------
const mockData = [
  { borough: "Camden", count: 12410 },
  { borough: "Westminster", count: 18234 },
  { borough: "Hackney", count: 9321 },
  { borough: "Tower Hamlets", count: 14200 },
  { borough: "Islington", count: 8700 },
  { borough: "Kensington & Chelsea", count: 4050 }
];

// For /api/locations we provide sample locations per borough
const mockLocations = {
  "Camden": ["Camden Town", "Kentish Town", "Bloomsbury"],
  "Westminster": ["Soho", "Mayfair", "Belgravia"],
  "Hackney": ["Dalston", "Hoxton", "Shoreditch"],
  "Tower Hamlets": ["Whitechapel", "Canary Wharf"],
  "Islington": ["Angel", "Highbury"],
  "Kensington & Chelsea": ["Kensington", "South Kensington"]
};

// For /api/times we provide sample months
const mockTimes = [
  "2025-10", "2025-09", "2025-08", "2025-07", "2025-06"
];

// For /api/crime-types we provide sample categories
const mockCrimeTypes = [
  "All", "Violence and Sexual Offences", "Burglary", "Vehicle Crime", "Theft", "Drugs"
];

// ---------- Helper: content type ----------
function getContentType(ext) {
  switch (ext) {
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.json': return 'application/json';
    case '.png': return 'image/png';
    case '.jpg': return 'image/jpeg';
    default: return 'text/plain';
  }
}

// ---------- Create HTTP server ----------
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // -------------------------
  // API endpoints (mock)
  // -------------------------
  if (pathname === '/api/borough-latest') {
    // Return mock borough counts
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockData));
    return;
  }

  if (pathname === '/api/locations') {
    const borough = parsed.query.borough || '';
    const locations = mockLocations[borough] || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(locations));
    return;
  }

  if (pathname === '/api/times') {
    // Return mock time options
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockTimes));
    return;
  }

  if (pathname === '/api/crime-types') {
    // Return mock crime types
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockCrimeTypes));
    return;
  }

  // -------------------------
  // Static file serving (front-end)
  // -------------------------
  // Map root to index.html
  let requestedPath = pathname === '/' ? '/index.html' : pathname;

  // Prevent path traversal
  requestedPath = path.normalize(requestedPath).replace(/^(\.\.[\/\\])+/, '');

  // Construct absolute file path inside front-end folder
  const filePath = path.join(__dirname, '..', 'front-end', requestedPath);

  // Check file exists
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If file not found, return 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = getContentType(ext);

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
