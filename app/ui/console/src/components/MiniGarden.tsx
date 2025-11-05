/**
 * Mini Garden - Live visualization of entities as they're created
 * Simple, beautiful, organic growth metaphor
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface Entity {
  id: string;
  name: string;
  type: string;
  mentions: number;
  isNew?: boolean;
}

interface MiniGardenProps {
  entities: Entity[];
  width?: number;
  height?: number;
  onEntityClick?: (entity: Entity) => void;
}

interface ClusterNode {
  id: string;
  type: string;
  count: number;
  entities: Entity[];
  isCluster: true;
}

type Node = Entity | ClusterNode;

export function MiniGarden({
  entities,
  width = 400,
  height = 400,
  onEntityClick
}: MiniGardenProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredEntity, setHoveredEntity] = useState<Entity | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Entity type colors - organic, garden-inspired
  const getEntityColor = (type: string, mentions: number) => {
    const baseColors: Record<string, string> = {
      PERSON: '#10b981',    // green - growing
      PLACE: '#3b82f6',     // blue - water/sky
      ORG: '#f59e0b',       // amber - sun
      EVENT: '#ef4444',     // red - flower
      CONCEPT: '#8b5cf6',   // purple - imagination
      OBJECT: '#6b7280',    // gray - earth
    };

    const base = baseColors[type] || '#6b7280';

    // Fade if under-documented
    const opacity = mentions < 2 ? 0.4 : mentions < 5 ? 0.7 : 1.0;

    return base + Math.round(opacity * 255).toString(16).padStart(2, '0');
  };

  // Calculate node size based on "maturity" (mentions)
  const getNodeSize = (mentions: number) => {
    if (mentions < 2) return 8;   // 🌱 seedling
    if (mentions < 5) return 12;  // 🌿 growing
    if (mentions < 10) return 16; // 🌳 mature
    return 20;                     // 🌲 ancient
  };

  // Create clusters from entities (group by type if > 3 of same type)
  const createNodes = (): Node[] => {
    const byType = new Map<string, Entity[]>();
    entities.forEach(entity => {
      const type = entity.type;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(entity);
    });

    const nodes: Node[] = [];
    byType.forEach((typeEntities, type) => {
      if (typeEntities.length > 3 && !expandedClusters.has(type)) {
        // Create cluster
        nodes.push({
          id: `cluster-${type}`,
          type,
          count: typeEntities.length,
          entities: typeEntities,
          isCluster: true,
        });
      } else {
        // Show individual entities
        nodes.push(...typeEntities);
      }
    });
    return nodes;
  };

  useEffect(() => {
    if (!svgRef.current || entities.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create container group
    const container = svg.append('g');

    const nodes = createNodes();

    // Create simulation nodes with positions - preserve existing, spread out new ones
    const simulationNodes = nodes.map(node => {
      const existing = positionsRef.current.get(node.id);
      const radius = node.isCluster ? Math.min(30 + node.count * 2, 50) : getNodeSize(node.mentions || 1);

      if (existing && existing.x >= radius && existing.x <= width - radius && existing.y >= radius && existing.y <= height - radius) {
        // Reuse existing position if it's within bounds
        return { ...node, x: existing.x, y: existing.y };
      } else {
        // New entity or out-of-bounds - place randomly within safe area
        return {
          ...node,
          x: radius + Math.random() * (width - radius * 2),
          y: radius + Math.random() * (height - radius * 2),
        };
      }
    });

    // Helper to get node radius
    const getNodeRadius = (d: any) => {
      if (d.isCluster) return Math.min(30 + d.count * 2, 50); // Clusters are larger
      return getNodeSize(d.mentions || 1);
    };

    // Create D3 force simulation for dynamic entity propagation
    const simulation = d3.forceSimulation(simulationNodes as any)
      .alpha(0.3) // Start with low energy to avoid the collapse/explode effect
      .alphaTarget(0) // No ongoing energy, let it settle
      .force('charge', d3.forceManyBody().strength(-30)) // Very gentle repulsion
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.01)) // Minimal center pull
      .force('collision', d3.forceCollide().radius((d: any) => getNodeRadius(d) + 4)) // Prevent overlap
      .force('bound', () => {
        // Keep entities within canvas bounds
        simulationNodes.forEach((node: any) => {
          const radius = getNodeRadius(node);
          node.x = Math.max(radius, Math.min(width - radius, node.x));
          node.y = Math.max(radius, Math.min(height - radius, node.y));
        });
      })
      .alphaDecay(0.02) // Slow, gentle cooldown
      .velocityDecay(0.4); // Moderate friction

    // Create circles
    const circles = container.selectAll('circle')
      .data(simulationNodes)
      .join('circle')
      .attr('r', (d: any) => getNodeRadius(d))
      .attr('fill', (d: any) => d.isCluster ? getEntityColor(d.type, 5) : getEntityColor(d.type, d.mentions || 1))
      .attr('stroke', '#fff')
      .attr('stroke-width', (d: any) => d.isCluster ? 3 : 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d: any) {
        d3.select(this)
          .attr('r', getNodeRadius(d) + 4)
          .attr('stroke-width', d.isCluster ? 4 : 3);
        if (!d.isCluster) setHoveredEntity(d);
      })
      .on('mouseleave', function(event, d: any) {
        d3.select(this)
          .attr('r', getNodeRadius(d))
          .attr('stroke-width', d.isCluster ? 3 : 2);
        setHoveredEntity(null);
      })
      .on('click', (event, d: any) => {
        if (d.isCluster) {
          // Toggle cluster expansion
          setExpandedClusters(prev => {
            const next = new Set(prev);
            if (next.has(d.type)) {
              next.delete(d.type);
            } else {
              next.add(d.type);
            }
            return next;
          });
        } else if (onEntityClick) {
          onEntityClick(d);
        }
      });

    // Add text labels for clusters
    const labels = container.selectAll('text')
      .data(simulationNodes.filter((d: any) => d.isCluster))
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#fff')
      .style('pointer-events', 'none')
      .text((d: any) => d.count);

    // Update positions on each simulation tick
    simulation.on('tick', () => {
      circles
        .attr('cx', (d: any) => {
          // Save position for next render
          positionsRef.current.set(d.id, { x: d.x, y: d.y });
          return d.x;
        })
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    // Pulse animation for new entities
    circles.filter((d: any) => d.isNew)
      .style('animation', 'pulse 2s ease-in-out infinite');

    return () => {
      simulation.stop();
    };
  }, [entities, width, height, onEntityClick, expandedClusters]);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
          borderRadius: '12px',
        }}
      />

      {/* Hover tooltip */}
      {hoveredEntity && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <strong>{hoveredEntity.name}</strong> · {hoveredEntity.type}
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
            {hoveredEntity.mentions} {hoveredEntity.mentions === 1 ? 'mention' : 'mentions'}
            {hoveredEntity.mentions < 2 && ' · needs attention'}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          fontSize: '11px',
          color: '#6b7280',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px 10px',
          borderRadius: '6px',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div style={{ marginBottom: '4px', fontWeight: '500' }}>
          Your Garden: {entities.length} entities
        </div>
        <div style={{ opacity: 0.7 }}>
          Size = maturity · Color = type
        </div>
      </div>

      {/* CSS animations */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
        `}
      </style>
    </div>
  );
}
