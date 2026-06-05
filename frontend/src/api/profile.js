import client from './client';

export const getMyProfile = () =>
  client.get('/profile/me');

export const updateMyProfile = (data) =>
  client.patch('/profile/me', data);

// Downscale phone photos before upload so DB rows stay small. iOS Safari's
// classic <img> + decode pipeline produces broken JPEGs from Photos library
// shots (HEIC-derived files with embedded color profiles). createImageBitmap
// handles those cleanly and is the modern primitive for this exact task.
const MAX_DIMENSION = 1024;
const QUALITY = 0.85;

const decodeImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    // imageOrientation:'from-image' applies EXIF rotation so portrait phone
    // photos don't come out sideways after resize.
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      // Some browsers don't accept the options arg — retry without it.
      try { return await createImageBitmap(file); } catch (_) { /* fall through */ }
    }
  }
  // Legacy fallback for browsers without createImageBitmap.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await (typeof img.decode === 'function'
      ? img.decode()
      : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const resizeImage = async (file) => {
  const bitmap = await decodeImage(file);
  const naturalW = bitmap.width || bitmap.naturalWidth;
  const naturalH = bitmap.height || bitmap.naturalHeight;
  if (!naturalW || !naturalH) {
    if (typeof bitmap.close === 'function') bitmap.close();
    throw new Error('image dimensions unavailable');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (typeof bitmap.close === 'function') bitmap.close();
    throw new Error('canvas 2d unsupported');
  }
  // White background so transparent PNGs don't end up with black corners
  // after JPEG encoding.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (typeof bitmap.close === 'function') bitmap.close();

  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (b) => b ? resolve(b) : reject(new Error('toBlob failed')),
    'image/jpeg',
    QUALITY,
  ));
  if (blob.size < 2_000) throw new Error('resized blob suspiciously small');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
};

export const uploadPhoto = async (file) => {
  let toSend = file;
  try {
    toSend = await resizeImage(file);
  } catch (e) {
    console.warn('photo resize failed, uploading raw file:', e);
    // Raw fallback: only allowed image types. iOS often hands us
    // application/octet-stream for shared HEIC — reject with a friendly
    // message rather than letting the server 400.
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(file.type)) {
      throw new Error('Please pick a JPEG, PNG, or WebP photo (HEIC not supported)');
    }
  }
  const form = new FormData();
  form.append('file', toSend);
  return client.post('/profile/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
