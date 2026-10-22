"use client";

import { createContext, useContext } from "react";
import type { FormModel } from "@/lib/design/engine";
import type { Upload } from "../Builder";

export type PreviewState = { ctx: string; state: string };

export type DesignCtx = {
  form: FormModel;
  /** Set a design path (see paths.ts). `coalesce` merges rapid changes into one undo step. */
  apply: (path: string, v: unknown, coalesce?: boolean) => void;
  reset: (path: string) => void;
  update: (fn: (d: FormModel) => void) => void;
  selected: string | null;
  setSelected: (sid: string | null) => void;
  /** el = this element, q = all options in this question, g = all elements of this kind. */
  scope: "el" | "q" | "g";
  setScope: (s: "el" | "q" | "g") => void;
  ps: PreviewState;
  setPs: (p: PreviewState) => void;
  open: Record<string, boolean>;
  toggle: (key: string, open: boolean) => void;
  brand: string[];
  setBrand: (colors: string[]) => Promise<string | null>;
  canEditBrand: boolean;
  recent: string[];
  pushRecent: (c: string) => void;
  clearRecent: () => void;
  upload: Upload;
  assetBase: string;
  otherForms: { id: string; title: string }[];
  copyDesignFrom: (formId: string) => Promise<string | null>;
  insertArtwork: (file: File, index: number) => Promise<void>;
  notify: (text: string) => void;
};

export const Design = createContext<DesignCtx | null>(null);
export function useDesign(): DesignCtx {
  const c = useContext(Design);
  if (!c) throw new Error("useDesign must be used inside the design panel");
  return c;
}
