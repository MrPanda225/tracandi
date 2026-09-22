/** Leaves the application for another site (Google's consent page); isolated so that tests can observe it. */
export const leaveFor = (url: string): void => {
  window.location.assign(url);
};
