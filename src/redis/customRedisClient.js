import net from "net";
import { EventEmitter } from "events";
import tls from "tls"

const TAG_NIL = 0;
const TAG_ERR = 1;
const TAG_STR = 2;
const TAG_INT = 3;
const TAG_DBL = 4;
const TAG_ARR = 5;

/**
 * Encodes a string command array into a custom Redis binary request frame.
 * Format:
 * [4-byte body_len (LE)] [4-byte nstr (LE)] ([4-byte str_len (LE)] [str_bytes])...
 */
export function encodeRequest(cmd) {
  if (!Array.isArray(cmd) || cmd.length === 0) {
    throw new Error("Command must be a non-empty array of strings");
  }

  const parts = [];
  let bodyLen = 4; // 4 bytes for nstr

  // 4-byte count of strings
  const nstrBuf = Buffer.alloc(4);
  nstrBuf.writeUInt32LE(cmd.length, 0);
  parts.push(nstrBuf);

  for (const item of cmd) {
    const str = String(item ?? "");
    const strBuf = Buffer.from(str, "utf-8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(strBuf.length, 0);

    parts.push(lenBuf, strBuf);
    bodyLen += 4 + strBuf.length;
  }

  const header = Buffer.alloc(4);
  header.writeUInt32LE(bodyLen, 0);

  return Buffer.concat([header, ...parts]);
}

/**
 * Recursively decodes a typed value from the body buffer.
 * Matches C++ serialisation.cpp / client_serialisation.cpp layout.
 */
export function parseValue(buf, offset = 0) {
  if (offset >= buf.length) {
    throw new Error("Unexpected end of buffer");
  }

  const tag = buf[offset];

  switch (tag) {
    case TAG_NIL:
      return { value: null, bytesConsumed: 1 };

    case TAG_ERR: {
      // Layout: [1 byte tag] [4 bytes code (LE)] [1 byte TAG_STR] [4 bytes len (LE)] [len bytes msg]
      if (offset + 10 > buf.length) {
        throw new Error("Truncated TAG_ERR frame header");
      }
      const code = buf.readUInt32LE(offset + 1);
      const strTag = buf[offset + 5];
      if (strTag !== TAG_STR) {
        throw new Error(`Expected TAG_STR inside TAG_ERR, got ${strTag}`);
      }
      const len = buf.readUInt32LE(offset + 6);
      if (offset + 10 + len > buf.length) {
        throw new Error("Truncated TAG_ERR message content");
      }
      const msg = buf.toString("utf-8", offset + 10, offset + 10 + len);
      const err = new Error(`RedisError [${code}]: ${msg}`);
      err.code = code;
      return { value: err, isError: true, code, bytesConsumed: 10 + len };
    }

    case TAG_STR: {
      // Layout: [1 byte tag] [4 bytes len (LE)] [len bytes string]
      if (offset + 5 > buf.length) {
        throw new Error("Truncated TAG_STR header");
      }
      const len = buf.readUInt32LE(offset + 1);
      if (offset + 5 + len > buf.length) {
        throw new Error("Truncated TAG_STR content");
      }
      const str = buf.toString("utf-8", offset + 5, offset + 5 + len);
      return { value: str, bytesConsumed: 5 + len };
    }

    case TAG_INT: {
      // Layout: [1 byte tag] [8 bytes i64 (LE)]
      if (offset + 9 > buf.length) {
        throw new Error("Truncated TAG_INT buffer");
      }
      const val = buf.readBigInt64LE(offset + 1);
      return { value: Number(val), bigInt: val, bytesConsumed: 9 };
    }

    case TAG_DBL: {
      // Layout: [1 byte tag] [8 bytes f64 (LE)]
      if (offset + 9 > buf.length) {
        throw new Error("Truncated TAG_DBL buffer");
      }
      const val = buf.readDoubleLE(offset + 1);
      return { value: val, bytesConsumed: 9 };
    }

    case TAG_ARR: {
      // Layout: [1 byte tag] [4 bytes count (LE)] [count serialized values...]
      if (offset + 5 > buf.length) {
        throw new Error("Truncated TAG_ARR header");
      }
      const count = buf.readUInt32LE(offset + 1);
      let pos = offset + 5;
      const items = [];

      for (let i = 0; i < count; i++) {
        const itemResult = parseValue(buf, pos);
        items.push(itemResult.value);
        pos += itemResult.bytesConsumed;
      }

      return { value: items, bytesConsumed: pos - offset };
    }

    default:
      throw new Error(`Unknown serialization tag: ${tag}`);
  }
}

/**
 * Custom TCP client for the C++ Redis server with full Pub/Sub support.
 */
export class CustomRedisClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.tlsOptions = options.tls || null;
    this.path = options.path || null;
    this.host = options.host || process.env.REDIS_HOST || "127.0.0.1";
    this.port = parseInt(options.port || process.env.REDIS_PORT || "1234", 10);
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.name = options.name || "RedisClient";

    this.socket = null;
    this.connected = false;
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.buffer = Buffer.alloc(0);

    // Queue for command/response request pairs
    this.pendingRequests = [];

    // Tracks subscribed channels for automatic re-subscription upon reconnect
    this.subscriptions = new Set();
  }

  connect() {
  if (this.connected || this.isConnecting) {
    return Promise.resolve();
  }

  this.isConnecting = true;

  return new Promise((resolve, reject) => {
    // TLS sockets are ready on "secureConnect"; plain sockets on "connect"
    const useTls = !!this.tlsOptions && !this.path;
    const readyEvent = useTls ? "secureConnect" : "connect";

    const onInitialConnect = () => {
      cleanup();
      this._onConnected();
      resolve();
    };

    const onInitialError = (err) => {
      cleanup();
      this.isConnecting = false;
      this._scheduleReconnect();
      reject(err);
    };

    const cleanup = () => {
      if (this.socket) {
        this.socket.removeListener(readyEvent, onInitialConnect);
        this.socket.removeListener("error", onInitialError);
      }
    };

    if (this.path) {
      this.socket = net.createConnection({ path: this.path });
    } else if (useTls) {
      this.socket = tls.connect({
        host: this.host,
        port: this.port,
        servername: this.host,
        ...this.tlsOptions,
      });
    } else {
      this.socket = net.createConnection({ host: this.host, port: this.port });
    }

    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true, 30000);

    this.socket.once(readyEvent, onInitialConnect);
    this.socket.once("error", onInitialError);

    this.socket.on("data", (chunk) => this._onData(chunk));
    this.socket.on("error", (err) => this._onError(err));
    this.socket.on("close", () => this._onClose());
  });
}


  _onConnected() {
    this.connected = true;
    this.isConnecting = false;
    this.buffer = Buffer.alloc(0);

    // Resubscribe to existing subscriptions if this is a reconnection
    if (this.subscriptions.size > 0) {
      const channels = Array.from(this.subscriptions);
      const frame = encodeRequest(["subscribe", ...channels]);
      this.socket.write(frame);
    }

    this.emit("connect");
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const bodyLen = this.buffer.readUInt32LE(0);
      if (bodyLen > 1024 * 1024) {
        this.emit("error", new Error("Incoming frame exceeds 1MB safety limit"));
        this.disconnect();
        return;
      }

      if (this.buffer.length < 4 + bodyLen) {
        // Wait for more data
        break;
      }

      const body = this.buffer.subarray(4, 4 + bodyLen);
      this.buffer = this.buffer.subarray(4 + bodyLen);

      try {
        const result = parseValue(body, 0);
        this._handleDecodedValue(result);
      } catch (err) {
        this.emit("error", new Error(`Failed to decode Redis frame: ${err.message}`));
      }
    }
  }

  _handleDecodedValue(result) {
    const val = result.value;

    // Check if response is a PubSub array
    if (Array.isArray(val) && val.length >= 2) {
      const eventType = String(val[0]);

      if (eventType === "message" && val.length >= 3) {
        // PUSH MESSAGE: ["message", "<channel>", "<payload>"]
        const channel = String(val[1]);
        const payload = String(val[2]);
        this.emit("message", channel, payload);
        return;
      }

      if (eventType === "subscribe") {
        // SUBSCRIBE ACK: ["subscribe", "<channel>", count]
        const channel = String(val[1]);
        const count = val[2];
        this.subscriptions.add(channel);
        this.emit("subscribe", channel, count);

        // Resolve any pending subscribe promise
        if (this.pendingRequests.length > 0 && this.pendingRequests[0].cmd === "subscribe") {
          const req = this.pendingRequests.shift();
          req.resolve({ channel, count });
        }
        return;
      }

      if (eventType === "unsubscribe") {
        // UNSUBSCRIBE ACK: ["unsubscribe", "<channel>", count]
        const channel = String(val[1]);
        const count = val[2];
        this.subscriptions.delete(channel);
        this.emit("unsubscribe", channel, count);

        if (this.pendingRequests.length > 0 && this.pendingRequests[0].cmd === "unsubscribe") {
          const req = this.pendingRequests.shift();
          req.resolve({ channel, count });
        }
        return;
      }
    }

    // Standard command-response resolution
    if (this.pendingRequests.length > 0) {
      const req = this.pendingRequests.shift();
      if (result.isError) {
        req.reject(result.value);
      } else {
        req.resolve(val);
      }
    }
  }

  _onError(err) {
    this.emit("error", err);
  }

  _onClose() {
    this.connected = false;
    this.isConnecting = false;
    this.buffer = Buffer.alloc(0);

    // Reject all pending in-flight requests
    while (this.pendingRequests.length > 0) {
      const req = this.pendingRequests.shift();
      req.reject(new Error("Connection closed before response received"));
    }

    this.emit("close");

    if (this.autoReconnect) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.reconnectDelay);
  }

  /**
   * Send a general command array and wait for response.
   */
  sendCommand(cmd) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error("Client is not connected to Redis server"));
    }

    return new Promise((resolve, reject) => {
      try {
        const frame = encodeRequest(cmd);
        this.pendingRequests.push({ resolve, reject, cmd: cmd[0] });
        this.socket.write(frame);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Publish a message to a channel.
   * Resolves to the receiver count (int).
   */
  publish(channel, message) {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    return this.sendCommand(["publish", channel, payload]);
  }

  /**
   * Subscribe to one or more channels.
   */
  subscribe(channel) {
    if (!this.connected || !this.socket) {
      this.subscriptions.add(channel);
      return Promise.resolve();
    }

    this.subscriptions.add(channel);
    return this.sendCommand(["subscribe", channel]);
  }

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(channel) {
    this.subscriptions.delete(channel);
    if (!this.connected || !this.socket) {
      return Promise.resolve();
    }
    return this.sendCommand(["unsubscribe", channel]);
  }

  /**
   * Gracefully close the connection.
   */
  disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.isConnecting = false;
  }
}
