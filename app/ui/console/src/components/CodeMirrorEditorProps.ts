export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  project?: string;
  noteId?: string;
  disableHighlighting?: boolean;
  enableWYSIWYG?: boolean;
}
