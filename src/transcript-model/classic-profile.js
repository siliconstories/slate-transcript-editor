/**
 * Classic ("Digital Paper Edit") profile — free-text copyediting, the editor's
 * original behavior. Import == convertDpeToSlate; every edit is allowed; export
 * and undo are handled by the editor's built-in menu and Slate's own history
 * (exporters/versioning are null, meaning "use the defaults"). This makes
 * "no profile" literally "the classic profile", so the published API is unchanged.
 */
import convertDpeToSlate from '../util/dpe-to-slate';

export const createClassicProfile = () => ({
  id: 'classic',
  import: (parsed) => ({ value: convertDpeToSlate(parsed), model: null }),
  // Classic is free-text by default ('freestyle' == the Slate paragraph editor) and
  // still offers the word-level grid via Preferences. The toolbar Word|Freestyle
  // switch is strict-only (gated on a versioned profile), so it stays hidden here.
  editPolicy: { allowsStructuralEdits: true, allowsFreeText: true, wordLevelOnly: false, modes: ['freestyle', 'word'], defaultMode: 'freestyle' },
  exporters: null,
  versioning: null,
  reproject: null,
});

export const classicDescriptor = {
  id: 'classic',
  detect: () => true,
  create: createClassicProfile,
};

export default classicDescriptor;
