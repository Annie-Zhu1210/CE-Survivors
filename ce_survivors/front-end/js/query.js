(function (global) {
  if (!global) {
    return;
  }

  const DEFAULT_CATEGORY = 'all-crime';

  const fetchJson = async (path, { query } = {}) => {
    let url = path;
    if (query && typeof query === 'object') {
      const params = new URLSearchParams();
      Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .forEach(([key, value]) => params.append(key, value));
      const queryString = params.toString();
      if (queryString) {
        url = `${path}?${queryString}`;
      }
    }

    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request to ${url} failed with status ${response.status}`);
    }
    return response.json();
  };

  const Query = {
    async getLondonTopology() {
      return fetchJson('/london-topojson.json');
    },

    async getBoroughList() {
      return fetchJson('/api/boroughs');
    },

    async getBoroughCrimeTotals({ category = DEFAULT_CATEGORY, date } = {}) {
      return fetchJson('/api/boroughs/crime-totals', {
        query: { category, date }
      });
    },

    async getBoroughTrend(boroughId, { months = 12, category = DEFAULT_CATEGORY } = {}) {
      if (!boroughId) {
        throw new Error('A borough id is required to load trend data.');
      }
      const safeBorough = encodeURIComponent(boroughId);
      return fetchJson(`/api/boroughs/${safeBorough}/trend`, {
        query: { months, category }
      });
    },

    async getCrimeMonths() {
      return fetchJson('/api/crime-months');
    },

    async getBoroughSummary(boroughId, { date, category = DEFAULT_CATEGORY } = {}) {
      if (!boroughId) {
        throw new Error('A borough id is required to load summary data.');
      }
      return fetchJson('/api/crimes', {
        query: { borough: boroughId, date, category }
      });
    }
  };

  global.Query = Object.freeze(Query);
})(window);
