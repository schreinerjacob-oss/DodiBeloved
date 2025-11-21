import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import {
  insertMessageSchema,
  insertMemorySchema,
  insertCalendarEventSchema,
  insertDailyRitualSchema,
  insertLoveLetterSchema,
  insertReactionSchema,
} from "@shared/schema";

interface WSMessage {
  type: string;
  data: any;
}

const connectedClients = new Map<string, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;

    ws.on('message', async (rawMessage: string) => {
      try {
        const message: WSMessage = JSON.parse(rawMessage.toString());

        switch (message.type) {
          case 'register':
            userId = message.data.userId;
            if (userId) {
              connectedClients.set(userId, ws);
            }
            break;

          case 'message':
            const savedMessage = await storage.saveMessage(message.data);
            broadcast(message.data.recipientId, {
              type: 'message',
              data: savedMessage,
            });
            break;

          case 'memory':
            const savedMemory = await storage.saveMemory(message.data);
            broadcast(message.data.partnerId, {
              type: 'memory',
              data: savedMemory,
            });
            break;

          case 'calendar':
            const savedEvent = await storage.saveCalendarEvent(message.data);
            broadcast(message.data.partnerId, {
              type: 'calendar',
              data: savedEvent,
            });
            break;

          case 'ritual':
            const savedRitual = await storage.saveDailyRitual(message.data);
            broadcast(message.data.partnerId, {
              type: 'ritual',
              data: savedRitual,
            });
            break;

          case 'letter':
            const savedLetter = await storage.saveLoveLetter(message.data);
            broadcast(message.data.recipientId, {
              type: 'letter',
              data: savedLetter,
            });
            break;

          case 'reaction':
            const savedReaction = await storage.saveReaction(message.data);
            broadcast(message.data.recipientId, {
              type: 'reaction',
              data: savedReaction,
            });
            break;

          case 'sync':
            const allData = {
              messages: await storage.getAllMessages(),
              memories: await storage.getAllMemories(),
              calendarEvents: await storage.getAllCalendarEvents(),
              dailyRituals: await storage.getAllDailyRituals(),
              loveLetters: await storage.getAllLoveLetters(),
            };
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'sync-response',
                data: allData,
              }));
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      if (userId) {
        connectedClients.delete(userId);
      }
    });
  });

  function broadcast(recipientId: string, message: WSMessage) {
    const client = connectedClients.get(recipientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/messages', async (req, res) => {
    const messages = await storage.getAllMessages();
    res.json(messages);
  });

  app.get('/api/memories', async (req, res) => {
    const memories = await storage.getAllMemories();
    res.json(memories);
  });

  app.get('/api/calendar', async (req, res) => {
    const events = await storage.getAllCalendarEvents();
    res.json(events);
  });

  app.get('/api/rituals', async (req, res) => {
    const rituals = await storage.getAllDailyRituals();
    res.json(rituals);
  });

  app.get('/api/letters', async (req, res) => {
    const letters = await storage.getAllLoveLetters();
    res.json(letters);
  });

  app.get('/api/reactions', async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const reactions = await storage.getRecentReactions(limit);
    res.json(reactions);
  });

  return httpServer;
}
