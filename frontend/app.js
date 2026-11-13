let currentLocation = null;
const map = L.map('map').setView([-8.0476, -34.8770], 11);
// Camada topográfica (relevo) como mapa-base padrão.
const topoBase = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
}).addTo(map);

// Camada própria para o mapa de calor de altitude, acima do mapa-base.
map.createPane('altitudeHeatPane');
map.getPane('altitudeHeatPane').style.zIndex = 420;
map.getPane('altitudeHeatPane').style.pointerEvents = 'auto';

// Camada de ruas como alternativa, caso o usuário queira comparar.
const ruasBase = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
L.control.layers(
  { 'Mapa topográfico': topoBase, 'Mapa de ruas': ruasBase },
  null,
  { position: 'topright', collapsed: true }
).addTo(map);
let marker = null, riskLayer = null, altitudeLayer = null;

const $ = id => document.getElementById(id);
function fmt(value, digits=1) { return value == null ? '—' : Number(value).toFixed(digits); }
function setRisk(score, level, text) {
  $('riskNumber').innerHTML = `${score}<small>%</small>`;
  $('riskLevel').textContent = level;
  $('riskText').textContent = text;
  $('riskMeter').style.width = `${score}%`;
  const color = score >= 70 ? '#c43d3d' : score >= 40 ? '#c58a13' : '#16845b';
  $('riskNumber').style.color = color; $('riskMeter').style.background = color;
}
function renderRecommendations(score, rain, slope) {
  let items = ['Acompanhe os canais oficiais da Defesa Civil e da APAC.'];
  if (rain >= 10) items.unshift('Chuva horária elevada na previsão: evite atravessar ruas alagadas e áreas próximas a canais.');
  if (slope >= 8) items.unshift('Amostras indicam inclinação local relevante: mantenha distância de taludes e encostas.');
  if (score >= 70) items.unshift('Estimativa elevada: procure um local seguro e siga orientações das autoridades.');
  else if (score >= 40) items.unshift('Atenção: observe sinais de risco, como rachaduras, água barrenta e movimentação do solo.');
  else items.unshift('Mantenha-se informado e evite áreas conhecidamente vulneráveis durante chuvas fortes.');
  $('recommendations').innerHTML = `<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul><small class="muted">Orientações gerais; siga sempre instruções oficiais.</small>`;
}
function drawRiskGrid(lat, lon, score) {
  if (riskLayer) map.removeLayer(riskLayer);
  const color = score >= 70 ? '#d84b4b' : score >= 40 ? '#e3b43e' : '#57ad83';
  const cells = [];
  const step = 0.004;
  for (let y=-2;y<=2;y++) for (let x=-2;x<=2;x++) {
    const south=lat+(y-.5)*step, north=lat+(y+.5)*step;
    const west=lon+(x-.5)*step, east=lon+(x+.5)*step;
    cells.push(L.rectangle([[south,west],[north,east]],{
      color, weight:1, fillColor:color, fillOpacity:.10, dashArray:'4 4'
    }));
  }
  riskLayer=L.layerGroup(cells).addTo(map);
}
function altitudeColor(value, min, max) {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  // Gradiente hipsométrico: verde (baixo), amarelo (médio), vermelho (alto).
  if (ratio < 0.5) {
    const t = ratio * 2;
    return `rgb(${Math.round(45 + 205*t)},${Math.round(155 + 35*t)},${Math.round(90 - 35*t)})`;
  }
  const t = (ratio - 0.5) * 2;
  return `rgb(250,${Math.round(190 - 115*t)},${Math.round(55 - 15*t)})`;
}
function drawAltitudeHeatmap(grid) {
  if (altitudeLayer) map.removeLayer(altitudeLayer);
  if (!Array.isArray(grid) || !grid.length) return;
  const valid = grid.filter(p => Number.isFinite(Number(p.elevation_m)));
  if (!valid.length) return;
  const values = valid.map(p => Number(p.elevation_m));
  const min = Math.min(...values), max = Math.max(...values);
  const latitudes = [...new Set(valid.map(p => Number(p.latitude)))].sort((a,b)=>a-b);
  const longitudes = [...new Set(valid.map(p => Number(p.longitude)))].sort((a,b)=>a-b);
  const latStep = latitudes.length > 1 ? Math.abs(latitudes[1]-latitudes[0]) : 0.0009;
  const lonStep = longitudes.length > 1 ? Math.abs(longitudes[1]-longitudes[0]) : 0.0009;
  const cells = valid.map(point => {
    const lat=Number(point.latitude), lon=Number(point.longitude);
    const color=altitudeColor(Number(point.elevation_m),min,max);
    return L.rectangle([[lat-latStep/2,lon-lonStep/2],[lat+latStep/2,lon+lonStep/2]],{
      pane:'altitudeHeatPane', color, weight:0.7, opacity:0.55,
      fillColor:color, fillOpacity:0.52, interactive:true
    }).bindTooltip(`Altitude estimada: ${fmt(point.elevation_m)} m`,{sticky:true});
  });
  altitudeLayer=L.layerGroup(cells).addTo(map);
  const center=valid.find(p=>Number(p.row)===3 && Number(p.col)===3) || valid[Math.floor(valid.length/2)];
  $('elevation').textContent=`${fmt(center.elevation_m)} m`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Falha na consulta');
  return data;
}
async function updateDashboard(lat, lon) {
  currentLocation={latitude:lat,longitude:lon};
  $('coords').textContent=`Latitude: ${lat.toFixed(5)} · Longitude: ${lon.toFixed(5)}`;
  $('locationText').textContent=`${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  if (marker) marker.remove();
  marker=L.marker([lat,lon]).addTo(map).bindPopup('Sua localização aproximada').openPopup();
  map.setView([lat,lon],15);
  $('updated').textContent='Consultando dados…';

  let rain=0, slope=0, weatherOk=false, topoOk=false;
  try {
    const weather=await fetchJson(`/api/weather?latitude=${lat}&longitude=${lon}`);
    weatherOk=true;
    const hours=weather.hours || [];
    rain=Number(hours[0]?.precipitation_mm || 0);
    $('rainNow').textContent=`${fmt(rain)} mm`;
    $('weatherMini').innerHTML=hours.slice(0,5).map(h=>`<div class="hour-chip">${h.time.slice(11,16)}<b>${fmt(h.precipitation_mm)} mm</b></div>`).join('');
    $('forecast').innerHTML=hours.map(h=>`<div class="forecast-item"><b>${h.time.slice(11,16)}</b><span>${fmt(h.precipitation_mm)} mm</span><span>${h.precipitation_probability ?? '—'}% chance</span></div>`).join('');
  } catch(e) {
    $('rainNow').textContent='Indisponível'; $('weatherMini').textContent=e.message;
    $('forecast').textContent='Não foi possível carregar a previsão.';
  }
  try {
    const topo=await fetchJson(`/api/elevation?latitude=${lat}&longitude=${lon}`);
    topoOk=true; slope=Number(topo.estimated_slope_percent || 0);
    $('elevation').textContent=`${fmt(topo.elevation_m)} m`;
    $('slope').textContent=`${fmt(slope,2)}%`;
    drawAltitudeHeatmap(topo.grid || []);
  } catch(e) {
    $('elevation').textContent='Indisponível'; $('slope').textContent='—';
  }
  // Índice ilustrativo e não validado: mistura chuva horária e declividade local.
  let score=Math.min(100,Math.round((Math.min(rain,30)/30)*65 + (Math.min(slope,20)/20)*35));
  if (!weatherOk && !topoOk) {
    setRisk(0,'Dados indisponíveis','Não foi possível consultar as fontes externas. Não há estimativa.');
  } else {
    const level=score>=70?'Atenção elevada':score>=40?'Atenção moderada':'Menor estimativa';
    setRisk(score,level,`Índice demonstrativo calculado com ${weatherOk?'chuva':'sem chuva'} e ${topoOk?'topografia':'sem topografia'}.`);
    renderRecommendations(score,rain,slope);
    drawRiskGrid(lat,lon,score);
  }
  $('updated').textContent=`Última atualização: ${new Date().toLocaleString('pt-BR')}`;
  setTimeout(() => map.invalidateSize(), 100);
}
$('locateBtn').addEventListener('click',()=>{
  if(!navigator.geolocation){alert('Seu navegador não oferece geolocalização.');return;}
  $('locateBtn').disabled=true; $('locateBtn').textContent='Consultando localização…';
  navigator.geolocation.getCurrentPosition(
    pos=>{updateDashboard(pos.coords.latitude,pos.coords.longitude).finally(()=>{$('locateBtn').disabled=false;$('locateBtn').textContent='◎ Atualizar minha localização';});},
    err=>{alert('Não foi possível obter a localização. Verifique a permissão do navegador e tente novamente.');$('locateBtn').disabled=false;$('locateBtn').textContent='◎ Usar minha localização';},
    {enableHighAccuracy:true,timeout:15000,maximumAge:60000}
  );
});
$('sosBtn').addEventListener('click',async()=>{
  if(!currentLocation){alert('Primeiro permita o acesso à sua localização.');return;}
  $('sosBtn').disabled=true; $('sosBtn').textContent='Registrando…';
  try {
    const result=await fetchJson('/api/sos',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...currentLocation,name:$('sosName').value||'Pessoa solicitante',message:$('sosMessage').value||'Preciso de ajuda.'})});
    $('sosResult').textContent=`Solicitação demonstrativa nº ${result.request.id} registrada. ${result.warning}`;
  } catch(e) {$('sosResult').textContent=`Erro ao registrar: ${e.message}`;}
  $('sosBtn').disabled=false;$('sosBtn').textContent='Enviar pedido demonstrativo';
});

// Mantém o Leaflet ajustado quando a orientação ou largura da tela muda.
window.addEventListener('resize', () => map.invalidateSize());
