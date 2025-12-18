import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function BookNLPPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/booknlp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        try {
          const json = JSON.parse(bodyText);
          throw new Error(json.error || bodyText || 'Request failed');
        } catch {
          throw new Error(bodyText || 'Request failed');
        }
      }
      const json = JSON.parse(bodyText);
      setResult(json);
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  return (
    <div className="page booknlp-page">
      <div className="booknlp-header">
        <div>
          <h1>BookNLP Quick Test</h1>
          <p className="muted">
            Paste text, run BookNLP, and copy the raw JSON output (no ARES extraction).
          </p>
        </div>
        <div className="booknlp-actions">
          <button onClick={run} disabled={loading || text.trim().length === 0} className="primary">
            {loading ? 'Running…' : 'Run'}
          </button>
          <button onClick={copy} disabled={!result}>
            Copy JSON
          </button>
        </div>
      </div>

      <div className="booknlp-grid">
        <div className="booknlp-input">
          <label>Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text to analyze…"
            rows={16}
          />
        </div>

        <div className="booknlp-output">
          <label>Output</label>
          <div className="booknlp-output-box">
            {loading && <div className="muted">Running BookNLP…</div>}
            {error && <div className="error">{error}</div>}
            {!loading && !error && result && (
              <pre>{JSON.stringify(result, null, 2)}</pre>
            )}
            {!loading && !error && !result && (
              <div className="muted">No output yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
