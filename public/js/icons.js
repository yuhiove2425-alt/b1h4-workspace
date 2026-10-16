const ICONS = {
  home: '<path d="M3.5 10.2 12 3.6l8.5 6.6"/><path d="M5.6 8.9V19a1.4 1.4 0 0 0 1.4 1.4h3.1v-4.6a1.9 1.9 0 0 1 3.8 0v4.6H17a1.4 1.4 0 0 0 1.4-1.4V8.9"/>',
  board: '<rect x="3.2" y="4.2" width="5.2" height="15.6" rx="1.8"/><rect x="10.4" y="4.2" width="5.2" height="10.4" rx="1.8"/><rect x="17.6" y="4.2" width="3.2" height="7.6" rx="1.6"/>',
  list: '<path d="M8.4 6.6h12M8.4 12h12M8.4 17.4h12"/><circle cx="4.3" cy="6.6" r="1.3"/><circle cx="4.3" cy="12" r="1.3"/><circle cx="4.3" cy="17.4" r="1.3"/>',
  calendar: '<rect x="3.2" y="4.8" width="17.6" height="16" rx="3.4"/><path d="M3.2 9.6h17.6M8.2 3.2v3.4M15.8 3.2v3.4"/><circle cx="8.4" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.6" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
  sprint: '<path d="M12 3.4v3.2M12 17.4v3.2M3.4 12h3.2M17.4 12h3.2"/><circle cx="12" cy="12" r="5.4"/><path d="M12 9.2V12l2 1.4"/>',
  chart: '<path d="M4 20.2V4.6"/><path d="M4 20.2h16"/><rect x="7.2" y="12.4" width="3" height="5" rx="1.2"/><rect x="12.1" y="8.4" width="3" height="9" rx="1.2"/><rect x="17" y="10.6" width="3" height="6.8" rx="1.2"/>',
  team: '<circle cx="9.4" cy="8.6" r="3.4"/><path d="M3.4 19.4c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2"/><path d="M16.4 6.1a3.2 3.2 0 0 1 0 6.2M18.1 14.6c1.6.7 2.7 2.1 2.7 4"/>',
  bell: '<path d="M18 15.4V10.8a6 6 0 1 0-12 0v4.6l-1.5 2.2h15z"/><path d="M9.9 20.2a2.3 2.3 0 0 0 4.2 0"/>',
  plus: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/>',
  chevronLeft: '<path d="M14.6 5.6 8.2 12l6.4 6.4"/>',
  chevronRight: '<path d="M9.4 5.6 15.8 12l-6.4 6.4"/>',
  chevronDown: '<path d="M5.6 9.4 12 15.8l6.4-6.4"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 20.4 20.4"/>',
  logout: '<path d="M14.6 7.4V5.6a2 2 0 0 0-2-2H6.2a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h6.4a2 2 0 0 0 2-2v-1.8"/><path d="M9.6 12h10.6M17.2 8.8 20.4 12l-3.2 3.2"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.5 14.2a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1.03-1.56V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1.03H20a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z"/>',
  trash: '<path d="M4.6 6.8h14.8M9.4 6.8V5.2a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.6"/><path d="M6.6 6.8 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.8-12.2"/>',
  check: '<path d="M5.2 12.6 9.8 17 18.8 7.4"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 1.9"/>',
  flag: '<path d="M5.6 20.4V4.2M5.6 5.2h11.2l-1.9 3.6 1.9 3.6H5.6"/>',
  link: '<path d="M10.2 13.8a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7l-1.4 1.4"/><path d="M13.8 10.2a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.4-1.4"/>',
  comment: '<path d="M20.4 12.4a7.4 7.4 0 0 1-8 7.4L4.6 21l1.2-3.2a7.4 7.4 0 1 1 14.6-5.4z"/>',
  bug: '<rect x="7.4" y="7.6" width="9.2" height="11.4" rx="4.6"/><path d="M9.2 7.6a2.8 2.8 0 0 1 5.6 0"/><path d="M3.8 11.4h3.6M16.6 11.4h3.6M3.8 16.4h3.6M16.6 16.4h3.6M5.6 7.2 7.8 8.8M18.4 7.2 16.2 8.8"/>',
  story: '<path d="M5.4 4.6h10a3 3 0 0 1 3 3v11.8H8.4a3 3 0 0 1-3-3z"/><path d="M8.6 8.8h6.6M8.6 12.4h6.6M8.6 16h4"/>',
  epic: '<path d="M13.4 3.2 5.6 13.4h5.2l-.6 7.4 8-10.4h-5.2z"/>',
  task: '<rect x="4.4" y="4.4" width="15.2" height="15.2" rx="4"/><path d="M8.6 12.2l2.4 2.4 4.6-5"/>',
  share: '<circle cx="17.4" cy="5.8" r="2.6"/><circle cx="6.6" cy="12" r="2.6"/><circle cx="17.4" cy="18.2" r="2.6"/><path d="M9 10.7l6-3.4M9 13.3l6 3.4"/>',
  wifi: '<path d="M2.8 9.2a13 13 0 0 1 18.4 0"/><path d="M6.2 12.8a8.2 8.2 0 0 1 11.6 0"/><path d="M9.6 16.4a3.4 3.4 0 0 1 4.8 0"/><circle cx="12" cy="19.8" r="1.1" fill="currentColor" stroke="none"/>',
  edit: '<path d="M15.6 4.6 19.4 8.4"/><path d="M17.2 3 21 6.8 8.6 19.2l-4.6.8.8-4.6z"/>',
  menu: '<path d="M4 6.6h16M4 12h16M4 17.4h16"/>',
  bold: '<path d="M7.2 4.6h6.2a3.6 3.6 0 0 1 0 7.2H7.2zM7.2 11.8h7a3.8 3.8 0 0 1 0 7.6h-7z"/>',
  italic: '<path d="M11 4.6h6M7 19.4h6M14.4 4.6 9.6 19.4"/>',
  heading: '<path d="M5.2 4.6v14.8M15.4 4.6v14.8M5.2 12h10.2"/><path d="M19.6 8.4v-2l-1.7 1"/>',
  quote: '<path d="M7.6 6.6c-2.3 1-3.4 2.9-3.4 5.2 0 1.9 1.1 3.3 2.8 3.3 1.5 0 2.7-1.1 2.7-2.7 0-1.3-.9-2.3-2.1-2.5.2-1.3 1.1-2.3 2.5-2.9zM16.4 6.6c-2.3 1-3.4 2.9-3.4 5.2 0 1.9 1.1 3.3 2.8 3.3 1.5 0 2.7-1.1 2.7-2.7 0-1.3-.9-2.3-2.1-2.5.2-1.3 1.1-2.3 2.5-2.9z"/>',
  wiki: '<path d="M4.4 5.8c2.3-1 4.9-1 7.2.4v12.4c-2.3-1.4-4.9-1.4-7.2-.4z"/><path d="M19.6 5.8c-2.3-1-4.9-1-7.2.4v12.4c2.3-1.4 4.9-1.4 7.2-.4z"/>',
  drag: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  sidebar: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="3.2"/><path d="M14.4 4.4v15.2"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.5 4.1 5.7 4.1 9s-1.5 6.5-4.1 9c-2.6-2.5-4.1-5.7-4.1-9s1.5-6.5 4.1-9z"/>',
  theme: '<circle cx="12" cy="12" r="4.4"/><path d="M12 2.8v2.6M12 18.6v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.8 12h2.6M18.6 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
  person: '<circle cx="12" cy="8.6" r="3.9" fill="currentColor" stroke="none"/><path d="M4.4 20.4c0-4.3 3.4-7.2 7.6-7.2s7.6 2.9 7.6 7.2" fill="currentColor" stroke="none"/>'
};

function icon(name, size) {
  const body = ICONS[name] || '';
  const s = size || 22;
  return `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
