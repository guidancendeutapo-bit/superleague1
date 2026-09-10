// ===================================================================
// SUPER CUP — supercup.js
// Knockout tournament bracket management.
// ===================================================================

const scFirebaseConfig = {
    apiKey: "AIzaSyDS9quu-rckjxBMW-vuhx1NFPHeZmfs-3E",
    authDomain: "super-league-3fc14.firebaseapp.com",
    projectId: "super-league-3fc14",
    storageBucket: "super-league-3fc14.firebasestorage.app",
    messagingSenderId: "108539201153",
    appId: "1:108539201153:web:a35388bd2386fcb9a2ccb0",
    measurementId: "G-00SSJ5W0VH",
    databaseURL: "https://super-league-3fc14-default-rtdb.firebaseio.com"
};

let scDb = null;
let scTeams = [];
let scPlayers = [];
let scBracket = { rounds: [], thirdPlace: null, champion: null, generated: false };
let scNews = [];
let scIsAdmin = false;
let scActiveView = 'bracket';
let scEditingMatchId = null;
let scGoalEntries = [];

// --- INIT ---
function scInitFirebase() {
    firebase.initializeApp(scFirebaseConfig);
    scDb = firebase.database();
    scDb.ref('superCupData').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            scTeams = data.teams || [];
            scPlayers = data.players || [];
            scBracket = data.bracket || { rounds: [], thirdPlace: null, champion: null, generated: false };
            scNews = data.news || [];
        }
        scRenderAll();
    });
}

function scSaveData() {
    if (!scDb) return;
    scDb.ref('superCupData').set({
        teams: scTeams,
        players: scPlayers,
        bracket: scBracket,
        news: scNews
    });
}

// --- ADMIN ---
function scHandleAuth() {
    if (scIsAdmin) {
        scIsAdmin = false;
        document.getElementById("scAdminToggle").innerText = "🔐 Admin";
        document.getElementById("scAdminToggle").classList.remove("logged-in");
        scRenderAll();
    } else {
        document.getElementById("scPasswordInput").value = "";
        document.getElementById("scAuthModal").classList.add("active");
    }
}

function scCloseAuthModal() {
    document.getElementById("scAuthModal").classList.remove("active");
}

function scValidateAdmin() {
    if (document.getElementById("scPasswordInput").value === "Windhoek") {
        scIsAdmin = true;
        document.getElementById("scAdminToggle").innerText = "🔓 Logout";
        document.getElementById("scAdminToggle").classList.add("logged-in");
        scCloseAuthModal();
        scRenderAll();
    } else {
        alert("Incorrect password.");
    }
}

// --- VIEW SWITCHING ---
function scSwitchView(view) {
    scActiveView = view;
    document.querySelectorAll(".sc-view").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".sc-nav-btn").forEach(el => el.classList.remove("active"));
    let viewId = "scView" + view.charAt(0).toUpperCase() + view.slice(1);
    let navId = "scNav" + view.charAt(0).toUpperCase() + view.slice(1);
    document.getElementById(viewId)?.classList.add("active");
    document.getElementById(navId)?.classList.add("active");
    scRenderAll();
}

function scUpdateAdminUI() {
    let manageBtn = document.getElementById("scManageSquadsBtn");
    let genBtn = document.getElementById("scGenBracketBtn");
    let postNewsBtn = document.getElementById("scPostNewsBtn");
    if (manageBtn) manageBtn.style.display = scIsAdmin ? "inline-flex" : "none";
    if (genBtn) genBtn.style.display = scIsAdmin ? "inline-flex" : "none";
    if (postNewsBtn) postNewsBtn.style.display = scIsAdmin ? "inline-flex" : "none";
}

// --- SQUAD MANAGEMENT ---
function scOpenSquadModal() {
    scRenderTeamList();
    scRenderPlayerList();
    scRenderTeamSelect();
    document.getElementById("scSquadModal").classList.add("active");
}

function scCloseSquadModal() {
    document.getElementById("scSquadModal").classList.remove("active");
}

function scAddTeam() {
    let input = document.getElementById("scNewTeamName");
    if (!input.value.trim()) return;
    if (scBracket.generated) return alert("Bracket already generated. Regenerate the bracket after adding teams for them to appear.");
    scTeams.push({ id: "sct" + Date.now(), name: input.value.trim() });
    input.value = "";
    scSaveData();
    scRenderTeamList();
    scRenderTeamSelect();
}

