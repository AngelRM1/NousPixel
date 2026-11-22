"use client";

import ImageList from "@/components/ImageList";
import UploadArea from "@/components/UploadArea";
import { formatEstimatedTime, type BatchSummary } from "@/lib/limits";
import { formatBytes, type ImageItem } from "@/lib/types";

interface Props {
  items: ImageItem[];
  batchSummary: BatchSummary;
  processing: boolean;
  progress: { done: number; total: number };
  elapsedLabel: string;
  slow: boolean;
  heartbeat: boolean;
  summary: string | null;
  notice: string | null;
  failedItems: ImageItem[];
  readyCount: number;
  memoryReadyBytes: number;
  onAddFiles: (files: File[]) => void;
  onRemoveItem: (id: string) => void;
  onStart: () => void;
  onSplit: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onClear: () => void;
  onShowDonations: () => void;
  /** Solo en escritorio: muestra el encabezado con el botón Ocultar. */
  onHide?: () => void;
}

/**
 * Contenido completo del panel de imágenes: subida, resumen del lote,
 * lista, progreso y acciones (Iniciar / Descargar / Limpiar). Se usa
 * igual en el panel flotante de escritorio y en la sección «Tus imágenes»
 * del acordeón móvil.
 */
export default function ImagesPanelContent({
  items,
  batchSummary,
  processing,
  progress,
  elapsedLabel,
  slow,
  heartbeat,
  summary,
  notice,
  failedItems,
  readyCount,
  memoryReadyBytes,
  onAddFiles,
  onRemoveItem,
  onStart,
  onSplit,
  onCancel,
  onDownload,
  onClear,
  onShowDonations,
  onHide,
}: Props) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {onHide && (
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">🖼 Imágenes</h2>
            <button
              type="button"
              onClick={onHide}
              className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
              aria-label="Ocultar panel de imágenes"
            >
              ‹ Ocultar
            </button>
          </div>
        )}
        <div className="mt-3">
          <UploadArea onFiles={onAddFiles} disabled={processing} />
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
                      onClick={onSplit}
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

            <ImageList items={items} onRemove={onRemoveItem} disabled={processing} />

            {processing && progress.total > 0 && (
              <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-cyan-800">
                    Procesando {progress.done} de {progress.total}… · ⏱{" "}
                    {elapsedLabel}
                  </p>
                  <button
                    type="button"
                    onClick={onCancel}
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
          onClick={onStart}
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
            onClick={onDownload}
            disabled={processing || readyCount === 0}
            className="flex-1 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⬇ Descargar {items.length > 1 ? "ZIP" : "imagen"}
            {readyCount > 0 ? ` (${readyCount})` : ""}
          </button>
          <button
            type="button"
            onClick={onClear}
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
            onClick={onShowDonations}
            className="text-sm font-bold text-amber-600 hover:underline"
          >
            💛 Apoyar NousPixel
          </button>
          <span className="text-[10px] text-slate-400">Next.js + Canvas + JSZip</span>
        </div>
      </div>
    </>
  );
}
