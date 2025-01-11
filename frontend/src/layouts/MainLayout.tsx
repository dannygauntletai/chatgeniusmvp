import { ReactNode } from 'react';
import { ChannelList } from '../features/channels/components/ChannelList';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => (
  <div className="h-screen flex">
    <aside className="w-64 border-r bg-white">
      <ChannelList />
    </aside>
    <main className="flex-1 flex flex-col">
      {children}
    </main>
  </div>
); 