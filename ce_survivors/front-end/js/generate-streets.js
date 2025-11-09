/**
 * generate-streets.js
 * 
 * 使用 Node.js + Overpass API + osmtogeojson 生成伦敦 borough 街道 JSON
 * 输出格式：streetsByBorough.json
 */

const fs = require('fs');
const fetch = require('node-fetch');
const osmtogeojson = require('osmtogeojson');
const { DOMParser } = require('xmldom');

// 伦敦 borough 名称列表（可根据需要调整）
const boroughs = [
  "Camden", "Greenwich", "Hackney", "Hammersmith and Fulham",
  "Islington", "Kensington and Chelsea", "Lambeth", "Lewisham",
  "Southwark", "Tower Hamlets", "Wandsworth", "Westminster",
  "Brent", "Ealing", "Hounslow", "Harrow", "Barnet", "Haringey",
  "Enfield", "Redbridge", "Barking and Dagenham", "Bexley", "Croydon",
  "Havering", "Hillingdon", "Hammersmith and Fulham", "Kingston upon Thames"
];

const overpassQuery = (borough) => `
[out:xml][timeout:60];
area["name"="${borough}"]["boundary"="administrative"]["admin_level"="10"]->.a;
(
  way(area.a)["highway"];
);
out body;
>;
out skel qt;
`;

async function fetchBoroughStreets(borough) {
  console.log(`Fetching streets for ${borough}...`);
  const query = overpassQuery(borough);
  const url = 'https://overpass-api.de/api/interpreter';
  const res = await fetch(url, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${borough}: ${res.status}`);
  const osmXml = await res.text();
  const geojson = osmtogeojson(new DOMParser().parseFromString(osmXml, 'text/xml'));

  const streetsSet = new Set();
  geojson.features.forEach(f => {
    if (f.properties && f.properties.name) streetsSet.add(f.properties.name);
  });

  return {
    streets: Array.from(streetsSet).sort(),
    geojson
  };
}

async function generateStreetsJSON() {
  const result = {};
  for (const borough of boroughs) {
    try {
      const data = await fetchBoroughStreets(borough);
      result[borough] = data;
    } catch (err) {
      console.error(`Error fetching ${borough}:`, err);
    }
  }
  fs.writeFileSync('streetsByBorough.json', JSON.stringify(result, null, 2));
  console.log('streetsByBorough.json has been generated!');
}

generateStreetsJSON();
