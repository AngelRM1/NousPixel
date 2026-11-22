import type { OutputFormat, RenameSettings, SequenceType } from "./types";
import { FORMAT_EXTENSION } from "./imageProcessor";

/* ---------- Números romanos ---------- */

const ROMAN_TABLE: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return null;
  let out = "";
  let rest = n;
  for (const [value, symbol] of ROMAN_TABLE) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

const ROMAN_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

export function romanToInt(s: string): number | null {
  const upper = s.trim().toUpperCase();
  if (!upper || !ROMAN_RE.test(upper)) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const cur = values[upper[i]];
    const next = i + 1 < upper.length ? values[upper[i + 1]] : 0;
    total += cur < next ? -cur : cur;
  }
  return total >= 1 && total <= 3999 ? total : null;
}

/* ---------- Alfabético: 1=A, 26=Z, 27=AA, 28=AB… ---------- */

export function indexToAlpha(n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return null;
  let out = "";
  let rest = n;
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(65 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

export function alphaToIndex(s: string): number | null {
  const upper = s.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(upper)) return null;
  let n = 0;
  for (const ch of upper) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/* ---------- Inicio del consecutivo ---------- */

export interface StartParse {
  ok: boolean;
  /** Índice 1-based del primer consecutivo (numérico: el número tal cual). */
  index: number;
  error?: string;
}

export function parseStart(type: SequenceType, start: string): StartParse {
  const raw = start.trim();
  if (type === "numerico") {
    if (!/^\d+$/.test(raw)) {
      return { ok: false, index: 1, error: "El inicio numérico debe ser un número entero (ej. 222)." };
    }
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0) {
      return { ok: false, index: 1, error: "El inicio numérico no puede ser negativo." };
    }
    if (n > 999999) {
      return { ok: false, index: 1, error: "El inicio numérico es demasiado grande (máx. 999999)." };
    }
    return { ok: true, index: n };
  }
  if (type === "alfabetico") {
    const idx = alphaToIndex(raw);
    if (idx === null) {
      return { ok: false, index: 1, error: "El inicio alfabético debe ser una o varias letras A–Z (ej. C o AA)." };
    }
    return { ok: true, index: idx };
  }
  const idx = romanToInt(raw);
  if (idx === null) {
    return { ok: false, index: 1, error: "El inicio romano no es válido (ej. V, XII, C). Usa I–MMMCMXCIX." };
  }
  return { ok: true, index: idx };
}

/** Etiqueta del consecutivo para un índice dado (0 = primer elemento). */
export function sequenceLabel(
  type: SequenceType,
  startIndex: number,
  offset: number,
  padDigits: number,
): string {
  const n = startIndex + offset;
  if (type === "numerico") {
    const s = String(n);
    return padDigits > 0 ? s.padStart(padDigits, "0") : s;
  }
  if (type === "alfabetico") return indexToAlpha(n) ?? String(n);
  return toRoman(n) ?? String(n);
}

export function buildRenamedName(
  rename: RenameSettings,
  startIndex: number,
  offset: number,
  format: OutputFormat,
): string {
  const base = rename.baseName.trim() || "imagen";
  const seq = sequenceLabel(rename.sequence, startIndex, offset, rename.padDigits);
  return `${base}${rename.separator}${seq}.${FORMAT_EXTENSION[format]}`;
}

/**
 * Vista previa de los primeros nombres (máx. 3). Devuelve los nombres y,
 * si el inicio es inválido, el mensaje de error (sin bloquear nada: el
 * procesado usará los nombres originales en ese caso).
 */
export function renamePreview(
  rename: RenameSettings,
  format: OutputFormat,
  count: number,
): { names: string[]; error?: string } {
  if (!rename.enabled) return { names: [] };
  const parsed = parseStart(rename.sequence, rename.start);
  if (!parsed.ok) return { names: [], error: parsed.error };
  const names: string[] = [];
  for (let i = 0; i < Math.min(3, count); i++) {
    names.push(buildRenamedName(rename, parsed.index, i, format));
  }
  return { names };
}
