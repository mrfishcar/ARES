/**
 * Phase 5 UI Demo - React + D3 Knowledge Graph Visualization
 *
 * This is a demo file showing how to visualize the ARES knowledge graph.
 * To run: npm install react react-dom d3 @types/d3
 * Then: npx ts-node --jsx react demo-phase5-ui.tsx
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { loadGraph } from '../app/storage/storage';
import { toDOT } from '../app/engine/export';
import type { Entity, Relation } from '../app/engine/schema';
import type { Conflict } from '../app/engine/conflicts';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  name: string;
  conflict: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  predicate: string;
  confidence: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Main Knowledge Graph UI Component
 */
export function KnowledgeGraphUI() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<{
    entities: number;
    relations: number;
    conflicts: number;
  } | null>(null);

  useEffect(() => {
    // Load graph from storage
    const loadedGraph = loadGraph();
    if (!loadedGraph) {
      console.warn('No graph found in storage');
      return;
    }

    // Get conflict entity IDs
    const conflictEntityIds = new Set<string>();
    for (const conflict of loadedGraph.conflicts) {
      for (const rel of conflict.relations) {
        conflictEntityIds.add(rel.subj);
        conflictEntityIds.add(rel.obj);
      }
    }

    // Transform to D3 format
    const nodes: GraphNode[] = loadedGraph.entities.map(e => ({
      id: e.id,
      type: e.type,
      name: e.canonical,
      conflict: conflictEntityIds.has(e.id)
    }));

    const links: GraphLink[] = loadedGraph.relations.map(r => ({
      source: r.subj,
      target: r.obj,
      predicate: r.pred,
      confidence: r.confidence
    }));

    setGraph({ nodes, links });
    setStats({
      entities: loadedGraph.entities.length,
      relations: loadedGraph.relations.length,
      conflicts: loadedGraph.conflicts.length
    });
  }, []);

  useEffect(() => {
    if (!graph || !svgRef.current) return;

    const width = 1000;
    const height = 700;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'border: 1px solid #ccc; background: #fafafa;');

    // Clear previous
    svg.selectAll('*').remove();

    // Add zoom behavior
    const g = svg.append('g');

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }) as any
    );

    // Force simulation
    const simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graph.links)
        .id(d => d.id)
        .distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(graph.links)
      .enter().append('line')
      .attr('stroke', d => {
        const source = graph.nodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
        const target = graph.nodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
        return (source?.conflict || target?.conflict) ? '#ff4444' : '#999';
      })
      .attr('stroke-width', d => Math.max(1, d.confidence * 3))
      .attr('stroke-opacity', 0.6);

    // Draw link labels
    const linkLabel = g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(graph.links)
      .enter().append('text')
      .attr('font-size', 9)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text(d => d.predicate.replace(/_/g, ' '));

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(graph.nodes)
      .enter().append('circle')
      .attr('r', 12)
      .attr('fill', d => d.conflict ? '#ff4444' : getColorForType(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    // Node labels
    const label = g.append('g')
      .attr('class', 'labels')
      .selectAll('text')
      .data(graph.nodes)
      .enter().append('text')
      .text(d => d.name)
      .attr('font-size', 11)
      .attr('font-weight', d => d.conflict ? 'bold' : 'normal')
      .attr('fill', d => d.conflict ? '#ff4444' : '#333')
      .attr('dx', 15)
      .attr('dy', 4)
      .style('pointer-events', 'none');

    // Tooltip on hover
    node.append('title')
      .text(d => `${d.name} (${d.type})${d.conflict ? '\n⚠️ HAS CONFLICT' : ''}`);

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      linkLabel
        .attr('x', d => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr('y', d => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2);

      node
        .attr('cx', d => d.x!)
        .attr('cy', d => d.y!);

      label
        .attr('x', d => d.x!)
        .attr('y', d => d.y!);
    });

    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [graph]);

  const exportToDOT = () => {
    if (!graph) return;

    const loadedGraph = loadGraph();
    if (!loadedGraph) return;

    const dot = toDOT(loadedGraph.relations, loadedGraph.entities);
    const blob = new Blob([dot], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ares_graph.dot';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPNG = () => {
    if (!svgRef.current) return;

    // Convert SVG to canvas and download as PNG
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ares_graph.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  if (!graph) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h1>ARES Knowledge Graph Viewer</h1>
        <p>No graph data found. Please run the extraction pipeline first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>ARES Knowledge Graph Viewer</h1>

      <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h3>Graph Statistics</h3>
        {stats && (
          <div style={{ display: 'flex', gap: '30px' }}>
            <div>
              <strong>Entities:</strong> {stats.entities}
            </div>
            <div>
              <strong>Relations:</strong> {stats.relations}
            </div>
            <div style={{ color: stats.conflicts > 0 ? '#ff4444' : 'inherit' }}>
              <strong>Conflicts:</strong> {stats.conflicts}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={exportToDOT}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            background: '#4A90E2',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Export as DOT
        </button>
        <button
          onClick={exportToPNG}
          style={{
            padding: '10px 20px',
            background: '#7ED321',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Export as PNG
        </button>
      </div>

      <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
        <div><strong style={{ color: '#ff4444' }}>●</strong> Red nodes/edges = conflicts detected</div>
        <div><strong style={{ color: '#4A90E2' }}>●</strong> Blue = Person | <strong style={{ color: '#7ED321' }}>●</strong> Green = Place</div>
        <div>Drag nodes to rearrange | Scroll to zoom</div>
      </div>

      <svg ref={svgRef}></svg>
    </div>
  );
}

/**
 * Get color for entity type
 */
function getColorForType(type: string): string {
  const colors: Record<string, string> = {
    'PERSON': '#4A90E2',
    'PLACE': '#7ED321',
    'ORG': '#F5A623',
    'DATE': '#D0021B',
    'WORK': '#BD10E0',
    'ITEM': '#9013FE',
    'SPECIES': '#50E3C2',
    'HOUSE': '#B8E986',
    'TRIBE': '#F8E71C',
    'TITLE': '#FF6B6B'
  };
  return colors[type] || '#999';
}

/**
 * Demo: Render to DOM
 */
if (typeof window !== 'undefined') {
  import('react-dom').then(ReactDOM => {
    const root = document.getElementById('root');
    if (root) {
      ReactDOM.render(<KnowledgeGraphUI />, root);
    }
  });
}

export default KnowledgeGraphUI;
