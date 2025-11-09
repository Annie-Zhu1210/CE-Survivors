/* statistics-explorer.js
 * Crime Statistics Explorer with interactive map selection, crime type filtering, and save button
 */

(function () {
  let selectedBorough = null;
  let chartInstance = null;
  let mapSvg = null;

  const COLOR_NEUTRAL = '#9ca3af'; // Gray for unselected boroughs
  const COLOR_SELECTED = '#014f86'; // Blue for selected borough

  document.addEventListener('DOMContentLoaded', () => {
    const explorerMapContainer = document.getElementById('explorerMap');
    const mapStatusEl = document.getElementById('explorerMapStatus');
    const trendStatusEl = document.getElementById('trendStatus');
    const canvas = document.getElementById('trendChart');
    const saveBtn = document.getElementById('saveBtn');
    const boroughDisplay = document.getElementById('selectedBoroughDisplay');
    const crimeTypeSelect = document.getElementById('crimeTypeSelect');
    const monthsSelect = document.getElementById('trendMonths');

    if (!explorerMapContainer || !canvas || !saveBtn) {
      console.error('Required elements not found!');
      return;
    }

    // Try to get previously selected borough from localStorage
    const storedBorough = localStorage.getItem('selectedBorough');
    if (storedBorough) {
      selectedBorough = storedBorough;
      boroughDisplay.value = storedBorough;
    }

    const setMapStatus = (message, isError = false) => {
      if (mapStatusEl) {
        mapStatusEl.textContent = message;
        mapStatusEl.classList.toggle('error', isError);
        mapStatusEl.style.display = message ? 'block' : 'none';
      }
    };

    const setTrendStatus = (message, isError = false) => {
      if (trendStatusEl) {
        trendStatusEl.textContent = message;
        trendStatusEl.classList.toggle('error', isError);
        trendStatusEl.style.display = message ? 'block' : 'none';
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

    // Render the small interactive map
    const renderExplorerMap = (topology) => {
      if (!window.d3 || !window.topojson) {
        throw new Error('D3 or topojson is not available.');
      }

      const features = window.topojson.feature(topology, topology.objects.london_geo).features;
      const width = 360;
      const height = 380;

      mapSvg = window.d3
        .select(explorerMapContainer)
        .append('svg')
        .attr('class', 'explorer-map-svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('role', 'img')
        .attr('aria-label', 'Interactive borough selection map');

      const projection = window.d3.geoMercator()
        .fitSize([width, height], { type: 'FeatureCollection', features });

      const geoPath = window.d3.geoPath(projection);

      const paths = mapSvg.selectAll('path.explorer-borough-path')
        .data(features)
        .enter()
        .append('path')
        .attr('class', 'explorer-borough-path')
        .attr('data-borough', d => d.id)
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('d', geoPath)
        .attr('fill', d => {
          // If this borough is selected, highlight it
          return (selectedBorough && d.id === selectedBorough) ? COLOR_SELECTED : COLOR_NEUTRAL;
        })
        .attr('stroke', '#ffffff')
        .attr('stroke-width', d => {
          return (selectedBorough && d.id === selectedBorough) ? 2.5 : 1;
        })
        .on('click', function(event, d) {
          handleBoroughSelection(d.id);
        })
        .on('keydown', function(event, d) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleBoroughSelection(d.id);
          }
        });

      // Add pop-ups to show borough names
      paths.append('title').text(d => d.id);

      // If a borough was pre-selected, mark it
      if (selectedBorough) {
        updateMapSelection(selectedBorough);
      }

      setMapStatus('', false);
    };

    // Handle borough selection from map
    const handleBoroughSelection = (boroughName) => {
      if (!boroughName) return;
      
      selectedBorough = boroughName;
      boroughDisplay.value = boroughName;
      
      // Save to local storage
      try {
        localStorage.setItem('selectedBorough', boroughName);
      } catch (e) {
        console.warn('localStorage not available', e);
      }

      // Update map visual selection
      updateMapSelection(boroughName);

      setTrendStatus('Borough selected. Click "Save & Generate Chart" to view statistics.', false);
    };

    // Update map to show selected borough
    const updateMapSelection = (boroughName) => {
      if (!mapSvg) return;

      mapSvg.selectAll('path.explorer-borough-path')
        .attr('fill', d => (d.id === boroughName) ? COLOR_SELECTED : COLOR_NEUTRAL)
        .attr('stroke-width', d => (d.id === boroughName) ? 2.5 : 1)
        .classed('selected', d => d.id === boroughName);
    };

    // Create the corresponding line chart
    const updateChart = (labels, datasetLabel, dataPoints, crimeType) => {
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
          },
          title: {
            display: true,
            text: `Crime Type: ${getCrimeTypeLabel(crimeType)}`,
            font: { size: 16, weight: 'bold' },
            padding: { bottom: 20 }
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
          setTrendStatus('Chart.js library not loaded', true);
          return;
        }
        chartInstance = new Chart(context, {
          type: 'line',
          data: chartData,
          options
        });
      }
    };

    // Crime type label
    const getCrimeTypeLabel = (crimeType) => {
      const labels = {
        'all-crime': 'All Crime',
        'anti-social-behaviour': 'Anti-Social Behaviour',
        'bicycle-theft': 'Bicycle Theft',
        'burglary': 'Burglary',
        'criminal-damage-arson': 'Criminal Damage & Arson',
        'drugs': 'Drugs',
        'other-theft': 'Other Theft',
        'possession-of-weapons': 'Possession of Weapons',
        'public-order': 'Public Order',
        'robbery': 'Robbery',
        'shoplifting': 'Shoplifting',
        'theft-from-the-person': 'Theft from the Person',
        'vehicle-crime': 'Vehicle Crime',
        'violent-crime': 'Violent Crime',
        'other-crime': 'Other Crime'
      };
      return labels[crimeType] || crimeType;
    };

    // Load and display the trend data
    const loadTrend = async () => {
      if (!selectedBorough) {
        setTrendStatus('Please select a borough from the map first.', true);
        return;
      }

      const months = Number.parseInt(monthsSelect.value, 10) || 12;
      const crimeType = crimeTypeSelect.value || 'all-crime';

      setTrendStatus(`Loading ${selectedBorough} crime trend for ${getCrimeTypeLabel(crimeType)}...`);
      console.log(`Loading trend for ${selectedBorough}, ${months} months, crime type: ${crimeType}`);

      try {
        const url = `/api/boroughs/${encodeURIComponent(selectedBorough)}/trend?months=${months}&category=${crimeType}`;
        console.log('Fetching from:', url);
        
        const trend = await fetchJson(url);
        console.log('Trend data received:', trend);
        
        const timeline = Array.isArray(trend?.months) ? trend.months : [];

        if (!timeline.length) {
          updateChart([], `${selectedBorough} - ${getCrimeTypeLabel(crimeType)}`, [], crimeType);
          setTrendStatus('No trend data available for this borough and crime type combination.', true);
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

        // Show the oldest to the newest from left to right
        const labelsAscending = [...labels].reverse();
        const dataAscending = [...dataPoints].reverse();

        updateChart(
          labelsAscending, 
          `${selectedBorough} - ${getCrimeTypeLabel(crimeType)}`, 
          dataAscending,
          crimeType
        );

        const message = `Showing ${selectedBorough} ${getCrimeTypeLabel(crimeType).toLowerCase()} trends for the last ${months} months` +
          (missingCount ? ` (${missingCount} months missing data)` : '');
        setTrendStatus(message, false);

      } catch (error) {
        console.error('Failed to load trend:', error);
        setTrendStatus(`Error loading crime data: ${error.message}`, true);
      }
    };

    // Save button click handler
    saveBtn.addEventListener('click', () => {
      loadTrend();
    });

    // Also allow Enter key in the form to trigger save
    document.getElementById('explorerControls').addEventListener('submit', (e) => {
      e.preventDefault();
      loadTrend();
    });

    // Initialise the map
    const initializeMap = async () => {
      try {
        setMapStatus('Loading borough map...');
        const topology = await fetchJson('/london-topojson.json');
        renderExplorerMap(topology);
        
        // If a borough was pre-selected, show message
        if (selectedBorough) {
          setTrendStatus('Click "Save & Generate Chart" to view statistics for the selected borough.', false);
        }
      } catch (err) {
        console.error('Failed to load map:', err);
        setMapStatus(`Unable to load map: ${err.message}`, true);
      }
    };

    initializeMap();
  });
})();
