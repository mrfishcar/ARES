/**
 * Vine Timeline - Sprint R9
 * Force-directed timeline visualization with interactive events
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TemporalEvent, TemporalConnection } from '../hooks/useTimeline';

interface VineTimelineProps {
  events: TemporalEvent[];
  connections: TemporalConnection[];
  onEventDateChange: (eventId: string, newDate: string) => Promise<void>;
  onEventsConnect: (sourceId: string, targetId: string, relationType: string) => Promise<void>;
  onEventClick: (event: TemporalEvent) => void;
  width?: number;
  height?: number;
}

interface SimulationNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  date: string;
  confidence: number;
  category: string;
  x?: number;
  y?: number;
}

interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  source: string | SimulationNode;
  target: string | SimulationNode;
  label: string;
}

export function VineTimeline({
  events,
  connections,
  onEventDateChange,
  onEventClick,
  width = 1200,
  height = 600,
}: VineTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create nodes from events
    const nodes: SimulationNode[] = events.map(e => ({
      id: e.id,
      label: e.label,
      date: e.date,
      confidence: e.confidence,
      category: e.category,
      x: e.x,
      y: e.y,
    }));

    // Create links from connections
    const links: SimulationLink[] = connections.map(c => ({
      source: c.source,
      target: c.target,
      label: c.label,
    }));

    // Create force simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3.forceLink<SimulationNode, SimulationLink>(links).id(d => d.id).distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create container group for zoom/pan
    const g = svg.append('g');

    // Add zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    // Draw links
    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Draw link labels
    const linkLabel = g
      .append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text(d => d.label);

    // Drag behavior
    const drag = d3.drag<SVGCircleElement, SimulationNode>()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded);

    // Draw nodes
    const node = g
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 12)
      .attr('fill', d => getCategoryColor(d.category))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .call(drag as any)
      .on('click', (event, d) => {
        event.stopPropagation();
        const originalEvent = events.find(e => e.id === d.id);
        if (originalEvent) onEventClick(originalEvent);
      });

    // Draw node labels
    const nodeLabel = g
      .append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('font-size', 12)
      .attr('font-weight', '500')
      .attr('fill', '#111')
      .attr('text-anchor', 'middle')
      .attr('dy', -20)
      .attr('pointer-events', 'none')
      .text(d => d.label);

    // Draw date labels
    const dateLabel = g
      .append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dy', 25)
      .attr('pointer-events', 'none')
      .text(d => formatDate(d.date));

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimulationNode).x || 0)
        .attr('y1', d => (d.source as SimulationNode).y || 0)
        .attr('x2', d => (d.target as SimulationNode).x || 0)
        .attr('y2', d => (d.target as SimulationNode).y || 0);

      linkLabel
        .attr('x', d => ((d.source as SimulationNode).x! + (d.target as SimulationNode).x!) / 2)
        .attr('y', d => ((d.source as SimulationNode).y! + (d.target as SimulationNode).y!) / 2);

      node
        .attr('cx', d => d.x || 0)
        .attr('cy', d => d.y || 0);

      nodeLabel
        .attr('x', d => d.x || 0)
        .attr('y', d => d.y || 0);

      dateLabel
        .attr('x', d => d.x || 0)
        .attr('y', d => d.y || 0);
    });

    function dragStarted(event: d3.D3DragEvent<SVGCircleElement, SimulationNode, SimulationNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, SimulationNode, SimulationNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragEnded(event: d3.D3DragEvent<SVGCircleElement, SimulationNode, SimulationNode>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;

      // Update date based on horizontal position
      // This is a simplified approach - in production, you'd map x to actual dates
      const newDate = new Date(event.subject.date);
      const daysOffset = Math.round((event.x - width / 2) / 10);
      newDate.setDate(newDate.getDate() + daysOffset);

      if (Math.abs(daysOffset) > 5) {
        onEventDateChange(event.subject.id, newDate.toISOString().split('T')[0]);
      }
    }

    return () => {
      simulation.stop();
    };
  }, [events, connections, width, height, onEventDateChange, onEventClick]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          background: '#fafafa',
        }}
      />

      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'white',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Zoom: {(zoom * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
          Drag: Move events
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
          Click: View details
        </div>
      </div>
    </div>
  );
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    PERSON: '#3b82f6',
    PLACE: '#10b981',
    ORG: '#8b5cf6',
    EVENT: '#f59e0b',
    CONCEPT: '#ec4899',
    THING: '#6b7280',
  };
  return colors[category] || '#94a3b8';
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
