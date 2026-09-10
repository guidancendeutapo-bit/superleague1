// ===================================================================
// SUPER CUP — supercup.js
// Knockout tournament with two-legged ties, aggregate scores, bracket,
// third-place playoff, stats, news, and admin management.
// ===================================================================

// --- FIREBASE CONFIG (shared with main Super League) ---
const firebaseConfig = {
    apiKey: "AIzaSyDS9quu-rckjxBMW-vuhx1NFPHeZmfs-3E",
    authDomain: "super-league-3fc14.firebaseapp.com",
    projectId: "super-league-3fc14",
    storageBucket: "super-league-3fc14.firebasestorage.app",
    messagingSenderId: "1085392011537",
    appId: "1:1085392011537:web:a35388bd2386fcb9a2ccb0",
    measurementId: "G-00SSJ5W0VH",
    databaseURL: "https://super-league-3fc14-default-rtdb.firebaseio.com"
};

// --- STATE ---
let db = null;
let scIsAdmin = false;
let scActiveView = 'bracket';
let scTeams = [];
let scPlayers = [];
let scRounds = [];      // Array of rounds; each round = array of matchups
let scNews = [];
let scActiveLegMatchup = null;
let scActiveLegChoice = null; // 'first' | 'second'
let scEditingScoreMatchup = null;
let scEditingScoreLeg = null;

// Round labels based on number of teams
function scGetRoundLabels(numTeams) {
    let labels = [];
    let n = numTeams;
    while (n > 1) {
        if (n === 2) labels.push('Final');
        else if (n === 4) labels.push('Semi-Finals');
        else if (n === 8) labels.push('Quarter-Finals');
        else if (n === 16) labels.push('Round of 16');
        else if (n === 32) labels.push('Round of 32');
        else labels.push('Round of ' + n);
        n = n / 2;
    }
    return labels;
}

// --- FIREBASE INIT ---
function scInitFirebase() {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    scAttachListeners();
}

function scAttachListeners() {
    db.ref('superCup').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            scTeams = []; scPlayers = []; scRounds = []; scNews = [];
        } else {
            scTeams = Array.isArray(data.teams) ? data.teams : Object.values(data.teams || {});
            scPlayers = Array.isArray(data.players) ? data.players : Object.values(data.players || {});
            scRounds = data.rounds ? (Array.isArray(data.rounds) ? data.rounds : Object.values(data.rounds)) : [];
            scNews = data.news ? (Array.isArray(data.news) ? data.news : Object.values(data.news || {})) : [];
        }
        scRenderAll();
    });
}

function scPersist() {
    db.ref('superCup').set({ teams: scTeams, players: scPlayers, rounds: scRounds, news: scNews });
}

// --- VIEW SWITCHING ---
function scSwitchView(view) {
    scActiveView = view;
    document.querySelectorAll('.sc-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sc-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('scView' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');
    let navMap = { bracket: 'scNavBracket', stats: 'scNavStats', news: 'scNavNews' };
    if (navMap[view]) document.getElementById(navMap[view]).classList.add('active');
    scRenderAll();
}

// --- AUTH ---
function scHandleAuth() {
    if (scIsAdmin) {
        scIsAdmin = false;
        let btn = document.getElementById('scAdminToggle');
        btn.innerText = '🔐 Admin';
        btn.classList.remove('logged-in');
        scRenderAll();
    } else {
        document.getElementById('scPasswordInput').value = '';
        document.getElementById('scAuthModal').classList.add('active');
    }
}
function scCloseAuthModal() { document.getElementById('scAuthModal').classList.remove('active'); }
function scValidateAdmin() {
    if (document.getElementById('scPasswordInput').value === 'Windhoek') {
        scIsAdmin = true;
        let btn = document.getElementById('scAdminToggle');
        btn.innerText = '🔓 Logout';
        btn.classList.add('logged-in');
        scCloseAuthModal();
        scRenderAll();
    } else {
        alert('Incorrect password.');
    }
}

// --- TEAM / PLAYER MANAGEMENT ---
function scOpenSquadModal() {
    scRenderTeamList();
    scRenderPlayerList();
    scPopulatePlayerTeamDropdown();
    document.getElementById('scSquadModal').classList.add('active');
}
function scCloseSquadModal() { document.getElementById('scSquadModal').classList.remove('active'); }

function scAddTeam() {
    let input = document.getElementById('scNewTeamName');
    if (!input.value.trim()) return;
    scTeams.push({ id: 'sct' + Date.now(), name: input.value.trim() });
    input.value = '';
    scPersist();
    scRenderTeamList();
    scPopulatePlayerTeamDropdown();
}

function scDeleteTeam(id) {
    if (!confirm('Delete this team?')) return;
    scTeams = scTeams.filter(t => t.id !== id);
    scPlayers = scPlayers.filter(p => p.teamId !== id);
    scPersist();
    scRenderTeamList();
    scPopulatePlayerTeamDropdown();
    scRenderPlayerList();
}

function scRenderTeamList() {
    let el = document.getElementById('scTeamList');
    el.innerHTML = scTeams.map(t => `
        <div class="sc-team-list-item">
            <span>🛡️ ${t.name}</span>
            <button class="sc-item-delete" onclick="scDeleteTeam('${t.id}')">🗑️</button>
        </div>`).join('') || '<div class="sc-empty">No teams registered yet.</div>';
}

