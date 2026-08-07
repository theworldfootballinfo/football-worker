// ═══════════════════════════════════════════════════════════════════════════════
// worker.js — Scorio Cloudflare Worker (النسخة النهائية الكاملة)
// ═══════════════════════════════════════════════════════════════════════════════

const ESPN_ALL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_STAND = 'https://site.web.api.espn.com/apis/v2/sports/soccer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── TTL ──────────────────────────────────────────────────────────────────────
const TTL_LIVE = () => 120 + Math.floor(Math.random() * 61);
const TTL_MATCHES = 300;
const TTL_ROUND_MATCHES = 4 * 3600;
const TTL_SUMMARY = () => 600 + Math.floor(Math.random() * 301);
const TTL_FORMATION = 4 * 3600;
const TTL_FINISHED = null;
const TTL_STANDINGS = 21600;
const TTL_SCORERS = 21600;
const TTL_SCORERS_BACKUP = 7 * 86400;
const TTL_ROUNDS = 86400;

// ─── اللغات المدعومة ──────────────────────────────────────────────────────────
const SUPPORTED_LANGS = ['ar', 'en', 'fr', 'es', 'de', 'it', 'pt', 'tr', 'nl', 'sv', 'ru'];

// ─── الكلمات المفتاحية (SEO) بـ 11 لغة ──────────────────────────────────────
const KEYWORDS_TEMPLATES = {
  ar: { match: 'مباراة', against: 'ضد', today: 'اليوم', live: 'مباشر', result: 'نتيجة', final: 'النهائي', league: 'الدوري', championship: 'بطولة', cup: 'كأس', round: 'الجولة', standings: 'ترتيب', scorers: 'هدافون' },
  en: { match: 'match', against: 'vs', today: 'today', live: 'live', result: 'result', final: 'final', league: 'league', championship: 'championship', cup: 'cup', round: 'round', standings: 'standings', scorers: 'scorers' },
  fr: { match: 'match', against: 'contre', today: "aujourd'hui", live: 'en direct', result: 'résultat', final: 'finale', league: 'championnat', championship: 'championnat', cup: 'coupe', round: 'journée', standings: 'classement', scorers: 'buteurs' },
  es: { match: 'partido', against: 'contra', today: 'hoy', live: 'en vivo', result: 'resultado', final: 'final', league: 'liga', championship: 'campeonato', cup: 'copa', round: 'jornada', standings: 'clasificación', scorers: 'goleadores' },
  de: { match: 'Spiel', against: 'gegen', today: 'heute', live: 'live', result: 'Ergebnis', final: 'Finale', league: 'Liga', championship: 'Meisterschaft', cup: 'Pokal', round: 'Spieltag', standings: 'Tabelle', scorers: 'Torschützen' },
  it: { match: 'partita', against: 'contro', today: 'oggi', live: 'in diretta', result: 'risultato', final: 'finale', league: 'campionato', championship: 'campionato', cup: 'coppa', round: 'giornata', standings: 'classifica', scorers: 'marcatori' },
  pt: { match: 'jogo', against: 'contra', today: 'hoje', live: 'ao vivo', result: 'resultado', final: 'final', league: 'campeonato', championship: 'campeonato', cup: 'copa', round: 'rodada', standings: 'classificação', scorers: 'artilheiros' },
  tr: { match: 'maç', against: 'karşı', today: 'bugün', live: 'canlı', result: 'sonuç', final: 'final', league: 'lig', championship: 'şampiyona', cup: 'kupa', round: 'hafta', standings: 'puan durumu', scorers: 'gol kralları' },
  nl: { match: 'wedstrijd', against: 'tegen', today: 'vandaag', live: 'live', result: 'uitslag', final: 'finale', league: 'competitie', championship: 'kampioenschap', cup: 'beker', round: 'speelronde', standings: 'stand', scorers: 'doelpuntenmakers' },
  sv: { match: 'match', against: 'mot', today: 'idag', live: 'live', result: 'resultat', final: 'final', league: 'liga', championship: 'mästerskap', cup: 'cup', round: 'omgång', standings: 'tabell', scorers: 'skyttar' },
  ru: { match: 'матч', against: 'против', today: 'сегодня', live: 'в прямом эфире', result: 'результат', final: 'финал', league: 'лига', championship: 'чемпионат', cup: 'кубок', round: 'тур', standings: 'турнирная таблица', scorers: 'бомбардиры' }
};

// ─── أسماء الفرق بـ 11 لغة ──────────────────────────────────────────────────
const TEAM_NAMES_I18N = {
  'ليفربول': { ar: 'ليفربول', en: 'Liverpool', fr: 'Liverpool', es: 'Liverpool', de: 'Liverpool', it: 'Liverpool', pt: 'Liverpool', tr: 'Liverpool', nl: 'Liverpool', sv: 'Liverpool', ru: 'Ливерпуль' },
  'مانشستر سيتي': { ar: 'مانشستر سيتي', en: 'Manchester City', fr: 'Manchester City', es: 'Manchester City', de: 'Manchester City', it: 'Manchester City', pt: 'Manchester City', tr: 'Manchester City', nl: 'Manchester City', sv: 'Manchester City', ru: 'Манчестер Сити' },
  'مانشستر يونايتد': { ar: 'مانشستر يونايتد', en: 'Manchester United', fr: 'Manchester United', es: 'Manchester United', de: 'Manchester United', it: 'Manchester United', pt: 'Manchester United', tr: 'Manchester United', nl: 'Manchester United', sv: 'Manchester United', ru: 'Манчестер Юнайтед' },
  'أرسنال': { ar: 'أرسنال', en: 'Arsenal', fr: 'Arsenal', es: 'Arsenal', de: 'Arsenal', it: 'Arsenal', pt: 'Arsenal', tr: 'Arsenal', nl: 'Arsenal', sv: 'Arsenal', ru: 'Арсенал' },
  'تشيلسي': { ar: 'تشيلسي', en: 'Chelsea', fr: 'Chelsea', es: 'Chelsea', de: 'Chelsea', it: 'Chelsea', pt: 'Chelsea', tr: 'Chelsea', nl: 'Chelsea', sv: 'Chelsea', ru: 'Челси' },
  'توتنهام': { ar: 'توتنهام', en: 'Tottenham', fr: 'Tottenham', es: 'Tottenham', de: 'Tottenham', it: 'Tottenham', pt: 'Tottenham', tr: 'Tottenham', nl: 'Tottenham', sv: 'Tottenham', ru: 'Тоттенхэм' },
  'ريال مدريد': { ar: 'ريال مدريد', en: 'Real Madrid', fr: 'Real Madrid', es: 'Real Madrid', de: 'Real Madrid', it: 'Real Madrid', pt: 'Real Madrid', tr: 'Real Madrid', nl: 'Real Madrid', sv: 'Real Madrid', ru: 'Реал Мадрид' },
  'برشلونة': { ar: 'برشلونة', en: 'Barcelona', fr: 'Barcelone', es: 'Barcelona', de: 'Barcelona', it: 'Barcellona', pt: 'Barcelona', tr: 'Barcelona', nl: 'Barcelona', sv: 'Barcelona', ru: 'Барселона' },
  'بايرن ميونخ': { ar: 'بايرن ميونخ', en: 'Bayern Munich', fr: 'Bayern Munich', es: 'Bayern Munich', de: 'Bayern München', it: 'Bayern Monaco', pt: 'Bayern de Munique', tr: 'Bayern Münih', nl: 'Bayern München', sv: 'Bayern München', ru: 'Бавария' },
  'باريس سان جيرمان': { ar: 'باريس سان جيرمان', en: 'Paris SG', fr: 'Paris SG', es: 'Paris SG', de: 'Paris SG', it: 'Paris SG', pt: 'Paris SG', tr: 'Paris SG', nl: 'Paris SG', sv: 'Paris SG', ru: 'ПСЖ' },
  'الهلال': { ar: 'الهلال', en: 'Al-Hilal', fr: 'Al-Hilal', es: 'Al-Hilal', de: 'Al-Hilal', it: 'Al-Hilal', pt: 'Al-Hilal', tr: 'Al-Hilal', nl: 'Al-Hilal', sv: 'Al-Hilal', ru: 'Аль-Хиляль' },
  'النصر': { ar: 'النصر', en: 'Al-Nassr', fr: 'Al-Nassr', es: 'Al-Nassr', de: 'Al-Nassr', it: 'Al-Nassr', pt: 'Al-Nassr', tr: 'Al-Nassr', nl: 'Al-Nassr', sv: 'Al-Nassr', ru: 'Аль-Наср' },
  'الأهلي': { ar: 'الأهلي', en: 'Al-Ahly', fr: 'Al-Ahly', es: 'Al-Ahly', de: 'Al-Ahly', it: 'Al-Ahly', pt: 'Al-Ahly', tr: 'Al-Ahly', nl: 'Al-Ahly', sv: 'Al-Ahly', ru: 'Аль-Ахли' },
  'الزمالك': { ar: 'الزمالك', en: 'Zamalek', fr: 'Zamalek', es: 'Zamalek', de: 'Zamalek', it: 'Zamalek', pt: 'Zamalek', tr: 'Zamalek', nl: 'Zamalek', sv: 'Zamalek', ru: 'Замалек' }
};

