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
  editPolicy: { allowsStructuralEdits: true, allowsFreeText: true, wordLevelOnly: false },
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
