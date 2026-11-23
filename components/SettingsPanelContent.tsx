"use client";

import RenamePanel from "@/components/RenamePanel";
import SettingsPanel from "@/components/SettingsPanel";
import type { ModelStatus } from "@/lib/backgroundRemoval";
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
              <SettingsPanel
                settings={settings}
                onChange={onSettingsChange}
                disabled={processing}
                modelStatus={modelStatus}
              />
            </div>

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
