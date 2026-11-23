"use client";

import Spinner from "@/components/Spinner";
import {
  ensureModel,
  MODEL_NAME,
  MODEL_SIZE_LABEL,
  resetBackgroundModel,
  type ModelStatus,
} from "@/lib/backgroundRemoval";
import { LOSSY_FORMATS } from "@/lib/imageProcessor";
import type {
  CropRatio,
  EditorSettings,
  FilterPreset,
  OutputFormat,
  Rotation,
  WatermarkPosition,
} from "@/lib/types";

interface Props {
  settings: EditorSettings;
  onChange: (settings: EditorSettings) => void;
  disabled?: boolean;
  /** Estado de descarga del modelo de quitar fondo (lo sigue page.tsx). */
  modelStatus?: ModelStatus;
}

const FORMATS: { value: OutputFormat; label: string; note: string }[] = [
  { value: "webp", label: "WebP", note: "Recomendado: buena calidad y poco peso." },
  { value: "avif", label: "AVIF", note: "El más ligero, pero depende del navegador." },
  { value: "jpeg", label: "JPG / JPEG", note: "Compatible con todo. Sin transparencia." },
  { value: "png", label: "PNG", note: "Sin pérdida, admite transparencia. Más pesado." },
  { value: "gif", label: "GIF", note: "Paleta limitada. Canvas no lo puede exportar (ver aviso)." },
];

const FILTERS: { value: FilterPreset; label: string }[] = [
  { value: "none", label: "Ninguno" },
  { value: "vintage", label: "Vintage" },
  { value: "frio", label: "Frío" },
  { value: "calido", label: "Cálido" },
  { value: "byn", label: "Blanco y negro" },
];

