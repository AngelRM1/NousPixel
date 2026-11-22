export type OutputFormat = "avif" | "webp" | "jpeg" | "png" | "gif";

export type CompressionLevel = "basica" | "media" | "alta";

/** Calidad JPEG/WebP/AVIF (0-1). PNG es sin pérdida: la calidad no le afecta. */
export const COMPRESSION_QUALITY: Record<CompressionLevel, number> = {
  basica: 0.92,
  media: 0.75,
  alta: 0.5,
};

export const COMPRESSION_LABEL: Record<CompressionLevel, string> = {
  basica: "Básica",
  media: "Media",
  alta: "Alta",
};

export type ResizeMode =
  | { kind: "original" }
  | { kind: "width"; width: number }
  | { kind: "percent"; percent: number }
  | { kind: "custom"; width?: number; height?: number };

/** Ajustes de color. Valores neutros = sin cambio visible. */
export interface Adjustments {
  brightness: number; // 100 = neutro (0–200)
  contrast: number; // 100 = neutro (0–200)
  saturation: number; // 100 = neutro (0–200)
  grayscale: boolean; // false = neutro
  sepia: boolean; // false = neutro
}

export type Rotation = 0 | 90 | 180 | 270;

export type FilterPreset = "none" | "vintage" | "frio" | "calido" | "byn";

export type CropRatio = "original" | "1:1" | "4:5" | "16:9" | "3:2";

export type WatermarkPosition =
  | "sup-izq"
  | "sup-der"
  | "inf-izq"
  | "inf-der"
  | "centro";

export interface WatermarkSettings {
  enabled: boolean; // false = neutro (sin marca)
  text: string;
  opacity: number; // 0–1, por defecto 0.6
  size: number; // px, por defecto 24
  position: WatermarkPosition;
}

export type SequenceType = "numerico" | "alfabetico" | "romano";

export interface RenameSettings {
  enabled: boolean; // false = se conserva el nombre original
  baseName: string;
  separator: "-" | "_";
  sequence: SequenceType;
  /** Texto tal cual lo escribe el usuario: "222", "C", "V", "1"... */
  start: string;
  /** Relleno con ceros para numérico: 0 = sin relleno, 2–4 = dígitos. */
  padDigits: 0 | 2 | 3 | 4;
}

export interface EditorSettings {
  format: OutputFormat;
  resize: ResizeMode;
  compression: CompressionLevel;
  adjustments: Adjustments;
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  filter: FilterPreset;
  crop: CropRatio;
  watermark: WatermarkSettings;
  /** Color de fondo para JPG (sin transparencia). Blanco por defecto. */
  backgroundColor: string;
  /**
   * Quitar fondo: desactivado por defecto. NO implementado en esta versión
   * (ver README): requiere descargar el modelo ONNX de
   * @imgly/background-removal (~40 MB). Si está activado, cada imagen se
   * marca con ese error antes de procesar y se excluye del lote.
   */
  removeBackground: boolean;
  rename: RenameSettings;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  format: "webp",
  resize: { kind: "original" },
  compression: "media",
  adjustments: { brightness: 100, contrast: 100, saturation: 100, grayscale: false, sepia: false },
  rotation: 0,
  flipH: false,
  flipV: false,
  filter: "none",
  crop: "original",
  watermark: { enabled: false, text: "", opacity: 0.6, size: 24, position: "inf-der" },
  backgroundColor: "#ffffff",
  removeBackground: false,
  rename: { enabled: false, baseName: "", separator: "-", sequence: "numerico", start: "1", padDigits: 0 },
};

/**
 * Límites unificados del lote: viven en lib/limits.ts (una sola fuente de
 * verdad, igual que en el prototipo web) y se reexportan aquí para no
 * romper las importaciones existentes.
 */
export {
  ESTIMATED_SECONDS_PER_MEGAPIXEL,
  LIGHT_MAX_IMAGES,
  LIGHT_MAX_TOTAL_BYTES,
  LIGHT_MAX_TOTAL_MEGAPIXELS,
  MAX_FILE_BYTES,
  MAX_IMAGES_PER_BATCH,
  MAX_MEGAPIXELS_PER_IMAGE,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_MEGAPIXELS,
  NO_PROGRESS_MS,
  SLOW_IMAGE_MS,
  SLOW_TOTAL_MS,
} from "./limits";

export type ItemStatus = "pendiente" | "procesando" | "listo" | "error" | "omitido";

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  status: ItemStatus;
  /** Resultado del procesado (si status === "listo"). */
  resultBlob?: Blob;
  resultUrl?: string;
  resultName?: string;
  resultSize?: number;
  resultWidth?: number;
  resultHeight?: number;
  error?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function savedPercent(original: number, result: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - result) / original) * 100);
}
