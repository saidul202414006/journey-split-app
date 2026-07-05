/**
 * Journey Split - React Native WebView APK v2.0.2
 * 
 * EXPORT PDF FIX - Complete rewrite v2
 * =====================================
 * Old approach (FAILED): jsPDF.prototype.save hook → RNFS.writeFile
 *   - postMessage size limit → silent failure
 *   - Scoped Storage → RNFS direct path blocked on Android 11+
 * 
 * New approach (FIXED): HTML → postMessage → react-native-blob-util → MediaStore
 *   - HTML exportReport() directly sends base64 via postMessage
 *   - react-native-blob-util writes to temp cache
 *   - MediaStore API saves to Downloads (official Android API)
 *   - Fallback: direct file write for older Android
 *   - System notification via Alert
 */
import React, {useCallback, useRef} from 'react';
import {Alert, Platform, StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import ReactNativeBlobUtil from 'react-native-blob-util';

const htmlSource = Platform.select({
  android: {uri: 'file:///android_asset/index.html'},
  ios: {uri: 'index.html'},
});

/**
 * Handle PDF save from WebView
 * Architecture:
 *   HTML → doc.output('blob') → FileReader.readAsDataURL() → postMessage → here
 *   → Temp cache file → MediaStore.copyToMediaStore() → /storage/emulated/0/Download/
 *   → Clean up temp file
 */
async function handlePDFSave(dataUri, filename) {
  // Extract base64 from "data:application/pdf;base64,XXXXX"
  const commaIndex = dataUri.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Invalid PDF data format');
  }
  const base64Data = dataUri.substring(commaIndex + 1);

  const tempFile = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;

  // Step 1: Write base64 to temp cache file
  await ReactNativeBlobUtil.fs.writeFile(tempFile, base64Data, 'base64');

  try {
    // Step 2: PRIMARY — MediaStore API (Android official, works on ALL versions)
    // Uses ContentResolver + MediaStore.Downloads for proper Scoped Storage handling
    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      {
        name: filename,
        parentFolder: 'Download',
        mimeType: 'application/pdf',
      },
      'Download',
      tempFile,
    );
  } catch (mediaStoreError) {
    // Step 2b: FALLBACK — Direct file write (Android 9 and below)
    // Where MediaStore API is not available or fails
    const fallbackPath =
      ReactNativeBlobUtil.fs.dirs.DownloadDir + '/' + filename;
    await ReactNativeBlobUtil.fs.writeFile(fallbackPath, base64Data, 'base64');
  }

  // Step 3: Clean up temp file
  try {
    await ReactNativeBlobUtil.fs.unlink(tempFile);
  } catch (_) {
    // Temp file cleanup is best-effort
  }
}

function AppContent() {
  const webviewRef = useRef(null);

  const handleMessage = useCallback(async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PDF_SAVE') {
        await handlePDFSave(msg.data, msg.filename || 'report.pdf');
        Alert.alert('✅ PDF Saved!', 'File: Download/' + msg.filename);
      }
    } catch (e) {
      Alert.alert('❌ Export Error', e.message || 'Failed to save PDF');
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
