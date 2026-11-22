import { formatBytes, type ImageItem } from "./types";

/**
 * Límites unificados del lote — IGUALES en el proyecto Next.js y en el
 * prototipo web. Si cambian aquí, cambian en los dos lados: no hay otro
 * sitio con estos números (ver README: tabla de límites).
 *
 * Son límites de seguridad, no de la librería: el procesado es en memoria
 * (Canvas) y un lote demasiado grande puede colgar la pestaña, sobre todo
 * en móvil. Por eso el semáforo bloquea Iniciar en rojo y solo deja
 * procesar el subconjunto que cabe.
 */
export const MAX_IMAGES_PER_BATCH = 30; // imágenes por lote
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB por imagen
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB en total
export const MAX_MEGAPIXELS_PER_IMAGE = 100; // MP por imagen
export const MAX_TOTAL_MEGAPIXELS = 200; // MP en total por lote

/** Aviso de lentitud: una imagen > 5 s, o el lote total > 15 s. */
export const SLOW_IMAGE_MS = 5_000;
export const SLOW_TOTAL_MS = 15_000;
/** Sin progreso visible > 8 s: mostrar latido "aún procesando…". */
export const NO_PROGRESS_MS = 8_000;

/**
 * Tiempo estimado orientativo: ~0,5 s por megapíxel en escritorio.
 * Es una estimación gruesa: varía según el dispositivo, el navegador, el
 * formato de salida y los ajustes (filtros, marca de agua…). Solo sirve
 * para que el usuario sepa si el lote va a tardar segundos o minutos.
 */
export const ESTIMATED_SECONDS_PER_MEGAPIXEL = 0.5;

/** Umbrales del semáforo verde (lote ligero). */
export const LIGHT_MAX_IMAGES = 15;
export const LIGHT_MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB
export const LIGHT_MAX_TOTAL_MEGAPIXELS = 50; // 50 MP

export type Semaphore = "verde" | "ambar" | "rojo";

/** Megapíxeles de una imagen (0 si aún no se conocen sus dimensiones). */
export function megapixelsOf(item: ImageItem): number {
  if (!item.width || !item.height) return 0;
  return (item.width * item.height) / 1_000_000;
}

/**
 * Memoria estimada de decodificación de una imagen: ancho × alto × 4 bytes
 * (un píxel RGBA en memoria). Es una estimación: Canvas usa además un
 * búfer de salida del mismo tamaño (otro ancho × alto × 4 bytes) y el
 * navegador guarda el blob original y el resultado, así que la memoria
 * real durante el procesado de esa imagen puede ser ~2–3 veces esta cifra.
 */
export function decodeMemoryBytesOf(item: ImageItem): number {
  if (!item.width || !item.height) return 0;
  return item.width * item.height * 4;
}

/** Motivos por los que una imagen individual queda fuera del lote. */
export function individualIssuesOf(item: ImageItem): string[] {
  const reasons: string[] = [];
  if (item.file.size > MAX_FILE_BYTES) {
    reasons.push(
      `pesa ${formatBytes(item.file.size)} y supera el máximo de ${formatBytes(MAX_FILE_BYTES)} por imagen`,
    );
  }
  const mp = megapixelsOf(item);
  if (mp > MAX_MEGAPIXELS_PER_IMAGE) {
    reasons.push(
      `tiene ${mp.toFixed(1)} MP y supera el máximo de ${MAX_MEGAPIXELS_PER_IMAGE} MP por imagen (${item.width}×${item.height} px)`,
    );
  }
  return reasons;
}

export interface BatchSummary {
  /** Todas las imágenes cargadas (incluidas las que se omitirán). */
  count: number;
  /** Suma de file.size de todas las cargadas. */
  totalBytes: number;
  /** Suma de MP de todas las cargadas con dimensiones conocidas. */
  totalMegapixels: number;
  /** Suma de la memoria estimada de decodificación (w×h×4) de las candidatas. */
  estimatedDecodeBytes: number;
  /** Tiempo estimado orientativo en segundos (MP candidatas × 0,5 s). */
  estimatedSeconds: number;
  /** Imágenes que pueden procesarse (sin error y sin superar el límite individual). */
  candidates: ImageItem[];
  /** Imágenes que se omitirán por superar el límite individual, con su motivo. */
  individualOmitted: { item: ImageItem; reasons: string[] }[];
  /** Semáforo del lote (calculado solo sobre las candidatas). */
  semaphore: Semaphore;
  /** Qué límites duros de lote se exceden y por cuánto (vacío si no hay). */
  hardIssues: string[];
  /** Subconjunto que cabe si se divide el lote: primeras candidatas en orden. */
  fit: ImageItem[];
  /** ¿Bloquea Iniciar? (semáforo rojo y sin división confirmada). */
  blocked: boolean;
}

