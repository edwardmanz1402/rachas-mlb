export default function handler(req, res) {
  const claves = Object.keys(process.env).filter(k => k.includes('SHARP') || k.includes('API'));
  res.status(200).json({
    claves_relacionadas_encontradas: claves,
    tiene_sharpapi_key: !!process.env.SHARPAPI_KEY,
    longitud_si_existe: process.env.SHARPAPI_KEY ? process.env.SHARPAPI_KEY.length : 0,
    total_env_vars: Object.keys(process.env).length,
  });
}
// forzar redeploy Fri Aug  7 19:43:57 CST 2026
