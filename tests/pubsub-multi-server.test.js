import test from "node:test";
import assert from "node:assert/strict";
import net from "net";
import { CustomRedisClient, encodeRequest } from "../src/redis/customRedisClient.js";

/**
 * Creates a lightweight TCP mock server mimicking the custom C++ Redis binary protocol.
 */
function createMockRedisServer(target) {
  const subscribers = new Map(); // channel -> Set of sockets

  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= 4) {
        const bodyLen = buf.readUInt32LE(0);
        if (buf.length < 4 + bodyLen) break;

        const body = buf.subarray(4, 4 + bodyLen);
        buf = buf.subarray(4 + bodyLen);

        // Parse command: [4 bytes nstr] ([4 bytes len] [str])...
        const nstr = body.readUInt32LE(0);
        let pos = 4;
        const args = [];
        for (let i = 0; i < nstr; i++) {
          const len = body.readUInt32LE(pos);
          pos += 4;
          args.push(body.toString("utf-8", pos, pos + len));
          pos += len;
        }

        const cmd = (args[0] || "").toLowerCase();

        if (cmd === "subscribe") {
          const channel = args[1];
          if (!subscribers.has(channel)) {
            subscribers.set(channel, new Set());
          }
          subscribers.get(channel).add(socket);

          // Response: TAG_ARR (3 elements: ["subscribe", channel, 1])
          const strSubscribe = Buffer.from("subscribe", "utf-8");
          const strChannel = Buffer.from(channel, "utf-8");
          const payload = Buffer.concat([
            Buffer.from([5]), // TAG_ARR
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(3, 0); return b; })(),
            Buffer.from([2]), // TAG_STR
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(strSubscribe.length, 0); return b; })(),
            strSubscribe,
            Buffer.from([2]), // TAG_STR
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(strChannel.length, 0); return b; })(),
            strChannel,
            Buffer.from([3]), // TAG_INT
            (() => { const b = Buffer.alloc(8); b.writeBigInt64LE(1n, 0); return b; })(),
          ]);

          const frame = Buffer.concat([
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(payload.length, 0); return b; })(),
            payload,
          ]);
          socket.write(frame);
        } else if (cmd === "publish") {
          const channel = args[1];
          const message = args[2];
          const channelSubs = subscribers.get(channel) || new Set();

          // Push message frame to all subscribers on this channel:
          // TAG_ARR (3 elements: ["message", channel, message])
          const strMsgTag = Buffer.from("message", "utf-8");
          const strChan = Buffer.from(channel, "utf-8");
          const strPayload = Buffer.from(message, "utf-8");

          const pushBody = Buffer.concat([
            Buffer.from([5]), // TAG_ARR
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(3, 0); return b; })(),
            Buffer.from([2]),
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(strMsgTag.length, 0); return b; })(),
            strMsgTag,
            Buffer.from([2]),
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(strChan.length, 0); return b; })(),
            strChan,
            Buffer.from([2]),
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(strPayload.length, 0); return b; })(),
            strPayload,
          ]);

          const pushFrame = Buffer.concat([
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(pushBody.length, 0); return b; })(),
            pushBody,
          ]);

          let receiverCount = 0;
          for (const subSocket of channelSubs) {
            if (!subSocket.destroyed) {
              subSocket.write(pushFrame);
              receiverCount++;
            }
          }

          // Reply to publisher with receiver count: TAG_INT
          const ackBody = Buffer.concat([
            Buffer.from([3]), // TAG_INT
            (() => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(receiverCount), 0); return b; })(),
          ]);
          const ackFrame = Buffer.concat([
            (() => { const b = Buffer.alloc(4); b.writeUInt32LE(ackBody.length, 0); return b; })(),
            ackBody,
          ]);
          socket.write(ackFrame);
        }
      }
    });

    socket.on("close", () => {
      for (const subs of subscribers.values()) {
        subs.delete(socket);
      }
    });
  });

  return new Promise((resolve) => {
    if (typeof target === "string") {
      server.listen(target, () => resolve(server));
    } else {
      server.listen(target, "127.0.0.1", () => resolve(server));
    }
  });
}

