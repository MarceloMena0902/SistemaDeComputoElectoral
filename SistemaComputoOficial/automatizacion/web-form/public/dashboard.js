const API_BASE = "http://localhost:4000";

const DEPARTMENTS = {
  1: {
    name: "Chuquisaca",
    lat: -19.0333,
    lng: -65.2627
  },
  2: {
    name: "La Paz",
    lat: -16.5,
    lng: -68.15
  },
  3: {
    name: "Cochabamba",
    lat: -17.3895,
    lng: -66.1568
  },
  4: {
    name: "Oruro",
    lat: -17.9667,
    lng: -67.1167
  },
  5: {
    name: "Potosí",
    lat: -19.5836,
    lng: -65.7531
  },
  6: {
    name: "Tarija",
    lat: -21.5355,
    lng: -64.7296
  },
  7: {
    name: "Santa Cruz",
    lat: -17.7833,
    lng: -63.1821
  },
  8: {
    name: "Beni",
    lat: -14.8333,
    lng: -64.9
  },
  9: {
    name: "Pando",
    lat: -11.0267,
    lng: -68.7692
  }
};

let map = null;
let departmentLayer = null;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("es-BO");
}

function getDepartmentCode(acta) {
  const codigo = String(
    acta.codigo_territorial ||
    acta.codigo_mesa ||
    acta.nro_acta ||
    ""
  ).trim();

  if (!codigo) return null;

  const firstDigit = Number(codigo.charAt(0));

  if (!DEPARTMENTS[firstDigit]) return null;

  return firstDigit;
}

async function fetchActas() {
  const response = await fetch(`${API_BASE}/api/oficial/actas`);

  if (!response.ok) {
    throw new Error("No se pudo obtener la lista de actas oficiales.");
  }

  const result = await response.json();

  return Array.isArray(result.data) ? result.data : [];
}

function buildDepartmentStats(actas) {
  const stats = {};

  for (const code of Object.keys(DEPARTMENTS)) {
    stats[code] = {
      code: Number(code),
      name: DEPARTMENTS[code].name,
      totalActas: 0,
      validas: 0,
      observadas: 0,
      totalVotos: 0,
      votosValidos: 0,
      votosBlancos: 0,
      votosNulos: 0,
      partido1: 0,
      partido2: 0,
      partido3: 0,
      partido4: 0
    };
  }

  for (const acta of actas) {
    const departmentCode = getDepartmentCode(acta);

    if (!departmentCode || !stats[departmentCode]) continue;

    const votos = acta.votos || {};
    const totalVotos = Number(votos.total_votos || 0);

    stats[departmentCode].totalActas += 1;
    stats[departmentCode].totalVotos += totalVotos;
    stats[departmentCode].votosValidos += Number(votos.votos_validos || 0);
    stats[departmentCode].votosBlancos += Number(votos.votos_blancos || 0);
    stats[departmentCode].votosNulos += Number(votos.votos_nulos || 0);
    stats[departmentCode].partido1 += Number(votos.partido1 || 0);
    stats[departmentCode].partido2 += Number(votos.partido2 || 0);
    stats[departmentCode].partido3 += Number(votos.partido3 || 0);
    stats[departmentCode].partido4 += Number(votos.partido4 || 0);

    if (acta.estado_acta === "OBSERVADA_PENDIENTE_REVISION" || acta.requiere_revision_humana) {
      stats[departmentCode].observadas += 1;
    } else {
      stats[departmentCode].validas += 1;
    }
  }

  return Object.values(stats);
}

function buildGlobalStats(departmentStats) {
  return departmentStats.reduce(
    (acc, item) => {
      acc.totalActas += item.totalActas;
      acc.validas += item.validas;
      acc.observadas += item.observadas;
      acc.totalVotos += item.totalVotos;
      acc.votosValidos += item.votosValidos;
      acc.votosBlancos += item.votosBlancos;
      acc.votosNulos += item.votosNulos;
      acc.partido1 += item.partido1;
      acc.partido2 += item.partido2;
      acc.partido3 += item.partido3;
      acc.partido4 += item.partido4;

      return acc;
    },
    {
      totalActas: 0,
      validas: 0,
      observadas: 0,
      totalVotos: 0,
      votosValidos: 0,
      votosBlancos: 0,
      votosNulos: 0,
      partido1: 0,
      partido2: 0,
      partido3: 0,
      partido4: 0
    }
  );
}

