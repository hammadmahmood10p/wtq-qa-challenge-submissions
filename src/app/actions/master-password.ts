"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import {
  clearMasterPassword,
  masterPasswordProblem,
  masterPasswordState,
  setMasterPassword,
  setMasterPasswordEnabled,
} from "@/lib/master-password";

/**
 * Setting and switching the master password.
 *
 * Every one of these is audited, including who did it. A credential that opens any
 * participant or judge account should never change without a record of when and by
 * whom — that record is what makes "someone signed in as her at 11:40" answerable
 * afterwards rather than merely alarming.
 */

export interface MasterPasswordActionState {
  ok?: boolean;
  message?: string;
}

export async function adminSetMasterPassword(
  _prev: MasterPasswordActionState,
  formData: FormData,
): Promise<MasterPasswordActionState> {
  const admin = await requireRole("SUPER_ADMIN");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = masterPasswordProblem(password);
  if (problem) return { message: problem };

  if (password !== confirm) {
    return { message: "The two passwords do not match." };
  }

  await setMasterPassword(password);

  await audit({
    action: "admin.master_password_set",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
  });

  revalidatePath("/admin");

  return {
    ok: true,
    message: "Master password saved. It does nothing until you switch it on.",
  };
}

export async function adminSetMasterPasswordEnabled(
  enabled: boolean,
): Promise<MasterPasswordActionState> {
  const admin = await requireRole("SUPER_ADMIN");

  // Switching it on with nothing stored would leave the login form checking an empty
  // credential, which the domain layer already refuses — but failing here says why.
  const state = await masterPasswordState();
  if (enabled && !state.isSet) {
    return { message: "Set a master password before switching it on." };
  }

  await setMasterPasswordEnabled(enabled);

  await audit({
    action: enabled ? "admin.master_password_enabled" : "admin.master_password_disabled",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
  });

  revalidatePath("/admin");

  return {
    ok: true,
    message: enabled
      ? "Master password is live. Any participant or judge account will now open with it."
      : "Master password switched off. Only each person's own password works now.",
  };
}

export async function adminClearMasterPassword(): Promise<MasterPasswordActionState> {
  const admin = await requireRole("SUPER_ADMIN");

  await clearMasterPassword();

  await audit({
    action: "admin.master_password_cleared",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
  });

  revalidatePath("/admin");

  return { ok: true, message: "Master password deleted. Set a new one if you need it again." };
}
