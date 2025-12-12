/**
 * useLabLayoutState - Manages UI layout state for Extraction Lab
 * Handles: sidebar, panels, modals, settings dropdown
 */

import { useState, useCallback } from 'react';

export type EntityPanelMode = 'closed' | 'overlay' | 'pinned';

export function useLabLayoutState() {
  const [showDocumentSidebar, setShowDocumentSidebar] = useState(false);
  const [entityPanelMode, setEntityPanelMode] = useState<EntityPanelMode>('pinned');
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);

  const toggleDocumentSidebar = useCallback(() => {
    setShowDocumentSidebar(prev => !prev);
  }, []);

  const closeDocumentSidebar = useCallback(() => {
    setShowDocumentSidebar(false);
  }, []);

  const openEntityPanel = useCallback(() => {
    setEntityPanelMode('overlay');
  }, []);

  const closeEntityPanel = useCallback(() => {
    setEntityPanelMode('closed');
  }, []);

  const pinEntityPanel = useCallback(() => {
    setEntityPanelMode('pinned');
  }, []);

  const toggleSettingsDropdown = useCallback(() => {
    setShowSettingsDropdown(prev => !prev);
  }, []);

  const closeSettingsDropdown = useCallback(() => {
    setShowSettingsDropdown(false);
  }, []);

  const openEntityModal = useCallback(() => {
    setShowEntityModal(true);
  }, []);

  const closeEntityModal = useCallback(() => {
    setShowEntityModal(false);
  }, []);

  return {
    // State
    showDocumentSidebar,
    entityPanelMode,
    showSettingsDropdown,
    showEntityModal,

    // Actions
    toggleDocumentSidebar,
    closeDocumentSidebar,
    openEntityPanel,
    closeEntityPanel,
    pinEntityPanel,
    toggleSettingsDropdown,
    closeSettingsDropdown,
    openEntityModal,
    closeEntityModal,
  };
}
