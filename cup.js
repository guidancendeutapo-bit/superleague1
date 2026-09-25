// ---- Champions Cup: 2 groups x 5 teams, single round-robin, top 2 -> semis -> final ----
// Admin Mode gates all editing (scores, stats, team/player names). Everyone else sees a
// read-only view. Change ADMIN_PASSWORD below to set your own password.

const ADMIN_PASSWORD = "Windhoek";

// Fixed team slots per group. Display names & rosters are edited in Admin Mode, not here.
const GROUP_IDS = {
  A: ["A1", "A2", "A3", "A4", "A5"],
  B: ["B1", "B2", "B3", "B4", "B5"]
};

const STORAGE_SCORES = "championsCupScores";
const STORAGE_TEAMS = "championsCupTeams";
const STORAGE_KO = "championsCupKnockout";
const SESSION_ADMIN = "championsCupAdminUnlocked";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function genId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function isAdmin() {
  return sessionStorage.getItem(SESSION_ADMIN) === "1";
}

// Circle-method round robin. Handles odd team counts with a bye.
function generateRoundRobin(teams) {
  let list = [...teams];
  const hasBye = list.length % 2 !== 0;
  if (hasBye) list.push("BYE");

  const n = list.length;
  const roundsCount = n - 1;
  const half = n / 2;
  const rounds = [];

  for (let r = 0; r < roundsCount; r++) {
    const matches = [];
    for (let i = 0; i < half; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home !== "BYE" && away !== "BYE") {
        matches.push({ home, away });
      }
    }
    rounds.push(matches);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function matchKey(group, round, idx) {
  return `${group}-r${round}-m${idx}`;
}

// ---------------------------------------------------------------------------
// Teams & players (persisted, admin-editable)
// ---------------------------------------------------------------------------

function defaultTeams() {
  const t = {};
  ["A", "B"].forEach(g => {
    GROUP_IDS[g].forEach(id => { t[id] = { name: `Team ${id}`, players: [] }; });
  });
  return t;
}

function loadTeams() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_TEAMS));
    if (!saved) return defaultTeams();
    const base = defaultTeams();
    Object.keys(base).forEach(id => { if (saved[id]) base[id] = saved[id]; });
    return base;
  } catch {
    return defaultTeams();
  }
}

function saveTeams() {
  try { localStorage.setItem(STORAGE_TEAMS, JSON.stringify(teams)); }
  catch (e) { console.error("Could not save teams:", e); }
}

function teamName(id) {
  return (teams[id] && teams[id].name) || id;
}

// ---------------------------------------------------------------------------
// Scores (group stage) & knockout data
// ---------------------------------------------------------------------------

function loadScores() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SCORES)) || {}; }
  catch { return {}; }
}

function saveScores() {
  try { localStorage.setItem(STORAGE_SCORES, JSON.stringify(scores)); }
  catch (e) { console.error("Could not save scores:", e); }
}

function defaultKO() {
  return {
    sf1: { home: "", away: "", homeStats: {}, awayStats: {}, penaltyWinner: null },
    sf2: { home: "", away: "", homeStats: {}, awayStats: {}, penaltyWinner: null },
    final: { home: "", away: "", homeStats: {}, awayStats: {}, penaltyWinner: null, celebrated: false }
  };
}

function loadKO() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KO));
    if (!saved) return defaultKO();
    const base = defaultKO();
    Object.keys(base).forEach(k => { if (saved[k]) base[k] = { ...base[k], ...saved[k] }; });
    return base;
  } catch {
    return defaultKO();
  }
}

function saveKO() {
  try { localStorage.setItem(STORAGE_KO, JSON.stringify(koData)); }
  catch (e) { console.error("Could not save knockout data:", e); }
}

let teams = loadTeams();
let scores = loadScores();
let koData = loadKO();
const schedules = {
  A: generateRoundRobin(GROUP_IDS.A),
  B: generateRoundRobin(GROUP_IDS.B)
};

// ---------------------------------------------------------------------------
// Generic stat-entry helpers (shared by group matches and knockout ties)
// ---------------------------------------------------------------------------

