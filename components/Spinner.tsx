/** Spinner animado (solo CSS/Tailwind, sin imágenes). */
export default function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims =
    size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-8 w-8 border-[3px]" : "h-5 w-5 border-2";
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-cyan-200 border-t-cyan-600 ${dims}`}
    />
  );
}
