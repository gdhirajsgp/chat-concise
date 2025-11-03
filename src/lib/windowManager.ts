interface WindowRefs {
  control: Window | null;
  transcript: Window | null;
  summary: Window | null;
}

let windowRefs: WindowRefs = {
  control: null,
  transcript: null,
  summary: null,
};

export function openRecordingWindows(): WindowRefs {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  // Control window - small, compact (320x450)
  const controlWidth = 320;
  const controlHeight = 450;
  const controlLeft = Math.floor((screenWidth - controlWidth) / 2);
  const controlTop = Math.floor((screenHeight - controlHeight) / 2);

  windowRefs.control = window.open(
    '/recording-control',
    'recordingControl',
    `width=${controlWidth},height=${controlHeight},left=${controlLeft},top=${controlTop},resizable=yes,scrollbars=no,noopener,noreferrer`
  );

  // Focus control window
  if (windowRefs.control && !windowRefs.control.closed) {
    windowRefs.control.focus();
  }

  return windowRefs;
}

export function openTranscriptWindow(): Window | null {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  const transcriptWidth = 350;
  const transcriptHeight = Math.floor(screenHeight * 0.85);
  const transcriptLeft = 20;
  const transcriptTop = 20;

  windowRefs.transcript = window.open(
    '/transcript-window',
    'transcriptWindow',
    `width=${transcriptWidth},height=${transcriptHeight},left=${transcriptLeft},top=${transcriptTop},resizable=yes,scrollbars=yes,noopener,noreferrer`
  );

  if (windowRefs.transcript && !windowRefs.transcript.closed) {
    windowRefs.transcript.focus();
  }

  return windowRefs.transcript;
}

export function openSummaryWindow(): Window | null {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  const summaryWidth = 350;
  const summaryHeight = Math.floor(screenHeight * 0.85);
  const summaryLeft = screenWidth - summaryWidth - 20;
  const summaryTop = 20;

  windowRefs.summary = window.open(
    '/summary-window',
    'summaryWindow',
    `width=${summaryWidth},height=${summaryHeight},left=${summaryLeft},top=${summaryTop},resizable=yes,scrollbars=yes,noopener,noreferrer`
  );

  if (windowRefs.summary && !windowRefs.summary.closed) {
    windowRefs.summary.focus();
  }

  return windowRefs.summary;
}

export function closeRecordingWindows(): void {
  if (windowRefs.control && !windowRefs.control.closed) {
    windowRefs.control.close();
  }
  if (windowRefs.transcript && !windowRefs.transcript.closed) {
    windowRefs.transcript.close();
  }
  if (windowRefs.summary && !windowRefs.summary.closed) {
    windowRefs.summary.close();
  }

  windowRefs = {
    control: null,
    transcript: null,
    summary: null,
  };
}

export function getWindowRefs(): WindowRefs {
  return windowRefs;
}
