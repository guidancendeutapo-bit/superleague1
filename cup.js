// ---- Champions Cup: 2 groups x 5 teams, single round-robin, top 2 -> semis -> final ----
// Admin Mode gates all editing (scores, stats, team/player names). Everyone else sees a
// read-only view. Change ADMIN_PASSWORD below to set your own password.

const ADMIN_PASSWORD = "Windhoek";

// Cloud sync: all tournament data (teams, scores, stats, bracket) lives in this
// Supabase table so every device sees the same data — not just localStorage on
// one browser. If SUPABASE_URL/KEY are wrong or offline, the app falls back to
// a local-only cache so it still works, but won't sync across devices.
const SUPABASE_URL = "https://lmvqlkynafaqtwxwzkfn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_deGrSfV-2Sgys4kjYxv1Qg__il-w6Ko";
const SUPABASE_TABLE = "champions_cup_state";
const SUPABASE_ROW_ID = "main";

const sbClient = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Fixed team slots per group. Display names & rosters are edited in Admin Mode, not here.
const GROUP_IDS = {
  A: ["A1", "A2", "A3", "A4", "A5"],
  B: ["B1", "B2", "B3", "B4", "B5"]
};

const STORAGE_SCORES = "championsCupScores";
const STORAGE_TEAMS = "championsCupTeams";
const STORAGE_KO = "championsCupKnockout";
const STORAGE_NEWS = "championsCupNews";
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
// Defaults & normalizers
// ---------------------------------------------------------------------------

function defaultTeams() {
  const t = {};
  ["A", "B"].forEach(g => {
    GROUP_IDS[g].forEach(id => { t[id] = { name: `Team ${id}`, players: [] }; });
  });
  return t;
}

function normalizeTeams(saved) {
  const base = defaultTeams();
  if (!saved) return base;
  Object.keys(base).forEach(id => { if (saved[id]) base[id] = saved[id]; });
  return base;
}

function defaultKO() {
  return {
    sf1: { home: "", away: "", events: [], penaltyWinner: null },
    sf2: { home: "", away: "", events: [], penaltyWinner: null },
    final: { home: "", away: "", events: [], penaltyWinner: null, celebrated: false }
  };
}

function normalizeKO(saved) {
  const base = defaultKO();
  if (!saved) return base;
  Object.keys(base).forEach(k => { if (saved[k]) base[k] = { ...base[k], ...saved[k] }; });
  return base;
}

function teamName(id) {
  return (teams[id] && teams[id].name) || id;
}

// ---------------------------------------------------------------------------
// Local cache (fallback only — used if Supabase is unreachable)
// ---------------------------------------------------------------------------

function loadTeamsLocal() {
  try { return normalizeTeams(JSON.parse(localStorage.getItem(STORAGE_TEAMS))); }
  catch { return defaultTeams(); }
}
function loadScoresLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SCORES)) || {}; }
  catch { return {}; }
}
function loadKOLocal() {
  try { return normalizeKO(JSON.parse(localStorage.getItem(STORAGE_KO))); }
  catch { return defaultKO(); }
}
function loadNewsLocal() {
  try {
    const val = JSON.parse(localStorage.getItem(STORAGE_NEWS));
    return Array.isArray(val) ? val : [];
  } catch { return []; }
}
function cacheLocally() {
  try {
    localStorage.setItem(STORAGE_TEAMS, JSON.stringify(teams));
    localStorage.setItem(STORAGE_SCORES, JSON.stringify(scores));
    localStorage.setItem(STORAGE_KO, JSON.stringify(koData));
    localStorage.setItem(STORAGE_NEWS, JSON.stringify(newsList));
  } catch (e) { console.error("Could not update local cache:", e); }
}

// ---------------------------------------------------------------------------
// Cloud sync (Supabase) — every save pushes the changed column to the shared
// "main" row so every device reading the table sees the same tournament.
// ---------------------------------------------------------------------------

let cloudConnected = false;

function setSyncStatus(text, ok) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "#8fe6ab" : "#ff8f9a";
}

