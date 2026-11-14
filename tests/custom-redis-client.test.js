import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeRequest, parseValue } from "../src/redis/customRedisClient.js";

describe("Custom Redis Client Binary Protocol Tests", () => {
  it("should encode a command array into a valid length-prefixed binary frame", () => {
    const cmd = ["publish", "news", "hello world"];
    const frame = encodeRequest(cmd);

    // Frame must start with 4-byte body_len (LE)
    assert.ok(frame.length >= 4);
    const bodyLen = frame.readUInt32LE(0);
    assert.equal(frame.length, 4 + bodyLen);

    // Body starts with 4-byte nstr (LE) = 3
    const nstr = frame.readUInt32LE(4);
    assert.equal(nstr, 3);

    // First string: "publish" (len 7)
    const len1 = frame.readUInt32LE(8);
    assert.equal(len1, 7);
    const str1 = frame.toString("utf-8", 12, 12 + len1);
    assert.equal(str1, "publish");
  });

  it("should parse TAG_NIL correctly", () => {
    const buf = Buffer.from([0x00]); // TAG_NIL
    const result = parseValue(buf, 0);
    assert.equal(result.value, null);
    assert.equal(result.bytesConsumed, 1);
  });

  it("should parse TAG_STR correctly", () => {
    const text = "hello redis";
    const textBuf = Buffer.from(text, "utf-8");
    const buf = Buffer.alloc(1 + 4 + textBuf.length);
    buf[0] = 0x02; // TAG_STR
    buf.writeUInt32LE(textBuf.length, 1);
    textBuf.copy(buf, 5);

    const result = parseValue(buf, 0);
    assert.equal(result.value, "hello redis");
    assert.equal(result.bytesConsumed, 5 + textBuf.length);
  });

  it("should parse TAG_INT correctly", () => {
    const buf = Buffer.alloc(1 + 8);
    buf[0] = 0x03; // TAG_INT
    buf.writeBigInt64LE(42n, 1);

    const result = parseValue(buf, 0);
    assert.equal(result.value, 42);
    assert.equal(result.bytesConsumed, 9);
  });

  it("should parse TAG_ERR correctly with embedded TAG_STR", () => {
    const msg = "Unknown command";
    const msgBuf = Buffer.from(msg, "utf-8");
    const buf = Buffer.alloc(1 + 4 + 1 + 4 + msgBuf.length);
    buf[0] = 0x01; // TAG_ERR
    buf.writeUInt32LE(404, 1); // code
    buf[5] = 0x02; // TAG_STR
    buf.writeUInt32LE(msgBuf.length, 6);
    msgBuf.copy(buf, 10);

    const result = parseValue(buf, 0);
    assert.equal(result.isError, true);
    assert.equal(result.code, 404);
    assert.match(result.value.message, /Unknown command/);
    assert.equal(result.bytesConsumed, 10 + msgBuf.length);
  });

  it("should parse Pub/Sub pushed message array ['message', channel, payload]", () => {
    // Array with 3 elements: TAG_ARR (5) count=3
    // Item 0: TAG_STR "message"
    // Item 1: TAG_STR "chat:events"
    // Item 2: TAG_STR "{\"foo\":\"bar\"}"

    const parts = [Buffer.from([0x05])]; // TAG_ARR
    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32LE(3, 0);
    parts.push(countBuf);

    const encodeStrItem = (s) => {
      const sBuf = Buffer.from(s, "utf-8");
      const h = Buffer.alloc(5);
      h[0] = 0x02; // TAG_STR
      h.writeUInt32LE(sBuf.length, 1);
      return Buffer.concat([h, sBuf]);
    };

    parts.push(encodeStrItem("message"));
    parts.push(encodeStrItem("chat:events"));
    parts.push(encodeStrItem('{"foo":"bar"}'));

    const fullBuf = Buffer.concat(parts);
    const result = parseValue(fullBuf, 0);

    assert.ok(Array.isArray(result.value));
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0], "message");
    assert.equal(result.value[1], "chat:events");
    assert.equal(result.value[2], '{"foo":"bar"}');
  });
});
