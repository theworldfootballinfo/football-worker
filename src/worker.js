// ═══════════════════════════════════════════════════════════════════════════════
// worker.js — النسخة التي تعمل مع site.web.api.espn.com
// ═══════════════════════════════════════════════════════════════════════════════

// استخدم site.web.api.espn.com (يعمل من Workers)
const ESPN_ALL = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── KV helpers ──────────────────────────────────────────────────────────────
async function kvGet(env, key) {
  try { return await env?.FOOTBALL_KV?.get(key, 'json'); } catch { return null; }
}
async function kvPut(env, key, value, ttl) {
  try {
    const opts = ttl ? { expirationTtl: ttl } : {};
    await env?.FOOTBALL_KV?.put(key, JSON.stringify(value), opts);
  } catch {}
}

// ─── دالة تحليل المباراة ──────────────────────────────────────────────────────
function parseEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
  const away = comp.competitors?.find(c => c.homeAway === 'away') || {};
  const status = ev.status?.type || {};
  
  // استخراج اسم الدوري من altGameNote
  let leagueName = '';
  let leagueCode = '';
  
  if (comp.altGameNote) {
    const parts = comp.altGameNote.split(',').map(s => s.trim());
    leagueName = parts[0] || '';
  }
  
  // من leagues array
  if (ev.leagues && ev.leagues.length > 0) {
    leagueCode = ev.leagues[0]?.slug || '';
    if (!leagueName) {
      leagueName = ev.leagues[0]?.name || '';
    }
  }
  
  // من uid
  const uid = ev.uid || '';
  const leagueId = uid.match(/~l:(\d+)~/)?.[1] || '';
  
  if (!leagueName) {
    leagueName = ev.name || '';
  }

  return {
    id: ev.id,
    league: leagueCode || leagueId || 'other',
    leagueName: leagueName,
    date: ev.date,
    homeTeam: home.team?.displayName || '',
    homeLogo: home.team?.logos?.[0]?.href || home.team?.logo || '',
    homeScore: home.score ?? '',
    awayTeam: away.team?.displayName || '',
    awayLogo: away.team?.logos?.[0]?.href || away.team?.logo || '',
    awayScore: away.score ?? '',
    status: status.state || 'pre',
    statusText: status.shortDetail || '',
    minute: ev.status?.displayClock || '',
    venue: comp.venue?.fullName || '',
  };
}

