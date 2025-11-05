/**
 * GraphCanvas Component - Sprint R6 Phase 2
 * D3 force-directed graph visualization with zoom/pan/drag
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3Zoom, ZoomBehavior } from 'd3-zoom';
import { drag as d3Drag } from 'd3-drag';
import type { GraphNode, GraphEdge } from '../lib/useGraphData';

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  width?: number;
  height?: number;
}

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends GraphEdge {
  source: SimNode | string;
  target: SimNode | string;
}

// Color palettes
const NODE_COLORS: Record<string, string> = {
  PERSON: '#3b82f6', // blue
  PLACE: '#10b981', // green
  ORG: '#f59e0b', // amber
  ORGANIZATION: '#f59e0b',
  EVENT: '#ef4444', // red
  CONCEPT: '#8b5cf6', // purple
  TITLE: '#6366f1', // indigo
  OBJECT: '#6b7280', // gray neutral
  HOUSE: '#f97316', // orange accent
  DEFAULT: '#6b7280',
};

const PREDICATE_COLORS: Record<string, string> = {
  married_to: '#ec4899',
  parent_of: '#f59e0b',
  child_of: '#f59e0b',
  sibling_of: '#fbbf24',
  lives_in: '#10b981',
  born_in: '#34d399',
  died_in: '#059669',
  works_for: '#3b82f6',
  leads: '#f97316',
  founded: '#fb7185',
  studied_at: '#8b5cf6',
  teaches_at: '#6366f1',
  friend_of: '#06b6d4',
  enemy_of: '#ef4444',
  traveled_to: '#8b5cf6',
  participated_in: '#a855f7',
  member_of: '#fbbf24',
  located_in: '#10b981',
  default: '#94a3b8',
};

/**
 * Get color for a node based on its primary type
 */
function getNodeColor(types: string[]): string {
  if (types.length === 0) return NODE_COLORS.DEFAULT;
  const primaryType = types[0].toUpperCase();
  return NODE_COLORS[primaryType] || NODE_COLORS.DEFAULT;
}

/**
 * Get color for an edge based on predicate
 */
function getEdgeColor(predicate: string): string {
  const pred = predicate.toLowerCase();
  return PREDICATE_COLORS[pred] || PREDICATE_COLORS.default;
}

export function GraphCanvas({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
  width = 800,
  height = 600,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Create container group for zoom/pan
    const g = svg.append('g').attr('class', 'graph-container');

    // Set up zoom behavior
    const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoomBehavior as any);

    // Prepare data for D3 simulation
    const simNodes: SimNode[] = nodes.map(n => ({ ...n }));
    const simLinks: SimLink[] = edges.map(e => ({
      ...e,
      source: e.subject,
      target: e.object,
    }));

    // Create D3 force simulation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id(d => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Render edges
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', d => getEdgeColor(d.predicate))
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onEdgeClick) {
          onEdgeClick(d as GraphEdge);
        }
      });

    // Render nodes
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (onNodeClick) {
          onNodeClick(d);
        }
      })
      .on('mouseenter', (_event, d) => {
        setHoveredNode(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      })
      .call(
        d3Drag<SVGGElement, SimNode>()
          .on('start', (event: any, d: SimNode) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: any, d: SimNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: any, d: SimNode) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any
      );

    // Add circles to nodes
    node
      .append('circle')
      .attr('r', 8)
      .attr('fill', d => getNodeColor(d.types));

    // Add labels to nodes
    node
      .append('text')
      .text(d => d.name)
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('fill', '#1f2937')
      .attr('font-family', 'system-ui, sans-serif');

    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x || 0)
        .attr('y1', d => (d.source as SimNode).y || 0)
        .attr('x2', d => (d.target as SimNode).x || 0)
        .attr('y2', d => (d.target as SimNode).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Cleanup on unmount
    return () => {
      simulation.stop();
    };
  }, [nodes, edges, width, height, onNodeClick, onEdgeClick]);

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#f9fafb',
      }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        {nodes.length === 0 && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill="#9ca3af"
            fontSize="14px"
          >
            No graph data to display
          </text>
        )}
      </svg>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          backgroundColor: 'white',
          padding: '12px',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          fontSize: '12px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Legend</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: NODE_COLORS.PERSON,
              }}
            />
            <span>Person</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: NODE_COLORS.PLACE,
              }}
            />
            <span>Place</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: NODE_COLORS.ORG,
              }}
            />
            <span>Organization</span>
          </div>
        </div>
      </div>

      {/* Hover info */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            backgroundColor: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            fontSize: '12px',
          }}
        >
          Hovered: <strong>{nodes.find(n => n.id === hoveredNode)?.name}</strong>
        </div>
      )}
    </div>
  );
}
