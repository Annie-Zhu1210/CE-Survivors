// street-map.js
let streetMap;
let currentPolyline;

const streetSelect = document.getElementById('streetSelect');

async function initStreetMap() {
  if (!streetMap) {
    streetMap = L.map('streetMap').setView([51.505, -0.09], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(streetMap);
  }
}

/**
 * Update the street dropdown and clear map for a new borough
 */
async function updateStreetMapAndDropdown(boroughName) {
  initStreetMap();
  streetSelect.innerHTML = '<option value="">All Streets</option>';

  try {
    const allData = await fetch('/data/streetsByBorough.json').then(res => res.json());
    const streetData = allData[boroughName];

    if (!streetData) {
      console.warn(`No street data for borough ${boroughName}`);
      return;
    }

    // Fill dropdown
    streetData.streets.forEach(street => {
      const opt = document.createElement('option');
      opt.value = street;
      opt.textContent = street;
      streetSelect.appendChild(opt);
    });

    // Remove old polyline
    if (currentPolyline) {
      streetMap.removeLayer(currentPolyline);
      currentPolyline = null;
    }

    // Store for access by streetSelect change event
    window.currentBoroughStreetData = streetData;

  } catch (err) {
    console.error('Street list load error:', err);
    streetMap.getContainer().innerHTML = '<p style="text-align:center; color:red;">Failed to load street map</p>';
  }
}

// When a street is selected, draw its polyline
streetSelect.addEventListener('change', () => {
  const street = streetSelect.value;
  const streetData = window.currentBoroughStreetData;
  if (!street || !streetData) return;

  // Remove previous polyline
  if (currentPolyline) streetMap.removeLayer(currentPolyline);

  // Find feature in geojson
  const feature = streetData.geojson.features.find(f => f.properties.name === street);
  if (!feature) return;

  // Convert coordinates to [lat, lng] for Leaflet
  let coords = [];
  if (feature.geometry.type === 'LineString') {
    coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
  } else if (feature.geometry.type === 'MultiLineString') {
    coords = feature.geometry.coordinates.flat().map(c => [c[1], c[0]]);
  }

  currentPolyline = L.polyline(coords, { color: 'blue', weight: 4 }).addTo(streetMap);
  streetMap.fitBounds(currentPolyline.getBounds());
});
