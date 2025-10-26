// map.js
// Handle clicks on borough chips and navigate to borough detail page
// Save selected borough name to localStorage so borough.html can read it

document.addEventListener('DOMContentLoaded', () => {

  const mapContainer = document.getElementById('londonMap');
  if (!mapContainer) return;

  // Add click handler to borough elements
  mapContainer.addEventListener('click', (ev) => {
    const node = ev.target;
    if (node && node.classList && node.classList.contains('borough')) {
      const boroughName = node.getAttribute('data-borough');
      if (!boroughName) return;

      // Save selection to localStorage
      try {
        localStorage.setItem('selectedBorough', boroughName);
      } catch (e) {
        console.warn('localStorage not available', e);
      }

      // Navigate to borough detail page
      window.location.href = '/borough.html';
    }
  });

});
