/* statistics.js
 * Display crime trend line chart for the borough selected from the map
 */

(function () {
  const DEFAULT_CATEGORY = 'all-crime';
  let chartInstance = null;
  let currentBorough = null;

  document.addEventListener('DOMContentLoaded', () => {
    const monthsSelect = document.getElementById('trendMonths');
    const statusEl = document.getElementById('trendStatus');
    const canvas = document.getElementById('trendChart');
    const titleEl = document.getElementById('boroughTitle');

    if (!monthsSelect || !canvas) {
      console.error('Required elements not found!');
      return;
    }

    // Get selected borough from localStorage
    currentBorough = localStorage.getItem('selectedBorough');
    
    if (!currentBorough) {
      setStatus('No borough selected. Please select a borough from the map.', true);
      if (titleEl) {
        titleEl.textContent = 'No Borough Selected';
      }
      return;
    }

    if (titleEl) {
      titleEl.textContent = `${currentBorough} - Crime Statistics`;
    }

    const setStatus = (message, isError = false) => {
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.classList.toggle('error', isError);
      }
    };

    const fetchJson = async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || `Request failed with status ${response.status}`);
        }
        return response.json();
      } catch (error) {
        console.error('Fetch error:', error);
        throw error;
      }
    };

    const updateChart = (labels, datasetLabel, dataPoints) => {
      const context = canvas.getContext('2d');
      
      if (!context) {
        console.error('Could not get canvas context');
        return;
      }

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
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2
          }
        ]
      };

      const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { 
              display: true, 
              text: 'Number of Crimes',
              font: { size: 14, weight: 'bold' }
            },
            ticks: {
              callback: function(value) {
                return value.toLocaleString();
              }
            }
          },
          x: {
            title: { 
              display: true, 
              text: 'Month',
              font: { size: 14, weight: 'bold' }
            }
          }
        },
        plugins: {
          legend: { 
            display: true,
            position: 'top'
          },
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
        if (typeof Chart === 'undefined') {
          console.error('Chart.js not loaded!');
          setStatus('Chart.js library not loaded', true);
          return;
        }
        chartInstance = new Chart(context, {
          type: 'line',
          data: chartData,
          options
        });
      }
    };

    const loadTrend = async () => {
      const months = Number.parseInt(monthsSelect.value, 10) || 12;

      setStatus(`Loading ${currentBorough} crime trend...`);
      console.log(`Loading trend for ${currentBorough}, ${months} months`);

      try {
        const url = `/api/boroughs/${encodeURIComponent(currentBorough)}/trend?months=${months}&category=${DEFAULT_CATEGORY}`;
        console.log('Fetching from:', url);
        
        const trend = await fetchJson(url);
        console.log('Trend data received:', trend);
        
        const timeline = Array.isArray(trend?.months) ? trend.months : [];

        if (!timeline.length) {
          updateChart([], `${currentBorough} crimes`, []);
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

        // Show oldest to newest from left to right
        const labelsAscending = [...labels].reverse();
        const dataAscending = [...dataPoints].reverse();

        updateChart(labelsAscending, `${currentBorough} - Crime Trends`, dataAscending);

        const message = `Showing ${currentBorough} crime trends for the last ${months} months` +
          (missingCount ? ` (${missingCount} month(s) have no data)` : '');
        setStatus(message, false);

      } catch (error) {
        console.error('Trend request failed:', error);
        setStatus(`Unable to load trend: ${error.message}`, true);
      }
    };

    const init = async () => {
      try {
        // Wait for Chart.js to load if it hasn't yet
        if (typeof Chart === 'undefined') {
          console.log('Waiting for Chart.js to load...');
          await new Promise(resolve => {
            const checkChart = setInterval(() => {
              if (typeof Chart !== 'undefined') {
                clearInterval(checkChart);
                resolve();
              }
            }, 100);
            
            // Timeout after 5 seconds
            setTimeout(() => {
              clearInterval(checkChart);
              resolve();
            }, 5000);
          });
        }

        if (typeof Chart === 'undefined') {
          throw new Error('Chart.js failed to load');
        }

        // Set up event listener for month selection
        monthsSelect.addEventListener('change', loadTrend);

        // Load initial trend
        await loadTrend();
      } catch (error) {
        console.error('Failed to initialise statistics page:', error);
        setStatus(`Error: ${error.message}`, true);
      }
    };

    // Start initialisation
    init();
  });
})();