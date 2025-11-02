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

  // Transcript window - left side, narrow and tall (OPEN FIRST)
  const transcriptWidth = 350;
  const transcriptHeight = Math.floor(screenHeight * 0.85);
  const transcriptLeft = 20;
  const transcriptTop = 20;

  windowRefs.transcript = window.open(
    '/transcript-window',
    'transcriptWindow',
    `width=${transcriptWidth},height=${transcriptHeight},left=${transcriptLeft},top=${transcriptTop},resizable=yes,scrollbars=yes,noopener,noreferrer`
  );

  // Summary window - right side, narrow and tall (OPEN SECOND)
  const summaryWidth = 350;
  const summaryHeight = Math.floor(screenHeight * 0.85);
  const summaryLeft = screenWidth - summaryWidth - 20;
  const summaryTop = 20;

  windowRefs.summary = window.open(
    '/summary-window',
    'summaryWindow',
    `width=${summaryWidth},height=${summaryHeight},left=${summaryLeft},top=${summaryTop},resizable=yes,scrollbars=yes,noopener,noreferrer`
  );

  // Control window - small, centered (OPEN LAST, will get focus)
  const controlWidth = 400;
  const controlHeight = 200;
  const controlLeft = Math.floor((screenWidth - controlWidth) / 2);
  const controlTop = Math.floor((screenHeight - controlHeight) / 2);

  windowRefs.control = window.open(
    '/recording-control',
    'recordingControl',
    `width=${controlWidth},height=${controlHeight},left=${controlLeft},top=${controlTop},resizable=yes,scrollbars=no,noopener,noreferrer`
  );

  // Focus control window and blur main window
  if (windowRefs.control && !windowRefs.control.closed) {
    windowRefs.control.focus();
  }
  window.blur();

  return windowRefs;
}

export function ensureWindowsOpen(): WindowRefs {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;

  // Re-open any closed windows
  if (!windowRefs.transcript || windowRefs.transcript.closed) {
    const transcriptWidth = 350;
    const transcriptHeight = Math.floor(screenHeight * 0.85);
    const transcriptLeft = 20;
    const transcriptTop = 20;

    windowRefs.transcript = window.open(
      '/transcript-window',
      'transcriptWindow',
      `width=${transcriptWidth},height=${transcriptHeight},left=${transcriptLeft},top=${transcriptTop},resizable=yes,scrollbars=yes,noopener,noreferrer`
    );
  }

  if (!windowRefs.summary || windowRefs.summary.closed) {
    const summaryWidth = 350;
    const summaryHeight = Math.floor(screenHeight * 0.85);
    const summaryLeft = screenWidth - summaryWidth - 20;
    const summaryTop = 20;

    windowRefs.summary = window.open(
      '/summary-window',
      'summaryWindow',
      `width=${summaryWidth},height=${summaryHeight},left=${summaryLeft},top=${summaryTop},resizable=yes,scrollbars=yes,noopener,noreferrer`
    );
  }

  if (!windowRefs.control || windowRefs.control.closed) {
    const controlWidth = 400;
    const controlHeight = 200;
    const controlLeft = Math.floor((screenWidth - controlWidth) / 2);
    const controlTop = Math.floor((screenHeight - controlHeight) / 2);

    windowRefs.control = window.open(
      '/recording-control',
      'recordingControl',
      `width=${controlWidth},height=${controlHeight},left=${controlLeft},top=${controlTop},resizable=yes,scrollbars=no,noopener,noreferrer`
    );
  }

  return windowRefs;
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