// ─── أسماء الدوريات بـ 11 لغة ──────────────────────────────────────────────
const LEAGUE_NAMES_I18N = {
  'eng.1': { ar: 'الدوري الإنجليزي الممتاز', en: 'Premier League', fr: 'Premier League', es: 'Premier League', de: 'Premier League', it: 'Premier League', pt: 'Premier League', tr: 'Premier Lig', nl: 'Premier League', sv: 'Premier League', ru: 'Премьер-лига' },
  'esp.1': { ar: 'الليغا الإسبانية', en: 'La Liga', fr: 'La Liga', es: 'La Liga', de: 'La Liga', it: 'La Liga', pt: 'La Liga', tr: 'La Liga', nl: 'La Liga', sv: 'La Liga', ru: 'Ла Лига' },
  'ger.1': { ar: 'الدوري الألماني', en: 'Bundesliga', fr: 'Bundesliga', es: 'Bundesliga', de: 'Bundesliga', it: 'Bundesliga', pt: 'Bundesliga', tr: 'Bundesliga', nl: 'Bundesliga', sv: 'Bundesliga', ru: 'Бундеслига' },
  'ita.1': { ar: 'الدوري الإيطالي', en: 'Serie A', fr: 'Serie A', es: 'Serie A', de: 'Serie A', it: 'Serie A', pt: 'Serie A', tr: 'Serie A', nl: 'Serie A', sv: 'Serie A', ru: 'Серия А' },
  'fra.1': { ar: 'الدوري الفرنسي', en: 'Ligue 1', fr: 'Ligue 1', es: 'Ligue 1', de: 'Ligue 1', it: 'Ligue 1', pt: 'Ligue 1', tr: 'Ligue 1', nl: 'Ligue 1', sv: 'Ligue 1', ru: 'Лига 1' },
  'sau.1': { ar: 'الدوري السعودي', en: 'Saudi League', fr: 'Ligue Saoudienne', es: 'Liga Saudí', de: 'Saudi Liga', it: 'Lega Saudita', pt: 'Liga Saudita', tr: 'Suudi Ligi', nl: 'Saudi League', sv: 'Saudi League', ru: 'Саудовская лига' },
  'egy.1': { ar: 'الدوري المصري', en: 'Egyptian League', fr: 'Ligue Égyptienne', es: 'Liga Egipcia', de: 'Ägyptische Liga', it: 'Lega Egiziana', pt: 'Liga Egípcia', tr: 'Mısır Ligi', nl: 'Egyptische League', sv: 'Egyptiska Ligan', ru: 'Египетская лига' },
  'mar.1': { ar: 'الدوري المغربي', en: 'Moroccan League', fr: 'Ligue Marocaine', es: 'Liga Marroquí', de: 'Marokkanische Liga', it: 'Lega Marocchina', pt: 'Liga Marroquina', tr: 'Fas Ligi', nl: 'Marokkaanse League', sv: 'Marockanska Ligan', ru: 'Марокканская лига' },
  'uefa.champions': { ar: 'دوري أبطال أوروبا', en: 'Champions League', fr: 'Ligue des Champions', es: 'Champions League', de: 'Champions League', it: 'Champions League', pt: 'Champions League', tr: 'Şampiyonlar Ligi', nl: 'Champions League', sv: 'Champions League', ru: 'Лига чемпионов' },
  'fifa.world': { ar: 'كأس العالم', en: 'World Cup', fr: 'Coupe du Monde', es: 'Copa Mundial', de: 'Weltmeisterschaft', it: 'Coppa del Mondo', pt: 'Copa do Mundo', tr: 'Dünya Kupası', nl: 'Wereldkampioenschap', sv: 'Världsmästerskap', ru: 'Чемпионат мира' }
};

// ─── دالة توليد الكلمات المفتاحية ──────────────────────────────────────────
function generateMatchKeywords(match, lang) {
  const home = match.homeTeam || match.home_team?.name || '';
  const away = match.awayTeam || match.away_team?.name || '';
  const league = match.leagueName || match.league || '';
  const state = match.status || match.state || 'pre';
  const t = KEYWORDS_TEMPLATES[lang] || KEYWORDS_TEMPLATES.ar;
  
  const homeName = TEAM_NAMES_I18N[home]?.[lang] || home;
  const awayName = TEAM_NAMES_I18N[away]?.[lang] || away;
  const leagueName = LEAGUE_NAMES_I18N[league]?.[lang] || league;
  
  const keywords = [
    `${homeName} ${t.against} ${awayName}`,
    `${t.match} ${homeName} ${t.against} ${awayName}`,
    `${homeName} ${awayName}`,
    `${homeName} vs ${awayName}`,
    `${homeName} ${t.against} ${awayName} ${t.today}`,
  ];
  
  if (leagueName) {
    keywords.push(`${homeName} ${t.against} ${awayName} ${leagueName}`);
    keywords.push(`${leagueName} ${homeName} ${awayName}`);
  }
  
  if (state === 'in' || state === 'live') {
    keywords.push(`${t.live} ${homeName} ${t.against} ${awayName}`);
    keywords.push(`${homeName} ${t.against} ${awayName} ${t.live}`);
    keywords.push(`${t.result} ${homeName} ${awayName} ${t.live}`);
  } else if (state === 'post' || state === 'finished') {
    keywords.push(`${t.result} ${homeName} ${t.against} ${awayName}`);
    keywords.push(`${homeName} ${t.against} ${awayName} ${t.result}`);
    keywords.push(`${t.match} ${homeName} ${awayName} ${t.final}`);
  } else {
    keywords.push(`${t.match} ${homeName} ${t.against} ${awayName} ${t.today}`);
    keywords.push(`${homeName} ${t.against} ${awayName} ${t.round}`);
  }
  
  return [...new Set(keywords)];
}

// ─── دالة اكتشاف اللغة ──────────────────────────────────────────────────────
function detectLanguage(request) {
  const url = new URL(request.url);
  const langParam = url.searchParams.get('lang');
  if (langParam && SUPPORTED_LANGS.includes(langParam)) return langParam;
  const acceptLang = request.headers.get('Accept-Language') || '';
  const preferred = acceptLang.split(',')[0]?.split('-')[0]?.toLowerCase() || '';
  if (preferred && SUPPORTED_LANGS.includes(preferred)) return preferred;
  return 'ar';
}

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

// ─── CONTINENTAL_RULES ──────────────────────────────────────────────────────
const CONTINENTAL_RULES = {
  'eng.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#81D6AC', 4: '#81D6AC', 5: '#6CABDD', 6: '#B2BFD0', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'esp.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#81D6AC', 4: '#81D6AC', 5: '#6CABDD', 6: '#B2BFD0', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'ita.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#81D6AC', 4: '#81D6AC', 5: '#6CABDD', 6: '#B2BFD0', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'ger.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#81D6AC', 4: '#81D6AC', 5: '#6CABDD', 6: '#B2BFD0', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'fra.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#81D6AC', 4: '#6CABDD', 5: '#6CABDD', 6: '#B2BFD0', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'sau.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#6CABDD', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'egy.1': { 1: '#81D6AC', 2: '#81D6AC', 3: '#6CABDD', '-1': '#FF7F84', '-2': '#FF7F84', '-3': '#FF7F84' },
  'mar.1': { 1: '#81D6AC', 2: '#81D6AC', '-1': '#FF7F84', '-2': '#FF7F84' },
  'uefa.champions': { 1: '#81D6AC', 2: '#81D6AC', 3: '#81D6AC', 4: '#81D6AC', 5: '#81D6AC', 6: '#81D6AC', 7: '#81D6AC', 8: '#81D6AC' },
  'fifa.world': { 1: '#81D6AC', 2: '#81D6AC', 3: '#B2BFD0' },
  'uefa.euro': { 1: '#81D6AC', 2: '#81D6AC', 3: '#B2BFD0' },
  'caf.nations': { 1: '#81D6AC', 2: '#81D6AC', 3: '#B2BFD0' },
};