function initMap() {
  if (map) return;

  map = L.map("bolivia-map", {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([-16.8, -64.7], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(map);

  departmentLayer = L.layerGroup().addTo(map);
}

function getCircleRadius(totalVotos, maxVotes) {
  if (!totalVotos || !maxVotes) return 10;

  const minRadius = 12;
  const maxRadius = 46;
  const ratio = totalVotos / maxVotes;

  return minRadius + ratio * (maxRadius - minRadius);
}

function renderMap(departmentStats) {
  initMap();

  departmentLayer.clearLayers();

  const maxVotes = Math.max(...departmentStats.map((item) => item.totalVotos), 0);

  for (const item of departmentStats) {
    const department = DEPARTMENTS[item.code];

    if (!department) continue;

    const radius = getCircleRadius(item.totalVotos, maxVotes);

    const marker = L.circleMarker([department.lat, department.lng], {
      radius,
      color: "#22c55e",
      weight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.42
    });

marker.bindPopup(`
  <strong>${item.name}</strong><br/>
  Total votos: ${formatNumber(item.totalVotos)}<br/>
  Actas cargadas: ${formatNumber(item.totalActas)}<br/>
  Actas válidas: ${formatNumber(item.validas)}<br/>
  Actas observadas: ${formatNumber(item.observadas)}<br/>
  Votos válidos: ${formatNumber(item.votosValidos)}<br/>
  Blancos: ${formatNumber(item.votosBlancos)}<br/>
  Nulos: ${formatNumber(item.votosNulos)}
`);

marker.bindTooltip(
  `${item.name}<br>${formatNumber(item.totalVotos)} votos`,
  {
    permanent: true,
    direction: "top",
    className: "department-label"
  }
);

    marker.addTo(departmentLayer);
  }

  const mapStatus = document.getElementById("map-status");

  if (mapStatus) {
    mapStatus.textContent = "Votos por departamento";
  }
}

function renderKpis(globalStats) {
  document.getElementById("kpi-total-actas").textContent = formatNumber(globalStats.totalActas);
  document.getElementById("kpi-validas").textContent = formatNumber(globalStats.validas);
  document.getElementById("kpi-observadas").textContent = formatNumber(globalStats.observadas);
  document.getElementById("kpi-total-votos").textContent = formatNumber(globalStats.totalVotos);
}

function setBar(id, textId, value, maxValue) {
  const bar = document.getElementById(id);
  const text = document.getElementById(textId);

  const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;

  if (bar) {
    bar.style.width = `${percent}%`;
  }

  if (text) {
    text.textContent = formatNumber(value);
  }
}

function renderPartyResults(globalStats) {
  const maxPartyVotes = Math.max(
    globalStats.partido1,
    globalStats.partido2,
    globalStats.partido3,
    globalStats.partido4,
    0
  );

  setBar("bar-p1", "txt-p1", globalStats.partido1, maxPartyVotes);
  setBar("bar-p2", "txt-p2", globalStats.partido2, maxPartyVotes);
  setBar("bar-p3", "txt-p3", globalStats.partido3, maxPartyVotes);
  setBar("bar-p4", "txt-p4", globalStats.partido4, maxPartyVotes);

  document.getElementById("txt-validos").textContent = formatNumber(globalStats.votosValidos);
  document.getElementById("txt-blancos").textContent = formatNumber(globalStats.votosBlancos);
  document.getElementById("txt-nulos").textContent = formatNumber(globalStats.votosNulos);
}

function renderDepartmentsTable(departmentStats) {
  const tbody = document.getElementById("departments-table");

  if (!tbody) return;

  const rows = departmentStats
    .filter((item) => item.totalActas > 0)
    .sort((a, b) => b.totalVotos - a.totalVotos);

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin datos cargados todavía.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map((item) => {
      return `
        <tr>
          <td>${item.name}</td>
          <td>${formatNumber(item.totalActas)}</td>
          <td>${formatNumber(item.validas)}</td>
          <td>${formatNumber(item.observadas)}</td>
          <td>${formatNumber(item.totalVotos)}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadDashboard() {
  try {
    const actas = await fetchActas();
    const departmentStats = buildDepartmentStats(actas);
    const globalStats = buildGlobalStats(departmentStats);

    renderKpis(globalStats);
    renderPartyResults(globalStats);
    renderDepartmentsTable(departmentStats);
    renderMap(departmentStats);
  } catch (error) {
    const mapStatus = document.getElementById("map-status");

    if (mapStatus) {
      mapStatus.textContent = "Error al cargar datos";
    }

    console.error(error);
    alert("No se pudo cargar el dashboard. Verifica que el backend mock esté en http://localhost:4000.");
  }
}

let dashboardLoading = false;
let autoRefreshInterval = null;

async function safeLoadDashboard() {
  if (dashboardLoading) return;

  dashboardLoading = true;

  const refreshButton = document.getElementById("btn-refresh");
  const mapStatus = document.getElementById("map-status");

  try {
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "Actualizando...";
    }

    await loadDashboard();

    if (mapStatus) {
      const now = new Date().toLocaleTimeString("es-BO");
      mapStatus.textContent = `Actualizado: ${now}`;
    }
  } catch (error) {
    console.error(error);

    if (mapStatus) {
      mapStatus.textContent = "Error al actualizar";
    }
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Actualizar dashboard";
    }

    dashboardLoading = false;
  }
}

function startAutoRefresh() {
  safeLoadDashboard();

  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    safeLoadDashboard();
  }, 5000);
}

document.getElementById("btn-refresh")?.addEventListener("click", safeLoadDashboard);

startAutoRefresh();

loadDashboard();