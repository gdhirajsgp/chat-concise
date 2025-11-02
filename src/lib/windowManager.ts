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

  // Control window - small, centered
  const controlWidth = 400;
  const controlHeight = 200;
  const controlLeft = Math.floor((screenWidth - controlWidth) / 2);
  const controlTop = Math.floor((screenHeight - controlHeight) / 2);

  windowRefs.control = window.open(
    '/recording-control',
    'recordingControl',
    `width=${controlWidth},height=${controlHeight},left=${controlLeft},top=${controlTop},resizable=yes,scrollbars=no`
  );

  // Transcript window - left side, narrow and tall
  const transcriptWidth = 350;
  const transcriptHeight = Math.floor(screenHeight * 0.85);
  const transcriptLeft = 20;
  const transcriptTop = 20;

  windowRefs.transcript = window.open(
    '/transcript-window',
    'transcriptWindow',
    `width=${transcriptWidth},height=${transcriptHeight},left=${transcriptLeft},top=${transcriptTop},resizable=yes,scrollbars=yes`
  );

  // Summary window - right side, narrow and tall
  const summaryWidth = 350;
  const summaryHeight = Math.floor(screenHeight * 0.85);
  const summaryLeft = screenWidth - summaryWidth - 20;
  const summaryTop = 20;

  windowRefs.summary = window.open(
    '/summary-window',
    'summaryWindow',
    `width=${summaryWidth},height=${summaryHeight},left=${summaryLeft},top=${summaryTop},resizable=yes,scrollbars=yes`
  );

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
