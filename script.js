let activeJourney = null;
let alreadyUploaded = false;
let scheduleData = {};
let countdownInterval = null;

const SHEET_URL = "https://opensheet.elk.sh/1XbpOSyhPHeR7T8tbabsAhW61rMxBY60IKQihS2F75mE/Sheet1";

async function getActiveJourney() {
  const snapshot = await db.ref('activeJourney').once('value');
  return snapshot.val();
}

function markActiveJourneyButton(btn) {
  document.querySelectorAll('.start-journey-btn').forEach(b => b.classList.remove('active-journey'));
  btn.classList.add('active-journey');
}

async function loadSchedule() {
  const snapshot = await db.ref('scheduleData').once('value');
  const data     = snapshot.val();
  scheduleData   = data;

  const scheduleContainer = document.getElementById('homePage');
  scheduleContainer.innerHTML = "";  // clear out old

  const todayStr = new Date().toISOString().split('T')[0];
  let nextEventTime = null;

  for (const dateStr in data) {
    if (dateStr < todayStr) continue;
    const dayData = data[dateStr];
    const [Y, M, D] = dateStr.split('-').map(Number);

    // ——— Day Card ———
    const dayBlock = document.createElement('div');
    dayBlock.className = 'day-block';

    // Day header with colored background
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    const h2 = document.createElement('h2');
    h2.textContent = `${String(D).padStart(2,'0')}/${String(M).padStart(2,'0')}/${Y} – ${dayData.location}`;
    dayHeader.appendChild(h2);
    dayBlock.appendChild(dayHeader);

    // Container for all events that day
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'events';

    // ——— Each Event ———
    for (const evt of dayData.events) {
      const evtDiv = document.createElement('div');
      evtDiv.className = 'event';

      // Event info (time + title)
      const info = document.createElement('div');
      info.className = 'event-info';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'event-time';
      timeSpan.textContent = evt.time;
      const titleSpan = document.createElement('span');
      titleSpan.className = 'event-title';
      titleSpan.textContent = evt.title;
      info.append(timeSpan, titleSpan);

      // Event actions (button group)
      const actions = document.createElement('div');
      actions.className = 'event-actions';
      if (evt.maps_link) {
        const btn = document.createElement('button');
        btn.className = 'mdc-button mdc-button--outlined';
        btn.onclick = () => window.open(evt.maps_link, '_blank');
        // icon
        const ico = document.createElement('i');
        ico.className = 'material-icons mdc-button__icon';
        ico.textContent = 'map';
        // label
        const lbl = document.createElement('span');
        lbl.className = 'mdc-button__label';
        lbl.textContent = 'Open route';
        btn.append(ico, lbl);
        actions.appendChild(btn);
      }

      // assemble event row
      evtDiv.append(info, actions);

      // — Weather forecast injected below the row
      if (evt.weather_location && evt.duration_minutes) {
        // showWeatherForecast(container=`evtDiv`) will append the table
        showWeatherForecast(
          evt.weather_location,
          new Date(Y, M-1, D, ...evt.time.split(':').map(Number)).toISOString(),
          evt.duration_minutes,
          evtDiv
        );
      }

      // track nextEventTime for countdown
      const [hh, mm] = evt.time.split(':').map(Number);
      const evDate = new Date(Y, M-1, D, hh, mm);
      const now    = new Date();
      if ((!nextEventTime || (evDate > now && evDate < nextEventTime))) {
        nextEventTime = evDate;
      }

      eventsContainer.appendChild(evtDiv);
    }

    // only append days with events
    if (eventsContainer.children.length) {
      dayBlock.appendChild(eventsContainer);
      scheduleContainer.appendChild(dayBlock);
    }
  }

  // re-start countdown
  if (countdownInterval) clearInterval(countdownInterval);
  if (nextEventTime) {
    updateCountdown(nextEventTime);
    countdownInterval = setInterval(() => updateCountdown(nextEventTime), 1000);
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

/**
 * Bepaalt of er nu een event loopt (op basis van starttijd + duration_minutes)
 * en schrijft dat in #currentActivity.
 */
function updateCurrentActivity() {
  const now = new Date();
  let currentEvt = null;

  for (const dateStr of Object.keys(scheduleData).sort()) {
    for (const evt of scheduleData[dateStr].events) {
      const start = parseDateTime(dateStr, evt.time);             // :contentReference[oaicite:1]{index=1}
      const end   = new Date(start.getTime() + evt.duration_minutes * 60000);
      if (start <= now && now < end) {
        currentEvt = { dateStr, evt };
        break;
      }
    }
    if (currentEvt) break;
  }

  const el = document.getElementById('currentActivity');
  if (currentEvt) {
    const { evt, dateStr } = currentEvt;
    // toon alleen titel en tijd; datum kun je weglaten in header
    el.textContent = `🎯 Current activity: ${evt.title} at ${evt.time}`;
  } else {
    el.textContent = `🎯 No current activity`;
  }
}

async function showWeatherForecast(location, startTime, durationMinutes, container) {
  const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${WEATHER_API_KEY}`;
  const geoRes = await fetch(geocodeUrl);
  const geoData = await geoRes.json();

  if (!geoData.length) return;
  //if (!geoData.length) return alert("Location not found.");
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

  if (!relevant.length) return;
  //if (!relevant.length) return alert("No forecast available for this timeframe.");

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
    // … na het vullen van `table`
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-container';
    tableWrapper.appendChild(table);
    wrapper.appendChild(tableWrapper);
  container.appendChild(wrapper);
}

function updateProgressBar() {
  if (journeyDuration === null || journeyStartTime === null) return;

  const elapsed = (Date.now() - journeyStartTime) / 1000; // seconden
  const percent = Math.min(100, (elapsed / journeyDuration) * 100);
  const progressBar = document.getElementById('progressBar');
  progressBar.style.width = `${percent}%`;
}

// 🔄 Pagina-switching
function switchPage(id) {
  document.getElementById('homePage').style.display = id === 'homePage' ? 'block' : 'none';
  document.getElementById('notesPage').style.display = id === 'notesPage' ? 'block' : 'none';
  document.getElementById('optionsPage').style.display = id === 'optionsPage' ? 'block' : 'none';
}

window.switchPage = switchPage;

window.onload = async () => {
  // 1) eerst het schema écht laden
  await loadSchedule();
  // Na countdown gestart te hebben:
  updateCurrentActivity();
  setInterval(updateCurrentActivity, 1000);

  // 3) rest van je onload blijft ongewijzigd
  // Knop om device-rank op te slaan
  document.getElementById('saveDeviceRank').onclick = () => {
    const val = parseInt(document.getElementById('deviceRank').value);
    if (isNaN(val)) return alert("Enter a valid number.");
    localStorage.setItem('deviceRank', val);
    document.getElementById('currentRank').textContent = `✅ Your device rank is set to ${val}`;

    // Update Firebase
    const id = deviceId();
    db.ref(`devices/${id}`).set({
      rank: val,
      updatedAt: Date.now()
    });
  };

  // Rang opnieuw tonen als al opgeslagen
  const storedRank = localStorage.getItem('deviceRank');
  if (storedRank !== null) {
    document.getElementById('deviceRank').value = storedRank;
    document.getElementById('currentRank').textContent = `✅ Your device rank is set to ${storedRank}`;
  }

  // 🔄 Refresh data knop
  document.getElementById('refreshData').onclick = async () => {
    // 1) nieuwe spreadsheet halen en opslaan
    await fetchAndSaveSpreadsheet();
    // 2) trigger alle clients om te updaten
    await db.ref('lastRefresh').set(Date.now());
    // 3) lokaal direct herladen van schema & countdown
    await loadSchedule();
  };

  // 📡 Luister op Firebase om alle clients automatisch te syncen
  db.ref('lastRefresh').on('value', async () => {
    await loadSchedule();    // laad nieuwste data van Firebase
  });

  switchPage('homePage');
  startNotesSync();
};

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

function deviceId() {
  if (!localStorage.getItem('deviceId')) {
    const id = 'dev_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('deviceId', id);
  }
  return localStorage.getItem('deviceId');
}

// Zet dit bovenaan je script, vóór gebruik in getUpcomingEvent
function parseDateTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute]    = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
}


function getUpcomingEvent(maxHoursAhead = 3) {
  const now = new Date();
  const maxTime = new Date(now.getTime() + maxHoursAhead * 60 * 60 * 1000);

  for (const date of Object.keys(scheduleData).sort()) {
    for (const event of scheduleData[date].events) {
      // ← Hier roept je parseDateTime aan, maar die bestaat niet
      const eventTime = parseDateTime(date, event.time);
      if (eventTime > now && eventTime <= maxTime) {
        return { date, event };
      }
    }
  }
  return null;
}

async function fetchAndSaveSpreadsheet() {
  try {
    const res = await fetch(SHEET_URL);
    const raw = await res.json();
    console.log("📄 Spreadsheet data:", raw);

    const structured = {};

    for (const row of raw) {
      const date = row["Date (YYYY-MM-DD)"];
      const time = row["Time (HH:MM)"];
      const title = row["Title"];

      if (!date || !time || !title) continue;

      if (!structured[date]) {
        structured[date] = {
          location: row["Location"] || row["Weather Location"] || "",
          events: []
        };
      }

      structured[date].events.push({
        title: title,
        time: time,
        duration_minutes: parseInt(row["Duration (min)"] || "0"),
        weather_location: row["Weather Location"] || "",
        maps_link: row["Maps Link"] || "",
        destination_coords: {
          lat: parseFloat(row["Destination Lat"] || "0"),
          lon: parseFloat(row["Destination Lon"] || "0")
        }
      });
    }

    console.log("✅ Structured data:", structured);
    await db.ref('scheduleData').set(structured);
    alert("✅ Schedule refreshed!");
  } catch (err) {
    console.error("❌ Refresh failed:", err);
    alert("❌ Failed to refresh data.");
  }
}

// 🔁 Notes synchronisatie
function startNotesSync() {
  const textarea = document.getElementById('globalNotes');
  const status = document.getElementById('notesSavedStatus');
  const saveBtn = document.getElementById('saveNotes');

  // Ophalen bij laden
  db.ref('globalNotes').once('value').then(snapshot => {
    const val = snapshot.val();
    if (val !== null) textarea.value = val;
  });

  // Opslaan bij klik
  saveBtn.onclick = () => {
    const content = textarea.value;
    db.ref('globalNotes').set(content).then(() => {
      const now = new Date().toLocaleTimeString();
      status.textContent = `✅ Notes saved at ${now}`;
    });
  };
}

// Zorg dat dit BUITEN window.onload staat
function switchPage(pageId) {
  const pages = ['homePage', 'notesPage', 'optionsPage'];
  pages.forEach(id => {
    document.getElementById(id).style.display = (id === pageId) ? 'block' : 'none';
  });

  if (pageId === 'notesPage') {
    refreshNotes();
  }
}

function refreshNotes() {
  const textarea = document.getElementById('globalNotes');
  const status   = document.getElementById('notesSavedStatus');
  db.ref('globalNotes').once('value').then(snapshot => {
    textarea.value = snapshot.val() || '';
    status.textContent = '';   // wis de “Notes saved at …” melding
  });
}