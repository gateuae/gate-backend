/**
 * GoDaddy / cPanel Phusion Passenger entry point
 * Bridges app.js to server.js for hosts expecting app.js as the startup file.
 */
import app from './server.js';

export default app;
