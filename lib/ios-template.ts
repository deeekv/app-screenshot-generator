export const IOS_TEMPLATE = {
  platform: "ios",
  deviceLabel: "iOS 6.5 inch",
  deviceSlug: "ios-6-5-inch",
  deviceFrameSrc: "/assets/ios/frame.png",
  placeholderSrc: "/assets/ios/placeholder.png",
  titleFontFamily: "Helvetica, Arial, sans-serif",
  screenshotBorderRadius: 40,
  exportWidth: 1242,
  exportHeight: 2688,
  previewScale: 0.24,
  stage: {
    width: 1242,
    height: 2688,
  },
  title: {
    left: 118.5,
    top: 156.9688,
    width: 1005,
    height: 226,
    fontSize: 92.597,
    lineHeight: 112.968,
    letterSpacing: -1.8519,
  },
  screenshot: {
    left: 199.207,
    top: 623.09,
    width: 845,
    height: 1829,
  },
  deviceFrame: {
    left: 151.629,
    top: 582.18,
    width: 938,
    height: 1913,
  },
  backgroundShape: {
    left: -858.724,
    top: 950,
    width: 3401.16,
    height: 2547.29,
  },
  bottomGlow: {
    left: -120,
    bottom: -24,
    width: 1482,
    height: 940,
    blur: 84,
  },
} as const;

// The 5.5-inch Figma frame uses the same composition as 6.5-inch. Its device
// artwork is a uniform 79.917% scale of the 6.5-inch device; text is unchanged.
const IOS_5_5_DEVICE_SCALE = 749.811 / IOS_TEMPLATE.deviceFrame.width;

export const IOS_5_5_TEMPLATE = {
  ...IOS_TEMPLATE,
  deviceLabel: "iOS 5.5 inch",
  deviceSlug: "ios-5-5-inch",
  exportHeight: 2208,
  stage: {
    width: 1242,
    height: 2208,
  },
  screenshot: {
    left:
      (IOS_TEMPLATE.stage.width - IOS_TEMPLATE.deviceFrame.width * IOS_5_5_DEVICE_SCALE) /
        2 +
      (IOS_TEMPLATE.screenshot.left - IOS_TEMPLATE.deviceFrame.left) *
        IOS_5_5_DEVICE_SCALE,
    top:
      512 +
      (IOS_TEMPLATE.screenshot.top - IOS_TEMPLATE.deviceFrame.top) *
        IOS_5_5_DEVICE_SCALE,
    width: IOS_TEMPLATE.screenshot.width * IOS_5_5_DEVICE_SCALE,
    height: IOS_TEMPLATE.screenshot.height * IOS_5_5_DEVICE_SCALE,
  },
  deviceFrame: {
    ...IOS_TEMPLATE.deviceFrame,
    left:
      (IOS_TEMPLATE.stage.width - IOS_TEMPLATE.deviceFrame.width * IOS_5_5_DEVICE_SCALE) /
      2,
    top: 512,
    width: IOS_TEMPLATE.deviceFrame.width * IOS_5_5_DEVICE_SCALE,
    height: IOS_TEMPLATE.deviceFrame.height * IOS_5_5_DEVICE_SCALE,
  },
  backgroundShape: {
    ...IOS_TEMPLATE.backgroundShape,
    top: 780.307,
    height: 2092.5,
  },
  bottomGlow: {
    ...IOS_TEMPLATE.bottomGlow,
    height: 772,
  },
} as const;

export const ANDROID_TEMPLATE = {
  ...IOS_5_5_TEMPLATE,
  platform: "android",
  deviceLabel: "Android 6.8 inch",
  deviceSlug: "android-6-8-inch",
  deviceFrameSrc: "/assets/android/frame.png",
  placeholderSrc: "/assets/android/placeholder.png",
  titleFontFamily: "Roboto, Arial, sans-serif",
  screenshotBorderRadius: 48,
  screenshot: {
    left: 265.4895,
    top: 529.633,
    width: 706.198,
    height: 1559.254,
  },
  deviceFrame: {
    left: 244.7685,
    top: 511.51,
    width: 752.5,
    height: 1596,
  },
} as const;

export type IosTemplate =
  | typeof IOS_TEMPLATE
  | typeof IOS_5_5_TEMPLATE
  | typeof ANDROID_TEMPLATE;

export type StorePlatform = IosTemplate["platform"];

export type IosAssetState = {
  title: string;
  titleColor: string;
  backgroundMode: "gradient" | "image";
  baseColor: string;
  glowColor: string;
  backgroundImageSrc: string | null;
  backgroundImageName: string | null;
  backgroundImagePositionX: number;
  backgroundImagePositionY: number;
  backgroundImageZoom: number;
  screenshotSrc: string;
  screenshotName: string | null;
  androidScreenshotSrc: string;
  androidScreenshotName: string | null;
};

export const defaultIosAssetState: IosAssetState = {
  title: "The only app you need for your event",
  titleColor: "#ffffff",
  backgroundMode: "gradient",
  baseColor: "#050505",
  glowColor: "#6d2cd4",
  backgroundImageSrc: null,
  backgroundImageName: null,
  backgroundImagePositionX: 0,
  backgroundImagePositionY: 0,
  backgroundImageZoom: 1,
  screenshotSrc: "/assets/ios/placeholder.png",
  screenshotName: null,
  androidScreenshotSrc: "/assets/android/placeholder.png",
  androidScreenshotName: null,
};
