import type { AppConfig } from "../config.ts";
import { vpsComputerStatus } from "../vps-computer.ts";
import { vpsConfigForBot, vpsSshAliasForBot } from "../vps-hosts.ts";

export async function personalVpsRoutineReadiness(cfg: AppConfig, bot: { id: string; vpsAlias?: string }): Promise<{ ready: boolean; reason?: string }> {
  if (!vpsSshAliasForBot(cfg, bot)) {
    return { ready: false, reason: "Running on a cloud computer needs your own VPS. Configure a VPS SSH alias in Settings → Computers first." };
  }
  const status = await vpsComputerStatus(vpsConfigForBot(cfg, bot), bot.id);
  const canPrepare = status.configured && status.daemonUp && (status.container === "missing" || (status.managed &&
    status.image && status.imageMatches && status.network === "private" && status.mounts === "none" && status.security === "hardened"));
  if (status.ready || canPrepare) return { ready: true };
  return { ready: false, reason: status.problem ?? "The target bot's VPS could not be reached. Check its VPS connection in Settings → Computers." };
}
