// map.js
// Handle clicks on borough chips and navigate to borough detail page
// Save selected borough name to localStorage so borough.html can read it

document.addEventListener('DOMContentLoaded', () => {
  const mapContainer = document.getElementById('londonMap');
  if (!mapContainer) return;

  const handleSelection = (boroughName) => {
    if (!boroughName) return;
    try {
      localStorage.setItem('selectedBorough', boroughName);
    } catch (e) {
      console.warn('localStorage not available', e);
    }
    window.location.href = '/borough.html';
  };

  mapContainer.addEventListener('click', (ev) => {
    const node = ev.target;
    const boroughName = node?.dataset?.borough;
    if (boroughName) {
      handleSelection(boroughName);
    }
  });

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
