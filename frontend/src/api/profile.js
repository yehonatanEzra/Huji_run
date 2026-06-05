import client from './client';

export const getMyProfile = () =>
  client.get('/profile/me');

export const updateMyProfile = (data) =>
  client.patch('/profile/me', data);

// Downscale phone photos before upload so the DB row stays small.
// Longest side capped at 1024px, re-encoded as JPEG @ 0.85 quality.
// `img.decode()` guarantees the image is fully decoded before we read its
// natural dimensions — without it, naturalWidth/Height can briefly read as
// 0 on Safari/iOS and we'd write a 1×1 canvas (the "tiny photo" bug).
const MAX_DIMENSION = 1024;
const QUALITY = 0.85;

const resizeImage = async (file) => {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    }
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) throw new Error('image dimensions unavailable');

    const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalW, naturalH));
    const w = Math.max(1, Math.round(naturalW * scale));
    const h = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unsupported');
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('toBlob failed')),
      'image/jpeg',
      QUALITY,
    ));
    // Sanity check: a 1024-side JPEG should never be <2 KB. If it is,
    // something went sideways — let the original file fall through.
    if (blob.size < 2_000) throw new Error('resized blob suspiciously small');
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const uploadPhoto = async (file) => {
  let toSend = file;
  try {
    toSend = await resizeImage(file);
  } catch (e) {
    // Resize failed (HEIC, broken decode, iOS quirk) — fall back to the raw
    // file. Server enforces a 2 MB cap, so we'll still reject anything huge.
    console.warn('photo resize failed, uploading raw file:', e);
  }
  const form = new FormData();
  form.append('file', toSend);
  return client.post('/profile/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