function scDeleteTeam(id) {
    if (!confirm("Delete this team? All its players will also be removed.")) return;
    if (scBracket.generated) return alert("Cannot delete teams after the bracket is generated. Regenerate the bracket first.");
    scTeams = scTeams.filter(t => t.id !== id);
    scPlayers = scPlayers.filter(p => p.teamId !== id);
    scSaveData();
    scRenderTeamList();
    scRenderPlayerList();
    scRenderTeamSelect();
}

function scRenderTeamList() {
    let list = document.getElementById("scTeamList");
    if (!list) return;
    list.innerHTML = scTeams.length === 0
        ? '<div style="color:var(--sc-muted); font-size:13px; padding:12px; text-align:center;">No teams added yet.</div>'
        : scTeams.map(t => `
            <div class="sc-team-list-item">
                <span>🛡️ ${t.name}</span>
                <button class="sc-item-delete" onclick="scDeleteTeam('${t.id}')">×</button>
            </div>`).join('');
}

function scAddPlayer() {
    let nameInput = document.getElementById("scNewPlayerName");
    let teamSelect = document.getElementById("scNewPlayerTeam");
    if (!nameInput.value.trim()) return;
    if (!teamSelect.value) return alert("Add a team first before registering players.");
    scPlayers.push({ id: "scp" + Date.now(), name: nameInput.value.trim(), teamId: teamSelect.value });
    nameInput.value = "";
    scSaveData();
    scRenderPlayerList();
}

function scDeletePlayer(id) {
    if (!confirm("Delete this player?")) return;
    scPlayers = scPlayers.filter(p => p.id !== id);
    scSaveData();
    scRenderPlayerList();
}

function scRenderPlayerList() {
    let list = document.getElementById("scPlayerList");
    if (!list) return;
    if (scPlayers.length === 0) {
        list.innerHTML = '<div style="color:var(--sc-muted); font-size:13px; padding:12px; text-align:center;">No players registered yet.</div>';
        return;
    }
    list.innerHTML = scPlayers.map(p => {
        let team = scTeams.find(t => t.id === p.teamId);
        return `
            <div class="sc-player-list-item">
                <span>👤 ${p.name} <span style="color:var(--sc-muted); font-size:11px;">(${team ? team.name : 'No team'})</span></span>
                <button class="sc-item-delete" onclick="scDeletePlayer('${p.id}')">×</button>
            </div>`;
    }).join('');
}

function scRenderTeamSelect() {
    let select = document.getElementById("scNewPlayerTeam");
    if (!select) return;
    select.innerHTML = scTeams.length === 0
        ? '<option value="">Add a team first</option>'
        : scTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

// --- BRACKET GENERATION ---
function scGetRoundName(roundIndex, totalRounds) {
    let fromEnd = totalRounds - roundIndex - 1;
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1) return "Semi Finals";
    if (fromEnd === 2) return "Quarter Finals";
    if (fromEnd === 3) return "Round of 16";
    if (fromEnd === 4) return "Round of 32";
    let teamsInRound = Math.pow(2, totalRounds - roundIndex);
    return "Round of " + teamsInRound;
}