const ZONE_DESC = {
  '#81D6AC': 'تأهل / صعود',
  '#6CABDD': 'دوري أوروبي / ملحق',
  '#B2BFD0': 'ملحق',
  '#FF7F84': 'هبوط',
};

function getZoneColor(leagueCode, rank, total) {
  const rules = CONTINENTAL_RULES[leagueCode];
  if (!rules) return { color: '', desc: '' };
  if (rules[rank]) return { color: rules[rank], desc: ZONE_DESC[rules[rank]] || '' };
  const neg = rank - total - 1;
  if (rules[neg]) return { color: rules[neg], desc: ZONE_DESC[rules[neg]] || '' };
  return { color: '', desc: '' };
}

// ─── ID_TO_CODE ──────────────────────────────────────────────────────────────
const ID_TO_CODE = {
  '1': 'sco.1', '2': 'uefa.champions', '3': 'uefa.europa', '4': 'tur.1', '5': 'bel.1',
  '6': 'gre.1', '7': 'ned.1', '9': 'fra.1', '10': 'ger.1', '11': 'ger.2',
  '12': 'ger.dfb_pokal', '13': 'ita.1', '14': 'ita.2', '15': 'esp.1', '16': 'esp.2',
  '17': 'esp.copa_del_rey', '18': 'ita.coppa_italia', '19': 'ned.1',
  '21': 'usa.1', '22': 'arg.1', '23': 'eng.1', '24': 'eng.2', '25': 'eng.3',
  '26': 'eng.4', '27': 'eng.5', '28': 'eng.league_cup', '29': 'eng.fa',
  '30': 'eng.community_shield', '33': 'aus.1', '34': 'aut.1',
  '40': 'conmebol.libertadores', '44': 'sco.1', '45': 'nir.1', '46': 'wal.1',
  '48': 'caf.nations', '49': 'caf.nations_qual', '67': 'gre.1', '71': 'tur.1',
  '73': 'uefa.euro', '74': 'uefa.euroq', '80': 'arg.1', '81': 'conmebol.sudamericana',
  '82': 'conmebol.libertadores', '83': 'conmebol.copa', '84': 'afc.asian.cup',
  '85': 'fifa.worldq', '86': 'concacaf.gold', '93': 'ksa.1', '98': 'usa.1',
  '102': 'fra.2', '105': 'por.1', '106': 'por.2', '108': 'rou.1', '112': 'rus.1',
  '113': 'irl.1', '116': 'swe.1', '117': 'nor.1', '118': 'fin.1', '119': 'den.1',
  '120': 'cze.1', '121': 'pol.1', '122': 'sui.1', '123': 'srb.1', '124': 'cro.1',
  '125': 'bul.1', '126': 'hun.1', '127': 'ukr.1', '128': 'svn.1', '129': 'svk.1',
  '131': 'mex.1', '135': 'bra.1', '137': 'chi.1', '141': 'col.1', '143': 'bol.1',
  '147': 'ecu.1', '150': 'par.1', '153': 'per.1', '156': 'uru.1', '159': 'ven.1',
  '163': 'jpn.1', '166': 'ind.1', '167': 'kor.1', '171': 'chn.1', '174': 'mex.1',
  '178': 'tha.1', '179': 'mas.1', '180': 'idn.1', '181': 'sau.1', '182': 'vie.1',
  '186': 'uae.1', '190': 'qat.1', '194': 'bhr.1', '198': 'omn.1', '202': 'syr.1',
  '206': 'jor.1', '210': 'irq.1', '214': 'lbn.1', '218': 'kwt.1', '221': 'can.1',
  '231': 'mar.1', '232': 'tun.1', '233': 'alg.1', '234': 'egy.1', '235': 'rsa.1',
  '236': 'nga.1', '238': 'gha.1', '332': 'bhr.1', '333': 'jor.1', '334': 'kwt.1',
  '335': 'omn.1', '336': 'lbn.1', '338': 'syr.1', '341': 'irn.1', '343': 'irq.1',
  '606': 'fifa.world', '620': 'bol.1', '630': 'bra.1', '640': 'chi.1', '650': 'col.1',
  '660': 'ecu.1', '670': 'per.1', '680': 'uru.1', '745': 'arg.1', '760': 'mex.1',
  '1118': 'alg.1', '1121': 'mar.1', '1123': 'egy.1', '1125': 'qat.1', '1133': 'tun.1',
  '1975': 'caf.champions', '1976': 'caf.confed', '2000': 'conmebol.america',
  '2003': 'conmebol.copa', '2006': 'uefa.euro', '2010': 'fifa.world',
  '2018': 'caf.nations', '2199': 'afc.champions', '2201': 'concacaf.champions',
  '2305': 'uefa.nations', '2310': 'uefa.europa.conf', '2311': 'uefa.super_cup',
  '2329': 'concacaf.nations', '2350': 'afc.champions.elite',
  '3904': 'arg.2', '3913': 'den.1', '3928': 'nor.1', '3930': 'irl.1', '3932': 'mex.2',
  '3934': 'par.1', '3939': 'rus.1', '3943': 'fin.1', '3945': 'swe.1', '4002': 'usa.2',
  '4003': 'arg.3', '4007': 'bra.2', '4012': 'pol.1', '4016': 'cze.1', '4020': 'ukr.1',
  '4024': 'cro.1', '4028': 'srb.1', '4032': 'bul.1', '4036': 'hun.1', '4040': 'rou.1',
  '4044': 'svk.1', '4048': 'svn.1', '4052': 'bel.1', '4056': 'tur.1', '4060': 'gre.1',
  '4064': 'sui.1', '4068': 'aut.1', '4072': 'por.1', '4076': 'sco.1',
  '5672': 'afc.asean', '8301': 'usa.nwsl', '8376': 'chn.1', '11088': 'bra.3',
  '18318': 'afc.champions', '19159': 'caf.champions', '19834': 'friendly',
  '19874': 'fifa.cwc', '20296': 'afc.champions.elite', '20226': 'concacaf.champions',
  '21604': 'afc.asian.cup', '23286': 'can.1', '5330': 'sco.cis', '5336': 'sco.tennents',
  '10000': 'caf.wnations', '10001': 'afc.wasian', '10002': 'conmebol.wamerica',
  '12196': 'jpn.1', '12243': 'kor.1', '14143': 'chn.1', '15135': 'ind.1',
  '16296': 'aus.1', '17282': 'tha.1', '17283': 'idn.1', '17284': 'mas.1', '17285': 'vie.1',
};

function isBareNumber(v) { return /^\d+$/.test(String(v || '').trim()); }

function slugifyLeagueName(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return '';
  const clean = n.replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return clean ? `unmapped.${clean}` : '';
}

function ensureLetterCode(candidate, nameHint, fallback) {
  const c = String(candidate || '').trim();
  if (c && !isBareNumber(c)) return c;
  const byName = resolveLeagueFromName(nameHint || '');
  if (byName) return byName;
  const slug = slugifyLeagueName(nameHint);
  return slug || fallback || 'eng.1';
}

