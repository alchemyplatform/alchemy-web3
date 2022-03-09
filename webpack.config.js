const path = require("path");

function config(minimize) {
  return {
    entry: { alchemyWeb3: "./dist/esm/index.js" },
    mode: "production",
    output: {
      filename: `[name]${minimize ? ".min" : ""}.js`,
      library: "AlchemyWeb3",
      libraryTarget: "var",
      path: path.resolve(__dirname, "dist"),
    },
    optimization: { minimize },
  };
}

module.exports = [config(true), config(false)];