function todayEspn() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ─── /api/matches ─────────────────────────────────────────────────────────────
async function handleMatches(url, env) {
  const date = url.searchParams.get('date') || todayEspn();
  const kvKey = `matches_v6_${date}`;
  const isToday = date === todayEspn();
  
  const cached = await kvGet(env, kvKey);
  if (cached) {
    return jsonResp({ ...cached, fromCache: true });
  }
  
  try {
    // محاولة باستخدام site.web.api.espn.com
    const res = await fetch(`${ESPN_ALL}?dates=${date}&limit=500`, {
      headers: {
        'User-Agent': 'Scorio/1.0',
        'Accept': 'application/json',
      }
    });
    
    if (!res.ok) {
      // محاولة بديلة باستخدام site.api.espn.com
      const res2 = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${date}&limit=500`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Scorio/1.0)',
          'Accept': 'application/json',
        }
      });
      if (!res2.ok) {
        return jsonResp({
          success: false,
          date,
          count: 0,
          matches: [],
          error: `ESPN returned HTTP ${res2.status}`,
        }, res2.status);
      }
      const data = await res2.json();
      const matches = (data.events || []).map(parseEvent);
      const hasLive = matches.some(m => m.status === 'in');
      const result = { success: true, date, count: matches.length, matches };
      await kvPut(env, kvKey, result, hasLive ? 120 : isToday ? 300 : null);
      return jsonResp(result);
    }
    
    const data = await res.json();
    const matches = (data.events || []).map(parseEvent);
    const hasLive = matches.some(m => m.status === 'in');
    const result = { success: true, date, count: matches.length, matches };
    await kvPut(env, kvKey, result, hasLive ? 120 : isToday ? 300 : null);
    return jsonResp(result);
    
  } catch (e) {
    return jsonResp({
      success: false,
      date,
      count: 0,
      matches: [],
      error: e.message,
    }, 502);
  }
}

// ─── /api/summary ─────────────────────────────────────────────────────────────
async function handleSummary(url, env) {
  const matchId = url.searchParams.get('matchId');
  const league = url.searchParams.get('league') || '';
  
  if (!matchId) {
    return jsonResp({ error: 'matchId required' }, 400);
  }
  
  const kvKey = `summary_v6_${matchId}`;
  const cached = await kvGet(env, kvKey);
  if (cached) {
    return jsonResp({ ...cached, fromCache: true });
  }
  
  // قائمة الدوريات للمحاولة
  const leaguesToTry = league 
    ? [league, 'eng.league_cup', 'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1']
    : ['eng.league_cup', 'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'uefa.champions', 'fifa.world'];
  
  let data = null;
  let usedLeague = league;
  
  for (const lg of leaguesToTry) {
    try {
      // محاولة باستخدام site.web.api.espn.com
      let res = await fetch(`${ESPN_BASE}/${lg}/summary?event=${matchId}`, {
        headers: {
          'User-Agent': 'Scorio/1.0',
          'Accept': 'application/json',
        }
      });
      
      if (!res.ok) {
        // محاولة بديلة باستخدام site.api.espn.com
        res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${matchId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Scorio/1.0)',
            'Accept': 'application/json',
          }
        });
        if (!res.ok) continue;
      }
      
      const d = await res.json();
      if (d.header?.competitions?.[0]?.competitors?.length) {
        data = d;
        usedLeague = lg;
        break;
      }
    } catch { continue; }
  }
  
  if (!data) {
    return jsonResp({ error: 'لم يتم العثور على المباراة' }, 404);
  }
  
  try {
    const hdr = data.header || {};
    const comp = hdr.competitions?.[0] || {};
    const homeComp = comp.competitors?.find(c => c.homeAway === 'home') || {};
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away') || {};
    const st = comp.status?.type || {};
    
    const homeRoster = data.rosters?.find(r => r.homeAway === 'home');
    const awayRoster = data.rosters?.find(r => r.homeAway === 'away');
    
    const mapLineup = (rosterObj) =>
      (rosterObj?.roster || []).map(p => ({
        name: p.athlete?.displayName || '',
        shortName: p.athlete?.shortName || '',
        jersey: p.jersey || '',
        position: p.position?.abbreviation || '',
        starter: p.starter ?? false,
        subbedIn: p.subbedIn ?? false,
        subbedOut: p.subbedOut ?? false,
      }));
    
    // استخراج الأهداف من details
    const goals = [];
    const details = comp.details || [];
    for (const det of details) {
      if (!det.scoringPlay) continue;
      goals.push({
        minute: det.clock?.displayValue || '',
        player: det.participants?.[0]?.athlete?.displayName || '',
        assist: det.participants?.[1]?.athlete?.displayName || '',
        team: det.team?.displayName || '',
        type: det.ownGoal ? 'ownGoal' : det.penaltyKick ? 'penalty' : 'goal',
      });
    }
    
    // استخراج البطاقات من keyEvents
    const cards = [];
    const keyEvents = data.keyEvents || [];
    for (const ke of keyEvents) {
      const evType = ke.type?.type || '';
      if (evType === 'yellow-card' || evType === 'yellowCard') {
        cards.push({
          minute: ke.clock?.displayValue || '',
          player: ke.participants?.[0]?.athlete?.displayName || '',
          team: ke.team?.displayName || '',
          type: 'yellowCard',
        });
      } else if (evType === 'red-card' || evType === 'redCard') {
        cards.push({
          minute: ke.clock?.displayValue || '',
          player: ke.participants?.[0]?.athlete?.displayName || '',
          team: ke.team?.displayName || '',
          type: 'redCard',
        });
      }
    }
    
    const result = {
      success: true,
      id: matchId,
      league: usedLeague,
      leagueName: hdr.league?.name || comp.altGameNote || '',
      venue: comp.venue?.fullName || '',
      date: comp.date,
      homeTeam: homeComp.team?.displayName || '',
      homeLogo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || '',
      homeScore: homeComp.score || '0',
      awayTeam: awayComp.team?.displayName || '',
      awayLogo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || '',
      awayScore: awayComp.score || '0',
      status: st.state || 'post',
      statusText: st.shortDetail || '',
      minute: comp.status?.displayClock || '',
      goals: goals,
      cards: cards,
      homeLineup: mapLineup(homeRoster),
      awayLineup: mapLineup(awayRoster),
    };
    
    await kvPut(env, kvKey, result, st.state === 'in' ? 600 : null);
    return jsonResp(result);
    
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

// ─── /api/standings ───────────────────────────────────────────────────────────
async function handleStandings(url, env) {
  const league = url.searchParams.get('league') || 'eng.1';
  const kvKey = `standings_v6_${league}`;
  
  const cached = await kvGet(env, kvKey);
  if (cached) {
    return jsonResp({ ...cached, fromCache: true });
  }
  
  try {
    let res = await fetch(`https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/standings`, {
      headers: {
        'User-Agent': 'Scorio/1.0',
        'Accept': 'application/json',
      }
    });
    
    if (!res.ok) {
      res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Scorio/1.0)',
          'Accept': 'application/json',
        }
      });
      if (!res.ok) {
        return jsonResp({ success: false, groups: [], error: `HTTP ${res.status}` }, res.status);
      }
    }
    
    const data = await res.json();
    const groups = [];
    
    for (const child of (data.children || [])) {
      const groupName = data.children.length > 1 ? (child.name || '') : '';
      const entries = child.standings?.entries || [];
      const teams = entries.map((e, i) => {
        const team = e.team || {};
        const stats = {};
        for (const s of (e.stats || [])) {
          stats[s.name] = s.displayValue ?? s.value ?? 0;
        }
        return {
          rank: i + 1,
          name: team.displayName || team.name || '---',
          logo: team.logos?.[0]?.href || '',
          played: parseInt(stats.gamesPlayed) || 0,
          wins: parseInt(stats.wins) || 0,
          draws: parseInt(stats.ties ?? stats.draws) || 0,
          losses: parseInt(stats.losses) || 0,
          gd: stats.pointDifferential ?? '',
          points: parseInt(stats.points) || 0,
        };
      });
      groups.push({ name: groupName, teams });
    }
    
    const result = { success: true, league, groups };
    await kvPut(env, kvKey, result, 21600);
    return jsonResp(result);
    
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 502);
  }
}

// ─── /api/scorers ─────────────────────────────────────────────────────────────
async function handleScorers(url, env) {
  const league = url.searchParams.get('league') || 'eng.1';
  const season = url.searchParams.get('season') || '2026';
  const kvKey = `scorers_v6_${league}_${season}`;
  
  const cached = await kvGet(env, kvKey);
  if (cached) {
    return jsonResp({ ...cached, fromCache: true });
  }
  
  try {
    let res = await fetch(`https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/statistics?season=${season}`, {
      headers: {
        'User-Agent': 'Scorio/1.0',
        'Accept': 'application/json',
      }
    });
    
    if (!res.ok) {
      res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${league}/statistics?season=${season}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Scorio/1.0)',
          'Accept': 'application/json',
        }
      });
      if (!res.ok) {
        return jsonResp({ success: false, scorers: [], error: `HTTP ${res.status}` }, res.status);
      }
    }
    
    const data = await res.json();
    const goalCat = (data.stats || []).find(s =>
      (s.name || '').toLowerCase().includes('goal') ||
      (s.abbreviation || '').toUpperCase() === 'G'
    ) || (data.stats || [])[0];
    
    const scorers = (goalCat?.leaders || []).map((l, i) => ({
      rank: i + 1,
      name: l.athlete?.displayName || '',
      photo: l.athlete?.headshot?.href || '',
      team: l.team?.displayName || '',
      teamLogo: l.team?.logos?.[0]?.href || '',
      goals: parseInt(l.value) || 0,
    }));
    
    const result = { success: true, league, season, scorers };
    await kvPut(env, kvKey, result, 21600);
    return jsonResp(result);
    
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 502);
  }
}

// ─── Main router ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path === '/ping') {
      return new Response('pong', { headers: CORS });
    }
    
    if (path === '/api/matches') {
      return handleMatches(url, env);
    }
    
    if (path === '/api/summary') {
      return handleSummary(url, env);
    }
    
    if (path === '/api/standings') {
      return handleStandings(url, env);
    }
    
    if (path === '/api/scorers') {
      return handleScorers(url, env);
    }
    
    return new Response('Not Found', { status: 404, headers: CORS });
  },
};