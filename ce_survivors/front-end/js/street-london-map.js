// static-london-map.js
// Display a static Leaflet map of London in the "streetMap" div

(function () {
  let londonMap; // Leaflet map instance

  // Wait for the DOM to fully load
  window.addEventListener('load', () => {
    const mapContainer = document.getElementById('streetMap');

    if (!mapContainer) {
      console.error('Street map container (#streetMap) not found!');
      return;
    }

    // Ensure the container has a height
    if (!mapContainer.style.height) {
      mapContainer.style.height = '400px';
    }

    // Initialize the map if not already created
    if (!londonMap) {
      // Set initial view to central London
      londonMap = L.map('streetMap', {
        zoomControl: false, // We'll reposition it
        attributionControl: true,
      }).setView([51.505, -0.09], 12);

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(londonMap);

      // Optional: move zoom control to top right
      londonMap.zoomControl.setPosition('topright');

      console.log('Static London map initialized.');
    }
  });
})();
