import { processImage, targetDimensions } from "./imageProcessor";
import type { EditorSettings, ImageItem } from "./types";

/**
 * Lado máximo del render de la vista previa, en píxeles.
 * La etiqueta muestra siempre las dimensiones REALES de salida; la imagen
 * en pantalla se ve escalada con CSS (y, si la salida es muy grande, la
 * preview se genera a resolución reducida para no colgar el navegador).
 */
export const PREVIEW_MAX_SIDE = 1600;

/** Límite de megapíxeles a partir del cual la preview se genera reducida. */
export const PREVIEW_SCALED_ABOVE_MP = 25;

export interface PreviewResult {
  /** URL del blob de la preview (revocar con URL.revokeObjectURL al desecharla). */
  url: string;
  blob: Blob;
  /** Dimensiones REALES de salida (sin el tope de la preview). */
  width: number;
  height: number;
  /** true si la preview se generó a resolución reducida (salida muy grande). */
  scaled: boolean;
  /** Peso del blob de la preview: exacto si no está reducida, aproximado si lo está. */
  size: number;
  /** Formato real de salida (con quitar fondo, JPG se fuerza a PNG). */
  format: import("./types").OutputFormat;
}

/**
 * Genera la vista previa de UNA imagen con el MISMO pipeline que el lote
 * (processImage: formato, resolución, compresión, ajustes, rotación,
 * recorte, filtros y marca de agua), así la preview es fiel y no una
 * aproximación.
 *
 * Si la salida real es muy grande (más de 25 MP o lado mayor de 1600 px),
 * la preview se genera a resolución reducida (mismo pipeline, con la
 * resolución limitada a 1600 px de lado) para no colgar el navegador; en
 * ese caso `scaled` es true y el peso es aproximado, pero las dimensiones
 * que se muestran siguen siendo las reales de salida.
 */
export async function generatePreview(
  item: ImageItem,
  settings: EditorSettings,
): Promise<PreviewResult> {
  if (item.width <= 0 || item.height <= 0) {
    throw new Error(
      item.error ??
        "No se puede previsualizar esta imagen: el navegador no pudo leerla.",
    );
  }

  const target = targetDimensions(item.width, item.height, settings);
  const targetMp = (target.width * target.height) / 1_000_000;
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(target.width, target.height));
  const scaled = targetMp > PREVIEW_SCALED_ABOVE_MP || scale < 1;

  let previewSettings = settings;
  if (scaled) {
    // Dimensiones de la preview (post-rotación), escaladas a 1600 px de lado.
    const pw = Math.max(1, Math.round(target.width * scale));
    const ph = Math.max(1, Math.round(target.height * scale));
    // processImage aplica la rotación 90°/270° intercambiando ancho y alto,
    // así que las dimensiones pre-rotación son las inversas en ese caso.
    const pre =
      settings.rotation === 90 || settings.rotation === 270
        ? { width: ph, height: pw }
        : { width: pw, height: ph };
    previewSettings = {
      ...settings,
      resize: { kind: "custom", width: pre.width, height: pre.height },
    };
  }

  // El mismo procesado que el lote: si falla (GIF, AVIF no soportado,
  // quitar fondo activado...), el error exacto se propaga al panel.
  const result = await processImage(item, previewSettings);
  return {
    url: URL.createObjectURL(result.blob),
    blob: result.blob,
    width: target.width,
    height: target.height,
    scaled,
    size: result.blob.size,
    format: result.format,
  };
}
