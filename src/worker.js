// ═══════════════════════════════════════════════════════════════
// Cloudflare Worker — Football API Proxy & Data Formatter
// ═══════════════════════════════════════════════════════════════

// 1. خريطة تحويل الأرقام إلى رموز ESPN
const LEAGUE_MAP = {
  '3945': 'swe.1',   // الدوري السويدي Allsvenskan
  '39': 'eng.1',     // الدوري الإنجليزي الممتاز
  '140': 'esp.1',    // الدوري الإسباني
  '135': 'ita.1',    // الدوري الإيطالي
  '78': 'ger.1',     // الدوري الألماني
  '61': 'fra.1',     // الدوري الفرنسي
  '307': 'ksa.1',    // الدوري السعودي
  '2': 'uefa.champions', // دوري أبطال أوروبا
};

// دالة مساعدة لتحويل كود الدوري إذا كان رقماً
function normalizeLeagueCode(league) {
  if (!league) return 'eng.1';
  const cleanLeague = String(league).trim().toLowerCase();
  return LEAGUE_MAP[cleanLeague] || cleanLeague;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/standings') return await handleStandings(url);
      if (path === '/api/scorers') return await handleScorers(url);
      if (path === '/api/league-rounds') return await handleRounds(url);
      if (path === '/api/league-matches') return await handleLeagueMatches(url);

      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: CORS_HEADERS
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }
  }
};

// ── 1. Standings Handler ──────────────────────────────────────
async function handleStandings(url) {
  const rawLeague = url.searchParams.get('league') || 'eng.1';
  const league = normalizeLeagueCode(rawLeague); // تحويل الرقم هنا تلقائياً
  const season = url.searchParams.get('season') || '2025';

  const espnUrl = `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings?season=${season}`;
  const res = await fetch(espnUrl);
  
  if (!res.ok) {
    return new Response(JSON.stringify({ success: false, message: 'Failed to fetch ESPN data' }), { headers: CORS_HEADERS });
  }

  const data = await res.json();

  const leagueName = data.name || 'الدوري';
  const groups = [];
  const legend = [];

  if (data.children) {
    data.children.forEach(child => {
      const groupName = child.name || '';
      const standings = child.standings?.entries || [];
      const teams = formatStandingsEntries(standings);
      groups.push({ name: groupName, teams });
    });
  } else if (data.standings?.entries) {
    const teams = formatStandingsEntries(data.standings.entries);
    groups.push({ name: '', teams });
  }

  return new Response(JSON.stringify({
    success: true,
    leagueName,
    groups,
    legend
  }), { headers: CORS_HEADERS });
}

function formatStandingsEntries(entries) {
  return entries.map(entry => {
    const stats = entry.stats || [];
    const getStat = (name) => {
      const s = stats.find(x => x.name === name || x.type === name);
      return s ? s.value : 0;
    };

    return {
      rank: entry.stats?.find(s => s.name === 'rank')?.value || 0,
      name: entry.team?.displayName || entry.team?.name || '',
      logo: entry.team?.logos?.[0]?.href || '',
      played: getStat('gamesPlayed'),
      wins: getStat('wins'),
      draws: getStat('ties'),
      losses: getStat('losses'),
      gd: getStat('pointDifferential') || getStat('differential'),
      points: getStat('points'),
      note_color: entry.note?.color || null
    };
  });
}

// ── 2. Scorers Handler ────────────────────────────────────────
async function handleScorers(url) {
  const rawLeague = url.searchParams.get('league') || 'eng.1';
  const league = normalizeLeagueCode(rawLeague); // تحويل الرقم هنا تلقائياً
  const season = url.searchParams.get('season') || '2025';

  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/leaders?season=${season}`;
  const res = await fetch(espnUrl);
  
  if (!res.ok) {
    return new Response(JSON.stringify({ success: false, message: 'No scorers data' }), { headers: CORS_HEADERS });
  }

  const data = await res.json();
  const scorers = [];

  const goalsCategory = data.leaders?.find(c => c.name === 'goals' || c.name === 'topScorers');
  const leadersList = goalsCategory?.leaders || data.leaders?.[0]?.leaders || [];

  leadersList.forEach((item, index) => {
    const athlete = item.athlete || {};
    const team = item.team || athlete.team || {};

    scorers.push({
      rank: index + 1,
      name: athlete.displayName || athlete.fullName || 'لاعب',
      team: team.displayName || team.name || '',
      teamLogo: team.logos?.[0]?.href || '',
      goals: item.value || 0
    });
  });

  return new Response(JSON.stringify({ success: true, scorers }), { headers: CORS_HEADERS });
}

// ── 3. Rounds Handler ─────────────────────────────────────────
async function handleRounds(url) {
  const rawLeague = url.searchParams.get('league') || 'eng.1';
  const league = normalizeLeagueCode(rawLeague); // تحويل الرقم هنا تلقائياً

  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`;
  const res = await fetch(espnUrl);
  const data = await res.json();

  const calendar = data.leagues?.[0]?.calendar || [];
  const rounds = [];

  calendar.forEach((item, idx) => {
    rounds.push({
      number: idx + 1,
      label: item.label || `الجولة ${idx + 1}`,
      dateFrom: item.startDate ? item.startDate.split('T')[0].replace(/-/g, '') : '',
      dateTo: item.endDate ? item.endDate.split('T')[0].replace(/-/g, '') : ''
    });
  });

  return new Response(JSON.stringify({ success: true, rounds }), { headers: CORS_HEADERS });
}

// ── 4. League Matches Handler ─────────────────────────────────
async function handleLeagueMatches(url) {
  const rawLeague = url.searchParams.get('league') || 'eng.1';
  const league = normalizeLeagueCode(rawLeague); // تحويل الرقم هنا تلقائياً
  const date = url.searchParams.get('date');
  const dateTo = url.searchParams.get('dateTo');

  let espnUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`;
  if (date && dateTo) {
    espnUrl += `?dates=${date}-${dateTo}`;
  }

  const res = await fetch(espnUrl);
  const data = await res.json();

  const events = data.events || [];
  const matches = events.map(evt => {
    const comp = evt.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
    const away = comp.competitors?.find(c => c.homeAway === 'away') || {};

    return {
      id: evt.id,
      status: evt.status?.type?.state,
      statusText: evt.status?.type?.shortDetail,
      homeTeam: home.team?.displayName || '',
      homeLogo: home.team?.logo || '',
      homeScore: home.score || '0',
      awayTeam: away.team?.displayName || '',
      awayLogo: away.team?.logo || '',
      awayScore: away.score || '0'
    };
  });

  return new Response(JSON.stringify({ success: true, matches }), { headers: CORS_HEADERS });
}