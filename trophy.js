// ===================================================================
// COMMUNITY TROPHY — trophy.js
// 2 groups of 3 teams (double round-robin, each team plays each other
// twice) → group winner faces the OTHER group's runner-up in the semis
// → single-match final. No replays — draws in the knockout stage are
// settled on penalties.
// ===================================================================

const tcFirebaseConfig = {
    apiKey: "AIzaSyDS9quu-rckjxBMW-vuhx1NFPHeZmfs-3E",
    authDomain: "super-league-3fc14.firebaseapp.com",
    projectId: "super-league-3fc14",
    storageBucket: "super-league-3fc14.firebasestorage.app",
    messagingSenderId: "108539201153",
    appId: "1:108539201153:web:a35388bd2386fcb9a2ccb0",
    measurementId: "G-00SSJ5W0VH",
    databaseURL: "https://super-league-3fc14-default-rtdb.firebaseio.com"
};

const tcEmptyKnockout = () => ({ editionId: null, semi1: null, semi2: null, final: null, champion: null });
let tcDb = null;
let tcTeams = [];
let tcPlayers = [];
let tcGroupMatches = [];
let tcKnockout = tcEmptyKnockout();
let tcNews = [];
let tcIsAdmin = false;
let tcActiveView = 'groups';
let tcEditingMatchId = null;
let tcGoalEntries = [];
let tcCelebrationClicks = {};

function tcEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function tcInitFirebase() {
    firebase.initializeApp(tcFirebaseConfig);
    tcDb = firebase.database();
    tcDb.ref('trophyCupData').on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            tcTeams = Array.isArray(data.teams) ? data.teams : Object.values(data.teams || {});
            tcPlayers = Array.isArray(data.players) ? data.players : Object.values(data.players || {});
            tcGroupMatches = Array.isArray(data.groupMatches) ? data.groupMatches : Object.values(data.groupMatches || {});
            tcKnockout = data.knockout || tcEmptyKnockout();
            tcNews = Array.isArray(data.news) ? data.news : Object.values(data.news || {});
            tcCelebrationClicks = data.celebrationClicks || {};
        }
        tcRenderAll();
    });
}

function tcSaveData() {
    if (!tcDb) return;
    tcDb.ref('trophyCupData').set({ teams: tcTeams, players: tcPlayers, groupMatches: tcGroupMatches, knockout: tcKnockout, news: tcNews, celebrationClicks: tcCelebrationClicks });
}

function tcHandleAuth() {
    if (tcIsAdmin) {
        tcIsAdmin = false;
        document.getElementById('tcAdminToggle').innerText = '🔐 Admin';
        document.getElementById('tcAdminToggle').classList.remove('logged-in');
        tcRenderAll();
        return;
    }
    document.getElementById('tcPasswordInput').value = '';
    document.getElementById('tcAuthModal').classList.add('active');
}
function tcCloseAuthModal() { document.getElementById('tcAuthModal').classList.remove('active'); }
function tcValidateAdmin() {
    if (document.getElementById('tcPasswordInput').value !== 'Windhoek') {
        alert('Incorrect password.');
        return;
    }
    tcIsAdmin = true;
    document.getElementById('tcAdminToggle').innerText = '🔓 Logout';
    document.getElementById('tcAdminToggle').classList.add('logged-in');
    tcCloseAuthModal();
    tcRenderAll();
}

function tcSwitchView(view) {
    tcActiveView = view;
    document.querySelectorAll('.tc-view').forEach(element => element.classList.remove('active'));
    document.querySelectorAll('.tc-nav-btn').forEach(element => element.classList.remove('active'));
    document.getElementById(`tcView${view.charAt(0).toUpperCase()}${view.slice(1)}`)?.classList.add('active');
    document.getElementById(`tcNav${view.charAt(0).toUpperCase()}${view.slice(1)}`)?.classList.add('active');
    tcRenderAll();
}

function tcUpdateAdminUI() {
    const fixturesExist = tcGroupMatches.length > 0;
    const manage = document.getElementById('tcManageSquadsBtn');
    const generate = document.getElementById('tcGenFixturesBtn');
    const postNews = document.getElementById('tcPostNewsBtn');
    const reset = document.getElementById('tcResetBtn');
    if (manage) manage.style.display = tcIsAdmin ? 'inline-flex' : 'none';
    if (generate) generate.style.display = tcIsAdmin && !fixturesExist ? 'inline-flex' : 'none';
    if (postNews) postNews.style.display = tcIsAdmin ? 'inline-flex' : 'none';
    if (reset) reset.style.display = tcIsAdmin && fixturesExist ? 'inline-flex' : 'none';
}

// --- SQUADS (teams carry a `group` field: 'A' | 'B' | null) ---
function tcOpenSquadModal() {
    tcRenderTeamList();
    tcRenderPlayerList();
    tcRenderTeamSelect();
    document.getElementById('tcSquadModal').classList.add('active');
}
function tcCloseSquadModal() { document.getElementById('tcSquadModal').classList.remove('active'); }

