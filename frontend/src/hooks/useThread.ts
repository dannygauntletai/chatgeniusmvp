import { useState, useEffect, useCallback } from 'react';
import { ThreadService } from '../services/thread.service';
import { ThreadState, ThreadMessageInput } from '../features/threads/types/thread.types';
import { Message } from '../features/messages/types/message.types';
import { socket } from '../services/socket.service';

export const useThread = (messageId?: string, shouldLoad: boolean = false) => {
  const [state, setState] = useState<ThreadState>({
    isLoading: false,
    error: undefined,
  });

  const [hasUnreadReplies, setHasUnreadReplies] = useState(false);

  const loadThreadMessages = useCallback(async () => {
    if (!messageId) return;

    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const messages = await ThreadService.getThreadMessages(messageId);
      setState(prev => ({
        ...prev,
        activeThread: {
          parentMessage: messages.find(m => m.id === messageId) || messages[0],
          replies: messages.filter(m => m.threadId === messageId),
          replyCount: messages.filter(m => m.threadId === messageId).length,
          lastReply: messages[messages.length - 1]
        },
        isLoading: false
      }));
      setHasUnreadReplies(false);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to load thread messages',
        isLoading: false
      }));
    }
  }, [messageId]);

  useEffect(() => {
    if (shouldLoad && messageId) {
      loadThreadMessages();
    }
  }, [messageId, shouldLoad, loadThreadMessages]);

  useEffect(() => {
    if (!messageId) return;

    const handleNewMessage = (message: Message) => {
      if (message.threadId === messageId) {
        setState(prev => {
          if (!prev.activeThread) return prev;
          return {
            ...prev,
            activeThread: {
              ...prev.activeThread,
              replies: [...prev.activeThread.replies, message],
              replyCount: prev.activeThread.replyCount + 1,
              lastReply: message
            }
          };
        });
      }
    };

    socket.on('message:created', handleNewMessage);

    return () => {
      socket.off('message:created', handleNewMessage);
    };
  }, [messageId]);

  const createThreadMessage = async (data: ThreadMessageInput) => {
    try {
      const message = await ThreadService.createThreadMessage(data);
      setState(prev => {
        if (!prev.activeThread) return prev;
        return {
          ...prev,
          activeThread: {
            ...prev.activeThread,
            replies: [...prev.activeThread.replies, message],
            replyCount: prev.activeThread.replyCount + 1,
            lastReply: message
          }
        };
      });
      return message;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to create thread message'
      }));
      throw error;
    }
  };

  return {
    ...state,
    hasUnreadReplies,
    createThreadMessage,
    loadThreadMessages
  };
}; 