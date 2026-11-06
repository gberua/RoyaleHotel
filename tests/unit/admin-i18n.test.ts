import { describe, expect, it } from "vitest";
import en from "../../messages/admin/en.json";
import ka from "../../messages/admin/ka.json";
import ru from "../../messages/admin/ru.json";

type Tree = { [k: string]: string | string[] | Tree };
function flatten(t: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (Array.isArray(v)) v.forEach((s, i) => (out[`${key}.${i}`] = s));
    else Object.assign(out, flatten(v, key));
  }
  return out;
}
/** ICU arguments used in a message: {name} and {n, plural, …} → name / n */
const args = (s: string) => [...s.matchAll(/\{\s*([a-zA-Z_]+)\s*[,}]/g)].map((m) => m[1]).filter((a) => a !== "one" && a !== "other").sort();

describe("admin translations (KA / EN / RU)", () => {
  const base = flatten(en as unknown as Tree);
  for (const [lang, tree] of [["ka", ka], ["ru", ru]] as const) {
    const msgs = flatten(tree as unknown as Tree);
    it(`${lang} has every English key and nothing extra`, () => {
      expect(Object.keys(base).filter((k) => !(k in msgs))).toEqual([]);
      expect(Object.keys(msgs).filter((k) => !(k in base))).toEqual([]);
    });
    it(`${lang} keeps the same {placeholders}`, () => {
      const wrong = Object.keys(base).filter((k) => k in msgs && JSON.stringify([...new Set(args(base[k]))]) !== JSON.stringify([...new Set(args(msgs[k]))]));
      expect(wrong).toEqual([]);
    });
    it(`${lang} has no empty texts`, () => {
      expect(Object.entries(msgs).filter(([k, v]) => !v.trim() && base[k].trim())).toEqual([]);
    });
  }
  it("no key contains a dot (next-intl would reject it)", () => {
    const bad: string[] = [];
    const walk = (t: Tree, p: string) => { for (const [k, v] of Object.entries(t)) { if (k.includes(".")) bad.push(`${p}${k}`); if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${p}${k}.`); } };
    walk(en as unknown as Tree, "");
    expect(bad).toEqual([]);
  });
});
