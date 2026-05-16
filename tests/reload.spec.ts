import { expect, test } from "./fixtures.ts";

test("404 without fallback", async ({ page, liveServer }) => {
  const { url } = await liveServer({
    initFiles: [
      {
        path: "index.html",
        content: "<p id='test'>hello</p>",
      },
    ],
  });

  // Navigate to a non-existent path
  const response = await page.goto(`${url}/non-existent-path`);

  // Should get 404 status
  expect(response?.status()).toBe(404);
});

test("fallback serves file on 404", async ({ page, liveServer }) => {
  const { url } = await liveServer({
    initFiles: [
      {
        path: "index.html",
        content: "<html><body><p id='app'>SPA App</p></body></html>",
      },
    ],
    fallback: "index.html",
  });

  // Navigate to a non-existent SPA route
  const response = await page.goto(`${url}/app/route`);

  // Should get 200 status with fallback content
  expect(response?.status()).toBe(200);
  await expect(page.locator("#app")).toHaveText("SPA App");
});

test("live reload", async ({ page, liveServer }) => {
  const { tempDir, url } = await liveServer({
    initFiles: [
      {
        path: "index.html",
        content: "<p id='test'>hello</p>",
      },
    ],
  });

  await page.goto(url);

  const webSocket = await page.waitForEvent("websocket");

  await expect(page.locator("#test")).toHaveText("hello");

  const waitForReloadEvent = webSocket.waitForEvent("framereceived", {
    predicate: (ev) => ev.payload === "reload",
  });

  await Promise.allSettled([
    Deno.writeTextFile(
      `${tempDir}/index.html`,
      "<p id='test'>hey</p>",
    ),
    waitForReloadEvent,
    page.waitForRequest(page.url()), // detect page reload
  ]);

  await expect(page.locator("#test")).toHaveText("hey");
});

test("live reload markdown", async ({ page, liveServer }) => {
  const { tempDir, url } = await liveServer({
    initFiles: [
      {
        path: "README.md",
        content: "# hello",
      },
    ],
  });

  await page.goto(url + "/README.md");

  const webSocket = await page.waitForEvent("websocket");

  await expect(page.locator("h1")).toHaveText("hello");

  const waitForReloadEvent = webSocket.waitForEvent("framereceived", {
    predicate: (ev) => ev.payload === "reload",
  });

  await Promise.allSettled([
    await Deno.writeTextFile(
      `${tempDir}/README.md`,
      "# hey",
    ),
    waitForReloadEvent,
    page.waitForRequest(page.url()), // detect page reload
  ]);

  await expect(page.locator("h1")).toHaveText("hey");
});
