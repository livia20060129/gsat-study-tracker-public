// Preserve bookmarks to the former standalone management page.
const destination = new URL('./material.progress.html', window.location.href);
destination.search = window.location.search;
destination.hash = window.location.hash;
window.location.replace(destination.href);
export {};
