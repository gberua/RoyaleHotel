"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ActionError, staffAction, type ActionResult } from "@/lib/admin-action";
import { logActivity } from "@/lib/booking/service";
import { can, type RoleName } from "@/lib/permissions";

const STATUS = z.enum(["CLEAN", "DIRTY", "INSPECTED", "OUT_OF_ORDER"]);

/** One tap on the housekeeping screen. Housekeeping: clean / dirty. Manager & owner: also inspected / out of order. */
export async function setHousekeeping(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return staffAction("housekeeping.update", async (user) => {
    const roomId = String(form.get("roomId"));
    const status = STATUS.parse(form.get("status"));
    if ((status === "INSPECTED" || status === "OUT_OF_ORDER") && !can(user.role as RoleName, "housekeeping.inspect")) throw new ActionError("forbidden");
    const before = await db.room.findUniqueOrThrow({ where: { id: roomId } });
    // only a manager can take a room out of "out of order"
    if (before.housekeeping === "OUT_OF_ORDER" && !can(user.role as RoleName, "housekeeping.inspect")) throw new ActionError("forbidden");
    const note = String(form.get("note") ?? "").trim().slice(0, 300);
    await db.room.update({ where: { id: roomId }, data: { housekeeping: status, housekeepingAt: new Date(), housekeepingBy: user.name, ...(form.has("note") ? { housekeepingNote: note || null } : {}) } });
    await logActivity({ userId: user.id, action: "room.housekeeping", entity: "Room", entityId: roomId, summary: `Room ${before.number}: ${before.housekeeping} → ${status}`, before: { housekeeping: before.housekeeping }, after: { housekeeping: status } });
    return { ok: true, message: `hk_${status}` };
  });
}