function getEntry(scope, key) {
  return scope === "group" ? (scores[key] || {}) : (koData[key] || {});
}

function statsForSide(scope, key, side) {
  const e = getEntry(scope, key);
  return (e && e[`${side}Stats`]) || {};
}

function buildStatsTable(scope, key, teamId, side) {
  const players = (teams[teamId] && teams[teamId].players) || [];
  const title = `<div class="stat-table-title">${escapeHtml(teamName(teamId))}</div>`;
  if (players.length === 0) {
    return `<div>${title}<p class="no-players">No players added yet.</p></div>`;
  }
  const stats = statsForSide(scope, key, side);
  const rows = players.map(p => `
    <div class="stat-row">
      <span>${escapeHtml(p.name)}</span>
      <input type="number" min="0" class="stat-input"
        data-scope="${scope}" data-key="${key}" data-side="${side}" data-player-id="${p.id}"
        value="${stats[p.id] || ""}" ${isAdmin() ? "" : "disabled"}>
    </div>`).join("");
  return `<div>${title}${rows}</div>`;
}

// ---------------------------------------------------------------------------
// Group standings
// ---------------------------------------------------------------------------

function computeStandings(group) {
  const table = {};
  GROUP_IDS[group].forEach(id => {
    table[id] = { team: id, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
  });

  schedules[group].forEach((round, rIdx) => {
    round.forEach((match, mIdx) => {
      const key = matchKey(group, rIdx, mIdx);
      const s = scores[key];
      if (!s || s.home === "" || s.away === "") return;
      const hs = parseInt(s.home, 10);
      const as = parseInt(s.away, 10);
      if (isNaN(hs) || isNaN(as)) return;

      const home = table[match.home];
      const away = table[match.away];
      home.played++; away.played++;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;

      if (hs > as) { home.w++; away.l++; home.pts += 3; }
      else if (hs < as) { away.w++; home.l++; away.pts += 3; }
      else { home.d++; away.d++; home.pts += 1; away.pts += 1; }
    });
  });

  return Object.values(table).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });
}

function groupComplete(group) {
  return schedules[group].every((round, rIdx) =>
    round.every((match, mIdx) => {
      const s = scores[matchKey(group, rIdx, mIdx)];
      return s && s.home !== "" && s.away !== "" &&
        !isNaN(parseInt(s.home, 10)) && !isNaN(parseInt(s.away, 10));
    })
  );
}

// ---------------------------------------------------------------------------
// Rendering: admin bar & panel
// ---------------------------------------------------------------------------

function renderAdminBar() {
  const btn = document.getElementById("admin-toggle-btn");
  const status = document.getElementById("admin-status");
  if (isAdmin()) {
    btn.textContent = "🔓 Admin Mode (click to lock)";
    btn.classList.add("unlocked");
    status.textContent = "Editing enabled";
  } else {
    btn.textContent = "🔒 Admin Mode (click to unlock)";
    btn.classList.remove("unlocked");
    status.textContent = "View only";
  }
}

