import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";

type PublicForm = { form_id: string; org_name: string; status: "live" | "closed"; config: { title?: string; intro?: string } | null };

async function load(orgSlug: string, formSlug: string): Promise<PublicForm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_form", { p_org_slug: orgSlug, p_form_slug: formSlug });
  if (error) throw new Error(error.message);
  return (data as PublicForm | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string; formSlug: string }> }): Promise<Metadata> {
  const { orgSlug, formSlug } = await params;
  const form = await load(orgSlug, formSlug);
  return { title: form?.config?.title ?? "Order form" };
}

/** Public form. Renders only the published snapshot. The full themed renderer moves here in Stage 5. */
export default async function PublicFormPage({ params }: { params: Promise<{ orgSlug: string; formSlug: string }> }) {
  const { orgSlug, formSlug } = await params;
  const form = await load(orgSlug, formSlug);
  if (!form) notFound();
  return (
    <div className="auth-shell wrap">
      <main className="auth-card" style={{ maxWidth: 560 }}>
        <span className="section-label">{form.org_name}</span>
        {form.status === "closed" ? (
          <>
            <h1>This form is closed</h1>
            <p className="muted">{form.org_name} is no longer taking orders through this form.</p>
          </>
        ) : (
          <>
            <h1>{form.config?.title}</h1>
            {form.config?.intro && <p>{form.config.intro}</p>}
            <p className="muted">The ordering form for this event is being set up. Check back soon.</p>
          </>
        )}
        <div className="ticket-edge" />
        <Logo />
      </main>
    </div>
  );
}
