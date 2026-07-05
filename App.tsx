/**
 * Journey Split - React Native WebView APK
 * HTML 100% unmodified - Runtime JS injection only
 */
import React, {useCallback, useRef} from 'react';
import {Alert, Platform, StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import RNFS from 'react-native-fs';

const htmlSource = Platform.select({
  android: {uri: 'file:///android_asset/index.html'},
  ios: {uri: 'index.html'},
});

// ============================================================
// Injected JavaScript - runs AFTER page load (HTML untouched)
// Intercepts jsPDF's doc.save() to capture PDF data
// ============================================================
const INJECTED_JS = `
(function() {
  'use strict';
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.prototype) {
    var origSave = window.jspdf.jsPDF.prototype.save;
    window.jspdf.jsPDF.prototype.save = function(filename) {
      try {
        var dataUri = this.output('datauristring');
        if (dataUri && dataUri.indexOf('data:application/pdf') === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PDF_SAVE',
            filename: filename || 'report.pdf',
            data: dataUri
          }));
        }
      } catch(e) {
        console.error('PDF capture error:', e);
      }
      try { origSave.call(this, filename); } catch(e) {
        console.error('Original save error:', e);
      }
    };
  }
})();
`;

function AppContent() {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef(null);

  const handleMessage = useCallback(async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PDF_SAVE') {
        // Extract base64 from data URI: "data:application/pdf;base64,XXXXX"
        const base64Match = msg.data.match(/base64,(.+)/);
        if (!base64Match) {
          Alert.alert('Export Error', 'Invalid PDF data format');
          return;
        }
        const base64Data = base64Match[1];
        const filename = msg.filename || 'report.pdf';
        const filePath = RNFS.DownloadDirectoryPath + '/' + filename;

        await RNFS.writeFile(filePath, base64Data, 'base64');
        Alert.alert(
          '✅ PDF Saved!',
          'File: Downloads/' + filename,
        );
      }
    } catch (e) {
      Alert.alert('Export Error', e.message || 'Failed to save PDF');
    }
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />
      <WebView
        ref={webviewRef}
        source={htmlSource}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        overScrollMode="never"
        bounces={false}
        originWhitelist={['*']}
        injectedJavaScript={INJECTED_JS}
        onMessage={handleMessage}
        cacheEnabled={false}
      />
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0B0F19'},
  webview: {flex: 1, backgroundColor: '#0B0F19'},
});

export default App;
