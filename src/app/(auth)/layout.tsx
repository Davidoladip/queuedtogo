import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell wrap">
      <main className="auth-card">
        <Logo />
        {children}
      </main>
    </div>
  );
}
