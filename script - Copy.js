let activeJourney = null;
let etaInterval = null;
let journeyStartTime = null;
let journeyDuration = null; // in seconden
let progressInterval = null;
const dbRef = firebase.database().ref('activeJourney');

async function getActiveJourney() {
  const snapshot = await db.ref('activeJourney').once('value');
  return snapshot.val();
}

function markActiveJourneyButton(btn) {
  document.querySelectorAll('.start-journey-btn').forEach(b => b.classList.remove('active-journey'));
  btn.classList.add('active-journey');
}

async function loadSchedule() {
  // 1) Registreer precies één listener voor alle devices
  dbRef.on('value', snapshot => {
    handleFirebaseJourneyChange(snapshot.val());
  });

  // 2) Haal je lokale agenda op
  const response = await fetch('data.json');
  const data = await response.json();
  const scheduleContainer = document.getElementById('schedule');
  scheduleContainer.innerHTML = "";

  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nextEventTime = null;

  // 3) Loop over alle dagen in data.json
  for (const date in data) {
    const [y, m, d] = date.split('-');
    const dateObj = new Date(y, m - 1, d);
    if (dateObj < today) continue;

    const day = data[date];
    const block = document.createElement('div');
    block.className = 'day-block';

    // Datum kop
    const heading = document.createElement('h2');
    heading.textContent = `${d}/${m}/${y} – ${day.location}`;
    block.appendChild(heading);

    // 4) Loop over alle events
    for (const event of day.events) {
      const eDiv = document.createElement('div');
      const eTitle = document.createElement('p');
      eTitle.innerHTML = `<strong>${event.time}</strong> – ${event.title}`;
      eDiv.appendChild(eTitle);

      const plannedTimeStr = `${date}T${event.time}`;

      // Button-wrapper
      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'button-group';

      // Open route-knop
      if (event.maps_link) {
        const btnMap = document.createElement('button');
        btnMap.textContent = 'Open route';
        btnMap.onclick = () => window.open(event.maps_link, '_blank');
        buttonWrapper.appendChild(btnMap);
      }

      // Start journey-knop
      if (event.destination_coords) {
        const btnStart = document.createElement('button');
        btnStart.textContent = '▶ Start journey';
        btnStart.classList.add('start-journey-btn');
        btnStart.onclick = () => {
          const journeyId = `${date}_${event.time.replace(':', '-')}`;
          eDiv.dataset.journeyId = journeyId;
          dbRef.set({
            id: journeyId,
            coords: event.destination_coords,
            plannedTimeStr,
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });
          // lokale UI-updates...
        };
        buttonWrapper.appendChild(btnStart);
      }

      eDiv.appendChild(buttonWrapper);

      // Weer-widget, etc.
      if (event.weather_location && event.duration_minutes) {
        showWeatherForecast(
          event.weather_location,
          plannedTimeStr,
          event.duration_minutes,
          eDiv
        );
      }

      // Volgende event voor countdown
      const eventDate = new Date(plannedTimeStr);
      if (!nextEventTime || (eventDate > now && eventDate < nextEventTime)) {
        nextEventTime = eventDate;
      }

      // **Snippet: zet hier de data-journey-id**
      const journeyId = `${date}_${event.time.replace(':', '-')}`;
      eDiv.dataset.journeyId = journeyId;

      block.appendChild(eDiv);
    }

    scheduleContainer.appendChild(block);
  }

  // Countdown-init
  if (nextEventTime) {
    updateCountdown(nextEventTime);
    setInterval(() => updateCountdown(nextEventTime), 1000);
  }
}

