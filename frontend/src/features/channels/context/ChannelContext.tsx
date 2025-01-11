import { createContext, useContext, useState, ReactNode } from 'react';
import { Channel } from '../../../types/channel.types';

interface ChannelContextType {
  activeChannel: Channel | null;
  setActiveChannel: (channel: Channel | null) => void;
}

const ChannelContext = createContext<ChannelContextType | undefined>(undefined);

export const ChannelProvider = ({ children }: { children: ReactNode }) => {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  return (
    <ChannelContext.Provider value={{ activeChannel, setActiveChannel }}>
      {children}
    </ChannelContext.Provider>
  );
};

export const useChannel = () => {
  const context = useContext(ChannelContext);
  if (context === undefined) {
    throw new Error('useChannel must be used within a ChannelProvider');
  }
  return context;
}; 