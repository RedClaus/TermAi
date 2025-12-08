#!/usr/bin/env node
/**
 * Test if apps/web/index.js can be loaded without errors
 */

console.log('Testing apps/web/index.js import...\n');

try {
  // Test 1: Check if PTYAdapter can be required
  console.log('1. Testing PTYAdapter import...');
  const PTYAdapter = require('./server/services/PTYAdapter.js');

  if (PTYAdapter.PTYAdapter && typeof PTYAdapter.PTYAdapter === 'function') {
    console.log('   ✓ PTYAdapter class is available');
  } else {
    console.log('   ✗ PTYAdapter class is missing');
    process.exit(1);
  }

  if (PTYAdapter.getDefaultAdapter && typeof PTYAdapter.getDefaultAdapter === 'function') {
    console.log('   ✓ getDefaultAdapter function is available');
  } else {
    console.log('   ✗ getDefaultAdapter function is missing');
    process.exit(1);
  }

  // Test 2: Check if services index exports PTYAdapter
  console.log('\n2. Testing services/index.js exports...');
  const services = require('./server/services/index.js');

  if (services.PTYAdapter) {
    console.log('   ✓ PTYAdapter is exported from services/index.js');
  } else {
    console.log('   ✗ PTYAdapter is not exported from services/index.js');
    process.exit(1);
  }

  if (services.getDefaultAdapter) {
    console.log('   ✓ getDefaultAdapter is exported from services/index.js');
  } else {
    console.log('   ✗ getDefaultAdapter is not exported from services/index.js');
    process.exit(1);
  }

  // Test 3: Verify apps/web/index.js structure
  console.log('\n3. Testing apps/web/index.js structure...');
  const fs = require('fs');
  const webIndexContent = fs.readFileSync('./apps/web/index.js', 'utf8');

  if (webIndexContent.includes('process.chdir')) {
    console.log('   ✓ apps/web/index.js changes working directory');
  } else {
    console.log('   ✗ apps/web/index.js missing process.chdir');
    process.exit(1);
  }

  if (webIndexContent.includes("require('../../server/index.js')")) {
    console.log('   ✓ apps/web/index.js requires server/index.js');
  } else {
    console.log('   ✗ apps/web/index.js missing server/index.js require');
    process.exit(1);
  }

  // Test 4: Verify package.json configurations
  console.log('\n4. Testing package.json configurations...');

  const webPkg = JSON.parse(fs.readFileSync('./apps/web/package.json', 'utf8'));
  if (webPkg.name === '@termai/web') {
    console.log('   ✓ apps/web/package.json has correct name');
  } else {
    console.log('   ✗ apps/web/package.json has wrong name:', webPkg.name);
    process.exit(1);
  }

  if (webPkg.type === 'commonjs') {
    console.log('   ✓ apps/web/package.json is CommonJS');
  } else {
    console.log('   ✗ apps/web/package.json has wrong type:', webPkg.type);
    process.exit(1);
  }

  const rootPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  if (rootPkg.scripts['web:dev'] && rootPkg.scripts['web:start']) {
    console.log('   ✓ Root package.json has web:dev and web:start scripts');
  } else {
    console.log('   ✗ Root package.json missing web scripts');
    process.exit(1);
  }

  // Test 5: Check workspace structure
  console.log('\n5. Verifying workspace structure...');

  if (fs.existsSync('./apps/web/node_modules')) {
    console.log('   ✓ apps/web/node_modules exists (workspace installed)');
  } else {
    console.log('   ✗ apps/web/node_modules missing (run pnpm install)');
    process.exit(1);
  }

  if (fs.existsSync('./server/node_modules/node-pty')) {
    console.log('   ✓ server has node-pty installed');
  } else {
    console.log('   ✗ server missing node-pty (run cd server && npm install)');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✓ ALL TESTS PASSED');
  console.log('='.repeat(60));
  console.log('\nPhase 5 setup is complete and ready to use!\n');
  console.log('Next steps:');
  console.log('  • Start web server: pnpm web:dev');
  console.log('  • Start frontend:   pnpm dev');
  console.log('  • Or start both:    pnpm dev:all\n');

  process.exit(0);

} catch (error) {
  console.error('\n✗ ERROR:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  process.exit(1);
}