const CROPS: { value: CropRatio; label: string }[] = [
  { value: "original", label: "Original (sin recortar)" },
  { value: "1:1", label: "1:1 (cuadrado)" },
  { value: "4:5", label: "4:5 (retrato)" },
  { value: "16:9", label: "16:9 (panorámico)" },
  { value: "3:2", label: "3:2 (foto)" },
];

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-semibold text-slate-700";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-bold text-slate-800">
        {title}
        {hint && <span className="ml-2 font-normal text-slate-500">{hint}</span>}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export default function SettingsPanel({ settings, onChange, disabled, modelStatus }: Props) {
  const set = (patch: Partial<EditorSettings>) => onChange({ ...settings, ...patch });
  const isLossy = LOSSY_FORMATS.includes(settings.format);
  const resize = settings.resize;
  const adj = settings.adjustments;
  const wm = settings.watermark;

  const slider = (label: string, value: number, onChangeValue: (v: number) => void) => (
    <div>
      <label className={labelCls}>
        {label}: {value} %
      </label>
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        disabled={disabled}
        className="w-full accent-cyan-600"
        value={value}
        onChange={(e) => onChangeValue(Number(e.target.value))}
      />
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">⚙️ Configuración</h2>

      {/* Formato */}
      <div className="mt-4">
        <label className={labelCls} htmlFor="formato">
          Formato de salida
        </label>
        <select
          id="formato"
          disabled={disabled}
          className={`${inputCls} w-full`}
          value={settings.format}
          onChange={(e) => set({ format: e.target.value as OutputFormat })}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {FORMATS.find((f) => f.value === settings.format)?.note}
        </p>
        {settings.format === "gif" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            ⚠️ Los navegadores no pueden generar GIF desde Canvas: si eliges GIF, esa imagen
            dará error al procesar. Usa PNG o WebP si necesitas transparencia.
          </p>
        )}
        {settings.format === "avif" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            ⚠️ AVIF depende del navegador: en navegadores sin soporte de exportación, esa
            imagen dará error. WebP es la alternativa segura.
          </p>
        )}
        {!isLossy && settings.format !== "gif" && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
            PNG es sin pérdida: el nivel de compresión no cambia su calidad, solo el tamaño
            por la resolución.
          </p>
        )}
      </div>

      {/* Resolución */}
      <div className="mt-5">
        <span className={labelCls}>Resolución</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(
            [
              { kind: "original", label: "Original" },
              { kind: "width", width: 1920, label: "1920 px de ancho" },
              { kind: "width", width: 1280, label: "1280 px de ancho" },
              { kind: "width", width: 800, label: "800 px de ancho" },
              { kind: "width", width: 512, label: "512 px de ancho" },
            ] as const
          ).map((opt) => {
            const active =
              resize.kind === opt.kind &&
              (opt.kind !== "width" || (resize.kind === "width" && resize.width === opt.width));
            return (
              <button
                key={opt.label}
                type="button"
                disabled={disabled}
                onClick={() =>
                  set({
                    resize:
                      opt.kind === "original"
                        ? { kind: "original" }
                        : { kind: "width", width: opt.width },
                  })
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-cyan-600 bg-cyan-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          <select
            disabled={disabled}
            className={inputCls}
            value={resize.kind === "percent" ? String(resize.percent) : ""}
            onChange={(e) =>
              e.target.value && set({ resize: { kind: "percent", percent: Number(e.target.value) } })
            }
          >
            <option value="">Porcentaje…</option>
            <option value="75">75 % del tamaño</option>
            <option value="50">50 % del tamaño</option>
            <option value="25">25 % del tamaño</option>
          </select>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="ancho">
              Ancho personalizado (px)
            </label>
            <input
              id="ancho"
              type="number"
              min={1}
              disabled={disabled}
              className={`${inputCls} w-full`}
              placeholder="Ej. 1000"
              value={resize.kind === "custom" ? (resize.width ?? "") : ""}
              onChange={(e) =>
                set({
                  resize: {
                    kind: "custom",
                    width: e.target.value ? Number(e.target.value) : undefined,
                    height: resize.kind === "custom" ? resize.height : undefined,
                  },
                })
              }
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="alto">
              Alto personalizado (px)
            </label>
            <input
              id="alto"
              type="number"
              min={1}
              disabled={disabled}
              className={`${inputCls} w-full`}
              placeholder="Ej. 800"
              value={resize.kind === "custom" ? (resize.height ?? "") : ""}
              onChange={(e) =>
                set({
                  resize: {
                    kind: "custom",
                    width: resize.kind === "custom" ? resize.width : undefined,
                    height: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Si solo indicas un lado, el otro se calcula manteniendo la proporción original.
        </p>
      </div>

      {/* Compresión */}
      <div className="mt-5">
        <span className={labelCls}>Compresión</span>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "basica", label: "Básica", detail: "Calidad 92 %" },
              { value: "media", label: "Media", detail: "Calidad 75 %" },
              { value: "alta", label: "Alta", detail: "Calidad 50 %" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => set({ compression: opt.value })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                settings.compression === opt.value
                  ? "border-cyan-600 bg-cyan-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"
              }`}
            >
              <span className="block font-semibold">{opt.label}</span>
              <span className="block text-xs opacity-80">{opt.detail}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          ⚠️ La compresión con pérdida reduce la calidad de forma irreversible. Guarda siempre
          una copia de tus imágenes originales.
        </p>
      </div>

      {/* --- Opciones extra: todas neutras o desactivadas por defecto --- */}

      <Section title="🎨 Ajustes de color" hint="Brillo, contraste y saturación en 100 % = sin cambio">
        <div className="space-y-3">
          {slider("Brillo", adj.brightness, (v) => set({ adjustments: { ...adj, brightness: v } }))}
          {slider("Contraste", adj.contrast, (v) => set({ adjustments: { ...adj, contrast: v } }))}
          {slider("Saturación", adj.saturation, (v) => set({ adjustments: { ...adj, saturation: v } }))}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                disabled={disabled}
                checked={adj.grayscale}
                onChange={(e) => set({ adjustments: { ...adj, grayscale: e.target.checked } })}
                className="accent-cyan-600"
              />
              Escala de grises
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                disabled={disabled}
                checked={adj.sepia}
                onChange={(e) => set({ adjustments: { ...adj, sepia: e.target.checked } })}
                className="accent-cyan-600"
              />
              Sepia
            </label>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              set({ adjustments: { brightness: 100, contrast: 100, saturation: 100, grayscale: false, sepia: false } })
            }
            className="text-xs font-semibold text-cyan-700 hover:underline"
          >
            Restablecer ajustes
          </button>
        </div>
      </Section>

      <Section title="🔄 Rotación y volteo" hint="0° por defecto">
        <div className="grid grid-cols-4 gap-2">
          {([0, 90, 180, 270] as Rotation[]).map((deg) => (
            <button
              key={deg}
              type="button"
              disabled={disabled}
              onClick={() => set({ rotation: deg })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                settings.rotation === deg
                  ? "border-cyan-600 bg-cyan-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"
              }`}
            >
              {deg}°
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              disabled={disabled}
              checked={settings.flipH}
              onChange={(e) => set({ flipH: e.target.checked })}
              className="accent-cyan-600"
            />
            Voltear horizontal
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              disabled={disabled}
              checked={settings.flipV}
              onChange={(e) => set({ flipV: e.target.checked })}
              className="accent-cyan-600"
            />
            Voltear vertical
          </label>
        </div>
      </Section>

      <Section title="✨ Filtros" hint="Ninguno por defecto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              disabled={disabled}
              onClick={() => set({ filter: f.value })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                settings.filter === f.value
                  ? "border-cyan-600 bg-cyan-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="✂️ Recorte por proporción" hint="Original = sin recortar">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CROPS.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={disabled}
              onClick={() => set({ crop: c.value })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                settings.crop === c.value
                  ? "border-cyan-600 bg-cyan-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-cyan-500"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          El recorte es centrado: se quita lo que sobra de los bordes para lograr la proporción.
        </p>
      </Section>

      <Section title="💧 Marca de agua" hint="Desactivada por defecto">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            disabled={disabled}
            checked={wm.enabled}
            onChange={(e) => set({ watermark: { ...wm, enabled: e.target.checked } })}
            className="accent-cyan-600"
          />
          Añadir marca de agua de texto
        </label>
        {wm.enabled && (
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelCls} htmlFor="marca-texto">
                Texto
              </label>
              <input
                id="marca-texto"
                type="text"
                disabled={disabled}
                className={`${inputCls} w-full`}
                placeholder="Ej. © NousLogic"
                value={wm.text}
                onChange={(e) => set({ watermark: { ...wm, text: e.target.value } })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Opacidad: {Math.round(wm.opacity * 100)} %
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  disabled={disabled}
                  className="w-full accent-cyan-600"
                  value={Math.round(wm.opacity * 100)}
                  onChange={(e) =>
                    set({ watermark: { ...wm, opacity: Number(e.target.value) / 100 } })
                  }
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="marca-tamano">
                  Tamaño (px)
                </label>
                <input
                  id="marca-tamano"
                  type="number"
                  min={10}
                  max={120}
                  disabled={disabled}
                  className={`${inputCls} w-full`}
                  value={wm.size}
                  onChange={(e) => set({ watermark: { ...wm, size: Number(e.target.value) || 24 } })}
                />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="marca-pos">
                Posición
              </label>
              <select
                id="marca-pos"
                disabled={disabled}
                className={`${inputCls} w-full`}
                value={wm.position}
                onChange={(e) => set({ watermark: { ...wm, position: e.target.value as WatermarkPosition } })}
              >
                <option value="inf-der">Abajo a la derecha</option>
                <option value="inf-izq">Abajo a la izquierda</option>
                <option value="sup-der">Arriba a la derecha</option>
                <option value="sup-izq">Arriba a la izquierda</option>
                <option value="centro">Centro</option>
              </select>
            </div>
          </div>
        )}
      </Section>

      <Section title="🎨 Fondo para JPG" hint="Blanco por defecto">
        <label className={labelCls} htmlFor="fondo-jpg">
          Color de fondo (JPG no admite transparencia)
        </label>
        <div className="flex items-center gap-3">
          <input
            id="fondo-jpg"
            type="color"
            disabled={disabled}
            className="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-white"
            value={settings.backgroundColor}
            onChange={(e) => set({ backgroundColor: e.target.value })}
          />
          <span className="text-sm text-slate-600">{settings.backgroundColor}</span>
        </div>
      </Section>

      <Section title="🧩 Quitar fondo" hint="Desactivado por defecto — IA en tu navegador">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            disabled={disabled}
            checked={settings.removeBackground}
            onChange={(e) => set({ removeBackground: e.target.checked })}
            className="mt-0.5 accent-cyan-600"
          />
          <span>
            Quitar el fondo automáticamente (IA en el navegador)
            <span className="block text-xs text-slate-500">
              La primera vez descarga el modelo de IA (ISNet, ~44 MB, una sola vez, queda
              guardado en tu navegador) y puede tardar varios segundos por imagen. La
              inferencia es local: tus imágenes nunca salen de tu dispositivo. Si el
              formato de salida es JPG, la salida se fuerza a PNG para conservar la
              transparencia.
            </span>
          </span>
        </label>
        {/* Loading visible del modelo de quitar fondo, en esta misma sección */}
        {settings.removeBackground && modelStatus && (
          <div
            className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${
              modelStatus.state === "error"
                ? "bg-red-50 text-red-800"
                : modelStatus.state === "ready"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-cyan-50 text-cyan-800"
            }`}
            role="status"
          >
            {modelStatus.state === "downloading" && (
              <>
                <p className="flex items-center gap-2 font-bold">
                  <Spinner />
                  Descargando la IA para quitar fondo… {modelStatus.progress} %
                </p>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-cyan-100">
                  <div
                    className="h-full rounded-full bg-cyan-600 transition-all"
                    style={{ width: `${modelStatus.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-normal">
                  Solo pasa la primera vez, el modelo queda guardado en tu navegador
                  ({MODEL_NAME}, {MODEL_SIZE_LABEL}). Las imágenes nunca salen de tu
                  dispositivo; solo se descarga el modelo.
                </p>
              </>
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
        {settings.removeBackground && settings.format === "jpeg" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            ⚠️ Con quitar fondo activado, JPG no admite transparencia: la salida será PNG.
          </p>
        )}
      </Section>
    </section>
  );
}
