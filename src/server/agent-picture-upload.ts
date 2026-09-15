import { crc32 } from 'node:zlib';
import { GameError } from '../game/types';
import { PICTURE_MAX_BYTES, PICTURE_MAX_DIMENSION } from '../shared/agent-picture';

function invalid(): never {
  throw new GameError('invalid-picture', 'Use a complete PNG or JPEG raster image.', 400);
}

function dimensions(width: number, height: number) {
  if (!width || !height || width > PICTURE_MAX_DIMENSION || height > PICTURE_MAX_DIMENSION)
    throw new GameError(
      'picture-dimensions',
      'Pictures must be between 1 and 2048 pixels on each side.',
      400,
    );

  return { width, height };
}

/** Container validation, not a pixel decoder. Never accepts SVG, HTML or a filename as proof of type. */
export function inspectPicture(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  if (bytes.length >= 45 && text(0, 8) === '\x89PNG\r\n\x1a\n') {
    if (view.getUint32(8) !== 13 || text(12, 4) !== 'IHDR') invalid();

    if (crc32(bytes.subarray(12, 29)) !== view.getUint32(29)) invalid();
    const size = dimensions(view.getUint32(16), view.getUint32(20));

    const depths = new Map([
      [0, [1, 2, 4, 8, 16]],
      [2, [8, 16]],
      [3, [1, 2, 4, 8]],
      [4, [8, 16]],
      [6, [8, 16]],
    ]);

    if (!depths.get(bytes[25])?.includes(bytes[24]) || bytes[26] || bytes[27] || bytes[28] > 1) invalid();
    let data = false;
    let endData = false;
    let palette = false;
    let chunks = 0;

    for (let offset = 33; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const type = text(offset + 4, 4);
      const start = offset;
      offset += length + 12;

      if (
        offset > bytes.length ||
        !/^[a-zA-Z]{4}$/.test(type) ||
        ['IHDR', 'acTL', 'fcTL', 'fdAT'].includes(type)
      )
        invalid();

      if (++chunks > 1024 || crc32(bytes.subarray(start + 4, offset - 4)) !== view.getUint32(offset - 4))
        invalid();

      if (/^[A-Z]/.test(type) && !['PLTE', 'IDAT', 'IEND'].includes(type)) invalid();

      if (type === 'PLTE') {
        if (palette || data || !length || length > 768 || length % 3) invalid();
        palette = true;
      }

      if (type === 'IDAT') {
        if (endData) invalid();
        data ||= length > 0;
      } else if (data) endData = true;

      if (type === 'IEND') {
        if (length || offset !== bytes.length || !data || (bytes[25] === 3 && !palette)) invalid();

        return { ...size, contentType: 'image/png' as const };
      }
    }

    invalid();
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let size: { width: number; height: number } | undefined;
    let scan = false;
    let entropy = false;

    for (let offset = 2; offset < bytes.length;) {
      if (bytes[offset++] !== 0xff) {
        if (!scan) invalid();
        entropy = true;
        continue;
      }

      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];

      if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;

      if (marker === 0xd9) {
        if (!size || !scan || !entropy || offset !== bytes.length) invalid();

        return { ...size, contentType: 'image/jpeg' as const };
      }

      if (offset + 2 > bytes.length) invalid();
      const length = view.getUint16(offset);

      if (length < 2 || offset + length > bytes.length) invalid();

      if (marker === 0xc0 || marker === 0xc2) {
        if (size || length < 11 || bytes[offset + 2] !== 8) invalid();
        const components = bytes[offset + 7];

        if (![1, 3].includes(components) || length !== 8 + components * 3) invalid();
        size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }

      if (marker === 0xda) {
        if (!size || length < 6 || length !== 6 + 2 * bytes[offset + 2]) invalid();
        scan = true;
      }

      offset += length;
    }
  }

  return invalid();
}

export async function readPicture(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase().trim();

  if (contentType !== 'image/png' && contentType !== 'image/jpeg')
    throw new GameError('picture-content-type', 'Send the binary file with image/png or image/jpeg.', 415);

  if (Number(request.headers.get('content-length')) > PICTURE_MAX_BYTES)
    throw new GameError('body-too-large', 'Pictures must be at most 2 MiB.', 413);
  const reader = request.body?.getReader();

  if (!reader) invalid();
  const buffer = new Uint8Array(PICTURE_MAX_BYTES);
  let size = 0;

  try {
    for (;;) {
      const next = await reader.read();

      if (next.done) break;

      if (size + next.value.byteLength > PICTURE_MAX_BYTES) {
        await reader.cancel();
        throw new GameError('body-too-large', 'Pictures must be at most 2 MiB.', 413);
      }

      buffer.set(next.value, size);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = buffer.slice(0, size);
  const image = inspectPicture(bytes);

  if (image.contentType !== contentType)
    throw new GameError('picture-content-type', 'Content-Type must match the actual image format.', 415);

  return { bytes, image };
}
