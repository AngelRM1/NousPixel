"use client";

import { useState } from "react";

const DONATION_LINKS = [
  {
    id: "paypal",
    name: "PayPal",
    detail: "Donación directa con PayPal.",
    url: "https://www.paypal.com/paypalme/engelarm",
  },
  {
    id: "coffee",
    name: "Buy Me a Coffee",
    detail: "Invítanos un café.",
    url: "https://buymeacoffee.com/engelarm",
  },
  {
    id: "nouslogic",
    name: "NousLogic",
    detail: "Dona un café a través de NousLogic.",
    url: "https://nouslogic.xyz/dona-un-cafe",
  },
] as const;

export default function Donations({ compact }: { compact?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      // Portapapeles no disponible: el enlace sigue visible y se puede copiar a mano.
      setCopiedId(null);
    }
  };

  return (
    <section
      className={`${compact ? "" : "mt-10 "}rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm`}
      aria-label="Apoya NousPixel con una donación"
    >
      <h2 className="text-lg font-bold text-slate-900">💛 Apoya NousPixel</h2>
      <p className="mt-1 text-sm text-slate-700">
        NousPixel es gratis y lo seguirá siendo: la donación es voluntaria y
        ninguna función está bloqueada por donar. Gracias por apoyar a NousLogic.
      </p>
      <ul className="mt-4 space-y-3 text-left">
        {DONATION_LINKS.map((link) => (
          <li
            key={link.id}
            className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-bold text-slate-800">{link.name}</p>
              <p className="text-xs text-slate-500">{link.detail}</p>
              <p className="mt-0.5 break-all text-xs text-cyan-700">{link.url}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600"
              >
                Abrir
              </a>
              <button
                type="button"
                onClick={() => void copyLink(link.id, link.url)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copiedId === link.id ? "✓ Copiado" : "Copiar enlace"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
