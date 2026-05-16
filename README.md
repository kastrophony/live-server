# live server

[![JSR](https://jsr.io/badges/@kastrophony/live-server)](https://jsr.io/@kastrophony/live-server)

A live server implementation written in Deno to reload static html pages when
target files change

Live server also renders markdown files

## run

```bash
deno run --allow-net --allow-read --allow-env --allow-sys jsr:@kastrophony/live-server
```

`allow-sys` is optional, it is used to get the local IP address of the machine

## install

```bash
deno install --allow-net --allow-read --allow-env --allow-sys --global jsr:@kastrophony/live-server
```

```bash
live-server
# Listening on:
# - Local: http://localhost:8080
# - Network: http://192.168.4.65:8080
```

## usage

```bash
@kastrophony/live-server 0.2.6
  Serves a local directory reloads browser when files change.

INSTALL:
  deno install --allow-net --allow-read --allow-env --allow-sys jsr:@kastrophony/live-server@0.2.6

USAGE:
  live-server [path] [options]

OPTIONS:
  -h, --help            Prints help information
  -p, --port <PORT>     Set port (default is 8080 or 8443 for TLS)
  --cors                Enable CORS via the "Access-Control-Allow-Origin" header
  --host     <HOST>     Hostname (default is 0.0.0.0)
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
  
  --fallback <FILE>     Fallback file for SPA (e.g., index.html)

  All TLS options are required when one is provided.
```
