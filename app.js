import { encodeImageWithAudio } from './encoder.js';
import { decodeAudioFromImage } from './decoder.js';

const imgIn = document.getElementById('imgIn');
const audioIn = document.getElementById('audioIn');
const frameMsEl = document.getElementById('frameMs');
const sampleRateEl = document.getElementById('sampleRate');
const encodeBtn = document.getElementById('encodeBtn');
const downloadLink = document.getElementById('downloadLink');
const preview = document.getElementById('preview');

const encodedIn = document.getElementById('encodedIn');
const decodeBtn = document.getElementById('decodeBtn');
const player = document.getElementById('player');

let loadedImage = null;
imgIn.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    loadedImage = img;
    preview.width = img.width;
    preview.height = img.height;
    const ctx = preview.getContext('2d');
    ctx.drawImage(img,0,0);
    preview.classList.remove('hidden');
  };
  img.src = URL.createObjectURL(f);
});

encodeBtn.addEventListener('click', async () => {
  const audioFile = audioIn.files?.[0];
  if (!loadedImage || !audioFile) { alert('Provide image and audio'); return; }
  encodeBtn.disabled = true;
  try {
    const frameMs = Number(frameMsEl.value) || 50;
    const sampleRate = Number(sampleRateEl.value) || 44100;
    const pngBlob = await encodeImageWithAudio(loadedImage, audioFile, { frameMs, sampleRate, canvasPreview: preview });
    downloadLink.href = URL.createObjectURL(pngBlob);
    downloadLink.classList.remove('hidden');
  } catch (err) {
    alert('Encoding failed: ' + err.message);
  } finally { encodeBtn.disabled = false; }
});

decodeBtn.addEventListener('click', async () => {
  const f = encodedIn.files?.[0];
  if (!f) { alert('Choose an encoded PNG'); return; }
  decodeBtn.disabled = true;
  try {
    const audioBlob = await decodeAudioFromImage(f);
    player.src = URL.createObjectURL(audioBlob);
    player.play();
  } catch (err) {
    alert('Decode failed: ' + err.message);
  } finally { decodeBtn.disabled = false; }
});