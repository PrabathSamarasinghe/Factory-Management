const React = require('react');
module.exports = {
  SafeAreaProvider: ({ children }) =>
    React.createElement(React.Fragment, null, children),
  SafeAreaView: ({ children, ...props }) =>
    React.createElement('SafeAreaView', props, children),
};
