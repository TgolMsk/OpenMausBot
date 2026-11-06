import { PERSONAL_CLIENT } from "../shared/personal-client.ts";
import type { WireBot } from "../shared/wire.ts";

export { PERSONAL_CLIENT };

export const BUNDLED_CLOUD_DESKTOPS_DISABLED = "Bundled cloud desktops are disabled in this personal client. Use your own VPS or a Local VM.";

export function normalizeBotCloudSettings(bot: Pick<WireBot, "cloudBackend" | "autoStartVps">): boolean {
  let changed = false;
  if (bot.cloudBackend !== undefined && bot.cloudBackend !== "box" && bot.cloudBackend !== "vps") {
    delete bot.cloudBackend;
    changed = true;
  }
  if (PERSONAL_CLIENT && bot.cloudBackend !== "vps") {
    bot.cloudBackend = "vps";
    changed = true;
  }
  if (bot.autoStartVps !== undefined && bot.autoStartVps !== true && bot.autoStartVps !== false) {
    delete bot.autoStartVps;
    changed = true;
  }
  return changed;
}
