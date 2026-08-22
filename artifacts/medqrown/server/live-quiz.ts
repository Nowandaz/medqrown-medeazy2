import type { Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import crypto from "crypto";

type Ticket = { studentId: number; roomId: number; expiresAt: number };
const tickets = new Map<string, Ticket>();
const sockets = new Map<number, Set<WebSocket>>();

export function issueLiveQuizTicket(studentId: number, roomId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  tickets.set(token, { studentId, roomId, expiresAt: Date.now() + 60_000 });
  return token;
}

export function broadcastLiveQuiz(roomId: number, event: unknown) {
  const roomSockets = sockets.get(roomId);
  if (!roomSockets) return;
  const message = JSON.stringify(event);
  for (const socket of roomSockets) {
    if (socket.readyState === socket.OPEN) socket.send(message);
  }
}

export function attachLiveQuizWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/ws/live-quiz") return;
    const token = url.searchParams.get("ticket") || "";
    const ticket = tickets.get(token);
    if (!ticket || ticket.expiresAt < Date.now()) {
      socket.destroy();
      return;
    }
    tickets.delete(token);
    wss.handleUpgrade(request, socket, head, (ws) => {
      const roomSockets = sockets.get(ticket.roomId) || new Set<WebSocket>();
      roomSockets.add(ws);
      sockets.set(ticket.roomId, roomSockets);
      ws.on("message", (raw) => {
        try {
          const message = JSON.parse(String(raw));
          if (message.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
        } catch {
          // Ignore malformed client messages; state changes only happen through REST.
        }
      });
      ws.on("close", () => {
        roomSockets.delete(ws);
        if (!roomSockets.size) sockets.delete(ticket.roomId);
      });
      ws.send(JSON.stringify({ type: "connected", roomId: ticket.roomId, studentId: ticket.studentId }));
    });
  });
}