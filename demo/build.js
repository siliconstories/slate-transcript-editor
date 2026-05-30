// Builds the standalone playground via webpack's Node API.
// Used instead of the webpack CLI so no extra dependency (webpack-cli) is needed.
const webpack = require('webpack');
const config = require('./webpack.config.js');

webpack(config, (err, stats) => {
  if (err) {
    console.error(err.stack || err);
    if (err.details) console.error(err.details);
    process.exit(1);
  }
  console.log(stats.toString({ colors: true, chunks: false, modules: false, children: false }));
  process.exit(stats.hasErrors() ? 1 : 0);
});
