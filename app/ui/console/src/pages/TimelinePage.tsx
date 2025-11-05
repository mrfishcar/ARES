/**
 * Timeline Page - Sprint R9
 * Interactive temporal graph visualization
 */

import { useState } from 'react';
import { VineTimeline } from '../components/VineTimeline';
import { useTimeline, type TemporalEvent } from '../hooks/useTimeline';

interface TimelinePageProps {
  project: string;
  toast: any;
}

export function TimelinePage({ project, toast }: TimelinePageProps) {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [selectedEvent, setSelectedEvent] = useState<TemporalEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { timeline, loading, error, updateEventDate, connectEvents } = useTimeline(
    project,
    startDate || undefined,
    endDate || undefined,
    minConfidence
  );

  const handleEventDateChange = async (eventId: string, newDate: string) => {
    try {
      await updateEventDate(eventId, newDate);
      toast.success('Event date updated');
    } catch (err) {
      toast.error(`Failed to update date: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleEventsConnect = async (sourceId: string, targetId: string, relationType: string) => {
    try {
      await connectEvents(sourceId, targetId, relationType);
      toast.success('Events connected');
    } catch (err) {
      toast.error(`Failed to connect events: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleEventClick = (event: TemporalEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading timeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#ef4444' }}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Temporal Timeline
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Visualize events and their connections over time. Drag events to update dates.
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
            Min Confidence: {(minConfidence * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={minConfidence}
            onChange={e => setMinConfidence(parseFloat(e.target.value))}
            style={{ width: '200px' }}
          />
        </div>

        <button
          onClick={() => {
            setStartDate('');
            setEndDate('');
            setMinConfidence(0.5);
          }}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            color: '#374151',
          }}
        >
          Reset Filters
        </button>

        <div style={{ marginLeft: 'auto', fontSize: '14px', color: '#6b7280' }}>
          {timeline?.events.length || 0} events • {timeline?.connections.length || 0} connections
        </div>
      </div>

      {/* Timeline Visualization */}
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        {timeline && timeline.events.length > 0 ? (
          <VineTimeline
            events={timeline.events}
            connections={timeline.connections}
            onEventDateChange={handleEventDateChange}
            onEventsConnect={handleEventsConnect}
            onEventClick={handleEventClick}
            width={1100}
            height={600}
          />
        ) : (
          <div style={{ padding: '64px', textAlign: 'center', color: '#9ca3af' }}>
            No temporal events found. Ensure entities have temporal data extracted.
          </div>
        )}
      </div>

      {/* Event Details Drawer */}
      {drawerOpen && selectedEvent && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '400px',
            background: 'white',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Event Details</h2>
            <button
              onClick={() => setDrawerOpen(false)}
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

          {/* Drawer Content */}
          <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Label</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>{selectedEvent.label}</div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Date</div>
              <div style={{ fontSize: '14px' }}>{selectedEvent.date}</div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Category</div>
              <div
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
              >
                {selectedEvent.category}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Confidence</div>
              <div style={{ fontSize: '14px' }}>
                {(selectedEvent.confidence * 100).toFixed(0)}%
              </div>
            </div>

            {selectedEvent.description && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Description</div>
                <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                  {selectedEvent.description}
                </div>
              </div>
            )}

            <div style={{ marginTop: '32px', padding: '16px', background: '#f9fafb', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                💡 Tip
              </div>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                Drag this event horizontally to update its date. Shift+drag to connect it to other events.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            zIndex: 999,
          }}
        />
      )}
    </div>
  );
}
