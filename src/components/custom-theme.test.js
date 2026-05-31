import { createTheme } from '@mui/material/styles';
import { lightBlue, red } from '@mui/material/colors';

// Storybook is intentionally non-building between Phase 5 (MUI modern) and
// Phase 7 (Storybook rebuilt), so 6-CustomTheme.stories.js can't be the gate
// for the custom-theme path. This mirrors exactly what that story does so the
// createTheme() palette path stays verified across the MUI v5→v9 steps.
describe('custom theme (6-CustomTheme story path)', () => {
  const buildTheme = () =>
    createTheme({
      palette: {
        primary: { main: lightBlue['500'] },
        secondary: { main: red['500'] },
      },
    });

  it('returns a valid MUI theme with the configured palette', () => {
    const theme = buildTheme();
    expect(theme.palette.primary.main).toBe(lightBlue['500']);
    expect(theme.palette.secondary.main).toBe(red['500']);
  });

  it('produces the structural theme API consumers rely on', () => {
    const theme = buildTheme();
    expect(typeof theme.spacing).toBe('function');
    expect(theme.spacing(2)).toBe('16px');
    expect(theme.breakpoints.values).toMatchObject({ xs: 0, sm: 600, md: 900 });
    expect(theme.palette.mode).toBe('light');
  });
});
