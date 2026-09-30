/** Leaves the application for another site (Google's consent page); isolated so that tests can observe it. */
export const leaveFor = (url: string): void => {
  window.location.assign(url);
};

/** A tab opened at once, to be sent to its page when it is known. */
export interface PendingTab {
  go: (url: string) => void;
  close: () => void;
}

/**
 * Opens a blank tab during the click itself: a browser blocks a tab opened after waiting for the API. The tab gets
 * no access to this page (`opener` cut). Null-safe: a refused tab turns both actions into no-ops.
 */
export const openPendingTab = (): PendingTab => {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  return {
    go: (url) => {
      if (tab) tab.location.href = url;
    },
    close: () => tab?.close(),
  };
};

/** Saves a file the API gave, as the browser does a download (EF-AUT-12, EF-CVX-31). */
export const saveFile = ({ blob, fileName }: { blob: Blob; fileName: string }): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
