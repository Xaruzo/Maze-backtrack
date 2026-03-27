/**
 * APP ENTRY POINT
 * Boots the application after the DOM is fully loaded.
 * model.js → view.js → controller.js must all load before this runs.
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  Controller.init();
});
