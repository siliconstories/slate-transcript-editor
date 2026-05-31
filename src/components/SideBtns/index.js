import React, { useState, useEffect } from 'react';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import Link from '@mui/material/Link';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import KeyboardReturnOutlinedIcon from '@mui/icons-material/KeyboardReturnOutlined';
import MusicNoteOutlinedIcon from '@mui/icons-material/MusicNoteOutlined';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import CachedOutlinedIcon from '@mui/icons-material/CachedOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import RedoIcon from '@mui/icons-material/Redo';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import EmojiSymbolsOutlinedIcon from '@mui/icons-material/EmojiSymbolsOutlined';
import subtitlesExportOptionsList from '../../util/export-adapters/subtitles-generator/list.js';

function SideBtns({
  handleExport,
  isProcessing,
  isContentModified,
  isContentSaved,
  setIsProcessing,
  insertTextInaudible,
  handleInsertMusicNote,
  handleSplitParagraph,
  handleRestoreTimecodes,
  handleReplaceText,
  handleSave,
  handleAnalyticsEvents,
  REPLACE_WHOLE_TEXT_INSTRUCTION,
  optionalBtns,
  handleUndo,
  handleRedo,
  isEditable,
  exporters,
  allowReplaceText = true,
}) {
  const [anchorMenuEl, setAnchorMenuEl] = useState(null);

  // used by MUI export menu
  const handleMenuClose = () => {
    setAnchorMenuEl(null);
  };

  // used by MUI export menu
  const handleMenuClick = (event) => {
    setAnchorMenuEl(event.currentTarget);
  };

  return (
    <Grid container direction="column" sx={{ justifyContent: 'flex-start', alignItems: 'stretch' }}>
      <Grid>
        <Tooltip title={<Typography variant="body1">Export options</Typography>}>
          <Button aria-controls="simple-menu" aria-haspopup="true" onClick={handleMenuClick}>
            <SaveAltIcon color="primary" /> <KeyboardArrowDownIcon color="primary" />
          </Button>
        </Tooltip>
        <Menu id="simple-menu" anchorEl={anchorMenuEl} keepMounted open={Boolean(anchorMenuEl)} onClose={handleMenuClose}>
          <MenuItem onClick={handleMenuClose} disabled>
            <Link style={{ color: 'black' }}>Text Export</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'text',
                ext: 'txt',
                speakers: false,
                timecodes: false,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary">
              Text (<code>.txt</code>)
            </Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'text',
                ext: 'txt',
                speakers: true,
                timecodes: false,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary">Text (Speakers)</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'text',
                ext: 'txt',
                speakers: false,
                timecodes: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary">Text (Timecodes)</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'text',
                ext: 'txt',
                speakers: true,
                timecodes: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary"> Text (Speakers & Timecodes)</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'text',
                ext: 'txt',
                speakers: true,
                timecodes: true,
                atlasFormat: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary"> Text (Atlas format)</Link>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'word',
                ext: 'docx',
                speakers: false,
                timecodes: false,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary">
              {' '}
              Word (<code>.docx</code>)
            </Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'word',
                ext: 'docx',
                speakers: true,
                timecodes: false,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary"> Word (Speakers)</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'word',
                ext: 'docx',
                speakers: false,
                timecodes: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary"> Word (Timecodes)</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'word',
                ext: 'docx',
                speakers: true,
                timecodes: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary"> Word (Speakers & Timecodes)</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'word',
                ext: 'docx',
                speakers: false,
                timecodes: false,
                inlineTimecodes: true,
                hideTitle: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary"> Word (OHMS)</Link>
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleMenuClose} disabled>
            <Link style={{ color: 'black' }}>Closed Captions Export</Link>
          </MenuItem>
          {subtitlesExportOptionsList.map(({ type, label, ext }, index) => {
            return (
              <MenuItem
                key={index + label}
                onClick={() => {
                  handleExport({ type, ext, isDownload: true });
                  handleMenuClose();
                }}
              >
                <Link color="primary">
                  {label} (<code>.{ext}</code>)
                </Link>
              </MenuItem>
            );
          })}
          <Divider />
          <MenuItem onClick={handleMenuClose} disabled>
            <Link style={{ color: 'black' }}>Developer options</Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'json-slate',
                ext: 'json',
                speakers: true,
                timecodes: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary">
              SlateJs (<code>.json</code>)
            </Link>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleExport({
                type: 'json-digitalpaperedit',
                ext: 'json',
                speakers: true,
                timecodes: true,
                isDownload: true,
              });
              handleMenuClose();
            }}
          >
            <Link color="primary">
              DPE (<code>.json</code>)
            </Link>
          </MenuItem>
          {exporters && exporters.length > 0 && <Divider />}
          {(exporters || []).map(({ id, label, ext }, index) => (
            <MenuItem
              key={`profile-exporter-${index}`}
              onClick={() => {
                handleExport({ type: id, ext, isDownload: true });
                handleMenuClose();
              }}
            >
              <Link color="primary">
                {label} (<code>.{ext}</code>)
              </Link>
            </MenuItem>
          ))}
        </Menu>

        {isEditable && (
          <Tooltip title={<Typography variant="body1">save</Typography>}>
            <Button disabled={isProcessing} onClick={handleSave} color="primary">
              <SaveOutlinedIcon color={isContentSaved ? 'primary' : 'secondary'} />
            </Button>
          </Tooltip>
        )}
      </Grid>
      {isEditable && (
        <>
          {/* TODO: Disabiling until find a way to handle timecodes and alignment on paragraph break */}
          {/* <Tooltip
        title={`To insert a paragraph break, and split a pargraph in two, put the cursor at a point where you'd want to add a paragraph break in the text and either click this button or hit enter key`}
      >
        <Button disabled={isProcessing} onClick={handleSplitParagraph} color="primary">
          <KeyboardReturnOutlinedIcon color="primary" />
        </Button>
      </Tooltip> */}
          {/*  */}
          <Grid>
            <br />
          </Grid>
          <Grid>
            <Tooltip
              title={
                <Typography variant="body1">Put the cursor at a point where you'd want to add [INAUDIBLE] text, and click this button</Typography>
              }
            >
              <Button disabled={isProcessing} onClick={insertTextInaudible} color="primary">
                <EmojiSymbolsOutlinedIcon color="primary" />
              </Button>
            </Tooltip>

            <Tooltip title={<Typography variant="body1">Insert a ♪ in the text</Typography>}>
              <Button disabled={isProcessing} onClick={handleInsertMusicNote} color="primary">
                <MusicNoteOutlinedIcon color="primary" />
              </Button>
            </Tooltip>
          </Grid>

          {/*  */}
          <Grid>
            <br />
          </Grid>
          <Grid>
            <Tooltip
              title={
                <Typography variant="body1">
                  Undo <br />
                  <code>cmd</code> <code>z</code>
                </Typography>
              }
            >
              <Button onClick={handleUndo} color="primary">
                <UndoOutlinedIcon color="primary" />
              </Button>
            </Tooltip>

            <Tooltip
              title={
                <Typography variant="body1">
                  Redo <br /> <code>cmd</code> <code>shift</code> <code>z</code>
                </Typography>
              }
            >
              <Button onClick={handleRedo} color="primary">
                <RedoIcon color="primary" />
              </Button>
            </Tooltip>
          </Grid>
          {/* <Tooltip
        title={
          ' Restore timecodes. At the moment for transcript over 1hour it could temporarily freeze the UI for a few seconds'
        }
      >
        <Button
          disabled={isProcessing}
          onClick={async () => {
            try {
              setIsProcessing(true);
              await handleRestoreTimecodes();
              if (handleAnalyticsEvents) {
                // handles if click cancel and doesn't set speaker name
                handleAnalyticsEvents('ste_handle_restore_timecodes_btn', {
                  fn: 'handleRestoreTimecodes',
                });
              }
            } finally {
              setIsProcessing(false);
            }
          }}
          color="primary"
        >
          <CachedOutlinedIcon
            color={'primary'}
            // color={isContentModified ? 'secondary' : 'primary'}
          />
        </Button>
      </Tooltip> */}
          {/*  */}
          <Grid>
            <br />
          </Grid>
          {allowReplaceText && (
            <Grid>
              <Tooltip title={<Typography variant="body1">{REPLACE_WHOLE_TEXT_INSTRUCTION}</Typography>}>
                <Button onClick={handleReplaceText} color="primary">
                  <ImportExportIcon color="primary" />
                </Button>
              </Tooltip>
            </Grid>
          )}
          {/* <Tooltip title={' Double click on a word to jump to the corresponding point in the media'}>
        <Button disabled={isProcessing} color="primary">
          <InfoOutlined color="primary" />
        </Button>
      </Tooltip> */}
        </>
      )}
      <Grid>
        <br />
      </Grid>
      <Grid>{optionalBtns}</Grid>
    </Grid>
  );
}

export default SideBtns;
