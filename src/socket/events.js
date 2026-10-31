export const ChatEventEnum = Object.freeze({
  // Emitted when a client successfully connects
  CONNECTED_EVENT: "connected",
  // Emitted when a client disconnects
  DISCONNECT_EVENT: "disconnect",
  // Emitted by the client to join a specific conversation room
  JOIN_CHAT_EVENT: "joinChat",
  // Emitted by the client to leave a specific conversation room
  LEAVE_CHAT_EVENT: "leaveChat",
  // Emitted by the client to send a real-time message
  SEND_MESSAGE_EVENT: "sendMessage",
  // Emitted by the server when a new message is received in the chat room
  MESSAGE_RECEIVED_EVENT: "messageReceived",
  // Emitted when a participant starts typing
  TYPING_EVENT: "typing",
  // Emitted when a participant stops typing
  STOP_TYPING_EVENT: "stopTyping",
  // Emitted when an error occurs during socket operations
  SOCKET_ERROR_EVENT: "socketError",
});

export const {
  CONNECTED_EVENT,
  DISCONNECT_EVENT,
  JOIN_CHAT_EVENT,
  LEAVE_CHAT_EVENT,
  SEND_MESSAGE_EVENT,
  MESSAGE_RECEIVED_EVENT,
  TYPING_EVENT,
  STOP_TYPING_EVENT,
  SOCKET_ERROR_EVENT,
} = ChatEventEnum;

export const AvailableChatEvents = Object.values(ChatEventEnum);
