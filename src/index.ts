#!/usr/bin/env node

export const VERSION = "0.1.0";

const DEFAULT_BARK_SERVER = "https://api.day.app";
const DEFAULT_GROUP_NAME = "Bark MCP Server";
const DEFAULT_RETRY_COUNT = "1";
const DEFAULT_ASYNC_MODE = "true";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import got from "got";
import { logger } from "./logger.js";

export type ToolRegistration<T> = Tool & {
  handler: (args: T) => CallToolResult | Promise<CallToolResult>;
};

function makeJsonSchema(schema: z.ZodType<any, any, any>) {
  return zodToJsonSchema(schema) as any;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

interface BarkConfig {
  server: string;
  devices: Map<string, string>;
  defaultDevice: string;
  async: boolean;
  proxyUrl?: string;
  group: string;
  retry: number;
  sound?: string;
  icon?: string;
  level?: string;
  volume?: number;
}

function loadBarkConfig(): BarkConfig {
  const devices = new Map<string, string>();

  const devicesStr = process.env.BARK_DEVICES?.trim();
  if (!devicesStr) {
    throw new Error(
      "BARK_DEVICES environment variable is required. Format: 'iPhone:key1,iPad:key2' or 'key1,key2'"
    );
  }

  const pairs = devicesStr
    .split(",")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0);
  for (const pair of pairs) {
    if (pair.includes(":")) {
      const [alias, key] = pair.split(":").map((s) => s.trim());
      if (alias && key) {
        devices.set(alias, key);
      }
    } else {
      const key = pair.trim();
      if (key) {
        const autoAlias = `device${devices.size + 1}`;
        devices.set(autoAlias, key);
      }
    }
  }

  if (devices.size === 0) {
    throw new Error(
      "No valid devices found in BARK_DEVICES. Format: 'iPhone:key1,iPad:key2' or 'key1,key2'"
    );
  }

  const configuredDefault = process.env.BARK_DEFAULT_DEVICE?.trim();
  let defaultDevice = Array.from(devices.keys())[0];

  if (configuredDefault && devices.has(configuredDefault)) {
    defaultDevice = configuredDefault;
  } else if (configuredDefault) {
    logger.warn(
      `BARK_DEFAULT_DEVICE "${configuredDefault}" not found in devices, using first device: ${defaultDevice}`
    );
  }

  const server = process.env.BARK_SERVER?.trim() || DEFAULT_BARK_SERVER;
  if (!isValidUrl(server)) {
    throw new Error(`Invalid BARK_SERVER URL: ${server}`);
  }

  const icon = process.env.BARK_ICON?.trim();
  if (icon && !isValidUrl(icon)) {
    throw new Error(`Invalid BARK_ICON URL: ${icon}`);
  }

  const retryStr = process.env.BARK_RETRY?.trim() || DEFAULT_RETRY_COUNT;
  const retry = parseInt(retryStr, 10);
  if (isNaN(retry) || retry < 0 || retry > 10) {
    throw new Error(
      `Invalid BARK_RETRY value: ${retryStr}. Must be a number between 0-10.`
    );
  }

  const level = process.env.BARK_LEVEL?.trim();
  if (
    level &&
    !["passive", "active", "timeSensitive", "critical"].includes(level)
  ) {
    throw new Error(
      `Invalid BARK_LEVEL value: ${level}. Must be one of: passive, active, timeSensitive, critical.`
    );
  }

  const volumeStr = process.env.BARK_VOLUME?.trim();
  let volume: number | undefined;
  if (volumeStr) {
    volume = parseInt(volumeStr, 10);
    if (isNaN(volume) || volume < 0 || volume > 10) {
      throw new Error(
        `Invalid BARK_VOLUME value: ${volumeStr}. Must be a number between 0-10.`
      );
    }
  }

  const asyncStr = process.env.BARK_ASYNC?.trim() || DEFAULT_ASYNC_MODE;
  const async = asyncStr.toLowerCase() !== "false";

  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;

  return {
    server,
    devices,
    defaultDevice,
    async,
    proxyUrl,
    group: process.env.BARK_GROUP?.trim() || DEFAULT_GROUP_NAME,
    sound: process.env.BARK_SOUND?.trim(),
    icon,
    retry,
    level,
    volume,
  };
}

let cachedConfig: BarkConfig | null = null;
let configError: Error | null = null;

function getBarkConfig(): BarkConfig {
  if (configError) throw configError;
  if (cachedConfig) return cachedConfig;

  try {
    cachedConfig = loadBarkConfig();
    return cachedConfig;
  } catch (error) {
    configError = error as Error;
    throw configError;
  }
}