function updateCountdown(targetTime) {
  const now = new Date();
  const diff = targetTime - now;
  const countdownDiv = document.getElementById('countdowns');

  if (diff <= 0) {
    countdownDiv.textContent = 'Next activity is ongoing or is finished.';
    return;
  }

  const hrs = Math.floor(diff / 1000 / 60 / 60);
  const mins = Math.floor((diff / 1000 / 60) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  countdownDiv.textContent = `⏳ Time until next activity: ${hrs}h ${mins}m ${secs}s`;
}

async function showWeatherForecast(location, startTime, durationMinutes, container) {
  const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${WEATHER_API_KEY}`;
  const geoRes = await fetch(geocodeUrl);
  const geoData = await geoRes.json();

  if (!geoData.length) return alert("Location not found.");
  const { lat, lon } = geoData[0];

  // fetch forecast
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=en`;
  const forecastRes = await fetch(forecastUrl);
  const forecastData = await forecastRes.json();

  // fetch current for sunrise/sunset
  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}`;
  const currentRes = await fetch(currentUrl);
  const currentData = await currentRes.json();

  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const margin = 90 * 60 * 1000;

  const relevant = forecastData.list.filter(entry => {
    const t = new Date(entry.dt_txt);
    return t >= new Date(start.getTime() - margin) && t <= new Date(end.getTime() + margin);
  });

  if (!relevant.length) return alert("No forecast available for this timeframe.");

  // sunrise/sunset
  const sunrise = new Date(currentData.sys.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(currentData.sys.sunset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const wrapper = document.createElement('div');
  const forecastDate = `${start.getDate().toString().padStart(2, '0')}/${(start.getMonth()+1).toString().padStart(2, '0')}/${start.getFullYear()}`;
  wrapper.innerHTML = `
    <strong>🌦 Weather forecast for ${location} (${start.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} – ${end.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} on ${forecastDate}):</strong><br>
    🌅 Sunrise: ${sunrise} | 🌇 Sunset: ${sunset}
  `;

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.marginTop = '0.5em';
  table.style.fontSize = '0.85em';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr style="background:#f0f0f0;">
      <th style="padding:3px;border:1px solid #ccc;">Time</th>
      <th style="padding:3px;border:1px solid #ccc;">Temp</th>
      <th style="padding:3px;border:1px solid #ccc;">Weather</th>
      <th style="padding:3px;border:1px solid #ccc;">Wind</th>
      <th style="padding:3px;border:1px solid #ccc;">Humidity</th>
      <th style="padding:3px;border:1px solid #ccc;">Rain</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const entry of relevant) {
    const t = new Date(entry.dt_txt);
    const hour = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const icon = `https://openweathermap.org/img/wn/${entry.weather[0].icon}@2x.png`;

    const rainVolume = entry.rain?.['3h'] || 0;
    let rainType = "None";
    if (rainVolume >= 7.6) rainType = "Heavy";
    else if (rainVolume >= 2.5) rainType = "Moderate";
    else if (rainVolume >= 0.1) rainType = "Light";

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="padding:5px;border:1px solid #ccc;text-align:center;">${hour}</td>
      <td style="padding:5px;border:1px solid #ccc;text-align:center;">${entry.main.temp}°C</td>
      <td style="padding:5px;border:1px solid #ccc;text-align:center;">
        <img src="${icon}" style="height:18px;vertical-align:middle;" alt="${entry.weather[0].description}" title="${entry.weather[0].description}">
        ${entry.weather[0].description}
      </td>
      <td style="padding:5px;border:1px solid #ccc;text-align:center;">${entry.wind.speed} m/s</td>
      <td style="padding:5px;border:1px solid #ccc;text-align:center;">${entry.main.humidity}%</td>
      <td style="padding:5px;border:1px solid #ccc;text-align:center;">
        ${rainType} ${rainVolume > 0 ? `(${rainVolume.toFixed(1)} mm)` : ""}
      </td>
    `;
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function updateProgressBar() {
  if (journeyDuration === null || journeyStartTime === null) return;

  const elapsed = (Date.now() - journeyStartTime) / 1000; // seconden
  const percent = Math.min(100, (elapsed / journeyDuration) * 100);
  const progressBar = document.getElementById('progressBar');
  progressBar.style.width = `${percent}%`;
}

window.onload = () => {
  loadSchedule();
};


async function showETA(destination, plannedTimeStr, container) {
  if (!navigator.geolocation) {
    container.textContent = "ETA unavailable: GPS not supported.";
    return;
  }

  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;
    const origin = `${latitude},${longitude}`;
    const destinationStr = `${destination.lat},${destination.lon}`;
    const plannedTime = new Date(plannedTimeStr);

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destinationStr}&key=${GOOGLE_MAPS_API_KEY}&departure_time=now`;
    const proxy = "https://corsproxy.io/?";

    try {
      const res = await fetch(proxy + url);
      const data = await res.json();

      if (!data.routes || !data.routes.length) {
        container.textContent = "ETA unavailable: no route.";
        return;
      }

      const leg = data.routes[0].legs[0];
      const durationSec = leg.duration.value;
      journeyDuration = durationSec; // nodig voor progress bar
      const eta = new Date(Date.now() + durationSec * 1000);

      const diffMin = Math.round((eta - plannedTime) / 60000);
      const label = diffMin === 0
        ? "on time"
        : (diffMin > 0 ? `${diffMin} min late` : `${Math.abs(diffMin)} min early`);

      const text = `🛰️ Estimated arrival: ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${label})`;
      container.textContent = text;
      document.getElementById('eta').textContent = text;

      // Start of reset progress bar
      journeyStartTime = Date.now();
      document.getElementById('progressBar').style.width = '0%';
      document.getElementById('progressContainer').style.display = 'block';

      clearInterval(progressInterval);
      updateProgressBar(); // meteen één keer updaten
      progressInterval = setInterval(updateProgressBar, 1000); // elke seconde bijwerken

    } catch (err) {
      console.error(err);
      container.textContent = "ETA error.";
    }
  }, () => {
    container.textContent = "GPS denied.";
  });
}

