import { afterEach, expect, it } from "vitest";
import { brokerAccess, personalBrokerAllowed, setManagedBrokerAccess } from "./composio-broker-access.ts";

afterEach(() => setManagedBrokerAccess(null));

it("refuses restored upstream broker access while allowing an own broker", () => {
  const token = "a".repeat(64);
  for (const url of ["https://openmausbot-composio.milindsoni201.workers.dev", "https://accounts.openmausbot.com", "https://cloud.openmausbot.com/broker"]) {
    expect(personalBrokerAllowed(url)).toBe(false);
    setManagedBrokerAccess({ url, token });
    expect(brokerAccess()).toBeNull();
  }
  setManagedBrokerAccess({ url: "https://apps.example.test/broker", token });
  expect(brokerAccess()).toEqual({ url: "https://apps.example.test/broker", token });
});