function scGenerateBracket() {
    if (scTeams.length < 2) return alert("Add at least 2 teams first.");
    if (scBracket.generated) {
        if (!confirm("Generate a new bracket? This will replace the existing bracket and all scores.")) return;
    } else {
        if (!confirm("Generate the tournament bracket from the current teams?")) return;
    }

    let shuffled = [...scTeams].sort(() => Math.random() - 0.5);
    let n = shuffled.length;
    let numRounds = Math.ceil(Math.log2(n));
    let totalSlots = Math.pow(2, numRounds);
    let baseTime = Date.now();
    let matchCounter = 0;

    // First round
    let firstRoundMatches = [];
    for (let i = 0; i < totalSlots; i += 2) {
        let homeTeam = i < n ? shuffled[i] : null;
        let awayTeam = (i + 1) < n ? shuffled[i + 1] : null;
        let match = {
            id: "scm-" + baseTime + "-" + matchCounter++,
            homeId: homeTeam ? homeTeam.id : null,
            awayId: awayTeam ? awayTeam.id : null,
            homeScore: null, awayScore: null,
            homePen: null, awayPen: null,
            events: [], completed: false, winnerId: null,
            nextMatchId: null, nextSlot: null
        };
        if (homeTeam && !awayTeam) { match.winnerId = homeTeam.id; match.completed = true; }
        else if (!homeTeam && awayTeam) { match.winnerId = awayTeam.id; match.completed = true; }
        firstRoundMatches.push(match);
    }

    let allRounds = [{ name: scGetRoundName(0, numRounds), matches: firstRoundMatches }];
    let prevMatches = firstRoundMatches;

    for (let r = 1; r < numRounds; r++) {
        let nextMatches = [];
        let matchesInRound = prevMatches.length / 2;
        for (let m = 0; m < matchesInRound; m++) {
            let prevHome = prevMatches[m * 2];
            let prevAway = prevMatches[m * 2 + 1];
            let match = {
                id: "scm-" + baseTime + "-" + matchCounter++,
                homeId: prevHome.winnerId || null,
                awayId: prevAway.winnerId || null,
                homeScore: null, awayScore: null,
                homePen: null, awayPen: null,
                events: [], completed: false, winnerId: null,
                nextMatchId: null, nextSlot: null
            };
            prevHome.nextMatchId = match.id;
            prevHome.nextSlot = "home";
            prevAway.nextMatchId = match.id;
            prevAway.nextSlot = "away";
            nextMatches.push(match);
        }
        prevMatches = nextMatches;
        allRounds.push({ name: scGetRoundName(r, numRounds), matches: prevMatches });
    }

    let thirdPlace = {
        id: "scm-3rd-" + baseTime,
        homeId: null, awayId: null,
        homeScore: null, awayScore: null,
        homePen: null, awayPen: null,
        events: [], completed: false, winnerId: null,
        nextMatchId: null, nextSlot: null,
        isThirdPlace: true
    };

    scBracket = { rounds: allRounds, thirdPlace: thirdPlace, champion: null, generated: true };
    scSaveData();
    scRenderAll();
    alert("✅ Bracket generated! " + shuffled.length + " teams drawn into the tournament.");
}

// --- MATCH LOOKUP ---
function scFindMatchById(matchId) {
    for (let round of scBracket.rounds) {
        let match = round.matches.find(m => m.id === matchId);
        if (match) return match;
    }
    if (scBracket.thirdPlace && scBracket.thirdPlace.id === matchId) return scBracket.thirdPlace;
    return null;
}

function scGetAllMatches() {
    let all = [];
    scBracket.rounds.forEach(r => { all = all.concat(r.matches); });
    if (scBracket.thirdPlace) all.push(scBracket.thirdPlace);
    return all;
}

// --- WINNER ADVANCEMENT ---
function scProcessMatchResult(match) {
    if (match.homeScore === null || match.awayScore === null) return;

    let winnerId = null;
    if (match.homeScore > match.awayScore) winnerId = match.homeId;
    else if (match.awayScore > match.homeScore) winnerId = match.awayId;
    else if (match.homePen !== null && match.awayPen !== null) {
        if (match.homePen > match.awayPen) winnerId = match.homeId;
        else if (match.awayPen > match.homePen) winnerId = match.awayId;
    }

    if (!winnerId) { match.completed = false; match.winnerId = null; return; }

    match.winnerId = winnerId;
    match.completed = true;

    // Advance winner to next match
    if (match.nextMatchId) {
        let nextMatch = scFindMatchById(match.nextMatchId);
        if (nextMatch) {
            if (match.nextSlot === "home") nextMatch.homeId = winnerId;
            else nextMatch.awayId = winnerId;
        }
    }

    // Final -> set champion
    if (!match.nextMatchId && !match.isThirdPlace) {
        scBracket.champion = winnerId;
    }

    // Semi-final losers -> third place playoff
    if (scBracket.thirdPlace && !match.isThirdPlace) {
        let semiRoundIdx = scBracket.rounds.length - 2;
        if (semiRoundIdx >= 0) {
            let semiRound = scBracket.rounds[semiRoundIdx];
            if (semiRound.matches.includes(match)) {
                let loserId = winnerId === match.homeId ? match.awayId : match.homeId;
                let semiIndex = semiRound.matches.indexOf(match);
                if (semiIndex === 0) scBracket.thirdPlace.homeId = loserId;
                else if (semiIndex === 1) scBracket.thirdPlace.awayId = loserId;
            }
        }
    }
}

