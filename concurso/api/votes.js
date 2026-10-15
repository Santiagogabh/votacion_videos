const { Redis } = require("@upstash/redis");
const crypto = require("crypto");
const videos = require("../public/videos.json");

const IDS = videos.map(v => v.id);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
});

const MAX_WRITES = 40;      // peticiones de escritura permitidas por IP...
const WINDOW_SECONDS = 600; // ...cada 10 minutos

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(c => c.trim().split("=")).filter(p => p[0]).map(([k, ...v]) => [k, v.join("=")]));
}

async function snapshot(voter) {
  const p = redis.pipeline();
  IDS.forEach(id => { p.scard("votes:" + id); p.sismember("votes:" + id, voter); });
  const r = await p.exec();
  const counts = {}, mine = [];
  IDS.forEach((id, i) => { counts[id] = Number(r[i * 2]) || 0; if (Number(r[i * 2 + 1]) === 1) mine.push(id); });
  return { counts, mine };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    // Identidad anónima del votante: cookie aleatoria, HttpOnly (no accesible desde JS)
    let voter = parseCookies(req.headers.cookie).vid;
    if (!/^[0-9a-f-]{36}$/.test(voter || "")) {
      voter = crypto.randomUUID();
      res.setHeader("Set-Cookie", `vid=${voter}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
    }

    if (req.method === "GET") return res.status(200).json(await snapshot(voter));

    if (req.method === "POST") {
      // Protección CSRF: solo se acepta el mismo origen
      const origin = req.headers.origin;
      if (!origin || new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Origen no permitido" });

      // Límite de peticiones por IP
      const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
      const key = "rl:" + ip;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, WINDOW_SECONDS);
      if (n > MAX_WRITES) return res.status(429).json({ error: "Demasiadas acciones. Espera unos minutos." });

      const { videoId, action } = req.body || {};
      if (!IDS.includes(videoId) || !["vote", "unvote"].includes(action)) return res.status(400).json({ error: "Petición inválida" });

      // Un SET por video: agregar el mismo votante dos veces no cambia nada (sin duplicados)
      if (action === "vote") await redis.sadd("votes:" + videoId, voter);
      else await redis.srem("votes:" + videoId, voter);
      return res.status(200).json(await snapshot(voter));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error del servidor" });
  }
};
