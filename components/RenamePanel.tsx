"use client";

import type { EditorSettings, SequenceType } from "@/lib/types";

interface Props {
  settings: EditorSettings;
  onChange: (settings: EditorSettings) => void;
  disabled?: boolean;
  /** Primeros 3 nombres resultantes (con extensión). Vacío si no aplica. */
  previewNames: string[];
  /** Error de validación del inicio (si lo hay). */
  previewError?: string;
}

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-semibold text-slate-700";

export default function RenamePanel({ settings, onChange, disabled, previewNames, previewError }: Props) {
  const rename = settings.rename;
  const setRename = (patch: Partial<EditorSettings["rename"]>) =>
    onChange({ ...settings, rename: { ...rename, ...patch } });

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">✏️ Renombrar por lote</h2>
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          disabled={disabled}
          checked={rename.enabled}
          onChange={(e) => setRename({ enabled: e.target.checked })}
          className="mt-0.5 accent-cyan-600"
        />
        <span>
          Renombrar las imágenes procesadas
          <span className="block text-xs text-slate-500">
            Desactivado por defecto: se conserva el nombre original de cada archivo.
          </span>
        </span>
      </label>

      {rename.enabled && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="nombre-base">
                Nombre base
              </label>
              <input
                id="nombre-base"
                type="text"
                disabled={disabled}
                className={`${inputCls} w-full`}
                placeholder="Ej. foto-producto"
                value={rename.baseName}
                onChange={(e) => setRename({ baseName: e.target.value })}
              />
              {!rename.baseName.trim() && (
                <p className="mt-1 text-xs text-slate-500">
                  Si lo dejas vacío se usará «imagen» como base.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="separador">
                Separador
              </label>
              <select
                id="separador"
                disabled={disabled}
                className={`${inputCls} w-full`}
                value={rename.separator}
                onChange={(e) => setRename({ separator: e.target.value as "-" | "_" })}
              >
                <option value="-">Guion (-)</option>
                <option value="_">Guion bajo (_)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="consecutivo">
                Tipo de consecutivo
              </label>
              <select
                id="consecutivo"
                disabled={disabled}
                className={`${inputCls} w-full`}
                value={rename.sequence}
                onChange={(e) => setRename({ sequence: e.target.value as SequenceType, start: e.target.value === "numerico" ? "1" : e.target.value === "alfabetico" ? "A" : "I" })}
              >
                <option value="numerico">Numérico (1, 2, 3…)</option>
                <option value="alfabetico">Alfabético (A, B, C… Z, AA…)</option>
                <option value="romano">Romanos (I, II, III…)</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="inicio">
                Iniciar desde
              </label>
              <input
                id="inicio"
                type="text"
                disabled={disabled}
                className={`${inputCls} w-full`}
                placeholder={rename.sequence === "numerico" ? "Ej. 222" : rename.sequence === "alfabetico" ? "Ej. C" : "Ej. V"}
                value={rename.start}
                onChange={(e) => setRename({ start: e.target.value })}
              />
            </div>
            {rename.sequence === "numerico" && (
              <div>
                <label className={labelCls} htmlFor="relleno">
                  Relleno con ceros
                </label>
                <select
                  id="relleno"
                  disabled={disabled}
                  className={`${inputCls} w-full`}
                  value={String(rename.padDigits)}
                  onChange={(e) => setRename({ padDigits: Number(e.target.value) as 0 | 2 | 3 | 4 })}
                >
                  <option value="0">Sin relleno (222)</option>
                  <option value="2">2 dígitos (02…)</option>
                  <option value="3">3 dígitos (222)</option>
                  <option value="4">4 dígitos (0222)</option>
                </select>
              </div>
            )}
          </div>

          {previewError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
              ⚠️ {previewError} Se procesará con los nombres originales hasta que lo corrijas.
            </p>
          ) : previewNames.length > 0 ? (
            <div className="rounded-lg bg-slate-100 px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">Vista previa:</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                {previewNames.map((n) => (
                  <li key={n} className="font-mono break-all">
                    {n}
                  </li>
                ))}
                <li>…y así sucesivamente, sin duplicados.</li>
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