// --- BRACKET RENDERING ---
function scRenderBracket() {
    let container = document.getElementById("scBracketContainer");
    if (!container) return;

    if (!scBracket.generated || scBracket.rounds.length === 0) {
        container.innerHTML = `
            <div class="sc-bracket-empty">
                <div class="sc-bracket-empty-icon">🏆</div>
                <div class="sc-bracket-empty-text">Bracket not yet generated</div>
                <div class="sc-bracket-empty-sub">${scIsAdmin ? 'Click "Generate Bracket" above to create the tournament draw.' : 'Check back soon for the tournament draw!'}</div>
            </div>`;
        return;
    }

    let championHtml = '';
    if (scBracket.champion) {
        let champ = scTeams.find(t => t.id === scBracket.champion);
        championHtml = `
            <div class="sc-champion-card">
                <div class="sc-champion-trophy">🏆</div>
                <div class="sc-champion-label">Super Cup Champion</div>
                <div class="sc-champion-name">${champ ? champ.name : 'Unknown'}</div>
            </div>`;
    }

    let columnsHtml = scBracket.rounds.map(round => {
        let matchesHtml = round.matches.map(match => scRenderMatchCard(match)).join('');
        return `<div class="sc-round-column"><div class="sc-round-label">${round.name}</div>${matchesHtml}</div>`;
    }).join('');

    let thirdPlaceHtml = '';
    if (scBracket.thirdPlace && (scBracket.thirdPlace.homeId || scBracket.thirdPlace.awayId)) {
        let tp = scBracket.thirdPlace;
        thirdPlaceHtml = `
            <div class="sc-third-place-section">
                <div class="sc-third-place-title">🥉 Third Place Playoff</div>
                <div class="sc-third-place-bracket">
                    ${scRenderMatchCard(tp)}
                </div>
            </div>`;
    }

    container.innerHTML = championHtml +
        '<div class="sc-bracket-container">' + columnsHtml + '</div>' +
        thirdPlaceHtml;
}

function scRenderMatchCard(match) {
    let homeName = scTeams.find(t => t.id === match.homeId)?.name || 'TBD';
    let awayName = scTeams.find(t => t.id === match.awayId)?.name || 'TBD';
    let homeScore = match.homeScore !== null ? match.homeScore : '-';
    let awayScore = match.awayScore !== null ? match.awayScore : '-';
    let homeClass = match.completed ? (match.winnerId === match.homeId ? 'winner' : 'eliminated') : '';
    let awayClass = match.completed ? (match.winnerId === match.awayId ? 'winner' : 'eliminated') : '';

    let homeScoreDisplay = String(homeScore);
    let awayScoreDisplay = String(awayScore);
    if (match.completed && match.homeScore === match.awayScore && match.homePen !== null) {
        homeScoreDisplay = `${homeScore} <span style="font-size:11px;color:var(--sc-gold);">(${match.homePen})</span>`;
        awayScoreDisplay = `${awayScore} <span style="font-size:11px;color:var(--sc-gold);">(${match.awayPen})</span>`;
    }

    let homeNameHtml = match.homeId
        ? `<span class="sc-team-name" onclick="event.stopPropagation();scOpenSquadPopup('${match.homeId}')" style="cursor:pointer;text-decoration:underline dotted rgba(255,255,255,0.2);">${homeName}</span>`
        : `<span class="sc-team-name">${homeName}</span>`;
    let awayNameHtml = match.awayId
        ? `<span class="sc-team-name" onclick="event.stopPropagation();scOpenSquadPopup('${match.awayId}')" style="cursor:pointer;text-decoration:underline dotted rgba(255,255,255,0.2);">${awayName}</span>`
        : `<span class="sc-team-name">${awayName}</span>`;

    return `
        <div class="sc-match-card ${match.completed ? 'completed' : ''}" onclick="scOpenLegModal('${match.id}')" style="cursor:pointer;">
            <div class="sc-match-team home ${homeClass}">
                ${homeNameHtml}
                <span class="sc-team-score">${homeScoreDisplay}</span>
            </div>
            <div class="sc-match-team away ${awayClass}">
                ${awayNameHtml}
                <span class="sc-team-score">${awayScoreDisplay}</span>
            </div>
        </div>`;
}

