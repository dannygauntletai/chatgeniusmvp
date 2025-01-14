import { useState, useEffect, useCallback } from 'react';
import { ThreadService } from '../services/thread.service';
import { ThreadState, ThreadMessageInput } from '../features/threads/types/thread.types';
import { Message } from '../features/messages/types/message.types';
import { socket } from '../services/socket.service';
import { useUserContext } from '../contexts/UserContext';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export const useThread = (messageId?: string, shouldLoad: boolean = false, initialParentMessage?: Message) => {
  const { userId, username } = useUserContext();
  const [state, setState] = useState<ThreadState>({
    isLoading: false,
    error: undefined,
    activeThread: initialParentMessage ? {
      parentMessage: initialParentMessage,
      replies: [],
      replyCount: 0,
      lastReply: undefined
    } : undefined
  });

  const [hasUnreadReplies, setHasUnreadReplies] = useState(false);

  const loadThreadMessages = useCallback(async () => {
    if (!messageId) return;

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: undefined
    }));

    try {
      const messages = await ThreadService.getThreadMessages(messageId);
      setState(prev => ({
        ...prev,
        isLoading: false,
        activeThread: {
          parentMessage: messages[0],
          replies: messages.slice(1),
          replyCount: messages.length - 1,
          lastReply: messages.length > 1 ? messages[messages.length - 1] : undefined
        }
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Unable to load thread',
        activeThread: initialParentMessage ? {
          parentMessage: initialParentMessage,
          replies: [],
          replyCount: 0,
          lastReply: undefined
        } : undefined
      }));
    }
  }, [messageId, initialParentMessage]);

  useEffect(() => {
    if (shouldLoad && messageId) {
      loadThreadMessages();
    }
  }, [messageId, shouldLoad, loadThreadMessages]);

  useEffect(() => {
    if (!messageId) return;

    const handleNewMessage = (message: Message) => {
      // If this is the parent message being created
      if (message.id === messageId) {
        setState(prev => ({
          ...prev,
          activeThread: {
            parentMessage: message,
            replies: prev.activeThread?.replies || [],
            replyCount: prev.activeThread?.replyCount || 0,
            lastReply: prev.activeThread?.lastReply
          },
          error: undefined
        }));
        // Load any existing replies
        loadThreadMessages();
      }
      // If this is a reply to our thread
      else if (message.threadId === messageId) {
        setState(prev => {
          if (!prev.activeThread) return prev;
          
          // Only check for duplicates if this message is from the current user
          if (message.userId === userId) {
            // Check if we already have a temporary message with this content
            const hasTempMessage = prev.activeThread.replies.some(
              reply => reply.content === message.content && reply.id.startsWith('temp-')
            );

            // If we have a temp message, don't add the real one yet - it will be replaced
            if (hasTempMessage) {
              return prev;
            }
          }

          const newReplies = [...prev.activeThread.replies, message];
          return {
            ...prev,
            activeThread: {
              ...prev.activeThread,
              replies: newReplies,
              replyCount: newReplies.length,
              lastReply: message
            }
          };
        });
      }
    };

    socket.on('thread:message_created', handleNewMessage);

    return () => {
      socket.off('thread:message_created', handleNewMessage);
    };
  }, [messageId, loadThreadMessages]);

  const createThreadMessage = async (data: ThreadMessageInput) => {
    // Create a temporary message
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content: data.content,
      userId,
      user: {
        id: userId,
        username
      },
      channelId: state.activeThread?.parentMessage.channelId || '',
      threadId: data.parentMessageId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reactions: {}
    };

    // Add the temporary message to the thread
    setState(prev => {
      if (!prev.activeThread) return prev;
      const newReplies = [...prev.activeThread.replies, tempMessage];
      return {
        ...prev,
        activeThread: {
          ...prev.activeThread,
          replies: newReplies,
          replyCount: newReplies.length,
          lastReply: tempMessage
        }
      };
    });

    try {
      const message = await ThreadService.createThreadMessage(data);
      // Update the temporary message with the real one
      setState(prev => {
        if (!prev.activeThread) return prev;
        const newReplies = prev.activeThread.replies.map(reply => 
          reply.id === tempMessage.id ? message : reply
        );
        return {
          ...prev,
          activeThread: {
            ...prev.activeThread,
            replies: newReplies,
            replyCount: newReplies.length,
            lastReply: message
          }
        };
      });
      return message;
    } catch (error) {
      // Remove the temporary message on error
      setState(prev => {
        if (!prev.activeThread) return prev;
        const newReplies = prev.activeThread.replies.filter(reply => 
          reply.id !== tempMessage.id
        );
        return {
          ...prev,
          activeThread: {
            ...prev.activeThread,
            replies: newReplies,
            replyCount: newReplies.length,
            lastReply: newReplies[newReplies.length - 1]
          },
          error: 'Failed to create thread message'
        };
      });
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