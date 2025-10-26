// borough.js
// Load selected borough, populate selects from backend mock APIs,
// and render a placeholder line chart or a message.
// Later you can integrate Chart.js or ECharts to render real charts.

document.addEventListener('DOMContentLoaded', () => {

  const boroughTitle = document.getElementById('boroughTitle');
  const locationSelect = document.getElementById('locationSelect');
  const timeSelect = document.getElementById('timeSelect');
  const crimeSelect = document.getElementById('crimeSelect');
  const saveBtn = document.getElementById('saveBtn');
  const displayArea = document.getElementById('displayArea');
  const displayMsg = document.getElementById('displayMsg');

  const selectedBorough = localStorage.getItem('selectedBorough') || 'Camden';
  boroughTitle.textContent = selectedBorough;

  // Populate location select
  fetch(`/api/locations?borough=${encodeURIComponent(selectedBorough)}`)
    .then(res => res.json())
    .then(locations => {
      // add default option
      const defaultOpt = document.createElement('option');
      defaultOpt.value = selectedBorough;
      defaultOpt.textContent = selectedBorough + ' (whole borough)';
      locationSelect.appendChild(defaultOpt);

      locations.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        locationSelect.appendChild(opt);
      });
    })
    .catch(err => {
      console.error('locations fetch error', err);
    });

  // Populate time select
  fetch(`/api/times?borough=${encodeURIComponent(selectedBorough)}`)
    .then(res => res.json())
    .then(times => {
      times.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        timeSelect.appendChild(opt);
      });
      // set default to first (most recent)
      if (timeSelect.options.length) timeSelect.selectedIndex = 0;
    })
    .catch(err => console.error('times fetch error', err));

  // Populate crime types
  fetch(`/api/crime-types?borough=${encodeURIComponent(selectedBorough)}`)
    .then(res => res.json())
    .then(types => {
      types.forEach(tp => {
        const opt = document.createElement('option');
        opt.value = tp;
        opt.textContent = tp;
        crimeSelect.appendChild(opt);
      });
    })
    .catch(err => console.error('crime-types fetch error', err));

  // Render placeholder chart or message
  function renderPlaceholder() {
    const loc = locationSelect.value || selectedBorough;
    const time = timeSelect.value || 'N/A';
    const crime = crimeSelect.value || 'All';

    displayArea.innerHTML = ''; // clear
    const p = document.createElement('p');
    p.textContent = `Line chart placeholder for ${loc} — Time: ${time} — Crime: ${crime}`;
    p.style.fontWeight = '700';
    displayArea.appendChild(p);

    // Here you would call API to fetch time series and render using Chart.js
    // e.g. fetch(`/api/timeseries?borough=...&location=...&time=...&type=...`)
  }

  // Initial render after a small delay to allow selects to populate
  setTimeout(() => {
    renderPlaceholder();
  }, 300);

  // Save button updates the display (simulate save action)
  saveBtn.addEventListener('click', () => {
    renderPlaceholder();
    // Show visual feedback
    saveBtn.textContent = 'Saved';
    setTimeout(() => { saveBtn.textContent = 'Save'; }, 900);
  });

});
