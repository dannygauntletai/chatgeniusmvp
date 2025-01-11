import { MainLayout } from './layouts/MainLayout';
import { MessageList } from './features/messages/components/MessageList';
import { MessageInput } from './features/messages/components/MessageInput';
import { ChannelProvider } from './features/channels/context/ChannelContext';
import { UserProvider } from './contexts/UserContext';

export const App = () => {
  // Temporary hardcoded values until we implement auth
  const tempChannelId = 'test-channel';
  const tempUserId = 'test-user-id';

  return (
    <UserProvider>
      <ChannelProvider>
        <MainLayout>
          <div className="flex flex-col h-full">
            <MessageList channelId={tempChannelId} />
            <MessageInput channelId={tempChannelId} userId={tempUserId} />
          </div>
        </MainLayout>
      </ChannelProvider>
    </UserProvider>
  );
}; 