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

  const createThreadMessage = async (data: ThreadMessageInput) => {
    try {
      const message = await ThreadService.createThreadMessage(data);
      return message;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to create thread message'
      }));
      throw error;
    }
  };

  useEffect(() => {
    if (!socket || !messageId) return;

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
        // Set unread flag if the thread view is not active
        if (!document.hasFocus()) {
          setHasUnreadReplies(true);
          // Show browser notification if permitted
          if (Notification.permission === 'granted') {
            new Notification('New Thread Reply', {
              body: `${message.user.username}: ${message.content}`,
            });
          }
        }
      }
    };

    socket.on('thread:message_created', handleNewMessage);
    return () => {
      socket.off('thread:message_created', handleNewMessage);
    };
  }, [socket, messageId]);

  useEffect(() => {
    if (messageId && shouldLoad) {
      loadThreadMessages();
    }
  }, [messageId, shouldLoad, loadThreadMessages]);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return {
    ...state,
    hasUnreadReplies,
    createThreadMessage,
    loadThreadMessages,
    markAsRead: () => setHasUnreadReplies(false)
  };
}; 