import { test as base } from "@playwright/test";
import { TextLineStream } from "@std/streams/text-line-stream";

export interface LiveServerFixture {
  liveServer: (options?: {
    initFiles?: {
      path: string;
      content: string;
    }[];
    fallback?: string;
  }) => Promise<{
    tempDir: string;
    url: string;
  }>;
}

export const test = base.extend<LiveServerFixture>({
  // deno-lint-ignore no-empty-pattern
  liveServer: async ({}, use) => {
    const tempDir = await Deno.makeTempDir({ "prefix": "deno-live-server-" });
    const abortController = new AbortController();

    try {
      await use(async (options) => {
        const initFiles = options?.initFiles ?? [];

        for (const { path, content } of initFiles) {
          await Deno.writeTextFile(`${tempDir}/${path}`, content);
        }

        const args = [
          "run",
          "--allow-read",
          "--allow-net",
          "./main.ts",
          tempDir,
          "--port=0",
        ];

        if (options?.fallback) {
          args.push(`--fallback=${options.fallback}`);
        }

        const command = new Deno.Command(Deno.execPath(), {
          args,
          stdout: "piped",
          stderr: "piped",
        });

        const process = command.spawn();

        process.status.then((status) => {
          if (!status.success && !abortController.signal.aborted) {
            throw new Error(`Server exited with code ${status.code}`);
          }
        });

        let url: string | undefined;

        process.stdout
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream({ allowCR: true }))
          .pipeTo(
            new WritableStream({
              write: (line) => {
                if (line) {
                  console.log(`[webserver] ${line}`);

                  const match = line.match(/Local:\s+(http:\/\/\S+)/i);

                  if (match) {
                    url = match[1];
                  }
                }
              },
            }),
          );

        process.stderr
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream({ allowCR: true }))
          .pipeTo(
            new WritableStream({
              write: (line) => {
                if (line) {
                  console.error(`[webserver] ${line}`);
                }
              },
            }),
          );

        const start = Date.now();
        while (!url) {
          if (Date.now() - start > 5000) {
            throw new Error("Timed out waiting for server to start");
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        return { tempDir, url: url! };
      });
    } finally {
      abortController.abort();
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  },
});

export { expect } from "@playwright/test";
