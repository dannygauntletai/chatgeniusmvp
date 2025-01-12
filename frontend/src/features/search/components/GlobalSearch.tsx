import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import Highlighter from 'react-highlight-words';
import { useQuery } from '@tanstack/react-query';
import { searchService, SearchResult } from '../../../services/search.service';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import './GlobalSearch.module.css';

interface GlobalSearchProps {
  onOpenFileBrowser: (fileId?: string) => void;
}

export const GlobalSearch = ({ onOpenFileBrowser }: GlobalSearchProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  // Setup keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchService.searchAll(query),
    enabled: query.length > 0,
  });

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    if (result.type === 'message') {
      navigate(`/channels/${result.channelId}`, { state: { messageId: result.id } });
    } else if (result.type === 'file') {
      onOpenFileBrowser(result.id);
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-gray-1100 border-b border-gray-600">
        <button
          className="w-full px-4 py-2 text-sm text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
          onClick={() => setOpen(true)}
        >
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search messages and files... <span className="ml-auto opacity-60">⌘K</span>
          </div>
        </button>
      </div>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search messages and files"
      >
        <div className="fixed inset-0 z-50" aria-hidden="true">
          <div className="fixed inset-0 bg-gray-900/50" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 top-[15vh] mx-auto max-w-3xl">
            <div className="relative bg-gray-800 rounded-xl shadow-2xl overflow-hidden min-h-[400px] flex flex-col">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                className="w-full px-6 py-4 text-sm text-white bg-transparent border-b border-gray-700 focus:outline-none"
                placeholder="Search messages and files..."
                autoFocus
              />

              <Command.List className="flex-1 overflow-y-auto p-4 relative">
                {isLoading && (
                  <Command.Loading>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LoadingSpinner />
                    </div>
                  </Command.Loading>
                )}

                {!isLoading && query && results.length === 0 && (
                  <Command.Empty>
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                      No results found
                    </div>
                  </Command.Empty>
                )}

                {results.map((result) => (
                  <Command.Item
                    key={result.id}
                    value={result.title}
                    onSelect={() => handleSelect(result)}
                    className="px-4 py-3 my-1 rounded hover:bg-gray-700 cursor-pointer"
                  >
                    <div className="flex items-start space-x-3">
                      {result.type === 'message' ? (
                        <svg className="w-4 h-4 mt-1 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 mt-1 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-white truncate">
                            {result.type === 'message' ? result.channelName : result.title}
                          </span>
                          {result.type === 'message' && (
                            <span className="text-xs text-gray-400">
                              {new Date(result.timestamp!).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400 line-clamp-2">
                          <Highlighter
                            searchWords={[query]}
                            autoEscape={true}
                            textToHighlight={result.content}
                            highlightClassName="bg-yellow-500/30 text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </Command.Item>
                ))}
              </Command.List>
            </div>
          </div>
        </div>
      </Command.Dialog>
    </>
  );
}; 