// --- LEG MODAL (Match Details) ---
function scOpenLegModal(matchId) {
    let match = scFindMatchById(matchId);
    if (!match) return;

    let homeName = scTeams.find(t => t.id === match.homeId)?.name || 'TBD';
    let awayName = scTeams.find(t => t.id === match.awayId)?.name || 'TBD';

    document.getElementById("scLegModalTitle").innerText = homeName + ' vs ' + awayName;

    let homeScore = match.homeScore !== null ? match.homeScore : '-';
    let awayScore = match.awayScore !== null ? match.awayScore : '-';

    let eventsHtml = '';
    if (match.events && match.events.length > 0) {
        let lines = match.events.map(e => {
            let p = scPlayers.find(x => x.id === e.playerId);
            let name = p ? p.name : (e.playerName || 'Unknown');
            let team = scTeams.find(t => t.id === e.teamId);
            let teamName = team ? team.name : '';
            if (e.type === 'goal') {
                let pen = e.scoringType === 'penalty' ? ' (P)' : '';
                return `<div class="sc-goal-entry"><span class="sc-goal-scorer">⚽ ${name}${pen}</span> <span style="color:var(--sc-muted);font-size:11px;">${teamName}</span></div>`;
            }
            if (e.type === 'assist') {
                return `<div class="sc-goal-assist">👟 Assist: ${name} (${teamName})</div>`;
            }
            if (e.type === 'ownGoal') {
                return `<div class="sc-goal-entry"><span class="sc-goal-scorer" style="color:var(--sc-red);">🔴 ${name} (OG)</span> <span style="color:var(--sc-muted);font-size:11px;">${teamName}</span></div>`;
            }
            return '';
        }).join('');
        eventsHtml = `<div class="sc-leg-detail-events" style="margin-top:14px;">${lines}</div>`;
    } else if (match.completed) {
        eventsHtml = '<div class="sc-no-events">No goal details recorded.</div>';
    }

    let penHtml = '';
    if (match.completed && match.homeScore === match.awayScore && match.homePen !== null) {
        penHtml = `<div style="text-align:center;margin-top:10px;font-size:13px;color:var(--sc-gold);">Penalties: ${match.homePen} - ${match.awayPen}</div>`;
    }

    let scoreDisplay = match.completed
        ? `<div class="sc-leg-detail-score">${homeScore} - ${awayScore}</div>`
        : '<div class="sc-no-events">Match not yet played.</div>';

    let adminBtn = '';
    if (scIsAdmin && match.homeId && match.awayId) {
        if (!match.completed) {
            adminBtn = `<button class="sc-enter-score-link" onclick="scOpenScoreModal('${match.id}')">✍️ Enter Score</button>`;
        } else {
            adminBtn = `<button class="sc-enter-score-link" style="background:linear-gradient(135deg,#1e293b,#0d0d25);color:#fff;border:1px solid var(--sc-border);" onclick="scOpenScoreModal('${match.id}')">⚙️ Edit Score</button>`;
        }
    }

    document.getElementById("scLegModalBody").innerHTML = `
        <div class="sc-leg-detail">
            <div class="sc-leg-detail-header">
                <span style="font-weight:700;">${homeName}</span>
                ${scoreDisplay}
                <span style="font-weight:700;">${awayName}</span>
            </div>
            ${eventsHtml}
            ${penHtml}
            ${adminBtn}
        </div>`;

    document.getElementById("scLegModal").classList.add("active");
}

function scCloseLegModal() {
    document.getElementById("scLegModal").classList.remove("active");
}

// --- SCORE ENTRY MODAL ---
function scOpenScoreModal(matchId) {
    scEditingMatchId = matchId;
    let match = scFindMatchById(matchId);
    if (!match) return;

    let homeName = scTeams.find(t => t.id === match.homeId)?.name || 'Home';
    let awayName = scTeams.find(t => t.id === match.awayId)?.name || 'Away';

    document.getElementById("scScoreModalTitle").innerText = homeName + ' vs ' + awayName;

    scGoalEntries = (match.events || []).map(e => {
        let assistEvent = match.events.find(a => a.type === 'assist' && a._linkedTo === e.playerId);
        return {
            playerId: e.playerId,
            teamId: e.teamId,
            playerName: e.playerName,
            type: e.type,
            scoringType: e.scoringType || 'regular',
            assistId: ''
        };
    }).filter(e => e.type === 'goal' || e.type === 'ownGoal');

    // Reconstruct assist IDs by matching consecutive events
    let events = match.events || [];
    for (let i = 0; i < scGoalEntries.length; i++) {
        let entry = scGoalEntries[i];
        let eventIdx = events.findIndex(e => e === events.filter(ev => ev.type === 'goal' || ev.type === 'ownGoal')[i]);
        if (eventIdx >= 0 && events[eventIdx + 1] && events[eventIdx + 1].type === 'assist') {
            entry.assistId = events[eventIdx + 1].playerId;
        }
    }

    scRenderScoreModalBody(match);
    document.getElementById("scScoreModal").classList.add("active");
}

