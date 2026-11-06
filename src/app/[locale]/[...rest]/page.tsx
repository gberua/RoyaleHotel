import { notFound } from "next/navigation";

// Unknown URLs: allowed to block (it is only ever a 404)
export const instant = false;

export default function CatchAll() {
  notFound();
}
