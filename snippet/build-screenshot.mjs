import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/screenshot-capture.js'],
  bundle: true,
  format: 'iife',
  globalName: '__ppScreenshotMod',
  minify: true,
  outfile: 'screenshot-bundle.js',
  target: ['es2017'],
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})

console.log('✓ screenshot-bundle.js built')
