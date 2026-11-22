/**
 * Quitar fondo con IA — vía permisiva, sin @imgly/background-removal
 * (AGPL-3.0) ni RMBG de BRIA (CC BY-NC, solo no comercial).
 *
 * Modelo: ISNet general-use int8 (ORMBG, onnx-community), ~44 MB,
 * Apache-2.0. Runtime: onnxruntime-web (MIT), cargado de forma perezosa
 * y ejecutado 100% en el navegador: solo el modelo se descarga, las
 * imágenes nunca salen del dispositivo.
 *
 * Verificación (2026-11-22, con curl y onnxruntime-web en Node):
 * - URL elegida: https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_quantized.onnx
 *   → HTTP 200, 44.315.205 bytes (~44 MB). La URL alternativa de rembg en
 *   GitHub (isnet-general-use.onnx) también responde 200, pero el archivo
 *   es el modelo completo de ~179 MB, así que solo es reserva.
 * - La URL de Hugging Face imgly/isnet-general-onnx/resolve/main/model.onnx
 *   dio 404 y NO se usa.
 * - Preprocesado verificado contra el preprocessor_config.json del propio
 *   repo del modelo: resize a 1024×1024 y valores en [0, 1] (pixel / 255),
 *   sin normalización por media/desviación.
 * - Con una foto real, la sesión (input "pixel_values", salida "alphas",
 *   [1,1,1024,1024]) dio una máscara con media 0,725 en el centro (sujeto)
 *   y 0,000 en las esquinas (fondo); la composición se verificó visualmente.
 * - Inferencia a 1 hilo en CPU: ~9 s por imagen de 1024×1024 en Node.
 *   En el navegador (WASM, 1 hilo) será parecida o algo más lenta.
 *
 * Runtime WASM: se importa el entry point solo-WASM
 * (`onnxruntime-web/wasm`), sin el EP de WebGPU: así Next.js no emite
 * el wasm de WebGPU (29 MB, por encima del límite de 25 MB por archivo
 * de Cloudflare Pages) y solo emite `ort-wasm-simd-threaded.wasm`
 * (~15 MB, dentro del límite), que el propio loader carga desde el
 * mismo origen. El modelo .onnx NO se sube al repo ni a public/
 * (Cloudflare Pages tiene límite de 25 MB por archivo).
 * Sin COOP/COEP el WASM corre a 1 hilo: más lento, pero funciona en
 * cualquier navegador moderno sin cabeceras especiales.
 */

export const MODEL_NAME = "ISNet general-use int8 (ORMBG)";
export const MODEL_LICENSE = "Apache-2.0";
/** Tamaño real verificado del modelo (bytes). */
export const MODEL_SIZE_BYTES = 44_315_205;
/** ~44 MB, en texto para la UI. */
export const MODEL_SIZE_LABEL = "~44 MB";

/**
 * URLs del modelo, en orden de intento. La primera es la verificada
 * (int8, ~44 MB). La segunda es el modelo completo de rembg (~179 MB):
 * solo se usa si la primera falla, y entonces la descarga es mucho mayor.
 */
export const MODEL_URLS = [
  "https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_quantized.onnx",
  "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
] as const;

/** Versión fijada de onnxruntime-web (misma que en package.json). */
export const ORT_VERSION = "1.31.1";

/** Lado de entrada del modelo, en píxeles. */
export const MODEL_INPUT_SIZE = 1024;

const MODEL_CACHE_NAME = "nouspixel-bg-model-v1";

export type ModelState = "idle" | "downloading" | "ready" | "error";

export interface ModelStatus {
  state: ModelState;
  /** 0–100 durante la descarga del modelo. */
  progress: number;
  /** Mensaje de error, si state === "error". */
  error?: string;
}

export interface MaskData {
  /** Valores de alfa en [0, 1], en orden de filas. */
  data: Float32Array;
  width: number;
  height: number;
}

type OrtModule = typeof import("onnxruntime-web");
type OrtSession = import("onnxruntime-web").InferenceSession;

let sessionPromise: Promise<OrtSession> | null = null;
let session: OrtSession | null = null;
let ortModule: OrtModule | null = null;
let status: ModelStatus = { state: "idle", progress: 0 };
const listeners = new Set<(status: ModelStatus) => void>();

function setStatus(next: ModelStatus): void {
  status = next;
  listeners.forEach((cb) => cb(next));
}

/** Estado actual del modelo (para mostrarlo en la UI). */
export function getModelStatus(): ModelStatus {
  return status;
}

/** Suscribirse a los cambios de estado del modelo. Devuelve el desuscriptor. */
export function subscribeModelStatus(cb: (status: ModelStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Limpia el error guardado para poder reintentar la descarga. */
export function resetBackgroundModel(): void {
  sessionPromise = null;
  session = null;
  setStatus({ state: "idle", progress: 0 });
}

async function downloadWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`El modelo no se pudo descargar (HTTP ${res.status}).`);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;
  // Sin lector de stream (algunos navegadores), descarga directa.
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, total ?? buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}

