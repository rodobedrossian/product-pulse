import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/replay-record.js'],
  bundle: true,
  format: 'iife',
  globalName: '__ppReplayMod',
  minify: true,
  outfile: 'replay-bundle.js',
  target: ['es2017'],
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})

console.log('✓ replay-bundle.js built')
