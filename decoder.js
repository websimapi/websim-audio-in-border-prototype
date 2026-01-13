export async function decodeAudioFromImage(file) {
  // loads image, reads border, parses header, reconstructs PCM16 bytes,
  // returns a WAV blob (16-bit PCM, mono)
  const img = new Image();
  const imgUrl = URL.createObjectURL(file);
  await new Promise((r,rej) => { img.onload = r; img.onerror = rej; img.src = imgUrl; });

  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img,0,0);
  const W = canvas.width, H = canvas.height;
  const imgData = ctx.getImageData(0,0,W,H);

  function borderPixelCoords() {
    const coords = [];
    for (let x=0;x<W;x++) coords.push([x,0]);
    for (let y=1;y<H;y++) coords.push([W-1,y]);
    if (H>1) for (let x=W-2;x>=0;x--) coords.push([x,H-1]);
    if (W>1) for (let y=H-2;y>0;y--) coords.push([0,y]);
    return coords;
  }
  const coords = borderPixelCoords();
  const totalBorderPixels = coords.length;
  const capacityBytes = totalBorderPixels * 3;
  const extracted = new Uint8Array(capacityBytes);
  for (let i=0;i<totalBorderPixels;i++) {
    const [x,y] = coords[i];
    const px = (y*W + x)*4;
    extracted[i*3 + 0] = imgData.data[px+0];
    extracted[i*3 + 1] = imgData.data[px+1];
    extracted[i*3 + 2] = imgData.data[px+2];
  }

  // read header (first 32 bytes)
  const header = extracted.subarray(0,32);
  const magic = new TextDecoder().decode(header.subarray(0,4));
  if (magic !== 'AGIF') throw new Error('No AGIF header found');
  const dv = new DataView(header.buffer);
  const version = header[4];
  const sampleRate = dv.getUint32(5, true);
  const channels = header[9];
  const bytesPerSample = header[10];
  const pcmLen = Number(dv.getBigUint64(11, true));

  // payload bytes follow
  const payloadStart = 32;
  const available = Math.min(capacityBytes - payloadStart, pcmLen);
  const pcmBytes = extracted.subarray(payloadStart, payloadStart + available);

  // create WAV (16-bit PCM mono)
  const wavBuffer = buildWav(pcmBytes, sampleRate, channels || 1, bytesPerSample || 2);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function buildWav(pcmBytes, sampleRate, channels, bytesPerSample) {
  // assumes pcmBytes are little-endian signed 16-bit if bytesPerSample==2
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buffer);
  let p = 0;
  function writeStr(s) { for (let i=0;i<s.length;i++) dv.setUint8(p++, s.charCodeAt(i)); }
  writeStr('RIFF'); dv.setUint32(p, 36 + dataSize, true); p+=4; writeStr('WAVE');
  writeStr('fmt '); dv.setUint32(p,16,true); p+=4; dv.setUint16(p,1,true); p+=2; dv.setUint16(p,channels,true); p+=2;
  dv.setUint32(p, sampleRate, true); p+=4; dv.setUint32(p, byteRate, true); p+=4; dv.setUint16(p, blockAlign, true); p+=2;
  dv.setUint16(p, bytesPerSample*8, true); p+=2;
  writeStr('data'); dv.setUint32(p, dataSize, true); p+=4;
  // copy pcm bytes
  const dst = new Uint8Array(buffer, 44);
  dst.set(pcmBytes);
  return buffer;
}