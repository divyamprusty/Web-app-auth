'use client'

import { useState, useEffect } from 'react';

// Type declarations for Chrome extension API
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (extensionId: string, message: any, callback?: (response: any) => void) => void;
        lastError?: { message: string };
      };
    };
  }
}

interface FloatingExtensionIconProps {
  onExtensionOpen?: () => void;
}

export default function FloatingExtensionIcon({ onExtensionOpen }: FloatingExtensionIconProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    // Listen for side panel state changes from extension
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SIDE_PANEL_STATE' && event.data?.source === 'extension') {
        setIsPanelOpen(event.data.isOpen);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleMenuOptionClick = (page: 'dashboard' | 'chatbot') => {
    if (onExtensionOpen) {
      onExtensionOpen();
    } else {
      window.postMessage({
        type: 'OPEN_SIDE_PANEL',
        page: page,
        source: 'web-app',
        timestamp: Date.now()
      }, '*');
      setIsPanelOpen(true);
      setShowMenu(false);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    setShowMenu(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Delay hiding menu to allow user to move to menu options
    setTimeout(() => setShowMenu(false), 200);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div 
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          className={`
            w-14 h-14 rounded-full transition-all duration-300 ease-in-out
            shadow-lg hover:shadow-xl flex items-center justify-center text-white
            ${isHovered ? 'scale-110 shadow-2xl' : 'scale-100'}
            bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700
            focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-50
          `}
          aria-label="Open Extension"
          title="Extension Options"
        >
          <svg
            className={`w-6 h-6 transition-transform duration-300 ${isHovered ? 'rotate-12' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
            />
          </svg>
        </button>
        
        {/* Hover Menu */}
        {showMenu && (
          <div className="absolute bottom-16 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[140px] animate-in fade-in-0 zoom-in-95 duration-200">
            <button
              onClick={() => handleMenuOptionClick('dashboard')}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors duration-150 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
              </svg>
              Dashboard
            </button>
            <button
              onClick={() => handleMenuOptionClick('chatbot')}
              className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors duration-150 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Chatbot
            </button>
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
          </div>
        )}
      </div>
    </div>
  );
}
