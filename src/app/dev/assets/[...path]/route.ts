import { harnessEnabled } from "../../sample";

// Development harness only: an in-memory stand-in for the form-assets bucket, so browser tests can
// upload, replace, render and remove artwork without Supabase. 404 unless QTG_DEV_HARNESS=1 (never on Vercel).
const store = new Map<string, { type: string; body: ArrayBuffer }>();
const SAFE = /^[0-9a-f-]{36}\/[A-Za-z0-9/_-]+\.(webp|png|jpg)$/;
const notFound = () => new Response("Not found", { status: 404 });

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!harnessEnabled()) return notFound();
  const key = (await params).path.join("/");
  const hit = store.get(key);
  return hit ? new Response(hit.body, { headers: { "content-type": hit.type, "cache-control": "no-store" } }) : notFound();
}

export async function POST(req: Request, { params }: Ctx) {
  if (!harnessEnabled()) return notFound();
  const key = (await params).path.join("/");
  const type = req.headers.get("content-type") ?? "";
  if (!SAFE.test(key) || !["image/png", "image/jpeg", "image/webp"].includes(type)) return new Response("Bad request", { status: 400 });
  const body = await req.arrayBuffer();
  if (body.byteLength > 10e6) return new Response("Too large", { status: 413 });
  store.set(key, { type, body });
  return new Response(null, { status: 201 });
}
