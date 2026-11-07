import createQr from 'qrcode-generator';

const SITE = 'https://andpatelecitems.web.app';

export interface QrShape {
  size: number;
  /** Trazado SVG de los módulos oscuros. */
  d: string;
}

/** Dirección que abre el ítem. Se escanea con la cámara del teléfono, sin app especial. */
export function itemUrl(path: string[]) {
  return `${SITE}/action?path=${encodeURIComponent(JSON.stringify(path))}`;
}

export function qrShape(text: string): QrShape {
  const code = createQr(0, 'M');
  code.addData(text);
  code.make();

  const size = code.getModuleCount();
  let d = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (code.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size, d };
}

export interface Label {
  name: string;
  detail: string;
  code?: string;
  path: string[];
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);

/** Documento aparte para imprimir: el papel no depende del diseño de la app. */
export function labelsDocument(labels: Label[]): string {
  const cells = labels
    .map((label) => {
      const { size, d } = qrShape(itemUrl(label.path));
      return `<div class="label">
  <svg viewBox="-2 -2 ${size + 4} ${size + 4}" shape-rendering="crispEdges"><path d="${d}"/></svg>
  <div class="text">
    <strong>${escapeHtml(label.name)}</strong>
    <span>${escapeHtml(label.detail)}</span>
    ${label.code ? `<span>Código: ${escapeHtml(label.code)}</span>` : ''}
  </div>
</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Etiquetas Andpatelec</title>
<style>
  @page { margin: 10mm; }
  body { margin: 0; font-family: Arial, sans-serif; color: #000; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .label { display: flex; align-items: center; gap: 3mm; padding: 2mm; border: 0.2mm solid #999; break-inside: avoid; }
  svg { width: 24mm; height: 24mm; flex: none; }
  .text { min-width: 0; font-size: 9pt; line-height: 1.25; }
  strong { display: block; font-size: 11pt; }
  span { display: block; overflow-wrap: anywhere; }
</style></head><body><div class="sheet">${cells}</div></body></html>`;
}

/** Imprime en un marco oculto para no abrir otra ventana. */
export function printLabels(labels: Label[]) {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  frame.srcdoc = labelsDocument(labels);
  document.body.appendChild(frame);
}
