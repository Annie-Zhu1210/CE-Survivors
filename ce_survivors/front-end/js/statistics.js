/* statistics.js
 * Power the statistics page with a Chart.js line chart showing borough crime trends.
 */

(function () {
  const DEFAULT_CATEGORY = 'all-crime';
  let chartInstance = null;
  let boroughListFallback = false;

  document.addEventListener('DOMContentLoaded', () => {
    const boroughSelect = document.getElementById('trendBorough');
    const monthsSelect = document.getElementById('trendMonths');
    const statusEl = document.getElementById('trendStatus');
    const canvas = document.getElementById('trendChart');

    if (!boroughSelect || !monthsSelect || !canvas) {
      return;
    }

    const setStatus = (message, isError = false) => {
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.classList.toggle('error', isError);
      }
    };

    const fetchJson = async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Request failed with status ${response.status}`);
      }
      return response.json();
    };

    const populateBoroughs = async () => {
      const data = await fetchJson('/api/boroughs');
      boroughListFallback = Boolean(data?.fallback);
      const boroughs = Array.isArray(data?.boroughs) ? data.boroughs : [];
      boroughs.sort((a, b) => a.id.localeCompare(b.id));

      boroughSelect.innerHTML = '';
      boroughs.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.id;
        boroughSelect.appendChild(option);
      });

      const saved = localStorage.getItem('selectedBorough');
      if (saved && boroughs.some(item => item.id === saved)) {
        boroughSelect.value = saved;
      }

      if (boroughListFallback) {
        setStatus('Using placeholder borough list while live data is unavailable.');
      }

      return boroughSelect.value || (boroughs[0] ? boroughs[0].id : '');
    };

    const updateChart = (labels, datasetLabel, dataPoints) => {
      const context = canvas.getContext('2d');
      const chartData = {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data: dataPoints,
            fill: false,
            borderColor: '#014f86',
            backgroundColor: '#014f86',
            tension: 0.25,
            spanGaps: true,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      };

      const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Number of crimes' }
          },
          x: {
            title: { display: true, text: 'Month' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.parsed.y === null) {
                  return 'No data';
                }
                return `Crimes: ${ctx.parsed.y.toLocaleString()}`;
              }
            }
          }
        }
      };

      if (chartInstance) {
        chartInstance.data = chartData;
        chartInstance.options = options;
        chartInstance.update();
      } else {
        chartInstance = new window.Chart(context, {
          type: 'line',
          data: chartData,
          options
        });
      }
    };

    const loadTrend = async () => {
      const borough = boroughSelect.value;
      const months = Number.parseInt(monthsSelect.value, 10) || 12;
      if (!borough) {
        setStatus('No borough selected.', true);
        return;
      }

      setStatus(`Loading ${borough} trend...`);

      try {
        const url = `/api/boroughs/${encodeURIComponent(borough)}/trend?months=${months}&category=${DEFAULT_CATEGORY}`;
        const trend = await fetchJson(url);
        const timeline = Array.isArray(trend?.months) ? trend.months : [];

        if (!timeline.length) {
          updateChart([], `${borough} crimes`, []);
          setStatus('No trend data available for this borough.', true);
          return;
        }

        const labels = timeline.map(entry => entry.date || 'Unknown');
        const dataPoints = timeline.map(entry => {
          if (entry && Number.isFinite(entry.totalCrimes)) {
            return entry.totalCrimes;
          }
          return null;
        });
        const missingCount = dataPoints.filter(value => value === null).length;

        const labelsAscending = [...labels].reverse();
        const dataAscending = [...dataPoints].reverse();

        updateChart(labelsAscending, `${borough} crimes`, dataAscending);

        let message = `Showing ${borough} - ${months} months - Category: ${DEFAULT_CATEGORY}` +
          (missingCount ? ` - ${missingCount} month(s) missing` : '');

        if (trend?.fallback) {
          message += ' - displaying placeholder trend data';
        } else if (boroughListFallback) {
          message += ' - borough list sourced from placeholder data';
        }

        setStatus(message, false);

        try {
          localStorage.setItem('selectedBorough', borough);
        } catch (error) {
          console.warn('Failed to persist selected borough', error);
        }
      } catch (error) {
        console.error('Trend request failed:', error);
        setStatus(`Unable to load trend: ${error.message}`, true);
      }
    };

    const init = async () => {
      try {
        const initialBorough = await populateBoroughs();
        if (!initialBorough) {
          setStatus('No boroughs available.', true);
          return;
        }

        boroughSelect.addEventListener('change', loadTrend);
        monthsSelect.addEventListener('change', loadTrend);

        await loadTrend();
      } catch (error) {
        console.error('Failed to initialise statistics page:', error);
        setStatus(`Unable to load borough list: ${error.message}`, true);
      }
    };

    init();
  });
})();