function scAddPlayer() {
    let nameInput = document.getElementById('scNewPlayerName');
    let teamSelect = document.getElementById('scNewPlayerTeam');
    if (!nameInput.value.trim()) return;
    scPlayers.push({ id: 'scp' + Date.now(), name: nameInput.value.trim(), teamId: teamSelect.value, goals: 0, assists: 0 });
    nameInput.value = '';
    scPersist();
    scRenderPlayerList();
}

function scDeletePlayer(id) {
    if (!confirm('Delete this player?')) return;
    scPlayers = scPlayers.filter(p => p.id !== id);
    scPersist();
    scRenderPlayerList();
}

function scRenderPlayerList() {
    let el = document.getElementById('scPlayerList');
    el.innerHTML = scPlayers.map(p => {
        let team = scTeams.find(t => t.id === p.teamId);
        return `
        <div class="sc-player-list-item">
            <span>👤 ${p.name} <small style="color:var(--sc-muted)">(${team ? team.name : 'Free Agent'})</small></span>
            <button class="sc-item-delete" onclick="scDeletePlayer('${p.id}')">🗑️</button>
        </div>`;
    }).join('') || '<div class="sc-empty">No players registered yet.</div>';
}

function scPopulatePlayerTeamDropdown() {
    let sel = document.getElementById('scNewPlayerTeam');
    sel.innerHTML = scTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

// --- BRACKET GENERATION ---
function scGenerateBracket() {
    if (scTeams.length < 2) { alert('Add at least 2 teams to generate a bracket.'); return; }
    // Pad to next power of 2 with byes
    let n = scTeams.length;
    let pow2 = 1;
    while (pow2 < n) pow2 *= 2;

    let shuffled = [...scTeams].sort(() => Math.random() - 0.5);
    while (shuffled.length < pow2) shuffled.push(null); // null = bye

    let labels = scGetRoundLabels(pow2);
    scRounds = [];

    // First round
    let firstRound = [];
    for (let i = 0; i < shuffled.length; i += 2) {
        firstRound.push({
            id: 'scm' + Date.now() + '-' + i,
            homeId: shuffled[i] ? shuffled[i].id : null,
            awayId: shuffled[i+1] ? shuffled[i+1].id : null,
            legs: [scEmptyLeg(), scEmptyLeg()],
            winnerId: null,
            loserId: null,
            isThirdPlace: false
        });
    }
    scRounds.push({ label: labels[0], matchups: firstRound });

    // Subsequent empty rounds
    for (let r = 1; r < labels.length; r++) {
        let count = firstRound.length / Math.pow(2, r);
        let roundMatchups = [];
        for (let i = 0; i < count; i++) {
            roundMatchups.push({
                id: 'scm' + Date.now() + '-' + r + '-' + i,
                homeId: null, awayId: null,
                legs: [scEmptyLeg(), scEmptyLeg()],
                winnerId: null, loserId: null,
                isThirdPlace: false
            });
        }
        scRounds.push({ label: labels[r], matchups: roundMatchups });
    }

    // Third-place playoff: losers of the semi-finals
    // Find the semi-final round index (second-to-last)
    let sfIdx = labels.length - 2;
    if (sfIdx >= 0) {
        let thirdPlaceMatchup = {
            id: 'scm-tp-' + Date.now(),
            homeId: null, awayId: null,
            legs: [scEmptyLeg(), scEmptyLeg()],
            winnerId: null, loserId: null,
            isThirdPlace: true
        };
        // Store it as a special entry we'll render separately
        scRounds._thirdPlace = thirdPlaceMatchup;
    }

    scPersist();
    scRenderAll();
}

function scEmptyLeg() {
    return { homeScore: null, awayScore: null, events: [], completed: false };
}

// --- AGGREGATE & WINNER CALCULATION ---
function scGetAggregate(matchup) {
    let aggH = 0, aggA = 0;
    if (matchup.legs[0].completed) { aggH += matchup.legs[0].homeScore || 0; aggA += matchup.legs[0].awayScore || 0; }
    if (matchup.legs[1].completed) { aggH += matchup.legs[1].homeScore || 0; aggA += matchup.legs[1].awayScore || 0; }
    return { aggH, aggA };
}

function scDetermineWinner(matchup) {
    if (!matchup.homeId || !matchup.awayId) return null;
    let { aggH, aggA } = scGetAggregate(matchup);
    if (!matchup.legs[0].completed || !matchup.legs[1].completed) return null;
    if (aggH > aggA) return matchup.homeId;
    if (aggA > aggH) return matchup.awayId;
    // Tie — use away goals as tiebreaker
    let awayGoalsH = (matchup.legs[1].homeScore || 0); // home team's away goals (leg 2 they are away? no)
    // Actually: in leg 1, homeId team is home. In leg 2, awayId team is home.
    // So home team's "away goals" = goals scored in leg 2
    let homeAwayGoals = matchup.legs[1].awayScore || 0; // homeId team plays away in leg 2
    let awayAwayGoals = matchup.legs[0].awayScore || 0; // awayId team plays away in leg 1
    if (homeAwayGoals > awayAwayGoals) return matchup.homeId;
    if (awayAwayGoals > homeAwayGoals) return matchup.awayId;
    // Still tied — we'll just pick home as winner for simplicity (could add penalties later)
    return matchup.homeId; // default to home on full tie
}

function scAdvanceWinners() {
    for (let r = 0; r < scRounds.length; r++) {
        let round = scRounds[r];
        if (!round || !round.matchups) continue;
        for (let m of round.matchups) {
            m.winnerId = scDetermineWinner(m);
            m.loserId = m.winnerId ? (m.winnerId === m.homeId ? m.awayId : m.homeId) : null;
        }
        // Push winners into next round
        if (r + 1 < scRounds.length) {
            let nextRound = scRounds[r + 1];
            for (let i = 0; i < round.matchups.length; i += 2) {
                let m1 = round.matchups[i];
                let m2 = round.matchups[i + 1];
                let nextM = nextRound.matchups[i / 2];
                if (nextM) {
                    nextM.homeId = m1 ? m1.winnerId : null;
                    nextM.awayId = m2 ? m2.winnerId : null;
                }
            }
        }
    }

    // Third-place: losers of semi-finals
    if (scRounds._thirdPlace) {
        let sfIdx = scRounds.length - 2;
        if (sfIdx >= 0 && scRounds[sfIdx] && scRounds[sfIdx].matchups) {
            let sf = scRounds[sfIdx].matchups;
            scRounds._thirdPlace.homeId = sf[0] ? sf[0].loserId : null;
            scRounds._thirdPlace.awayId = sf[1] ? sf[1].loserId : null;
            scRounds._thirdPlace.winnerId = scDetermineWinner(scRounds._thirdPlace);
            scRounds._thirdPlace.loserId = scRounds._thirdPlace.winnerId
                ? (scRounds._thirdPlace.winnerId === scRounds._thirdPlace.homeId ? scRounds._thirdPlace.awayId : scRounds._thirdPlace.homeId)
                : null;
        }
    }
}

// --- BRACKET RENDERING ---
function scRenderBracket() {
    let container = document.getElementById('scBracketContainer');

    if (scRounds.length === 0) {
        container.innerHTML = `
            <div class="sc-bracket-empty">
                <div class="sc-bracket-empty-icon">🏆</div>
                <div class="sc-bracket-empty-text">No bracket generated yet.</div>
                <div class="sc-bracket-empty-sub">${scIsAdmin ? 'Click "Generate Bracket" above to start the tournament.' : 'Check back soon for the tournament draw.'}</div>
            </div>`;
        return;
    }

    scAdvanceWinners();

    // Champion card
    let champHtml = '';
    let finalRound = scRounds[scRounds.length - 1];
    if (finalRound && finalRound.matchups && finalRound.matchups[0] && finalRound.matchups[0].winnerId) {
        let champ = scTeams.find(t => t.id === finalRound.matchups[0].winnerId);
        if (champ) {
            champHtml = `
                <div class="sc-champion-card">
                    <div class="sc-champion-trophy">🏆</div>
                    <div class="sc-champion-label">Super Cup Champion</div>
                    <div class="sc-champion-name">${champ.name}</div>
                </div>`;
        }
    }

    // Main bracket columns
    let columnsHtml = '<div class="sc-bracket-container">';
    scRounds.forEach((round) => {
        if (!round || !round.matchups) return;
        columnsHtml += `<div class="sc-round-column">
            <div class="sc-round-label">${round.label}</div>`;
        round.matchups.forEach(m => {
            columnsHtml += scRenderMatchCard(m, round.label);
        });
        columnsHtml += '</div>';
    });
    columnsHtml += '</div>';

    // Third-place section
    let thirdHtml = '';
    if (scRounds._thirdPlace) {
        let tp = scRounds._thirdPlace;
        if (tp.homeId || tp.awayId) {
            thirdHtml = `
                <div class="sc-third-place-section">
                    <div class="sc-third-place-title">🥉 Third-Place Playoff</div>
                    <div class="sc-third-place-bracket">
                        ${scRenderMatchCard(tp, 'Third-Place Playoff')}
                    </div>
                </div>`;
        }
    }

    container.innerHTML = champHtml + columnsHtml + thirdHtml;
}

function scRenderMatchCard(m, label) {
    let homeTeam = scTeams.find(t => t.id === m.homeId);
    let awayTeam = scTeams.find(t => t.id === m.awayId);
    let hName = homeTeam ? homeTeam.name : 'TBD';
    let aName = awayTeam ? awayTeam.name : 'TBD';

    let { aggH, aggA } = scGetAggregate(m);
    let bothLegsDone = m.legs[0].completed && m.legs[1].completed;
    let winnerId = scDetermineWinner(m);

    let homeClass = winnerId === m.homeId ? 'winner' : (winnerId && winnerId !== m.homeId ? 'eliminated' : '');
    let awayClass = winnerId === m.awayId ? 'winner' : (winnerId && winnerId !== m.awayId ? 'eliminated' : '');

    let aggText = bothLegsDone ? `${aggH} - ${aggA}` : 'Click to view legs';
    let aggClass = bothLegsDone ? 'has-data' : '';

    let scoreActions = '';
    if (scIsAdmin && m.homeId && m.awayId) {
        scoreActions = `<button class="sc-enter-score-link" onclick="scOpenScoreModal('${m.id}')">✍️ Enter Leg Scores</button>`;
    }

    return `
        <div class="sc-match-card ${bothLegsDone ? 'completed' : ''}">
            <div class="sc-match-team home ${homeClass}">
                <span class="sc-team-name">🛡️ ${hName}</span>
                <span class="sc-team-score">${bothLegsDone ? aggH : '-'}</span>
            </div>
            <div class="sc-match-team away ${awayClass}">
                <span class="sc-team-name">🛡️ ${aName}</span>
                <span class="sc-team-score">${bothLegsDone ? aggA : '-'}</span>
            </div>
            <div class="sc-match-aggregate ${aggClass}" onclick="scOpenLegModal('${m.id}')">
                ${aggText} (Agg)
            </div>
            ${scoreActions}
        </div>`;
}

// --- LEG MODAL ---
function scOpenLegModal(matchupId) {
    let m = scFindMatchup(matchupId);
    if (!m) return;
    scActiveLegMatchup = m;
    scActiveLegChoice = null;
    document.getElementById('scLegModalTitle').textContent = `${scTeams.find(t => t.id === m.homeId)?.name || 'TBD'} vs ${scTeams.find(t => t.id === m.awayId)?.name || 'TBD'}`;
    scRenderLegModalBody();
    document.getElementById('scLegModal').classList.add('active');
}
function scCloseLegModal() { document.getElementById('scLegModal').classList.remove('active'); }

function scRenderLegModalBody() {
    let body = document.getElementById('scLegModalBody');
    let m = scActiveLegMatchup;
    if (!m) return;

    let leg1Done = m.legs[0].completed;
    let leg2Done = m.legs[1].completed;

    if (!scActiveLegChoice) {
        body.innerHTML = `
            <div class="sc-leg-selector">
                <div class="sc-leg-btn ${leg1Done ? '' : ''}" onclick="scSelectLeg('first')">
                    <div style="font-size:15px; font-weight:800;">First Leg</div>
                    <div style="font-size:11px; margin-top:4px;">${leg1Done ? '✅ Played' : '⏳ Not played'}</div>
                </div>
                <div class="sc-leg-btn" onclick="scSelectLeg('second')">
                    <div style="font-size:15px; font-weight:800;">Second Leg</div>
                    <div style="font-size:11px; margin-top:4px;">${leg2Done ? '✅ Played' : '⏳ Not played'}</div>
                </div>
            </div>
            ${scIsAdmin && m.homeId && m.awayId ? `<button class="sc-enter-score-link" onclick="scOpenScoreModal('${m.id}')">✍️ Enter Leg Scores</button>` : ''}
        `;
    } else {
        let legIdx = scActiveLegChoice === 'first' ? 0 : 1;
        let leg = m.legs[legIdx];
        let homeTeam = scTeams.find(t => t.id === m.homeId);
        let awayTeam = scTeams.find(t => t.id === m.awayId);
        // In leg 2, the away team from leg 1 is the home team
        let legHome = legIdx === 0 ? homeTeam : awayTeam;
        let legAway = legIdx === 0 ? awayTeam : homeTeam;

        let eventsHtml = '';
        if (leg.events && leg.events.length > 0) {
            eventsHtml = leg.events.map(e => {
                let p = scPlayers.find(x => x.id === e.playerId);
                let name = p ? p.name : (e.playerName || 'Unknown');
                if (e.type === 'goals') {
                    let assister = e.assistedBy ? scPlayers.find(x => x.id === e.assistedBy) : null;
                    let assisterName = assister ? assister.name : null;
                    let goalsList = e.goalsList || [];
                    return goalsList.map(gl => {
                        let aName = gl.assistedBy ? (scPlayers.find(x => x.id === gl.assistedBy)?.name || 'Unknown') : null;
                        return `<div class="sc-goal-entry">
                            <span class="sc-goal-scorer">⚽ ${name}</span>
                            ${aName ? `<div class="sc-goal-assist">👟 Assist: ${aName}</div>` : ''}
                        </div>`;
                    }).join('');
                }
                return '';
            }).join('');
        }

        body.innerHTML = `
            <div class="sc-leg-selector">
                <div class="sc-leg-btn ${scActiveLegChoice === 'first' ? 'active' : ''}" onclick="scSelectLeg('first')">First Leg</div>
                <div class="sc-leg-btn ${scActiveLegChoice === 'second' ? 'active' : ''}" onclick="scSelectLeg('second')">Second Leg</div>
            </div>
            <div class="sc-leg-detail">
                <div class="sc-leg-detail-header">
                    <span style="font-weight:700;">${legHome ? legHome.name : 'TBD'} <small style="color:var(--sc-muted)">(H)</small></span>
                    <span class="sc-leg-detail-score">${leg.completed ? (leg.homeScore + ' - ' + leg.awayScore) : 'VS'}</span>
                    <span style="font-weight:700;">${legAway ? legAway.name : 'TBD'} <small style="color:var(--sc-muted)">(A)</small></span>
                </div>
                ${leg.completed && eventsHtml ? `<div class="sc-leg-detail-events">${eventsHtml}</div>` : '<div class="sc-no-events">No stats recorded for this leg.</div>'}
            </div>
            ${scIsAdmin && m.homeId && m.awayId ? `<button class="sc-enter-score-link" onclick="scOpenScoreModal('${m.id}')">✍️ Enter Leg Scores</button>` : ''}
        `;
    }
}

function scSelectLeg(leg) {
    scActiveLegChoice = leg;
    scRenderLegModalBody();
}

function scFindMatchup(id) {
    for (let r of scRounds) {
        if (!r || !r.matchups) continue;
        let found = r.matchups.find(m => m.id === id);
        if (found) return found;
    }
    if (scRounds._thirdPlace && scRounds._thirdPlace.id === id) return scRounds._thirdPlace;
    return null;
}

// --- SCORE ENTRY MODAL ---
function scOpenScoreModal(matchupId) {
    let m = scFindMatchup(matchupId);
    if (!m || !scIsAdmin) return;
    scEditingScoreMatchup = m;
    scRenderScoreModalBody();
    document.getElementById('scScoreModalTitle').textContent = `Score Entry: ${scTeams.find(t => t.id === m.homeId)?.name || ''} vs ${scTeams.find(t => t.id === m.awayId)?.name || ''}`;
    document.getElementById('scScoreModal').classList.add('active');
}
function scCloseScoreModal() { document.getElementById('scScoreModal').classList.remove('active'); scEditingScoreMatchup = null; }

function scRenderScoreModalBody() {
    let body = document.getElementById('scScoreModalBody');
    let m = scEditingScoreMatchup;
    if (!m) return;

    let legSelector = `
        <div class="sc-leg-selector">
            <div class="sc-leg-btn ${scEditingScoreLeg === 'first' || !scEditingScoreLeg ? 'active' : ''}" onclick="scSelectScoreLeg('first')">First Leg</div>
            <div class="sc-leg-btn ${scEditingScoreLeg === 'second' ? 'active' : ''}" onclick="scSelectScoreLeg('second')">Second Leg</div>
        </div>`;

    let legIdx = scEditingScoreLeg === 'second' ? 1 : 0;
    if (!scEditingScoreLeg) scEditingScoreLeg = 'first';
    legIdx = scEditingScoreLeg === 'second' ? 1 : 0;

    let leg = m.legs[legIdx];
    let homeTeam = scTeams.find(t => t.id === m.homeId);
    let awayTeam = scTeams.find(t => t.id === m.awayId);
    let legHome = legIdx === 0 ? homeTeam : awayTeam;
    let legAway = legIdx === 0 ? awayTeam : homeTeam;

    let homeScore = leg.homeScore ?? 0;
    let awayScore = leg.awayScore ?? 0;

    // Home team players
    let homePlayers = scPlayers.filter(p => p.teamId === (legIdx === 0 ? m.homeId : m.awayId));
    let awayPlayers = scPlayers.filter(p => p.teamId === (legIdx === 0 ? m.awayId : m.homeId));
    let allPlayers = [...homePlayers, ...awayPlayers];

    // Parse existing events
    let existingGoals = {};
    let existingAssists = {};
    (leg.events || []).forEach(e => {
        if (e.type === 'goals') {
            existingGoals[e.playerId] = e.goalsList || [];
        }
    });

    let renderGoalRows = (players) => {
        return players.map(p => {
            let goals = existingGoals[p.id] || [];
            if (goals.length === 0) return '';
            return goals.map((gl, gi) => `
                <div class="sc-goal-row">
                    <select class="sc-goal-scorer-sel" data-player-id="${p.id}" data-goal-idx="${gi}">
                        ${allPlayers.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                    <select class="sc-goal-assist-sel" data-goal-idx="${gi}" data-scorer-id="${p.id}">
                        <option value="">— No Assist —</option>
                        ${allPlayers.filter(x => x.id !== p.id).map(x => `<option value="${x.id}" ${gl.assistedBy === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                    <button class="sc-remove-goal-btn" onclick="scRemoveGoal(this, '${p.id}', ${gi})">✕</button>
                </div>`).join('');
        }).join('');
    };

    body.innerHTML = `
        ${legSelector}
        <div class="sc-score-input-row">
            <div class="sc-score-input-item">
                <label>${legHome ? legHome.name : 'Home'}</label>
                <input type="number" id="scLegHomeScore" value="${homeScore}" min="0">
            </div>
            <div class="sc-score-input-item">
                <label>${legAway ? legAway.name : 'Away'}</label>
                <input type="number" id="scLegAwayScore" value="${awayScore}" min="0">
            </div>
        </div>
        <div style="font-size:12px; color:var(--sc-muted); margin-bottom:8px;">Goals scored in this leg:</div>
        <div id="scGoalEntryArea">
            <div style="margin-bottom:12px;">
                <div class="sc-goal-entry-form-header">${legHome ? legHome.name : 'Home'}</div>
                <div id="scHomeGoalsArea">${renderGoalRows(homePlayers) || '<div class="sc-empty">No goals added.</div>'}</div>
            </div>
            <div style="margin-bottom:12px;">
                <div class="sc-goal-entry-form-header">${legAway ? legAway.name : 'Away'}</div>
                <div id="scAwayGoalsArea">${renderGoalRows(awayPlayers) || '<div class="sc-empty">No goals added.</div>'}</div>
            </div>
        </div>
        <button class="sc-add-goal-btn" onclick="scAddGoalRow()">+ Add Goal</button>
        <button class="sc-primary-btn" onclick="scSaveLegScore()" style="margin-top:16px;">💾 Save Leg Score</button>
        <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:var(--sc-muted); cursor:pointer;">
            <input type="checkbox" id="scLegCompleted" ${leg.completed ? 'checked' : ''}> Mark this leg as completed
        </label>
    `;
}

function scSelectScoreLeg(leg) {
    scEditingScoreLeg = leg;
    scRenderScoreModalBody();
}

function scAddGoalRow() {
    let m = scEditingScoreMatchup;
    if (!m) return;
    let legIdx = scEditingScoreLeg === 'second' ? 1 : 0;
    let leg = m.legs[legIdx];

    // Add a blank goal to first available player, or create unassigned
    if (!leg.events) leg.events = [];
    let allPlayers = scPlayers.filter(p => p.teamId === m.homeId || p.teamId === m.awayId);
    let blankGoal = { scoringType: 'regular', assistedBy: '', scorerPlayerId: allPlayers[0] ? allPlayers[0].id : '' };

    // Store in temp holding — we'll collect from DOM on save
    // For now, just re-render with an extra row
    let area = document.getElementById('scGoalEntryArea');
    if (!area) return;

    // Track unadded goals via a window temp
    if (!window._scTempGoals) window._scTempGoals = [];
    window._scTempGoals.push({ legIdx, scorerId: allPlayers[0] ? allPlayers[0].id : '', assistedBy: '' });

    scRenderScoreModalBodyWithTemp();
}

function scRenderScoreModalBodyWithTemp() {
    // Re-render score modal body including temp goals
    let m = scEditingScoreMatchup;
    if (!m) return;
    let legIdx = scEditingScoreLeg === 'second' ? 1 : 0;
    let leg = m.legs[legIdx];
    let homeTeam = scTeams.find(t => t.id === m.homeId);
    let awayTeam = scTeams.find(t => t.id === m.awayId);
    let legHome = legIdx === 0 ? homeTeam : awayTeam;
    let legAway = legIdx === 0 ? awayTeam : homeTeam;

    let homePlayers = scPlayers.filter(p => p.teamId === (legIdx === 0 ? m.homeId : m.awayId));
    let awayPlayers = scPlayers.filter(p => p.teamId === (legIdx === 0 ? m.awayId : m.homeId));
    let allPlayers = [...homePlayers, ...awayPlayers];

    let existingGoals = {};
    (leg.events || []).forEach(e => {
        if (e.type === 'goals') existingGoals[e.playerId] = e.goalsList || [];
    });

    // Temp goals (not yet saved)
    let tempGoals = (window._scTempGoals || []).filter(t => t.legIdx === legIdx);

    let renderGoalRows = (players, side) => {
        let html = players.map(p => {
            let goals = existingGoals[p.id] || [];
            return goals.map((gl, gi) => `
                <div class="sc-goal-row">
                    <select class="sc-goal-scorer-sel" data-player-id="${p.id}" data-goal-idx="${gi}" data-side="${side}">
                        ${allPlayers.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                    <select class="sc-goal-assist-sel" data-goal-idx="${gi}" data-scorer-id="${p.id}" data-side="${side}">
                        <option value="">— No Assist —</option>
                        ${allPlayers.filter(x => x.id !== p.id).map(x => `<option value="${x.id}" ${gl.assistedBy === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                    <button class="sc-remove-goal-btn" onclick="scRemoveGoal(this, '${p.id}', ${gi})">✕</button>
                </div>`).join('');
        }).join('');

        // Add temp goals for this side
        let tempForSide = tempGoals.filter(t => {
            let p = allPlayers.find(x => x.id === t.scorerId);
            return p && (side === 'home' ? homePlayers.includes(p) : awayPlayers.includes(p));
        });
        tempForSide.forEach((t, i) => {
            html += `
                <div class="sc-goal-row sc-temp-goal">
                    <select class="sc-goal-scorer-sel" data-temp-idx="${i}" data-side="${side}">
                        ${allPlayers.map(x => `<option value="${x.id}" ${x.id === t.scorerId ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                    <select class="sc-goal-assist-sel" data-temp-idx="${i}" data-side="${side}">
                        <option value="">— No Assist —</option>
                        ${allPlayers.filter(x => x.id !== t.scorerId).map(x => `<option value="${x.id}" ${x.id === t.assistedBy ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                    <button class="sc-remove-goal-btn" onclick="scRemoveTempGoal(this, ${i}, '${side}')">✕</button>
                </div>`;
        });

        return html || '<div class="sc-empty">No goals added.</div>';
    };

    let homeScore = document.getElementById('scLegHomeScore') ? document.getElementById('scLegHomeScore').value : (leg.homeScore ?? 0);
    let awayScore = document.getElementById('scLegAwayScore') ? document.getElementById('scLegAwayScore').value : (leg.awayScore ?? 0);

    let legSelector = `
        <div class="sc-leg-selector">
            <div class="sc-leg-btn ${scEditingScoreLeg === 'first' ? 'active' : ''}" onclick="scSelectScoreLeg('first')">First Leg</div>
            <div class="sc-leg-btn ${scEditingScoreLeg === 'second' ? 'active' : ''}" onclick="scSelectScoreLeg('second')">Second Leg</div>
        </div>`;

    document.getElementById('scScoreModalBody').innerHTML = `
        ${legSelector}
        <div class="sc-score-input-row">
            <div class="sc-score-input-item">
                <label>${legHome ? legHome.name : 'Home'}</label>
                <input type="number" id="scLegHomeScore" value="${homeScore}" min="0">
            </div>
            <div class="sc-score-input-item">
                <label>${legAway ? legAway.name : 'Away'}</label>
                <input type="number" id="scLegAwayScore" value="${awayScore}" min="0">
            </div>
        </div>
        <div style="font-size:12px; color:var(--sc-muted); margin-bottom:8px;">Goals scored in this leg:</div>
        <div id="scGoalEntryArea">
            <div style="margin-bottom:12px;">
                <div class="sc-goal-entry-form-header">${legHome ? legHome.name : 'Home'}</div>
                <div id="scHomeGoalsArea">${renderGoalRows(homePlayers, 'home')}</div>
            </div>
            <div style="margin-bottom:12px;">
                <div class="sc-goal-entry-form-header">${legAway ? legAway.name : 'Away'}</div>
                <div id="scAwayGoalsArea">${renderGoalRows(awayPlayers, 'away')}</div>
            </div>
        </div>
        <button class="sc-add-goal-btn" onclick="scAddGoalRow()">+ Add Goal</button>
        <button class="sc-primary-btn" onclick="scSaveLegScore()" style="margin-top:16px;">💾 Save Leg Score</button>
        <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:var(--sc-muted); cursor:pointer;">
            <input type="checkbox" id="scLegCompleted" ${leg.completed ? 'checked' : ''}> Mark this leg as completed
        </label>
    `;
}

function scRemoveGoal(btn, playerId, goalIdx) {
    let m = scEditingScoreMatchup;
    if (!m) return;
    let legIdx = scEditingScoreLeg === 'second' ? 1 : 0;
    let leg = m.legs[legIdx];
    let ev = (leg.events || []).find(e => e.playerId === playerId && e.type === 'goals');
    if (ev && ev.goalsList) {
        ev.goalsList.splice(goalIdx, 1);
        ev.count = ev.goalsList.length;
        if (ev.goalsList.length === 0) {
            leg.events = leg.events.filter(e => e !== ev);
        }
    }
    scRenderScoreModalBodyWithTemp();
}

function scRemoveTempGoal(btn, tempIdx, side) {
    if (!window._scTempGoals) return;
    // Remove the nth temp goal for this side
    let legIdx = scEditingScoreLeg === 'second' ? 1 : 0;
    let temps = window._scTempGoals.filter(t => t.legIdx === legIdx);
    let sideTemps = temps.filter(t => {
        let allPlayers = scPlayers.filter(p => p.teamId === scEditingScoreMatchup.homeId || p.teamId === scEditingScoreMatchup.awayId);
        let p = allPlayers.find(x => x.id === t.scorerId);
        let homePlayers = scPlayers.filter(p => p.teamId === (legIdx === 0 ? scEditingScoreMatchup.homeId : scEditingScoreMatchup.awayId));
        return side === 'home' ? homePlayers.includes(p) : !homePlayers.includes(p);
    });
    let toRemove = sideTemps[tempIdx];
    if (toRemove) {
        let realIdx = window._scTempGoals.indexOf(toRemove);
        window._scTempGoals.splice(realIdx, 1);
    }
    scRenderScoreModalBodyWithTemp();
}

function scSaveLegScore() {
    let m = scEditingScoreMatchup;
    if (!m) return;
    let legIdx = scEditingScoreLeg === 'second' ? 1 : 0;
    let leg = m.legs[legIdx];

    let homeScore = parseInt(document.getElementById('scLegHomeScore').value) || 0;
    let awayScore = parseInt(document.getElementById('scLegAwayScore').value) || 0;
    let completed = document.getElementById('scLegCompleted').checked;

    // In leg 0: homeId team is home. In leg 1: awayId team is home.
    let actualHomeId = legIdx === 0 ? m.homeId : m.awayId;
    let actualAwayId = legIdx === 0 ? m.awayId : m.homeId;

    // Collect goals from DOM
    let newEvents = [];
    let goalMap = {}; // playerId -> [{assistedBy}]

    document.querySelectorAll('.sc-goal-row').forEach(row => {
        let scorerSel = row.querySelector('.sc-goal-scorer-sel');
        let assistSel = row.querySelector('.sc-goal-assist-sel');
        if (!scorerSel) return;
        let scorerId = scorerSel.value;
        let assistId = assistSel ? assistSel.value : '';
        if (!scorerId) return;
        if (!goalMap[scorerId]) goalMap[scorerId] = [];
        goalMap[scorerId].push({ scoringType: 'regular', assistedBy: assistId });
    });

    Object.entries(goalMap).forEach(([pId, goals]) => {
        let scorer = scPlayers.find(x => x.id === pId);
        let scorerTeamId = scorer ? scorer.teamId : null;
        newEvents.push({
            playerId: pId, playerName: scorer ? scorer.name : null, teamId: scorerTeamId,
            type: 'goals', count: goals.length, goalsList: goals
        });
        goals.forEach(g => {
            if (g.assistedBy) {
                let existing = newEvents.find(e => e.playerId === g.assistedBy && e.type === 'assists');
                let assister = scPlayers.find(x => x.id === g.assistedBy);
                if (existing) existing.count++;
                else newEvents.push({
                    playerId: g.assistedBy, playerName: assister ? assister.name : null,
                    teamId: assister ? assister.teamId : null, type: 'assists', count: 1
                });
            }
        });
    });

    leg.homeScore = homeScore;
    leg.awayScore = awayScore;
    leg.events = newEvents;
    leg.completed = completed;

    // Clear temp goals
    window._scTempGoals = [];

    scPersist();
    scCloseScoreModal();
    scRenderAll();
}

// --- STATS ---
function scComputeStats() {
    let stats = {};
    scRounds.forEach(round => {
        if (!round || !round.matchups) return;
        round.matchups.forEach(m => {
            if (!m.legs) return;
            m.legs.forEach(leg => {
                if (!leg.events) return;
                leg.events.forEach(e => {
                    if (!stats[e.playerId]) stats[e.playerId] = { goals: 0, assists: 0 };
                    if (e.type === 'goals') stats[e.playerId].goals += (e.count || 0);
                    if (e.type === 'assists') stats[e.playerId].assists += (e.count || 0);
                });
            });
        });
    });
    // Third place
    if (scRounds._thirdPlace && scRounds._thirdPlace.legs) {
        scRounds._thirdPlace.legs.forEach(leg => {
            if (!leg.events) return;
            leg.events.forEach(e => {
                if (!stats[e.playerId]) stats[e.playerId] = { goals: 0, assists: 0 };
                if (e.type === 'goals') stats[e.playerId].goals += (e.count || 0);
                if (e.type === 'assists') stats[e.playerId].assists += (e.count || 0);
            });
        });
    }
    return stats;
}

function scRenderStats() {
    let stats = scComputeStats();
    let scorers = Object.entries(stats)
        .filter(([id, s]) => s.goals > 0)
        .sort((a, b) => b[1].goals - a[1].goals);
    let assists = Object.entries(stats)
        .filter(([id, s]) => s.assists > 0)
        .sort((a, b) => b[1].assists - a[1].assists);

    let renderList = (list, statKey) => {
        if (list.length === 0) return '<div class="sc-empty">No stats recorded yet.</div>';
        return list.map(([id, s], idx) => {
            let p = scPlayers.find(x => x.id === id);
            let team = p ? scTeams.find(t => t.id === p.teamId) : null;
            let name = p ? p.name : 'Unknown';
            return `<div class="sc-stat-row ${idx === 0 ? 'top' : ''}">
                <div>
                    <div class="sc-stat-name">${idx === 0 ? '👑 ' : ''}${name}</div>
                    <div class="sc-stat-team">${team ? team.name : 'Free Agent'}</div>
                </div>
                <div class="sc-stat-val">${s[statKey]}</div>
            </div>`;
        }).join('');
    };

    document.getElementById('scTopScorers').innerHTML = renderList(scorers, 'goals');
    document.getElementById('scTopAssists').innerHTML = renderList(assists, 'assists');
}

// --- NEWS ---
function scRenderNews() {
    let container = document.getElementById('scNewsContainer');
    if (!scNews || scNews.length === 0) {
        container.innerHTML = '<div class="sc-empty">No cup news yet.</div>';
        return;
    }
    container.innerHTML = scNews.map(n => `
        <div class="sc-news-card" onclick="scOpenNewsDetail('${n.id}')">
            ${scIsAdmin ? `<button class="sc-news-delete" onclick="event.stopPropagation(); scDeleteNews('${n.id}')">🗑️</button>` : ''}
            <div class="sc-news-headline">${n.headline}</div>
            <div class="sc-news-date">🗓️ ${n.date}</div>
        </div>`).join('');
}

function scOpenNewsDetail(id) {
    let n = scNews.find(x => x.id === id);
    if (!n) return;
    document.getElementById('scNewsDetailBody').innerHTML = `
        <div class="sc-news-detail-headline">${n.headline}</div>
        <div class="sc-news-detail-body">${(n.body || '').replace(/\n/g, '<br>')}</div>
        <div class="sc-news-detail-date">🗓️ ${n.date}</div>
    `;
    document.getElementById('scNewsDetailModal').classList.add('active');
}
function scCloseNewsDetail() { document.getElementById('scNewsDetailModal').classList.remove('active'); }

function scOpenNewsPostModal() { document.getElementById('scNewsPostModal').classList.add('active'); }
function scCloseNewsPostModal() { document.getElementById('scNewsPostModal').classList.remove('active'); }

function scPublishNews() {
    let headline = document.getElementById('scNewsHeadline').value.trim();
    let body = document.getElementById('scNewsBody').value.trim();
    if (!headline) return alert('Please enter a headline.');
    scNews.unshift({
        id: 'scn' + Date.now(), headline, body,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    });
    document.getElementById('scNewsHeadline').value = '';
    document.getElementById('scNewsBody').value = '';
    scCloseNewsPostModal();
    scPersist();
    scRenderNews();
}

function scDeleteNews(id) {
    if (!confirm('Delete this news post?')) return;
    scNews = scNews.filter(n => n.id !== id);
    scPersist();
    scRenderNews();
}

// --- SQUAD POPUP (view players for a team) ---
function scOpenSquadPopup(teamId) {
    let team = scTeams.find(t => t.id === teamId);
    if (!team) return;
    document.getElementById('scSquadPopupTitle').textContent = team.name + ' — Squad';
    let teamPlayers = scPlayers.filter(p => p.teamId === teamId);
    document.getElementById('scSquadPopupList').innerHTML = teamPlayers.map(p => {
        return `<li><span>👤 ${p.name}</span><span class="sc-player-stats">${p.goals || 0} G / ${p.assists || 0} A</span></li>`;
    }).join('') || '<div class="sc-empty">No players in this squad.</div>';
    document.getElementById('scSquadPopupModal').classList.add('active');
}
function scCloseSquadPopup() { document.getElementById('scSquadPopupModal').classList.remove('active'); }

// --- RENDER ALL ---
function scRenderAll() {
    // Show/hide admin buttons
    document.getElementById('scManageSquadsBtn').style.display = scIsAdmin ? 'block' : 'none';
    document.getElementById('scGenBracketBtn').style.display = scIsAdmin ? 'block' : 'none';
    document.getElementById('scPostNewsBtn').style.display = scIsAdmin ? 'block' : 'none';

    if (scActiveView === 'bracket') scRenderBracket();
    if (scActiveView === 'stats') scRenderStats();
    if (scActiveView === 'news') scRenderNews();
}

// --- BOOTSTRAP ---
function scWaitForFirebase() {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        scInitFirebase();
    } else {
        setTimeout(scWaitForFirebase, 50);
    }
}
scWaitForFirebase();
