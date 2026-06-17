# Skill: edit-timeline

Control the QCut editor timeline when **WZRD Studio Desktop** is open on:

- `/projects/<projectId>/editor`

This skill assumes the desktop app is running (Electron) and the `/editor` page is mounted.

## MCP Tool

Tool name: `edit_timeline`

The desktop app hosts a **local MCP server** (JSON-RPC 2.0 over HTTP) on:

- `http://127.0.0.1:32145`

If that port is taken, the server will fall back to a random local port. In that case:
- open `/editor` in the desktop app and query `window.wzrdQcut.mcp.getInfo()` in DevTools.

### Auth / permission gate

The MCP server requires an auth token. Grab it from DevTools:

- `window.wzrdQcut.mcp.getInfo()` → `authorizationHeader` (or `authToken`)

Then include **one** of these headers on every MCP request:

- `Authorization: Bearer <token>` (recommended)
- `x-wzrd-qcut-token: <token>`


## Commands

`edit_timeline` takes:

```json
{
  "command": "importMediaByUrl" | "addClip" | "addText" | "splitElement" | "deleteElement" | "export" | "getExportStatus" | "...",
  "args": { "...": "..." }
}
```

Examples:

### Import a clip by URL
```json
{
  "command": "importMediaByUrl",
  "args": { "url": "https://.../clip.mp4", "name": "Intro" }
}
```

### Add clip to timeline
```json
{
  "command": "addClip",
  "args": { "mediaId": "<id from importMediaByUrl>", "startTime": 0 }
}
```

### Split an element
```json
{
  "command": "splitElement",
  "args": { "trackId": "<trackId>", "elementId": "<elementId>", "splitTime": 3 }
}
```

### Add a title
```json
{
  "command": "addText",
  "args": { "content": "My Title", "startTime": 0, "duration": 4 }
}
```

### Export 720p MP4
```json
{
  "command": "export",
  "args": { "preset": "720p", "format": "mp4", "filename": "export-720p.mp4" }
}
```

### Check export status
```json
{
  "command": "getExportStatus",
  "args": {}
}
```
