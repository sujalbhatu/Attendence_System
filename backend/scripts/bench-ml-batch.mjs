/**
 * Measures the ML service: N single /verify calls vs /verify_batch, real FaceNet on this CPU.
 *
 *   ML_URL=http://127.0.0.1:5006 node scripts/bench-ml-batch.mjs <image.jpg>
 *
 * Liveness is off (no real blinking face in a benchmark), so this times exactly the part
 * batching changes: decoding + one FaceNet forward pass per face vs one per batch.
 */
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';

const ML = process.env.ML_URL || 'http://127.0.0.1:5006';
const image = fs.readFileSync(process.argv[2]);
const enrolled = Array.from({ length: 512 }, (_, i) => Math.sin(i));
const norm = Math.hypot(...enrolled);
const enrolledEmbedding = enrolled.map((v) => v / norm);
const FRAMES = 1; // frames per student (liveness off)

async function single() {
  const form = new FormData();
  for (let f = 0; f < FRAMES; f++) form.append('images', image, { filename: 'f.jpg', contentType: 'image/jpeg' });
  form.append('enrolled_embedding', JSON.stringify(enrolledEmbedding));
  form.append('require_liveness', 'false');
  await axios.post(`${ML}/verify`, form, { headers: form.getHeaders() });
}

async function batch(n) {
  const form = new FormData();
  const manifest = Array.from({ length: n }, () => ({ count: FRAMES, enrolled_embedding: enrolledEmbedding, threshold: 0.65, require_liveness: false }));
  form.append('manifest', JSON.stringify(manifest));
  for (let i = 0; i < n * FRAMES; i++) form.append('images', image, { filename: `f${i}.jpg`, contentType: 'image/jpeg' });
  const res = await axios.post(`${ML}/verify_batch`, form, { headers: form.getHeaders(), maxBodyLength: Infinity });
  if (res.data.results.length !== n) throw new Error('bad batch response');
}

const time = async (fn) => { const t = process.hrtime.bigint(); await fn(); return Number(process.hrtime.bigint() - t) / 1e6; };

const STUDENTS = 48;
await single(); await batch(4); // warm-up

const rows = [];
const seqMs = await time(async () => { for (let i = 0; i < STUDENTS; i++) await single(); });
rows.push({ mode: 'single /verify x48 (sequential)', totalMs: Math.round(seqMs), perFaceMs: +(seqMs / STUDENTS).toFixed(1) });
for (const n of [4, 8, 16]) {
  const ms = await time(async () => { for (let i = 0; i < STUDENTS / n; i++) await batch(n); });
  rows.push({ mode: `/verify_batch size ${n}`, totalMs: Math.round(ms), perFaceMs: +(ms / STUDENTS).toFixed(1), speedup: +(seqMs / ms).toFixed(2) });
}
console.table(rows);
console.log(JSON.stringify(rows));
