"use client";

import { CSSProperties, KeyboardEvent, MouseEvent, useEffect, useRef } from "react";
import {
  IOS_TEMPLATE,
  type IosAssetState,
  type IosTemplate,
} from "@/lib/ios-template";

type IosStoreCanvasProps = {
  asset: IosAssetState;
  template?: IosTemplate;
  interactive?: boolean;
  scale?: number;
  isTitleEditing?: boolean;
  titleDraft?: string;
  titleSelectionStart?: number;
  onTitleChange?: (value: string) => void;
  onTitleClick?: (selectionStart: number) => void;
  onTitleBlur?: () => void;
  onTitleKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function IosStoreCanvas({
  asset,
  template = IOS_TEMPLATE,
  interactive = false,
  scale = 1,
  isTitleEditing = false,
  titleDraft,
  titleSelectionStart = 0,
  onTitleChange,
  onTitleClick,
  onTitleBlur,
  onTitleKeyDown,
}: IosStoreCanvasProps) {
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const shellStyle: CSSProperties = {
    width: template.exportWidth,
    height: template.exportHeight,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };

  const previewHeight = template.exportHeight * scale;
  const previewWidth = template.exportWidth * scale;

  useEffect(() => {
    if (isTitleEditing && titleInputRef.current) {
      titleInputRef.current.setSelectionRange(titleSelectionStart, titleSelectionStart);
    }
  }, [isTitleEditing, titleSelectionStart]);

  function getTitleSelectionStart(event: MouseEvent<HTMLDivElement>) {
    const titleElement = event.currentTarget;
    const point = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const range = point
      ? (() => {
          const nextRange = document.createRange();
          nextRange.setStart(point.offsetNode, point.offset);
          return nextRange;
        })()
      : document.caretRangeFromPoint?.(event.clientX, event.clientY);

    if (!range || !titleElement.contains(range.startContainer)) {
      return asset.title.length;
    }

    const walker = document.createTreeWalker(titleElement, NodeFilter.SHOW_TEXT);
    let selectionStart = 0;
    let node = walker.nextNode();
    while (node) {
      if (node === range.startContainer) {
        return selectionStart + range.startOffset;
      }
      selectionStart += node.textContent?.length ?? 0;
      node = walker.nextNode();
    }

    return asset.title.length;
  }

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ width: previewWidth, height: previewHeight }}
    >
      <div className="absolute left-0 top-0" style={shellStyle}>
        <div
          className="relative overflow-hidden bg-black"
          style={{
            width: template.stage.width,
            height: template.stage.height,
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
                  left: template.bottomGlow.left,
                  bottom: template.bottomGlow.bottom,
                  width: template.bottomGlow.width,
                  height: template.bottomGlow.height,
                  borderRadius: "9999px",
                  background: `linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, ${asset.glowColor} 100%)`,
                  filter: `blur(${template.bottomGlow.blur}px)`,
                  opacity: 0.95,
                }}
              />

              <svg
                aria-hidden="true"
                className="pointer-events-none absolute overflow-visible"
                style={{
                  left: template.backgroundShape.left,
                  top: template.backgroundShape.top,
                  width: template.backgroundShape.width,
                  height: template.backgroundShape.height,
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
              interactive && !isTitleEditing
                ? (event) => {
                    event.stopPropagation();
                    onTitleClick?.(getTitleSelectionStart(event));
                  }
                : undefined
            }
            style={{
              left: template.title.left,
              top: template.title.top,
              width: template.title.width,
              minHeight: template.title.height,
              cursor: interactive ? "text" : "default",
            }}
          >
            {isTitleEditing ? (
              <textarea
                autoFocus
                ref={titleInputRef}
                value={titleDraft ?? asset.title}
                onChange={(event) => onTitleChange?.(event.target.value)}
                onBlur={onTitleBlur}
                onKeyDown={onTitleKeyDown}
                className="absolute inset-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-center outline-none"
                style={{
                  margin: 0,
                  color: asset.titleColor,
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: template.title.fontSize,
                  fontWeight: 700,
                  lineHeight: `${template.title.lineHeight}px`,
                  letterSpacing: template.title.letterSpacing,
                  textAlign: "center",
                }}
              />
            ) : (
              <p
                style={{
                  margin: 0,
                  color: asset.titleColor,
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: template.title.fontSize,
                  fontWeight: 700,
                  lineHeight: `${template.title.lineHeight}px`,
                  letterSpacing: template.title.letterSpacing,
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
              left: template.screenshot.left,
              top: template.screenshot.top,
              width: template.screenshot.width,
              height: template.screenshot.height,
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
              left: template.deviceFrame.left,
              top: template.deviceFrame.top,
              width: template.deviceFrame.width,
              height: template.deviceFrame.height,
            }}
            src="/assets/ios/frame.png"
          />
        </div>
      </div>
    </div>
  );
}