function renderAdminPanel() {
  const el = document.getElementById("admin-panel");
  if (!isAdmin()) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");

  const groupBlock = (group) => `
    <div>
      <h3 class="group-title" style="font-size:13px;">Group ${group}</h3>
      ${GROUP_IDS[group].map(id => `
        <div class="admin-team-card">
          <input type="text" class="team-name-input" data-team-id="${id}"
            value="${escapeHtml(teamName(id))}" maxlength="40">
          <div class="roster-list">
            ${(teams[id].players.length === 0)
              ? ""
              : teams[id].players.map(p => `
                  <span class="player-chip">${escapeHtml(p.name)}
                    <button type="button" class="remove-player-btn" data-team-id="${id}" data-player-id="${p.id}" title="Remove player">✕</button>
                  </span>`).join("")}
          </div>
          ${teams[id].players.length === 0 ? '<p class="no-players-hint">No players yet — add the squad below.</p>' : ""}
          <div class="add-player-form">
            <input type="text" class="new-player-input" data-team-id="${id}" placeholder="Player name" maxlength="40">
            <button type="button" class="add-player-btn" data-team-id="${id}">Add</button>
          </div>
        </div>
      `).join("")}
    </div>`;

  el.innerHTML = `
    <h2>Admin Panel</h2>
    <p class="admin-hint">Rename teams and manage rosters. Rosters power the scorer stats on each match.</p>
    <div class="admin-groups">
      ${groupBlock("A")}
      ${groupBlock("B")}
    </div>
    <div class="admin-reset-row">
      <button id="reset-teams-btn" type="button">Reset Teams &amp; Players</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Rendering: groups & fixtures
// ---------------------------------------------------------------------------

function renderGroupTable(group) {
  const standings = computeStandings(group);
  const el = document.getElementById(`group-${group}`);
  const rows = standings.map((row, i) => {
    const cls = i === 0 ? "q1" : i === 1 ? "q2" : "";
    return `<tr class="${cls}">
      <td>${i + 1}</td>
      <td class="team-name">${escapeHtml(teamName(row.team))}</td>
      <td>${row.played}</td>
      <td>${row.w}</td>
      <td>${row.d}</td>
      <td>${row.l}</td>
      <td>${row.gf - row.ga}</td>
      <td>${row.pts}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <h2 class="group-title">Group ${group}</h2>
    <table class="standings">
      <thead>
        <tr><th>#</th><th style="text-align:left">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderFixtures(group) {
  const el = document.getElementById(`fixtures-${group}`);
  let html = `<h3>Group ${group} Fixtures</h3>`;
  const admin = isAdmin();

  schedules[group].forEach((round, rIdx) => {
    html += `<div class="matchday"><div class="matchday-label">Matchday ${rIdx + 1}</div>`;
    round.forEach((match, mIdx) => {
      const key = matchKey(group, rIdx, mIdx);
      const s = scores[key] || { home: "", away: "" };
      html += `
        <div class="match-row">
          <span class="home">${escapeHtml(teamName(match.home))}</span>
          <input type="number" min="0" data-key="${key}" data-side="home" value="${s.home}" ${admin ? "" : "disabled"}>
          <span class="vs">:</span>
          <input type="number" min="0" data-key="${key}" data-side="away" value="${s.away}" ${admin ? "" : "disabled"}>
          <span class="away">${escapeHtml(teamName(match.away))}</span>
          <button type="button" class="stat-toggle" data-detail-for="${key}" title="Match stats">📊</button>
        </div>
        <div class="match-detail hidden" data-detail="${key}">
          ${buildStatsTable("group", key, match.home, "home")}
          ${buildStatsTable("group", key, match.away, "away")}
        </div>`;
    });
    html += `</div>`;
  });

  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Rendering: knockout (semis + final) & celebration
// ---------------------------------------------------------------------------

function koResult(entry) {
  const hs = parseInt(entry.home, 10);
  const as = parseInt(entry.away, 10);
  if (isNaN(hs) || isNaN(as)) return null;
  if (hs > as) return "home";
  if (as > hs) return "away";
  return entry.penaltyWinner || "draw";
}

function renderKoTie(containerId, matchId, label, homeId, awayId, opts) {
  opts = opts || {};
  const el = document.getElementById(containerId);
  if (!homeId || !awayId) {
    el.innerHTML = `<p class="locked-msg">${opts.lockedMsg || "Not yet decided."}</p>`;
    return null;
  }
  const admin = isAdmin();
  const entry = koData[matchId];
  const result = koResult(entry);
  const winnerId = result === "home" ? homeId : result === "away" ? awayId : null;
  const showPenalty = result === "draw";

  const homeCls = winnerId === homeId ? "sf-team is-winner" : "sf-team";
  const awayCls = winnerId === awayId ? "sf-team is-winner" : "sf-team";

  el.innerHTML = `
    <div class="sf-tie ${winnerId ? "winner-decided" : ""}">
      <div class="sf-label">${label}</div>
      <div class="${homeCls}"><span>${escapeHtml(teamName(homeId))}</span></div>
      <div class="sf-score-row">
        <input type="number" min="0" class="ko-input" data-match="${matchId}" data-side="home" value="${entry.home}" ${admin ? "" : "disabled"}>
        <span class="sf-vs">:</span>
        <input type="number" min="0" class="ko-input" data-match="${matchId}" data-side="away" value="${entry.away}" ${admin ? "" : "disabled"}>
      </div>
      <div class="${awayCls}"><span>${escapeHtml(teamName(awayId))}</span></div>
      ${showPenalty ? `
        <div class="penalty-row">
          Level on aggregate — penalties winner:
          <select class="penalty-select" data-match="${matchId}" ${admin ? "" : "disabled"}>
            <option value="">Select…</option>
            <option value="home" ${entry.penaltyWinner === "home" ? "selected" : ""}>${escapeHtml(teamName(homeId))}</option>
            <option value="away" ${entry.penaltyWinner === "away" ? "selected" : ""}>${escapeHtml(teamName(awayId))}</option>
          </select>
        </div>` : ""}
      <button type="button" class="stat-toggle sf-stat-toggle" data-detail-for="${matchId}">📊 Match stats</button>
      <div class="match-detail hidden" data-detail="${matchId}">
        ${buildStatsTable("ko", matchId, homeId, "home")}
        ${buildStatsTable("ko", matchId, awayId, "away")}
      </div>
    </div>`;

  return winnerId;
}

function renderSemifinals() {
  if (!groupComplete("A") || !groupComplete("B")) {
    document.getElementById("semifinals").innerHTML =
      `<p class="locked-msg">Semi-final draw unlocks once both groups finish.</p>`;
    return { sf1Winner: null, sf2Winner: null };
  }
  const a = computeStandings("A");
  const b = computeStandings("B");

  const container = document.getElementById("semifinals");
  container.innerHTML = `<div id="sf1-tie"></div><div id="sf2-tie"></div>`;

  const sf1Winner = renderKoTie("sf1-tie", "sf1", "Semi-Final 1", a[0].team, b[1].team);
  const sf2Winner = renderKoTie("sf2-tie", "sf2", "Semi-Final 2", b[0].team, a[1].team);
  return { sf1Winner, sf2Winner };
}

function renderFinal(sf1Winner, sf2Winner) {
  const container = document.getElementById("final-tie");
  if (!sf1Winner || !sf2Winner) {
    container.innerHTML = `<p class="locked-msg">The final unlocks once both semi-finals are decided.</p>`;
    return null;
  }
  container.innerHTML = `<div id="final-real-tie"></div>`;
  const champion = renderKoTie("final-real-tie", "final", "Final", sf1Winner, sf2Winner);

  if (champion) {
    if (!koData.final.celebrated) {
      koData.final.celebrated = true;
      saveKO();
      celebrate(teamName(champion));
    }
  }
  return champion;
}

// ---------------------------------------------------------------------------
// Rendering: overall stats (top scorers)
// ---------------------------------------------------------------------------

function renderOverallStats() {
  const totals = {};

  function addStats(scope, key, teamId, side) {
    if (!teamId) return;
    const stats = statsForSide(scope, key, side);
    Object.entries(stats).forEach(([pid, val]) => {
      const n = parseInt(val, 10);
      if (!n || n <= 0) return;
      const player = teams[teamId] && teams[teamId].players.find(p => p.id === pid);
      const name = player ? player.name : "Unknown player";
      if (!totals[pid]) totals[pid] = { name, teamId, goals: 0 };
      totals[pid].goals += n;
    });
  }

  ["A", "B"].forEach(g => {
    schedules[g].forEach((round, rIdx) => round.forEach((m, mIdx) => {
      const key = matchKey(g, rIdx, mIdx);
      addStats("group", key, m.home, "home");
      addStats("group", key, m.away, "away");
    }));
  });

  const a = groupComplete("A") && groupComplete("B") ? computeStandings("A") : null;
  const b = a ? computeStandings("B") : null;
  if (a && b) {
    addStats("ko", "sf1", a[0].team, "home");
    addStats("ko", "sf1", b[1].team, "away");
    addStats("ko", "sf2", b[0].team, "home");
    addStats("ko", "sf2", a[1].team, "away");
    const sf1Winner = koResult(koData.sf1) === "home" ? a[0].team : koResult(koData.sf1) === "away" ? b[1].team : null;
    const sf2Winner = koResult(koData.sf2) === "home" ? b[0].team : koResult(koData.sf2) === "away" ? a[1].team : null;
    if (sf1Winner && sf2Winner) {
      addStats("ko", "final", sf1Winner, "home");
      addStats("ko", "final", sf2Winner, "away");
    }
  }

  const list = Object.values(totals).sort((x, y) => y.goals - x.goals).slice(0, 15);
  const el = document.getElementById("overall-stats");
  if (list.length === 0) {
    el.innerHTML = `<p class="locked-msg">No scorers recorded yet. Add players in Admin Mode, then log goals from each match's 📊 stats panel.</p>`;
    return;
  }
  el.innerHTML = `
    <table class="standings stats-table-main">
      <thead><tr><th style="text-align:left">Player</th><th style="text-align:left">Team</th><th>Goals</th></tr></thead>
      <tbody>
        ${list.map((p, i) => `
          <tr class="${i === 0 ? "top-scorer" : ""}">
            <td style="text-align:left">${i === 0 ? "👑 " : ""}${escapeHtml(p.name)}</td>
            <td style="text-align:left">${escapeHtml(teamName(p.teamId))}</td>
            <td>${p.goals}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Reset controls (admin only)
// ---------------------------------------------------------------------------

function renderResetRow() {
  const el = document.getElementById("reset-row");
  if (!isAdmin()) { el.innerHTML = ""; return; }
  el.innerHTML = `<button id="reset-btn" type="button">Reset Scores &amp; Bracket</button>`;
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!confirm("Reset all scores, stats and the knockout bracket? Team names and rosters are kept.")) return;
    scores = {};
    koData = defaultKO();
    saveScores();
    saveKO();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Celebration (confetti)
// ---------------------------------------------------------------------------

let confettiFrame = null;

function celebrate(name) {
  document.getElementById("celebration-team").textContent = name;
  const overlay = document.getElementById("celebration-overlay");
  overlay.classList.remove("hidden");
  startConfetti();
}

function closeCelebration() {
  document.getElementById("celebration-overlay").classList.add("hidden");
  stopConfetti();
}

function startConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#d9c26a", "#2652c9", "#eef1fa", "#1f7a3f", "#b9c2d0"];
  const particles = Array.from({ length: 160 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    size: 5 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 3,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * 360,
    vr: -6 + Math.random() * 12
  }));

  const start = performance.now();
  const DURATION = 5000;

  function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (now - start < DURATION) {
      confettiFrame = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiFrame = null;
    }
  }
  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  confettiFrame = requestAnimationFrame(frame);
}

