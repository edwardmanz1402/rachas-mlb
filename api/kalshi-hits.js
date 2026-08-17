// api/kalshi-hits.js
// Función serverless de Vercel — trae los mercados de "hits por jugador" de
// Kalshi para los juegos de hoy. Es de SOLO LECTURA (los mercados son datos
// públicos en Kalshi, no requieren firma RSA).

export default async function handler(req, res) {
  try {
    const BASE_URL = "https://api.elections.kalshi.com";

    // 1. Traer los eventos abiertos de la serie KXMLBHIT (un evento por juego).
    const resEventos = await fetch(
      `${BASE_URL}/trade-api/v2/events?series_ticker=KXMLBHIT&status=open&limit=50`
    );
    if (!resEventos.ok) {
      const texto = await resEventos.text();
      return res.status(resEventos.status).json({ error: "Error trayendo eventos de Kalshi", detalle: texto });
    }
    const dataEventos = await resEventos.json();
    const eventos = dataEventos.events || [];

    // 2. Para cada evento (juego), traer sus mercados individuales por jugador.
    const jugadoresConLinea = [];

    for (const evento of eventos) {
      const resMercados = await fetch(
        `${BASE_URL}/trade-api/v2/markets?event_ticker=${evento.event_ticker}&limit=200`
      );
      if (!resMercados.ok) continue;
      const dataMercados = await resMercados.json();

      for (const m of (dataMercados.markets || [])) {
        // yes_sub_title trae el nombre del jugador y el umbral, ej: "Josh Naylor: 1+"
        const partes = (m.yes_sub_title || "").split(":");
        const nombreJugador = partes[0] ? partes[0].trim() : null;
        const umbral = partes[1] ? partes[1].trim() : null;
        if (!nombreJugador) continue;

        jugadoresConLinea.push({
          jugador: nombreJugador,
          umbral: umbral,
          ticker: m.ticker,
          evento: evento.event_ticker,
          titulo_evento: evento.title,
          yes_bid: m.yes_bid_dollars,
          yes_ask: m.yes_ask_dollars,
          status: m.status,
        });
      }
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json({
      actualizado: new Date().toISOString(),
      total_jugadores: jugadoresConLinea.length,
      jugadores: jugadoresConLinea,
    });
  } catch (e) {
    return res.status(500).json({ error: "Error interno", detalle: String(e) });
  }
}