function scRenderScoreModalBody(match) {
    let homeName = scTeams.find(t => t.id === match.homeId)?.name || 'Home';
    let awayName = scTeams.find(t => t.id === match.awayId)?.name || 'Away';
    let homeScore = match.homeScore ?? 0;
    let awayScore = match.awayScore ?? 0;

    let allPlayers = scPlayers.filter(p => p.teamId === match.homeId || p.teamId === match.awayId);
    let playerOpts = allPlayers.map(p => {
        let team = scTeams.find(t => t.id === p.teamId);
        return `<option value="${p.id}">${p.name} (${team ? team.name : ''})</option>`;
    }).join('');

    let goalRowsHtml = scGoalEntries.map((entry, i) => {
        let otherPlayers = allPlayers.filter(x => x.id !== entry.playerId);
        let assistOpts = otherPlayers.map(x => {
            let team = scTeams.find(t => t.id === x.teamId);
            return `<option value="${x.id}" ${entry.assistId === x.id ? 'selected' : ''}>${x.name} (${team ? team.name : ''})</option>`;
        }).join('');

        let typeVal = entry.type === 'goal' && entry.scoringType === 'penalty' ? 'penalty' : entry.type;

        return `
            <div class="sc-goal-row" id="scGoalRow${i}">
                <select id="scGoalScorer${i}" onchange="scUpdateGoalEntry(${i})">
                    <option value="">— Scorer —</option>
                    ${allPlayers.map(p => {
                        let team = scTeams.find(t => t.id === p.teamId);
                        return `<option value="${p.id}" ${entry.playerId === p.id ? 'selected' : ''}>${p.name} (${team ? team.name : ''})</option>`;
                    }).join('')}
                </select>
                <select id="scGoalType${i}" onchange="scUpdateGoalEntry(${i})">
                    <option value="goal" ${typeVal === 'goal' ? 'selected' : ''}>⚽ Goal</option>
                    <option value="penalty" ${typeVal === 'penalty' ? 'selected' : ''}>⚽ Penalty</option>
                    <option value="ownGoal" ${typeVal === 'ownGoal' ? 'selected' : ''}>🔴 Own Goal</option>
                </select>
                <div style="display:flex;gap:4px;align-items:center;">
                    <select id="scGoalAssist${i}" onchange="scUpdateGoalEntry(${i})" style="flex:1;">
                        <option value="">— No Assist —</option>
                        ${assistOpts}
                    </select>
                    <button class="sc-remove-goal-btn" onclick="scRemoveGoalEntry(${i})">×</button>
                </div>
            </div>`;
    }).join('');

    let penHtml = '';
    if (homeScore === awayScore && match.homeId && match.awayId) {
        penHtml = `
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--sc-border);">
                <div style="font-size:12px;font-weight:700;color:var(--sc-gold);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Penalty Shootout (if tied)</div>
                <div class="sc-score-input-row">
                    <div class="sc-score-input-item">
                        <label>${homeName} Pens</label>
                        <input type="number" id="scHomePen" value="${match.homePen ?? ''}" min="0" placeholder="0">
                    </div>
                    <div class="sc-score-input-item">
                        <label>${awayName} Pens</label>
                        <input type="number" id="scAwayPen" value="${match.awayPen ?? ''}" min="0" placeholder="0">
                    </div>
                </div>
            </div>`;
    }

    document.getElementById("scScoreModalBody").innerHTML = `
        <div class="sc-score-input-row">
            <div class="sc-score-input-item">
                <label>${homeName}</label>
                <input type="number" id="scHomeScore" value="${homeScore}" min="0">
            </div>
            <div class="sc-score-input-item">
                <label>${awayName}</label>
                <input type="number" id="scAwayScore" value="${awayScore}" min="0">
            </div>
        </div>
        <div class="sc-goal-entry-form">
            <div class="sc-goal-entry-form-header">Goal Scorers & Assists</div>
            <div id="scGoalRowsContainer">${goalRowsHtml}</div>
            <button class="sc-add-goal-btn" onclick="scAddGoalEntry()">+ Add Goal</button>
        </div>
        ${penHtml}
        <button class="sc-primary-btn" style="margin-top:16px;" onclick="scSaveScore()">💾 Save Score</button>
    `;
}

function scAddGoalEntry() {
    scGoalEntries.push({ playerId: '', teamId: '', type: 'goal', scoringType: 'regular', assistId: '' });
    let match = scFindMatchById(scEditingMatchId);
    scRenderScoreModalBody(match);
}