function tcAddTeam() {
    const input = document.getElementById('tcNewTeamName');
    if (!input.value.trim()) return;
    if (tcGroupMatches.length) return alert('Reset the tournament before adding teams.');
    tcTeams.push({ id: `tct${Date.now()}`, name: input.value.trim(), group: null });
    input.value = '';
    tcSaveData();
    tcRenderTeamList();
    tcRenderTeamSelect();
}
function tcDeleteTeam(id) {
    if (!confirm('Delete this team and its players?')) return;
    if (tcGroupMatches.length) return alert('Reset the tournament before deleting teams.');
    tcTeams = tcTeams.filter(team => team.id !== id);
    tcPlayers = tcPlayers.filter(player => player.teamId !== id);
    tcSaveData();
    tcRenderTeamList();
    tcRenderPlayerList();
    tcRenderTeamSelect();
}
function tcSetTeamGroup(id, group) {
    if (tcGroupMatches.length) return alert('Reset the tournament before changing groups.');
    const team = tcTeams.find(item => item.id === id);
    if (!team) return;
    team.group = group || null;
    tcSaveData();
    tcRenderTeamList();
}
function tcRenderTeamList() {
    const list = document.getElementById('tcTeamList');
    if (!list) return;
    const countA = tcTeams.filter(t => t.group === 'A').length;
    const countB = tcTeams.filter(t => t.group === 'B').length;
    const summary = `<div class="tc-group-count-summary">Group A: <strong>${countA}/3</strong> &nbsp;·&nbsp; Group B: <strong>${countB}/3</strong></div>`;
    const rows = tcTeams.length
        ? tcTeams.map(team => `<div class="tc-team-list-item">
            <span>🛡️ ${tcEscape(team.name)}</span>
            <select class="tc-group-select" onchange="tcSetTeamGroup('${tcEscape(team.id)}', this.value)">
                <option value="" ${!team.group ? 'selected' : ''}>Unassigned</option>
                <option value="A" ${team.group === 'A' ? 'selected' : ''}>Group A</option>
                <option value="B" ${team.group === 'B' ? 'selected' : ''}>Group B</option>
            </select>
            <button class="tc-item-delete" onclick="tcDeleteTeam('${tcEscape(team.id)}')">×</button>
        </div>`).join('')
        : '<div class="tc-empty">No teams added yet.</div>';
    list.innerHTML = summary + rows;
}
function tcAddPlayer() {
    const nameInput = document.getElementById('tcNewPlayerName');
    const teamSelect = document.getElementById('tcNewPlayerTeam');
    if (!nameInput.value.trim()) return;
    if (!teamSelect.value) return alert('Add a team first.');
    tcPlayers.push({ id: `tcp${Date.now()}`, name: nameInput.value.trim(), teamId: teamSelect.value });
    nameInput.value = '';
    tcSaveData();
    tcRenderPlayerList();
}
function tcDeletePlayer(id) {
    if (!confirm('Delete this player?')) return;
    tcPlayers = tcPlayers.filter(player => player.id !== id);
    tcSaveData();
    tcRenderPlayerList();
}
function tcRenderPlayerList() {
    const list = document.getElementById('tcPlayerList');
    if (!list) return;
    list.innerHTML = tcPlayers.length
        ? tcPlayers.map(player => {
            const team = tcTeams.find(item => item.id === player.teamId);
            return `<div class="tc-player-list-item"><span>👤 ${tcEscape(player.name)} <span class="tc-inline-muted">(${tcEscape(team?.name || 'No team')})</span></span><button class="tc-item-delete" onclick="tcDeletePlayer('${tcEscape(player.id)}')">×</button></div>`;
        }).join('')
        : '<div class="tc-empty">No players registered yet.</div>';
}
function tcRenderTeamSelect() {
    const select = document.getElementById('tcNewPlayerTeam');
    if (!select) return;
    select.innerHTML = tcTeams.length
        ? `<option value="">Select team</option>${tcTeams.map(team => `<option value="${tcEscape(team.id)}">${tcEscape(team.name)}</option>`).join('')}`
        : '<option value="">Add a team first</option>';
}

// --- MATCH MODEL (flat — no legs/aggregates; group matches and knockout
// matches share the exact same shape, so scoring/stats code is reused for both) ---
function tcMakeMatch(id, group, homeId, awayId, label) {
    return { id, group, label, homeId, awayId, homeScore: null, awayScore: null, homePen: null, awayPen: null, events: [], completed: false, winnerId: null };
}

function tcGenerateGroupFixtures() {
    const groupA = tcTeams.filter(team => team.group === 'A');
    const groupB = tcTeams.filter(team => team.group === 'B');
    if (groupA.length !== 3 || groupB.length !== 3) {
        return alert(`Each group needs exactly 3 teams before generating fixtures. Right now: Group A has ${groupA.length}, Group B has ${groupB.length}.`);
    }
    if (tcGroupMatches.length && !confirm('Fixtures already exist. Generate again? This replaces all group matches, semis, and the final.')) return;
    const base = Date.now();
    const pairs = [[0, 1], [1, 2], [0, 2]];
    const buildGroup = (groupLabel, groupTeams) => {
        const matches = [];
        pairs.forEach(([i, j], index) => {
            matches.push(tcMakeMatch(`tcg-${base}-${groupLabel}-${index}`, groupLabel, groupTeams[i].id, groupTeams[j].id, `Group ${groupLabel} · Matchday ${index + 1}`));
        });
        pairs.forEach(([i, j], index) => {
            matches.push(tcMakeMatch(`tcg-${base}-${groupLabel}-${index + 3}`, groupLabel, groupTeams[j].id, groupTeams[i].id, `Group ${groupLabel} · Matchday ${index + 4}`));
        });
        return matches;
    };
    tcGroupMatches = [...buildGroup('A', groupA), ...buildGroup('B', groupB)];
    tcKnockout = tcEmptyKnockout();
    tcSaveData();
    tcRenderAll();
    alert('Group fixtures generated — 6 matches per group, each team plays every other team in its group twice.');
}

function tcResetTournament() {
    if (!confirm('Reset the whole tournament? All group matches, semis, the final, and the champion will be wiped. Teams and players stay, but their group assignments are cleared.')) return;
    tcGroupMatches = [];
    tcKnockout = tcEmptyKnockout();
    tcTeams.forEach(team => { team.group = null; });
    tcSaveData();
    tcRenderAll();
}

