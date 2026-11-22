import JSZip from "jszip";
import {
  COMPRESSION_QUALITY,
  type CropRatio,
  type EditorSettings,
  type FilterPreset,
  type ImageItem,
  type OutputFormat,
} from "./types";

export const FORMAT_MIME: Record<OutputFormat, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

export const FORMAT_EXTENSION: Record<OutputFormat, string> = {
  avif: "avif",
  webp: "webp",
  jpeg: "jpg",
  png: "png",
  gif: "gif",
};

/** Formatos con compresión con pérdida (la calidad sí les afecta). */
export const LOSSY_FORMATS: OutputFormat[] = ["avif", "webp", "jpeg"];

function baseName(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.slice(0, i) : fileName;
}

function outputName(fileName: string, format: OutputFormat): string {
  return `${baseName(fileName)}.${FORMAT_EXTENSION[format]}`;
}

const CROP_ASPECT: Record<Exclude<CropRatio, "original">, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "16:9": 16 / 9,
  "3:2": 3 / 2,
};

/** Recorte centrado en la imagen original según la proporción pedida. */
function cropSource(
  originalWidth: number,
  originalHeight: number,
  crop: CropRatio,
): { sx: number; sy: number; sw: number; sh: number } {
  if (crop === "original") return { sx: 0, sy: 0, sw: originalWidth, sh: originalHeight };
  const aspect = CROP_ASPECT[crop];
  const originalAspect = originalWidth / originalHeight;
  if (originalAspect > aspect) {
    // Sobran laterales: recortar ancho.
    const sw = Math.round(originalHeight * aspect);
    return { sx: Math.round((originalWidth - sw) / 2), sy: 0, sw, sh: originalHeight };
  }
  // Sobra arriba/abajo: recortar alto.
  const sh = Math.round(originalWidth / aspect);
  return { sx: 0, sy: Math.round((originalHeight - sh) / 2), sw: originalWidth, sh };
}

/** Dimensiones de salida según el modo de resolución, manteniendo proporción. */
export function targetDimensions(
  originalWidth: number,
  originalHeight: number,
  settings: EditorSettings,
): { width: number; height: number } {
  // La resolución se calcula sobre la imagen ya recortada (si hay recorte).
  const src = cropSource(originalWidth, originalHeight, settings.crop);
  const w = src.sw;
  const h = src.sh;
  const { resize } = settings;
  let out: { width: number; height: number };
  if (resize.kind === "original") out = { width: w, height: h };
  else if (resize.kind === "width") {
    const width = Math.max(1, Math.round(resize.width));
    out = { width, height: Math.max(1, Math.round((h * width) / w)) };
  } else if (resize.kind === "percent") {
    const scale = Math.max(1, resize.percent) / 100;
    out = {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
    };
  } else {
    // custom: si solo se da un lado, el otro se calcula por proporción.
    if (resize.width && !resize.height) {
      out = { width: resize.width, height: Math.max(1, Math.round((h * resize.width) / w)) };
    } else if (resize.height && !resize.width) {
      out = { width: Math.max(1, Math.round((w * resize.height) / h)), height: resize.height };
    } else if (resize.width && resize.height) {
      out = { width: resize.width, height: resize.height };
    } else {
      out = { width: w, height: h };
    }
  }
  // Rotación 90°/270° intercambia ancho y alto del lienzo final.
  if (settings.rotation === 90 || settings.rotation === 270) {
    return { width: out.height, height: out.width };
  }
  return out;
}

/** Cadena de filtro Canvas: ajustes neutros (100/100/100, sin gris/sepia) no cambian nada. */
export function buildFilter(settings: EditorSettings): string {
  const parts: string[] = [];
  const a = settings.adjustments;
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast / 100})`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation / 100})`);
  if (a.grayscale) parts.push("grayscale(1)");
  if (a.sepia) parts.push("sepia(0.8)");
  const preset: Record<FilterPreset, string> = {
    none: "",
    vintage: "sepia(0.4) contrast(0.9) brightness(1.05) saturate(0.8)",
    frio: "saturate(1.1) brightness(1.02)",
    calido: "sepia(0.25) saturate(1.2) brightness(1.03)",
    byn: "grayscale(1)",
  };
  if (preset[settings.filter]) parts.push(preset[settings.filter]);
  return parts.join(" ");
}

/** Velo de color para los presets frío/cálido (el resto no lleva velo). */
function presetOverlay(settings: EditorSettings): string | null {
  if (settings.filter === "frio") return "rgba(0, 80, 255, 0.06)";
  if (settings.filter === "calido") return "rgba(255, 150, 0, 0.06)";
  if (settings.filter === "vintage") return "rgba(180, 140, 80, 0.05)";
  return null;
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("El navegador no pudo generar la imagen."))),
      mime,
      quality,
    );
  });
}

/**
 * Comprueba si el navegador puede exportar a un formato, con un lienzo 1×1.
 * GIF nunca se puede (Canvas no lo codifica); AVIF depende del navegador.
 * Devuelve null si sí puede, o el motivo si no.
 */
