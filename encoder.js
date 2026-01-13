export async function encodeImageWithAudio(image, audioFile, opts = {}) {
  // options: frameMs, sampleRate, canvasPreview (optional)
  const { frameMs = 50, sampleRate = 44100, canvasPreview = null } = opts;

  // 1) decode audio file to PCM Float32Array (mono)
  const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, sampleRate);
  const arrayBuffer = await audioFile.arrayBuffer();
  const decoded = await (async () => {
    try {
      return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (e) {
      // Some browsers require a real AudioContext; fallback
      const tmp = new (window.AudioContext || window.webkitAudioContext)();
      const d = await tmp.decodeAudioData(arrayBuffer.slice(0));
      tmp.close?.();
      return d;
    }
  })();

  // mix down to mono
  const numChannels = decoded.numberOfChannels;
  const len = decoded.length;
  const fs = decoded.sampleRate;
  const chData = [];
  for (let c = 0; c < numChannels; c++) chData.push(decoded.getChannelData(c));
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let c = 0; c < numChannels; c++) s += chData[c][i] || 0;
    mono[i] = s / numChannels;
  }

  // 2) target canvas
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  // optional preview draw
  if (canvasPreview) {
    const pctx = canvasPreview.getContext('2d');
    canvasPreview.width = canvas.width;
    canvasPreview.height = canvas.height;
    pctx.drawImage(canvas, 0, 0);
  }

  // 3) convert float PCM (-1..1) to 16-bit signed PCM bytes
  const pcm16 = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    let s = Math.max(-1, Math.min(1, mono[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // 4) We embed full PCM bytes sequentially into border pixels (R,G,B = three bytes).
  // First, create a header block in the top-left corner border area (first N pixels) with metadata.
  // Header structure (32 bytes, stored in first 11 pixels = 33 bytes):
  // - magic: "AGIF" (4 bytes)
  // - version: 1 (1 byte)
  // - sampleRate (4 bytes, uint32)
  // - channels (1 byte) -> 1
  // - bytesPerSample (1 byte) -> 2
  // - pcmLengthBytes (8 bytes, uint64 little-endian)
  // - reserved (13 bytes) = zeros (to fill to 32)
  const pcmBytes = new Uint8Array(pcm16.buffer);
  const pcmLen = pcmBytes.length;
  const header = new Uint8Array(32);
  const text = new TextEncoder().encode('AGIF');
  header.set(text,0);
  header[4] = 1;
  const dv = new DataView(header.buffer);
  dv.setUint32(5, sampleRate, true);
  header[9] = 1;
  header[10] = 2;
  // pcmLen as 64-bit little-endian
  dv.setBigUint64(11, BigInt(pcmLen), true);

  // helper: write bytes into border pixels starting at index 0
  const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
  const W = canvas.width, H = canvas.height;
  function borderPixelIndices() {
    const coords = [];
    // top row
    for (let x=0;x<W;x++) coords.push([x,0]);
    // right column (excluding top)
    for (let y=1;y<H;y++) coords.push([W-1,y]);
    // bottom row (excluding right)
    if (H>1) for (let x=W-2;x>=0;x--) coords.push([x,H-1]);
    // left column (excluding bottom & top)
    if (W>1) for (let y=H-2;y>0;y--) coords.push([0,y]);
    return coords;
  }
  const coords = borderPixelIndices();
  const totalBorderPixels = coords.length;
  const capacityBytes = totalBorderPixels * 3;
  if (pcmLen + header.length > capacityBytes) {
    // If audio too large, we offer to truncate to fit
    console.warn('Audio too large for image border, truncating to fit');
  }

  // build payload: header then pcm bytes truncated to capacity
  const payloadLen = Math.min(capacityBytes, header.length + pcmLen);
  const payload = new Uint8Array(payloadLen);
  payload.set(header.subarray(0, Math.min(header.length,payloadLen)), 0);
  if (payloadLen > header.length) payload.set(pcmBytes.subarray(0, payloadLen - header.length), header.length);

  // write payload to imageData
  for (let i=0;i<Math.min(totalBorderPixels, Math.ceil(payloadLen/3)); i++) {
    const [x,y] = coords[i];
    const px = (y*W + x)*4;
    const b0 = payload[i*3 + 0] || 0;
    const b1 = payload[i*3 + 1] || 0;
    const b2 = payload[i*3 + 2] || 0;
    imgData.data[px+0] = b0; // R
    imgData.data[px+1] = b1; // G
    imgData.data[px+2] = b2; // B
    // alpha keep original
  }

  ctx.putImageData(imgData,0,0);

  // export PNG Blob
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}