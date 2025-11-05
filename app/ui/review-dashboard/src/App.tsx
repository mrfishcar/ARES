import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { PendingEntities } from './components/PendingEntities';
import { PendingRelations } from './components/PendingRelations';
import { Toast } from './components/Toast';
import { useReviewStore } from './state/useReviewStore';

function App() {
  // Read project from URL param, fallback to 'default'
  const getProjectFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('project') || 'default';
  };

  const [project, setProject] = useState(getProjectFromURL());
  const { entities, relations, stats, loading, polling, error, approve, dismiss } = useReviewStore(project);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedType, setSelectedType] = useState<'entity' | 'relation'>('entity');

  // Update URL when project changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('project', project);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }, [project]);

  // Reset selection when data changes
  useEffect(() => {
    setSelectedIndex(0);
    if (entities.length > 0) {
      setSelectedType('entity');
    } else if (relations.length > 0) {
      setSelectedType('relation');
    }
  }, [entities.length, relations.length]);

  // Auto-scroll to keep selected item in view
  useEffect(() => {
    const elementId = selectedType === 'entity' ? `entity-${selectedIndex}` : `relation-${selectedIndex}`;
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedIndex, selectedType]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentList = selectedType === 'entity' ? entities : relations;
      const maxIndex = currentList.length - 1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < maxIndex) {
          setSelectedIndex(selectedIndex + 1);
        } else if (selectedType === 'entity' && relations.length > 0) {
          // Move to relations list
          setSelectedType('relation');
          setSelectedIndex(0);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        } else if (selectedType === 'relation' && entities.length > 0) {
          // Move to entities list
          setSelectedType('entity');
          setSelectedIndex(entities.length - 1);
        }
      } else if (e.key === 'Enter' && currentList.length > 0) {
        e.preventDefault();
        const item = currentList[selectedIndex];
        handleApprove(item.id);
      } else if (e.key === 'Delete' && currentList.length > 0) {
        e.preventDefault();
        const item = currentList[selectedIndex];
        handleDismiss(item.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, selectedType, entities, relations]);

  const handleApprove = async (id: string) => {
    try {
      await approve(id);
      setToast('Approved successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismiss(id);
      setToast('Dismissed successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <Header project={project} onProjectChange={setProject} />
      <StatsBar entities={stats.entities} relations={stats.relations} polling={polling} />

      <div style={{ padding: '2rem' }}>
        <h2>Pending Entities</h2>
        <PendingEntities
          entities={entities}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
          selectedIndex={selectedType === 'entity' ? selectedIndex : -1}
        />
      </div>

      <div style={{ padding: '2rem' }}>
        <h2>Pending Relations</h2>
        <PendingRelations
          relations={relations}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
          selectedIndex={selectedType === 'relation' ? selectedIndex : -1}
        />
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
