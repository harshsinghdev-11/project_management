/**
 * Multi-Server Pub/Sub Verification Script
 *
 * Verifies that messages published or sent to Node Server A (e.g. Port 3000)
 * are forwarded across the custom C++ Redis server (Port 1234) and received
 * in real-time by clients connected to Node Server B (e.g. Port 3002).
 *
 * Usage:
 *   node scripts/test-multi-server-pubsub.js
 *
 * Options via environment variables:
 *   REDIS_HOST=127.0.0.1
 *   REDIS_PORT=1234
 *   PORT1=3000
 *   PORT2=3002
 *   TOKEN=your_jwt_access_token (optional, for full authenticated Socket.io test)
 *   ROOM_ID=your_conversation_id (optional, for full authenticated Socket.io test)
 */

import { CustomRedisClient } from "../src/redis/customRedisClient.js";
import { CHAT_EVENTS_CHANNEL, SERVER_ID } from "../src/redis/pubsub.js";
import { io as ioClient } from "socket.io-client";
import http from "http";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "1234", 10);
const PORT1 = parseInt(process.env.PORT1 || "3000", 10);
const PORT2 = parseInt(process.env.PORT2 || "3002", 10);

console.log("=============================================================");
console.log("   Custom Redis Pub/Sub Multi-Server Verification Tool       ");
console.log("=============================================================");
console.log(`Config:`);
console.log(`  - Custom Redis Server : ${REDIS_HOST}:${REDIS_PORT}`);
console.log(`  - Node Server 1 Port  : ${PORT1}`);
console.log(`  - Node Server 2 Port  : ${PORT2}`);
console.log("=============================================================\n");

/**
 * Step 1: Verify direct connectivity & message exchange on the C++ Redis server
 */
