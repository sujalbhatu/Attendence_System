import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const getMLUrl = () => process.env.ML_SERVICE_URL || 'http://127.0.0.1:5005';

/**
 * Sends uploaded face photos to the ML service's /embed and returns the averaged
 * 512-d embedding (the same call faculty enrolment uses). Deletes the uploads.
 */
export async function embedUploadedFaces(files) {
  try {
    const form = new FormData();
    for (const f of files) form.append('images', fs.createReadStream(f.path));
    const mlRes = await axios.post(`${getMLUrl()}/embed`, form, { headers: form.getHeaders(), timeout: 15000 });
    const { embedding } = mlRes.data || {};
    if (!Array.isArray(embedding) || embedding.length === 0) throw new Error('ML service returned no embedding');
    return embedding;
  } finally {
    files.forEach((f) => fs.unlink(f.path, () => {}));
  }
}
