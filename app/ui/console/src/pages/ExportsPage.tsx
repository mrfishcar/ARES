/**
 * Exports Page - Sprint R5
 * Export graph data to GraphML and Cypher formats
 */

import { useState } from 'react';
import { mutate } from '../lib/api';
import { Spinner } from '../components/Loading';

interface ExportsPageProps {
  project: string;
  toast: any;
}

const EXPORT_GRAPH_MUTATION = `
  mutation ExportGraph($project: String!, $format: String!) {
    exportGraph(project: $project, format: $format) {
      path
    }
  }
`;

export function ExportsPage({ project, toast }: ExportsPageProps) {
  const [exportingGraphML, setExportingGraphML] = useState(false);
  const [exportingCypher, setExportingCypher] = useState(false);

  const exportGraph = async (format: 'graphml' | 'cypher') => {
    const setter = format === 'graphml' ? setExportingGraphML : setExportingCypher;

    try {
      setter(true);
      const result = await mutate<any>(EXPORT_GRAPH_MUTATION, { project, format });
      const downloadPath = result.exportGraph.path;

      // Trigger download via /download endpoint
      const downloadUrl = `/download?path=${encodeURIComponent(downloadPath)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadPath.split('/').pop() || `export.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Export to ${format.toUpperCase()} complete: ${downloadPath}`);
    } catch (error) {
      toast.error(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setter(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '24px' }}>Export Graph</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* GraphML Export */}
        <div
          style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>GraphML Format</h3>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
            Export your knowledge graph in GraphML format, compatible with graph visualization tools like Gephi, yEd, and Cytoscape.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Features:</div>
            <ul style={{ fontSize: '14px', color: '#374151', paddingLeft: '20px' }}>
              <li>Node and edge attributes preserved</li>
              <li>XML-based format</li>
              <li>Wide tool support</li>
            </ul>
          </div>

          <button
            onClick={() => exportGraph('graphml')}
            disabled={exportingGraphML}
            style={{
              width: '100%',
              padding: '12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {exportingGraphML ? <Spinner size={16} /> : null}
            Export to GraphML
          </button>
        </div>

        {/* Cypher Export */}
        <div
          style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Cypher Format</h3>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
            Export as Cypher statements for importing into Neo4j or other graph databases that support the Cypher query language.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Features:</div>
            <ul style={{ fontSize: '14px', color: '#374151', paddingLeft: '20px' }}>
              <li>Neo4j compatible</li>
              <li>CREATE statements for nodes and relationships</li>
              <li>Ready to execute</li>
            </ul>
          </div>

          <button
            onClick={() => exportGraph('cypher')}
            disabled={exportingCypher}
            style={{
              width: '100%',
              padding: '12px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {exportingCypher ? <Spinner size={16} /> : null}
            Export to Cypher
          </button>
        </div>
      </div>

      {/* Info section */}
      <div
        style={{
          marginTop: '24px',
          padding: '20px',
          background: '#eff6ff',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#1e3a8a',
        }}
      >
        <div style={{ fontWeight: '600', marginBottom: '8px' }}>Export Information</div>
        <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
          <li>Exports include all entities and relations from the current project</li>
          <li>Files are saved to the <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: '3px' }}>out/</code> directory</li>
          <li>Export operations are tracked in metrics</li>
          <li>Downloads start automatically after export completes</li>
        </ul>
      </div>
    </div>
  );
}
