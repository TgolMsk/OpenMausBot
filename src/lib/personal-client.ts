import type { AppSettingsSection } from "@/state/store";
import { PERSONAL_CLIENT } from "../../shared/personal-client";

export { PERSONAL_CLIENT };

export function personalSettingsSection(requested: AppSettingsSection | undefined, current: AppSettingsSection): AppSettingsSection {
  const section = requested ?? current;
  return PERSONAL_CLIENT && section === "cloudAccount" ? "general" : section;
}
