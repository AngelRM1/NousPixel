import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NousPixel — por NousLogic",
  description:
    "NousPixel, editor de imágenes en el navegador: convierte formato, cambia resolución, comprime, renombra por lote y descarga en ZIP. Tus archivos nunca salen de tu dispositivo. La razón ordena el cosmos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
