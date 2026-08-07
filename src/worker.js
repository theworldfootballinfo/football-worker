/**
 * Scorio Football API — Cloudflare Worker
 *
 * نشر سريع:
 * 1) أنشئ Worker جديداً في Cloudflare والصق هذا الملف.
 * 2) لا تحتاج إلى أي API key؛ مصدر البيانات العام هو ESPN.
 * 3) اختيارياً اربط KV namespace باسم FOOTBALL_KV لتفعيل التخزين المؤقت.
 *
 * المسارات:
 *   GET /api/matches/all?date=YYYY-MM-DD
 *   GET /api/matches/league?league=eng.1&date=YYYY-MM-DD
 *   GET /api/match/:id?league=eng.1
 *   GET /api/standings?league=eng.1&season=2026
 *   GET /api/top-scorers?league=eng.1&season=2026
 *   GET /ping
 */

const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_STANDINGS = 'https://site.web.api.espn.com/apis/v2/sports/soccer';
const ESPN_ALL = `${ESPN_BASE}/all/scoreboard`;
const WORKER_VERSION = '2026-08-07-routes-v2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TTL = {
  live: 60,
  today: 180,
  old: 3600,
  details: 90,
  standings: 21600,
  scorers: 21600,
};

const LEAGUE_NAMES = {
  'eng.1': 'الدوري الإنجليزي الممتاز',
  'eng.2': 'الدرجة الثانية الإنجليزية',
  'eng.3': 'الدرجة الثالثة الإنجليزية',
  'esp.1': 'الليغا الإسبانية',
  'esp.2': 'الدرجة الثانية الإسبانية',
  'ita.1': 'الدوري الإيطالي',
  'ita.2': 'الدرجة الثانية الإيطالية',
  'ger.1': 'البوندسليغا الألمانية',
  'ger.2': 'الدرجة الثانية الألمانية',
  'fra.1': 'الدوري الفرنسي',
  'fra.2': 'الدرجة الثانية الفرنسية',
  'ned.1': 'الدوري الهولندي',
  'por.1': 'الدوري البرتغالي',
  'bel.1': 'الدوري البلجيكي',
  'tur.1': 'الدوري التركي',
  'gre.1': 'الدوري اليوناني',
  'sco.1': 'الدوري الإسكتلندي',
  'sui.1': 'الدوري السويسري',
  'aut.1': 'الدوري النمساوي',
  'den.1': 'الدوري الدنماركي',
  'nor.1': 'الدوري النرويجي',
  'swe.1': 'الدوري السويدي',
  'rus.1': 'الدوري الروسي',
  'bra.1': 'الدوري البرازيلي',
  'bra.2': 'الدرجة الثانية البرازيلية',
  'arg.1': 'الدوري الأرجنتيني',
  'chi.1': 'الدوري التشيلي',
  'col.1': 'الدوري الكولومبي',
  'uru.1': 'الدوري الأوروغوياني',
  'ecu.1': 'الدوري الإكوادوري',
  'per.1': 'الدوري البيروفي',
  'par.1': 'الدوري الباراغوياني',
  'ven.1': 'الدوري الفنزويلي',
  'mex.1': 'الدوري المكسيكي',
  'usa.1': 'الدوري الأمريكي',
  'usa.nwsl': 'دوري السيدات الأمريكي',
  'jpn.1': 'الدوري الياباني',
  'kor.1': 'الدوري الكوري',
  'chn.1': 'الدوري الصيني',
  'aus.1': 'الدوري الأسترالي',
  'sau.1': 'الدوري السعودي',
  'ksa.1': 'الدوري السعودي للمحترفين',
  'idn.1': 'الدوري الإندونيسي',
  'tha.1': 'الدوري التايلاندي',
  'ind.1': 'الدوري الهندي',
  'egy.1': 'الدوري المصري',
  'mar.1': 'الدوري المغربي',
  'rsa.1': 'الدوري الجنوب أفريقي',
  'uefa.champions': 'دوري أبطال أوروبا',
  'uefa.europa': 'الدوري الأوروبي',
  'uefa.europa.conf': 'دوري المؤتمر الأوروبي',
  'conmebol.libertadores': 'كوبا ليبرتادوريس',
  'conmebol.sudamericana': 'كوبا سودأمريكانا',
  'concacaf.champions': 'دوري أبطال الكونكاكاف',
  'caf.champions': 'دوري أبطال أفريقيا',
  'afc.champions': 'دوري أبطال آسيا',
  'fifa.world': 'كأس العالم FIFA',
  'fifa.friendly': 'مباريات دولية ودية',
  'club.friendly': 'المباريات الودية للأندية',
};

