const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// CodeMirror 6 (used by the Raw-source dialog) ships modern ESM (optional
// chaining, class fields) that webpack 4's parser can't read untranspiled, so
// these packages get their own babel pass that downlevels that syntax.
const CM_PACKAGES = /[\\/]node_modules[\\/](@codemirror|@lezer|crelt|style-mod|w3c-keyname|codemirror)[\\/]/;

module.exports = {
  mode: 'development',
  entry: path.resolve(__dirname, 'standalone.js'),
  output: {
    path: path.resolve(__dirname, '..', 'demo-dist'),
    filename: 'bundle.js',
    publicPath: '',
  },
  resolve: {
    extensions: ['.js', '.json', '.mjs'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            // Target modern browsers so async/await stays native and
            // preset-env does NOT emit regenerator (which would need a
            // runtime polyfill we don't bundle).
            presets: [['@babel/preset-env', { targets: { esmodules: true } }], '@babel/preset-react'],
            plugins: ['transform-react-jsx'],
          },
        },
      },
      {
        // CodeMirror 6: downlevel its modern syntax so webpack 4 can parse it.
        test: /\.m?js$/,
        include: CM_PACKAGES,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            presets: [['@babel/preset-env', { targets: { chrome: '61' } }]],
          },
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'index.html'),
    }),
  ],
};
