/** Where each kind of signed-in user lands. Used after every sign-in / password setup. */
export function roleHome(role: string | null | undefined): string {
  if (role === "platform_owner") return "/owner";
  if (role === "super_admin") return "/admin";
  if (role === "student") return "/student";
  return "/teacher";
}
