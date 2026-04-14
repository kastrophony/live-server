#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env
// https://github.com/denoland/std/blob/6837d8e332f6fb321cf533b45ea3cd43bd8335f2/http/file_server.ts
//    ^ Copyright 2018-2025 the Deno authors. MIT license.

/**
 * This module is to be used as a CLI:
 *
 * ```shell
 * > # start server
 * > deno run --allow-net --allow-read --allow-env --allow-sys jsr:@kastrophony/live-server
 * > # show help
 * > deno run jsr:@kastrophony/live-server --help
 * ```
 *
 * If you want to install and run:
 *
 * ```shell
 * > # install
 * > deno install --allow-net --allow-read --allow-env --allow-sys --global jsr:@kastrophony/live-server
 * > # start server
 * > live-server
 * > # show help
 * > live-server --help
 * ```
 *
 * @module
 */

import { CSS, render } from "@deno/gfm";
import { parseArgs } from "@std/cli";
import { serveDir } from "@std/http";
import { getNetworkAddress } from "@std/net/unstable-get-network-address";
import { resolve } from "@std/path/resolve";
import CLIENT_SCRIPT from "./client.js";
import denoConfig from "./deno.json" with { type: "json" };

const HTTP_PORT = 8080;
const HTTPS_PORT = 8443;
const HOST = "0.0.0.0";
const sockets: Set<WebSocket> = new Set();

async function watch(path: string = "./") {
  const watcher = Deno.watchFs(path);
  let debounce: number | undefined;
  const changedFiles: Set<string> = new Set();

  for await (const event of watcher) {
    if (!["modify", "rename", "remove", "other"].includes(event.kind)) {
      continue;
    }

    event.paths.forEach((path) => changedFiles.add(path));

    if (debounce !== undefined) {
      clearTimeout(debounce);
    }

    debounce = setTimeout(() => {
      console.log(`File(s) changed: ${Array.from(changedFiles).join(", ")}`);

      sockets.forEach((socket) => {
        try {
          socket.send("reload");
        } catch (_error) {
          sockets.delete(socket);
        }
      });

      changedFiles.clear();
      debounce = undefined;
    }, 100);
  }
}

