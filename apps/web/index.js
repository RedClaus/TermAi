/**
 * @termai/web - Web Server Entry Point
 *
 * This is a wrapper that starts the TermAI server for web deployment.
 * The actual server code lives in /server/ at the project root.
 */

// Change to project root to ensure relative paths work
const path = require('path');
process.chdir(path.join(__dirname, '../..'));

// Start the server
require('../../server/index.js');
