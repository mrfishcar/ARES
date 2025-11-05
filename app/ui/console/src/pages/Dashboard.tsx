/**
 * Dashboard Page - Sprint R5
 * Overview with metrics and quick links
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMetrics, parseMetrics } from '../lib/api';
import { LoadingPage } from '../components/Loading';

interface DashboardProps {
  project: string;
  toast: any;
}

export function Dashboard({ project, toast }: DashboardProps) {
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);
        const metricsText = await fetchMetrics();
        const parsed = parseMetrics(metricsText);
        setMetrics(parsed);
      } catch (error) {
        toast.error(`Failed to load metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();

    // Auto-refresh every 5 seconds
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, [toast]);

  if (loading) {
    return <LoadingPage />;
  }

  const apiMetrics = [
    { key: 'ares_api_list_entities_total', label: 'List Entities Calls' },
    { key: 'ares_api_get_entity_total', label: 'Get Entity Calls' },
    { key: 'ares_api_list_relations_total', label: 'List Relations Calls' },
    { key: 'ares_api_get_relation_total', label: 'Get Relation Calls' },
  ];

  const extractionMetrics = [
    { key: 'ares_documents_processed_total', label: 'Documents Processed' },
    { key: 'ares_entities_extracted_total', label: 'Entities Extracted' },
    { key: 'ares_relations_extracted_total', label: 'Relations Extracted' },
  ];

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '24px' }}>Dashboard</h2>

      {/* Project info */}
      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Current Project</h3>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Working on: <strong style={{ color: '#111827' }}>{project}</strong>
        </p>
      </div>

      {/* Quick links */}
      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Quick Links</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <QuickLinkCard to="/entities" label="Browse Entities" description="Search and filter entities" />
          <QuickLinkCard to="/relations" label="Browse Relations" description="Explore connections" />
          <QuickLinkCard to="/wiki" label="Wiki Files" description="View source documents" />
          <QuickLinkCard to="/snapshots" label="Snapshots" description="Backup and restore" />
          <QuickLinkCard to="/exports" label="Exports" description="GraphML & Cypher" />
        </div>
      </div>

      {/* API Metrics */}
      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>API Metrics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {apiMetrics.map(metric => (
            <MetricCard key={metric.key} label={metric.label} value={metrics?.[metric.key] ?? 0} />
          ))}
        </div>
      </div>

      {/* Extraction Metrics */}
      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Extraction Metrics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {extractionMetrics.map(metric => (
            <MetricCard key={metric.key} label={metric.label} value={metrics?.[metric.key] ?? 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickLinkCard({ to, label, description }: { to: string; label: string; description: string }) {
  return (
    <Link
      to={to}
      style={{
        display: 'block',
        padding: '16px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        textDecoration: 'none',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#3b82f6';
        e.currentTarget.style.background = '#f9fafb';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.background = 'white';
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{description}</div>
    </Link>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
      }}
    >
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: '600', color: '#111827' }}>{value.toLocaleString()}</div>
    </div>
  );
}
