import { useState, useEffect } from 'react';
import { Message } from '../features/messages/types/message.types';
import { MessageService } from '../services/message.service';
import { socket } from '../services/socket.service';

export const useMessages = (channelId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const data = await MessageService.getChannelMessages(channelId);
        setMessages(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch messages'));
      } finally {
        setLoading(false);
      }
    };

    socket.emit('channel:join', channelId);
    fetchMessages();

    const handleNewMessage = (message: Message) => {
      setMessages((prev) => [...prev, message]);
    };

    socket.on('message:created', handleNewMessage);

    return () => {
      socket.off('message:created', handleNewMessage);
      socket.emit('channel:leave', channelId);
    };
  }, [channelId]);

  return { messages, loading, error };
}; 