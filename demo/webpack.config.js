const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: path.resolve(__dirname, 'standalone.js'),
  output: {
    path: path.resolve(__dirname, '..', 'demo-dist'),
    filename: 'bundle.js',
    publicPath: '',
  },
  resolve: {
    extensions: ['.js', '.json'],
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
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'index.html'),
    }),
  ],
};