async function resolveLeagueSlug(leagueId, env, nameHint = '') {
  if (!leagueId) return 'eng.1';
  const s = String(leagueId);
  if (s.includes('.')) return s;
  if (ID_TO_CODE[s]) {
    const knownCode = ID_TO_CODE[s];
    try { await env?.FOOTBALL_KV?.put(`slug2_${s}`, knownCode); } catch {}
    return knownCode;
  }
  const kvKey = `slug2_${s}`;
  try {
    const cached = await env?.FOOTBALL_KV?.get(kvKey);
    if (cached && cached !== 'eng.1' && !cached.startsWith('unknown.')) return cached;
  } catch {}
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${today}&limit=500`);
    if (res.ok) {
      const data = await res.json();
      for (const ev of (data.events || [])) {
        const espnSlug = ev.leagues?.[0]?.slug || '';
        const uid = ev.uid || '';
        const m = uid.match(/~l:(\d+)~/);
        if (m && m[1] === s) {
          if (espnSlug && espnSlug.includes('.')) {
            try { await env?.FOOTBALL_KV?.put(kvKey, espnSlug); } catch {}
            return espnSlug;
          }
          break;
        }
      }
    }
  } catch {}
  const byName = resolveLeagueFromName(nameHint || '');
  if (byName) {
    try { await env?.FOOTBALL_KV?.put(kvKey, byName); } catch {}
    return byName;
  }
  const unknown = `unknown.${s}`;
  try { await env?.FOOTBALL_KV?.put(kvKey, unknown, { expirationTtl: 3600 }); } catch {}
  return unknown;
}

function normalizeLeague(league, leagueName = '') {
  if (!league) return 'eng.1';
  const s = String(league).trim();
  if (s.includes('.')) return s;
  if (!isNaN(s) && ID_TO_CODE[s]) return ID_TO_CODE[s];
  if (leagueName) return resolveLeagueFromName(leagueName) || s;
  return s;
}

function resolveLeagueFromName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('premier league') || n.includes('english premier')) return 'eng.1';
  if (n.includes('la liga') || n.includes('laliga')) return 'esp.1';
  if (n.includes('bundesliga') && !n.includes('2.')) return 'ger.1';
  if (n.includes('serie a') && !n.includes('b')) return 'ita.1';
  if (n.includes('ligue 1') && !n.includes('2')) return 'fra.1';
  if (n.includes('eredivisie')) return 'ned.1';
  if (n.includes('champions league')) return 'uefa.champions';
  if (n.includes('europa league')) return 'uefa.europa';
  if (n.includes('conference league')) return 'uefa.europa.conf';
  if (n.includes('copa libertadores')) return 'conmebol.libertadores';
  if (n.includes('sudamericana')) return 'conmebol.sudamericana';
  if (n.includes('copa america') || n.includes('conmebol copa')) return 'conmebol.america';
  if (n.includes('world cup') && !n.includes('qualifier')) return 'fifa.world';
  if (n.includes('brasileiro') || n.includes('brasileirão')) return 'bra.1';
  if (n.includes('saudi') || n.includes('roshn')) return 'sau.1';
  if (n.includes('egyptian premier') || n.includes('egypt premier')) return 'egy.1';
  if (n.includes('moroccan') || n.includes('botola')) return 'mar.1';
  if (n.includes('algerian') || n.includes('algérie')) return 'alg.1';
  if (n.includes('tunisian') || n.includes('tunisie')) return 'tun.1';
  if (n.includes('iraqi') || n.includes('iraq stars')) return 'irq.1';
  if (n.includes('uae') || n.includes('arabian gulf') || n.includes('adnoc')) return 'uae.1';
  if (n.includes('qatar stars') || n.includes('qsl')) return 'qat.1';
  if (n.includes('j1 league') || n.includes('j league')) return 'jpn.1';
  if (n.includes('k league')) return 'kor.1';
  if (n.includes('chinese super') || n.includes('china super')) return 'chn.1';
  if (n.includes('mls') || n.includes('major league soccer')) return 'usa.1';
  if (n.includes('greek super')) return 'gre.1';
  if (n.includes('turkish super') || n.includes('süper lig')) return 'tur.1';
  if (n.includes('scottish premiership') || n.includes('spfl')) return 'sco.1';
  if (n.includes('primeira liga') || n.includes('liga nos')) return 'por.1';
  if (n.includes('pro league') && n.includes('belg')) return 'bel.1';
  if (n.includes('swiss super')) return 'sui.1';
  if (n.includes('austrian bundesliga')) return 'aut.1';
  return '';
}

// ─── SEASON_OVERRIDE ──────────────────────────────────────────────────────────
const SEASON_OVERRIDE = {
  'fifa.world': '2026', 'fifa.worldq': '2026', 'fifa.worldq.uefa': '2026',
  'fifa.worldq.conmebol': '2026', 'fifa.worldq.concacaf': '2026',
  'fifa.worldq.afc': '2026', 'fifa.worldq.caf': '2026', 'fifa.worldq.ofc': '2026',
  'uefa.euro': '2024', 'conmebol.copa': '2024', 'conmebol.america': '2024',
  'uefa.nations': '2025', 'afc.champions.elite': '2025',
};

function getSeasonParam(league) {
  if (SEASON_OVERRIDE[league]) return `?season=${SEASON_OVERRIDE[league]}`;
  if (league.includes('worldq')) return '?season=2026';
  return '?season=2026';
}

// ─── LEAGUE_FLAGS ─────────────────────────────────────────────────────────────
const LEAGUE_FLAGS = {
  'eng.1': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'esp.1': '🇪🇸', 'ita.1': '🇮🇹', 'ger.1': '🇩🇪', 'fra.1': '🇫🇷',
  'sau.1': '🇸🇦', 'egy.1': '🇪🇬', 'mar.1': '🇲🇦', 'uae.1': '🇦🇪', 'qat.1': '🇶🇦',
  'bra.1': '🇧🇷', 'arg.1': '🇦🇷', 'mex.1': '🇲🇽', 'usa.1': '🇺🇸',
  'jpn.1': '🇯🇵', 'kor.1': '🇰🇷', 'chn.1': '🇨🇳', 'tur.1': '🇹🇷',
  'uefa.champions': '🏆', 'uefa.europa': '🏆', 'uefa.europa.conf': '🏆',
  'fifa.world': '🌍', 'uefa.euro': '🇪🇺', 'caf.nations': '🏆',
  'conmebol.libertadores': '🏆', 'conmebol.sudamericana': '🏆', 'conmebol.america': '🏆',
};

function getFlag(leagueCode, leagueName = '') {
  if (LEAGUE_FLAGS[leagueCode]) return LEAGUE_FLAGS[leagueCode];
  const n = (leagueName || '').toLowerCase();
  if (n.includes('champions')) return '🏆';
  if (n.includes('world cup') || n.includes('mundial')) return '🌍';
  if (n.includes('euro')) return '🇪🇺';
  if (n.includes('africa') || n.includes('afcon')) return '🌍';
  if (n.includes('asia')) return '🌏';
  return '⚽';
}

// ─── LEAGUE_NAMES (Arabic) ────────────────────────────────────────────────────
const LEAGUE_NAMES = {
  'eng.1': 'الدوري الإنجليزي الممتاز', 'esp.1': 'الليغا الإسبانية',
  'ita.1': 'الدوري الإيطالي', 'ger.1': 'البوندسليغا الألمانية',
  'fra.1': 'الدوري الفرنسي', 'sau.1': 'الدوري السعودي',
  'egy.1': 'الدوري المصري', 'mar.1': 'الدوري المغربي',
  'uae.1': 'دوري الخليج الإماراتي', 'qat.1': 'دوري نجوم قطر',
  'bra.1': 'الدوري البرازيلي', 'arg.1': 'الدوري الأرجنتيني',
  'mex.1': 'الدوري المكسيكي', 'usa.1': 'الدوري الأمريكي',
  'jpn.1': 'الدوري الياباني', 'kor.1': 'الدوري الكوري',
  'chn.1': 'الدوري الصيني', 'tur.1': 'الدوري التركي',
  'uefa.champions': 'دوري أبطال أوروبا', 'uefa.europa': 'الدوري الأوروبي',
  'uefa.europa.conf': 'دوري المؤتمر الأوروبي', 'fifa.world': 'كأس العالم',
  'uefa.euro': 'بطولة أوروبا', 'caf.nations': 'كأس الأمم الأفريقية',
  'conmebol.libertadores': 'كوبا ليبرتادوريس', 'conmebol.sudamericana': 'كوبا سودأمريكانا',
  'conmebol.america': 'كوبا أمريكا', 'uefa.nations': 'دوري الأمم الأوروبية',
};

// ─── parseEvent ──────────────────────────────────────────────────────────────
function parseEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
  const away = comp.competitors?.find(c => c.homeAway === 'away') || {};
  const status = ev.status?.type || {};
  const espnSlug = ev.leagues?.[0]?.slug || '';
  const uid = ev.uid || '';
  const leagueId = uid.match(/~l:(\d+)~/)?.[1] || '';
  const leagueName_raw = ev.leagues?.[0]?.name || (comp.altGameNote || '').split(',')?.[0]?.trim() || '';
  let leagueCode = '';
  if (espnSlug && espnSlug.includes('.')) {
    leagueCode = espnSlug;
  } else if (leagueId && ID_TO_CODE[leagueId]) {
    leagueCode = ID_TO_CODE[leagueId];
  } else if (leagueName_raw) {
    leagueCode = resolveLeagueFromName(leagueName_raw) || espnSlug || '';
  } else {
    leagueCode = espnSlug || '';
  }
  leagueCode = ensureLetterCode(leagueCode, leagueName_raw, '');
  const altNote = comp.altGameNote || '';
  const parts = altNote.split(',').map(s => s.trim());
  const leagueName = LEAGUE_NAMES[leagueCode] || parts[0] || leagueName_raw || leagueCode || '';
  const leagueFlag = getFlag(leagueCode, leagueName);
  const statusState = status.state || 'pre';
  const statusText = status.shortDetail || '';
  const isHalfTime = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
  const penHome = home.shootoutScore ?? null;
  const penAway = away.shootoutScore ?? null;
  return {
    id: ev.id, league: leagueCode, leagueName, leagueFlag,
    leagueNameRaw: parts[0] || leagueName_raw || leagueCode,
    leagueStage: parts.slice(1).join(', ') || '',
    date: ev.date,
    homeTeam: home.team?.displayName || '', homeLogo: home.team?.logo || '', homeScore: home.score ?? '',
    awayTeam: away.team?.displayName || '', awayLogo: away.team?.logo || '', awayScore: away.score ?? '',
    status: statusState, statusText, isHalfTime, minute: ev.status?.displayClock || '',
    penaltyScore: (penHome !== null && penAway !== null) ? `${penHome}-${penAway}` : null,
    venue: comp.venue?.fullName || '',
  };
}

function todayEspn() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}

// ─── /api/matches ─────────────────────────────────────────────────────────────
async function handleMatches(url, env) {
  const date = url.searchParams.get('date') || todayEspn();
  const lang = url.searchParams.get('lang') || 'ar';
  const kvKey = `matches_v4_${date}`;
  const isToday = date === todayEspn();
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    const res = await fetch(`${ESPN_ALL}?dates=${date}&limit=500`);
    const data = await res.json();
    const matches = (data.events || []).map(parseEvent);
    const hasLive = matches.some(m => m.status === 'in');
    const matchesWithKeywords = matches.map(m => ({
      ...m,
      keywords: generateMatchKeywords(m, lang),
      leagueNameTranslated: LEAGUE_NAMES_I18N[m.league]?.[lang] || m.leagueName
    }));
    const result = { success: true, date, count: matches.length, matches: matchesWithKeywords };
    await kvPut(env, kvKey, result, hasLive ? TTL_LIVE() : isToday ? TTL_MATCHES : TTL_FINISHED);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message });
  }
}

// ─── /api/summary ─────────────────────────────────────────────────────────────
async function handleSummary(url, env) {
  const matchId = url.searchParams.get('matchId');
  let league = url.searchParams.get('league') || '';
  const leagueName_s = url.searchParams.get('leagueName') || '';
  if (league) league = await resolveLeagueSlug(normalizeLeague(league, leagueName_s), env, leagueName_s);
  if (!matchId) return jsonResp({ error: 'matchId required' }, 400);

  const kvKey = `summary_v4_${matchId}`;
  const kvKeyForm = `formation_v1_${matchId}`;
  const cachedStats = await kvGet(env, kvKey);
  if (cachedStats) {
    const cachedForm = await kvGet(env, kvKeyForm);
    if (cachedForm) return jsonResp({ ...cachedStats, ...cachedForm, fromCache: true });
    return jsonResp({ ...cachedStats, fromCache: true });
  }

  const primary = (league && league.includes('.')) ? [league] : [];
  const fallbacks = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'bra.1', 'arg.1', 'ned.1', 'por.1', 'sau.1', 'usa.1', 'conmebol.libertadores', 'uefa.champions', 'fifa.world', 'afc.champions.elite', 'caf.nations', 'tur.1', 'sco.1', 'mex.1', 'jpn.1', 'kor.1', 'uae.1', 'qat.1', 'egy.1', 'mar.1', 'alg.1', 'tun.1'];
  const leaguesToTry = [...primary, ...fallbacks.filter(l => l !== league)];
  let data = null, usedLeague = league;
  for (const lg of leaguesToTry) {
    try {
      const res = await fetch(`${ESPN_BASE}/${lg}/summary?event=${matchId}`);
      if (!res.ok) continue;
      const d = await res.json();
      if (d.header?.competitions?.[0]?.competitors?.length) {
        data = d;
        const espnSlug = d.header?.league?.slug || d.leagues?.[0]?.slug || '';
        const uid = d.header?.competitions?.[0]?.uid || d.header?.uid || '';
        const uidId = uid.match(/~l:(\d+)~/)?.[1] || '';
        if (espnSlug && espnSlug.includes('.')) usedLeague = espnSlug;
        else if (uidId && ID_TO_CODE[uidId]) usedLeague = ID_TO_CODE[uidId];
        else usedLeague = resolveLeagueFromName(d.header?.league?.name || '') || league || lg;
        usedLeague = ensureLetterCode(usedLeague, d.header?.league?.name || leagueName_s, 'eng.1');
        break;
      }
    } catch { continue; }
  }
  if (!data) return jsonResp({ error: 'لم يتم العثور على المباراة' }, 404);

  try {
    const hdr = data.header || {};
    const comp = hdr.competitions?.[0] || {};
    const homeComp = comp.competitors?.find(c => c.homeAway === 'home') || {};
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away') || {};
    const st = comp.status?.type || {};
    const statusState = st.state || 'post';
    const statusText = st.shortDetail || '';
    const isHalfTime = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
    const homeTeamName = homeComp.team?.displayName || '';
    const awayTeamName = awayComp.team?.displayName || '';
    const gi = data.gameInfo?.venue || {};
    const addr = gi.address || {};
    const venue = [gi.fullName, addr.city, addr.country].filter(Boolean).join('، ');
    const altNote = comp.altGameNote || '';
    const altParts = altNote.split(',').map(s => s.trim());
    const leagueNameRaw = altParts[0] || hdr.league?.name || usedLeague;
    const leagueName = LEAGUE_NAMES[usedLeague] || leagueNameRaw;
    const leagueStage = altParts.slice(1).join(', ') || '';
    const leagueFlag = getFlag(usedLeague, leagueNameRaw);
    const penHome = homeComp.shootoutScore ?? null;
    const penAway = awayComp.shootoutScore ?? null;
    const penaltyScore = (penHome !== null && penAway !== null) ? `${penHome}-${penAway}` : null;
    const homeRoster = data.rosters?.find(r => r.homeAway === 'home');
    const awayRoster = data.rosters?.find(r => r.homeAway === 'away');
    const mapLineup = rosterObj => (rosterObj?.roster || []).map(p => ({ name: p.athlete?.displayName || '', shortName: p.athlete?.shortName || '', jersey: p.jersey || '', position: p.position?.abbreviation || '', starter: p.starter ?? false, subbedIn: p.subbedIn ?? false, subbedOut: p.subbedOut ?? false }));
    const { goals, cards, subs, homeSubs, awaySubs } = extractEvents(data, homeTeamName, awayTeamName);
    const homeStats = (data.boxscore?.teams?.find(t => t.homeAway === 'home')?.statistics || data.boxscore?.teams?.[0]?.statistics || []).map(s => ({ name: s.label || s.name, value: s.displayValue }));
    const awayStats = (data.boxscore?.teams?.find(t => t.homeAway === 'away')?.statistics || data.boxscore?.teams?.[1]?.statistics || []).map(s => ({ name: s.label || s.name, value: s.displayValue }));
    const result = {
      success: true, id: matchId, league: usedLeague, leagueName, leagueFlag, leagueStage,
      leagueGroup: comp.groups?.name || '', advancesNote: (comp.notes || []).find(n => n.text?.includes('advances'))?.text || '',
      venue, date: comp.date,
      homeTeam: homeTeamName, homeLogo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || '',
      homeScore: homeComp.score || '0', penaltyScore,
      awayTeam: awayTeamName, awayLogo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || '',
      awayScore: awayComp.score || '0',
      homeWinner: homeComp.winner ?? false, awayWinner: awayComp.winner ?? false,
      status: statusState, statusText, isHalfTime, minute: comp.status?.displayClock || '',
      homeFormation: homeRoster?.formation || '', awayFormation: awayRoster?.formation || '',
      goals, cards, subs, homeSubs, awaySubs,
      homeLineup: mapLineup(homeRoster), awayLineup: mapLineup(awayRoster),
      homeStats, awayStats,
    };
    if (statusState === 'in') {
      const formData = { homeFormation: result.homeFormation, awayFormation: result.awayFormation, homeLineup: result.homeLineup, awayLineup: result.awayLineup };
      const statsData = { ...result };
      delete statsData.homeFormation; delete statsData.awayFormation; delete statsData.homeLineup; delete statsData.awayLineup;
      const formAlreadyCached = await kvGet(env, kvKeyForm);
      if (!formAlreadyCached) await kvPut(env, kvKeyForm, formData, TTL_FORMATION);
      await kvPut(env, kvKey, statsData, TTL_SUMMARY());
    } else {
      await kvPut(env, kvKey, result, TTL_FINISHED);
    }
    return jsonResp(result);
  } catch (e) { return jsonResp({ error: e.message }, 500); }
}

function extractEvents(data, homeTeamName, awayTeamName) {
  const goals = [], cards = [], subs = [];
  const seen = new Set();
  const keyEvents = data.keyEvents || [];
  const jerseyMap = {};
  for (const ro of (data.rosters || []))
    for (const p of (ro.roster || []))
      if (p.athlete?.displayName && p.jersey) jerseyMap[p.athlete.displayName] = p.jersey;

  for (const ev of keyEvents) {
    const t = (ev.type?.type || ev.type?.text || '').toLowerCase().replace(/-/g, '');
    const min = ev.clock?.displayValue || '';
    const add = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
    const fullMin = min ? `${min}${add}` : '';
    const team = ev.team?.displayName || '';
    const pp = ev.participants || [];
    const p1 = pp[0]?.athlete?.displayName || '';
    const key = `${t}_${fullMin}_${p1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (t === 'goal' || t === 'owngoal' || t === 'penaltyscored' || (t.includes('penalty') && !t.includes('miss') && !t.includes('save')))
      goals.push({ minute: fullMin, player: p1, assist: pp[1]?.athlete?.displayName || '', team, type: t === 'owngoal' ? 'ownGoal' : (t.includes('penalty') ? 'penalty' : 'goal') });
    if (t === 'yellowcard') cards.push({ minute: fullMin, player: p1, team, type: 'yellowCard' });
    if (t === 'redcard') cards.push({ minute: fullMin, player: p1, team, type: 'redCard' });
    if (t === 'yellowredcard') cards.push({ minute: fullMin, player: p1, team, type: 'yellowRedCard' });
  }

  if (goals.length === 0) {
    for (const det of (data.header?.competitions?.[0]?.details || [])) {
      if (!det.scoringPlay) continue;
      const min = det.clock?.displayValue || '';
      const add = det.addedClock?.displayValue ? `+${det.addedClock.displayValue}` : '';
      const full = min ? `${min}${add}` : '';
      const player = det.participants?.[0]?.athlete?.displayName || '';
      const key = `goal_${full}_${player}`;
      if (seen.has(key)) continue;
      seen.add(key);
      goals.push({ minute: full, player, assist: det.participants?.[1]?.athlete?.displayName || '', team: det.team?.displayName || '', type: det.ownGoal ? 'ownGoal' : det.penaltyKick ? 'penalty' : 'goal' });
    }
  }

  for (const play of (data.plays || [])) {
    const typeText = (play.type?.text || '').toLowerCase();
    if (!typeText.includes('substitut')) continue;
    const min = play.clock?.displayValue || '';
    const add = play.addedClock?.displayValue ? `+${play.addedClock.displayValue}` : '';
    const full = min ? `${min}${add}` : '';
    const team = play.team?.displayName || '';
    const pp = play.participants || [];
    const pOut = pp.find(p => p.type === 'playerSubstituted') || pp[0] || {};
    const pIn = pp.find(p => p.type === 'playerSubstituting') || pp[1] || {};
    const playerOut = pOut.athlete?.displayName || pOut.displayName || '';
    const playerIn = pIn.athlete?.displayName || pIn.displayName || '';
    if (!playerOut && !playerIn) continue;
    const key = `sub_${full}_${playerOut}_${playerIn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subs.push({ minute: full, playerIn: playerIn || '—', playerOut: playerOut || '—', jerseyIn: jerseyMap[playerIn] || '', jerseyOut: jerseyMap[playerOut] || '', team });
  }

  if (subs.length === 0) {
    for (const ev of keyEvents) {
      const t = (ev.type?.type || '').toLowerCase().replace(/-/g, '');
      if (!t.includes('substitut')) continue;
      const min = ev.clock?.displayValue || '';
      const add = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
      const full = min ? `${min}${add}` : '';
      const team = ev.team?.displayName || '';
      const pp = ev.participants || [];
      const p1 = pp[0]?.athlete?.displayName || '';
      const p2 = pp[1]?.athlete?.displayName || '';
      const key = `sub_${full}_${p1}_${p2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isOut = t === 'substitutionout';
      subs.push({ minute: full, playerIn: (isOut ? p2 : p1) || '—', playerOut: (isOut ? p1 : p2) || '—', jerseyIn: '', jerseyOut: '', team });
    }
  }

  const sort = arr => arr.sort((a, b) => (parseInt(a.minute) || 0) - (parseInt(b.minute) || 0));
  sort(goals);
  sort(cards);
  sort(subs);
  const homeSubs = subs.filter(s => s.team === homeTeamName);
  const awaySubs = subs.filter(s => s.team === awayTeamName);
  if (!homeSubs.length && !awaySubs.length && subs.length)
    subs.forEach((s, i) => i % 2 === 0 ? homeSubs.push(s) : awaySubs.push(s));
  return { goals, cards, subs, homeSubs, awaySubs };
}

