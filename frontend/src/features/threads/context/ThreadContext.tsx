import React, { createContext, useContext, useState, useEffect } from 'react';
import { Message } from '../../messages/types/message.types';
import { socket } from '../../../services/socket.service';

interface ThreadContextType {
  activeThreadId: string | null;
  activeThreadMessage: Message | null;
  openThread: (messageId: string, message: Message) => void;
  closeThread: () => void;
  isThreadOpen: boolean;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export const ThreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadMessage, setActiveThreadMessage] = useState<Message | null>(null);
  const [isThreadOpen, setIsThreadOpen] = useState(false);

  const openThread = (messageId: string, message: Message) => {
    setActiveThreadId(messageId);
    setActiveThreadMessage(message);
    setIsThreadOpen(true);
  };

  const closeThread = () => {
    setActiveThreadId(null);
    setActiveThreadMessage(null);
    setIsThreadOpen(false);
  };

  // Listen for real-time thread updates
  useEffect(() => {
    if (!socket || !activeThreadId) return;

    const handleThreadMessage = (message: Message) => {
      if (message.threadId === activeThreadId) {
        // The thread view will handle adding the message to its list
        // since it's listening to the same event
      }
    };

    socket.on('thread:message_created', handleThreadMessage);
    return () => {
      socket.off('thread:message_created', handleThreadMessage);
    };
  }, [activeThreadId]);

  return (
    <ThreadContext.Provider value={{ 
      activeThreadId, 
      activeThreadMessage, 
      openThread, 
      closeThread,
      isThreadOpen
    }}>
      {children}
    </ThreadContext.Provider>
  );
};

export const useThread = () => {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error('useThread must be used within a ThreadProvider');
  }
  return context;
};

// Re-export for convenience
export { ThreadContext }; 