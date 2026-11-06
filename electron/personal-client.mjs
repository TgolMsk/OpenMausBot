export const PERSONAL_CLIENT = true;

export const personalRendererArguments = () => PERSONAL_CLIENT ? ["--omb-personal-client=1"] : [];

export function personalServiceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const { hostname } = new URL(value.trim());
    if (PERSONAL_CLIENT && (hostname === "openmausbot.com" || hostname.endsWith(".openmausbot.com") || hostname === "openmausbot-composio.milindsoni201.workers.dev")) return "";
    return value.trim();
  } catch {
    return "";
  }
}
