"use client";

import type { CSSProperties } from "react";
import {
  ANDROID_TEMPLATE,
  defaultIosAssetState,
  type IosAssetState,
} from "@/lib/ios-template";

export const ANDROID_FEATURE_BANNER_WIDTH = 1024;
export const ANDROID_FEATURE_BANNER_HEIGHT = 500;

export type FeatureBannerSlot = "left" | "center" | "right";

type FeatureBannerScreens = Record<FeatureBannerSlot, IosAssetState | null>;

type AndroidFeatureBannerProps = {
  screens: FeatureBannerScreens;
  background?: IosAssetState;
  scale?: number;
  interactive?: boolean;
  activeSlot?: FeatureBannerSlot | null;
  onSlotClick?: (slot: FeatureBannerSlot) => void;
};

type DevicePlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
};

const DEVICE_PLACEMENTS: Record<FeatureBannerSlot, DevicePlacement> = {
  left: { left: 169, top: 176, width: 248, height: 526, zIndex: 1 },
  center: { left: 352, top: 56, width: 320, height: 679, zIndex: 3 },
  right: { left: 607, top: 176, width: 248, height: 526, zIndex: 1 },
};

function screenshotForAsset(asset: IosAssetState | null) {
  if (!asset?.androidScreenshotName) {
    return ANDROID_TEMPLATE.placeholderSrc;
  }

  return asset.androidScreenshotSrc;
}

function FeatureBannerDevice({
  slot,
  asset,
  placement,
  interactive,
  active,
  scale,
  onClick,
}: {
  slot: FeatureBannerSlot;
  asset: IosAssetState | null;
  placement: DevicePlacement;
  interactive: boolean;
  active: boolean;
  scale: number;
  onClick?: () => void;
}) {
  const deviceStyle: CSSProperties = {
    left: placement.left * scale,
    top: placement.top * scale,
    width: placement.width * scale,
    height: placement.height * scale,
    zIndex: placement.zIndex,
  };
  const content = (
    <>
      <span
        aria-hidden="true"
        className="absolute overflow-hidden"
        style={{
          left: "2.979%",
          top: "1.192%",
          width: "94.04%",
          height: "97.81%",
          borderRadius: "6.38% / 3.05%",
        }}
      >
        <img
          alt=""
          className="block h-full w-full object-cover"
          src={screenshotForAsset(asset)}
          draggable={false}
        />
      </span>
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
        src={ANDROID_TEMPLATE.deviceFrameSrc}
        draggable={false}
      />
      {interactive && slot === "center" ? (
        <span
          className="studio-feature-banner-screen-picker-cue"
          aria-hidden="true"
        >
          Choose screen
        </span>
      ) : null}
    </>
  );

  if (!interactive) {
    return (
      <div className="absolute" style={deviceStyle}>
        {content}
      </div>
    );
  }

  const slotLabel = slot === "center" ? "main" : slot;
  return (
    <button
      type="button"
      className="studio-feature-banner-device"
      style={deviceStyle}
      data-feature-banner-slot={slot}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      aria-label={`Choose the ${slotLabel} feature banner screen`}
      aria-expanded={active}
      title="Choose screen"
    >
      {content}
    </button>
  );
}

export function AndroidFeatureBanner({
  screens,
  background,
  scale = 1,
  interactive = false,
  activeSlot = null,
  onSlotClick,
}: AndroidFeatureBannerProps) {
  const backgroundAsset = background ?? screens.center ?? defaultIosAssetState;

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{
        width: ANDROID_FEATURE_BANNER_WIDTH * scale,
        height: ANDROID_FEATURE_BANNER_HEIGHT * scale,
        backgroundColor: backgroundAsset.baseColor,
      }}
    >
      {backgroundAsset.backgroundMode === "image" &&
      backgroundAsset.backgroundImageSrc ? (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full object-cover"
          src={backgroundAsset.backgroundImageSrc}
          draggable={false}
          style={{
            objectPosition: `${
              50 + backgroundAsset.backgroundImagePositionX * 50
            }% ${50 + backgroundAsset.backgroundImagePositionY * 50}%`,
            transform: `scale(${Math.max(
              1,
              backgroundAsset.backgroundImageZoom,
            )})`,
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: -92 * scale,
            top: 295 * scale,
            width: 1208 * scale,
            height: 405 * scale,
            borderRadius: "50%",
            background: `linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, ${backgroundAsset.glowColor} 62%, ${backgroundAsset.glowColor} 100%)`,
            filter: `blur(${64 * scale}px)`,
            opacity: 0.98,
          }}
        />
      )}

      {(["left", "right", "center"] as const).map((slot) => (
        <FeatureBannerDevice
          key={slot}
          slot={slot}
          asset={screens[slot]}
          placement={DEVICE_PLACEMENTS[slot]}
          interactive={interactive}
          active={activeSlot === slot}
          scale={scale}
          onClick={() => onSlotClick?.(slot)}
        />
      ))}
    </div>
  );
}
