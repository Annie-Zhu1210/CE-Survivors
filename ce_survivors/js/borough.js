const params = new URLSearchParams(window.location.search);
const borough = params.get('name') || 'Unknown Borough';
document.getElementById('boroughTitle').innerText = borough;

// data loading (mock)
const locSelect = document.getElementById('locationSelect');
['Central', 'North', 'South'].forEach(l => {
  const opt = document.createElement('option');
  opt.value = l;
  opt.textContent = l;
  locSelect.appendChild(opt);
});

document.getElementById('saveBtn').addEventListener('click', () => {
  document.getElementById('displayArea').innerHTML = '<p>Updated Line Chart (Mock)</p>';
});
