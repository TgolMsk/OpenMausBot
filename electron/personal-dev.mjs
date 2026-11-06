import { app } from "electron";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
app.setName("OpenMausBot Personal Dev");
app.setAppPath(root);
app.setPath("userData", fileURLToPath(new URL("../.omb-scratch/personal-client/desktop/", import.meta.url)));
await import("./main.mjs");
