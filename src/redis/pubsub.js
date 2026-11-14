import crypto from "crypto";
import { CustomRedisClient } from "./customRedisClient.js";
import tls from "tls";
import fs from "fs";
// Unique instance identifier to prevent duplicate broadcasts within the originating server
export const SERVER_ID = crypto.randomUUID();

export const CHAT_EVENTS_CHANNEL = "chat:events";

let publisherClient = null;
let subscriberClient = null;
let socketIoInstance = null;

const MAX_FRAME = 16 * 1024 * 1024;



/**
 * Initialize the Pub/Sub coordinator with the Socket.io server instance.
 * Sets up dedicated subscriber and publisher connections to the C++ Redis server.
 */
export const initPubSub = async (io) => {
  socketIoInstance = io;

  const redisHost = process.env.REDIS_HOST || "127.0.0.1";
  const redisPort = parseInt(process.env.REDIS_PORT || "1234", 10);
  const pem = (name) => (process.env[name] || "").replace(/\\n/g, "\n");
  const tlsOptions =
  process.env.REDIS_TLS === "true"
    ? {
        servername: redisHost,
        cert: pem("REDIS_CLIENT_CERT"),
        key: pem("REDIS_CLIENT_KEY"),
      }
    : null;
  // 1. Initialize dedicated Subscriber
  subscriberClient = new CustomRedisClient({
  host: redisHost,
  port: redisPort,
  name: `Sub-${SERVER_ID.slice(0, 8)}`,
  tls: tlsOptions,
});

publisherClient = new CustomRedisClient({
  host: redisHost,
  port: redisPort,
  name: `Pub-${SERVER_ID.slice(0, 8)}`,
  tls: tlsOptions,
});

  // Handle incoming pushed messages from Redis
  subscriberClient.on("message", (channel, rawMessage) => {
    if (channel !== CHAT_EVENTS_CHANNEL) return;

    try {
      const packet = JSON.parse(rawMessage);
      const { originServerId, roomId, event, payload } = packet;

      // Drop events that originated from this same Node instance (already emitted locally)
      if (originServerId === SERVER_ID) {
        return;
      }

      console.log(
        `\n[PubSub] Received message from peer server (${originServerId.slice(0, 8)}):`,
        {
          roomId,
          event,
          message: payload?.content || payload,
        }
      );

      // Forward event to local Socket.io clients in this room
      if (socketIoInstance && roomId && event) {
        socketIoInstance.to(roomId).emit(event, payload);
      }
    } catch (err) {
      console.error("[PubSub] Failed to process incoming message packet:", err.message);
    }
  });

  subscriberClient.on("error", (err) => {
    // Log as info/warn so server continues running even if Redis is not started yet
    console.warn(`[PubSub Subscriber] Connection notice: ${err.message}`);
  });

  subscriberClient.on("connect", () => {
    console.log(`[PubSub Subscriber] Connected to Redis at ${redisHost}:${redisPort}`);
    subscriberClient.subscribe(CHAT_EVENTS_CHANNEL).catch((err) => {
      console.warn(`[PubSub] Failed to subscribe to ${CHAT_EVENTS_CHANNEL}:`, err.message);
    });
  });


  publisherClient.on("error", (err) => {
    console.warn(`[PubSub Publisher] Connection notice: ${err.message}`);
  });

  publisherClient.on("connect", () => {
    console.log(`[PubSub Publisher] Connected to Redis at ${redisHost}:${redisPort}`);
  });

  // Initiate connections asynchronously in background so app starts without blocking
  Promise.all([
    subscriberClient.connect().catch(() => {}),
    publisherClient.connect().catch(() => {}),
  ]);
};

/**
 * Broadcast an event to room members both locally and across all server instances via Redis Pub/Sub.
 *
 * @param {import("socket.io").Server} io - Local Socket.io server instance
 * @param {string} roomId - Conversation ID / Room name
 * @param {string} event - Socket event name (e.g. "messageReceived", "typing")
 * @param {any} payload - Event payload
 * @param {import("socket.io").Socket} [senderSocket=null] - Optional originating socket to exclude from local broadcast (e.g. typing)
 */
export const broadcastThroughPubSub = (io, roomId, event, payload, senderSocket = null) => {
  const localIo = io || socketIoInstance;

  // 1. Emit locally to all clients connected to this Node server in this room
  if (localIo && roomId) {
    if (senderSocket) {
      senderSocket.to(roomId).emit(event, payload);
    } else {
      localIo.to(roomId).emit(event, payload);
    }
  }

  // 2. Publish to Redis for distribution to peer Node servers
  if (publisherClient && publisherClient.connected && roomId) {
    const packet = {
      originServerId: SERVER_ID,
      roomId,
      event,
      payload,
      timestamp: Date.now(),
    };

    publisherClient
      .publish(CHAT_EVENTS_CHANNEL, JSON.stringify(packet))
      .then(() => {
        console.log(
          `[PubSub] Published event "${event}" to Redis from Server (${SERVER_ID.slice(0, 8)}) for room ${roomId}`
        );
      })
      .catch((err) => {
        console.error("[PubSub] Error publishing event to Redis:", err.message);
      });
  }
};

/**
 * Cleanly tear down Redis client connections (e.g. on SIGINT / server shutdown).
 */
export const closePubSub = () => {
  if (subscriberClient) {
    subscriberClient.disconnect();
    subscriberClient = null;
  }
  if (publisherClient) {
    publisherClient.disconnect();
    publisherClient = null;
  }
  socketIoInstance = null;
};