function createNotificationSchema(config: BarkConfig) {
  const deviceAliases = Array.from(config.devices.keys());

  return z
    .object({
      message: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Main notification text (required unless deleting existing notification)"
        ),
      title: z
        .string()
        .optional()
        .describe("Bold title shown above the message"),
      subtitle: z
        .string()
        .optional()
        .describe("Secondary text shown below the title"),
      level: z
        .enum(["passive", "active", "timeSensitive", "critical"])
        .optional()
        .describe(
          "Urgency level: passive=silent notification, active=normal alert (default), timeSensitive=breaks through Do Not Disturb, critical=emergency alert with sound"
        ),
      group: z
        .string()
        .optional()
        .describe("Category name to group related notifications together"),
      icon: z
        .string()
        .url()
        .optional()
        .describe(
          "Custom icon image URL to display instead of default Bark icon"
        ),
      url: z
        .string()
        .url()
        .optional()
        .describe(
          "Web link or app URL to open when user taps the notification"
        ),
      sound: z.string().optional().describe("Custom notification sound name"),
      badge: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("App badge number (any integer)"),
      copy: z
        .string()
        .optional()
        .describe(
          "Custom text to copy when notification is tapped (defaults to full notification content)"
        ),
      autocopy: z
        .boolean()
        .optional()
        .describe(
          "Auto-copy message content (iOS 14.5+ requires manual long press)"
        ),
      ring: z
        .boolean()
        .optional()
        .describe("Repeat notification sound continuously"),
      archive: z
        .boolean()
        .optional()
        .describe("Save notification to history (overrides app settings)"),
      volume: z
        .number()
        .int()
        .min(0)
        .max(10)
        .optional()
        .describe("Alert volume for critical notifications (0-10, default 5)"),
      action: z
        .enum(["none"])
        .optional()
        .describe("Disable popup when notification is tapped (pass 'none')"),
      ciphertext: z
        .string()
        .optional()
        .describe("Encrypted message text for secure notifications"),
      targets: z
        .array(z.string())
        .optional()
        .describe(
          deviceAliases.length > 0
            ? `Device aliases to send notification to. Available devices: ${deviceAliases.join(", ")}. If not specified, sends to all configured devices.`
            : "Device aliases to send notification to (if not specified, sends to all configured devices)"
        ),
      id: z
        .string()
        .optional()
        .describe(
          "Notification ID for update operations (same ID updates existing notification)"
        ),
      delete: z
        .boolean()
        .optional()
        .describe(
          "Delete notification from system notification center and app history (requires id and background app refresh enabled)"
        ),
    })
    .refine(
      (data) => {
        if (!data.delete && !data.message) {
          return false;
        }
        if (data.delete && !data.id) {
          return false;
        }
        return true;
      },
      {
        message:
          "Message required unless deleting. Delete operations require id parameter.",
      }
    );
}

type NotificationParams = z.infer<ReturnType<typeof createNotificationSchema>>;

interface BarkApiResponse {
  code: number;
  message?: string;
  timestamp?: number;
}

let httpClient: ReturnType<typeof got.extend>;
let currentProxyUrl: string | undefined;

