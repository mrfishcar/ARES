interface HeaderProps {
  project: string;
  onProjectChange?: (project: string) => void;
}

export function Header({ project, onProjectChange }: HeaderProps) {
  const commonProjects = ['default', 'lotr', 'hp', 'starwars'];

  return (
    <header style={{ background: '#2c3e50', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>ARES Review Dashboard</h1>
        <p style={{ margin: '0.5rem 0 0 0', opacity: 0.8 }}>Project: {project}</p>
      </div>
      {onProjectChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem' }}>Switch Project:</label>
          <select
            value={project}
            onChange={(e) => onProjectChange(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '4px',
              border: 'none',
              fontSize: '0.875rem'
            }}
          >
            {commonProjects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
        </div>
      )}
    </header>
  );
}