// ─── /api/standings ───────────────────────────────────────────────────────────
async function handleStandings(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName_h = url.searchParams.get('leagueName') || '';
  const seasonParam = url.searchParams.get('season') || '';
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName_h), env, leagueName_h);
  if (seasonParam && SYNC_SEASONS.includes(seasonParam)) {
    const histKey = `standings_v6_${league}_${seasonParam}`;
    const histCached = await kvGet(env, histKey);
    if (histCached) return jsonResp({ ...histCached, fromCache: true });
  }
  const kvKey = `standings_v6_${league}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  const seasonHint = SEASON_OVERRIDE[league];
  const seasonsToTry = seasonHint ? [seasonHint, '2025', '2024'] : ['2026', '2025', '2024', '2023'];
  const urls = [...seasonsToTry.map(s => `${ESPN_STAND}/${league}/standings?season=${s}`), `${ESPN_STAND}/${league}/standings`, ...seasonsToTry.map(s => `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings?season=${s}`)];
  let data = null;
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const d = await res.json();
      if ((d.children || []).some(c => (c.standings?.entries || []).length > 0)) { data = d; break; }
    } catch { continue; }
  }
  if (!data) return jsonResp({ success: false, noStandings: true, groups: [] });
  const groups = [];
  for (const child of (data.children || [])) {
    const groupName = data.children.length > 1 ? (child.name || '') : '';
    const entries = child.standings?.entries || [];
    const teams = entries.map((e, i) => {
      const team = e.team || {};
      const stats = {};
      for (const s of (e.stats || [])) stats[s.name] = s.displayValue ?? s.value ?? 0;
      const rank = parseInt(stats.rank) || i + 1;
      const zone = getZoneColor(league, rank, entries.length);
      return { rank, name: team.displayName || team.name || '---', short: team.abbreviation || '', logo: team.logos?.[0]?.href || team.logo || '', played: parseInt(stats.gamesPlayed) || 0, wins: parseInt(stats.wins) || 0, draws: parseInt(stats.ties ?? stats.draws) || 0, losses: parseInt(stats.losses) || 0, gd: stats.pointDifferential ?? '', points: parseInt(stats.points) || 0, note_color: zone.color, note_description: zone.desc };
    });
    teams.sort((a, b) => a.rank - b.rank);
    groups.push({ name: groupName, teams });
  }
  const legendMap = {};
  groups.forEach(g => g.teams.forEach(t => { if (t.note_color && !legendMap[t.note_color]) legendMap[t.note_color] = t.note_description; }));
  const legend = Object.entries(legendMap).map(([color, desc]) => ({ color, desc }));
  const result = { success: true, league, leagueName: LEAGUE_NAMES[league] || league, groups, legend };
  await kvPut(env, kvKey, result, TTL_STANDINGS);
  return jsonResp(result);
}

// ─── /api/scorers ─────────────────────────────────────────────────────────────
function extractScorers(data) {
  const mapLeaders = (arr) => arr.map((l, i) => ({ rank: i + 1, name: l.athlete?.displayName || l.displayName || l.name || '', photo: l.athlete?.headshot?.href || l.athlete?.flag?.href || '', team: l.team?.displayName || l.athlete?.team?.displayName || '', teamLogo: l.team?.logos?.[0]?.href || l.athlete?.team?.logos?.[0]?.href || '', goals: parseInt(l.value ?? l.displayValue) || 0 }));
  const isGoalCat = (s) => (s.name || '').toLowerCase().includes('goal') || (s.abbreviation || '').toUpperCase() === 'G' || (s.displayName || '').toLowerCase().includes('goal') || (s.shortDisplayName || '').toUpperCase() === 'G';
  for (const key of ['stats', 'statistics', 'categories']) {
    const list = data[key] || data.results?.[key] || [];
    if (list.length) { const cat = list.find(isGoalCat) || list[0]; const leaders = cat?.leaders || cat?.athletes || []; if (leaders.length) return mapLeaders(leaders); }
  }
  const leadersList = data.leaders || data.results?.leaders || [];
  if (leadersList.length) { const cat = leadersList.find(c => isGoalCat(c)) || leadersList[0]; const inner = cat?.leaders || cat?.athletes || cat?.items || []; if (inner.length) return mapLeaders(inner); }
  const coreItems = data.items || [];
  if (coreItems.length && coreItems[0]?.athlete) { return coreItems.map((it, i) => { const goalStat = (it.statistics || []).find(s => (s.name || '').toLowerCase().includes('goal') || s.abbreviation === 'G'); return { rank: i + 1, name: it.athlete?.displayName || '', photo: it.athlete?.headshot?.href || '', team: it.team?.displayName || it.athlete?.team?.displayName || '', teamLogo: it.team?.logos?.[0]?.href || it.athlete?.team?.logos?.[0]?.href || '', goals: parseInt(goalStat?.value ?? goalStat?.displayValue ?? it.value) || 0 }; }); }
  const athletes = data.athletes || [];
  if (athletes.length) return mapLeaders(athletes);
  return [];
}

async function handleScorers(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName = url.searchParams.get('leagueName') || '';
  const season = url.searchParams.get('season') || getSeasonParam(league).replace('?season=', '') || '2026';
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName), env, leagueName);
  const kvKey = `scorers_v8_${league}_${season}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  const backupKey = `scorers_backup_${league}_${season}`;
  const backup = await kvGet(env, backupKey);
  if (backup) return jsonResp({ ...backup, fromCache: true, stale: true });
  return jsonResp({ noCache: true, league, season, kvKey });
}