function stopConfetti() {
  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  confettiFrame = null;
  const canvas = document.getElementById("confetti-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Full render + event wiring
// ---------------------------------------------------------------------------

function renderAll() {
  renderAdminBar();
  renderAdminPanel();
  renderGroupTable("A");
  renderGroupTable("B");
  renderFixtures("A");
  renderFixtures("B");
  const { sf1Winner, sf2Winner } = renderSemifinals();
  renderFinal(sf1Winner, sf2Winner);
  renderOverallStats();
  renderResetRow();
}

function handleGroupScoreInput(e) {
  const key = e.target.dataset.key;
  const side = e.target.dataset.side;
  if (!scores[key]) scores[key] = { home: "", away: "", homeStats: {}, awayStats: {} };
  scores[key][side] = e.target.value;
  saveScores();
  renderGroupTable(key.startsWith("A") ? "A" : "B");
  const { sf1Winner, sf2Winner } = renderSemifinals();
  renderFinal(sf1Winner, sf2Winner);
  renderOverallStats();
}

function handleStatInput(e) {
  const scope = e.target.dataset.scope;
  const key = e.target.dataset.key;
  const side = e.target.dataset.side;
  const playerId = e.target.dataset.playerId;
  const statKey = `${side}Stats`;

  if (scope === "group") {
    if (!scores[key]) scores[key] = { home: "", away: "", homeStats: {}, awayStats: {} };
    if (!scores[key][statKey]) scores[key][statKey] = {};
    scores[key][statKey][playerId] = e.target.value;
    saveScores();
  } else {
    if (!koData[key][statKey]) koData[key][statKey] = {};
    koData[key][statKey][playerId] = e.target.value;
    saveKO();
  }
  renderOverallStats();
}

function handleKoScoreChange(e) {
  const matchId = e.target.dataset.match;
  const side = e.target.dataset.side;
  koData[matchId][side] = e.target.value;
  saveKO();
  const { sf1Winner, sf2Winner } = renderSemifinals();
  renderFinal(sf1Winner, sf2Winner);
  renderOverallStats();
}

function handlePenaltyChange(e) {
  const matchId = e.target.dataset.match;
  koData[matchId].penaltyWinner = e.target.value || null;
  saveKO();
  const { sf1Winner, sf2Winner } = renderSemifinals();
  renderFinal(sf1Winner, sf2Winner);
  renderOverallStats();
}

function toggleDetail(key) {
  const panel = document.querySelector(`.match-detail[data-detail="${key}"]`);
  if (panel) panel.classList.toggle("hidden");
}

function wireStaticEvents() {
  // Admin toggle
  document.getElementById("admin-toggle-btn").addEventListener("click", () => {
    if (isAdmin()) {
      sessionStorage.removeItem(SESSION_ADMIN);
      renderAll();
      return;
    }
    const pass = prompt("Enter admin password:");
    if (pass === null) return;
    if (pass === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_ADMIN, "1");
      renderAll();
    } else {
      alert("Incorrect password.");
    }
  });

  // Group score inputs (delegated, live on 'input')
  document.querySelectorAll(".fixtures-col").forEach(col => {
    col.addEventListener("input", e => {
      if (e.target.matches(".match-row input[type=number]")) handleGroupScoreInput(e);
    });
    col.addEventListener("change", e => {
      if (e.target.matches(".stat-input")) handleStatInput(e);
    });
    col.addEventListener("click", e => {
      const btn = e.target.closest(".stat-toggle");
      if (btn) toggleDetail(btn.dataset.detailFor);
    });
  });

  // Knockout (semis + final) — delegated on <main>, committed on 'change'
  document.querySelector("main").addEventListener("change", e => {
    if (e.target.matches(".ko-input")) handleKoScoreChange(e);
    if (e.target.matches(".penalty-select")) handlePenaltyChange(e);
    if (e.target.matches(".stat-input")) handleStatInput(e);
  });
  document.querySelector("main").addEventListener("click", e => {
    const btn = e.target.closest(".stat-toggle");
    if (btn) toggleDetail(btn.dataset.detailFor);
  });

  // Admin panel: team names, add/remove players, reset teams
  document.getElementById("admin-panel").addEventListener("change", e => {
    if (e.target.matches(".team-name-input")) {
      const id = e.target.dataset.teamId;
      const val = e.target.value.trim();
      teams[id].name = val || `Team ${id}`;
      saveTeams();
      renderAll();
    }
  });
  document.getElementById("admin-panel").addEventListener("click", e => {
    if (e.target.matches(".add-player-btn")) {
      const id = e.target.dataset.teamId;
      const input = document.querySelector(`.new-player-input[data-team-id="${id}"]`);
      const name = input.value.trim();
      if (!name) return;
      teams[id].players.push({ id: genId("p"), name });
      saveTeams();
      renderAll();
    }
    if (e.target.matches(".remove-player-btn")) {
      const id = e.target.dataset.teamId;
      const pid = e.target.dataset.playerId;
      teams[id].players = teams[id].players.filter(p => p.id !== pid);
      saveTeams();
      renderAll();
    }
    if (e.target.id === "reset-teams-btn") {
      if (!confirm("Reset all team names and rosters to defaults? This cannot be undone.")) return;
      teams = defaultTeams();
      saveTeams();
      renderAll();
    }
  });

  // Celebration close
  document.getElementById("celebration-close-btn").addEventListener("click", closeCelebration);
}

wireStaticEvents();
renderAll();
