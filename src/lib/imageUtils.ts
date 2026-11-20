const MAX_DATA_URL_LENGTH = 145000;

function encodeCanvasToBoundedJpeg(
  canvas: HTMLCanvasElement,
  initialQuality = 0.78,
): string {
  let quality = initialQuality;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.35) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    const scale = 0.7;
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(160, Math.round(canvas.width * scale));
    smaller.height = Math.max(160, Math.round(canvas.height * scale));
    const ctx = smaller.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      dataUrl = smaller.toDataURL('image/jpeg', 0.65);
    }
  }

  return dataUrl.slice(0, MAX_DATA_URL_LENGTH + 10000);
}

export async function compressImageFile(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file'));
      el.src = imageUrl;
    });

    const maxDim = 520;
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    ctx.drawImage(img, 0, 0, width, height);
    return encodeCanvasToBoundedJpeg(canvas);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function captureVideoFrame(video: HTMLVideoElement): string {
  const maxDim = 520;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const ratio = Math.min(1, maxDim / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * ratio));
  const height = Math.max(1, Math.round(vh * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(video, 0, 0, width, height);
  return encodeCanvasToBoundedJpeg(canvas);
}