// ─── POST endpoints ──────────────────────────────────────────────────────────
async function handleScorersSet(url, env, request) {
  const league = url.searchParams.get('league') || '';
  const season = url.searchParams.get('season') || '2026';
  const ttlParam = parseInt(url.searchParams.get('ttl') || '', 10);
  if (!league) return jsonResp({ error: 'league required' }, 400);
  try {
    const body = await request.json();
    const kvKey = `scorers_v8_${league}_${season}`;
    const ttl = (Number.isFinite(ttlParam) && ttlParam > 0) ? Math.min(Math.max(ttlParam, 300), 86400) : TTL_SCORERS;
    await kvPut(env, kvKey, body, ttl);
    const backupKey = `scorers_backup_${league}_${season}`;
    await kvPut(env, backupKey, body, TTL_SCORERS_BACKUP);
    return jsonResp({ ok: true, kvKey, ttl });
  } catch (e) { return jsonResp({ error: e.message }, 500); }
}

async function handleRoundsSet(url, env, request) {
  const league = url.searchParams.get('league') || '';
  const season = url.searchParams.get('season') || '2026';
  if (!league) return jsonResp({ error: 'league required' }, 400);
  try {
    const body = await request.json();
    const kvKey = `rounds_v4_${league}_${season}`;
    await kvPut(env, kvKey, body, TTL_ROUNDS);
    return jsonResp({ ok: true, kvKey, ttl: TTL_ROUNDS });
  } catch (e) { return jsonResp({ error: e.message }, 500); }
}

