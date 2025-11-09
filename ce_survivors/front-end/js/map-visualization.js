/* map-visualization.js
 * Render the London borough map, colour it by crime totals, and update the sidebar summary.
 */

(function () {
  const DEFAULT_CATEGORY = 'all-crime';
  const COLOR_SCALE = {
    high: '#d94141',      // red - 4000+
    medium: '#ff8c42',    // orange - 2500-3999
    low: '#f6c344',       // yellow - 1000-2499
    lowest: '#4caf50',    // green - < 1000
    unknown: '#d1d9e6'    // grey - no data
  };

  const LEGEND_THRESHOLDS = {
    high: 4000,
    medium: 2500,
    low: 1000
  };

  document.addEventListener('DOMContentLoaded', () => {
    const mapHost = document.getElementById('londonMap');
    if (!mapHost) return;

    const statusEl = document.getElementById('mapStatus');
    const listEl = document.getElementById('mapTopList');

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

    const classifyValue = (value) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return 'unknown';
      if (value >= LEGEND_THRESHOLDS.high) return 'high';
      if (value >= LEGEND_THRESHOLDS.medium) return 'medium';
      if (value >= LEGEND_THRESHOLDS.low) return 'low';
      return 'lowest';
    };

    const colorForValue = (value) => COLOR_SCALE[classifyValue(value)];

    const renderTopList = (summaries) => {
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!summaries.length) {
        listEl.innerHTML = '<li>No borough data available.</li>';
        return;
      }
      const topFive = summaries
        .filter(item => Number.isFinite(item.totalCrimes))
        .sort((a, b) => b.totalCrimes - a.totalCrimes)
        .slice(0, 5);

      topFive.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `${entry.borough}: ${entry.totalCrimes.toLocaleString()} crimes`;
        listEl.appendChild(li);
      });
    };

    const renderMap = (topology, totals) => {
      if (!window.d3 || !window.topojson) {
        throw new Error('D3 or topojson is not available.');
      }

      const features = window.topojson.feature(topology, topology.objects.london_geo).features;
      const width = 760;
      const height = 520;

      const summaryMap = new Map();
      const summaries = Array.isArray(totals?.summaries) ? totals.summaries : [];
      summaries.forEach(item => {
        if (item && item.borough && !item.error) {
          summaryMap.set(item.borough, item);
        }
      });

      const svg = window.d3
        .select(mapHost)
        .append('svg')
        .attr('class', 'london-map-svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('role', 'img')
        .attr('aria-label', 'London borough crime heat map');

      const projection = window.d3.geoMercator()
        .fitSize([width, height], { type: 'FeatureCollection', features });

      const geoPath = window.d3.geoPath(projection);

      const paths = svg.selectAll('path.borough-path')
        .data(features)
        .enter()
        .append('path')
        .attr('class', 'borough-path')
        .attr('data-borough', d => d.id)
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('focusable', 'true')
        .attr('d', geoPath)
        .attr('fill', d => {
          const summary = summaryMap.get(d.id);
          return colorForValue(summary?.totalCrimes);
        })
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 0.8)
        .on('mouseenter', function () {
          window.d3.select(this).attr('stroke-width', 1.6);
        })
        .on('mouseleave', function () {
          window.d3.select(this).attr('stroke-width', 0.8);
        });

      paths.append('title').text(d => {
        const summary = summaryMap.get(d.id);
        if (!summary) {
          return `${d.id}\nNo live data yet.`;
        }
        const dateLabel = summary.date ? `Month: ${summary.date}` : 'Latest available month';
        return `${d.id}\nCrimes: ${summary.totalCrimes.toLocaleString()}\n${dateLabel}`;
      });

      const errors = summaries.filter(item => item?.error);
      const resolvedDate = summaries.find(item => item?.date)?.date || totals?.requestedDate || 'latest available month';
      const category = totals?.category || DEFAULT_CATEGORY;
      const statusMessage = `Latest data: ${resolvedDate} - Category: ${category}${errors.length ? ` - ${errors.length} boroughs unavailable` : ''}`;
      setStatus(statusMessage, false);

      renderTopList(summaries);
    };

    const initialise = async () => {
      try {
        setStatus('Loading London borough map and crime totals...');
        const [topology, totals] = await Promise.all([
          fetchJson('/london-topojson.json'),
          fetchJson('/api/boroughs/crime-totals')
        ]);
        renderMap(topology, totals);
      } catch (err) {
        console.error('Failed to initialise map:', err);
        setStatus(`Unable to load map data: ${err.message}`, true);
      }
    };

    initialise();
  });
})();
