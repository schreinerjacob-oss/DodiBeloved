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
const userPairings = new Map<string, string>(); // userId -> partnerId

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
              console.log('User registered:', userId, 'Total connected:', connectedClients.size);
            }
            break;

          case 'partner-joined':
            // When a partner completes pairing, notify the creator
            const partnerId = message.data.partnerId;
            const joinedUserId = message.data.joinedUserId;
            
            // Store the pairing relationship
            userPairings.set(partnerId, joinedUserId);
            userPairings.set(joinedUserId, partnerId);
            
            // Send notification to the creator that partner joined
            broadcast(partnerId, {
              type: 'partner-joined',
              data: { joinedUserId },
            });
            break;

          case 'message':
            console.log('Server received message:', { 
              senderId: message.data.senderId, 
              recipientId: message.data.recipientId,
              messageId: message.data.id,
              connectedClientsCount: connectedClients.size,
              connectedClientIds: Array.from(connectedClients.keys()),
            });
            const savedMessage = await storage.saveMessage(message.data);
            console.log('Message saved, attempting to broadcast to:', message.data.recipientId);
            broadcast(message.data.recipientId, {
              type: 'message',
              data: savedMessage,
            });
            break;

          case 'memory':
            console.log('Server received memory:', {
              memoryId: message.data.id,
              userId: message.data.userId,
              partnerId: message.data.partnerId,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.partnerId, {
              type: 'memory',
              data: message.data,
            });
            break;

          case 'calendar':
            console.log('Server received calendar event:', {
              eventId: message.data.id,
              userId: message.data.userId,
              partnerId: message.data.partnerId,
              title: message.data.title,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.partnerId, {
              type: 'calendar',
              data: message.data,
            });
            break;

          case 'ritual':
            console.log('Server received ritual:', {
              ritualId: message.data.id,
              userId: message.data.userId,
              partnerId: message.data.partnerId,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.partnerId, {
              type: 'ritual',
              data: message.data,
            });
            break;

          case 'letter':
            console.log('Server received letter:', {
              letterId: message.data.id,
              authorId: message.data.authorId,
              recipientId: message.data.recipientId,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.recipientId, {
              type: 'letter',
              data: message.data,
            });
            break;

          case 'reaction':
            console.log('Server received reaction:', {
              reactionId: message.data.id,
              senderId: message.data.senderId,
              recipientId: message.data.recipientId,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.recipientId, {
              type: 'reaction',
              data: message.data,
            });
            break;

          case 'prayer':
            console.log('Server received prayer:', {
              prayerId: message.data.id,
              userId: message.data.userId,
              partnerId: message.data.partnerId,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.partnerId, {
              type: 'prayer',
              data: message.data,
            });
            break;

          case 'future-letter':
            console.log('Server received future letter:', {
              letterId: message.data.id,
              authorId: message.data.authorId,
              recipientId: message.data.recipientId,
            });
            // For peer-to-peer sync, just forward to partner without server storage
            broadcast(message.data.recipientId, {
              type: 'future-letter',
              data: message.data,
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

          case 'request-history':
            // Forward history request to partner (peer-to-peer)
            if (userId) {
              const partnerId = userPairings.get(userId);
              if (partnerId) {
                console.log('Forwarding history request from', userId, 'to partner', partnerId);
                broadcast(partnerId, {
                  type: 'request-history',
                  data: message.data,
                });
              }
            }
            break;

          case 'history-response':
            // Forward history response to partner (peer-to-peer)
            if (userId) {
              const partnerId = userPairings.get(userId);
              if (partnerId) {
                console.log('Forwarding history response from', userId, 'to partner', partnerId);
                broadcast(partnerId, {
                  type: 'history-response',
                  data: message.data,
                });
              }
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
    console.log('Broadcast attempt:', { 
      recipientId, 
      messageType: message.type,
      clientExists: !!client,
      clientState: client?.readyState,
      wsOpenState: WebSocket.OPEN 
    });
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
        console.log('Message broadcast successfully to:', recipientId);
      } catch (error) {
        console.error('Broadcast send error:', error);
      }
    } else {
      console.warn('Could not broadcast - client not found or not open:', { recipientId, exists: !!client, state: client?.readyState });
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
