const React = require('react');
const c = name => props => React.createElement(name, props, props.children);
module.exports = {
  ActivityIndicator: c('ActivityIndicator'),
  KeyboardAvoidingView: c('KeyboardAvoidingView'),
  Platform: {
    OS: 'test',
    select: obj => obj.default ?? obj.ios ?? obj.android,
  },
  Pressable: c('Pressable'),
  RefreshControl: c('RefreshControl'),
  ScrollView: c('ScrollView'),
  StatusBar: c('StatusBar'),
  StyleSheet: { create: s => s, flatten: s => s },
  Text: c('Text'),
  TextInput: c('TextInput'),
  View: c('View'),
  useWindowDimensions: () => ({ width: 320, height: 640 }),
};
