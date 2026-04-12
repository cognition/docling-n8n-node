# Docling n8n node

MIT-licensed community nodes for [n8n](https://n8n.io/) that call [Docling Serve](https://github.com/docling-project/docling-serve) over its **v1 REST API** (`/v1/convert/source`, `/v1/convert/file`).

This repository is **standalone** and is **not** part of the Temakwe `vps-compose` project. Install the built files into your n8n `custom` directory (see your hosting docs).

## Features

- **Resource · Operation** UI similar to built-in integration nodes.
- **Convert · From URL** — JSON `http_sources`.
- **Convert · From Base64** — JSON `file_sources`.
- **Convert · From File** — multipart `POST /v1/convert/file` with binary input items.
- **Utility · Health** — `GET /health`.
- **Utility · OpenAPI Spec** — `GET /openapi.json` (schema discovery).
- Dropdowns for common [ConvertDocumentsRequestOptions](https://github.com/docling-project/docling-serve/blob/main/docs/usage.md) fields plus **Additional Options (JSON)** for full flexibility.
- **Docling API** credential: base URL (e.g. `http://docling:5001`) and optional `X-Api-Key` when `DOCLING_SERVE_API_KEY` is set on the server.
- Palette icon: official Docling logo ([`docs/assets/logo.svg`](https://github.com/docling-project/docling/blob/main/docs/assets/logo.svg)) shipped as `docling.svg` next to the node and credential files.

## Install (custom directory)

1. Copy this repo’s `nodes/` and `credentials/` folders into your n8n user folder under `custom/`:

   - `~/.n8n/custom/` (default), or
   - `/home/node/.n8n/custom/` in Docker.

2. Restart n8n.

3. In n8n, add credentials **Docling API** with base URL reachable from the n8n container (e.g. `http://docling:5001`).

4. Use the **Docling** node from the node palette.

Expected layout:

```text
custom/
  credentials/
    docling.svg
    DoclingApi.credentials.js
  nodes/
    Docling/
      docling.svg
      Docling.node.js
```

## Environment

- `DOCLING_API_URL` — optional default used in the credential template expression for **Base URL**.

## API reference

- [Docling Serve usage (convert endpoints)](https://github.com/docling-project/docling-serve/blob/main/docs/usage.md)

## Licence

MIT — see [LICENSE](./LICENSE).
