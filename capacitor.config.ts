import type { CapacitorConfig } from '@capacitor/cli';

/**
 * সালমা ফাস্ট ফুড & বিরিয়ানি হাউস - এডমিন ও পিওএস মোবাইল অ্যাপ কনফিগারেশন
 * 
 * ব্যবহারবিধি:
 * ১. লাইভ মোড (Live URL Mode):
 *    নিচের `server.url`-এ আপনার লাইভ এডমিন লিঙ্ক দিয়ে অ্যাপ তৈরি করলে কোড পরিবর্তন করার পর
 *    নতুন করে আর APK বানাতে হবে না, অ্যাপ স্বয়ংক্রিয়ভাবে লাইভ আপডেট নিয়ে নিবে।
 * 
 * ২. অফলাইন মোড (Offline Bundled Mode):
 *    ইন্টারনেট ছাড়াও যদি অ্যাপ খুলতে চান, তবে `server` অংশটি কমেন্ট আউট করে দিন এবং `webDir: 'dist'` রাখুন।
 */

const config: CapacitorConfig = {
  appId: 'com.salmafood.admin',
  appName: 'সালমা ফুড এডমিন',
  webDir: 'dist',
  
  // লাইভ সার্ভার মোড: সরাসরি আপনার ক্লাউড এডমিন প্যানেল লোড করবে
  server: {
    // লাইভ এডমিন প্যানেলের URL
    url: 'https://ais-pre-y3k5ocegjv4woegs5ivxyp-30233927497.asia-east1.run.app/admin.html',
    cleartext: true,
    androidScheme: 'https',
  },

  // অ্যান্ড্রয়েড স্পেসিফিক সেটিংস
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true, // ডিবাগিং এর জন্য
    backgroundColor: '#991b1b', // ব্র্যান্ড কালার (রেড-৮০০)
  },

  // নেটিভ প্লাগইন কনফিগারেশন
  plugins: {
    // স্প্ল্যাশ স্ক্রিন সেটিংস
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#991b1b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
    // স্ট্যাটাস বার কালার ও স্টাইল
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#991b1b',
      overlaysWebView: false,
    },
    // কীবোর্ড ম্যানেজমেন্ট (POS ও বাকি খাতার জন্য)
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
