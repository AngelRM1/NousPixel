"use client";

import RenamePanel from "@/components/RenamePanel";
import SettingsPanel from "@/components/SettingsPanel";
import {
  ensureModel,
  MODEL_NAME,
  MODEL_SIZE_LABEL,
  resetBackgroundModel,
  type ModelStatus,
} from "@/lib/backgroundRemoval";
import type { EditorSettings, ImageItem } from "@/lib/types";

interface Props {
  items: ImageItem[];
  settings: EditorSettings;
  onSettingsChange: (settings: EditorSettings) => void;
  processing: boolean;
  modelStatus: ModelStatus;
  renameInfo: { names: string[]; error?: string };
  /** Solo en escritorio: muestra el encabezado con el botón Ocultar. */
  onHide?: () => void;
}

/**
 * Contenido completo del panel de ajustes: SettingsPanel, estado del
 * modelo de quitar fondo, RenamePanel y notas. Se usa igual en el panel
 * flotante de escritorio y en la sección «Configuración» del acordeón móvil.
 */
export default function SettingsPanelContent({
  items,
  settings,
  onSettingsChange,
  processing,
  modelStatus,
  renameInfo,
  onHide,
}: Props) {
  return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {onHide && (
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">⚙️ Ajustes</h2>
            <button
              type="button"
              onClick={onHide}
              className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
              aria-label="Ocultar panel de ajustes"
            >
              Ocultar ›
            </button>
          </div>
        )}
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Carga imágenes para ajustar el formato, la resolución, la compresión, quitar
            el fondo, recortar, rotar, aplicar filtros, renombrar por lote y añadir marca
            de agua.
          </p>
        ) : (
          <>
            <div className="mt-3">
              <SettingsPanel settings={settings} onChange={onSettingsChange} disabled={processing} />
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
              onChange={onSettingsChange}
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
  );
}