function getHttpClient(proxyUrl?: string, retryCount: number = 1) {
  if (!httpClient || currentProxyUrl !== proxyUrl) {
    httpClient = got.extend({
      timeout: { request: 10_000, connect: 5_000 },
      retry: {
        limit: Math.max(0, retryCount - 1),
        methods: ["POST"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
        errorCodes: [
          "ETIMEDOUT",
          "ECONNRESET",
          "EADDRINUSE",
          "ECONNREFUSED",
          "EPIPE",
          "ENOTFOUND",
          "ENETUNREACH",
          "EAI_AGAIN",
        ],
      },
      http2: false,
    });
    currentProxyUrl = proxyUrl;
  }
  return httpClient;
}

interface TargetResolution {
  keys: string[];
  aliases: string[];
  invalidTargets: string[];
  usedFallback: boolean;
}

function resolveTargetDevices(
  config: BarkConfig,
  params: NotificationParams
): TargetResolution {
  let targetKeys: string[] = [];
  let targetAliases: string[] = [];
  let invalidTargets: string[] = [];
  let usedFallback = false;

  if (params.targets && params.targets.length > 0) {
    for (const alias of params.targets) {
      const key = config.devices.get(alias);
      if (key) {
        targetKeys.push(key);
        targetAliases.push(alias);
      } else {
        invalidTargets.push(alias);
      }
    }

    if (targetKeys.length === 0) {
      const defaultKey = config.devices.get(config.defaultDevice);
      if (defaultKey) {
        targetKeys = [defaultKey];
        targetAliases = [config.defaultDevice];
        usedFallback = true;
        logger.warn(
          `No valid targets found, using default device: ${config.defaultDevice}`
        );
      }
    }
  } else {
    targetKeys = Array.from(config.devices.values());
    targetAliases = Array.from(config.devices.keys());
  }

  return {
    keys: targetKeys,
    aliases: targetAliases,
    invalidTargets,
    usedFallback,
  };
}

function buildBarkPayload(
  config: BarkConfig,
  params: NotificationParams
): Record<string, any> {
  const basePayload = Object.fromEntries(
    Object.entries({
      body: params.message,
      title: params.title,
      subtitle: params.subtitle,
      sound: params.sound || config.sound,
      icon: params.icon || config.icon,
      group: params.group || config.group,
      url: params.url,
      level: params.level || config.level,
      badge: params.badge,
      copy: params.copy,
      autoCopy: params.autocopy ? "1" : undefined,
      call: params.ring ? "1" : undefined,
      isArchive: params.archive ? "1" : undefined,
      volume: params.volume || config.volume,
      ciphertext: params.ciphertext,
      id: params.id,
      delete: params.delete ? "1" : undefined,
      action: params.action,
    }).filter(([_, value]) => value !== undefined)
  );

  return basePayload;
}

async function sendNotification(
  config: BarkConfig,
  params: NotificationParams,
  deviceKey: string,
  deviceAlias: string
): Promise<NotificationResponse> {
  const payload = buildBarkPayload(config, params);
  const client = getHttpClient(config.proxyUrl, config.retry);
  const url = `${config.server}/${deviceKey}`;

  const start = performance.now();

  try {
    logger.debug(`Sending notification to ${deviceAlias}`);

    const response = await client
      .post(url, {
        json: payload,
      })
      .json<BarkApiResponse>();

    const elapsed = ((performance.now() - start) / 1000).toFixed(3);

    if (response?.code === 200) {
      logger.info(`Notification delivered to ${deviceAlias} in ${elapsed}s`);
      return {
        success: true,
        message: `Delivered to ${deviceAlias} in ${elapsed}s`,
        elapsed,
        response: response,
      };
    } else {
      logger.warn(
        `Bark API error for ${deviceAlias}: ${JSON.stringify(response)}`
      );
      return {
        success: false,
        message: `Bark API error: ${JSON.stringify(response)} in ${elapsed}s`,
        elapsed,
        response: response,
      };
    }
  } catch (error) {
    logger.error(
      `HTTP request failed for ${deviceAlias}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    return {
      success: false,
      message: `Failed to deliver to ${deviceAlias}: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function sendNotificationAsync(
  config: BarkConfig,
  params: NotificationParams
): void {
  const {
    keys: targetKeys,
    aliases: targetAliases,
    invalidTargets,
  } = resolveTargetDevices(config, params);

  if (invalidTargets.length > 0) {
    logger.warn(`Invalid targets ignored: ${invalidTargets.join(", ")}`);
  }

  targetKeys.forEach((key, i) => {
    setTimeout(() => {
      sendNotification(config, params, key, targetAliases[i])
        .then((result) => {
          if (result.success) {
            logger.info(`${result.message}`);
          } else {
            logger.error(`${result.message}`);
          }
        })
        .catch((error) => {
          logger.error(
            `Unexpected error for ${targetAliases[i]}: ${error.message}`
          );
        });
    }, i * 100);
  });
}

interface NotificationResponse {
  success: boolean;
  message: string;
  elapsed?: string;
  response?: BarkApiResponse;
}

async function sendNotificationSync(
  config: BarkConfig,
  params: NotificationParams
): Promise<NotificationResponse> {
  const {
    keys: targetKeys,
    aliases: targetAliases,
    invalidTargets,
  } = resolveTargetDevices(config, params);

  if (invalidTargets.length > 0) {
    logger.warn(`Invalid targets ignored: ${invalidTargets.join(", ")}`);
  }

  if (targetKeys.length > 0) {
    return await sendNotification(
      config,
      params,
      targetKeys[0],
      targetAliases[0]
    );
  }

  return {
    success: false,
    message: "No valid targets found",
  };
}

function getOperationDescription(params: NotificationParams): string {
  if (params.delete) {
    return `Deleting notification "${params.id}"`;
  } else if (params.id) {
    return `Updating notification "${params.id}"`;
  } else {
    return params.title
      ? `Sending notification "${params.title}"`
      : "Sending notification";
  }
}

function formatTargetList(
  config: BarkConfig,
  params: NotificationParams
): string {
  if (params.targets && params.targets.length > 0) {
    return params.targets.join(", ");
  }
  return Array.from(config.devices.keys()).join(", ");
}

function formatAsyncResponse(
  config: BarkConfig,
  params: NotificationParams
): string {
  const action = getOperationDescription(params);
  const {
    aliases: targetAliases,
    invalidTargets,
    usedFallback,
  } = resolveTargetDevices(config, params);

  let responseText = `${action} - queued for background delivery`;
  responseText += `\nTo: ${targetAliases.map((alias) => `\`${alias}\``).join(", ")}`;

  if (invalidTargets.length > 0) {
    responseText += `\n⚠ Invalid targets ignored: ${invalidTargets.map((target) => `\`${target}\``).join(", ")}`;
    const allDevices = Array.from(config.devices.keys());
    responseText += `\nValid devices: ${allDevices.map((device) => `\`${device}\``).join(", ")}`;
  }

  if (usedFallback) {
    responseText += `\n⚠ No valid targets found, used default device: \`${config.defaultDevice}\``;
  }

  if (params.level && params.level !== "active") {
    responseText += `\nLevel: ${params.level}`;
  }

  return responseText;
}

function formatSyncResponse(
  config: BarkConfig,
  params: NotificationParams,
  result: NotificationResponse
): string {
  if (result.success) {
    const action = getOperationDescription(params);
    const {
      aliases: targetAliases,
      invalidTargets,
      usedFallback,
    } = resolveTargetDevices(config, params);

    let responseText = `${action.replace("Sending", "Sent")} - delivered immediately`;
    responseText += `\nTo: \`${targetAliases[0]}\``;
    if (result.elapsed) responseText += ` (${result.elapsed}s)`;

    if (invalidTargets.length > 0) {
      responseText += `\n⚠ Invalid targets ignored: ${invalidTargets.map((target) => `\`${target}\``).join(", ")}`;
      const allDevices = Array.from(config.devices.keys());
      responseText += `\nValid devices: ${allDevices.map((device) => `\`${device}\``).join(", ")}`;
    }

    if (usedFallback) {
      responseText += `\n⚠ No valid targets found, used default device: \`${config.defaultDevice}\``;
    }

    return responseText;
  } else {
    return `Failed to send notification - immediate delivery\n${result.message}`;
  }
}

