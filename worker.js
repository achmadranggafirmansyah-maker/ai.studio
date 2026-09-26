export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // HEALTH CHECK
    if (url.pathname === '/api/health') {
      return json({ ok: true, hasToken: !!env.HF_TOKEN }, 200, cors);
    }

    // IMAGE TO VIDEO via Hugging Face
    if (url.pathname === '/api/image-to-video' && request.method === 'POST') {
      try {
        const { image, motionBucketId = 180, videoLength = 25 } = await request.json();
        if (!image) return json({ error: 'Gambar wajib diupload' }, 400, cors);

        // Convert base64 → binary
        const base64 = image.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('inputs', blob, 'input.jpg');
        formData.append('parameters', JSON.stringify({
          motion_bucket_id: motionBucketId,
          frames_per_second: 6,
          num_frames: parseInt(videoLength),
          cond_aug: 0.02,
        }));

        const hfRes = await fetch(
          'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion-img2vid-xt',
          { method: 'POST', headers: { 'Authorization': `Bearer ${env.HF_TOKEN}` }, body: formData }
        );

        if (!hfRes.ok) {
          const errText = await hfRes.text();
          return json({ error: `HF Error: ${hfRes.status}`, detail: errText }, hfRes.status, cors);
        }

        const videoBuffer = await hfRes.arrayBuffer();

        // Convert ke base64 dalam chunk (biar nggak stack overflow)
        const uint8 = new Uint8Array(videoBuffer);
        let binaryStr = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binaryStr += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
        }
        const base64Video = btoa(binaryStr);

        return json({ success: true, videoUrl: `data:video/mp4;base64,${base64Video}` }, 200, cors);
      } catch (err) {
        return json({ error: err.message }, 500, cors);
      }
    }

    // Fallback ke assets (index.html)
    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
