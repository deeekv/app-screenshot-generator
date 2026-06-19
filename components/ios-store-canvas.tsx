"use client";

import { CSSProperties, KeyboardEvent } from "react";
import { IOS_TEMPLATE, type IosAssetState } from "@/lib/ios-template";

type IosStoreCanvasProps = {
  asset: IosAssetState;
  interactive?: boolean;
  scale?: number;
  isTitleEditing?: boolean;
  titleDraft?: string;
  onTitleChange?: (value: string) => void;
  onTitleClick?: () => void;
  onTitleBlur?: () => void;
  onTitleKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function IosStoreCanvas({
  asset,
  interactive = false,
  scale = 1,
  isTitleEditing = false,
  titleDraft,
  onTitleChange,
  onTitleClick,
  onTitleBlur,
  onTitleKeyDown,
}: IosStoreCanvasProps) {
  const shellStyle: CSSProperties = {
    width: IOS_TEMPLATE.exportWidth,
    height: IOS_TEMPLATE.exportHeight,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };

  const previewHeight = IOS_TEMPLATE.exportHeight * scale;
  const previewWidth = IOS_TEMPLATE.exportWidth * scale;

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ width: previewWidth, height: previewHeight }}
    >
      <div className="absolute left-0 top-0" style={shellStyle}>
        <div
          className="relative overflow-hidden bg-black"
          style={{
            width: IOS_TEMPLATE.stage.width,
            height: IOS_TEMPLATE.stage.height,
            backgroundColor: asset.baseColor,
          }}
        >
          {asset.backgroundMode === "image" && asset.backgroundImageSrc ? (
            <img
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 block h-full w-full object-cover"
              src={asset.backgroundImageSrc}
            />
          ) : (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: IOS_TEMPLATE.bottomGlow.left,
                  bottom: IOS_TEMPLATE.bottomGlow.bottom,
                  width: IOS_TEMPLATE.bottomGlow.width,
                  height: IOS_TEMPLATE.bottomGlow.height,
                  borderRadius: "9999px",
                  background: `linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, ${asset.glowColor} 100%)`,
                  filter: `blur(${IOS_TEMPLATE.bottomGlow.blur}px)`,
                  opacity: 0.95,
                }}
              />

              <svg
                aria-hidden="true"
                className="pointer-events-none absolute overflow-visible"
                style={{
                  left: IOS_TEMPLATE.backgroundShape.left,
                  top: IOS_TEMPLATE.backgroundShape.top,
                  width: IOS_TEMPLATE.backgroundShape.width,
                  height: IOS_TEMPLATE.backgroundShape.height,
                }}
                preserveAspectRatio="none"
                viewBox="0 0 816.281 611.348"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g filter="url(#asset-background-glow-filter)">
                  <path
                    d="M75.5657 97.4179V535.782H740.715V75.5657C659.905 171.085 509.332 251.145 342.311 169.927C148.267 75.5657 119.539 93.4999 75.5657 97.4179Z"
                    fill={asset.glowColor}
                  />
                </g>
                <defs>
                  <filter
                    id="asset-background-glow-filter"
                    x="0"
                    y="0"
                    width="816.281"
                    height="611.348"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="37.7828"
                      result="effect1_foregroundBlur_0_15"
                    />
                  </filter>
                </defs>
              </svg>
            </>
          )}

          <div
            className="absolute text-center"
            onClick={
              interactive
                ? (event) => {
                    event.stopPropagation();
                    onTitleClick?.();
                  }
                : undefined
            }
            style={{
              left: IOS_TEMPLATE.title.left,
              top: IOS_TEMPLATE.title.top,
              width: IOS_TEMPLATE.title.width,
              minHeight: IOS_TEMPLATE.title.height,
              cursor: interactive ? "text" : "default",
            }}
          >
            {isTitleEditing ? (
              <textarea
                autoFocus
                value={titleDraft ?? asset.title}
                onChange={(event) => onTitleChange?.(event.target.value)}
                onBlur={onTitleBlur}
                onKeyDown={onTitleKeyDown}
                className="absolute inset-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-center outline-none"
                style={{
                  margin: 0,
                  color: asset.titleColor,
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: IOS_TEMPLATE.title.fontSize,
                  fontWeight: 700,
                  lineHeight: `${IOS_TEMPLATE.title.lineHeight}px`,
                  letterSpacing: IOS_TEMPLATE.title.letterSpacing,
                  textAlign: "center",
                }}
              />
            ) : (
              <p
                style={{
                  margin: 0,
                  color: asset.titleColor,
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: IOS_TEMPLATE.title.fontSize,
                  fontWeight: 700,
                  lineHeight: `${IOS_TEMPLATE.title.lineHeight}px`,
                  letterSpacing: IOS_TEMPLATE.title.letterSpacing,
                  textAlign: "center",
                }}
              >
                {asset.title}
              </p>
            )}
          </div>

          <button
            type="button"
            className={
              interactive
                ? "absolute overflow-hidden border-0 bg-transparent p-0"
                : "absolute overflow-hidden border-0 bg-transparent p-0 pointer-events-none"
            }
            data-upload-trigger={interactive ? "true" : undefined}
            style={{
              left: IOS_TEMPLATE.screenshot.left,
              top: IOS_TEMPLATE.screenshot.top,
              width: IOS_TEMPLATE.screenshot.width,
              height: IOS_TEMPLATE.screenshot.height,
              borderRadius: "40px",
              cursor: interactive ? "pointer" : "default",
            }}
            aria-label="Upload screenshot"
          >
            <img
              alt="Uploaded app screenshot"
              className="block h-full w-full object-cover"
              src={asset.screenshotSrc}
            />
            {interactive ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition hover:bg-black/20 hover:opacity-100">
                <span className="rounded-full border border-white/20 bg-black/70 px-7 py-3 text-[32px] font-semibold tracking-[0.08em] text-white">
                  Upload
                </span>
              </div>
            ) : null}
          </button>

          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              left: IOS_TEMPLATE.deviceFrame.left,
              top: IOS_TEMPLATE.deviceFrame.top,
              width: IOS_TEMPLATE.deviceFrame.width,
              height: IOS_TEMPLATE.deviceFrame.height,
            }}
            src="/assets/ios/frame.png"
          />
        </div>
      </div>
    </div>
  );
}