const LEAGUE_FLAGS = {
  'eng.1': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'eng.2': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'esp.1': '🇪🇸', 'esp.2': '🇪🇸',
  'ita.1': '🇮🇹', 'ita.2': '🇮🇹',
  'ger.1': '🇩🇪', 'ger.2': '🇩🇪',
  'fra.1': '🇫🇷', 'fra.2': '🇫🇷',
  'ned.1': '🇳🇱', 'por.1': '🇵🇹', 'bel.1': '🇧🇪',
  'tur.1': '🇹🇷', 'gre.1': '🇬🇷', 'sco.1': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'bra.1': '🇧🇷', 'bra.2': '🇧🇷', 'arg.1': '🇦🇷',
  'mex.1': '🇲🇽', 'usa.1': '🇺🇸', 'jpn.1': '🇯🇵',
  'kor.1': '🇰🇷', 'chn.1': '🇨🇳', 'aus.1': '🇦🇺',
  'sau.1': '🇸🇦', 'ksa.1': '🇸🇦', 'egy.1': '🇪🇬',
  'mar.1': '🇲🇦', 'uefa.champions': '🏆',
  'uefa.europa': '🏆', 'uefa.europa.conf': '🏆',
  'conmebol.libertadores': '🏆', 'conmebol.sudamericana': '🏆',
  'caf.champions': '🏆', 'afc.champions': '🏆',
  'fifa.world': '🌍', 'fifa.friendly': '🤝',
  'club.friendly': '🤝',
};

const ID_TO_LEAGUE = {
  '1': 'sco.1', '2': 'uefa.champions', '3': 'uefa.europa',
  '4': 'tur.1', '7': 'ned.1', '9': 'fra.1', '10': 'ger.1',
  '11': 'ger.2', '13': 'ita.1', '14': 'ita.2', '15': 'esp.1',
  '16': 'esp.2', '21': 'usa.1', '22': 'arg.1', '23': 'eng.1',
  '24': 'eng.2', '33': 'aus.1', '40': 'conmebol.libertadores',
  '73': 'uefa.euro', '81': 'conmebol.sudamericana',
  '84': 'afc.asian.cup', '93': 'ksa.1', '105': 'por.1',
  '112': 'rus.1', '116': 'swe.1', '117': 'nor.1',
  '119': 'den.1', '131': 'mex.1', '135': 'bra.1',
  '137': 'chi.1', '141': 'col.1', '143': 'bol.1',
  '147': 'ecu.1', '150': 'par.1', '153': 'per.1',
  '156': 'uru.1', '159': 'ven.1', '163': 'jpn.1',
  '167': 'kor.1', '171': 'chn.1', '178': 'tha.1',
  '180': 'idn.1', '181': 'sau.1', '231': 'mar.1',
  '234': 'egy.1', '235': 'rsa.1', '606': 'fifa.world',
  '1975': 'caf.champions', '2199': 'afc.champions',
  '2201': 'concacaf.champions',
};

