import { redirect } from "next/navigation";

export default async function WorkspaceHome({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/w/${orgSlug}/forms`);
}