async function loadModelBytes(onProgress: (p: number) => void): Promise<ArrayBuffer> {
  // 1) Caché del navegador: la primera descarga (~44 MB) queda guardada
  // y las siguientes veces no se vuelve a bajar.
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(MODEL_CACHE_NAME);
      for (const url of MODEL_URLS) {
        const hit = await cache.match(url);
        if (hit) {
          const buf = await hit.arrayBuffer();
          if (buf.byteLength > 1_000_000) {
            onProgress(100);
            return buf;
          }
        }
      }
    }
  } catch {
    // Sin Cache Storage, se descarga igualmente (sin caché).
  }

  // 2) Descarga con progreso, probando las URLs en orden.
  let lastError: Error | null = null;
  for (const url of MODEL_URLS) {
    try {
      const bytes = await downloadWithProgress(url, (loaded, total) => {
        const expected = total ?? MODEL_SIZE_BYTES;
        onProgress(Math.min(100, Math.round((loaded / expected) * 100)));
      });
      if (bytes.byteLength < 1_000_000) {
        throw new Error("El modelo descargado está incompleto (menos de 1 MB).");
      }
      // Guardar en caché para la próxima vez (si se puede).
      try {
        if (typeof caches !== "undefined") {
          const cache = await caches.open(MODEL_CACHE_NAME);
          await cache.put(url, new Response(bytes.slice(0)));
        }
      } catch {
        // Si no se puede cachear, el modelo sigue funcionando en esta sesión.
      }
      onProgress(100);
      return bytes;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("No se pudo descargar el modelo.");
    }
  }
  throw lastError ?? new Error("No se pudo descargar el modelo de quitar fondo.");
}

/**
 * Descarga (solo la primera vez) y prepara el modelo. Devuelve la sesión
 * lista. Las llamadas concurrentes comparten la misma promesa: el modelo
 * no se descarga dos veces. Si la descarga falla, el error queda guardado
 * y no se reintenta hasta resetBackgroundModel().
 */
export function ensureModel(
  onProgress?: (percent: number) => void,
): Promise<OrtSession> {
  if (session) return Promise.resolve(session);
  if (!sessionPromise) {
    setStatus({ state: "downloading", progress: 0 });
    sessionPromise = (async () => {
      try {
        const bytes = await loadModelBytes((p) => {
          setStatus({ state: "downloading", progress: p });
          onProgress?.(p);
        });
        // Entry point solo-WASM (sin WebGPU/WebGL): el loader carga el
        // wasm emitido por Next.js desde el mismo origen.
        // El subpath no trae tipos propios: se tipa como el módulo raíz.
        const ort = (await import(
          "onnxruntime-web/wasm",
        )) as unknown as OrtModule;
        // 1 hilo: sin COOP/COEP el WASM con hilos no funciona en el
        // navegador; a 1 hilo es más lento (varios segundos por imagen),
        // pero funciona en cualquier navegador moderno.
        ort.env.wasm.numThreads = 1;
        const created = await ort.InferenceSession.create(bytes, {
          executionProviders: ["wasm"],
        });
        ortModule = ort;
        session = created;
        setStatus({ state: "ready", progress: 100 });
        return created;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo preparar el modelo de quitar fondo.";
        setStatus({ state: "error", progress: 0, error: message });
        throw new Error(
          `No se pudo descargar o preparar el modelo de quitar fondo (${MODEL_NAME}, ${MODEL_SIZE_LABEL}). Revisa tu conexión e inténtalo de nuevo. Detalle: ${message}`,
        );
      }
    })();
  }
  return sessionPromise;
}

/**
 * Calcula la máscara de fondo de una región de una imagen.
 * La región se redimensiona a 1024×1024 (entrada del modelo) y los
 * píxeles van en [0, 1] (pixel / 255), sin normalización por media ni
 * desviación, tal como indica el preprocessor_config.json del modelo.
 * Devuelve la máscara a 1024×1024 con valores de alfa en [0, 1].
 */
export async function computeMask(
  bitmap: ImageBitmap,
  crop: { sx: number; sy: number; sw: number; sh: number },
): Promise<MaskData> {
  const ort = ortModule;
  const sess = session ?? (await ensureModel());
  if (!ort) throw new Error("El runtime de IA no está cargado.");

  // Región recortada → lienzo 1024×1024.
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_INPUT_SIZE;
  canvas.height = MODEL_INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo crear el lienzo para quitar el fondo.");
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  canvas.width = 0;
  canvas.height = 0;

  // Tensor NCHW float32 en [0, 1].
  const n = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const data = new Float32Array(3 * n);
  const px = imageData.data;
  for (let i = 0; i < n; i++) {
    data[i] = px[i * 4] / 255;
    data[n + i] = px[i * 4 + 1] / 255;
    data[2 * n + i] = px[i * 4 + 2] / 255;
  }
  const inputName = sess.inputNames[0] ?? "pixel_values";
  const outputName = sess.outputNames[0] ?? "alphas";
  const tensor = new ort.Tensor("float32", data, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
  const results = await sess.run({ [inputName]: tensor });
  const output = results[outputName];
  if (!output || output.data.length !== n) {
    throw new Error("El modelo de quitar fondo devolvió una máscara inválida.");
  }
  return { data: output.data as Float32Array, width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE };
}

/**
 * Convierte una máscara en un lienzo: blanco con alfa = máscara, listo
 * para aplicar con globalCompositeOperation "destination-in".
 */
export function maskToCanvas(mask: MaskData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo de la máscara.");
  const imageData = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const a = Math.max(0, Math.min(1, mask.data[i]));
    imageData.data[i * 4] = 255;
    imageData.data[i * 4 + 1] = 255;
    imageData.data[i * 4 + 2] = 255;
    imageData.data[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
