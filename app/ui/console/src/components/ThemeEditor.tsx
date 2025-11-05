/**
 * Theme Editor - Sprint R9
 * Visual theme customization interface
 */

import { useState } from 'react';
import { useThemes, type ThemeColors, type ThemeBackground, type Theme } from '../hooks/useTheme';
import { useThemeContext } from '../context/ThemeContext';

interface ThemeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  toast: any;
}

export function ThemeEditor({ isOpen, onClose, toast }: ThemeEditorProps) {
  const { themes, saveTheme, deleteTheme } = useThemes();
  const { applyTheme } = useThemeContext();

  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [name, setName] = useState('');
  const [colors, setColors] = useState<ThemeColors>({
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    accent: '#10b981',
    background: '#ffffff',
    surface: '#f9fafb',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
  });
  const [backgroundType, setBackgroundType] = useState<'solid' | 'gradient' | 'image'>('solid');
  const [backgroundValue, setBackgroundValue] = useState('#ffffff');
  const [blur, setBlur] = useState(0);

  if (!isOpen) return null;

  const handleLoadTheme = (theme: Theme) => {
    setSelectedTheme(theme);
    setName(theme.name);
    setColors(theme.colors as ThemeColors);
    setBackgroundType(theme.background.type);
    setBackgroundValue(theme.background.value);
    setBlur(theme.background.blur || 0);
  };

  const handlePreview = () => {
    const previewTheme: Theme = {
      id: selectedTheme?.id || 'preview',
      name,
      colors,
      background: { type: backgroundType, value: backgroundValue, blur },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    applyTheme(previewTheme);
  };

  const handleSave = async () => {
    try {
      const background: ThemeBackground = {
        type: backgroundType,
        value: backgroundValue,
        blur,
      };

      await saveTheme(name, colors, background, undefined, selectedTheme?.id);
      toast.success('Theme saved successfully!');
      onClose();
    } catch (error) {
      toast.error(`Failed to save theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedTheme || selectedTheme.id === 'default') {
      toast.error('Cannot delete default theme');
      return;
    }

    if (!confirm(`Delete theme "${selectedTheme.name}"?`)) return;

    try {
      await deleteTheme(selectedTheme.id);
      toast.success('Theme deleted');
      setSelectedTheme(null);
      setName('');
    } catch (error) {
      toast.error(`Failed to delete theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Theme Editor</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {/* Theme List */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            Load Existing Theme
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleLoadTheme(theme)}
                style={{
                  padding: '8px 16px',
                  background: selectedTheme?.id === theme.id ? '#3b82f6' : '#f3f4f6',
                  color: selectedTheme?.id === theme.id ? 'white' : '#111827',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Name */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            Theme Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Theme"
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
            }}
          />
        </div>

        {/* Color Pickers */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            Colors
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {Object.entries(colors).map(([key, value]) => (
              <div key={key}>
                <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                  style={{ width: '100%', height: '36px', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Background Type */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            Background Type
          </label>
          <select
            value={backgroundType}
            onChange={(e) => setBackgroundType(e.target.value as 'solid' | 'gradient' | 'image')}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
            }}
          >
            <option value="solid">Solid Color</option>
            <option value="gradient">Gradient</option>
            <option value="image">Image URL</option>
          </select>
        </div>

        {/* Background Value */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            {backgroundType === 'image' ? 'Image URL' : 'Background Value'}
          </label>
          {backgroundType === 'solid' ? (
            <input
              type="color"
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
              style={{ width: '100%', height: '48px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
            />
          ) : (
            <input
              type="text"
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
              placeholder={
                backgroundType === 'gradient'
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'https://...'
              }
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
              }}
            />
          )}
        </div>

        {/* Blur (for images) */}
        {backgroundType === 'image' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
              Blur ({blur}px)
            </label>
            <input
              type="range"
              min="0"
              max="20"
              value={blur}
              onChange={(e) => setBlur(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button
            onClick={handlePreview}
            style={{
              flex: 1,
              padding: '10px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{
              flex: 1,
              padding: '10px',
              background: name.trim() ? '#3b82f6' : '#e5e7eb',
              color: name.trim() ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Save Theme
          </button>
          {selectedTheme && selectedTheme.id !== 'default' && (
            <button
              onClick={handleDelete}
              style={{
                padding: '10px 16px',
                background: '#fee2e2',
                color: '#dc2626',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
