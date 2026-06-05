import client from './client';

export const getMyProfile = () =>
  client.get('/profile/me');

export const updateMyProfile = (data) =>
  client.patch('/profile/me', data);

// Downscale phone photos before upload so the DB row stays small.
// Longest side capped at 512px, re-encoded as JPEG @ 0.85 quality.
const resizeImage = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX = 512;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(
      (blob) => blob ? resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' })) : reject(new Error('resize failed')),
      'image/jpeg',
      0.85,
    );
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
  img.src = url;
});

export const uploadPhoto = async (file) => {
  const resized = await resizeImage(file).catch(() => file);
  const form = new FormData();
  form.append('file', resized);
  return client.post('/profile/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
