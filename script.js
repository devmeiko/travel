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
  const data = snapshot.val();
  scheduleData = data;
  const scheduleContainer = document.getElementById('homePage');
  scheduleContainer.innerHTML = "";

  const todayStr = new Date().toISOString().split('T')[0];

  let nextEventTime = null;

  for (const date in data) {
    const dateOnlyStr = date;
    if (dateOnlyStr < todayStr) continue;

    const [y, m, d] = date.split('-');
    const day = data[date];

    const block = document.createElement('div');
    block.className = 'day-block';

    const heading = document.createElement('h2');
    heading.textContent = `${d}/${m}/${y} – ${day.location}`;
    block.appendChild(heading);

    let hasEvents = false;

    for (const event of day.events) {
      const eDiv = document.createElement('div');
      const eTitle = document.createElement('p');
      eTitle.innerHTML = `<strong>${event.time}</strong> – ${event.title}`;
      eDiv.appendChild(eTitle);
      
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = event.time.split(':').map(Number);
      const eventDate = new Date(year, month - 1, day, hour, minute);
      const plannedTimeStr = eventDate.toISOString(); // voor compatibiliteit in forecast functie

      const now = new Date();

      const buttonWrapper = document.createElement('div');
      buttonWrapper.className = 'button-group';

      if (event.maps_link) {
        const btnMap = document.createElement('button');
        btnMap.textContent = 'Open route';
        btnMap.onclick = () => window.open(event.maps_link, '_blank');
        buttonWrapper.appendChild(btnMap);
      }

      eDiv.appendChild(buttonWrapper);
      block.appendChild(eDiv);

      // Weather
      if (event.weather_location && event.duration_minutes) {
        showWeatherForecast(
          event.weather_location,
          plannedTimeStr,
          event.duration_minutes,
          eDiv
        );
      }

      if (!nextEventTime || (eventDate > now && eventDate < nextEventTime)) {
        nextEventTime = eventDate;
      }

      hasEvents = true;
    }

    if (hasEvents) {
      scheduleContainer.appendChild(block);
    }
  }

  // 🗑️ kill oude countdown
  if (countdownInterval) clearInterval(countdownInterval);

  if (nextEventTime) {
    // 1× meteen updaten
    updateCountdown(nextEventTime);
    // elke seconde updaten, en handler onthouden
    countdownInterval = setInterval(
      () => updateCountdown(nextEventTime),
      1000
    );
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