function queueNotification(
  config: BarkConfig,
  params: NotificationParams
): void {
  setTimeout(() => {
    try {
      sendNotificationAsync(config, params);
    } catch (syncError) {
      logger.error(
        `Background notification setup failed (non-fatal): ${syncError instanceof Error ? syncError.message : "Unknown error"}`
      );
    }
  }, 100);
}

function createNotifyTool(): ToolRegistration<NotificationParams> {
  const config = getBarkConfig();
  const notificationSchema = createNotificationSchema(config);

  return {
    name: "notify",
    description:
      "Send push notifications to iOS devices via Bark. Use for alerts, updates, reminders, or any user communication. Supports urgency levels, custom appearance, actions, and notification management.",
    inputSchema: makeJsonSchema(notificationSchema),
    handler: async (args: NotificationParams) => {
      try {
        const validParams = notificationSchema.parse(args);
        logger.debug(
          `Processing notification request for ${validParams.targets?.length || config.devices.size} devices`
        );

        if (config.async) {
          logger.info("Queuing notification for async delivery");
          queueNotification(config, validParams);
          const responseText = formatAsyncResponse(config, validParams);

          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
          };
        } else {
          logger.info("Sending notification synchronously");
          const result = await sendNotificationSync(config, validParams);
          const responseText = formatSyncResponse(config, validParams, result);

          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
          };
        }
      } catch (error) {
        logger.error(
          `Notification request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return {
          content: [
            {
              type: "text",
              text: `Notification failed: ${error instanceof Error ? error.message : "Unknown error"}\n\nEnsure BARK_DEVICES environment variable is set with format: 'iPhone:key1,iPad:key2' or 'key1,key2'`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}

const server = new Server(
  {
    name: "barkme-mcp-server",
    version: VERSION,
    description: "Send iOS push notifications to users via Bark service",
    instructions: `Feel free to send push notifications to iOS devices using the \`notify\` tool.

KEY CAPABILITIES:
- Send instant notifications with custom titles, messages, and alerts
- Use different urgency levels (passive, active, timeSensitive, critical)
- Add custom icons, sounds, and action URLs
- Update or delete existing notifications
- Notifications are sent to all configured devices

COMMON USAGE PATTERNS:
- Quick alerts: notify(message="Your task is complete")
- Important alerts: notify(message="Server down", title="Alert", level="critical")
- With actions: notify(message="New deployment", url="https://dashboard.com")
- Updates: notify(message="Updated status", id="task-123")

The notify tool handles all the technical details - just provide the message and any optional parameters for enhanced notifications.`,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [createNotifyTool()];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ handler, ...tool }) => tool),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return tool.handler(args || {});
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Barkme MCP Server running on stdio");
}

runServer().catch((error) => {
  logger.error(
    `Fatal error running server: ${error instanceof Error ? error.message : "Unknown error"}`
  );
  process.exit(1);
});
