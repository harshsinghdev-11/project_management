export const ChatEventEnum = Object.freeze({
  CONNECTED_EVENT: "connected",
  DISCONNECT_EVENT: "disconnect",
  JOIN_CHAT_EVENT: "joinChat",
  LEAVE_CHAT_EVENT: "leaveChat",
  SEND_MESSAGE_EVENT: "sendMessage",
  MESSAGE_RECEIVED_EVENT: "messageReceived",
  TYPING_EVENT: "typing",
  STOP_TYPING_EVENT: "stopTyping",
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
