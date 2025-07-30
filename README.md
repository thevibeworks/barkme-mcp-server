# Barkme MCP Server

[![smithery badge](https://smithery.ai/badge/@vibeworks/barkme-mcp-server)](https://smithery.ai/server/@vibeworks/barkme-mcp-server)

A Model Context Protocol (MCP) server that provides iOS push notifications through the [Bark](https://bark.day.app/) service. Send notifications directly from Claude conversations with a simple, intelligent interface.

## Features

- **Single Tool Interface**: One `notify` tool handles all notification scenarios
- **Device Aliases**: Use friendly configurable aliases like "iPhone:key1", "macOS:key2" instead of exposing device keys to AI
- **Async-First**: Non-blocking notifications with background delivery and structured logging
- **Complete Bark API Support**: All 20+ parameters including encrypted messages and notification management
- **Update/Delete Notifications**: Modify or remove previously sent notifications using notification IDs

## Quick Start

### Prerequisites

- Node.js 20+
- A [Bark](https://bark.day.app/) device key from the iOS app ([setup tutorial](https://bark.day.app/#/tutorial))
- A MCP Client like [Claude Desktop](https://claude.ai/desktop) or [Claude Code](https://claude.ai/code)

### via npmjs


#### Claude Desktop Integration

Add to your Claude Desktop configuration file:

- **macOS/Linux**: `~/.config/claude-desktop/claude_desktop_config.json`
- **Windows**: `%AppData%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "barkme": {
      "command": "npx",
      "args": ["@vibeworks/barkme-mcp-server"],
      "env": {
        "LOG_LEVEL": "info",
        "BARK_DEVICES": "iPhone:<your key>",
        "BARK_SERVER": "https://api.day.app",
        "BARK_GROUP": "Claude",
        "BARK_RETRY": "2",
        "BARK_ASYNC": "true"
      }
    }
  }
}
```


*Restart Claude Desktop* after adding the configuration. The Barkme server will appear in the MCP tools section.

### via Smithery

To install barkme-mcp-server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@thevibeworks/barkme-mcp-server):

```bash
npx -y @smithery/cli install @vibeworks/barkme-mcp-server --client claude
```


### From source
```bash
git clone https://github.com/thevibeworks/barkme-mcp-server
cd barkme-mcp-server
npm install
npm run build
```

```json
{
  "mcpServers": {
    "barkme": {
      "command": "node",
      "args": ["/absolute/path/to/barkme-mcp-server/dist/index.js"],
      "env": {
      ...
      }
    }
  }
}
```


## Usage Examples

Ask Claude:
- "Send me a notification saying 'Hello World'"
- "Send a notification to my iPhone and iPad saying 'Meeting in 10 minutes'"
- "Send a critical alert about server maintenance"
- "Update the notification with ID 'deploy-123' to say 'Deployment completed'"

## Tool Reference

### notify

Send push notifications to iOS devices via Bark service.

**Key Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | string | Main notification text |
| `title` | string | Bold title above message |
| `level` | enum | Urgency: `passive`, `active`, `timeSensitive`, `critical` |
| `targets` | array | Device aliases (e.g., `["iPhone", "iPad"]`) |
| `icon` | URL | Custom icon image |
| `url` | URL | Link to open when tapped |
| `id` | string | For updating/deleting notifications |
| `delete` | boolean | Delete notification (requires `id`) |

**Response Format:**

```
Sending notification - queued for background delivery
To: `iPhone`, `iPad`
Level: timeSensitive

Delivery status will be logged to console:
2025-07-29T15:26:17.123Z [INFO] Notification delivered to iPhone in 0.234s
2025-07-29T15:26:17.145Z [INFO] Notification delivered to iPad in 0.267s
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BARK_DEVICES` | - | **Required**: Device keys: `key1,key2` or aliases: `iPhone:key1,iPad:key2` |
| `BARK_DEFAULT_DEVICE` | First device | Default device alias for fallback |
| `BARK_SERVER` | `https://api.day.app` | Bark server URL |
| `BARK_GROUP` | `Bark MCP Server` | Default notification group |
| `BARK_SOUND` | - | Default notification sound |
| `BARK_ICON` | - | Default icon URL |
| `BARK_LEVEL` | - | Default urgency level |
| `BARK_VOLUME` | - | Default volume (0-10) |
| `BARK_RETRY` | `1` | Retry count on failure (0-10) |
| `BARK_ASYNC` | `true` | Async mode: `true` (fire-and-forget) or `false` (blocking) |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |

## Development

### Project Structure

```
barkme-mcp-server/
├── src/
│   ├── index.ts          # Main MCP server implementation
│   └── logger.ts         # Simple structured logging
├── dist/
│   ├── index.js          # Compiled executable
│   ├── logger.js         # Compiled logger
│   └── *.d.ts           # Type definitions
├── references/           # Reference materials
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
├── CLAUDE.md            # Development guide
└── README.md            # This file
```

### Build Commands

```bash
npm run build        # Compile TypeScript
npm run watch        # Watch mode for development
npm start           # Run the compiled server
```


## License

MIT

## Related Projects

- [Bark](https://github.com/Finb/Bark) - The original iOS notification service
- [barkme-tools](https://github.com/thevibeworks/yolo-tools) - Original shell script implementation
- [Model Context Protocol](https://modelcontextprotocol.io/) - The MCP specification