export async function checkOutputSupport(format: OutputFormat): Promise<string | null> {
  if (format === "gif") {
    return "GIF no se puede generar desde el navegador (Canvas no codifica GIF). Elige PNG o WebP como salida.";
  }
  if (format === "png" || format === "jpeg" || format === "webp") return null;
  // avif: sonda real.
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob = await canvasToBlob(canvas, FORMAT_MIME[format], 0.8);
    if (blob.type !== FORMAT_MIME[format]) {
      return "AVIF no está soportado por este navegador para exportar. Prueba con WebP o JPG, o usa Chrome/Edge actualizado.";
    }
    return null;
  } catch {
    return "AVIF no está soportado por este navegador para exportar. Prueba con WebP o JPG.";
  }
}

/**
 * Procesa UNA imagen según la configuración.
 * Limitaciones reales de Canvas (no es un fallo de esta app):
 * - GIF: ningún navegador actual codifica GIF desde canvas.
 * - AVIF: depende del navegador; si no, toBlob() devuelve PNG.
 * - PNG es sin pérdida: el nivel de compresión no cambia su calidad.
 * - JPEG no admite transparencia: el fondo transparente se rellena con
 *   el color de fondo elegido (blanco por defecto).
 */
export async function processImage(
  item: ImageItem,
  settings: EditorSettings,
  outputNameOverride?: string,
): Promise<{ blob: Blob; name: string; width: number; height: number }> {
  if (settings.removeBackground) {
    throw new Error(
      "Quitar fondo no está disponible en esta versión: requiere descargar el modelo de IA (~40 MB) y aún no está integrado. Desactívalo para procesar esta imagen.",
    );
  }
  const { width, height } = targetDimensions(item.width, item.height, settings);
  const mime = FORMAT_MIME[settings.format];
  const quality = COMPRESSION_QUALITY[settings.compression];

  let bitmap: ImageBitmap;
  try {
    bitmap = await loadBitmap(item.file);
  } catch {
    throw new Error(
      "Formato no soportado por este navegador: no se pudo leer la imagen. Prueba con PNG, JPG, WebP o AVIF.",
    );
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el lienzo de dibujo en este navegador.");

    // Fondo para JPG (sin canal alfa).
    if (settings.format === "jpeg") {
      ctx.fillStyle = settings.backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    const src = cropSource(item.width, item.height, settings.crop);
    // Dimensiones de dibujo antes de rotar (intercambiadas si rota 90/270).
    const drawW = settings.rotation === 90 || settings.rotation === 270 ? height : width;
    const drawH = settings.rotation === 90 || settings.rotation === 270 ? width : height;

    ctx.save();
    ctx.filter = buildFilter(settings);
    ctx.translate(width / 2, height / 2);
    ctx.rotate((settings.rotation * Math.PI) / 180);
    ctx.scale(settings.flipH ? -1 : 1, settings.flipV ? -1 : 1);
    ctx.drawImage(bitmap, src.sx, src.sy, src.sw, src.sh, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Velo de color de los presets frío/cálido/vintage.
    const overlay = presetOverlay(settings);
    if (overlay) {
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);
    }

    // Marca de agua de texto (solo si está activada y hay texto).
    const wm = settings.watermark;
    if (wm.enabled && wm.text.trim()) {
      const pad = 12;
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, wm.opacity));
      ctx.font = `bold ${wm.size}px sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      const textWidth = ctx.measureText(wm.text).width;
      let x = pad;
      let y = height - pad;
      if (wm.position === "sup-izq") { x = pad; y = pad + wm.size; }
      if (wm.position === "sup-der") { x = width - pad - textWidth; y = pad + wm.size; }
      if (wm.position === "inf-izq") { x = pad; y = height - pad; }
      if (wm.position === "inf-der") { x = width - pad - textWidth; y = height - pad; }
      if (wm.position === "centro") { x = (width - textWidth) / 2; y = height / 2 + wm.size / 2; }
      ctx.strokeText(wm.text, x, y);
      ctx.fillText(wm.text, x, y);
      ctx.restore();
    }

    const blob = await canvasToBlob(canvas, mime, quality);

    // Liberar la memoria del lienzo en cuanto el blob ya existe: poner el
    // canvas a 0×0 suelta su búfer (ancho × alto × 4 bytes). El bitmap se
    // cierra en el finally de abajo.
    canvas.width = 0;
    canvas.height = 0;

    // Detección de codificación no soportada.
    if (blob.type !== mime) {
      if (settings.format === "gif") {
        throw new Error(
          "GIF no se puede generar desde el navegador (Canvas no codifica GIF). Elige PNG o WebP como salida.",
        );
      }
      if (settings.format === "avif") {
        throw new Error(
          "AVIF no está soportado por este navegador para exportar. Prueba con WebP o JPG, o usa Chrome/Edge actualizado.",
        );
      }
      throw new Error(
        `Este navegador no puede exportar a ${settings.format.toUpperCase()} (devolvió ${blob.type || "otro formato"}).`,
      );
    }

    return {
      blob,
      name: outputNameOverride ?? outputName(item.file.name, settings.format),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

/** Descarga un blob como archivo. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Descarga el resultado: 1 imagen → el archivo directo;
 * varias → un ZIP con todas las procesadas.
 */
export async function downloadResults(items: ImageItem[]): Promise<void> {
  const done = items.filter((i) => i.status === "listo" && i.resultBlob && i.resultName);
  if (done.length === 0) throw new Error("No hay imágenes procesadas para descargar.");
  if (done.length === 1) {
    downloadBlob(done[0].resultBlob!, done[0].resultName!);
    return;
  }
  const zip = new JSZip();
  for (const item of done) {
    zip.file(item.resultName!, item.resultBlob!);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "imagenes-procesadas.zip");
}