document.getElementById('toggleHeader').onclick = () => {
  const header = document.getElementById('mainHeader');
  const toggle = document.getElementById('toggleHeader');

  if (header.classList.contains('expanded')) {
    header.classList.remove('expanded');
    header.classList.add('collapsed');
    toggle.textContent = '▼';
  } else {
    header.classList.remove('collapsed');
    header.classList.add('expanded');
    toggle.textContent = '▲';
  }
};

function handleFirebaseJourneyChange(data) {
  // 1) Ruim eerst de oude UI-elementen op
  clearInterval(etaInterval);
  document.querySelectorAll('.eta-box, .end-journey-btn').forEach(el => el.remove());

  // 2) Reset knoppen/progress
  document.getElementById('progressContainer').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('eta').textContent = '🛰️ ETA will appear here once a journey is started.';
  document.querySelectorAll('.start-journey-btn').forEach(btn => btn.style.display = 'inline-block');

  if (!data) {
    // Geen actieve journey: klaar
    return;
  }

  // 3) Er is wél een actieve journey: vind het bijbehorende blok
  const target = document.querySelector(`[data-journey-id="${data.id}"]`);
  if (!target) return;

  // 4) UI: hide alle start-knoppen
  document.querySelectorAll('.start-journey-btn').forEach(btn => btn.style.display = 'none');

  // 5) Voeg ETA-box toe
  const etaBox = document.createElement('div');
  etaBox.className = 'eta-box';
  target.appendChild(etaBox);

  // 6) Voeg 1 enkele End-Journey knop toe
  const btnStop = document.createElement('button');
  btnStop.textContent = '■ End journey';
  btnStop.classList.add('end-journey-btn');
  btnStop.onclick = () => {
    if (!confirm("Stop this journey?")) return;
    dbRef.remove();
  };
  target.querySelector('.button-group').appendChild(btnStop);

  // 7) Toon progress bar en start de ETA-refresh
  document.getElementById('progressContainer').style.display = 'block';
  showETA(data.coords, data.plannedTimeStr, etaBox);
  etaInterval = setInterval(() => {
    showETA(data.coords, data.plannedTimeStr, etaBox);
  }, 60000);
}