async function fetchRemoteState() {
  if (!sbClient) return null;
  try {
    const { data, error } = await sbClient
      .from(SUPABASE_TABLE)
      .select("teams,scores,ko,news")
      .eq("id", SUPABASE_ROW_ID)
      .maybeSingle();
    if (error) throw error;

    if (data) {
      return {
        teams: normalizeTeams(data.teams),
        scores: data.scores || {},
        ko: normalizeKO(data.ko),
        news: Array.isArray(data.news) ? data.news : []
      };
    }

    // No row yet for this tournament — create it with defaults.
    const initial = { id: SUPABASE_ROW_ID, teams: defaultTeams(), scores: {}, ko: defaultKO(), news: [] };
    const { error: insertErr } = await sbClient.from(SUPABASE_TABLE).upsert(initial);
    if (insertErr) throw insertErr;
    return { teams: initial.teams, scores: initial.scores, ko: initial.ko, news: initial.news };
  } catch (e) {
    console.error("Supabase load failed, falling back to local cache:", e);
    lastSupabaseError = (e && (e.message || e.error_description || e.hint)) || "unknown error";
    return null;
  }
}

let lastSupabaseError = "";

async function pushColumn(column, value) {
  cacheLocally();
  if (!sbClient) return;
  try {
    const { error } = await sbClient
      .from(SUPABASE_TABLE)
      .update({ [column]: value, updated_at: new Date().toISOString() })
      .eq("id", SUPABASE_ROW_ID);
    if (error) throw error;
    cloudConnected = true;
    setSyncStatus("☁ Synced", true);
  } catch (e) {
    cloudConnected = false;
    console.error(`Could not save "${column}" to Supabase:`, e);
    setSyncStatus("⚠ Saved locally only — check connection", false);
  }
}

function saveTeams() { pushColumn("teams", teams); }
function saveScores() { pushColumn("scores", scores); }
function saveKO() { pushColumn("ko", koData); }
function saveNews() { pushColumn("news", newsList); }

let teams = defaultTeams();
let scores = {};
let koData = defaultKO();
let newsList = [];
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

function getEvents(scope, key) {
  const e = getEntry(scope, key);
  return (e && e.events) || [];
}

function setEvents(scope, key, events) {
  if (scope === "group") {
    if (!scores[key]) scores[key] = { home: "", away: "" };
    scores[key].events = events;
    saveScores();
  } else {
    koData[key].events = events;
    saveKO();
  }
}

