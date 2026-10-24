import "server-only";
import QRCode from "qrcode";

/** SVG markup for a QR code of one of our own URLs (job pages). */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
