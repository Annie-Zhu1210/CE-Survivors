// map.js
// Handle clicks on borough paths and navigate to statistics page
// Save selected borough name to localStorage so statistics.html can read it

document.addEventListener('DOMContentLoaded', () => {
  const mapContainer = document.getElementById('londonMap');
  if (!mapContainer) return;

  const handleSelection = (boroughName) => {
    if (!boroughName) return;
    try {
      localStorage.setItem('selectedBorough', boroughName);
      console.log('Selected borough:', boroughName);
    } catch (e) {
      console.warn('localStorage not available', e);
    }
    // Redirect to statistics page
    window.location.href = '/statistics.html';
  };

  // Handle mouse clicks
  mapContainer.addEventListener('click', (ev) => {
    const node = ev.target;
    const boroughName = node?.dataset?.borough;
    if (boroughName) {
      handleSelection(boroughName);
    }
  });

  // Handle keyboard navigation (Enter/Space)
  mapContainer.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const node = ev.target;
    const boroughName = node?.dataset?.borough;
    if (boroughName) {
      ev.preventDefault();
      handleSelection(boroughName);
    }
  });
});