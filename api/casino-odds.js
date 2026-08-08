export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const apiKey = process.env.SHARPAPI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'SHARPAPI_KEY no configurada en Vercel' });
    return;
  }

  const PRIORIDAD_CASAS = ["fanduel", "fanatics", "stake", "betmgm", "thescorebet"];
  const resultado = {};
  let cursor = null;
  let totalTraidas = 0;

  try {
    for (let pagina = 0; pagina < 20; pagina++) {
      let url = `https://api.sharpapi.io/api/v1/odds?sport=baseball&league=MLB&sportsbook=thescorebet,fanduel,betmgm,fanatics,stake&market=player_hits&limit=200`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      const r = await fetch(url, { headers: { 'X-API-Key': apiKey } });
      if (!r.ok) break;
      const data = await r.json();
      const items = data.data || [];
      totalTraidas += items.length;

      for (const item of items) {
        if (item.selection_type !== 'over') continue;
        if (item.line !== 0.5) continue;
        const nombre = item.player_name;
        if (!nombre) continue;
        const casaNueva = item.sportsbook || '';
        const existente = resultado[nombre];
        if (existente) {
          const rankActual = PRIORIDAD_CASAS.indexOf(existente.sportsbook);
          const rankNueva = PRIORIDAD_CASAS.indexOf(casaNueva);
          const ra = rankActual === -1 ? 999 : rankActual;
          const rn = rankNueva === -1 ? 999 : rankNueva;
          if (rn >= ra) continue;
        }
        resultado[nombre] = {
          linea: item.line,
          odds_over: item.odds_american,
          prob_implicita: Math.round((item.odds_probability || 0) * 1000) / 10,
          sportsbook: casaNueva,
        };
      }

      const pag = data.pagination || {};
      if (!pag.has_more) break;
      cursor = pag.next_cursor;
      if (!cursor) break;
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      actualizado: new Date().toISOString(),
      total_lineas_traidas: totalTraidas,
      lineas_hits: resultado,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
// prueba webhook 1786155260
