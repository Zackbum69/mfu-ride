// Globale Rangliste für MFU Ride – Netlify Function + Netlify Blobs
import { getStore } from "@netlify/blobs";

const KEEP = 200;   // so viele Einträge werden max. aufbewahrt
const TOP = 10;     // so viele werden ausgeliefert
const MAX_SCORE = 5000000;

const pad = (n, l) => String(n).padStart(l, "0");
const clean = (s, l) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, l);

async function topList(store) {
  const { blobs } = await store.list();
  // Schlüssel = <Punkte>-<invertierte Zeit>-<Zufall> → absteigend sortiert = beste zuerst, bei Gleichstand der Ältere
  const keys = blobs.map((b) => b.key).sort().reverse();
  if (keys.length > KEEP) await Promise.all(keys.slice(KEEP).map((k) => store.delete(k)));
  const items = await Promise.all(keys.slice(0, TOP).map((k) => store.get(k, { type: "json" })));
  return items.filter(Boolean);
}

export default async (req) => {
  const store = getStore({ name: "mfu-highscores", consistency: "strong" });
  const headers = { "Cache-Control": "no-store" };

  if (req.method === "GET") {
    return Response.json({ scores: await topList(store) }, { headers });
  }

  if (req.method === "POST") {
    let body;
    try {
      const txt = await req.text();
      if (txt.length > 1000) throw new Error("too large");
      body = JSON.parse(txt);
    } catch {
      return Response.json({ error: "Ungültige Anfrage" }, { status: 400, headers });
    }
    const s = Math.floor(Number(body.s));
    const km = Math.round(Number(body.km) * 10) / 10;
    if (!Number.isFinite(s) || s <= 0 || s > MAX_SCORE || !Number.isFinite(km) || km < 0 || km > 10000) {
      return Response.json({ error: "Ungültige Werte" }, { status: 400, headers });
    }
    const now = Date.now();
    const id = pad(s, 9) + "-" + pad(9999999999999 - now, 13) + "-" + Math.random().toString(36).slice(2, 8);
    const entry = { id, n: clean(body.n, 16) || "Unbekannt", s, km, t: clean(body.t, 30), d: now };
    await store.setJSON(id, entry);
    return Response.json({ scores: await topList(store), id }, { headers });
  }

  return new Response("Method not allowed", { status: 405, headers });
};

export const config = { path: "/api/scores" };
