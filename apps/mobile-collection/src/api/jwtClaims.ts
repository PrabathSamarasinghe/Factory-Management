const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Index(character: string): number {
  return BASE64_CHARS.indexOf(character);
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const padded = `${normalized}${padding}`;
  const bytes: number[] = [];
  for (let index = 0; index < padded.length; index += 4) {
    const first = base64Index(padded[index]);
    const second = base64Index(padded[index + 1]);
    const third = base64Index(padded[index + 2]);
    const fourth = base64Index(padded[index + 3]);
    if (first < 0 || second < 0) {
      break;
    }
    const thirdValue = third < 0 ? 0 : third;
    const fourthValue = fourth < 0 ? 0 : fourth;
    const chunk = first * 262144 + second * 4096 + thirdValue * 64 + fourthValue;
    bytes.push(Math.floor(chunk / 65536) % 256);
    if (padded[index + 2] !== '=' && third >= 0) {
      bytes.push(Math.floor(chunk / 256) % 256);
    }
    if (padded[index + 3] !== '=' && fourth >= 0) {
      bytes.push(chunk % 256);
    }
  }
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 128) {
      result += String.fromCharCode(byte);
    } else if (byte >= 192 && byte < 224 && index + 1 < bytes.length) {
      result += String.fromCharCode((byte - 192) * 64 + (bytes[index + 1] - 128));
      index += 1;
    } else if (byte >= 224 && byte < 240 && index + 2 < bytes.length) {
      result += String.fromCharCode(
        (byte - 224) * 4096 +
          (bytes[index + 1] - 128) * 64 +
          (bytes[index + 2] - 128),
      );
      index += 2;
    } else if (byte >= 240 && index + 3 < bytes.length) {
      const codePoint =
        (byte - 240) * 262144 +
        (bytes[index + 1] - 128) * 4096 +
        (bytes[index + 2] - 128) * 64 +
        (bytes[index + 3] - 128);
      const offset = codePoint - 65536;
      result += String.fromCharCode(
        55296 + Math.floor(offset / 1024),
        56320 + (offset % 1024),
      );
      index += 3;
    } else {
      result += String.fromCharCode(byte);
    }
  }
  return result;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}
