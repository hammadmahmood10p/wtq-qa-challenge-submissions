import { redirect } from "next/navigation";
import { HOME_FOR_ROLE } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

/**
 * Requirement 2: the login page is the main page of the application.
 *
 * Someone already signed in goes straight to their own area instead — arriving at a
 * login form when you are logged in is the kind of small confusion that generates
 * support questions on event day.
 */
export default async function RootPage() {
  const user = await getSessionUser();

  if (!user) redirect("/login");
  redirect(user.mustChangePassword ? "/change-password" : HOME_FOR_ROLE[user.role]);
}
