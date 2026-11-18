export function uuidV4(): string {
  const hex = '0123456789abcdef';
  let value = '';
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      value += '-';
    } else if (index === 14) {
      value += '4';
    } else if (index === 19) {
      value += hex[8 + Math.floor(Math.random() * 4)];
    } else {
      value += hex[Math.floor(Math.random() * 16)];
    }
  }
  return value;
}
