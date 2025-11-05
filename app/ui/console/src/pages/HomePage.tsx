/**
 * Home Page - Sprint R7
 * Centered prompt with text input and file upload
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotes } from '../lib/useNotes';

interface HomePageProps {
  project: string;
  toast: any;
}

export function HomePage({ project, toast }: HomePageProps) {
  const navigate = useNavigate();
  const { createNote } = useNotes({ project });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  /**
   * Handle file upload
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        return result.url;
      });

      const urls = await Promise.all(uploadPromises);
      setUploadedFiles((prev) => [...prev, ...urls]);
      toast.success(`Uploaded ${files.length} file(s)`);
    } catch (error) {
      toast.error(
        `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Handle note submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim() && uploadedFiles.length === 0) {
      toast.error('Please enter some text or upload files');
      return;
    }

    try {
      await createNote({
        markdown: text,
        attachments: uploadedFiles,
      });

      toast.success('Note created successfully');
      navigate('/notes');
    } catch (error) {
      toast.error(
        `Failed to create note: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  /**
   * Remove uploaded file
   */
  const removeFile = (url: string) => {
    setUploadedFiles((prev) => prev.filter((u) => u !== url));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 100px)',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          width: '100%',
        }}
      >
        {/* Centered prompt */}
        <h1
          style={{
            fontSize: '28px',
            fontWeight: '400',
            textAlign: 'center',
            color: '#111827',
            marginBottom: '32px',
            letterSpacing: '-0.02em',
          }}
        >
          What are you thinking about?
        </h1>

        {/* Input form */}
        <form onSubmit={handleSubmit}>
          {/* Text input */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Start writing... Use [[Entity: name]] to reference entities or [[NewEntity: name|type=TYPE]] to create new ones."
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '16px',
              fontSize: '15px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              outline: 'none',
              fontFamily: 'inherit',
              resize: 'vertical',
              marginBottom: '16px',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          />

          {/* Uploaded files */}
          {uploadedFiles.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {uploadedFiles.map((url, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>
                    {url.split('/').pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(url)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px 8px',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            {/* Submit button */}
            <button
              type="submit"
              disabled={uploading}
              style={{
                flex: 1,
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!uploading) {
                  e.currentTarget.style.background = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#3b82f6';
              }}
            >
              {uploading ? 'Uploading...' : 'Create Note'}
            </button>

            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '12px 24px',
                background: 'white',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!uploading) {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.background = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.background = 'white';
              }}
            >
              Attach Files
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.md,.json,.csv,.docx,.xlsx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        </form>

        {/* Helper text */}
        <p
          style={{
            textAlign: 'center',
            fontSize: '13px',
            color: '#9ca3af',
            marginTop: '24px',
          }}
        >
          Press <strong>Create Note</strong> to save and view all your notes
        </p>
      </div>
    </div>
  );
}
