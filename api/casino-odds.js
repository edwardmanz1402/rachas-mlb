export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const apiKey = process.env.SHARPAPI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'SHARPAPI_KEY no configurada en Vercel' });
    return;
  }
  const porJugador = {};
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
        if (!porJugador[nombre]) porJugador[nombre] = [];
        const yaExiste = porJugador[nombre].some(x => x.sportsbook === item.sportsbook && x.odds_american === item.odds_american);
        if (!yaExiste) {
          porJugador[nombre].push({ sportsbook: item.sportsbook, odds_american: item.odds_american });
        }
      }
      const pag = data.pagination || {};
      if (!pag.has_more) break;
      cursor = pag.next_cursor;
      if (!cursor) break;
    }

    // Convierte odds americanos a probabilidad implícita (%), fórmula estándar.
    function calcularProbImplicita(oddsAmerican) {
      if (oddsAmerican > 0) {
        return Math.round((100 / (oddsAmerican + 100)) * 1000) / 10;
      } else {
        return Math.round((-oddsAmerican / (-oddsAmerican + 100)) * 1000) / 10;
      }
    }

    const resultado = {};
    for (const nombre in porJugador) {
      const lista = porJugador[nombre];
      const valores = lista.map(x => x.odds_american).sort((a, b) => a - b);
      const mitad = Math.floor(valores.length / 2);
      const medianaTeorica = valores.length % 2 !== 0
        ? valores[mitad]
        : (valores[mitad - 1] + valores[mitad]) / 2;
      let elegido = lista[0];
      let menorDistancia = Infinity;
      for (const item of lista) {
        const distancia = Math.abs(item.odds_american - medianaTeorica);
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          elegido = item;
        }
      }
      resultado[nombre] = {
        linea: 0.5,
        odds_over: elegido.odds_american,
        prob_implicita: calcularProbImplicita(elegido.odds_american),
        sportsbook: elegido.sportsbook,
        casas_consultadas: lista.length,
        casas: lista.map(x => `${x.sportsbook}:${x.odds_american}`),
      };
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
