"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { generateComparisonBuyingGuide } from "@/app/admin/generate-article/actions";

const storageKey = "runplayback-generator-selection";
type Selection = { ids: string[]; orders: Record<string, string>; articleType: string };

export function GeneratorForm({ children }: { children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const [selection, setSelection] = useState<Selection>({ ids: [], orders: {}, articleType: "best_of" });

  useEffect(() => {
    const element = form.current;
    if (!element) return;
    let saved: Selection = { ids: [], orders: {}, articleType: "best_of" };
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (value && Array.isArray(value.ids) && value.ids.every((id: unknown) => typeof id === "string") && value.orders && typeof value.orders === "object") saved = value;
    } catch { /* Storage can be unavailable. */ }
    element.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="visible_source_article_ids"]').forEach(input => { input.checked = saved.ids.includes(input.value); });
    element.querySelectorAll<HTMLInputElement>('input[name^="visible_order_"]').forEach(input => { if (saved.orders[input.name.replace("visible_", "")] !== undefined) input.value = saved.orders[input.name.replace("visible_", "")]; });
    const type = element.querySelector<HTMLSelectElement>('select[name="article_type"]');
    if (type) type.value = saved.articleType === "versus" ? "versus" : "best_of";
    setSelection(saved);
  }, [children]);

  function remember() {
    const element = form.current;
    if (!element) return;
    const ids = new Set(selection.ids);
    const orders = { ...selection.orders };
    element.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="visible_source_article_ids"]').forEach(input => { if (input.checked) ids.add(input.value); else ids.delete(input.value); });
    element.querySelectorAll<HTMLInputElement>('input[name^="visible_order_"]').forEach(input => { orders[input.name.replace("visible_", "")] = input.value; });
    const next = { ids: [...ids], orders, articleType: element.querySelector<HTMLSelectElement>('select[name="article_type"]')?.value || "best_of" };
    setSelection(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep in-memory selection available. */ }
  }

  return <form ref={form} action={generateComparisonBuyingGuide} className="admin-card form generator-form" onChange={remember}>
    <p aria-live="polite">{selection.ids.length} reviews selected across all pages.</p>
    {selection.ids.map(id => <span key={id}>
      <input type="hidden" name="source_article_ids" value={id} />
      <input type="hidden" name={`order_${id}`} value={selection.orders[`order_${id}`] || "1"} />
    </span>)}
    {children}
  </form>;
}
