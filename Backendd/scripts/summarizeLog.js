// Ringkas log harian push-sync jadi laporan singkat.
//   node scripts/summarizeLog.js              -> hari ini (WIB)
//   node scripts/summarizeLog.js 2026-10-13   -> tanggal tertentu
//   node scripts/summarizeLog.js --last 7     -> 7 hari terakhir (satu laporan per hari)
// Baca file logs/push-YYYY-MM-DD.log (format: lihat utils/dailyLogger.js).

const fs = require("fs");
const path = require("path");
const { LOG_DIR, fmtDuration } = require("../utils/dailyLogger");

const LINE_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(\w+)\] (\w+)(?: (.*))?$/;
const KV_RE = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;

function parseKv(rest = "") {
  const out = {};
  for (const m of rest.matchAll(KV_RE)) {
    let v = m[2];
    if (v.startsWith('"')) {
      try { v = JSON.parse(v); } catch (_) { /* biarin apa adanya */ }
    }
    out[m[1]] = v;
  }
  return out;
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};
const bump = (obj, k, n = 1) => { obj[k] = (obj[k] || 0) + n; };
const top = (obj, n = 5) =>
  Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v}x)`).join(", ") || "-";

function wibToday() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function summarize(day) {
  const file = path.join(LOG_DIR, `push-${day}.log`);
  if (!fs.existsSync(file)) {
    console.log(`\n=== ${day} ===\n(tidak ada file ${file})`);
    return;
  }
  const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  const cycles = [];
  const events = {};
  const errs = {};
  const slow = {};
  const outages = [];
  let skippedTotal = 0;
  const master = { GAP: 0, SENDER_STALE: 0, SENDER_RECOVERED: 0, PUSH_STALE_IGNORED: 0, PUSH_REJECTED: 0, PUSH_SAVE_FAIL: 0 };
  const stale = [];

  for (const line of lines) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, ts, , event, rest] = m;
    const kv = parseKv(rest);
    bump(events, event);
    if (event === "CYCLE") {
      cycles.push({ ts, ...kv, ms: +kv.ms, send_fail: +kv.send_fail, collect_fail: +kv.collect_fail, sent_ok: +kv.sent_ok, queue: +kv.queue });
      skippedTotal += +kv.skipped_before || 0;
      if (kv.errs && kv.errs !== "-") kv.errs.split(",").forEach((e) => { const [k, n] = e.split(":"); bump(errs, k, +n); });
      if (kv.slow && kv.slow !== "-") kv.slow.split("|").forEach((e) => { const i = e.lastIndexOf(":"); bump(slow, e.slice(0, i), 1); });
    } else if (event === "OUTAGE_START") {
      outages.push({ start: ts, end: null, down: null });
    } else if (event === "OUTAGE_END") {
      const o = outages[outages.length - 1];
      if (o && !o.end) { o.end = ts; o.down = kv.down; }
    } else if (event in master) {
      master[event]++;
      if (event === "SENDER_STALE" || event === "SENDER_RECOVERED") stale.push(`${ts.slice(11, 19)} ${event} ${kv.source}${kv.down ? ` (${kv.down})` : ""}`);
    }
  }

  console.log(`\n=== ${day} ===`);
  if (cycles.length) {
    const ms = cycles.map((c) => c.ms);
    const bad = cycles.filter((c) => c.send_fail > 0 || c.collect_fail > 0).length;
    const maxC = cycles.reduce((a, b) => (b.ms > a.ms ? b : a));
    console.log(`Pengirim : ${cycles.length} siklus, ${bad} bermasalah, ${skippedTotal} tick di-skip`);
    console.log(`Durasi   : rata-rata ${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)}ms, p95 ${pct(ms, 95)}ms, terlama ${maxC.ms}ms (siklus #${maxC.id} jam ${maxC.ts.slice(11, 19)})`);
    console.log(`Error    : ${top(errs)}`);
    console.log(`Job lambat: ${top(slow)}`);
    console.log(`Outage   : ${outages.length ? outages.map((o) => `${o.start.slice(11, 19)} -> ${o.end ? `${o.end.slice(11, 19)} (${o.down})` : "BELUM PULIH"}`).join("; ") : "tidak ada"}`);
    const last = cycles[cycles.length - 1];
    console.log(`Terakhir : siklus #${last.id} jam ${last.ts.slice(11, 19)}, antrian ${last.queue}`);
  }
  if (Object.values(master).some(Boolean)) {
    console.log(`Master   : ${Object.entries(master).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(", ")}`);
    stale.forEach((x) => console.log(`           ${x}`));
  }
  if (!cycles.length && !Object.values(master).some(Boolean)) console.log("(file ada tapi belum ada baris CYCLE / event Master)");
}

const args = process.argv.slice(2);
if (args[0] === "--last") {
  const n = Math.max(1, Number(args[1]) || 7);
  for (let i = n - 1; i >= 0; i--) {
    summarize(new Date(Date.now() + 7 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10));
  }
} else {
  summarize(/^\d{4}-\d{2}-\d{2}$/.test(args[0] || "") ? args[0] : wibToday());
}