/**
 * Cálculo previo del lote, en cuanto las imágenes tienen dimensiones
 * conocidas (al cargarlas). No procesa nada: solo suma y compara.
 *
 * Los totales del semáforo se calculan sobre las CANDIDATAS (las que no
 * tienen error y no superan el límite individual), porque las omitidas no
 * se van a procesar y no deben bloquear el resto: si una imagen de 40 MB
 * hiciera rojo el lote entero, una sola imagen mala impediría procesar
 * las 29 buenas. Las candidatas que exceden un límite de lote sí
 * bloquean Iniciar hasta quitar imágenes o dividir el lote.
 */
export function summarizeBatch(items: ImageItem[]): BatchSummary {
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const totalMegapixels = items.reduce((sum, i) => sum + megapixelsOf(i), 0);

  const candidates: ImageItem[] = [];
  const individualOmitted: { item: ImageItem; reasons: string[] }[] = [];
  for (const item of items) {
    if (item.status === "error") continue;
    const reasons = individualIssuesOf(item);
    if (reasons.length > 0) {
      // Se omitirá (o ya se omitió) por superar el límite individual.
      individualOmitted.push({ item, reasons });
    } else if (item.status === "pendiente") {
      // Solo las pendientes son candidatas: las "listo" ya están hechas y
      // las "omitido"/"procesando" no se vuelven a procesar. Así, tras
      // dividir un lote, el resto pendiente sigue siendo un lote válido.
      candidates.push(item);
    }
  }

  const candidateBytes = candidates.reduce((sum, i) => sum + i.file.size, 0);
  const candidateMp = candidates.reduce((sum, i) => sum + megapixelsOf(i), 0);
  const estimatedDecodeBytes = candidates.reduce((sum, i) => sum + decodeMemoryBytesOf(i), 0);
  const estimatedSeconds = candidateMp * ESTIMATED_SECONDS_PER_MEGAPIXEL;

  // Límites duros de lote (sobre candidatas).
  const hardIssues: string[] = [];
  if (candidates.length > MAX_IMAGES_PER_BATCH) {
    hardIssues.push(
      `${candidates.length} imágenes válidas (máx. ${MAX_IMAGES_PER_BATCH} por lote): sobran ${candidates.length - MAX_IMAGES_PER_BATCH}`,
    );
  }
  if (candidateBytes > MAX_TOTAL_BYTES) {
    hardIssues.push(
      `${formatBytes(candidateBytes)} en total (máx. ${formatBytes(MAX_TOTAL_BYTES)}): sobran ${formatBytes(candidateBytes - MAX_TOTAL_BYTES)}`,
    );
  }
  if (candidateMp > MAX_TOTAL_MEGAPIXELS) {
    hardIssues.push(
      `${candidateMp.toFixed(1)} MP en total (máx. ${MAX_TOTAL_MEGAPIXELS} MP por lote): sobran ${(candidateMp - MAX_TOTAL_MEGAPIXELS).toFixed(1)} MP`,
    );
  }

  let semaphore: Semaphore = "verde";
  if (hardIssues.length > 0) {
    semaphore = "rojo";
  } else if (
    candidates.length > LIGHT_MAX_IMAGES ||
    candidateBytes > LIGHT_MAX_TOTAL_BYTES ||
    candidateMp > LIGHT_MAX_TOTAL_MEGAPIXELS
  ) {
    semaphore = "ambar";
  }

  // Primeras candidatas en orden que respetan 30 / 200 MB / 200 MP.
  const fit: ImageItem[] = [];
  let accBytes = 0;
  let accMp = 0;
  for (const item of candidates) {
    const mp = megapixelsOf(item);
    if (
      fit.length >= MAX_IMAGES_PER_BATCH ||
      accBytes + item.file.size > MAX_TOTAL_BYTES ||
      accMp + mp > MAX_TOTAL_MEGAPIXELS
    ) {
      break;
    }
    fit.push(item);
    accBytes += item.file.size;
    accMp += mp;
  }

  return {
    count: items.length,
    totalBytes,
    totalMegapixels,
    estimatedDecodeBytes,
    estimatedSeconds,
    candidates,
    individualOmitted,
    semaphore,
    hardIssues,
    fit,
    blocked: semaphore === "rojo",
  };
}

export function formatEstimatedTime(seconds: number): string {
  if (seconds < 1) return "menos de 1 s";
  if (seconds < 60) return `~${Math.round(seconds)} s`;
  const min = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `~${min} min ${s} s`;
}