function scRemoveGoalEntry(index) {
    scGoalEntries.splice(index, 1);
    let match = scFindMatchById(scEditingMatchId);
    scRenderScoreModalBody(match);
}

function scUpdateGoalEntry(index) {
    let entry = scGoalEntries[index];
    let scorerSelect = document.getElementById(`scGoalScorer${index}`);
    let typeSelect = document.getElementById(`scGoalType${index}`);
    let assistSelect = document.getElementById(`scGoalAssist${index}`);

    entry.playerId = scorerSelect.value;
    entry.assistId = assistSelect.value;

    let p = scPlayers.find(x => x.id === entry.playerId);
    entry.teamId = p ? p.teamId : '';
    entry.playerName = p ? p.name : '';

    let typeVal = typeSelect.value;
    if (typeVal === 'penalty') { entry.type = 'goal'; entry.scoringType = 'penalty'; }
    else { entry.type = typeVal; entry.scoringType = 'regular'; }
}

function scCloseScoreModal() {
    document.getElementById("scScoreModal").classList.remove("active");
    scEditingMatchId = null;
}

function scSaveScore() {
    if (!scEditingMatchId || !scIsAdmin) return;
    let match = scFindMatchById(scEditingMatchId);
    if (!match) return;

    match.homeScore = parseInt(document.getElementById("scHomeScore").value) || 0;
    match.awayScore = parseInt(document.getElementById("scAwayScore").value) || 0;

    let homePenInput = document.getElementById("scHomePen");
    let awayPenInput = document.getElementById("scAwayPen");
    match.homePen = homePenInput ? (parseInt(homePenInput.value) || null) : null;
    match.awayPen = awayPenInput ? (parseInt(awayPenInput.value) || null) : null;

    match.events = [];
    scGoalEntries.forEach(entry => {
        if (!entry.playerId) return;
        let p = scPlayers.find(x => x.id === entry.playerId);
        let playerName = p ? p.name : (entry.playerName || 'Unknown');
        let teamId = p ? p.teamId : entry.teamId;

        match.events.push({
            playerId: entry.playerId,
            playerName: playerName,
            teamId: teamId,
            type: entry.type,
            scoringType: entry.scoringType || 'regular'
        });

        if (entry.assistId) {
            let assister = scPlayers.find(x => x.id === entry.assistId);
            match.events.push({
                playerId: entry.assistId,
                playerName: assister ? assister.name : 'Unknown',
                teamId: assister ? assister.teamId : '',
                type: 'assist',
                scoringType: 'regular'
            });
        }
    });

    scProcessMatchResult(match);
    scSaveData();
    scCloseScoreModal();
    scCloseLegModal();
    scRenderAll();
}

// --- STATS ---
function scRenderStats() {
    let goalMap = {};
    let assistMap = {};

    scGetAllMatches().forEach(m => {
        if (!m.events) return;
        m.events.forEach(e => {
            if (e.type === 'goal') {
                if (!goalMap[e.playerId]) goalMap[e.playerId] = { count: 0, name: e.playerName, teamId: e.teamId };
                goalMap[e.playerId].count++;
            }
            if (e.type === 'assist') {
                if (!assistMap[e.playerId]) assistMap[e.playerId] = { count: 0, name: e.playerName, teamId: e.teamId };
                assistMap[e.playerId].count++;
            }
        });
    });

    let scorers = Object.entries(goalMap).map(([id, data]) => {
        let p = scPlayers.find(x => x.id === id);
        let team = scTeams.find(t => t.id === (p ? p.teamId : data.teamId));
        return { id, name: p ? p.name : data.name, teamName: team ? team.name : '', goals: data.count };
    }).sort((a, b) => b.goals - a.goals);

    let assisters = Object.entries(assistMap).map(([id, data]) => {
        let p = scPlayers.find(x => x.id === id);
        let team = scTeams.find(t => t.id === (p ? p.teamId : data.teamId));
        return { id, name: p ? p.name : data.name, teamName: team ? team.name : '', assists: data.count };
    }).sort((a, b) => b.assists - a.assists);

    let scorersHtml = scorers.length === 0
        ? '<div class="sc-empty">No goals scored yet.</div>'
        : scorers.map((s, i) => `
            <div class="sc-stat-row ${i === 0 ? 'top' : ''}">
                <div><div class="sc-stat-name">${s.name}</div><div class="sc-stat-team">${s.teamName}</div></div>
                <div class="sc-stat-val">${s.goals}</div>
            </div>`).join('');

    let assistersHtml = assisters.length === 0
        ? '<div class="sc-empty">No assists recorded yet.</div>'
        : assisters.map((a, i) => `
            <div class="sc-stat-row ${i === 0 ? 'top' : ''}">
                <div><div class="sc-stat-name">${a.name}</div><div class="sc-stat-team">${a.teamName}</div></div>
                <div class="sc-stat-val">${a.assists}</div>
            </div>`).join('');

    let scEl = document.getElementById("scTopScorers");
    let saEl = document.getElementById("scTopAssists");
    if (scEl) scEl.innerHTML = scorersHtml;
    if (saEl) saEl.innerHTML = assistersHtml;
}