async function handleMatchesSet(url, env, request) {
  const cacheKey = url.searchParams.get('cacheKey') || '';
  if (!cacheKey) return jsonResp({ error: 'cacheKey required' }, 400);
  try {
    const body = await request.json();
    const hasLive = (body.matches || []).some(m => m.status === 'in' || m.state === 'in');
    const ttl = hasLive ? TTL_LIVE() : TTL_ROUND_MATCHES;
    await kvPut(env, cacheKey, body, ttl);
    return jsonResp({ ok: true, cacheKey, ttl });
  } catch (e) { return jsonResp({ error: e.message }, 500); }
}

// ─── Historical Sync ──────────────────────────────────────────────────────────
function dateToEspn(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }

function parseDateStr(s) { return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8))); }

const SYNC_LEAGUES = Object.keys(LEAGUE_NAMES);
const SYNC_SEASONS = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
const HIST_STATE_KEY = 'historical_sync_state_v1';

async function fetchStandingsForSeason(league, season) {
  const urls = [`${ESPN_STAND}/${league}/standings?season=${season}`, `${ESPN_STAND}/${league}/standings?season=${parseInt(season) - 1}`, `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings?season=${season}`];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const d = await res.json();
      if (!(d.children || []).some(c => (c.standings?.entries || []).length > 0)) continue;
      const groups = [];
      for (const child of (d.children || [])) {
        const groupName = d.children.length > 1 ? (child.name || '') : '';
        const entries = child.standings?.entries || [];
        const teams = entries.map((e, i) => {
          const team = e.team || {};
          const stats = {};
          for (const s of (e.stats || [])) stats[s.name] = s.displayValue ?? s.value ?? 0;
          const rank = parseInt(stats.rank) || i + 1;
          const zone = getZoneColor(league, rank, entries.length);
          return { rank, name: team.displayName || team.name || '---', short: team.abbreviation || '', logo: team.logos?.[0]?.href || team.logo || '', played: parseInt(stats.gamesPlayed) || 0, wins: parseInt(stats.wins) || 0, draws: parseInt(stats.ties ?? stats.draws) || 0, losses: parseInt(stats.losses) || 0, gd: stats.pointDifferential ?? '', points: parseInt(stats.points) || 0, note_color: zone.color, note_description: zone.desc };
        });
        teams.sort((a, b) => a.rank - b.rank);
        groups.push({ name: groupName, teams });
      }
      const legendMap = {};
      groups.forEach(g => g.teams.forEach(t => { if (t.note_color && !legendMap[t.note_color]) legendMap[t.note_color] = t.note_description; }));
      const legend = Object.entries(legendMap).map(([color, desc]) => ({ color, desc }));
      return { success: true, league, season, leagueName: LEAGUE_NAMES[league] || league, groups, legend };
    } catch { continue; }
  }
  return null;
}

