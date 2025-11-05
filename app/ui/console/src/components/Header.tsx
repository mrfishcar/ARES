/**
 * Header Component - Sprint R5
 * Navigation and project selector
 */

import { Link, useLocation } from 'react-router-dom';
import { useHeartbeat } from '../lib/useHeartbeat';

interface HeaderProps {
  project: string;
  onProjectChange: (project: string) => void;
  onThemeClick?: () => void;
}

export function Header({ project, onProjectChange, onThemeClick }: HeaderProps) {
  const location = useLocation();
  const heartbeat = useHeartbeat();

  const navItems = [
    { path: '/home', label: 'Home', shortcut: 'g+h' },
    { path: '/', label: 'Dashboard', shortcut: 'g+d' },
    { path: '/notes', label: 'Notes', shortcut: 'g+n' },
    { path: '/entities', label: 'Entities', shortcut: 'g+e' },
    { path: '/relations', label: 'Relations', shortcut: 'g+r' },
    { path: '/graph', label: 'Graph', shortcut: 'g+g' },
    { path: '/wiki', label: 'Wiki', shortcut: 'g+w' },
    { path: '/timeline', label: 'Timeline', shortcut: 'g+v' },
    { path: '/identity', label: 'Identity', shortcut: 'g+i' },
    { path: '/snapshots', label: 'Snapshots', shortcut: 'g+s' },
    { path: '/exports', label: 'Exports', shortcut: 'g+x' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header
      style={{
        background: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 24px',
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '64px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600' }}>ARES Console</h1>

          <nav style={{ display: 'flex', gap: '8px' }}>
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: isActive(item.path) ? '#eff6ff' : 'transparent',
                  color: isActive(item.path) ? '#1d4ed8' : '#6b7280',
                  fontWeight: isActive(item.path) ? '500' : '400',
                  fontSize: '14px',
                  textDecoration: 'none',
                }}
                title={item.shortcut}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Theme button */}
          {onThemeClick && (
            <button
              onClick={onThemeClick}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280',
              }}
              title="Theme Editor (g+t)"
            >
              🎨
            </button>
          )}

          {/* Project selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#6b7280' }}>Project:</label>
            <input
              type="text"
              value={project}
              onChange={e => onProjectChange(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                width: '120px',
              }}
            />
          </div>

          {/* Heartbeat indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: heartbeat.isAlive ? '#10b981' : '#ef4444',
            }}
            title={
              heartbeat.isAlive
                ? `Connected (last ping: ${heartbeat.lastPing?.toLocaleTimeString()})`
                : `Disconnected${heartbeat.error ? `: ${heartbeat.error}` : ''}`
            }
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: heartbeat.isAlive ? '#10b981' : '#ef4444',
              }}
            />
            {heartbeat.isAlive ? 'Connected' : 'Offline'}
          </div>
        </div>
      </div>
    </header>
  );
}
