"use client";

import { useState } from "react";
import { formatBytes, savedPercent, type ImageItem } from "@/lib/types";

interface Props {
  items: ImageItem[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const STATUS_LABEL: Record<ImageItem["status"], string> = {
  pendiente: "Pendiente",
  procesando: "Procesando…",
  listo: "Lista ✓",
  error: "Error",
  omitido: "Omitida",
};

/** Comparador antes/después: deslizador que recorta la imagen procesada sobre la original. */
function CompareView({ item }: { item: ImageItem }) {
  const [pos, setPos] = useState(50);
  if (!item.resultUrl) return null;
  return (
    <div className="mt-2">
      <div className="relative h-40 w-full overflow-hidden rounded-lg checkerboard select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.previewUrl}
          alt={`Original de ${item.file.name}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.resultUrl}
          alt={`Procesada de ${item.file.name}`}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-600"
          style={{ left: `${pos}%` }}
          aria-hidden
        />
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
          Antes
        </span>
        <span className="absolute right-1 top-1 rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          Después
        </span>
      </div>
      <label className="mt-1 block text-xs text-slate-500">
        Desliza para comparar:
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
    </div>
  );
}

export default function ImageList({ items, onRemove, disabled }: Props) {
  const [compareId, setCompareId] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold text-slate-900">Imágenes ({items.length})</h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const pct =
            item.status === "listo" && item.resultSize !== undefined
              ? savedPercent(item.file.size, item.resultSize)
              : null;
          const showCompare = compareId === item.id && item.status === "listo";
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-20 w-20 shrink-0 rounded-lg object-cover checkerboard"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.file.name}</p>
                  <p className="text-xs text-slate-500">
                    Original: {item.width > 0 ? `${item.width} × ${item.height} px` : "sin dimensiones"} ·{" "}
                    {formatBytes(item.file.size)}
                  </p>
                  {item.status === "listo" && item.resultSize !== undefined && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Resultado: {item.resultName} · {item.resultWidth} × {item.resultHeight} px ·{" "}
                      {formatBytes(item.resultSize)} ·{" "}
                      {pct !== null && pct >= 0
                        ? `${pct} % más ligera`
                        : `${Math.abs(pct ?? 0)} % más pesada`}
                    </p>
                  )}
                  {(item.status === "error" || item.status === "omitido") && item.error && (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      {item.status === "omitido" ? "Omitida: " : "Error: "}
                      {item.error}
                    </p>
                  )}
                  {item.status === "procesando" && (
                    <p className="mt-1 text-xs font-medium text-cyan-700">Procesando…</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">{STATUS_LABEL[item.status]}</p>
                  {item.status === "listo" && item.resultUrl && (
                    <button
                      type="button"
                      onClick={() => setCompareId(showCompare ? null : item.id)}
                      className="mt-1 text-xs font-semibold text-cyan-700 hover:underline"
                    >
                      {showCompare ? "Ocultar comparación" : "Comparar antes / después"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(item.id)}
                  className="self-start rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  aria-label={`Quitar ${item.file.name}`}
                >
                  ✕
                </button>
              </div>
              {showCompare && <CompareView item={item} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
