export const IOS_TEMPLATE = {
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

export type IosAssetState = {
  title: string;
  titleColor: string;
  backgroundMode: "gradient" | "image";
  baseColor: string;
  glowColor: string;
  backgroundImageSrc: string | null;
  backgroundImageName: string | null;
  screenshotSrc: string;
  screenshotName: string | null;
};

export const defaultIosAssetState: IosAssetState = {
  title: "The only app you need for your event",
  titleColor: "#ffffff",
  backgroundMode: "gradient",
  baseColor: "#050505",
  glowColor: "#6d2cd4",
  backgroundImageSrc: null,
  backgroundImageName: null,
  screenshotSrc: "/assets/ios/placeholder.png",
  screenshotName: null,
};
