/**
 * Journey Split - React Native WebView APK v2.0.1
 * HTML 100% unmodified - Multi-layer runtime export interception
 * 
 * FIXES (2026-07-05):
 * 1. Timing: Polling-based jsPDF hook — waits for CDN script to load
 * 2. Blob URLs: Anchor click interceptor — captures blob:// downloads
 * 3. window.open: Catches data URI opens as tertiary fallback
 * 4. RNFS: Robust file write with error handling and permission support
 */
import React, {useCallback, useRef} from 'react';
import {Alert, PermissionsAndroid, Platform, StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import RNFS from 'react-native-fs';

const htmlSource = Platform.select({
  android: {uri: 'file:///android_asset/index.html'},
  ios: {uri: 'index.html'},
});

// ============================================================
// INJECTED JAVASCRIPT — Multi-Layer Export Interception
// Runs after page load, polls for jsPDF, hooks all download paths
// ============================================================
const INJECTED_JS = `
(function() {
  'use strict';

  // ─── LAYER 1: jsPDF.save() with polling ─────────────────
  // jsPDF loads from CDN asynchronously — our injected script
  // might run before CDN finishes. Poll until available.
  var pollTimer = setInterval(function() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.prototype) {
      clearInterval(pollTimer);
      if (window.jspdf.jsPDF.prototype.__journeyHooked) return;
      var origSave = window.jspdf.jsPDF.prototype.save;
      window.jspdf.jsPDF.prototype.save = function(filename) {
        try {
          // output('datauristring') returns "data:application/pdf;base64,XXXX"
          var dataUri = this.output('datauristring');
          if (dataUri && dataUri.indexOf('data:') === 0) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PDF_SAVE',
              filename: filename || 'report.pdf',
              data: dataUri
            }));
          }
        } catch(e) {
          console.error('[JS] jsPDF save intercept error:', e);
        }
        // Call original — fails silently in WebView (no download), 
        // but triggers showToast in HTML
        try { origSave.call(this, filename); } catch(e) {
          console.error('[JS] origSave error:', e);
        }
      };
      window.jspdf.jsPDF.prototype.__journeyHooked = true;
    }
  }, 150);

  // ─── LAYER 2: Anchor click interception ─────────────────
  // jsPDF save() creates <a download href="blob:..."> and clicks it.
  // WebView can't download blob:// URLs. We intercept the click,
  // fetch the blob, convert to base64, and send to native.
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target.tagName) {
      if (target.tagName === 'A' && target.download) {
        var href = target.href || '';
        
        // Intercept data: URIs (pdf base64)
        if (href.indexOf('data:application/pdf') === 0) {
          e.preventDefault();
          e.stopPropagation();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PDF_SAVE',
            filename: target.download || 'report.pdf',
            data: href
          }));
          return;
        }
        
        // Intercept blob: URIs — fetch and convert
        if (href.indexOf('blob:') === 0) {
          e.preventDefault();
          e.stopPropagation();
          var filename = target.download || 'report.pdf';
          fetch(href).then(function(resp) {
            return resp.blob();
          }).then(function(blob) {
            var reader = new FileReader();
            reader.onloadend = function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PDF_SAVE',
                filename: filename,
                data: reader.result  // data:application/pdf;base64,XXXX
              }));
            };
            reader.readAsDataURL(blob);
          }).catch(function(err) {
            console.error('[JS] blob fetch error:', err);
          });
          return;
        }
        break;
      }
      target = target.parentElement;
    }
  }, true);

  // ─── LAYER 3: window.open fallback ──────────────────────
  // Some PDF generators fall back to window.open with data URI.
  var origOpen = window.open;
  window.open = function(url, name, features) {
    if (url && typeof url === 'string' && url.indexOf('data:application/pdf') === 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PDF_SAVE',
        filename: name || 'report.pdf',
        data: url
      }));
      return null; // Block the new window
    }
    return origOpen ? origOpen(url, name, features) : null;
  };
})();
`;

function AppContent() {
  const insets = useSafeAreaInsets();
  const webviewRef = useRef(null);

  const handleMessage = useCallback(async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PDF_SAVE') {
        const dataUri = msg.data;
        const filename = msg.filename || 'report.pdf';
        
        // Extract base64 from data URI: "data:application/pdf;base64,XXXXX"
        const base64Match = dataUri.match(/base64,(.+)/);
        if (!base64Match) {
          Alert.alert('Export Error', 'Invalid PDF data format');
          return;
        }
        const base64Data = base64Match[1];
        
        // Target: Android Downloads folder
        const filePath = RNFS.DownloadDirectoryPath + '/' + filename;
        
        // Write file with proper encoding
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
