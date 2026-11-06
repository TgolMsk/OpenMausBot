export const UPDATE_REPOSITORY = Object.freeze({
  provider: "github",
  owner: "TgolMsk",
  repo: "OpenMausBot",
  private: false,
  channel: "latest",
});

export function configureUpdateFeed(updater) {
  updater.setFeedURL({ ...UPDATE_REPOSITORY });
  updater.channel = "latest";
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
}