function main() {
  const serverArgs = parseArgs(Deno.args, {
    string: ["port", "host", "cert", "key", "header"],
    boolean: ["help", "dir-listing", "dotfiles", "cors", "verbose", "version"],
    negatable: ["dir-listing", "dotfiles", "cors"],
    collect: ["header"],
    default: {
      "dir-listing": true,
      dotfiles: true,
      cors: true,
      verbose: false,
      version: false,
      host: HOST,
      port: undefined,
      cert: "",
      key: "",
    },
    alias: {
      p: "port",
      c: "cert",
      k: "key",
      h: "help",
      v: "verbose",
      V: "version",
      H: "header",
    },
  });
  let port = serverArgs.port ? Number(serverArgs.port) : undefined;
  const headers = serverArgs.header ?? [];
  const host = serverArgs.host;
  const certFile = serverArgs.cert;
  const keyFile = serverArgs.key;

  const NET_PERM_STATUS =
    Deno.permissions.querySync?.({ name: "sys", kind: "networkInterfaces" })
      .state ?? "granted";

  if (serverArgs.help) {
    printUsage();
    Deno.exit();
  }

  if (serverArgs.version) {
    console.log(`${denoConfig.name} ${denoConfig.version}`);
    Deno.exit();
  }

  if (keyFile || certFile) {
    if (keyFile === "" || certFile === "") {
      console.log("--key and --cert are required for TLS");
      printUsage();
      Deno.exit(1);
    }
  }

  const wild = serverArgs._ as string[];
  const target = resolve(wild[0] ?? "");

  const handler = async (req: Request): Promise<Response> => {
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);

      socket.onopen = () => {
        sockets.add(socket);
      };

      socket.onclose = () => {
        sockets.delete(socket);
      };

      socket.onerror = (_error) => {
        sockets.delete(socket);
      };

      return response;
    }

    const response = await serveDir(req, {
      fsRoot: target,
      showDirListing: serverArgs["dir-listing"],
      showDotfiles: serverArgs.dotfiles,
      enableCors: serverArgs.cors,
      quiet: !serverArgs.verbose,
      headers,
    });

    if (response.status === 304) {
      return response;
    }

    if (response.headers.get("content-type")?.includes("text/html")) {
      const html = await response.text();
      let modifiedHtml: string;
      if (html.includes("</body>")) {
        modifiedHtml = html.replace(
          "</body>",
          `<script>${CLIENT_SCRIPT}</script>
        </body>`,
        );
      } else {
        modifiedHtml = html + `<script>${CLIENT_SCRIPT}</script>`;
      }

      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set(
        "content-length",
        new TextEncoder().encode(modifiedHtml).length.toString(),
      );

      return new Response(modifiedHtml, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (response.headers.get("content-type")?.includes("text/markdown")) {
      const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              max-width: 800px;
              margin: 0 auto;
              padding: 2rem;
            }
            ${CSS}
          </style>
        </head>
        <body data-color-mode="auto" data-light-theme="light" data-dark-theme="dark" class="markdown-body">
            ${render(await response.text())}
          <script>${CLIENT_SCRIPT}</script>
        </body>
      </html>
      `;

      const headers = new Headers(response.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set(
        "content-length",
        new TextEncoder().encode(html).length.toString(),
      );

      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  };

  const useTls = !!(keyFile && certFile);

  if (port === undefined) {
    port = useTls ? HTTPS_PORT : HTTP_PORT;
  }

  function onListen({ port, hostname }: { port: number; hostname: string }) {
    let networkAddress: string | undefined = undefined;
    if (NET_PERM_STATUS === "granted") {
      networkAddress = getNetworkAddress();
    }
    const protocol = useTls ? "https" : "http";
    const host = hostname === "0.0.0.0" ? "localhost" : hostname;

    const formattedHost = hostname.includes(":") ? `[${host}]` : host;
    let message =
      `Listening on:\n- Local: ${protocol}://${formattedHost}:${port}`;
    if (networkAddress) {
      message += `\n- Network: ${protocol}://${networkAddress}:${port}`;
    }
    message += `\n\nWatching Files Under: ${target}`;
    console.log(message);
  }

  const options: {
    port?: number;
    hostname?: string;
    onListen?: (localAddr: Deno.NetAddr) => void;
    cert?: string;
    key?: string;
  } = {
    hostname: host,
    onListen,
  };
  options.port = port;
  if (useTls) {
    options.cert = Deno.readTextFileSync(certFile);
    options.key = Deno.readTextFileSync(keyFile);
  }
  Deno.serve(options, handler);
  watch(target);
}

function printUsage() {
  console.log(`${denoConfig.name} ${denoConfig.version}
  Serves a local directory reloads browser when files change.

INSTALL:
  deno install --allow-net --allow-read --allow-env --allow-sys jsr:${denoConfig.name}@${denoConfig.version}

USAGE:
  live-server [path] [options]

OPTIONS:
  -h, --help            Prints help information
  -p, --port <PORT>     Set port (default is ${HTTP_PORT} or ${HTTPS_PORT} for TLS)
  --cors                Enable CORS via the "Access-Control-Allow-Origin" header
  --host     <HOST>     Hostname (default is ${HOST})
  -c, --cert <FILE>     TLS certificate file (enables TLS)
  -k, --key  <FILE>     TLS key file (enables TLS)
  -H, --header <HEADER> Sets a header on every request.
                        (e.g. --header "Cache-Control: no-cache")
                        This option can be specified multiple times.
  --no-dir-listing      Disable directory listing
  --no-dotfiles         Do not show dotfiles
  --no-cors             Disable cross-origin resource sharing
  -v, --verbose         Print request level logs
  -V, --version         Print version information

  All TLS options are required when one is provided.`);
}

if (import.meta.main) {
  main();
}
