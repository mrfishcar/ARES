/**
 * Toast Component - Sprint R5
 * Simple toast notifications for mutations and errors
 */

import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastProps {
  message: ToastMessage;
  onClose: (id: string) => void;
}

export function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(message.id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [message.id, onClose]);

  const bgColor = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
  }[message.type];

  return (
    <div
      style={{
        background: bgColor,
        color: 'white',
        padding: '12px 16px',
        borderRadius: '6px',
        marginBottom: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        minWidth: '300px',
      }}
    >
      <span>{message.message}</span>
      <button
        onClick={() => onClose(message.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          marginLeft: '12px',
          fontSize: '18px',
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer({ messages, onClose }: { messages: ToastMessage[]; onClose: (id: string) => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
      }}
    >
      {messages.map(message => (
        <Toast key={message.id} message={message} onClose={onClose} />
      ))}
    </div>
  );
}

/**
 * Toast hook for managing toast notifications
 */
export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev, { id, type, message }]);
  };

  const closeToast = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  return {
    messages,
    showToast,
    closeToast,
    success: (msg: string) => showToast('success', msg),
    error: (msg: string) => showToast('error', msg),
    info: (msg: string) => showToast('info', msg),
  };
}
