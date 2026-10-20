import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { ML_SERVICE_URL } from '../config.js';
import { MicroBatcher } from './microBatcher.js';

/**
 * Face-check queue in front of the ML service.
 *
 * Every verification goes through a MicroBatcher. With ML_BATCH_VERIFY=true a flushed
 * batch is one POST /verify_batch: the ML service runs liveness per student and then a
 * single batched FaceNet forward pass for all of them, which is where the CPU saving is.
 * Otherwise (default, and for an ML service without that endpoint) each item in the
 * batch is sent to /verify, with the batcher still bounding how many run at once.
 *
 * Each item: { files: [{ path }], enrolledEmbedding | null, threshold, requireLiveness }
 * Each result: the same JSON body /verify returns.
 */
const BATCH_MODE = process.env.ML_BATCH_VERIFY === 'true';
const TIMEOUT_MS = 15000;

function appendItem(form, item) {
  for (const f of item.files) form.append('images', fs.createReadStream(f.path));
}

async function verifyOne(item) {
  const form = new FormData();
  appendItem(form, item);
  if (item.enrolledEmbedding) form.append('enrolled_embedding', JSON.stringify(item.enrolledEmbedding));
  form.append('threshold', String(item.threshold));
  form.append('require_liveness', item.requireLiveness ? 'true' : 'false');
  const res = await axios.post(`${ML_SERVICE_URL}/verify`, form, { headers: form.getHeaders(), timeout: TIMEOUT_MS });
  return res.data;
}

async function verifyBatch(items) {
  const form = new FormData();
  const manifest = items.map((item) => ({
    count: item.files.length,
    enrolled_embedding: item.enrolledEmbedding || null,
    threshold: item.threshold,
    require_liveness: !!item.requireLiveness
  }));
  form.append('manifest', JSON.stringify(manifest));
  items.forEach((item) => appendItem(form, item));
  const res = await axios.post(`${ML_SERVICE_URL}/verify_batch`, form, {
    headers: form.getHeaders(),
    timeout: TIMEOUT_MS + 1000 * items.length,
    maxBodyLength: Infinity
  });
  const results = res.data?.results;
  if (!Array.isArray(results) || results.length !== items.length) {
    throw new Error('ML batch response did not match the request');
  }
  return results;
}

async function flush(items) {
  if (BATCH_MODE && items.length > 1) return verifyBatch(items);
  // One-by-one: a failure only fails its own item
  return Promise.all(items.map((item) => verifyOne(item).catch((err) => err)));
}

export const verifyQueue = new MicroBatcher(flush, {
  maxBatch: Number(process.env.ML_BATCH_MAX) || 16,
  maxWaitMs: Number(process.env.ML_BATCH_WAIT_MS) || 40,
  maxInFlight: Number(process.env.ML_BATCH_IN_FLIGHT) || 2
});

export const verifyFace = (item) => verifyQueue.submit(item);
export const batchMode = BATCH_MODE;
