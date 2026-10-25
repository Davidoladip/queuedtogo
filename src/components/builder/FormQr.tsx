"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** A QR code for the public form link, with downloads for printing on signs, flyers and table tents. */
export function FormQr({ url, slug, title }: { url: string; slug: string; title: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => { if (live) { setSvg(s); setErr(false); } })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [url]);

  const save = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const png = async () => save(await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M" }), `${slug}-qr.png`);
  const svgFile = () => {
    if (!svg) return;
    const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    save(u, `${slug}-qr.svg`);
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  const sign = async () => {
    // A simple printable sign: title, big QR code, the link written out.
    const img = await QRCode.toDataURL(url, { width: 900, margin: 1, errorCorrectionLevel: "M" });
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · QR code</title>
<style>@page{size:letter;margin:0.6in}body{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;text-align:center;color:#000;margin:0;padding:24px}
h1{font-size:34px;margin:0 0 6px}p{font-size:20px;margin:0 0 20px}img{width:5in;max-width:90vw;height:auto}.u{font-size:15px;color:#333;margin-top:16px;word-break:break-all}</style></head>
<body><h1>${esc(title)}</h1><p>Scan to order</p><img src="${img}" alt="QR code for ${esc(url)}"><div class="u">${esc(url)}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="b-qr" data-testid="form-qr">
      <span className="b-label">QR code</span>
      {err ? <p className="b-note err">The QR code couldn&apos;t be made. Copy the link instead.</p> : (
        <div className="b-qr-row">
          {/* SVG made in the browser by the qrcode library from our own form URL. */}
          <div className="b-qr-img" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg ?? "" }} />
          <div className="b-qr-btns">
            <button type="button" className="btn small" disabled={!svg} onClick={() => void png()}>Download PNG</button>
            <button type="button" className="btn small" disabled={!svg} onClick={svgFile}>Download SVG</button>
            <button type="button" className="btn small" disabled={!svg} onClick={() => void sign()}>Print a sign</button>
          </div>
        </div>
      )}
      <p className="b-note muted">Customers scan it to open this form. PNG suits flyers and social posts; SVG stays sharp at any size for banners. If you change the form&apos;s web address, print new codes.</p>
    </div>
  );
}
