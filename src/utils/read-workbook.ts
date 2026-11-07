import * as XLSX from 'xlsx';

const isBinaryWorkbook = (bytes: Uint8Array) =>
  (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);

/** Un CSV puede venir en UTF-8 o en el formato de Excel en Windows. */
function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Lee Excel o CSV sin romper tildes ni la ñ. */
export function readWorkbook(data: string | ArrayBuffer, isBase64: boolean): XLSX.WorkBook {
  if (typeof data === 'string') {
    return XLSX.read(data, { type: isBase64 ? 'base64' : 'string', codepage: 65001 });
  }
  const bytes = new Uint8Array(data);
  return isBinaryWorkbook(bytes)
    ? XLSX.read(data, { type: 'array' })
    : XLSX.read(decodeCsv(bytes), { type: 'string' });
}
