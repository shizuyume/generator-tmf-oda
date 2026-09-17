const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.output.publicPath = "auto";
      webpackConfig.output.crossOriginLoading = "anonymous";
      webpackConfig.plugins.push(
        new ModuleFederationPlugin({
          name: "revenue_sharing_algorithm_remote",
          filename: "revenueSharingAlgorithmRemoteEntry.js",

          remotes: {
            common_remote:
              `common_remote@${process.env.REACT_APP_COMMON_REMOTE_URL || 'http://localhost:4000'}/commonRemoteEntry.js`,
          },

          exposes: {
            "./App": "./src/App",
            "./PartyRevSharingAlgorithm": "./src/exposes/PartyRevSharingAlgorithm.tsx",
            "./Hub": "./src/exposes/Hub.tsx",
          },

          shared: {
            react: {
              singleton: true,
              requiredVersion: false,
            },
            "react-dom": {
              singleton: true,
              requiredVersion: false,
            },
            "react-router-dom": {
              singleton: true,
              requiredVersion: false,
            },
          },
        })
      );

      return webpackConfig;
    },
  },
};
