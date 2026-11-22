"use client";

import { useRef, useState } from "react";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function UploadArea({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) onFiles(files);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? "border-cyan-500 bg-cyan-500/10"
            : "border-slate-300 bg-slate-50 hover:border-cyan-500 hover:bg-cyan-50"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span className="text-4xl" aria-hidden>
          🖼️
        </span>
        <span className="mt-3 text-lg font-semibold text-slate-800">
          Arrastra tus imágenes aquí o haz clic para elegirlas
        </span>
        <span className="mt-1 text-sm text-slate-500">
          Una o varias imágenes, en cualquier formato (PNG, JPG, WebP, AVIF, GIF, BMP…).
        </span>
        <span className="mt-3 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">
          Elegir imágenes
        </span>
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">
        🔒 Privado: las imágenes se procesan en tu navegador y nunca salen de tu dispositivo.
      </p>
    </div>
  );
}
