/**
 * The event ⌘=, ⌘− and ⌘0 send before they zoom the page: a free board or the atlas on
 * screen cancels it and zooms itself instead. `detail` is 1 (in), -1 (out) or 0 (back to 100%).
 */
export const BOARD_ZOOM = 'cookbook:board-zoom';
