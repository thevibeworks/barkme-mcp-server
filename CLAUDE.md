# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

Build a Barkme MCP server exposing Bark iOS notification service through Model Context Protocol. Wraps barkme.sh tool (https://github.com/thevibeworks/vibe-tools/blob/main/src/bin/barkme.sh) into intelligent MCP interface.

## References

- `references/barkme-tools/` - Original Bark notification shell scripts
- `references/modelcontextprotocol/` - MCP specification and SDKs
- `references/notes/` - Development guides

## Design Principles

1. **Single Tool** - One `notify` tool handles all scenarios
2. **Environment Config** - Use BARK_* environment variables like original barkme.sh
3. **Auto-detection** - Handle batch/single notifications automatically
4. **Non-blocking** - Never block main process during notify operations

## Language & Stack

- **TypeScript** with MCP TypeScript SDK
- **ES modules** with strict typing
- **Zod** for validation

## Bark API Parameters

All parameters supported (https://github.com/Finb/Bark/blob/master/docs/tutorial.md):
- `title` - Notification title
- `subtitle` - Notification subtitle 
- `body` - Notification body/message
- `device_key` - Device key
- `device_keys` - Key array for batch notifications
- `level` - Interruption level (critical, active, timeSensitive, passive)
- `volume` - Critical alert volume (0-10)
- `badge` - Badge number
- `call` - Ring continuously when "1"
- `autoCopy` - Auto-copy content when "1"
- `copy` - Custom copy text
- `sound` - Custom notification sound
- `icon` - Custom icon URL
- `group` - Group notifications
- `ciphertext` - Encrypted message
- `isArchive` - Save notification when "1"
- `url` - Action URL
- `action` - Disable popup when "none"
- `id` - Update notification with same ID
- `delete` - Delete notification when "1"

## Environment Variables

- `BARK_SERVER` - Bark server URL (default: https://api.day.app)
- `BARK_DEVICES` - Device keys: "key1,key2" or aliases: "phone:key1,tablet:key2" (required)
- `BARK_DEFAULT_DEVICE` - Default device alias for fallback (defaults to first device)
- `BARK_GROUP` - Default group name (default: "Bark MCP Server")
- `BARK_SOUND` - Default notification sound
- `BARK_ICON` - Default icon URL  
- `BARK_LEVEL` - Default interruption level
- `BARK_VOLUME` - Default volume for critical alerts (0-10)
- `BARK_RETRY` - Retry attempts (default: 1, max: 10)
- `BARK_ASYNC` - Async mode: "true" (fire-and-forget, default) or "false" (blocking)

## Future Features

- **Encrypted Messages**: Support encrypted notifications (https://github.com/Finb/Bark/blob/master/docs/encryption.md)

## Critical Issues

**Async-First**: Use fire-and-forget pattern to avoid blocking MCP server during retries