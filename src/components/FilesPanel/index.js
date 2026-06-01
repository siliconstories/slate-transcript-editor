import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';

// Hairline palette (matches EditorToolbar + the media transport).
const C = {
  text: '#18181b',
  muted: '#71717a',
  faint: '#a1a1aa',
  line: '#e4e4e7',
  line2: '#d4d4d8',
  bg: '#ffffff',
  soft: '#f4f4f5',
};
const SANS = 'Inter, Roboto, system-ui, sans-serif';

const S = {
  wrap: { fontFamily: SANS, color: C.text, padding: '4px 2px 8px' },
  filter: {
    width: '100%',
    boxSizing: 'border-box',
    height: 34,
    border: `1px solid ${C.line2}`,
    borderRadius: 8,
    padding: '0 11px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: C.text,
    outline: 'none',
    marginBottom: 10,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    border: `1px solid ${active ? C.line2 : 'transparent'}`,
    borderLeft: `3px solid ${active ? C.text : 'transparent'}`,
    background: active ? C.soft : 'transparent',
    borderRadius: 8,
    padding: '9px 10px 9px 11px',
    fontFamily: 'inherit',
  }),
  rowMain: { flex: 1, minWidth: 0 },
  label: (active) => ({
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    color: C.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  sublabel: { fontSize: 12, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  remove: {
    flex: '0 0 auto',
    width: 26,
    height: 26,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontSize: 13, color: C.faint, padding: '14px 4px', fontStyle: 'italic' },
};

const STYLE_TAG = `
  .stf-row:hover { background: ${C.soft} !important; }
  .stf-remove:hover { background: #e4e4e7 !important; color: ${C.text} !important; }
  .stf-filter:focus { border-color: ${C.muted} !important; }
`;

function FilesPanel({ files, activeId, onSelect, onRemove }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => `${f.label || ''} ${f.sublabel || ''}`.toLowerCase().includes(q));
  }, [files, query]);

  return (
    <div style={S.wrap}>
      <style>{STYLE_TAG}</style>
      <input
        className="stf-filter"
        style={S.filter}
        type="text"
        placeholder="Filter files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {files.length === 0 ? (
        <div style={S.empty}>No files.</div>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>No matches for “{query}”.</div>
      ) : (
        <div style={S.list}>
          {filtered.map((f) => {
            const active = f.id === activeId;
            return (
              <div key={f.id} className="stf-row" style={S.row(active)} role="button" tabIndex={0} onClick={() => onSelect && onSelect(f.id)}>
                <div style={S.rowMain}>
                  <div style={S.label(active)}>{f.label}</div>
                  {f.sublabel ? <div style={S.sublabel}>{f.sublabel}</div> : null}
                </div>
                {onRemove && (
                  <button
                    type="button"
                    className="stf-remove"
                    style={S.remove}
                    title="Remove from list"
                    aria-label={`Remove ${f.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(f.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

FilesPanel.propTypes = {
  files: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      sublabel: PropTypes.string,
    })
  ),
  activeId: PropTypes.string,
  onSelect: PropTypes.func,
  onRemove: PropTypes.func,
};

FilesPanel.defaultProps = {
  files: [],
};

export default FilesPanel;