test("Multi-Server Redis Pub/Sub integration", async (t) => {
  const isWin = process.platform === "win32";
  const pipePath = `\\\\.\\pipe\\mock-redis-${Date.now()}`;
  const target = isWin ? pipePath : 19234;
  const clientOpts = isWin ? { path: target } : { host: "127.0.0.1", port: target };

  const mockServer = await createMockRedisServer(target);

  t.after(() => {
    mockServer.close();
  });

  await t.test("Cross-server message distribution and local deduplication", async () => {
    try {
      const CHANNEL = "chat:events";
      const SERVER_A_ID = "server-uuid-aaa";
      const SERVER_B_ID = "server-uuid-bbb";

      // Setup Server A subscriber & publisher
      const subA = new CustomRedisClient({ ...clientOpts, name: "SubA" });
      const pubA = new CustomRedisClient({ ...clientOpts, name: "PubA" });

      // Setup Server B subscriber & publisher
      const subB = new CustomRedisClient({ ...clientOpts, name: "SubB" });
      const pubB = new CustomRedisClient({ ...clientOpts, name: "PubB" });

      await Promise.all([subA.connect(), pubA.connect(), subB.connect(), pubB.connect()]);

      const messagesReceivedByServerA = [];
      const messagesReceivedByServerB = [];

      // Simulate Server A's subscriber handler (with origin check)
      subA.on("message", (channel, rawMessage) => {
        if (channel !== CHANNEL) return;
        const packet = JSON.parse(rawMessage);
        if (packet.originServerId === SERVER_A_ID) {
          // Ignored by Server A (echo of own message)
          return;
        }
        messagesReceivedByServerA.push(packet);
      });

      // Simulate Server B's subscriber handler (with origin check)
      subB.on("message", (channel, rawMessage) => {
        if (channel !== CHANNEL) return;
        const packet = JSON.parse(rawMessage);
        if (packet.originServerId === SERVER_B_ID) {
          // Ignored by Server B
          return;
        }
        messagesReceivedByServerB.push(packet);
      });

      // Both servers subscribe to the channel
      await Promise.all([subA.subscribe(CHANNEL), subB.subscribe(CHANNEL)]);

      // Server A publishes a message
      const chatPacketFromA = {
        originServerId: SERVER_A_ID,
        roomId: "650011223344556677889900",
        event: "messageReceived",
        payload: {
          _id: "msg-12345",
          content: "Hello from Server A!",
          sender: { username: "alice" },
        },
        timestamp: Date.now(),
      };

      const countA = await pubA.publish(CHANNEL, JSON.stringify(chatPacketFromA));
      assert.equal(countA, 2, "Both subscribers should receive the message from Redis");

      // Wait a brief tick for network event loop
      await new Promise((res) => setTimeout(res, 50));

      // Server A should have ignored the message (it was the origin)
      assert.equal(messagesReceivedByServerA.length, 0, "Server A should drop its own echoed message");

      // Server B should have received and accepted the message
      assert.equal(messagesReceivedByServerB.length, 1, "Server B should have received the message from Server A");
      assert.equal(messagesReceivedByServerB[0].payload.content, "Hello from Server A!");
      assert.equal(messagesReceivedByServerB[0].roomId, "650011223344556677889900");

      // Now test Server B publishing to Server A
      const chatPacketFromB = {
        originServerId: SERVER_B_ID,
        roomId: "650011223344556677889900",
        event: "messageReceived",
        payload: {
          _id: "msg-67890",
          content: "Hi Alice, this is Bob on Server B!",
          sender: { username: "bob" },
        },
        timestamp: Date.now(),
      };

      const countB = await pubB.publish(CHANNEL, JSON.stringify(chatPacketFromB));
      assert.equal(countB, 2);

      await new Promise((res) => setTimeout(res, 50));

      // Server A should now have received the message from Server B
      assert.equal(messagesReceivedByServerA.length, 1, "Server A should have received the message from Server B");
      assert.equal(messagesReceivedByServerA[0].payload.content, "Hi Alice, this is Bob on Server B!");

      // Server B should still only have 1 message (its own wasn't added)
      assert.equal(messagesReceivedByServerB.length, 1, "Server B should drop its own echoed message");

      // Teardown clients
      subA.disconnect();
      pubA.disconnect();
      subB.disconnect();
      pubB.disconnect();
    } catch (err) {
      throw err;
    }
  });
});
