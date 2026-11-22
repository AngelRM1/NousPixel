"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Donations from "@/components/Donations";
import ImagesPanelContent from "@/components/ImagesPanelContent";
import PreviewPanel from "@/components/PreviewPanel";
import SettingsPanelContent from "@/components/SettingsPanelContent";
import {
  ensureModel,
  subscribeModelStatus,
  type ModelStatus,
} from "@/lib/backgroundRemoval";
import { checkOutputSupport, downloadResults, effectiveFormat, processImage } from "@/lib/imageProcessor";
import {
  individualIssuesOf,
  NO_PROGRESS_MS,
  summarizeBatch,
} from "@/lib/limits";
import { buildRenamedName, parseStart, renamePreview } from "@/lib/rename";
import {
  DEFAULT_SETTINGS,
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

/** Sección colapsable del acordeón móvil: encabezado siempre visible. */
function MobileSection({
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-base font-bold text-slate-900">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {badge && (
            <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-bold text-cyan-800">
              {badge}
            </span>
          )}
          <span className="text-lg leading-none text-slate-500" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </span>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </section>
  );
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

  // Responsivo (<1024 px): la página se apila en una sola columna con
  // secciones colapsables (acordeón móvil). El escritorio no cambia.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /** Acordeón móvil: cada sección se abre/cierra por separado. */
  const [mobileOpen, setMobileOpen] = useState({
    images: true,
    settings: false,
    preview: false,
  });
  /** La preview solo se auto-abre una vez por lote, si el usuario no la cerró. */
  const previewDismissedRef = useRef(false);
  const prevItemsCountRef = useRef(0);
  const toggleMobile = useCallback((key: "images" | "settings" | "preview") => {
    if (key === "preview") {
      if (mobileOpen.preview) previewDismissedRef.current = true;
      else previewDismissedRef.current = false;
    }
    setMobileOpen((m) => ({ ...m, [key]: !m[key] }));
  }, [mobileOpen.preview]);

  // Al cargar las primeras imágenes, abrir sola la sección Preview, sin
  // cerrar la que el usuario está usando (el acordeón permite varias abiertas).
  useEffect(() => {
    const prev = prevItemsCountRef.current;
    prevItemsCountRef.current = items.length;
    if (items.length === 0) {
      previewDismissedRef.current = false;
      return;
    }
    if (prev === 0 && !previewDismissedRef.current) {
      setMobileOpen((m) => ({ ...m, preview: true }));
    }
  }, [items.length]);

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

      {!isMobile && (
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
          <ImagesPanelContent
            items={items}
            batchSummary={batchSummary}
            processing={processing}
            progress={progress}
            elapsedLabel={formatElapsed(elapsedMs)}
            slow={slow}
            heartbeat={heartbeat}
            summary={summary}
            notice={notice}
            failedItems={failedItems}
            readyCount={readyCount}
            memoryReadyBytes={memoryReadyBytes}
            onAddFiles={addFiles}
            onRemoveItem={removeItem}
            onStart={() => void startProcessing()}
            onSplit={() => {
              setSplitConfirmed(true);
              void startProcessing({ split: true });
            }}
            onCancel={handleCancel}
            onDownload={handleDownload}
            onClear={clearAll}
            onShowDonations={() => setShowDonations(true)}
            onHide={() => setLeftOpen(false)}
          />
        </aside>

        {/* Panel derecho flotante: configuraciones */}
        <aside
          aria-label="Panel de ajustes"
          className={`fixed top-[60px] bottom-3 right-3 z-30 flex w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur transition-transform duration-300 ${
            rightOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"
          }`}
        >
          <SettingsPanelContent
            items={items}
            settings={settings}
            onSettingsChange={setSettings}
            processing={processing}
            modelStatus={modelStatus}
            renameInfo={renameInfo}
            onHide={() => setRightOpen(false)}
          />
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
      )}

      {isMobile && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-3">
              <MobileSection
                title="🖼 Tus imágenes"
                badge={
                  items.length > 0
                    ? `${items.length} cargada${items.length === 1 ? "" : "s"}`
                    : undefined
                }
                open={mobileOpen.images}
                onToggle={() => toggleMobile("images")}
              >
                <ImagesPanelContent
                  items={items}
                  batchSummary={batchSummary}
                  processing={processing}
                  progress={progress}
                  elapsedLabel={formatElapsed(elapsedMs)}
                  slow={slow}
                  heartbeat={heartbeat}
                  summary={summary}
                  notice={notice}
                  failedItems={failedItems}
                  readyCount={readyCount}
                  memoryReadyBytes={memoryReadyBytes}
                  onAddFiles={addFiles}
                  onRemoveItem={removeItem}
                  onStart={() => void startProcessing()}
                  onSplit={() => {
                    setSplitConfirmed(true);
                    void startProcessing({ split: true });
                  }}
                  onCancel={handleCancel}
                  onDownload={handleDownload}
                  onClear={clearAll}
                  onShowDonations={() => setShowDonations(true)}
                />
              </MobileSection>

              <MobileSection
                title="⚙️ Configuración"
                open={mobileOpen.settings}
                onToggle={() => toggleMobile("settings")}
              >
                <SettingsPanelContent
                  items={items}
                  settings={settings}
                  onSettingsChange={setSettings}
                  processing={processing}
                  modelStatus={modelStatus}
                  renameInfo={renameInfo}
                />
              </MobileSection>

              <MobileSection
                title="👁️ Preview"
                open={mobileOpen.preview}
                onToggle={() => toggleMobile("preview")}
              >
                {items.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">
                    Carga imágenes en «Tus imágenes» y aquí verás el antes y el
                    después con tus ajustes en tiempo real.
                  </p>
                ) : (
                  <PreviewPanel
                    items={items}
                    selectedId={previewSelectedId}
                    onSelect={setPreviewId}
                    settings={settings}
                    processing={processing}
                    bare
                  />
                )}
              </MobileSection>

              <p className="pb-2 text-center text-xs text-slate-400">
                Tus imágenes nunca salen de tu dispositivo · NousPixel por NousLogic
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="shrink-0 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur">
              <div className="mx-auto flex max-w-2xl gap-2">
                <button
                  type="button"
                  onClick={() => void startProcessing()}
                  disabled={processing || batchSummary.candidates.length === 0 || batchSummary.blocked}
                  className="flex-1 rounded-xl bg-cyan-600 px-6 py-3 text-base font-bold text-white shadow hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing ? "Procesando…" : "▶ Iniciar"}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={processing || readyCount === 0}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ⬇ Descargar{readyCount > 0 ? ` (${readyCount})` : ""}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
