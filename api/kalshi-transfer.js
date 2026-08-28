// api/kalshi-transfer.js
// Función serverless de Vercel — transfiere fondos entre exchange_index de Kalshi.
// Esto es necesario porque los mercados de MLB (KXMLBHIT) ahora viven en el
// exchange_index 3, mientras que el saldo principal suele estar en el 0.

import crypto from "crypto";

const BASE_URL = "https://external-api.kalshi.com";

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido, usa POST" });
  }

  try {
    const { amount_cents, exchange_index_destino, dry_run } = req.body || {};

    if (!amount_cents) {
      return res.status(400).json({ error: "Falta amount_cents" });
    }

    const cuerpo = {
      client_transfer_id: crypto.randomUUID(),
      from_subaccount: 0,
      to_subaccount: 0,
      amount_cents: amount_cents,
      exchange_index: exchange_index_destino !== undefined ? exchange_index_destino : 3,
    };

    if (dry_run) {
      return res.status(200).json({
        modo: "DRY RUN - no se envio ninguna transferencia real",
        transferencia_que_se_enviaria: cuerpo,
      });
    }

    const KEY_ID = process.env.KALSHI_KEY_ID;
    const PRIVATE_KEY_B64 = process.env.KALSHI_PRIVATE_KEY_B64;
    if (!KEY_ID || !PRIVATE_KEY_B64) {
      return res.status(500).json({ error: "Faltan variables de entorno" });
    }
    const PRIVATE_KEY = Buffer.from(PRIVATE_KEY_B64, "base64").toString("utf-8");

    const ruta = "/trade-api/v2/portfolio/subaccounts/transfer";
    const { timestamp, firma } = firmarPeticion(PRIVATE_KEY, "POST", ruta);

    const resp = await fetch(BASE_URL + ruta, {
      method: "POST",
      headers: {
        "KALSHI-ACCESS-KEY": KEY_ID,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": firma,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
    });

    const resultado = await resp.json();
    return res.status(resp.status).json(resultado);
  } catch (e) {
    return res.status(500).json({ error: "Error interno", detalle: String(e) });
  }
}