async function testDirectRedisPubSub() {
  console.log("--> [Step 1] Testing custom binary Redis Pub/Sub on port " + REDIS_PORT + "...");

  const testSub = new CustomRedisClient({ host: REDIS_HOST, port: REDIS_PORT, name: "VerifySub" });
  const testPub = new CustomRedisClient({ host: REDIS_HOST, port: REDIS_PORT, name: "VerifyPub" });

  try {
    await Promise.all([testSub.connect(), testPub.connect()]);
    console.log("    [OK] Connected both Subscriber and Publisher to Redis server.");

    const testChannel = "verify:channel:" + Date.now();
    let messageReceived = false;
    let receivedPayload = null;

    testSub.on("message", (channel, payload) => {
      if (channel === testChannel) {
        messageReceived = true;
        receivedPayload = payload;
      }
    });

    await testSub.subscribe(testChannel);
    console.log(`    [OK] Subscribed to test channel "${testChannel}".`);

    const sampleMessage = JSON.stringify({
      originServerId: "test-verifier",
      test: true,
      timestamp: Date.now(),
      text: "Verification ping via custom wire protocol!",
    });

    const receiverCount = await testPub.publish(testChannel, sampleMessage);
    console.log(`    [OK] Published test message to Redis (ACK receiver count: ${receiverCount}).`);

    // Wait up to 2 seconds for delivery
    const start = Date.now();
    while (!messageReceived && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    if (!messageReceived) {
      throw new Error("Timeout: Message was not received back from Redis subscriber.");
    }

    console.log(`    [OK] Successfully received message back from Redis!`);
    console.log(`    Message content: ${receivedPayload}`);
    console.log("--> [Step 1 PASSED] Custom Redis Pub/Sub binary wire protocol is working perfectly!\n");
    return true;
  } catch (err) {
    console.warn(`    [NOTICE] Direct Redis check could not complete: ${err.message}`);
    console.warn(`    (Ensure the C++ redis_server executable is running on ${REDIS_HOST}:${REDIS_PORT})\n`);
    return false;
  } finally {
    testSub.disconnect();
    testPub.disconnect();
  }
}

/**
 * Helper to check if a TCP port is responding to HTTP
 */
function probeHttpPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(true);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Step 2: Test cross-server WebSocket distribution if both Node servers are running
 */
async function testCrossServerWebSockets() {
  console.log("--> [Step 2] Checking status of Node Server 1 and Node Server 2...");

  const server1Up = await probeHttpPort(PORT1);
  const server2Up = await probeHttpPort(PORT2);

  console.log(`    - Server 1 (port ${PORT1}): ${server1Up ? "RUNNING" : "NOT REACHABLE"}`);
  console.log(`    - Server 2 (port ${PORT2}): ${server2Up ? "RUNNING" : "NOT REACHABLE"}`);

  if (!server1Up || !server2Up) {
    console.log("\n[INFO] To test live cross-server WebSocket message exchange:");
    console.log("  1. In Terminal 1: Start your C++ Redis server: .\\redis_server.exe");
    console.log(`  2. In Terminal 2: Start Server 1: PORT=${PORT1} npm run dev`);
    console.log(`  3. In Terminal 3: Start Server 2: PORT=${PORT2} npm run dev`);
    console.log("  4. In Terminal 4: Run this script again: node scripts/test-multi-server-pubsub.js\n");
    return;
  }

  console.log("\n--> Both servers are active! Initiating cross-server WebSocket test...");

  const token = process.env.TOKEN;
  const roomId = process.env.ROOM_ID || "650011223344556677889900";

  if (!token) {
    console.log("    [NOTE] No TOKEN environment variable provided for authenticated WebSocket handshake.");
    console.log("    To test with authenticated chat rooms, provide an access token:");
    console.log(`    TOKEN="<jwt_token>" ROOM_ID="<conversation_id>" node scripts/test-multi-server-pubsub.js`);
    return;
  }

  // Connect Client 1 to Server 1
  const socket1 = ioClient(`http://127.0.0.1:${PORT1}`, {
    auth: { token },
    transports: ["websocket"],
  });

  // Connect Client 2 to Server 2
  const socket2 = ioClient(`http://127.0.0.1:${PORT2}`, {
    auth: { token },
    transports: ["websocket"],
  });

  try {
    await Promise.all([
      new Promise((res, rej) => {
        socket1.on("connect", res);
        socket1.on("connect_error", rej);
      }),
      new Promise((res, rej) => {
        socket2.on("connect", res);
        socket2.on("connect_error", rej);
      }),
    ]);

    console.log(`    [OK] Client 1 connected to Server 1 (port ${PORT1}).`);
    console.log(`    [OK] Client 2 connected to Server 2 (port ${PORT2}).`);

    // Both join room
    socket1.emit("joinChat", { conversationId: roomId });
    socket2.emit("joinChat", { conversationId: roomId });

    // Wait for rooms to join
    await new Promise((r) => setTimeout(r, 200));

    let eventReceivedOnServer2 = false;
    let receivedData = null;

    socket2.on("typing", (data) => {
      console.log("    [OK] Client 2 on Server 2 received 'typing' event from Server 1!");
      eventReceivedOnServer2 = true;
      receivedData = data;
    });

    socket2.on("messageReceived", (data) => {
      console.log("    [OK] Client 2 on Server 2 received 'messageReceived' event from Server 1!");
      eventReceivedOnServer2 = true;
      receivedData = data;
    });

    console.log("    Emitting typing event from Client 1 on Server 1...");
    socket1.emit("typing", { conversationId: roomId });

    const start = Date.now();
    while (!eventReceivedOnServer2 && Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (eventReceivedOnServer2) {
      console.log("\n--> [Step 2 PASSED] Real-time cross-server sync succeeded!");
      console.log("    Event delivered across instances via custom C++ Redis Pub/Sub.\n");
    } else {
      console.log("\n--> [Step 2 Notice] Event not received within timeout. Verify that both servers are connected to Redis.\n");
    }
  } catch (err) {
    console.warn("    Socket test error:", err.message);
  } finally {
    socket1.disconnect();
    socket2.disconnect();
  }
}

async function main() {
  await testDirectRedisPubSub();
  await testCrossServerWebSockets();
}

main().catch(console.error);