// --- NEWS ---
function scOpenNewsPostModal() {
    document.getElementById("scNewsHeadline").value = "";
    document.getElementById("scNewsBody").value = "";
    document.getElementById("scNewsPostModal").classList.add("active");
}

function scCloseNewsPostModal() {
    document.getElementById("scNewsPostModal").classList.remove("active");
}

function scPublishNews() {
    if (!scIsAdmin) return;
    let headline = document.getElementById("scNewsHeadline").value.trim();
    let body = document.getElementById("scNewsBody").value.trim();
    if (!headline || !body) return alert("Please fill in both headline and body.");
    scNews.unshift({
        id: "scn" + Date.now(),
        headline, body,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    });
    scSaveData();
    scCloseNewsPostModal();
    scRenderNews();
}

function scDeleteNews(id) {
    if (!scIsAdmin || !confirm("Delete this news post?")) return;
    scNews = scNews.filter(n => n.id !== id);
    scSaveData();
    scRenderNews();
}

function scOpenNewsDetail(id) {
    let item = scNews.find(n => n.id === id);
    if (!item) return;
    document.getElementById("scNewsDetailBody").innerHTML = `
        <div class="sc-news-detail-headline">${item.headline}</div>
        <div class="sc-news-detail-body">${item.body.replace(/\n/g, '<br>')}</div>
        <div class="sc-news-detail-date">🗓️ ${item.date}</div>
    `;
    document.getElementById("scNewsDetailModal").classList.add("active");
}

function scCloseNewsDetail() {
    document.getElementById("scNewsDetailModal").classList.remove("active");
}

function scRenderNews() {
    let container = document.getElementById("scNewsContainer");
    if (!container) return;
    if (scNews.length === 0) {
        container.innerHTML = '<div class="sc-empty">No news posts yet.</div>';
        return;
    }
    container.innerHTML = scNews.map(n => `
        <div class="sc-news-card" onclick="scOpenNewsDetail('${n.id}')">
            ${scIsAdmin ? `<button class="sc-news-delete" onclick="event.stopPropagation();scDeleteNews('${n.id}')">×</button>` : ''}
            <div class="sc-news-headline">${n.headline}</div>
            <div class="sc-news-date">🗓️ ${n.date}</div>
        </div>`).join('');
}

// --- SQUAD POPUP ---
function scOpenSquadPopup(teamId) {
    let team = scTeams.find(t => t.id === teamId);
    if (!team) return;
    document.getElementById("scSquadPopupTitle").innerText = team.name + " Squad";
    let teamPlayers = scPlayers.filter(p => p.teamId === teamId);
    let list = document.getElementById("scSquadPopupList");
    if (!list) return;

    if (teamPlayers.length === 0) {
        list.innerHTML = '<div class="sc-empty">No players registered.</div>';
    } else {
        list.innerHTML = teamPlayers.map(p => {
            let goals = 0, assists = 0;
            scGetAllMatches().forEach(m => {
                if (!m.events) return;
                m.events.forEach(e => {
                    if (e.playerId === p.id) {
                        if (e.type === 'goal') goals++;
                        if (e.type === 'assist') assists++;
                    }
                });
            });
            return `<li><span>👤 ${p.name}</span><span class="sc-player-stats">${goals}G / ${assists}A</span></li>`;
        }).join('');
    }
    document.getElementById("scSquadPopupModal").classList.add("active");
}

function scCloseSquadPopup() {
    document.getElementById("scSquadPopupModal").classList.remove("active");
}

// --- RENDER ALL ---
function scRenderAll() {
    scUpdateAdminUI();
    scRenderBracket();
    scRenderStats();
    scRenderNews();
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