function playerNameById(teamId, playerId) {
  const p = teams[teamId] && teams[teamId].players.find(pl => pl.id === playerId);
  return p ? p.name : "Unknown player";
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
  if (isAdmin()) {
    btn.textContent = "🔓 Admin (unlocked)";
    btn.classList.add("unlocked");
  } else {
    btn.textContent = "🔒 Admin";
    btn.classList.remove("unlocked");
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
  let html = `<h3>Group ${group} Fixtures</h3><div class="matchday-grid">`;
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
          <button type="button" class="open-stats-btn" data-scope="group" data-key="${key}"
            data-home="${match.home}" data-away="${match.away}" title="Match stats">📊 Stats</button>
        </div>`;
    });
    html += `</div>`;
  });

  html += `</div>`;
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
      <button type="button" class="open-stats-btn sf-stat-toggle" data-scope="ko" data-key="${matchId}"
        data-home="${homeId}" data-away="${awayId}">📊 Match Stats</button>
    </div>`;

  return winnerId;
}

function renderSemifinals() {
  const ready = groupComplete("A") && groupComplete("B");
  document.getElementById("view-groups").classList.toggle("knockout-ready", ready);

  if (!ready) {
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
// Match Stats Modal (goal scorer + assist entry)
// ---------------------------------------------------------------------------

let statsModal = { scope: null, key: null, home: null, away: null, entries: [] };

function openStatsModal(scope, key, homeId, awayId) {
  statsModal.scope = scope;
  statsModal.key = key;
  statsModal.home = homeId;
  statsModal.away = awayId;

  const goalEvents = getEvents(scope, key).filter(e => e.type === "goal" || e.type === "ownGoal");
  const allEvents = getEvents(scope, key);
  statsModal.entries = goalEvents.map(ev => {
    const pos = allEvents.indexOf(ev);
    const next = allEvents[pos + 1];
    return {
      playerId: ev.playerId,
      teamId: ev.teamId,
      type: ev.type,
      scoringType: ev.scoringType || "regular",
      assistId: (ev.type === "goal" && next && next.type === "assist") ? next.playerId : ""
    };
  });

  document.getElementById("stats-modal-title").textContent =
    `${teamName(homeId)} vs ${teamName(awayId)}`;
  renderStatsModalBody();
  document.getElementById("stats-modal").classList.add("active");
}

function closeStatsModal() {
  document.getElementById("stats-modal").classList.remove("active");
}

function statsModalScoreLine() {
  const entry = getEntry(statsModal.scope, statsModal.key);
  const h = entry.home !== undefined && entry.home !== "" ? entry.home : "–";
  const a = entry.away !== undefined && entry.away !== "" ? entry.away : "–";
  return `${h} – ${a}`;
}

function buildGoalColumn(teamId) {
  const lines = [];
  const allEvents = getEvents(statsModal.scope, statsModal.key);
  allEvents.forEach((ev, idx) => {
    if (ev.type !== "goal" && ev.type !== "ownGoal") return;
    const belongsHere = ev.type === "ownGoal" ? ev.teamId !== teamId : ev.teamId === teamId;
    if (!belongsHere) return;
    const name = playerNameById(ev.teamId, ev.playerId);
    const penTag = ev.scoringType === "penalty" ? ` <span class="ms-tag">(P)</span>` : "";
    const ogTag = ev.type === "ownGoal" ? ` <span class="ms-tag">(OG)</span>` : "";
    const next = allEvents[idx + 1];
    const assistName = (ev.type === "goal" && next && next.type === "assist")
      ? playerNameById(next.teamId, next.playerId) : null;
    lines.push(`<div class="ms-goal-line">${ev.type === "ownGoal" ? "🔴" : "⚽"} <strong>${escapeHtml(name)}</strong>${penTag}${ogTag}${assistName ? `<div class="ms-goal-assist">👟 ${escapeHtml(assistName)}</div>` : ""}</div>`);
  });
  return lines.length ? lines.join("") : `<span class="ms-no-goals">No goals</span>`;
}

function renderStatsModalBody() {
  const { scope, key, home, away } = statsModal;
  const admin = isAdmin();

  let html = `
    <div class="ms-score-line">
      <span>${escapeHtml(teamName(home))}</span>
      <strong>${statsModalScoreLine()}</strong>
      <span>${escapeHtml(teamName(away))}</span>
    </div>
    <div class="ms-goals-header"><span>${escapeHtml(teamName(home))}</span><span>${escapeHtml(teamName(away))}</span></div>
    <div class="ms-goals-grid">
      <div class="ms-goal-col">${buildGoalColumn(home)}</div>
      <div class="ms-goal-col">${buildGoalColumn(away)}</div>
    </div>`;

  if (admin) {
    const players = [
      ...((teams[home] && teams[home].players) || []),
      ...((teams[away] && teams[away].players) || [])
    ];
    const playerOptions = (selected, excludeId) => players
      .filter(p => p.id !== excludeId)
      .map(p => `<option value="${p.id}" ${selected === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join("");

    const rows = statsModal.entries.map((entry, idx) => `
      <div class="ms-goal-row">
        <select data-idx="${idx}" data-field="scorer" ${players.length === 0 ? "disabled" : ""}>
          <option value="">— Scorer —</option>${playerOptions(entry.playerId, "")}
        </select>
        <select data-idx="${idx}" data-field="type">
          <option value="goal" ${entry.type === "goal" && entry.scoringType !== "penalty" ? "selected" : ""}>Goal</option>
          <option value="penalty" ${entry.scoringType === "penalty" ? "selected" : ""}>Penalty</option>
          <option value="ownGoal" ${entry.type === "ownGoal" ? "selected" : ""}>Own goal</option>
        </select>
        <select data-idx="${idx}" data-field="assist" ${players.length === 0 ? "disabled" : ""}>
          <option value="">— Assist —</option>${playerOptions(entry.assistId, entry.playerId)}
        </select>
        <button type="button" class="ms-remove-goal-btn" data-idx="${idx}" data-action="remove">×</button>
      </div>`).join("");

    html += `
      <div class="ms-entry-form-header">Edit goal scorers &amp; assists</div>
      <div id="ms-goal-rows">${rows || ""}</div>
      <button type="button" class="ms-add-goal-btn" id="ms-add-goal">+ Add goal</button>
      <button type="button" class="ms-save-btn" id="ms-save-stats">💾 Save Match Stats</button>`;

    if (players.length === 0) {
      html += `<p class="ms-view-note">Add players to both teams in Admin Mode to log scorers.</p>`;
    }
  } else if (statsModal.entries.length === 0) {
    html += `<p class="ms-view-note">No goal details recorded yet.</p>`;
  }

  document.getElementById("stats-modal-body").innerHTML = html;
}

function statsModalAddGoal() {
  statsModal.entries.push({ playerId: "", teamId: "", type: "goal", scoringType: "regular", assistId: "" });
  renderStatsModalBody();
}

function statsModalRemoveGoal(idx) {
  statsModal.entries.splice(idx, 1);
  renderStatsModalBody();
}

function statsModalUpdateGoal(idx, field, value) {
  const entry = statsModal.entries[idx];
  if (!entry) return;
  if (field === "scorer") {
    entry.playerId = value;
    entry.teamId = (teams[statsModal.home] && teams[statsModal.home].players.some(p => p.id === value))
      ? statsModal.home : statsModal.away;
  } else if (field === "assist") {
    entry.assistId = value;
  } else if (field === "type") {
    entry.type = value === "ownGoal" ? "ownGoal" : "goal";
    entry.scoringType = value === "penalty" ? "penalty" : "regular";
  }
}

function saveStatsModal() {
  if (!isAdmin()) return;
  const events = [];
  statsModal.entries.forEach(entry => {
    if (!entry.playerId) return;
    events.push({ playerId: entry.playerId, teamId: entry.teamId, type: entry.type, scoringType: entry.scoringType });
    if (entry.assistId) {
      const assistTeamId = (teams[statsModal.home] && teams[statsModal.home].players.some(p => p.id === entry.assistId))
        ? statsModal.home : statsModal.away;
      events.push({ playerId: entry.assistId, teamId: assistTeamId, type: "assist", scoringType: "regular" });
    }
  });
  setEvents(statsModal.scope, statsModal.key, events);
  renderOverallStats();
  renderStatsModalBody();
}

function wireStatsModalEvents() {
  document.getElementById("stats-modal-close").addEventListener("click", closeStatsModal);
  document.getElementById("stats-modal").addEventListener("click", e => {
    if (e.target.id === "stats-modal") closeStatsModal();
  });
  const body = document.getElementById("stats-modal-body");
  body.addEventListener("change", e => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    statsModalUpdateGoal(parseInt(idx, 10), e.target.dataset.field, e.target.value);
  });
  body.addEventListener("click", e => {
    if (e.target.id === "ms-add-goal") statsModalAddGoal();
    if (e.target.id === "ms-save-stats") saveStatsModal();
    if (e.target.dataset.action === "remove") statsModalRemoveGoal(parseInt(e.target.dataset.idx, 10));
  });
}

// ---------------------------------------------------------------------------
// Rendering: overall stats (top scorers)
// ---------------------------------------------------------------------------

function renderOverallStats() {
  const goals = {};
  const assists = {};

  function tally(events) {
    (events || []).forEach(ev => {
      const bucket = ev.type === "goal" ? goals : ev.type === "assist" ? assists : null;
      if (!bucket) return;
      if (!bucket[ev.playerId]) bucket[ev.playerId] = { playerId: ev.playerId, teamId: ev.teamId, count: 0 };
      bucket[ev.playerId].count += 1;
    });
  }

  ["A", "B"].forEach(g => {
    schedules[g].forEach((round, rIdx) => round.forEach((m, mIdx) => {
      tally(getEvents("group", matchKey(g, rIdx, mIdx)));
    }));
  });
  ["sf1", "sf2", "final"].forEach(k => tally(getEvents("ko", k)));

  function renderBoard(source, suffix, fillClass) {
    const rows = Object.values(source)
      .map(row => ({ ...row, name: playerNameById(row.teamId, row.playerId) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    if (!rows.length) return `<p class="empty-note">No ${suffix} recorded yet. Log them from a match's 📊 Stats button.</p>`;
    const max = rows[0].count || 1;
    return rows.map((row, i) => `
      <div class="bar-row">
        <div class="bar-label">
          <span class="bar-name"><span class="bar-rank ${i === 0 ? "top" : ""}">${i + 1}</span>${escapeHtml(row.name)} <span class="bar-team">${escapeHtml(teamName(row.teamId))}</span></span>
          <span class="bar-value">${row.count} ${suffix}</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${fillClass}" style="width:${(row.count / max) * 100}%"></div></div>
      </div>`).join("");
  }

  document.getElementById("top-scorers").innerHTML = renderBoard(goals, "goals", "goals");
  document.getElementById("top-assists").innerHTML = renderBoard(assists, "assists", "assists");
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
// View switching (Groups / Stats / News tabs)
// ---------------------------------------------------------------------------

function switchView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn[data-view]").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${view}`)?.classList.add("active");
  document.getElementById(`nav-${view}`)?.classList.add("active");
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

function renderNews() {
  const postBtn = document.getElementById("post-news-btn");
  postBtn.classList.toggle("hidden", !isAdmin());

  const container = document.getElementById("news-container");
  if (!newsList.length) {
    container.innerHTML = `<p class="empty-note">No news posts yet.</p>`;
    return;
  }
  container.innerHTML = newsList.map(item => `
    <div class="news-card" data-news-id="${item.id}">
      ${isAdmin() ? `<button class="news-delete-btn" data-delete-news="${item.id}" title="Delete">×</button>` : ""}
      <div class="news-headline">${escapeHtml(item.headline)}</div>
      <div class="news-date">🗓️ ${escapeHtml(item.date)}</div>
    </div>`).join("");
}

function openNewsPostModal() {
  document.getElementById("news-headline-input").value = "";
  document.getElementById("news-body-input").value = "";
  document.getElementById("news-post-modal").classList.add("active");
}
function closeNewsPostModal() {
  document.getElementById("news-post-modal").classList.remove("active");
}
function publishNews() {
  if (!isAdmin()) return;
  const headline = document.getElementById("news-headline-input").value.trim();
  const body = document.getElementById("news-body-input").value.trim();
  if (!headline || !body) { alert("Please fill in both headline and body."); return; }
  newsList.unshift({
    id: genId("news"),
    headline,
    body,
    date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  });
  saveNews();
  closeNewsPostModal();
  renderNews();
}
function deleteNews(id) {
  if (!isAdmin() || !confirm("Delete this news post?")) return;
  newsList = newsList.filter(item => item.id !== id);
  saveNews();
  renderNews();
}
function openNewsDetail(id) {
  const item = newsList.find(n => n.id === id);
  if (!item) return;
  document.getElementById("news-detail-body").innerHTML = `
    <div class="news-detail-headline">${escapeHtml(item.headline)}</div>
    <div class="news-detail-text">${escapeHtml(item.body).replace(/\n/g, "<br>")}</div>
    <div class="news-date">🗓️ ${escapeHtml(item.date)}</div>`;
  document.getElementById("news-detail-modal").classList.add("active");
}
function closeNewsDetail() {
  document.getElementById("news-detail-modal").classList.remove("active");
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
  renderNews();
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

function wireStaticEvents() {
  // Tab navigation
  document.querySelectorAll(".nav-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // News
  document.getElementById("post-news-btn").addEventListener("click", openNewsPostModal);
  document.getElementById("news-post-close").addEventListener("click", closeNewsPostModal);
  document.getElementById("news-publish-btn").addEventListener("click", publishNews);
  document.getElementById("news-post-modal").addEventListener("click", e => {
    if (e.target.id === "news-post-modal") closeNewsPostModal();
  });
  document.getElementById("news-detail-close").addEventListener("click", closeNewsDetail);
  document.getElementById("news-detail-modal").addEventListener("click", e => {
    if (e.target.id === "news-detail-modal") closeNewsDetail();
  });
  document.getElementById("news-container").addEventListener("click", e => {
    const delBtn = e.target.closest("[data-delete-news]");
    if (delBtn) { deleteNews(delBtn.dataset.deleteNews); return; }
    const card = e.target.closest("[data-news-id]");
    if (card) openNewsDetail(card.dataset.newsId);
  });

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
    col.addEventListener("click", e => {
      const btn = e.target.closest(".open-stats-btn");
      if (btn) openStatsModal(btn.dataset.scope, btn.dataset.key, btn.dataset.home, btn.dataset.away);
    });
  });

  // Knockout (semis + final) — delegated on <main>, committed on 'change'
  document.querySelector("main").addEventListener("change", e => {
    if (e.target.matches(".ko-input")) handleKoScoreChange(e);
    if (e.target.matches(".penalty-select")) handlePenaltyChange(e);
  });
  document.querySelector("main").addEventListener("click", e => {
    const btn = e.target.closest(".open-stats-btn");
    if (btn) openStatsModal(btn.dataset.scope, btn.dataset.key, btn.dataset.home, btn.dataset.away);
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

async function init() {
  setSyncStatus("☁ Connecting…", true);
  const remote = await fetchRemoteState();
  if (remote) {
    teams = remote.teams;
    scores = remote.scores;
    koData = remote.ko;
    newsList = remote.news;
    cacheLocally();
    cloudConnected = true;
    setSyncStatus("☁ Synced", true);
  } else {
    teams = loadTeamsLocal();
    scores = loadScoresLocal();
    koData = loadKOLocal();
    newsList = loadNewsLocal();
    cloudConnected = false;
    setSyncStatus(`⚠ Offline — ${lastSupabaseError || "showing local copy only"}`, false);
  }
  wireStaticEvents();
  wireStatsModalEvents();
  renderAll();
}

init();
