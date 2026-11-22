"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Donations from "@/components/Donations";
import ImageList from "@/components/ImageList";
import PreviewPanel from "@/components/PreviewPanel";
import RenamePanel from "@/components/RenamePanel";
import SettingsPanel from "@/components/SettingsPanel";
import UploadArea from "@/components/UploadArea";
import {
  ensureModel,
  MODEL_NAME,
  MODEL_SIZE_LABEL,
  resetBackgroundModel,
  subscribeModelStatus,
  type ModelStatus,
} from "@/lib/backgroundRemoval";
import { checkOutputSupport, downloadResults, effectiveFormat, processImage } from "@/lib/imageProcessor";
import {
  formatEstimatedTime,
  individualIssuesOf,
  NO_PROGRESS_MS,
  summarizeBatch,
} from "@/lib/limits";
import { buildRenamedName, parseStart, renamePreview } from "@/lib/rename";
import {
  DEFAULT_SETTINGS,
  formatBytes,
  SLOW_IMAGE_MS,
  SLOW_TOTAL_MS,
  type EditorSettings,
  type ImageItem,
} from "@/lib/types";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `img-${Date.now()}-${counter}`;
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slow, setSlow] = useState(false);
  const [heartbeat, setHeartbeat] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [splitConfirmed, setSplitConfirmed] = useState(false);
  /** Imagen elegida para la vista previa (null = la primera cargada). */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Estado del modelo de quitar fondo (descarga ~44 MB, una sola vez). */
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: "idle", progress: 0 });
  /** Paneles laterales flotantes: abiertos por defecto en escritorio, cerrados en móvil. */
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  /** Modal con la sección completa de donaciones (no tapa la vista previa). */
  const [showDonations, setShowDonations] = useState(false);

  // En móvil los paneles empiezan cerrados como cajones.
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, []);

  // Seguir el estado del modelo de quitar fondo (descarga, listo o error).
  useEffect(() => subscribeModelStatus(setModelStatus), []);

  // Al activar quitar fondo, empezar a descargar el modelo en segundo
  // plano para que no espere al pulsar Iniciar.
  useEffect(() => {
    if (settings.removeBackground) {
      ensureModel().catch(() => {
        // El error queda en modelStatus y se muestra en el aviso; el lote
        // lo reflejará por imagen sin detenerse.
      });
    }
    // Solo interesa el cambio del toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.removeBackground]);

  const cancelRef = useRef(false);
  const startTimeRef = useRef(0);
  const currentItemStartRef = useRef(0);
  /** Último momento con progreso visible (imagen terminada). */
  const lastProgressRef = useRef(0);

  // Cronómetro durante el procesado: actualiza cada 500 ms sin bloquear la UI.
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => {
      const now = Date.now();
      setElapsedMs(now - startTimeRef.current);
      setSlow(now - startTimeRef.current > SLOW_TOTAL_MS || now - currentItemStartRef.current > SLOW_IMAGE_MS);
      // Latido: si no hay progreso visible desde hace > 8 s, avisar que
      // sigue trabajando (una imagen muy grande puede tardar sin que la
      // barra avance).
      setHeartbeat(now - lastProgressRef.current > NO_PROGRESS_MS);
    }, 500);
    return () => clearInterval(id);
  }, [processing]);

  // Liberar las URLs de vista previa al desmontar.
  useEffect(() => {
    return () => items.forEach((i) => { URL.revokeObjectURL(i.previewUrl); if (i.resultUrl) URL.revokeObjectURL(i.resultUrl); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setNotice("No se encontró ninguna imagen en los archivos elegidos.");
      return;
    }
    setNotice(null);
    setSummary(null);
    setSplitConfirmed(false);
    for (const file of imageFiles) {
      try {
        const { width, height } = await readDimensions(file);
        const item: ImageItem = {
          id: nextId(),
          file,
          previewUrl: URL.createObjectURL(file),
          width,
          height,
          status: "pendiente",
        };
        setItems((prev) => [...prev, item]);
      } catch {
        const item: ImageItem = {
          id: nextId(),
          file,
          previewUrl: URL.createObjectURL(file),
          width: 0,
          height: 0,
          status: "error",
          error: "Este navegador no puede leer este formato de imagen (archivo no legible o corrupto).",
        };
        setItems((prev) => [...prev, item]);
      }
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) { URL.revokeObjectURL(item.previewUrl); if (item.resultUrl) URL.revokeObjectURL(item.resultUrl); }
      return prev.filter((i) => i.id !== id);
    });
    setSplitConfirmed(false);
  }, []);

  const clearAll = useCallback(() => {
    items.forEach((i) => { URL.revokeObjectURL(i.previewUrl); if (i.resultUrl) URL.revokeObjectURL(i.resultUrl); });
    setItems([]);
    setNotice(null);
    setSummary(null);
    setSplitConfirmed(false);
    setPreviewId(null);
  }, [items]);

  /** Imagen de la vista previa: la elegida, o la primera si se quitó. */
  const previewSelectedId = items.some((i) => i.id === previewId)
    ? previewId
    : (items[0]?.id ?? null);

  /* ---------- Resumen del lote (cálculo previo, siempre visible) ---------- */
  const batchSummary = useMemo(() => summarizeBatch(items), [items]);

  /** Peso acumulado en memoria de los resultados listos (los blobs del ZIP). */
  const memoryReadyBytes = useMemo(
    () => items.filter((i) => i.status === "listo" && i.resultSize).reduce((sum, i) => sum + (i.resultSize ?? 0), 0),
    [items],
  );

  /* ---------- Renombrado: vista previa en vivo ---------- */
  // Con quitar fondo, JPG se fuerza a PNG: los nombres usan el formato efectivo.
  const effFormat = useMemo(() => effectiveFormat(settings), [settings]);
  const renameInfo = useMemo(() => {
    const eligible = items.filter((i) => i.status !== "error" && i.status !== "omitido");
    return renamePreview(settings.rename, effFormat, eligible.length);
  }, [items, settings.rename, effFormat]);

  const startProcessing = useCallback(
    async (opts?: { split?: boolean }) => {
      if (processing) return;
      const allowSplit = opts?.split === true || splitConfirmed;

      // 1) Límites duros de lote: no procesar a ciegas. Sin confirmación
      // de dividir, no iniciar si se excede alguno.
      const batchBefore = summarizeBatch(items);
      if (batchBefore.blocked && !allowSplit) {
        setNotice(
          `⚠️ Límite del lote excedido: ${batchBefore.hardIssues.join(" · ")}. Quita imágenes o usa «Procesar solo las primeras que caben» para dividir el lote.`,
        );
        return;
      }

      // 2) Validación ANTES de procesar (no detiene el lote: marca y excluye).
      let working: ImageItem[] = items.map((i) => ({ ...i }));
      // Con quitar fondo, JPG se fuerza a PNG (transparencia): se valida
      // el formato efectivo, no el elegido.
      const outputFormat = effectiveFormat(settings);
      const outputError = await checkOutputSupport(outputFormat);
      if (outputError) {
        working = working.map((i) =>
          i.status === "pendiente" ? { ...i, status: "error" as const, error: outputError } : i,
        );
        setItems(working);
        setSummary(`0 procesadas, ${working.filter((i) => i.status === "error").length} con error. Motivo: ${outputError}`);
        setNotice("⚠️ No se pudo procesar ninguna imagen: el formato de salida no está soportado en este navegador.");
        return;
      }
      // Quitar fondo ya está integrado: si el modelo falla, cada imagen
      // se marca con su motivo en el proceso (try/catch por imagen) y el
      // resto del lote continúa. No se bloquea aquí.
      // Imágenes que superan el límite individual (25 MB o 100 MP):
      // omitidas con su motivo exacto, no rompen el lote.
      working = working.map((i) => {
        if (i.status !== "pendiente") return i;
        const reasons = individualIssuesOf(i);
        return reasons.length > 0
          ? { ...i, status: "omitido" as const, error: `Supera el límite por imagen: ${reasons.join("; ")}.` }
          : i;
      });

      // Recalcular el lote tras marcar las omitidas: las candidatas son
      // las pendientes que quedan, y el subconjunto que cabe son las
      // primeras en orden que respetan 30 / 200 MB / 200 MP.
      const batch = summarizeBatch(working);
      if (batch.blocked && !allowSplit) {
        setItems(working);
        setNotice(
          `⚠️ Límite del lote excedido: ${batch.hardIssues.join(" · ")}. Quita imágenes o usa «Procesar solo las primeras que caben» para dividir el lote.`,
        );
        return;
      }
      let eligible = batch.candidates;
      if (allowSplit && batch.fit.length < batch.candidates.length) {
        const fitIds = new Set(batch.fit.map((i) => i.id));
        working = working.map((i) =>
          i.status === "pendiente" && !fitIds.has(i.id)
            ? { ...i, status: "omitido" as const, error: "Quedó fuera del lote dividido (máx. 30 imágenes / 200 MB / 200 MP en total)." }
            : i,
        );
        eligible = batch.fit;
      }

      if (eligible.length === 0) {
        setItems(working);
        const failed = working.filter((i) => i.status === "error").length;
        const omitted = working.filter((i) => i.status === "omitido").length;
        setSummary(`0 procesadas, ${failed} con error, ${omitted} omitidas. Revisa los motivos en cada imagen.`);
        setNotice("⚠️ No quedó ninguna imagen válida para procesar.");
        return;
      }

      // 3) Renombrado: inicio inválido → aviso y nombres originales (no bloquea).
      let startIndex = 1;
      let renameOk = true;
      if (settings.rename.enabled) {
        const parsed = parseStart(settings.rename.sequence, settings.rename.start);
        if (!parsed.ok) {
          renameOk = false;
          setNotice(`⚠️ ${parsed.error} Se procesará con los nombres originales.`);
        } else {
          startIndex = parsed.index;
        }
      }

      // 4) Proceso secuencial (una a una, nunca en paralelo), con
      // try/catch por imagen y cancelación.
      setItems(working);
      setProcessing(true);
      setNotice(null);
      setSummary(null);
      setSlow(false);
      setHeartbeat(false);
      setElapsedMs(0);
      setProgress({ done: 0, total: eligible.length });
      cancelRef.current = false;
      startTimeRef.current = Date.now();
      currentItemStartRef.current = Date.now();
      lastProgressRef.current = Date.now();

      let cancelled = false;
      for (let idx = 0; idx < eligible.length; idx++) {
        const item = eligible[idx];
        if (cancelRef.current) { cancelled = true; break; }
        currentItemStartRef.current = Date.now();
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "procesando" } : i)));
        const renamed =
          settings.rename.enabled && renameOk
            ? buildRenamedName(settings.rename, startIndex, idx, effFormat)
            : undefined;
        try {
          const result = await processImage(item, settings, renamed);
          const resultUrl = URL.createObjectURL(result.blob);
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "listo",
                    resultBlob: result.blob,
                    resultUrl,
                    resultName: result.name,
                    resultSize: result.blob.size,
                    resultWidth: result.width,
                    resultHeight: result.height,
                  }
                : i,
            ),
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "error", error: err instanceof Error ? err.message : "Error al procesar la imagen." }
                : i,
            ),
          );
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        // Progreso visible: esta imagen ya terminó.
        lastProgressRef.current = Date.now();
        // Ceder a la UI entre imágenes para que Cancelar y la barra de
        // progreso respondan: nunca un bucle síncrono largo. Los blobs de
        // resultado se conservan en memoria porque el ZIP los necesita;
        // su peso acumulado se muestra en el panel de progreso.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      setProcessing(false);
      setItems((prev) => {
        const ok = prev.filter((i) => i.status === "listo").length;
        const bad = prev.filter((i) => i.status === "error").length;
        const omitted = prev.filter((i) => i.status === "omitido").length;
        const pendingLeft = prev.filter((i) => i.status === "pendiente" || i.status === "procesando").length;
        const parts = [`${ok} procesada${ok === 1 ? "" : "s"}`, `${bad} con error`, `${omitted} omitida${omitted === 1 ? "" : "s"}`];
        if (cancelled) parts.push(`proceso cancelado (${pendingLeft} sin procesar, las ya listas se pueden descargar)`);
        setSummary(parts.join(" · ") + ".");
        setNotice(
          bad === 0 && !cancelled
            ? `✅ ${ok} imagen${ok === 1 ? "" : "es"} procesada${ok === 1 ? "" : "s"}. Ya puedes descargar.`
            : `⚠️ ${ok} procesada${ok === 1 ? "" : "s"}, ${bad} con error y ${omitted} omitida${omitted === 1 ? "" : "s"}. Las correctas se pueden descargar.`,
        );
        return prev;
      });
    },
    [items, settings, processing, splitConfirmed],
  );

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setNotice("Cancelando… se terminará la imagen actual y se conservará lo ya procesado.");
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      await downloadResults(items);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo generar la descarga.");
    }
  }, [items]);

  const readyCount = items.filter((i) => i.status === "listo").length;
  const failedItems = items.filter((i) => i.status === "error");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100">
      {/* Barra superior compacta */}
      <header className="z-40 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl" aria-hidden>
            🖼️
          </span>
          <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-900">NousPixel</h1>
          <span className="hidden truncate text-xs font-semibold text-cyan-700 sm:block">
            por NousLogic · «La razón ordena el cosmos»
          </span>
        </div>
        <p className="hidden shrink-0 text-xs text-slate-500 md:block">
          100% en tu navegador · sin subir nada · máx. 30 imágenes · 25 MB por imagen
        </p>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* Escenario central: la vista previa ocupa toda la pantalla */}
        <div
          className={`absolute inset-0 transition-all duration-300 ${leftOpen ? "lg:pl-[364px]" : ""} ${rightOpen ? "lg:pr-[364px]" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (processing) return;
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) void addFiles(files);
          }}
        >
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="text-6xl" aria-hidden>
                🖼️
              </span>
              <p className="text-xl font-bold text-slate-800">Tu vista previa aparecerá aquí</p>
              <p className="max-w-md text-sm text-slate-500">
                Carga una o varias imágenes desde el panel de la izquierda (o arrástralas
                hasta aquí) y verás el antes y el después con tus ajustes en tiempo real.
              </p>
              <button
                type="button"
                onClick={() => setLeftOpen(true)}
                className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-700 lg:hidden"
              >
                🖼 Imágenes
              </button>
            </div>
          ) : (
            <PreviewPanel
              items={items}
              selectedId={previewSelectedId}
              onSelect={setPreviewId}
              settings={settings}
              processing={processing}
              fill
            />
          )}
        </div>

        {/* Fondo oscuro en móvil cuando un cajón está abierto: tocar fuera lo cierra */}
        {(leftOpen || rightOpen) && (
          <button
            type="button"
            aria-label="Cerrar paneles"
            onClick={() => {
              setLeftOpen(false);
              setRightOpen(false);
            }}
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          />
        )}

        {/* Panel izquierdo flotante: adjuntar imágenes */}
        <aside
          aria-label="Panel de imágenes"
          className={`fixed top-[60px] bottom-3 left-3 z-30 flex w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur transition-transform duration-300 ${
            leftOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">🖼 Imágenes</h2>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
                aria-label="Ocultar panel de imágenes"
              >
                ‹ Ocultar
              </button>
            </div>

            <div className="mt-3">
              <UploadArea onFiles={addFiles} disabled={processing} />
            </div>

            {items.length > 0 && (
              <>
                {/* Resumen del lote: cálculo previo, siempre visible */}
                {!processing && (
                  <div
                    className={`mt-4 rounded-2xl border p-4 ${
                      batchSummary.semaphore === "rojo"
                        ? "border-red-300 bg-red-50"
                        : batchSummary.semaphore === "ambar"
                          ? "border-amber-300 bg-amber-50"
                          : "border-emerald-300 bg-emerald-50"
                    }`}
                    role="status"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">📋 Resumen del lote</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold text-white ${
                          batchSummary.semaphore === "rojo"
                            ? "bg-red-600"
                            : batchSummary.semaphore === "ambar"
                              ? "bg-amber-600"
                              : "bg-emerald-600"
                        }`}
                      >
                        {batchSummary.semaphore === "rojo"
                          ? "🔴 Límite excedido"
                          : batchSummary.semaphore === "ambar"
                            ? "🟡 Lote pesado"
                            : "🟢 Listo, lote ligero"}
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
                      <div>
                        <dt className="font-semibold">Imágenes</dt>
                        <dd>
                          {batchSummary.count} cargadas · {batchSummary.candidates.length} válidas
                          para procesar
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Tamaño total</dt>
                        <dd>{formatBytes(batchSummary.totalBytes)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Megapíxeles totales</dt>
                        <dd>{batchSummary.totalMegapixels.toFixed(1)} MP</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Memoria est. de decodificación</dt>
                        <dd>{formatBytes(batchSummary.estimatedDecodeBytes)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Tiempo estimado</dt>
                        <dd>{formatEstimatedTime(batchSummary.estimatedSeconds)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Límites</dt>
                        <dd>30 img · 25 MB/img · 200 MB · 200 MP · 100 MP/img</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-slate-500">
                      Estimación: la memoria es ancho × alto × 4 bytes por imagen (Canvas usa
                      además un búfer de salida del mismo tamaño); el tiempo es ~0,5 s por
                      megapíxel en escritorio y varía según el dispositivo, el navegador y los
                      ajustes.
                    </p>

                    {batchSummary.semaphore === "ambar" && (
                      <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
                        Este lote puede tardar: si quieres que vaya más rápido, baja la
                        resolución de salida o divídelo en dos lotes. Puedes iniciar igualmente.
                      </p>
                    )}
                    {batchSummary.semaphore === "rojo" && (
                      <div className="mt-3" role="alert">
                        <p className="text-sm font-bold text-red-800">
                          Iniciar está bloqueado hasta quitar imágenes o dividir el lote:
                        </p>
                        <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
                          {batchSummary.hardIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => {
                            setSplitConfirmed(true);
                            void startProcessing({ split: true });
                          }}
                          className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                        >
                          Procesar solo las primeras que caben ({batchSummary.fit.length} de{" "}
                          {batchSummary.candidates.length})
                        </button>
                      </div>
                    )}
                    {batchSummary.individualOmitted.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-bold text-amber-800">
                          Se omitirán {batchSummary.individualOmitted.length} por superar el
                          límite por imagen (el resto sigue):
                        </p>
                        <ul className="mt-1 list-disc pl-5 text-sm text-amber-800">
                          {batchSummary.individualOmitted.map(({ item, reasons }) => (
                            <li key={item.id}>
                              «{item.file.name}»: {reasons.join("; ")}.
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <ImageList items={items} onRemove={removeItem} disabled={processing} />

                {processing && progress.total > 0 && (
                  <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-cyan-800">
                        Procesando {progress.done} de {progress.total}… · ⏱{" "}
                        {formatElapsed(elapsedMs)}
                      </p>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-cyan-100">
                      <div
                        className="h-full rounded-full bg-cyan-600 transition-all"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-cyan-700">
                      En memoria para el ZIP: {formatBytes(memoryReadyBytes)} ({readyCount}{" "}
                      resultado
                      {readyCount === 1 ? "" : "s"} listo{readyCount === 1 ? "" : "s"}). Las
                      vistas previas se conservan para el comparador; al pulsar «Limpiar» se
                      libera todo.
                    </p>
                    {slow && (
                      <p
                        className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
                        role="alert"
                      >
                        ⏳ Sigue trabajando, no cierres la pestaña… El procesamiento está
                        tardando más de lo normal, probablemente por imágenes grandes o muchas
                        imágenes. Puedes esperar o cancelar: lo ya procesado se conserva y se
                        puede descargar.
                      </p>
                    )}
                    {heartbeat && !slow && (
                      <p
                        className="mt-3 rounded-lg bg-cyan-100 px-3 py-2 text-sm font-medium text-cyan-800"
                        role="status"
                      >
                        💓 Aún procesando… sin progreso visible en los últimos segundos, pero el
                        proceso sigue en marcha. No cierres la pestaña.
                      </p>
                    )}
                  </div>
                )}

                {summary && (
                  <p
                    className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-800"
                    role="status"
                  >
                    Resumen: {summary}
                  </p>
                )}

                {failedItems.length > 0 && (
                  <details className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-bold text-red-800">
                      Ver motivos de las {failedItems.length} con error
                    </summary>
                    <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                      {failedItems.map((i) => (
                        <li key={i.id}>
                          <span className="font-semibold">{i.file.name}:</span> {i.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {notice && (
                  <p
                    className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
                      notice.startsWith("⚠️")
                        ? "bg-amber-50 text-amber-800"
                        : "bg-emerald-50 text-emerald-800"
                    }`}
                    role="status"
                  >
                    {notice}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Acciones siempre visibles al pie del panel izquierdo */}
          <div className="shrink-0 border-t border-slate-200 bg-white/90 p-4">
            <button
              type="button"
              onClick={() => void startProcessing()}
              disabled={processing || batchSummary.candidates.length === 0 || batchSummary.blocked}
              title={
                batchSummary.blocked
                  ? "Límite excedido: quita imágenes o usa «Procesar solo las primeras que caben»"
                  : undefined
              }
              className="w-full rounded-xl bg-cyan-600 px-6 py-3 text-base font-bold text-white shadow hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "Procesando…" : "▶ Iniciar"}
            </button>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={processing || readyCount === 0}
                className="flex-1 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ⬇ Descargar {items.length > 1 ? "ZIP" : "imagen"}
                {readyCount > 0 ? ` (${readyCount})` : ""}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={processing}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Limpiar
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Con 1 imagen se descarga el archivo directo; con varias, un ZIP con todas las
              procesadas.
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowDonations(true)}
                className="text-sm font-bold text-amber-600 hover:underline"
              >
                💛 Apoyar NousPixel
              </button>
              <span className="text-[10px] text-slate-400">Next.js + Canvas + JSZip</span>
            </div>
          </div>
        </aside>

        {/* Panel derecho flotante: configuraciones */}
        <aside
          aria-label="Panel de ajustes"
          className={`fixed top-[60px] bottom-3 right-3 z-30 flex w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur transition-transform duration-300 ${
            rightOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">⚙️ Ajustes</h2>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
                aria-label="Ocultar panel de ajustes"
              >
                Ocultar ›
              </button>
            </div>

            {items.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Carga imágenes para ajustar el formato, la resolución, la compresión, quitar
                el fondo, recortar, rotar, aplicar filtros, renombrar por lote y añadir marca
                de agua.
              </p>
            ) : (
              <>
                <div className="mt-3">
                  <SettingsPanel settings={settings} onChange={setSettings} disabled={processing} />
                </div>

                {/* Estado del modelo de quitar fondo (solo si está activado) */}
                {settings.removeBackground && (
                  <div
                    className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
                      modelStatus.state === "error"
                        ? "bg-red-50 text-red-800"
                        : modelStatus.state === "ready"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-cyan-50 text-cyan-800"
                    }`}
                    role="status"
                  >
                    {modelStatus.state === "downloading" && (
                      <p>
                        ⬇ Descargando el modelo de quitar fondo ({MODEL_NAME},{" "}
                        {MODEL_SIZE_LABEL}, una sola vez)… {modelStatus.progress} % — las
                        imágenes nunca salen de tu dispositivo; solo se descarga el modelo.
                      </p>
                    )}
                    {modelStatus.state === "downloading" && (
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-cyan-100">
                        <div
                          className="h-full rounded-full bg-cyan-600 transition-all"
                          style={{ width: `${modelStatus.progress}%` }}
                        />
                      </div>
                    )}
                    {modelStatus.state === "ready" && (
                      <p>
                        ✅ Modelo de quitar fondo listo ({MODEL_NAME}). La inferencia es local y
                        puede tardar varios segundos por imagen.
                      </p>
                    )}
                    {modelStatus.state === "error" && (
                      <div>
                        <p>
                          ⚠️ {modelStatus.error ?? "No se pudo preparar el modelo de quitar fondo."}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            resetBackgroundModel();
                            ensureModel().catch(() => {});
                          }}
                          className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
                        >
                          ↻ Reintentar descarga
                        </button>
                      </div>
                    )}
                    {modelStatus.state === "idle" && (
                      <p>
                        🧩 Quitar fondo activado: el modelo ({MODEL_NAME}, {MODEL_SIZE_LABEL}) se
                        descargará una sola vez al procesar la primera imagen.
                      </p>
                    )}
                  </div>
                )}

                <RenamePanel
                  settings={settings}
                  onChange={setSettings}
                  disabled={processing}
                  previewNames={renameInfo.names}
                  previewError={renameInfo.error}
                />

                <div className="mt-4 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400">
                  <p>Tus imágenes nunca salen de tu dispositivo.</p>
                  <p className="mt-1">
                    Limitación conocida: Canvas no puede exportar GIF y AVIF depende del
                    navegador — si un formato no está soportado, esa imagen mostrará el error
                    sin romper el resto.
                  </p>
                  <p className="mt-1">
                    Quitar fondo: modelo ISNet general-use int8 (ORMBG, Apache-2.0, de Qin et
                    al. 2022) · ONNX Runtime Web (MIT). Sin @imgly/background-removal ni RMBG
                    de BRIA.
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Pestañas en el borde para reabrir los paneles (escritorio) */}
        {!leftOpen && (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="fixed top-1/2 left-0 z-30 hidden -translate-y-1/2 rounded-r-xl bg-white/90 px-2 py-4 text-sm font-bold text-cyan-700 shadow-lg ring-1 ring-slate-200 backdrop-blur hover:bg-white lg:block"
            aria-label="Abrir panel de imágenes"
          >
            › <span className="hidden xl:inline">Imágenes</span>
          </button>
        )}
        {!rightOpen && (
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            className="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 rounded-l-xl bg-white/90 px-2 py-4 text-sm font-bold text-cyan-700 shadow-lg ring-1 ring-slate-200 backdrop-blur hover:bg-white lg:block"
            aria-label="Abrir panel de ajustes"
          >
            <span className="hidden xl:inline">Ajustes</span> ‹
          </button>
        )}

        {/* Botones flotantes para abrir los cajones (móvil) */}
        {!leftOpen && (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="fixed bottom-4 left-4 z-30 rounded-full bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-cyan-700 lg:hidden"
          >
            🖼 Imágenes
          </button>
        )}
        {!rightOpen && (
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            className="fixed bottom-4 right-4 z-30 rounded-full bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-cyan-700 lg:hidden"
          >
            ⚙ Ajustes
          </button>
        )}
      </div>

      {/* Modal de donaciones (la sección completa, fuera de la vista previa) */}
      {showDonations && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Apoya NousPixel"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowDonations(false)}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar donaciones"
              >
                ✕ Cerrar
              </button>
            </div>
            <Donations compact />
          </div>
        </div>
      )}
    </div>
  );
}
