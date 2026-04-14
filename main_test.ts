// deno-lint-ignore-file no-import-prefix no-unversioned-import
import { assertEquals } from "jsr:@std/assert";
import { getAvailablePort } from "jsr:@std/net/get-available-port";

Deno.test({
  name: "smoke test executable",
  ignore: Deno.build.os === "windows",
  fn: async () => {
    const port = getAvailablePort();
    const command = new Deno.Command("./main.ts", {
      args: [
        `--port=${port}`,
      ],
      stdout: "piped",
    });

    const process = command.spawn();

    await waitForServerReady(process);

    const res = await fetch(`http://localhost:${port}`);
    res.body?.cancel();
    assertEquals(res.ok, true);

    process.stdout.cancel();
    process.kill();
    await process.status;
  },
});

Deno.test("smoke test run", async () => {
  const port = getAvailablePort();
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-net",
      "--allow-env",
      "./main.ts",
      `--port=${port}`,
    ],
    stdout: "piped",
  });

  const process = command.spawn();

  await waitForServerReady(process);

  const res = await fetch(`http://localhost:${port}`);
  res.body?.cancel();
  assertEquals(res.ok, true);

  process.stdout.cancel();
  process.kill();
  await process.status;
});

async function waitForServerReady(process: Deno.ChildProcess): Promise<void> {
  const decoder = new TextDecoder();
  const reader = process.stdout?.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const output = decoder.decode(value);
      if (output.includes(`Local: http://localhost:`)) {
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("Server did not start properly");
}
