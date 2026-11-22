import { initialsOf } from "@/lib/avatar";

/** A person's picture in a circle, or their initials when they haven't added one. Decorative: label the control it sits in. */
export function Avatar({ name, email, src, className = "avatar" }: { name: string | null; email: string; src: string | null; className?: string }) {
  return (
    <span className={`${className}${src ? " has-img" : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized image from our own storage */}
      {src ? <img src={src} alt="" width={64} height={64} decoding="async" draggable={false} /> : initialsOf(name, email)}
    </span>
  );
}
