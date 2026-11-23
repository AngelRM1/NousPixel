"use client";

import { useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { generatePreview, PREVIEW_MAX_SIDE, type PreviewResult } from "@/lib/preview";
import { formatBytes, savedPercent, type EditorSettings, type ImageItem } from "@/lib/types";

type ViewMode = "slider" | "antes" | "despues";

interface Props {
  items: ImageItem[];
  /** Id de la imagen seleccionada para el preview (resuelto por el padre). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  settings: EditorSettings;
  /** true mientras el lote está corriendo: el preview se pausa. */
  processing: boolean;
  /** true cuando el panel llena el escenario central a pantalla completa. */
  fill?: boolean;
  /** true en el acordeón móvil: sin tarjeta, borde ni márgenes. */
  bare?: boolean;
}

/** Retraso para regenerar la preview al cambiar la configuración. */
const PREVIEW_DEBOUNCE_MS = 300;

export default function PreviewPanel({ items, selectedId, onSelect, settings, processing, fill, bare }: Props) {
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const [mode, setMode] = useState<ViewMode>("slider");
  const [pos, setPos] = useState(50);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Generación en curso: solo la última vale; las anteriores se descartan.
  const generationRef = useRef(0);
  const resultUrlRef = useRef<string | null>(null);

  // Al desmontar, liberar la URL de la preview.
  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  // Regenerar la preview al cambiar la imagen o cualquier configuración,
  // con debounce. Pausada mientras el lote está corriendo.
  useEffect(() => {
    if (processing) {
      setUpdating(false);
      return;
    }
    if (!selected) {
      setResult(null);
      setError(null);
      setUpdating(false);
      return;
    }
    if (selected.width <= 0 || selected.height <= 0 || selected.status === "error") {
      setResult(null);
      setError(
        selected.error ??
          "No se puede previsualizar esta imagen: el navegador no pudo leerla.",
      );
      setUpdating(false);
      return;
    }
    setUpdating(true);
    setError(null);
    const timer = setTimeout(() => {
      const generation = ++generationRef.current;
      generatePreview(selected, settings)
        .then((res) => {
          if (generation !== generationRef.current) {
            // Generación obsoleta (la configuración cambió otra vez):
            // liberar su URL sin mostrarla.
            URL.revokeObjectURL(res.url);
            return;
          }
          if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
          resultUrlRef.current = res.url;
          setResult(res);
          setUpdating(false);
        })
        .catch((err) => {
          if (generation !== generationRef.current) return;
          setResult(null);
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo generar la vista previa de esta imagen.",
          );
          setUpdating(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // settings es un objeto nuevo en cada cambio: es justo lo que
    // queremos observar para regenerar la preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.file.name, settings, processing]);

  if (items.length === 0 || !selected) return null;

  const pct =
    result !== null ? savedPercent(selected.file.size, result.size) : null;

  const setPosFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <section
      className={
        fill
          ? "flex h-full min-h-0 flex-col overflow-y-auto bg-slate-100 p-3 sm:p-4"
          : bare
            ? "flex flex-col px-4 py-3"
            : "mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">👁️ Vista previa en vivo</h2>
        {items.length > 1 && (
          <label className="text-xs text-slate-500">
            Imagen:{" "}
            <select
              value={selected.id}
              onChange={(e) => onSelect(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-700"
              aria-label="Elegir imagen para la vista previa"
            >
              {items.map((item, idx) => (
                <option key={item.id} value={item.id}>
                  {idx + 1} · {item.file.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Tira de miniaturas clicables para elegir la imagen del preview */}
      <div
        className="mt-3 flex gap-2 overflow-x-auto pb-1"
        role="listbox"
        aria-label="Imágenes cargadas: elige una para la vista previa"
      >
        {items.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={item.id === selected.id}
            onClick={() => onSelect(item.id)}
            title={`${idx + 1} · ${item.file.name}`}
            className={`shrink-0 rounded-lg p-0.5 ring-2 ${
              item.id === selected.id ? "ring-cyan-600" : "ring-transparent hover:ring-slate-300"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt={`${item.file.name} (miniatura ${idx + 1})`}
              className="h-14 w-14 rounded-md bg-slate-100 object-cover"
            />
          </button>
        ))}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">
        {items.findIndex((i) => i.id === selected.id) + 1} de {items.length} ·{" "}
        {selected.file.name}
      </p>

      {processing && (
        <p className="mt-3 rounded-lg bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800" role="status">
          ⏸ Preview en pausa mientras procesa el lote. Se actualizará sola al
          terminar.
        </p>
      )}

      {updating && !processing && (
        <p className="mt-3 animate-pulse text-sm font-medium text-cyan-700" role="status">
          Actualizando preview…
        </p>
      )}

      {error && !processing && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
          No se pudo generar la vista previa: {error}
        </p>
      )}

      {fill && !result && !error && !processing && (
        <div className="mt-3 flex min-h-60 flex-1 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500">
          Generando vista previa…
        </div>
      )}

      {result && !error && (
        <>
          {/* Botones de vista: Antes / Después / Comparar */}
          <div className="mt-3 flex gap-2" role="group" aria-label="Modo de vista previa">
            {(
              [
                ["antes", "Antes"],
                ["despues", "Después"],
                ["slider", "Comparar"],
              ] as [ViewMode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  mode === value
                    ? "bg-cyan-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Comparador: original a la izquierda, procesada a la derecha */}
          <div
            className={`relative mt-3 w-full cursor-ew-resize touch-none overflow-hidden rounded-lg select-none ${
              fill ? "min-h-60 flex-1 checkerboard" : "h-72 checkerboard sm:h-96"
            }`}
            onPointerDown={(e) => {
              if (mode !== "slider") return;
              setPosFromPointer(e);
            }}
            onPointerMove={(e) => {
              if (mode !== "slider" || e.buttons === 0) return;
              setPosFromPointer(e);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.previewUrl}
              alt={`Original de ${selected.file.name}`}
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
            {mode !== "antes" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.url}
                alt={`Vista previa procesada de ${selected.file.name}`}
                className="absolute inset-0 h-full w-full object-contain"
                style={
                  mode === "slider"
                    ? { clipPath: `inset(0 ${100 - pos}% 0 0)` }
                    : undefined
                }
                draggable={false}
              />
            )}
            {mode === "slider" && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cyan-600"
                style={{ left: `${pos}%` }}
                aria-hidden
              />
            )}
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
              Antes
            </span>
            <span className="absolute right-1 top-1 rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              Después
            </span>
            {/* Velo sobre el lado «Después» mientras se regenera la preview
                con quitar fondo (la inferencia tarda varios segundos). */}
            {updating && !processing && settings.removeBackground && mode !== "antes" && (
              <div
                className="absolute top-0 bottom-0 right-0 z-10 flex items-center justify-center bg-white/60"
                style={mode === "slider" ? { left: `${pos}%` } : { left: "0" }}
                role="status"
              >
                <div className="flex flex-col items-center gap-2 px-2 text-center">
                  <Spinner size="lg" />
                  <span className="text-xs font-bold text-cyan-800">
                    Procesando vista previa…
                  </span>
                </div>
              </div>
            )}
          </div>

          {mode === "slider" && (
            <label className="mt-2 block text-xs text-slate-500">
              Arrastra sobre la imagen o usa el deslizador para comparar:
              <input
                type="range"
                min={0}
                max={100}
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                className="w-full accent-cyan-600"
                aria-label="Comparar antes y después"
              />
            </label>
          )}

          {/* Original vs. resultado (dimensiones reales de salida) */}
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Original</dt>
              <dd>
                {selected.width} × {selected.height} px ·{" "}
                {formatBytes(selected.file.size)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Resultado ({result.format.toUpperCase()})</dt>
              <dd>
                {result.width} × {result.height} px · {formatBytes(result.size)}
                {result.scaled ? " (aprox.)" : ""} ·{" "}
                {pct !== null && pct >= 0
                  ? `${pct} % más ligera`
                  : `${Math.abs(pct ?? 0)} % más pesada`}
                {result.scaled ? " (aprox.)" : ""}
              </dd>
            </div>
          </dl>
          {result.scaled && (
            <p className="mt-2 text-xs text-slate-500">
              La salida real es muy grande: la preview se generó reducida a
              {` ${PREVIEW_MAX_SIDE} px`} de lado para no colgar el navegador.
              Las dimensiones y el peso mostrados son los reales de salida
              (el peso es aproximado); en pantalla la imagen se ve escalada.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            La vista previa usa el mismo procesado que el lote (formato,
            resolución, compresión, ajustes, rotación, recorte, filtros y
            marca de agua): lo que ves es lo que saldrá al pulsar Iniciar.
          </p>
        </>
      )}
    </section>
  );
}
