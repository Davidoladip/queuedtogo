// Text-message wording, shared by the server (sending) and the Notifications page (preview).

export const SMS_VARS = ["name", "order", "link", "business", "stage"] as const;
export const MAX_TEMPLATE = 480;
const OPT_OUT = "Reply STOP to opt out.";

export type SmsVars = { name: string | null; order: number | null; link: string | null; business: string; stage: string | null };

/** Fills a stage's message. Adds the opt-out line if the message doesn't mention STOP. */
export function renderSms(template: string, v: SmsVars): string {
  const first = (v.name ?? "").trim().split(/\s+/)[0] || "there";
  const values: Record<string, string> = {
    name: first,
    order: v.order ? `QTG-${v.order}` : "",
    link: v.link ?? "",
    business: v.business,
    stage: v.stage ?? "",
  };
  let body = template.replace(/\{([a-z_]{1,20})\}/g, (m, k: string) => (k in values ? values[k] : m));
  body = body.replace(/[ \t]+/g, " ").replace(/ +([.,!?])/g, "$1").trim();
  if (!/\bSTOP\b/.test(body)) body = `${body} ${OPT_OUT}`;
  return body.slice(0, 1000);
}

/** About how many SMS segments a message uses (GSM-7: 160/153, otherwise UCS-2: 70/67). */
export function smsSegments(body: string): number {
  const gsm = /^[\n\r A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(body);
  const [one, many] = gsm ? [160, 153] : [70, 67];
  return body.length <= one ? 1 : Math.ceil(body.length / many);
}