function json(data, status = 200, maxAge = 0) {
  const headers = {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (maxAge > 0) headers['Cache-Control'] = `public, max-age=${maxAge}`;
  return new Response(JSON.stringify(data), { status, headers });
}

function errorJson(message, status = 500) {
  return json({ success: false, error: message }, status);
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10).replaceAll('-', '');
  if (/^\d{8}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replaceAll('-', '');
  return null;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function dateKeyToIso(dateKey) {
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

function dateKeysBetween(startKey, endKey) {
  const start = new Date(`${dateKeyToIso(startKey)}T00:00:00Z`);
  const end = new Date(`${dateKeyToIso(endKey)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const keys = [];
  for (const cursor = new Date(start); cursor <= end && keys.length < 120; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    keys.push(cursor.toISOString().slice(0, 10).replaceAll('-', ''));
  }
  return keys;
}

function flagFor(code, name = '') {
  if (LEAGUE_FLAGS[code]) return LEAGUE_FLAGS[code];
  const text = name.toLowerCase();
  if (text.includes('champions') || text.includes('cup')) return '🏆';
  if (text.includes('world') || text.includes('mundial')) return '🌍';
  if (text.includes('euro')) return '🇪🇺';
  return '⚽';
}

function leagueFromName(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('carabao') || text.includes('efl cup') || text.includes('league cup')) return 'eng.league_cup';
  if (text.includes('fa cup')) return 'eng.fa';
  if (text.includes('community shield') || text.includes('charity shield')) return 'eng.charity_shield';
  if (text.includes('copa del rey')) return 'esp.copa_del_rey';
  if (text.includes('coppa italia')) return 'ita.coppa_italia';
  if (text.includes('dfb-pokal') || text.includes('dfb pokal')) return 'ger.dfb_pokal';
  if (text.includes('coupe de france')) return 'fra.coupe_de_france';
  if (text.includes('knvb')) return 'ned.knvb';
  if (text.includes('champions league') && !text.includes('afc') && !text.includes('caf')) return 'uefa.champions';
  if (text.includes('europa league')) return 'uefa.europa';
  if (text.includes('conference league')) return 'uefa.europa.conf';
  if (text.includes('libertadores')) return 'conmebol.libertadores';
  if (text.includes('sudamericana')) return 'conmebol.sudamericana';
  if (text.includes('copa america')) return 'conmebol.america';
  if (text.includes('world cup')) return 'fifa.world';
  if (text.includes('premier league') || text.includes('english premier')) return 'eng.1';
  if (text.includes('la liga') || text.includes('laliga')) return 'esp.1';
  if (text.includes('bundesliga')) return text.includes('2') ? 'ger.2' : 'ger.1';
  if (text.includes('serie a') && text.includes('ital')) return 'ita.1';
  if (text.includes('ligue 1')) return 'fra.1';
  if (text.includes('eredivisie')) return 'ned.1';
  if (text.includes('mls') || text.includes('major league soccer')) return 'usa.1';
  if (text.includes('saudi') || text.includes('roshn')) return 'sau.1';
  if (text.includes('brasileiro') || text.includes('brasileirao')) return 'bra.1';
  if (text.includes('argentina') || text.includes('liga profesional')) return 'arg.1';
  if (text.includes('friendly')) return 'club.friendly';
  return '';
}

function leagueCodeFromEvent(event) {
  const league = event.leagues?.[0] || event.league || {};
  const uid = event.uid || event.competitions?.[0]?.uid || '';
  const id = uid.match(/~l:(\d+)~/)?.[1] || league.id || '';
  const altNote = event.competitions?.[0]?.altGameNote || '';
  // The slug supplied by ESPN is the most accurate value.
  if (league.slug && league.slug.includes('.')) return league.slug;
  return ID_TO_LEAGUE[String(id)] || leagueFromName(`${league.name || ''}, ${altNote}`) || String(id) || 'other';
}

function leagueNameFor(code, event) {
  const raw = event.leagues?.[0]?.name
    || event.competitions?.[0]?.league?.name
    || event.competitions?.[0]?.altGameNote?.split(',')[0]
    || code;
  return LEAGUE_NAMES[code] || raw;
}

function statusFor(competition) {
  const type = competition.status?.type || {};
  const name = String(type.name || '').toUpperCase();
  if (['STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_FIRST_HALF',
    'STATUS_SECOND_HALF', 'STATUS_EXTRA_TIME', 'STATUS_SHOOTOUT',
    'STATUS_OVERTIME', 'STATUS_PLAY'].includes(name)) return 'in';
  if (['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_FINAL_AET',
    'STATUS_FINAL_PEN', 'STATUS_END_PERIOD', 'STATUS_ABANDONED'].includes(name)) return 'post';
  if (name === 'STATUS_POSTPONED' || name === 'STATUS_SUSPENDED') return 'postponed';
  if (name === 'STATUS_CANCELED') return 'canceled';
  if (name === 'STATUS_DELAYED' || name === 'STATUS_RAIN_DELAY') return 'delayed';
  if (type.state === 'in' || type.state === 'post') return type.state;
  return 'pre';
}

function parseEvent(event) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
  const code = leagueCodeFromEvent(event);
  const name = leagueNameFor(code, event);
  const type = competition.status?.type || {};
  const state = statusFor(competition);
  const isHalftime = String(type.name || '').toUpperCase() === 'STATUS_HALFTIME';
  const penaltyHome = home.shootoutScore ?? home.shootout?.score ?? null;
  const penaltyAway = away.shootoutScore ?? away.shootout?.score ?? null;

  return {
    id: String(event.id || ''),
    league_code: code,
    league_name: name,
    flag: flagFor(code, name),
    date: event.date || competition.date || null,
    state,
    is_halftime: isHalftime,
    minute: state === 'in' && !isHalftime
      ? (competition.status?.displayClock || `ش${competition.status?.period || 1}`)
      : null,
    status: type.description || type.shortDetail || '',
    penalty_score: penaltyHome !== null && penaltyAway !== null
      ? `${penaltyHome}-${penaltyAway}` : null,
    home_team: {
      id: String(home.team?.id || ''),
      name: home.team?.displayName || home.team?.name || '---',
      logo: home.team?.logos?.[0]?.href || home.team?.logo || '',
      score: home.score ?? '0',
    },
    away_team: {
      id: String(away.team?.id || ''),
      name: away.team?.displayName || away.team?.name || '---',
      logo: away.team?.logos?.[0]?.href || away.team?.logo || '',
      score: away.score ?? '0',
    },
  };
}

async function kvGet(env, key) {
  try {
    return env?.FOOTBALL_KV ? await env.FOOTBALL_KV.get(key, 'json') : null;
  } catch {
    return null;
  }
}

async function kvPut(env, key, value, expirationTtl) {
  try {
    if (env?.FOOTBALL_KV) {
      await env.FOOTBALL_KV.put(key, JSON.stringify(value), { expirationTtl });
    }
  } catch {
    // KV is optional; the Worker remains functional without it.
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Scorio-Cloudflare-Worker/1.0',
    },
  });
  if (!response.ok) throw new Error(`ESPN returned HTTP ${response.status}`);
  return response.json();
}

function cacheTtl(dateKey, matches) {
  if (matches.some(match => match.state === 'in')) return TTL.live;
  return dateKey === todayKey() ? TTL.today : TTL.old;
}

async function handleAllMatches(url, env) {
  const date = normalizeDate(url.searchParams.get('date'));
  if (!date) return errorJson('date must be YYYY-MM-DD', 400);

  const key = `matches_v1_${date}`;
  const cached = await kvGet(env, key);
  if (cached) return json({ ...cached, source: 'cache' }, 200, 30);

  try {
    const data = await fetchJson(`${ESPN_ALL}?dates=${date}&limit=500`);
    const matches = (data.events || []).map(parseEvent).filter(match => match.id);
    const result = { matches, total: matches.length, date };
    await kvPut(env, key, result, cacheTtl(date, matches));
    return json(result, 200, cacheTtl(date, matches));
  } catch (error) {
    return errorJson(`تعذر جلب المباريات: ${error.message}`, 502);
  }
}

async function handleLeagueMatches(url, env) {
  const league = url.searchParams.get('league') || 'eng.1';
  const singleDate = normalizeDate(url.searchParams.get('date'));
  const dateFrom = normalizeDate(url.searchParams.get('dateFrom'));
  const dateTo = normalizeDate(url.searchParams.get('dateTo'));
  const dates = singleDate
    ? [singleDate]
    : dateFrom && dateTo
      ? dateKeysBetween(dateFrom, dateTo)
      : [];
  if (!dates.length) return errorJson('date or dateFrom/dateTo must be YYYY-MM-DD', 400);

  const rangeKey = dates.length === 1 ? dates[0] : `${dates[0]}_${dates[dates.length - 1]}`;
  const key = `league_matches_v1_${league}_${rangeKey}`;
  const cached = await kvGet(env, key);
  if (cached) return json({ ...cached, source: 'cache' }, 200, 30);

  try {
    const responses = [];
    // Keep range requests gentle on ESPN; a full league round can span
    // several days and should not create a burst of dozens of requests.
    for (let index = 0; index < dates.length; index += 8) {
      const batch = dates.slice(index, index + 8);
      const batchResponses = await Promise.all(batch.map(async date => {
        const data = await fetchJson(
          `${ESPN_BASE}/${encodeURIComponent(league)}/scoreboard?dates=${date}&limit=100`
        );
        return data.events || [];
      }));
      responses.push(...batchResponses);
    }
    const seen = new Set();
    const matches = responses.flat().map(parseEvent).filter(match => {
      if (!match.id || seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    });
    const result = {
      matches,
      total: matches.length,
      date: dates.length === 1 ? dateKeyToIso(dates[0]) : null,
      dateFrom: dateKeyToIso(dates[0]),
      dateTo: dateKeyToIso(dates[dates.length - 1]),
      league,
      league_name: LEAGUE_NAMES[league] || league,
    };
    const ttl = matches.some(match => match.state === 'in') ? TTL.live : TTL.old;
    await kvPut(env, key, result, ttl);
    return json(result, 200, ttl);
  } catch (error) {
    return errorJson(`تعذر جلب مباريات البطولة: ${error.message}`, 502);
  }
}

async function handleLeagueRounds(url, env) {
  const league = url.searchParams.get('league') || 'eng.1';
  const key = `league_rounds_v1_${league}`;
  const cached = await kvGet(env, key);
  if (cached) return json({ ...cached, source: 'cache' }, 200, 300);

  try {
    const data = await fetchJson(
      `${ESPN_BASE}/${encodeURIComponent(league)}/scoreboard?limit=1000`
    );
    const calendar = data.leagues?.[0]?.calendar || [];
    if (!calendar.length) return json({ type: 'matchdays', rounds: [], league });

    const translateRound = (label = '') => {
      const labels = [
        ['League Phase', 'مرحلة الدوري'], ['Group Stage', 'دور المجموعات'],
        ['Round of 16', 'دور الـ16'], ['Round of 32', 'دور الـ32'],
        ['Quarterfinal', 'ربع النهائي'], ['Semifinal', 'نصف النهائي'],
        ['Final', 'النهائي'], ['First Round', 'الدور الأول'],
        ['Second Round', 'الدور الثاني'], ['Third Round', 'الدور الثالث'],
      ];
      const found = labels.find(([en]) => label.toLowerCase().includes(en.toLowerCase()));
      return found?.[1] || label;
    };

    if (typeof calendar[0] === 'object' && calendar[0] !== null && 'entries' in calendar[0]) {
      const rounds = (calendar[0].entries || []).map((entry, index) => ({
        number: index + 1,
        label: translateRound(entry.label || `الجولة ${index + 1}`),
        detail: entry.detail || '',
        dateFrom: String(entry.startDate || '').slice(0, 10),
        dateTo: String(entry.endDate || '').slice(0, 10),
      }));
      const result = { type: 'entries', rounds, league };
      await kvPut(env, key, result, TTL.old);
      return json(result, 200, TTL.old);
    }

    const dates = calendar
      .filter(item => typeof item === 'string' && !Number.isNaN(new Date(item).getTime()))
      .map(item => new Date(item))
      .sort((a, b) => a - b);
    const rounds = [];
    for (const date of dates) {
      const dateKey = date.toISOString().slice(0, 10);
      const previous = rounds[rounds.length - 1];
      if (!previous || (date - previous.lastDate) / 86400000 >= 3) {
        rounds.push({ number: rounds.length + 1, label: `الجولة ${rounds.length + 1}`, dateFrom: dateKey, dateTo: dateKey, lastDate: date });
      } else {
        previous.dateTo = dateKey;
        previous.lastDate = date;
      }
    }
    const result = {
      type: 'matchdays',
      rounds: rounds.map(({ lastDate, ...round }) => round),
      league,
    };
    await kvPut(env, key, result, TTL.old);
    return json(result, 200, TTL.old);
  } catch (error) {
    return errorJson(`تعذر جلب جولات البطولة: ${error.message}`, 502);
  }
}

function detailsStatus(competition) {
  const type = competition.status?.type || {};
  const name = String(type.name || '').toUpperCase();
  return {
    state: statusFor(competition),
    status: type.description || type.shortDetail || '',
    is_halftime: name === 'STATUS_HALFTIME',
    minute: competition.status?.displayClock || null,
  };
}

function eventParticipants(event) {
  const athletes = event.athletesInvolved || event.participants || [];
  return athletes.map(item => item.athlete || item);
}

function extractDetailsEvents(data, homeId, awayId) {
  const goals = [];
  const cards = [];
  const substitutions = [];
  const keyEvents = data.keyEvents || [];

  for (const event of keyEvents) {
    const text = `${event.type?.text || ''} ${event.type?.type || ''}`.toLowerCase();
    const description = String(event.text || '').toLowerCase();
    const people = eventParticipants(event);
    const player = people[0]?.displayName || '';
    const team = event.team?.displayName || '';
    const teamId = String(event.team?.id || '');
    const minute = event.clock?.displayValue || '??';

    const scoredPenalty = text.includes('penalty')
      && !/(miss|save|wide|no goal)/.test(`${text} ${description}`);
    if (text.includes('goal') || scoredPenalty) {
      const type = text.includes('own') ? 'own_goal' : scoredPenalty ? 'penalty' : 'normal';
      goals.push({
        minute, player: player || 'لاعب غير معروف',
        team, team_id: teamId,
        side: teamId === String(homeId) ? 'home' : teamId === String(awayId) ? 'away' : '',
        type, assist: people[1]?.displayName || '',
      });
    }
    if (text.includes('yellow') || text.includes('red')) {
      cards.push({
        minute, player: player || 'لاعب غير معروف', team,
        type: text.includes('red') ? 'red' : 'yellow',
      });
    }
    if (text.includes('substitution')) {
      substitutions.push({
        minute,
        player_on: people[0]?.displayName || '?',
        player_off: people[1]?.displayName || '?',
        team,
      });
    }
  }
  return { goals, cards, substitutions };
}

async function handleMatchDetails(url, env, matchId) {
  if (!matchId) return errorJson('match id required', 400);
  const league = url.searchParams.get('league') || 'eng.1';
  const key = `match_details_v1_${matchId}`;
  const cached = await kvGet(env, key);
  if (cached) return json(cached, 200, 30);

  try {
    const data = await fetchJson(
      `${ESPN_BASE}/${encodeURIComponent(league)}/summary?event=${encodeURIComponent(matchId)}`
    );
    const header = data.header || {};
    const competition = header.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
    const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
    const homeTeam = home.team || {};
    const awayTeam = away.team || {};
    const status = detailsStatus(competition);
    const eventData = extractDetailsEvents(data, homeTeam.id, awayTeam.id);

    const penaltyHome = home.shootoutScore ?? null;
    const penaltyAway = away.shootoutScore ?? null;
    const penaltyScore = penaltyHome !== null && penaltyAway !== null
      ? `${penaltyHome}-${penaltyAway}` : null;

    const venue = competition.venue || data.gameInfo?.venue || {};
    const venueAddress = venue.address || {};
    const venueText = [venue.fullName, venueAddress.city].filter(Boolean).join('، ');

    const statistics = {};
    for (const team of data.boxscore?.teams || []) {
      for (const stat of team.statistics || []) {
        const name = stat.name || stat.label || '';
        if (!statistics[name]) {
          statistics[name] = {
            display_name: stat.label || name,
            home: '', away: '',
          };
        }
        statistics[name][team.homeAway === 'away' ? 'away' : 'home'] =
          stat.displayValue ?? stat.value ?? '';
      }
    }

    const lineups = { home: { starters: [], substitutes: [] }, away: { starters: [], substitutes: [] } };
    for (const roster of data.rosters || []) {
      const side = roster.homeAway === 'away' ? 'away' : 'home';
      for (const item of roster.roster || []) {
        const player = {
          name: item.athlete?.displayName || '',
          jersey: item.jersey || '',
          position: item.position?.abbreviation || '',
          position_full: item.position?.name || '',
          subbedIn: Boolean(item.subbedIn),
          subbedOut: Boolean(item.subbedOut),
        };
        (item.starter ? lineups[side].starters : lineups[side].substitutes).push(player);
      }
      lineups[side].formation = roster.formation || '';
    }

    const result = {
      match_info: {
        id: matchId,
        league,
        league_name: LEAGUE_NAMES[league] || header.league?.name || league,
        state: status.state,
        status: status.status,
        is_halftime: status.is_halftime,
        minute: status.minute,
        penalty_score: penaltyScore,
        venue: venueText,
        date: competition.date || '',
        home_team: {
          id: homeTeam.id || '',
          name: homeTeam.displayName || '---',
          score: home.score ?? '0',
          logo: homeTeam.logos?.[0]?.href || homeTeam.logo || '',
        },
        away_team: {
          id: awayTeam.id || '',
          name: awayTeam.displayName || '---',
          score: away.score ?? '0',
          logo: awayTeam.logos?.[0]?.href || awayTeam.logo || '',
        },
      },
      goals: eventData.goals,
      cards: eventData.cards,
      substitutions: eventData.substitutions,
      statistics,
      lineups,
      penalty_shootout: { home: [], away: [] },
    };
    await kvPut(env, key, result, status.state === 'in' ? TTL.details : TTL.old);
    return json(result, 200, status.state === 'in' ? 30 : 300);
  } catch (error) {
    return errorJson(`تعذر جلب تفاصيل المباراة: ${error.message}`, 502);
  }
}

function statValue(entry, names, fallback = 0) {
  const stat = (entry.stats || []).find(item => names.includes(item.name));
  return stat?.value ?? stat?.displayValue ?? fallback;
}

async function handleStandings(url, env) {
  const league = url.searchParams.get('league') || 'eng.1';
  const season = url.searchParams.get('season') || String(new Date().getUTCFullYear());
  const key = `standings_v1_${league}_${season}`;
  const cached = await kvGet(env, key);
  if (cached) return json(cached, 200, 300);

  const urls = [
    `${ESPN_STANDINGS}/${encodeURIComponent(league)}/standings?xhr=1&season=${encodeURIComponent(season)}`,
    `${ESPN_STANDINGS}/${encodeURIComponent(league)}/standings?xhr=1`,
  ];
  try {
    let data = null;
    for (const endpoint of urls) {
      try {
        const candidate = await fetchJson(endpoint);
        if (candidate.children?.length) {
          data = candidate;
          break;
        }
      } catch { /* try the next ESPN endpoint */ }
    }
    if (!data) return json({ standings: [], league, message: 'لا توجد بيانات ترتيب' });

    const standings = (data.children || []).map(child => ({
      group_name: data.children.length > 1 ? child.name || '' : 'الكل',
      teams: (child.standings?.entries || []).map((entry, index) => ({
        position: Number(statValue(entry, ['rank'], index + 1)),
        name: entry.team?.displayName || entry.team?.name || '---',
        logo: entry.team?.logos?.[0]?.href || entry.team?.logo || '',
        played: Number(statValue(entry, ['gamesPlayed', 'played'])),
        wins: Number(statValue(entry, ['wins'])),
        draws: Number(statValue(entry, ['ties', 'draws'])),
        losses: Number(statValue(entry, ['losses'])),
        goals_for: Number(statValue(entry, ['pointsFor', 'goalsFor'])),
        goals_against: Number(statValue(entry, ['pointsAgainst', 'goalsAgainst'])),
        points: Number(statValue(entry, ['points'])),
      })),
    }));
    const result = { standings, league, league_name: LEAGUE_NAMES[league] || league };
    await kvPut(env, key, result, TTL.standings);
    return json(result, 200, 300);
  } catch (error) {
    return errorJson(`تعذر جلب الترتيب: ${error.message}`, 502);
  }
}

async function handleScorers(url, env) {
  const league = url.searchParams.get('league') || 'eng.1';
  const season = url.searchParams.get('season') || String(new Date().getUTCFullYear());
  const key = `scorers_v1_${league}_${season}`;
  const cached = await kvGet(env, key);
  if (cached) return json(cached, 200, 300);

  const endpoints = [
    `${ESPN_STANDINGS}/${encodeURIComponent(league)}/statistics?season=${encodeURIComponent(season)}`,
    `${ESPN_BASE}/${encodeURIComponent(league)}/statistics?season=${encodeURIComponent(season)}`,
    `${ESPN_STANDINGS}/${encodeURIComponent(league)}/statistics`,
  ];
  try {
    let data = null;
    for (const endpoint of endpoints) {
      try {
        const candidate = await fetchJson(endpoint);
        if (candidate.stats?.length) {
          data = candidate;
          break;
        }
      } catch { /* try the next ESPN endpoint */ }
    }
    const category = data?.stats?.find(stat =>
      `${stat.name || ''} ${stat.abbreviation || ''}`.toLowerCase().includes('goal')
    ) || data?.stats?.[0];
    const scorers = (category?.leaders || []).map((leader, index) => ({
      rank: index + 1,
      name: leader.athlete?.displayName || '---',
      team: leader.athlete?.team?.displayName || leader.team?.displayName || '',
      team_logo: leader.athlete?.team?.logos?.[0]?.href || leader.team?.logos?.[0]?.href || '',
      goals: Number(leader.value || 0),
    }));
    const result = { scorers, league, league_name: LEAGUE_NAMES[league] || league };
    await kvPut(env, key, result, TTL.scorers);
    return json(result, 200, 300);
  } catch (error) {
    return errorJson(`تعذر جلب الهدافين: ${error.message}`, 502);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'GET') return errorJson('method not allowed', 405);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/__version') {
      return json({
        version: WORKER_VERSION,
        routes: [
          '/ping',
          '/api/matches/all',
          '/api/matches',
          '/api/matches/league',
          '/api/league-matches',
          '/api/league-rounds',
          '/api/match/:id',
          '/api/summary',
          '/api/standings',
          '/api/top-scorers',
          '/api/scorers',
        ],
      });
    }
    if (path === '/ping') return new Response('pong', { headers: CORS_HEADERS });
    if (path === '/api/matches/all' || path === '/api/matches') return handleAllMatches(url, env);
    if (path === '/api/matches/league' || path === '/api/league-matches') return handleLeagueMatches(url, env);
    if (path === '/api/league-rounds') return handleLeagueRounds(url, env);
    if (path === '/api/standings') return handleStandings(url, env);
    if (path === '/api/top-scorers' || path === '/api/scorers') return handleScorers(url, env);
    if (path.startsWith('/api/match/')) return handleMatchDetails(url, env, path.split('/').pop());
    if (path === '/api/match') return handleMatchDetails(url, env, url.searchParams.get('id'));
    if (path === '/api/summary') {
      return handleMatchDetails(
        url,
        env,
        url.searchParams.get('matchId') || url.searchParams.get('id')
      );
    }
    return errorJson('not found', 404);
  },
};