async function runHistoricalSync(env, maxOps = 6) {
  let state = await kvGet(env, HIST_STATE_KEY) || { phase: 'matches', cursor: '20200101' };
  if (state.phase === 'done') return { done: true, msg: 'المزامنة التاريخية مكتملة ✅' };
  const todayStr = todayEspn();
  let opsLeft = maxOps;
  if (state.phase === 'matches') {
    let cursor = parseDateStr(state.cursor);
    while (opsLeft > 0 && dateToEspn(cursor) <= todayStr) {
      const dayStr = dateToEspn(cursor);
      const checkKey = `matches_v4_${dayStr}`;
      const already = await kvGet(env, checkKey);
      if (!already) {
        try {
          const res = await fetch(`${ESPN_ALL}?dates=${dayStr}&limit=500`);
          if (res.ok) {
            const matches = ((await res.json()).events || []).map(parseEvent);
            await kvPut(env, checkKey, { success: true, date: dayStr, count: matches.length, matches }, TTL_FINISHED);
          }
        } catch {}
        opsLeft--;
        if (opsLeft > 0) await new Promise(r => setTimeout(r, 400));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const newCursor = dateToEspn(cursor);
    if (newCursor > todayStr) { state = { phase: 'standings', seasonIdx: 0, leagueIdx: 0 }; } else { state = { phase: 'matches', cursor: newCursor }; }
    await kvPut(env, HIST_STATE_KEY, state, null);
    return { done: false, phase: 'matches', nextCursor: newCursor, opsRemaining: opsLeft };
  }
  if (state.phase === 'standings') {
    let { seasonIdx, leagueIdx } = state;
    while (opsLeft > 0) {
      if (seasonIdx >= SYNC_SEASONS.length) { state = { phase: 'done' }; await kvPut(env, HIST_STATE_KEY, state, null); return { done: true, msg: 'المزامنة التاريخية مكتملة ✅' }; }
      if (leagueIdx >= SYNC_LEAGUES.length) { seasonIdx++; leagueIdx = 0; continue; }
      const season = SYNC_SEASONS[seasonIdx];
      const league = SYNC_LEAGUES[leagueIdx];
      const kvKey = `standings_v6_${league}_${season}`;
      const already = await kvGet(env, kvKey);
      if (!already) {
        try { const data = await fetchStandingsForSeason(league, season); if (data) await kvPut(env, kvKey, data, null); } catch {}
        opsLeft--;
        if (opsLeft > 0) await new Promise(r => setTimeout(r, 250));
      }
      leagueIdx++;
    }
    state = { phase: 'standings', seasonIdx, leagueIdx };
    await kvPut(env, HIST_STATE_KEY, state, null);
    const totalLeagues = SYNC_LEAGUES.length;
    const totalSeasons = SYNC_SEASONS.length;
    const done = seasonIdx * totalLeagues + leagueIdx;
    const total = totalSeasons * totalLeagues;
    return { done: false, phase: 'standings', progress: `${done}/${total}`, currentSeason: SYNC_SEASONS[Math.min(seasonIdx, SYNC_SEASONS.length - 1)], currentLeague: SYNC_LEAGUES[Math.min(leagueIdx, SYNC_LEAGUES.length - 1)] };
  }
  return { done: true };
}

// ─── Main router ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;
    const lang = detectLanguage(request);
    if (request.method === 'POST') {
      if (path === '/api/scorers-set') return handleScorersSet(url, env, request);
      if (path === '/api/rounds-set') return handleRoundsSet(url, env, request);
      if (path === '/api/matches-set') return handleMatchesSet(url, env, request);
      return new Response('Not Found', { status: 404, headers: CORS });
    }
    if (path === '/ping') return new Response('pong', { headers: CORS });
    if (path === '/api/matches') return handleMatches(url, env);
    if (path === '/api/summary') return handleSummary(url, env);
    if (path === '/api/standings') return handleStandings(url, env);
    if (path === '/api/scorers') return handleScorers(url, env);
    if (path === '/api/league-matches') return handleLeagueMatches(url, env);
    if (path === '/api/league-rounds') return handleLeagueRounds(url, env);
    if (path === '/api/historical-sync') return handleHistoricalSync(url, env, ctx);
    if (path === '/api/historical-sync-status') return handleHistoricalSyncStatus(url, env);
    if (path === '/api/lang') return jsonResp({ lang, supported: SUPPORTED_LANGS });
    return new Response('Not Found', { status: 404, headers: CORS });
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    if (cron === '*/2 * * * *') {
      const histState = await kvGet(env, HIST_STATE_KEY);
      if (!histState || histState.phase !== 'done') { ctx.waitUntil(runHistoricalSync(env, 8)); }
    } else {
      ctx.waitUntil(runSeasonSync(env));
    }
  }
};

async function handleLeagueMatches(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName_m = url.searchParams.get('leagueName') || '';
  const date = url.searchParams.get('date') || todayEspn();
  const dateTo = url.searchParams.get('dateTo') || date;
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName_m), env, leagueName_m);
  const cacheKey = dateTo !== date ? `lgm_v3_${league}_${date}_${dateTo}` : `lgm_v3_${league}_${date}`;
  const cached = await kvGet(env, cacheKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  return jsonResp({ noCache: true, league, date, dateTo, cacheKey });
}

async function handleLeagueRounds(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName_h = url.searchParams.get('leagueName') || '';
  const season = url.searchParams.get('season') || '2026';
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName_h), env, leagueName_h);
  const kvKey = `rounds_v4_${league}_${season}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  return jsonResp({ noCache: true, league, season, kvKey });
}

async function handleHistoricalSync(url, env, ctx) {
  const secret = url.searchParams.get('secret') || '';
  const expected = env.SYNC_SECRET || '';
  if (!expected || secret !== expected) return new Response('Unauthorized', { status: 401, headers: CORS });
  const maxOps = Math.min(parseInt(url.searchParams.get('maxOps') || '6', 10), 20);
  const syncPromise = runHistoricalSync(env, maxOps);
  ctx.waitUntil(syncPromise);
  const result = await syncPromise;
  return jsonResp({ ...result, ts: new Date().toISOString() });
}

async function handleHistoricalSyncStatus(url, env) {
  const secret = url.searchParams.get('secret') || '';
  const expected = env.SYNC_SECRET || '';
  if (!expected || secret !== expected) return new Response('Unauthorized', { status: 401, headers: CORS });
  const state = await kvGet(env, HIST_STATE_KEY);
  if (!state) return jsonResp({ started: false });
  const totalLeagues = SYNC_LEAGUES.length;
  const totalSeasons = SYNC_SEASONS.length;
  if (state.phase === 'matches') return jsonResp({ phase: 'matches', cursor: state.cursor, started: true });
  if (state.phase === 'standings') {
    const done = state.seasonIdx * totalLeagues + state.leagueIdx;
    const total = totalSeasons * totalLeagues;
    return jsonResp({ phase: 'standings', progress: `${done}/${total}`, pct: Math.round(done / total * 100), season: SYNC_SEASONS[Math.min(state.seasonIdx, SYNC_SEASONS.length - 1)], league: SYNC_LEAGUES[Math.min(state.leagueIdx, SYNC_LEAGUES.length - 1)], started: true });
  }
  return jsonResp({ phase: state.phase, done: true, started: true });
}

async function runSeasonSync(env) {
  const now = new Date();
  const month = now.getMonth();
  const seasonYear = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = new Date(seasonYear, 7, 1);
  const seasonEnd = new Date(seasonYear + 1, 6, 31);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 30);
  const endDate = seasonEnd < maxDate ? seasonEnd : maxDate;
  const cursor = new Date(seasonStart);
  while (cursor <= endDate) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > endDate) weekEnd.setTime(endDate.getTime());
    const fromStr = dateToEspn(cursor);
    const toStr = dateToEspn(weekEnd);
    try {
      const res = await fetch(`${ESPN_ALL}?dates=${fromStr}-${toStr}&limit=500`);
      if (res.ok) {
        const data = await res.json();
        const events = data.events || [];
        const byDate = {};
        for (const ev of events) {
          const dayKey = ev.date.slice(0, 10).replace(/-/g, '');
          if (!byDate[dayKey]) byDate[dayKey] = [];
          byDate[dayKey].push(parseEvent(ev));
        }
        for (const [dayKey, matches] of Object.entries(byDate)) {
          const kvKey = `matches_v4_${dayKey}`;
          const isPast = dayKey < todayEspn();
          const hasLive = matches.some(m => m.status === 'in');
          const ttl = isPast ? TTL_FINISHED : hasLive ? TTL_LIVE() : TTL_MATCHES;
          const result = { success: true, date: dayKey, count: matches.length, matches };
          await kvPut(env, kvKey, result, ttl);
        }
      }
    } catch {}
    cursor.setDate(cursor.getDate() + 7);
    await new Promise(r => setTimeout(r, 500));
  }
}