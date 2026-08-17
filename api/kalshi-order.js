// api/kalshi-order.js
// Función serverless de Vercel — coloca una orden REAL en Kalshi.
//
// SEGURIDAD: KALSHI_KEY_ID y KALSHI_PRIVATE_KEY deben configurarse como
// variables de entorno en el dashboard de Vercel (Settings > Environment
// Variables), NUNCA en el código ni en el repositorio de GitHub.
//
// Modo de prueba: si el body incluye "dry_run": true, la función arma la
// orden completa y la devuelve SIN enviarla a Kalshi — para verificar que
// todo está correcto antes de arriesgar dinero real.

import crypto from "crypto";

const BASE_URL = "https://api.elections.kalshi.com";

function firmarPeticion(privateKeyPem, metodo, ruta) {
  const timestamp = Date.now().toString();
  const mensaje = `${timestamp}${metodo}${ruta}`;
  const firma = crypto.sign(
    "sha256",
    Buffer.from(mensaje),
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    }
  );
  return { timestamp, firma: firma.toString("base64") };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usa POST" });
  }

  try {
    const { ticker, lado, cantidad, precio_centavos, dry_run } = req.body || {};

    if (!ticker || !lado || !cantidad || precio_centavos === undefined) {
      return res.status(400).json({
        error: "Faltan campos requeridos: ticker, lado ('yes' o 'no'), cantidad, precio_centavos",
      });
    }
    if (lado !== "yes" && lado !== "no") {
      return res.status(400).json({ error: "lado debe ser 'yes' o 'no'" });
    }

    const side = lado === "yes" ? "bid" : "ask";
    const precioDolares = (precio_centavos / 100).toFixed(4);

    const cuerpoOrden = {
      ticker,
      side,
      count: String(cantidad),
      price: precioDolares,
      time_in_force: "good_till_canceled",
      self_trade_prevention_type: "taker_at_cross",
      client_order_id: crypto.randomUUID(),
    };

    if (dry_run) {
      return res.status(200).json({
        modo: "DRY RUN — no se envió ninguna orden real",
        orden_que_se_enviaria: cuerpoOrden,
      });
    }

    const KEY_ID = process.env.KALSHI_KEY_ID;
    const PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY;
    if (!KEY_ID || !PRIVATE_KEY) {
      return res.status(500).json({ error: "Faltan las variables de entorno KALSHI_KEY_ID / KALSHI_PRIVATE_KEY en Vercel" });
    }

    const ruta = "/trade-api/v2/portfolio/events/orders";
    const { timestamp, firma } = firmarPeticion(PRIVATE_KEY, "POST", ruta);

    const resp = await fetch(BASE_URL + ruta, {
      method: "POST",
      headers: {
        "KALSHI-ACCESS-KEY": KEY_ID,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": firma,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpoOrden),
    });

    const resultado = await resp.json();
    return res.status(resp.status).json(resultado);
  } catch (e) {
    return res.status(500).json({ error: "Error interno", detalle: String(e) });
  }
}
