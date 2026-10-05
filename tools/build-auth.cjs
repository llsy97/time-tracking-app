require('esbuild').buildSync({
  entryPoints: ['auth-client.js'], bundle: true, format: 'iife', target: ['es2020'],
  minify: true, outfile: 'assets/auth.js', legalComments: 'eof'
});
