/* Regenerates public/index-template.js from public/index.html.
 * The template ships as a JS module so serverless functions bundle it
 * automatically with zero platform config (no includeFiles needed).
 * Run after editing index.html:  node test/build-template.js
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const out = '/* GENERATED from index.html by test/build-template.js — do not edit by hand. */\n'
  + 'module.exports = ' + JSON.stringify(html) + ';\n';
fs.writeFileSync(path.join(__dirname, '../public/index-template.js'), out);
console.log('index-template.js regenerated,', out.length, 'bytes');
