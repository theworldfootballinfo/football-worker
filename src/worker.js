// Cloudflare Worker for Sports API Integration with ESPN
// Version: 2.1 - Updated with extended ID mappings

const ID_TO_CODE = {
  // Major European Leagues
  '2021': 'eng.1',      // Premier League
  '2014': 'esp.1',      // La Liga
  '2019': 'ita.1',      // Serie A
  '2002': 'ger.1',      // Bundesliga
  '2015': 'fra.1',      // Ligue 1
  '2003': 'ned.1',      // Eredivisie
  '2017': 'por.1',      // Primeira Liga
  
  // Scandanavian & Other European Leagues
  '3945': 'swe.1',      // Swedish Allsvenskan
  '2088': 'swe.1',      // Swedish Allsvenskan (Alternative ID)
  '2099': 'nor.1',      // Norwegian Eliteserien
  '2089': 'den.1',      // Danish Superliga
  
  // Americas & Rest of World
  '2013': 'bra.1',      // Campeonato Brasileiro
  '2016': 'arg.1',      // Liga Profesional Argentina
  '253':  'usa.1',      // MLS
  '2001': 'uefa.champions', // UEFA Champions League
  '2146': 'uefa.europa',    // UEFA Europa League
};

function resolveLeagueFromName(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  
  if (n.includes('premier league') || n.includes('epl')) return 'eng.1';
  if (n.includes('la liga') || n.includes('laliga') || n.includes('primera division')) return 'esp.1';
  if (n.includes('serie a')) return 'ita.1';
  if (n.includes('bundesliga')) return 'ger.1';
  if (n.includes('ligue 1')) return 'fra.1';
  if (n.includes('eredivisie')) return 'ned.1';
  if (n.includes('primeira liga') || n.includes('portugal')) return 'por.1';
  if (n.includes('allsvenskan') || n.includes('swedish') || n.includes('sweden')) return 'swe.1';
  if (n.includes('eliteserien') || n.includes('norwegian') || n.includes('norway')) return 'nor.1';
  if (n.includes('superliga') || n.includes('danish') || n.includes('denmark')) return 'den.1';
  if (n.includes('champions league') || n.includes('ucl')) return 'uefa.champions';
  if (n.includes('europa league') || n.includes('uel')) return 'uefa.europa';
  if (n.includes('major league soccer') || n.includes('mls')) return 'usa.1';
  if (n.includes('brasileirao') || n.includes('brazil')) return 'bra.1';
  
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originHeader = request.headers.get('Origin') || '*';

    const corsHeaders = {
      'Access-Control-Allow-Origin': originHeader,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json; charset=utf-8'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const path = url.pathname;
      let league = url.searchParams.get('league') || 'eng.1';
      const leagueName = url.searchParams.get('leagueName') || '';

      // League code resolution logic
      if (ID_TO_CODE[league]) {
        league = ID_TO_CODE[league];
      } else if (leagueName) {
        const resolved = resolveLeagueFromName(leagueName);
        if (resolved) league = resolved;
      }

      // Default fallback if numeric ID remains unresolved
      if (!isNaN(league) && !ID_TO_CODE[league]) {
        if (leagueName) {
          league = resolveLeagueFromName(leagueName) || 'eng.1';
        } else {
          league = 'eng.1';
        }
      }

      if (path === '/api/standings') {
        const espnUrl = `https://site.api.espn.com/apis/v2/sports/football/${league}/standings`;
        const res = await fetch(espnUrl);
        const data = await res.json();
        return new Response(JSON.stringify({ success: true, league, data }), { headers: corsHeaders });
      }

      if (path === '/api/scorers') {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/${league}/statistics`;
        const res = await fetch(espnUrl);
        const data = await res.json();
        return new Response(JSON.stringify({ success: true, league, data }), { headers: corsHeaders });
      }

      if (path === '/api/league-matches') {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/${league}/scoreboard`;
        const res = await fetch(espnUrl);
        const data = await res.json();
        return new Response(JSON.stringify({ success: true, league, data }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
        status: 404,
        headers: corsHeaders
      });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