function tcGroupStandings(group) {
    const groupTeams = tcTeams.filter(team => team.group === group).map(team => ({ ...team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
    tcGroupMatches.filter(match => match.group === group && match.completed).forEach(match => {
        const home = groupTeams.find(team => team.id === match.homeId);
        const away = groupTeams.find(team => team.id === match.awayId);
        if (!home || !away) return;
        home.played += 1; away.played += 1;
        home.gf += match.homeScore; home.ga += match.awayScore;
        away.gf += match.awayScore; away.ga += match.homeScore;
        if (match.homeScore > match.awayScore) { home.won += 1; home.pts += 3; away.lost += 1; }
        else if (match.homeScore < match.awayScore) { away.won += 1; away.pts += 3; home.lost += 1; }
        else { home.drawn += 1; home.pts += 1; away.drawn += 1; away.pts += 1; }
        home.gd = home.gf - home.ga; away.gd = away.gf - away.ga;
    });
    groupTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    return groupTeams;
}
function tcGroupComplete(group) {
    const matches = tcGroupMatches.filter(match => match.group === group);
    return matches.length === 6 && matches.every(match => match.completed);
}
function tcGroupHasTieAtCutoff(group) {
    // Flags when 1st/2nd (or 2nd/3rd, since either could be needed) are level on
    // points, GD and GF — the standings alone can't say who's actually 1st/2nd,
    // so the admin needs to resolve it manually before generating semis.
    const standings = tcGroupStandings(group);
    if (standings.length < 2) return false;
    const same = (a, b) => a.pts === b.pts && a.gd === b.gd && a.gf === b.gf;
    return same(standings[0], standings[1]);
}

function tcGenerateSemis() {
    if (!tcGroupComplete('A') || !tcGroupComplete('B')) return alert('Both groups need all 6 matches completed before the semi-finals can be set.');
    if (tcGroupHasTieAtCutoff('A') || tcGroupHasTieAtCutoff('B')) {
        if (!confirm('One of the groups has a tie for 1st/2nd on points, goal difference and goals scored — this needs a manual tiebreak that the system can\'t resolve on its own. Continue anyway using the current standings order?')) return;
    }
    if (tcKnockout.semi1) return alert('Semi-finals have already been generated.');
    const a = tcGroupStandings('A');
    const b = tcGroupStandings('B');
    const base = Date.now();
    tcKnockout = tcEmptyKnockout();
    tcKnockout.editionId = base;
    tcKnockout.semi1 = tcMakeMatch(`tck-${base}-s1`, null, a[0].id, b[1].id, 'Semi-Final 1 (Group A winner vs Group B runner-up)');
    tcKnockout.semi2 = tcMakeMatch(`tck-${base}-s2`, null, b[0].id, a[1].id, 'Semi-Final 2 (Group B winner vs Group A runner-up)');
    tcSaveData();
    tcRenderAll();
}
function tcGenerateFinal() {
    if (!tcKnockout.semi1?.completed || !tcKnockout.semi2?.completed) return alert('Both semi-finals need to be completed first.');
    if (tcKnockout.final) return alert('The final has already been generated.');
    tcKnockout.final = tcMakeMatch(`tck-${tcKnockout.editionId}-f`, null, tcKnockout.semi1.winnerId, tcKnockout.semi2.winnerId, 'Final');
    tcSaveData();
    tcRenderAll();
}

function tcFindMatchById(id) {
    return tcGroupMatches.find(match => match.id === id)
        || [tcKnockout.semi1, tcKnockout.semi2, tcKnockout.final].find(match => match?.id === id)
        || null;
}
function tcIsKnockoutMatch(match) {
    return match && (match.id === tcKnockout.semi1?.id || match.id === tcKnockout.semi2?.id || match.id === tcKnockout.final?.id);
}

// --- RENDER: GROUPS + KNOCKOUT OVERVIEW ---
function tcRenderGroupTable(group) {
    const standings = tcGroupStandings(group);
    const rows = standings.map((team, index) => `<tr class="${index === 0 ? 'tc-group-first' : index === 1 ? 'tc-group-second' : ''}">
        <td>${index + 1}</td>
        <td><strong>${tcEscape(team.name)}</strong></td>
        <td class="tc-col-center">${team.played}</td>
        <td class="tc-col-center">${team.won}</td>
        <td class="tc-col-center">${team.drawn}</td>
        <td class="tc-col-center">${team.lost}</td>
        <td class="tc-col-center">${team.gf}</td>
        <td class="tc-col-center">${team.ga}</td>
        <td class="tc-col-center">${team.gd}</td>
        <td class="tc-col-center tc-col-pts">${team.pts}</td>
    </tr>`).join('');
    return `<div class="tc-group-card">
        <div class="tc-group-title">Group ${group}</div>
        <table class="tc-group-standings">
            <thead><tr><th>Pos</th><th>Team</th><th class="tc-col-center">P</th><th class="tc-col-center">W</th><th class="tc-col-center">D</th><th class="tc-col-center">L</th><th class="tc-col-center">GF</th><th class="tc-col-center">GA</th><th class="tc-col-center">GD</th><th class="tc-col-center">Pts</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="10" class="tc-empty-cell">No teams assigned to Group ${group} yet.</td></tr>`}</tbody>
        </table>
        <div class="tc-group-legend"><span class="tc-legend-dot first"></span> Group winner &nbsp; <span class="tc-legend-dot second"></span> Runner-up</div>
    </div>`;
}
function tcRenderGroupFixtures(group) {
    const matches = tcGroupMatches.filter(match => match.group === group);
    if (!matches.length) return '';
    return `<div class="tc-fixtures-list">${matches.map(match => tcRenderMatchCard(match)).join('')}</div>`;
}
function tcRenderKnockoutCard(match, placeholder) {
    if (!match) return `<div class="tc-match-card tc-match-placeholder"><div class="tc-placeholder-text">${tcEscape(placeholder)}</div></div>`;
    return tcRenderMatchCard(match);
}
function tcRenderMatchCard(match) {
    const home = tcTeams.find(team => team.id === match.homeId)?.name || 'TBD';
    const away = tcTeams.find(team => team.id === match.awayId)?.name || 'TBD';
    const homeScore = match.homeScore === null ? '-' : match.homeScore;
    const awayScore = match.awayScore === null ? '-' : match.awayScore;
    const penText = (match.homeScore === match.awayScore && match.homePen !== null) ? `<div class="tc-pen-tag">Pens: ${match.homePen}–${match.awayPen}</div>` : '';
    return `<div class="tc-match-card ${match.completed ? 'completed' : ''}" onclick="tcOpenMatchModal('${tcEscape(match.id)}')">
        <div class="tc-match-label">${tcEscape(match.label)}</div>
        <div class="tc-match-teams">
            <span class="${match.completed && match.winnerId === match.homeId ? 'tc-winner' : ''}">${tcEscape(home)}</span>
            <strong class="tc-match-score">${homeScore}–${awayScore}</strong>
            <span class="${match.completed && match.winnerId === match.awayId ? 'tc-winner' : ''}">${tcEscape(away)}</span>
        </div>
        ${penText}
        <div class="tc-match-hint">Click for match details</div>
    </div>`;
}

function tcRenderGroupsAndKnockout() {
    const container = document.getElementById('tcOverviewContainer');
    if (!container) return;
    if (!tcGroupMatches.length) {
        container.innerHTML = `<div class="tc-bracket-empty"><div class="tc-bracket-empty-icon">🏆</div><div class="tc-bracket-empty-text">Groups not yet set</div><div class="tc-bracket-empty-sub">${tcIsAdmin ? 'Assign 3 teams to each group in Manage Squads, then generate the group fixtures.' : 'Check back soon for the group draw.'}</div></div>`;
        tcStopFireworks();
        tcUpdateCelebrateButton();
        return;
    }

    const champion = tcKnockout.champion ? tcTeams.find(team => team.id === tcKnockout.champion) : null;
    const championHtml = champion ? `<div class="tc-champion-card"><canvas id="tcFireworksCanvas"></canvas><div class="tc-champion-trophy">🏆</div><div class="tc-champion-label">Community Trophy Champion</div><div class="tc-champion-name">${tcEscape(champion.name)}</div></div>` : '';

    const groupsHtml = `<div class="tc-groups-grid">${tcRenderGroupTable('A')}${tcRenderGroupTable('B')}</div>`;
    const fixturesHtml = `<div class="tc-fixtures-grid">
        <div><div class="tc-fixtures-heading">Group A Fixtures</div>${tcRenderGroupFixtures('A') || '<div class="tc-empty">No fixtures yet.</div>'}</div>
        <div><div class="tc-fixtures-heading">Group B Fixtures</div>${tcRenderGroupFixtures('B') || '<div class="tc-empty">No fixtures yet.</div>'}</div>
    </div>`;

    const bothGroupsDone = tcGroupComplete('A') && tcGroupComplete('B');
    const genSemisBtn = tcIsAdmin && bothGroupsDone && !tcKnockout.semi1 ? `<button class="tc-action-btn primary" onclick="tcGenerateSemis()">🏆 Generate Semi-Finals</button>` : '';
    const genFinalBtn = tcIsAdmin && tcKnockout.semi1?.completed && tcKnockout.semi2?.completed && !tcKnockout.final ? `<button class="tc-action-btn primary" onclick="tcGenerateFinal()">🏆 Generate Final</button>` : '';
    const knockoutHtml = `<div class="tc-knockout-section">
        <div class="tc-knockout-heading">Knockout Stage</div>
        <div class="tc-knockout-actions">${genSemisBtn}${genFinalBtn}</div>
        <div class="tc-knockout-grid">
            <div class="tc-knockout-col">${tcRenderKnockoutCard(tcKnockout.semi1, 'Semi-Final 1 — winner of Group A vs runner-up of Group B')}</div>
            <div class="tc-knockout-col">${tcRenderKnockoutCard(tcKnockout.semi2, 'Semi-Final 2 — winner of Group B vs runner-up of Group A')}</div>
            <div class="tc-knockout-col tc-knockout-final">${tcRenderKnockoutCard(tcKnockout.final, 'Final')}</div>
        </div>
    </div>`;

    container.innerHTML = championHtml + groupsHtml + fixturesHtml + knockoutHtml;
    if (champion) tcStartFireworks(); else tcStopFireworks();
    tcUpdateCelebrateButton();
}

// --- MATCH DETAILS AND SCORE ENTRY (shared by group + knockout matches) ---
function tcOpenMatchModal(matchId) {
    const match = tcFindMatchById(matchId);
    if (!match) return;
    const home = tcTeams.find(team => team.id === match.homeId)?.name || 'TBD';
    const away = tcTeams.find(team => team.id === match.awayId)?.name || 'TBD';
    document.getElementById('tcMatchModalTitle').innerText = `${tcEscape(match.label)}: ${home} vs ${away}`;
    document.getElementById('tcMatchModalBody').innerHTML = tcRenderMatchDetail(match);
    document.getElementById('tcMatchModal').classList.add('active');
}
function tcRenderMatchDetail(match) {
    const home = tcTeams.find(team => team.id === match.homeId)?.name || 'TBD';
    const away = tcTeams.find(team => team.id === match.awayId)?.name || 'TBD';
    const events = match.events || [];
    const buildTeamGoals = (teamId) => {
        const lines = [];
        events.forEach((event, index) => {
            if (event.type !== 'goal' && event.type !== 'ownGoal') return;
            const belongsToThisColumn = event.type === 'ownGoal' ? event.teamId !== teamId : event.teamId === teamId;
            if (!belongsToThisColumn) return;
            const player = tcPlayers.find(item => item.id === event.playerId);
            const name = player?.name || event.playerName || 'Unknown player';
            const penMark = event.scoringType === 'penalty' ? ' <span class="tc-goal-pen-tag">(P)</span>' : '';
            const ogMark = event.type === 'ownGoal' ? ' <span class="tc-goal-og-tag">(OG)</span>' : '';
            const nextEvent = events[index + 1];
            const assistName = (event.type === 'goal' && nextEvent && nextEvent.type === 'assist')
                ? (tcPlayers.find(item => item.id === nextEvent.playerId)?.name || nextEvent.playerName || null)
                : null;
            const assistLine = assistName ? `<div class="tc-goal-assist-inline">👟 ${tcEscape(assistName)}</div>` : '';
            lines.push(`<div class="tc-goal-line">${event.type === 'ownGoal' ? '🔴' : '⚽'} <strong>${tcEscape(name)}</strong>${penMark}${ogMark}${assistLine}</div>`);
        });
        return lines;
    };
    const homeLines = buildTeamGoals(match.homeId);
    const awayLines = buildTeamGoals(match.awayId);
    const eventHtml = events.length ? `
        <div class="tc-leg-team-headers"><span>${tcEscape(home)}</span><span>${tcEscape(away)}</span></div>
        <div class="tc-leg-goals-grid">
            <div class="tc-leg-goals-col tc-leg-goals-home">${homeLines.join('') || '<span class="tc-no-events-inline">No goals</span>'}</div>
            <div class="tc-leg-goals-col tc-leg-goals-away">${awayLines.join('') || '<span class="tc-no-events-inline">No goals</span>'}</div>
        </div>` : '<div class="tc-no-events">No goal details recorded.</div>';
    const score = match.completed ? `${match.homeScore} – ${match.awayScore}` : 'Not played';
    const penLine = (match.homeScore === match.awayScore && match.homePen !== null) ? `<div class="tc-penalties">Penalties: ${match.homePen} – ${match.awayPen}</div>` : '';
    const admin = tcIsAdmin && match.homeId && match.awayId ? `<button class="tc-enter-score-link" onclick="tcOpenScoreModal('${tcEscape(match.id)}')">${match.completed ? '⚙️ Edit Score' : '✍️ Enter Score'}</button>` : '';
    return `<section class="tc-leg-detail"><div class="tc-leg-detail-header"><strong class="tc-leg-detail-score">${score}</strong></div><div class="tc-leg-detail-events">${eventHtml}</div>${penLine}${admin}</section>`;
}
function tcCloseMatchModal() { document.getElementById('tcMatchModal').classList.remove('active'); }

function tcOpenScoreModal(matchId) {
    const match = tcFindMatchById(matchId);
    if (!match) return;
    tcEditingMatchId = matchId;
    const home = tcTeams.find(team => team.id === match.homeId)?.name || 'Home';
    const away = tcTeams.find(team => team.id === match.awayId)?.name || 'Away';
    document.getElementById('tcScoreModalTitle').innerText = `${tcEscape(match.label)}: ${home} vs ${away}`;
    const goalEvents = (match.events || []).filter(event => event.type === 'goal' || event.type === 'ownGoal');
    tcGoalEntries = goalEvents.map(event => ({ playerId: event.playerId, teamId: event.teamId, playerName: event.playerName, type: event.type, scoringType: event.scoringType || 'regular', assistId: '' }));
    goalEvents.forEach((goal, index) => {
        const position = (match.events || []).indexOf(goal);
        if (match.events[position + 1]?.type === 'assist') tcGoalEntries[index].assistId = match.events[position + 1].playerId;
    });
    tcRenderScoreModalBody(match);
    document.getElementById('tcScoreModal').classList.add('active');
}
function tcRenderScoreModalBody(match) {
    const home = tcTeams.find(team => team.id === match.homeId)?.name || 'Home';
    const away = tcTeams.find(team => team.id === match.awayId)?.name || 'Away';
    const players = tcPlayers.filter(player => player.teamId === match.homeId || player.teamId === match.awayId);
    const playerOptions = (selected, excludeId = '') => players.filter(player => player.id !== excludeId).map(player => `<option value="${tcEscape(player.id)}" ${selected === player.id ? 'selected' : ''}>${tcEscape(player.name)}</option>`).join('');
    const goals = tcGoalEntries.map((entry, index) => `<div class="tc-goal-row"><select id="tcGoalScorer${index}" onchange="tcUpdateGoalEntry(${index})"><option value="">— Scorer —</option>${playerOptions(entry.playerId)}</select><select id="tcGoalType${index}" onchange="tcUpdateGoalEntry(${index})"><option value="goal" ${entry.type === 'goal' && entry.scoringType !== 'penalty' ? 'selected' : ''}>Goal</option><option value="penalty" ${entry.scoringType === 'penalty' ? 'selected' : ''}>Penalty</option><option value="ownGoal" ${entry.type === 'ownGoal' ? 'selected' : ''}>Own goal</option></select><select id="tcGoalAssist${index}" onchange="tcUpdateGoalEntry(${index})"><option value="">— Specific assist —</option>${playerOptions(entry.assistId, entry.playerId)}</select><button class="tc-remove-goal-btn" onclick="tcRemoveGoalEntry(${index})">×</button></div>`).join('');
    const isKnockout = tcIsKnockoutMatch(match);
    const penRow = isKnockout ? `<div class="tc-score-input-row"><div class="tc-score-input-item"><label>${tcEscape(home)} pens</label><input type="number" id="tcHomePen" value="${match.homePen ?? ''}" min="0"></div><div class="tc-score-input-item"><label>${tcEscape(away)} pens</label><input type="number" id="tcAwayPen" value="${match.awayPen ?? ''}" min="0"></div></div><p class="tc-pen-hint">Only needed if the score is level — this is a one-off knockout match, no replays.</p>` : '';
    document.getElementById('tcScoreModalBody').innerHTML = `<div class="tc-score-input-row"><div class="tc-score-input-item"><label>${tcEscape(home)}</label><input type="number" id="tcHomeScore" value="${match.homeScore ?? 0}" min="0"></div><div class="tc-score-input-item"><label>${tcEscape(away)}</label><input type="number" id="tcAwayScore" value="${match.awayScore ?? 0}" min="0"></div></div><div class="tc-goal-entry-form"><div class="tc-goal-entry-form-header">Goal scorers and specific assists</div><div>${goals}</div><button class="tc-add-goal-btn" onclick="tcAddGoalEntry()">+ Add goal</button></div>${penRow}<button class="tc-primary-btn" onclick="tcSaveScore()">💾 Save Match</button>`;
}
function tcAddGoalEntry() {
    tcGoalEntries.push({ playerId: '', teamId: '', type: 'goal', scoringType: 'regular', assistId: '' });
    tcRenderScoreModalBody(tcFindMatchById(tcEditingMatchId));
}
function tcRemoveGoalEntry(index) {
    tcGoalEntries.splice(index, 1);
    tcRenderScoreModalBody(tcFindMatchById(tcEditingMatchId));
}
function tcUpdateGoalEntry(index) {
    const entry = tcGoalEntries[index];
    const scorer = document.getElementById(`tcGoalScorer${index}`);
    const type = document.getElementById(`tcGoalType${index}`);
    const assist = document.getElementById(`tcGoalAssist${index}`);
    entry.playerId = scorer.value;
    entry.assistId = assist.value;
    const player = tcPlayers.find(item => item.id === entry.playerId);
    entry.teamId = player?.teamId || '';
    entry.playerName = player?.name || '';
    entry.type = type.value === 'penalty' ? 'goal' : type.value;
    entry.scoringType = type.value === 'penalty' ? 'penalty' : 'regular';
}
function tcCloseScoreModal() { document.getElementById('tcScoreModal').classList.remove('active'); tcEditingMatchId = null; }

function tcSaveScore() {
    if (!tcEditingMatchId || !tcIsAdmin) return;
    const match = tcFindMatchById(tcEditingMatchId);
    if (!match) return;
    match.homeScore = Math.max(0, parseInt(document.getElementById('tcHomeScore').value, 10) || 0);
    match.awayScore = Math.max(0, parseInt(document.getElementById('tcAwayScore').value, 10) || 0);
    const isKnockout = tcIsKnockoutMatch(match);
    if (isKnockout) {
        const homePen = parseInt(document.getElementById('tcHomePen')?.value, 10);
        const awayPen = parseInt(document.getElementById('tcAwayPen')?.value, 10);
        match.homePen = Number.isFinite(homePen) ? homePen : null;
        match.awayPen = Number.isFinite(awayPen) ? awayPen : null;
    }
    match.events = [];
    tcGoalEntries.forEach(entry => {
        if (!entry.playerId) return;
        const player = tcPlayers.find(item => item.id === entry.playerId);
        match.events.push({ playerId: entry.playerId, playerName: player?.name || entry.playerName || 'Unknown', teamId: player?.teamId || entry.teamId, type: entry.type, scoringType: entry.scoringType });
        if (entry.assistId) {
            const assister = tcPlayers.find(item => item.id === entry.assistId);
            match.events.push({ playerId: entry.assistId, playerName: assister?.name || 'Unknown', teamId: assister?.teamId || '', type: 'assist', scoringType: 'regular' });
        }
    });
    match.completed = true;
    if (isKnockout) {
        if (match.homeScore > match.awayScore) match.winnerId = match.homeId;
        else if (match.homeScore < match.awayScore) match.winnerId = match.awayId;
        else if (match.homePen !== null && match.awayPen !== null && match.homePen !== match.awayPen) match.winnerId = match.homePen > match.awayPen ? match.homeId : match.awayId;
        else { match.completed = false; match.winnerId = null; }
        if (!match.completed) {
            alert('Scores are level — enter penalty totals to decide the winner (no replays in this competition).');
            tcSaveData();
            tcCloseScoreModal();
            tcRenderAll();
            return;
        }
        if (match.id === tcKnockout.final?.id) tcKnockout.champion = match.winnerId;
    }
    tcSaveData();
    tcCloseScoreModal();
    tcOpenMatchModal(match.id);
    tcRenderAll();
}

// --- STATS ---
function tcGetAllMatches() { return [...tcGroupMatches, tcKnockout.semi1, tcKnockout.semi2, tcKnockout.final].filter(Boolean); }
function tcRenderStats() {
    const goals = {};
    const assists = {};
    const ownGoals = {};
    tcGetAllMatches().forEach(match => (match.events || []).forEach(event => {
        const target = event.type === 'assist' ? assists : event.type === 'goal' ? goals : event.type === 'ownGoal' ? ownGoals : null;
        if (!target) return;
        target[event.playerId] = target[event.playerId] || { count: 0, name: event.playerName, teamId: event.teamId };
        target[event.playerId].count += 1;
    }));
    const render = (source, suffix, fill) => {
        const rows = Object.entries(source).map(([id, data]) => ({ ...data, id, team: tcTeams.find(team => team.id === data.teamId)?.name || '' })).sort((a, b) => b.count - a.count);
        const max = rows[0]?.count || 1;
        return rows.length ? rows.slice(0, 10).map((row, index) => `<div class="tc-bar-row"><div class="tc-bar-label"><div class="tc-bar-name"><span class="tc-bar-rank ${index === 0 ? 'top' : ''}">${index + 1}</span>${tcEscape(row.name)} <span class="tc-bar-team">${tcEscape(row.team)}</span></div><div class="tc-bar-value">${row.count} ${suffix}</div></div><div class="tc-bar-track"><div class="tc-bar-fill ${fill}" style="width:${(row.count / max) * 100}%"></div></div></div>`).join('') : '<div class="tc-empty">No records yet.</div>';
    };
    document.getElementById('tcTopScorers').innerHTML = render(goals, 'goals', 'goals');
    document.getElementById('tcTopAssists').innerHTML = render(assists, 'assists', 'assists');
    const ownGoalsEl = document.getElementById('tcOwnGoals');
    if (ownGoalsEl) ownGoalsEl.innerHTML = render(ownGoals, 'own goals', 'own-goals');
}

// --- NEWS ---
function tcOpenNewsPostModal() { document.getElementById('tcNewsHeadline').value = ''; document.getElementById('tcNewsBody').value = ''; document.getElementById('tcNewsPostModal').classList.add('active'); }
function tcCloseNewsPostModal() { document.getElementById('tcNewsPostModal').classList.remove('active'); }
function tcPublishNews() {
    if (!tcIsAdmin) return;
    const headline = document.getElementById('tcNewsHeadline').value.trim();
    const body = document.getElementById('tcNewsBody').value.trim();
    if (!headline || !body) return alert('Please fill in both headline and body.');
    tcNews.unshift({ id: `tcn${Date.now()}`, headline, body, date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) });
    tcSaveData();
    tcCloseNewsPostModal();
    tcRenderNews();
}
function tcDeleteNews(id) { if (tcIsAdmin && confirm('Delete this news post?')) { tcNews = tcNews.filter(item => item.id !== id); tcSaveData(); tcRenderNews(); } }
function tcOpenNewsDetail(id) {
    const item = tcNews.find(news => news.id === id);
    if (!item) return;
    document.getElementById('tcNewsDetailBody').innerHTML = `<div class="tc-news-detail-headline">${tcEscape(item.headline)}</div><div class="tc-news-detail-body">${tcEscape(item.body).replace(/\n/g, '<br>')}</div><div class="tc-news-detail-date">🗓️ ${tcEscape(item.date)}</div>`;
    document.getElementById('tcNewsDetailModal').classList.add('active');
}
function tcCloseNewsDetail() { document.getElementById('tcNewsDetailModal').classList.remove('active'); }
function tcRenderNews() {
    const container = document.getElementById('tcNewsContainer');
    if (!container) return;
    container.innerHTML = tcNews.length ? tcNews.map(item => `<div class="tc-news-card" onclick="tcOpenNewsDetail('${tcEscape(item.id)}')">${tcIsAdmin ? `<button class="tc-news-delete" onclick="event.stopPropagation();tcDeleteNews('${tcEscape(item.id)}')">×</button>` : ''}<div class="tc-news-headline">${tcEscape(item.headline)}</div><div class="tc-news-date">🗓️ ${tcEscape(item.date)}</div></div>`).join('') : '<div class="tc-empty">No news posts yet.</div>';
}

// --- SQUAD POPUP (used from Manage Squads → view a team's roster with stats) ---
function tcOpenSquadPopup(teamId) {
    const team = tcTeams.find(item => item.id === teamId);
    if (!team) return;
    const list = document.getElementById('tcSquadPopupList');
    document.getElementById('tcSquadPopupTitle').innerText = `${team.name} Squad`;
    const players = tcPlayers.filter(player => player.teamId === teamId);
    list.innerHTML = players.length ? players.map(player => {
        let goals = 0;
        let assists = 0;
        let ownGoals = 0;
        tcGetAllMatches().forEach(match => (match.events || []).forEach(event => {
            if (event.playerId !== player.id) return;
            if (event.type === 'goal') goals += 1;
            else if (event.type === 'assist') assists += 1;
            else if (event.type === 'ownGoal') ownGoals += 1;
        }));
        const statsText = `${goals}G / ${assists}A${ownGoals ? ` / ${ownGoals}OG` : ''}`;
        return `<li><span>👤 ${tcEscape(player.name)}</span><span class="tc-player-stats">${statsText}</span></li>`;
    }).join('') : '<div class="tc-empty">No players registered.</div>';
    document.getElementById('tcSquadPopupModal').classList.add('active');
}
function tcCloseSquadPopup() { document.getElementById('tcSquadPopupModal').classList.remove('active'); }

// --- CELEBRATION: CHAMPION FIREWORKS + FLOATING BUTTON ---
function tcGetChampionTeam() {
    return tcKnockout.champion ? tcTeams.find(team => team.id === tcKnockout.champion) : null;
}
function tcCelebrationKey(teamId) {
    // Scoped to this specific tournament edition so a team that wins a later,
    // separate edition starts its celebration count fresh.
    return `${tcKnockout.editionId || 'default'}:${teamId}`;
}
function tcHasCelebrated(teamId) {
    try { return localStorage.getItem('tcCelebrated:' + tcCelebrationKey(teamId)) === '1'; }
    catch (e) { return false; }
}
function tcMarkCelebrated(teamId) {
    try { localStorage.setItem('tcCelebrated:' + tcCelebrationKey(teamId), '1'); } catch (e) {}
}
function tcUpdateCelebrateButton() {
    const btn = document.getElementById('tcCelebrateFloatingBtn');
    if (!btn) return;
    const champion = tcGetChampionTeam();
    if (champion) {
        document.getElementById('tcCelebrateChampionLabel').innerText = champion.name;
        const count = tcCelebrationClicks[tcCelebrationKey(champion.id)] || 0;
        document.getElementById('tcCelebrateCountLabel').innerText = count.toLocaleString();
        btn.classList.toggle('already-celebrated', tcHasCelebrated(champion.id));
        btn.style.display = 'flex';
    } else {
        btn.style.display = 'none';
    }
}

let tcFireworksAnimationId = null;
let tcFireworksParticles = [];
let tcFireworksLastBurst = 0;
function tcResizeFireworksCanvas() {
    const canvas = document.getElementById('tcFireworksCanvas');
    const card = document.querySelector('.tc-champion-card');
    if (!canvas || !card) return;
    canvas.width = card.clientWidth;
    canvas.height = card.clientHeight;
}
function tcSpawnFireworkBurst(cx, cy) {
    const colors = ['#eab308', '#22d3ee', '#34d399', '#fb923c', '#ffffff', '#ef4444'];
    const count = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 2 + Math.random() * 3;
        tcFireworksParticles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: colors[Math.floor(Math.random() * colors.length)], size: 1.5 + Math.random() * 1.5 });
    }
}
function tcFireworksLoop(ts) {
    const card = document.querySelector('.tc-champion-card');
    const canvas = document.getElementById('tcFireworksCanvas');
    if (!canvas || !card) { tcFireworksAnimationId = null; return; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!tcFireworksLastBurst || ts - tcFireworksLastBurst > 900) {
        tcFireworksLastBurst = ts;
        const cx = canvas.width * (0.15 + Math.random() * 0.7);
        const cy = canvas.height * (0.15 + Math.random() * 0.4);
        tcSpawnFireworkBurst(cx, cy);
    }
    tcFireworksParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.alpha -= 0.012; });
    tcFireworksParticles = tcFireworksParticles.filter(p => p.alpha > 0);
    tcFireworksParticles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    tcFireworksAnimationId = requestAnimationFrame(tcFireworksLoop);
}
function tcStartFireworks() {
    tcResizeFireworksCanvas();
    if (tcFireworksAnimationId) return;
    tcFireworksLastBurst = 0;
    tcFireworksAnimationId = requestAnimationFrame(tcFireworksLoop);
}
function tcStopFireworks() {
    if (tcFireworksAnimationId) { cancelAnimationFrame(tcFireworksAnimationId); tcFireworksAnimationId = null; }
    tcFireworksParticles = [];
}
window.addEventListener('resize', () => { if (tcFireworksAnimationId) tcResizeFireworksCanvas(); });

let tcCelebrationBurstAnimId = null;
let tcCelebrationBurstParticles = [];
let tcCelebrationBurstEndsAt = 0;
function tcResizeCelebrationCanvas() {
    const canvas = document.getElementById('tcCelebrationBurstCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', tcResizeCelebrationCanvas);
function tcSpawnCelebrationBurst(cx, cy) {
    const colors = ['#eab308', '#22d3ee', '#34d399', '#fb923c', '#ffffff', '#ef4444'];
    const count = 55 + Math.floor(Math.random() * 25);
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 3 + Math.random() * 4;
        tcCelebrationBurstParticles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: colors[Math.floor(Math.random() * colors.length)], size: 2 + Math.random() * 2 });
    }
}
function tcCelebrationBurstLoop(ts) {
    const canvas = document.getElementById('tcCelebrationBurstCanvas');
    if (!canvas) { tcCelebrationBurstAnimId = null; return; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tcCelebrationBurstParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.alpha -= 0.011; });
    tcCelebrationBurstParticles = tcCelebrationBurstParticles.filter(p => p.alpha > 0);
    tcCelebrationBurstParticles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (tcCelebrationBurstParticles.length > 0 || ts < tcCelebrationBurstEndsAt) {
        tcCelebrationBurstAnimId = requestAnimationFrame(tcCelebrationBurstLoop);
    } else {
        tcCelebrationBurstAnimId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}
function tcTriggerCelebrationFireworks() {
    tcResizeCelebrationCanvas();
    const canvas = document.getElementById('tcCelebrationBurstCanvas');
    tcCelebrationBurstEndsAt = performance.now() + 1500;
    const bursts = 4;
    for (let i = 0; i < bursts; i += 1) {
        setTimeout(() => {
            const cx = canvas.width * (0.2 + Math.random() * 0.6);
            const cy = canvas.height * (0.15 + Math.random() * 0.4);
            tcSpawnCelebrationBurst(cx, cy);
        }, i * 220);
    }
    if (!tcCelebrationBurstAnimId) tcCelebrationBurstAnimId = requestAnimationFrame(tcCelebrationBurstLoop);
}
function tcHandleCelebrateClick() {
    const champion = tcGetChampionTeam();
    if (!champion) return;
    tcTriggerCelebrationFireworks();
    const btn = document.getElementById('tcCelebrateFloatingBtn');
    btn.classList.add('celebrate-pulse');
    setTimeout(() => btn.classList.remove('celebrate-pulse'), 400);
    if (tcHasCelebrated(champion.id)) return;
    tcMarkCelebrated(champion.id);
    const key = tcCelebrationKey(champion.id);
    tcCelebrationClicks[key] = (tcCelebrationClicks[key] || 0) + 1;
    tcUpdateCelebrateButton();
    if (tcDb) {
        tcDb.ref('trophyCupData/celebrationClicks/' + key).transaction(current => (current || 0) + 1);
    }
}

function tcRenderAll() {
    tcUpdateAdminUI();
    tcRenderGroupsAndKnockout();
    tcRenderStats();
    tcRenderNews();
}

function tcWaitForFirebase() {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) tcInitFirebase();
    else setTimeout(tcWaitForFirebase, 50);
}
tcWaitForFirebase();
