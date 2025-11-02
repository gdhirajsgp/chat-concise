import { useEffect, useCallback, useRef } from 'react';

export type BroadcastMessage = {
  type: 'recording-start' | 'recording-stop' | 'transcript-update' | 'summary-update' | 'recording-time' | 'ensure-windows' | 'bring-main';
  payload?: any;
};

export function useBroadcastChannel(channelName: string, onMessage?: (message: BroadcastMessage) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel !== 'undefined') {
      channelRef.current = new BroadcastChannel(channelName);

      if (onMessage) {
        channelRef.current.onmessage = (event) => {
          onMessage(event.data);
        };
      }
    } else {
      // Fallback to localStorage events for older browsers
      const handleStorageEvent = (e: StorageEvent) => {
        if (e.key === channelName && e.newValue && onMessage) {
          try {
            const message = JSON.parse(e.newValue);
            onMessage(message);
          } catch (error) {
            console.error('Failed to parse broadcast message:', error);
          }
        }
      };

      window.addEventListener('storage', handleStorageEvent);
      return () => window.removeEventListener('storage', handleStorageEvent);
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, [channelName, onMessage]);

  const postMessage = useCallback((message: BroadcastMessage) => {
    if (channelRef.current) {
      channelRef.current.postMessage(message);
    } else {
      // Fallback to localStorage
      localStorage.setItem(channelName, JSON.stringify(message));
      // Clear immediately to allow same message to be sent again
      setTimeout(() => localStorage.removeItem(channelName), 100);
    }
  }, [channelName]);

  return { postMessage };
}
